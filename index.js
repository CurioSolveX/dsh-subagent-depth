/**
 * Host half of `dsh-subagent-depth`.
 *
 * Three jobs, in the order a delegation meets them:
 *
 *   1. Declare the per-level caps and the reviewer settings as `volatile`
 *      fields, so the shipped Settings page projects them into a form for this
 *      plugin automatically — the same mechanism the Subagent page uses.
 *
 *   2. Cap widths. Subagents can spawn Subagents, so a delegation tree grows
 *      exponentially with depth; the depth limit says how deep it may go, never
 *      how wide. Level 1 may hold at most `level1` live children of the main
 *      agent and level 2 at most `level2` live grandchildren, counted across the
 *      whole level — how they are distributed among parents is not constrained.
 *      Counting is "live now": a Subagent that finished frees its slot.
 *
 *   3. Review the shape. A quota cannot tell a sensible delegation from a
 *      wasteful one: spawning one child per level to burn depth, delegating a
 *      one-file read, or sending the same job to two children all stay under
 *      any cap. So when a reviewer route is configured, each delegation is
 *      judged by a separate model before it runs, against the policy the user
 *      wrote. This mirrors how the shipped Auto review gates tool calls: one
 *      `ctx.llm.stream` call, a strict JSON verdict, `tools/pre-execute`
 *      mapping that verdict onto a decision.
 *
 * Every bound is advisory by design: reaching a cap asks the user rather than
 * failing silently, and a reviewer that errors or answers unparseably lets the
 * call through, because a guard must never break delegation outright.
 */

import z from '@deepseek-ai/schemastery';

/** Delegation tools whose calls create a Subagent. */
const DELEGATION_TOOLS = new Set(['subagent', 'subagent_fork']);

/** How many levels this plugin caps: depth stops at 2, so levels 1 and 2. */
const CAPPED_LEVELS = 2;

export const name = 'subagent-depth';

/** Services the guard needs; the plugin stays inactive without them. */
export const inject = ['tools', 'subagents', 'agents', 'llm'];

export const Config = z.object({
  level1: z.number().step(1).min(0).max(1000).default(5).volatile(),
  level2: z.number().step(1).min(0).max(1000).default(8).volatile(),
  /** Reviewer route; review is skipped while either half is empty. */
  reviewerProvider: z.string().default('').volatile(),
  reviewerModel: z.string().default('').volatile(),
  /** `every` reviews each delegation, `off` keeps only the caps. */
  reviewMode: z.string().default('every').volatile(),
  /** The user's own rule for when delegating, and how it may nest. */
  policy: z
    .string()
    .default(
      '该做的事：任务确实可以拆成互不依赖的子任务，且子任务足够大、需要独立上下文。\n' +
        '不该做的事：主 Agent 几下就能完成的琐事、为了加深层级而分层、与已有子代理重复的活、描述含糊到子代理无法独立完成的活。',
    )
    .volatile(),
});

/**
 * Unwrap cosmokit volatile references until a plain value comes back.
 * @param value - a config, a field, or an already plain value.
 * @returns the plain value.
 */
function unwrap(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function'
    ? unwrap(value.get())
    : value;
}

/**
 * Read one config field as a plain value.
 * @param config - resolved plugin config, possibly a volatile ref.
 * @param key - field name.
 * @returns the value, or undefined when absent.
 */
function read(config, key) {
  const plain = unwrap(config);
  if (plain === null || typeof plain !== 'object') return undefined;
  return unwrap(plain[key]);
}

/**
 * Read one cap.
 * @param config - resolved plugin config.
 * @param level - tree level whose cap is wanted.
 * @returns the configured cap, or undefined when unset or not a number.
 */
function capFor(config, level) {
  if (level > CAPPED_LEVELS) return undefined;
  const raw = read(config, `level${level}`);
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

/**
 * Find which tree a session belongs to and how deep it sits in it.
 * @param ctx - plugin context carrying `agents` and `subagents`.
 * @param sessionId - the delegating session.
 * @returns the root session, the caller's depth, and that tree's descendants.
 */
async function locate(ctx, sessionId) {
  const roots = ctx.agents.roots();
  for (const root of roots) {
    if (root.id === sessionId) {
      const rows = await ctx.subagents.listDescendants(sessionId);
      return { rootId: sessionId, depth: 0, rows };
    }
  }
  for (const root of roots) {
    const rows = await ctx.subagents.listDescendants(root.id);
    const match = rows.find((row) => row.kind === 'child' && row.id === sessionId);
    if (match !== undefined) return { rootId: root.id, depth: match.depth, rows };
  }
  return undefined;
}

/**
 * Count the live children at one level of one tree.
 * @param rows - descendant rows of the tree root.
 * @param level - level to count.
 * @returns how many Subagents are running at that level right now.
 */
function liveAt(rows, level) {
  let live = 0;
  for (const row of rows) {
    if (row.kind !== 'child') continue;
    if (row.depth !== level) continue;
    if (row.activity === 'running') live += 1;
  }
  return live;
}

/** The reviewer's instructions: one JSON verdict, nothing else. */
const REVIEWER_SYSTEM = [
  '你是一个委派评审员。你不评判任务本身的业务对错，只评判「这一次委派值不值得发生」。',
  '重点看：这件事是不是主 Agent 自己很快就能做完；这次分层的理由是否成立；是否与已经存在的子代理重复；委派描述是否具体到子代理能独立完成。',
  '只输出一个 JSON 对象，形如 {"decision":"allow","reason":"不超过40字的理由"}。',
  'decision 只能取 allow、ask、deny 三者之一：allow 表示放行，ask 表示需要人来定，deny 表示明确不该派。',
  '不要输出 JSON 以外的任何文字，不要加代码块标记。',
].join('\n');

/**
 * Render the reviewer's view of one pending delegation.
 * @param policy - the user's own rule.
 * @param exec - the pending tool call.
 * @param tree - the located tree.
 * @param level - the level the new Subagent would occupy.
 * @param caps - resolved caps, for context.
 * @returns the user message text.
 */
function reviewerText(policy, exec, tree, level, caps) {
  const counts = [];
  for (let depth = 1; depth <= CAPPED_LEVELS; depth += 1) {
    const cap = caps[depth];
    counts.push(`${depth} 级：${liveAt(tree.rows, depth)} 个存活${cap === undefined ? '' : ` / 上限 ${cap}`}`);
  }
  let args = exec.arguments;
  try {
    args = JSON.stringify(exec.arguments, null, 2);
  } catch {
    args = String(exec.arguments);
  }
  if (typeof args === 'string' && args.length > 2000) args = `${args.slice(0, 2000)}…`;
  return [
    '用户对这个项目定下的分层原则：',
    policy === undefined || policy === '' ? '（未填写）' : policy,
    '',
    '当前委派树：',
    '0 级（主 Agent 本身）：1',
    ...counts,
    '',
    `本次调用：工具 ${exec.name}，调用者位于 ${tree.depth} 级，将创建第 ${level} 级子代理。`,
    '调用参数：',
    String(args),
    '',
    '请判断这一次委派是否应该放行。',
  ].join('\n');
}

/**
 * Parse one reviewer answer into a verdict.
 * @param text - accumulated assistant text.
 * @returns the decision and reason, or undefined when unusable.
 */
function parseVerdict(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const decision = parsed.decision;
  if (decision !== 'allow' && decision !== 'ask' && decision !== 'deny') return undefined;
  const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '';
  return { decision, reason };
}

/**
 * Ask the reviewer model about one delegation.
 * @param ctx - plugin context carrying `llm`.
 * @param config - resolved plugin config.
 * @param exec - the pending tool call.
 * @param tree - the located tree.
 * @param level - the level the new Subagent would occupy.
 * @returns a verdict, or undefined when review is off or unusable.
 */
async function review(ctx, config, exec, tree, level) {
  if (read(config, 'reviewMode') === 'off') return undefined;
  const provider = read(config, 'reviewerProvider');
  const model = read(config, 'reviewerModel');
  if (typeof provider !== 'string' || provider === '') return undefined;
  if (typeof model !== 'string' || model === '') return undefined;

  const caps = {};
  for (let depth = 1; depth <= CAPPED_LEVELS; depth += 1) caps[depth] = capFor(config, depth);

  const text = reviewerText(read(config, 'policy'), exec, tree, level, caps);
  let answer = '';
  let finished = false;
  try {
    const stream = ctx.llm.stream({
      provider,
      model,
      system: REVIEWER_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      temperature: 0,
      signal: exec.signal,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') answer += chunk.text;
      else if (chunk.type === 'finish') {
        finished = true;
        if (chunk.reason.kind !== 'stop') return undefined;
      }
    }
  } catch (error) {
    if (ctx.logger && typeof ctx.logger.warn === 'function') {
      ctx.logger.warn('subagent-depth: reviewer call failed: %s', String(error));
    }
    return undefined;
  }
  if (!finished) return undefined;
  return parseVerdict(answer);
}

/**
 * Install the delegation guard.
 * @param ctx - plugin context.
 * @param config - this plugin's resolved config.
 */
export function apply(ctx, config) {
  ctx.effect(
    () =>
      ctx.on('tools/pre-execute', async (exec, next) => {
        if (!DELEGATION_TOOLS.has(exec.name)) return next();
        const caller = exec.agent;
        if (caller === undefined) return next();

        let tree;
        try {
          tree = await locate(ctx, caller.id);
        } catch (error) {
          // A catalog read must never break delegation; report and allow.
          if (ctx.logger && typeof ctx.logger.warn === 'function') {
            ctx.logger.warn('subagent-depth: could not read the delegation tree: %s', String(error));
          }
          return next();
        }
        if (tree === undefined) return next();

        const level = tree.depth + 1;

        // 1. Width: cheap and deterministic, so it runs before the reviewer.
        const cap = capFor(config, level);
        if (cap !== undefined) {
          const live = liveAt(tree.rows, level);
          if (live >= cap) {
            return {
              kind: 'ask',
              reason: `level ${level} already holds ${live} live Subagents (cap ${cap})`,
              displayReason: {
                en: `Level ${level} already holds ${live} live subagents (cap ${cap}). Allowing this one exceeds the per-level limit.`,
                zh: `${level} 级已有 ${live} 个子智能体在运行（上限 ${cap}），再派会超过这一层的配额。`,
              },
            };
          }
        }

        // 2. Shape: a separate model judges the delegation itself.
        const verdict = await review(ctx, config, exec, tree, level);
        if (verdict === undefined || verdict.decision === 'allow') return next();
        if (verdict.decision === 'deny') {
          return {
            kind: 'deny',
            reason: `delegation review rejected ${exec.name}${verdict.reason === '' ? '' : `: ${verdict.reason}`}`,
          };
        }
        return {
          kind: 'ask',
          reason: `delegation review needs a decision${verdict.reason === '' ? '' : `: ${verdict.reason}`}`,
          displayReason: {
            en: `The delegation reviewer is unsure this split is worth it${verdict.reason === '' ? '' : `: ${verdict.reason}`}`,
            zh: `委派评审员认为这次分层未必划算${verdict.reason === '' ? '' : `：${verdict.reason}`}`,
          },
        };
      }),
    'subagent-depth: per-level quota and delegation reviewer',
  );
}
