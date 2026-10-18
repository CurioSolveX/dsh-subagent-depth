/**
 * Host half of `dsh-subagent-depth`.
 *
 * Four jobs, in the order a delegation meets them:
 *
 *   1. Declare the per-level caps, the reviewer settings, and the consultant
 *      settings as `volatile` fields, so the shipped Settings page projects them
 *      into a form for this plugin automatically — the same mechanism the
 *      Subagent page uses.
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
 *   4. Advise, without taking over. When a consultant route is configured the
 *      guard refuses a complex delegation and points the calling agent at the
 *      `delegate` tool. That tool first returns the consultant's advice and
 *      starts nothing; only the agent's own `plan` — its people, models, and
 *      acceptance checks — is started. Simple delegations pass the guard
 *      untouched and keep the shipped behaviour. A consultant that fails never
 *      blocks delegation.
 *
 * Every bound is advisory by design: reaching a cap asks the user rather than
 * failing silently, and a reviewer that errors or answers unparseably lets the
 * call through, because a guard must never break delegation outright.
 */

import z from '@deepseek-ai/schemastery';

/** The shipped delegation tools the guard watches. */
const DELEGATION_TOOLS = new Set(['subagent', 'subagent_fork']);

/** This plugin's own decision tool. */
const DELEGATE_TOOL = 'delegate';

/** How long a "go ask the consultant first" refusal sticks for the same task. */
const BLOCK_TTL_MS = 10 * 60 * 1000;

/** How many levels this plugin caps: depth stops at 2, so levels 1 and 2. */
const CAPPED_LEVELS = 2;

/** How long a consultant answer stays usable for the next `plan` call. */
const ADVICE_TTL_MS = 15 * 60 * 1000;

export const name = 'subagent-depth';

/** Services the guard and the consultant layer need; the plugin stays inactive without them. */
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

  /** Master switch for the consultant layer. Off = the shipped tools decide. */
  consultantEnabled: z
    .boolean()
    .default(false)
    .description('开启后，派活前可以先咨询「意见专家」；专家只出主意，决定权仍在做事的 Agent。')
    .volatile(),
  /** Level-0 consultant (the one the main agent asks). Both halves empty = off. */
  consultant0Provider: z
    .string()
    .default('')
    .description('0 级意见专家用哪个模型（填已经在 DSH 里配好的 provider；留空表示这级不启用）。')
    .volatile(),
  consultant0Model: z.string().default('').volatile(),
  /** Level-1 consultant (the one subagents ask). Both halves empty = off. */
  consultant1Provider: z
    .string()
    .default('')
    .description('1 级意见专家用哪个模型（可以和 0 级不同，例如 1 级用某个领域专家模型）。')
    .volatile(),
  consultant1Model: z.string().default('').volatile(),
  /** `smart` screens complexity with a cheap call first; `always` consults every time. */
  consultantMode: z
    .string()
    .default('smart')
    .description('smart = 先用便宜模型判断难度，难才问专家；always = 每次派活都问。')
    .volatile(),
  /**
   * Deprecated and unused: the screener is always the working model — the one
   * the user picked at the right of the composer. Kept so an older profile
   * patch that still carries these keys keeps loading.
   */
  screenerProvider: z
    .string()
    .default('')
    .description('（已废弃，不再读取：判断难度一律用输入栏右侧选的主模型。）')
    .volatile(),
  screenerModel: z.string().default('').volatile(),
});

/** The consultant's role: advice only, never authority. */
const CONSULTANT_SYSTEM = [
  '你是一名「意见专家」（Consultant），不是执行者。',
  '你没有行政权：不派活、不验收、不接手成果。正在做决策的 Agent 会读你的话，但它有权不听、有权改你的人数与分法。',
  '你要给的是能直接执行的意见，不是泛泛而谈：',
  '1. 建议分几个人，每人负责什么（具体到能独立开工）。',
  '2. 若涉及模型选择，建议谁用什么模型、为什么；拿不准就直说拿不准。',
  '3. 验收标准：每一条都必须是能检查的东西（原文、数字、文件与行号这类证据）。',
  '用中文回答，400 字以内。不要输出 JSON，不要调用任何工具。',
].join('\n');

/** The screener only answers one question, in one shape. */
const SCREENER_SYSTEM = [
  '你是任务分诊员，只判断一件事：这次委派复杂到需要先请教意见专家吗？',
  '复杂：要拆成多个互不依赖的子任务、跨多个文件或系统、需要专门领域知识、或结论不确定。',
  '不复杂：一件事、一两个文件、主 Agent 自己几步就能做完。',
  '只输出一个 JSON 对象，形如 {"hard":true,"why":"不超过20字"}。不要输出 JSON 以外的任何文字。',
].join('\n');

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
 * Read a string setting, treating anything non-string as empty.
 * @param config - resolved plugin config.
 * @param key - field name.
 * @returns the string, or an empty string.
 */
function text(config, key) {
  const value = read(config, key);
  return typeof value === 'string' ? value.trim() : '';
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
 * Read an agent's delegation depth, tolerating a partially built Agent.
 * The persisted header is authoritative and monotone, exactly as the runtime
 * computes it, so a resumed child cannot masquerade as top-level.
 * @param agent - the agent whose header and options carry the depth.
 * @returns its non-negative depth.
 */
function depthOf(agent) {
  const header = agent?.session?.header?.delegationDepth;
  const runtime = agent?.options?.subagentDepth;
  const persisted = Number.isSafeInteger(header) && header > 0 ? header : 0;
  const live = Number.isSafeInteger(runtime) && runtime > 0 ? runtime : 0;
  return Math.max(persisted, live);
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

/**
 * Describe the current tree in one line, for the screener and the consultant.
 * @param config - resolved plugin config.
 * @param tree - the located tree, when known.
 * @returns a short Chinese description.
 */
function treeLine(config, tree) {
  if (tree === undefined) return '当前委派树：未知';
  const parts = [];
  for (let depth = 1; depth <= CAPPED_LEVELS; depth += 1) {
    const cap = capFor(config, depth);
    parts.push(`${depth} 级 ${liveAt(tree.rows, depth)} 个在运行${cap === undefined ? '' : `（上限 ${cap}）`}`);
  }
  return `当前委派树：${parts.join('；')}`;
}

/**
 * Ask one model for plain text and return its answer.
 * @param ctx - plugin context carrying `llm`.
 * @param request - route, prompts, and limits.
 * @returns the accumulated text, or undefined when the call failed or did not finish cleanly.
 */
async function askModel(ctx, request) {
  let answer = '';
  let finished = false;
  let failure;
  try {
    const stream = ctx.llm.stream({
      provider: request.provider,
      model: request.model,
      system: request.system,
      messages: [{ role: 'user', content: [{ type: 'text', text: request.text }] }],
      ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
      signal: request.signal,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') answer += chunk.text;
      else if (chunk.type === 'finish') {
        finished = true;
        if (chunk.reason.kind !== 'stop') {
          failure =
            chunk.reason.kind === 'error' && chunk.reason.failure
              ? `finish=error: ${chunk.reason.failure.message}`
              : `finish=${chunk.reason.kind}`;
        }
      }
    }
  } catch (error) {
    failure = String(error?.message ?? error);
    if (ctx.logger && typeof ctx.logger.warn === 'function') {
      ctx.logger.warn('subagent-depth: model call failed: %s', String(error));
    }
  }
  if (!finished) return { error: failure ?? 'the stream ended without a finish chunk' };
  if (failure !== undefined) return { error: failure };
  const trimmed = answer.trim();
  return trimmed === '' ? { error: 'the model returned an empty answer' } : { text: trimmed };
}

/**
 * Parse the screener's verdict.
 * @param answer - the screener's text.
 * @returns whether the delegation is complex, or undefined when unusable.
 */
function parseHard(answer) {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  return parsed.hard === true;
}

/**
 * Read the calling agent's own route, used as the default screener.
 * @param agent - the calling agent.
 * @returns the provider and model, or undefined when unreadable.
 */
function parentRoute(agent) {
  try {
    const config = agent?.session?.requestHeader?.()?.config;
    if (config !== undefined && typeof config.provider === 'string' && typeof config.model === 'string') {
      return { provider: config.provider, model: config.model };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Choose the consultant route for one calling level.
 * @param config - resolved plugin config.
 * @param level - the caller's level in its tree (0 = main agent).
 * @returns the route and its configured level, or undefined when that level has no consultant.
 */
function consultantFor(config, level) {
  const index = level <= 0 ? 0 : 1;
  const provider = text(config, `consultant${index}Provider`);
  const model = text(config, `consultant${index}Model`);
  if (provider === '' || model === '') return undefined;
  return { index, provider, model };
}

/**
 * Build the screener's question.
 * @param config - resolved plugin config.
 * @param tree - the located tree.
 * @param need - the caller's statement of what this layer needs.
 * @param task - the work being delegated.
 * @returns the user-message text.
 */
function screenerText(config, tree, need, task) {
  return [
    treeLine(config, tree),
    '',
    '提问者写的诉求：',
    need === '' ? '（未填写）' : need,
    '',
    '准备派出去的活：',
    task,
    '',
    '判断这次委派是否复杂。',
  ].join('\n');
}

/**
 * Ask the screener whether this delegation needs the consultant.
 * @param ctx - plugin context.
 * @param config - resolved plugin config.
 * @param agent - the calling agent.
 * @param tree - the located tree.
 * @param need - the caller's statement of what this layer needs.
 * @param task - the work being delegated.
 * @param signal - cancellation from the tool call.
 * @returns whether to consult; failures count as complex.
 */
async function needsConsultant(ctx, config, agent, tree, need, task, signal) {
  // The screener IS the working model — the "CEO" the user picked in the
  // composer. There is deliberately no separate screener route: one more model
  // to configure would only be a second opinion about the CEO's own judgement.
  const route = parentRoute(agent);
  if (route === undefined) {
    return true;
  }
  const answer = await askModel(ctx, {
    provider: route.provider,
    model: route.model,
    system: SCREENER_SYSTEM,
    text: screenerText(config, tree, need, task),
    signal,
  });
  if (answer.error !== undefined) return true;
  const hard = parseHard(answer.text);
  return hard === undefined ? true : hard;
}

/**
 * Build the consultant's question.
 * @param config - resolved plugin config.
 * @param tree - the located tree.
 * @param level - the caller's level.
 * @param need - the caller's statement of what this layer needs.
 * @param task - the work being delegated.
 * @returns the user-message text.
 */
function consultantText(config, tree, level, need, task) {
  return [
    `提问者位于委派树的第 ${level} 级（0 级是主 Agent 本身）。`,
    treeLine(config, tree),
    '',
    '它自己写的诉求（这是它对任务的理解，可能不完整）：',
    need === '' ? '（未填写）' : need,
    '',
    '它准备派出去的活：',
    task === '' ? '（未填写）' : task,
    '',
    '项目约定的分层原则：',
    text(config, 'policy') === '' ? '（未填写）' : text(config, 'policy'),
    '',
    '请按你的角色给出建议。',
  ].join('\n');
}

/**
 * Ask the consultant for advice.
 * @param ctx - plugin context.
 * @param config - resolved plugin config.
 * @param agent - the calling agent.
 * @param tree - the located tree.
 * @param level - the caller's level.
 * @param need - the caller's statement of what this layer needs.
 * @param task - the work being delegated.
 * @param signal - cancellation from the tool call.
 * @returns the advice text, or undefined when no route is configured or the call failed.
 */
async function askConsultant(ctx, config, agent, tree, level, need, task, signal) {
  const route = consultantFor(config, level);
  if (route === undefined) return { error: '这一级没有配置意见专家', route: undefined };
  const answer = await askModel(ctx, {
    provider: route.provider,
    model: route.model,
    system: CONSULTANT_SYSTEM,
    text: consultantText(config, tree, level, need, task),
    signal,
  });
  if (answer.error !== undefined) return { error: answer.error, route };
  return { advice: answer.text, route };
}

/**
 * Normalize one plan item from model-authored arguments.
 * @param raw - the item as written by the model.
 * @param fallbackProvider - provider to inherit when the item names none.
 * @param fallbackModel - model to inherit when the item names none.
 * @returns the normalized item, or undefined when it has no task.
 */
function normalizeItem(raw, fallbackProvider, fallbackModel) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const task = typeof raw.task === 'string' ? raw.task.trim() : '';
  if (task === '') return undefined;
  const title = typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title.trim() : 'subagent';
  const acceptance = Array.isArray(raw.acceptance)
    ? raw.acceptance.filter((check) => typeof check === 'string' && check.trim() !== '').map((check) => check.trim())
    : typeof raw.acceptance === 'string' && raw.acceptance.trim() !== ''
      ? [raw.acceptance.trim()]
      : [];
  const provided = typeof raw.provider === 'string' && raw.provider.trim() !== '' ? raw.provider.trim() : '';
  const model = typeof raw.model === 'string' && raw.model.trim() !== '' ? raw.model.trim() : '';
  const route = provided !== '' && model !== '' ? { provider: provided, model } : (
    fallbackProvider !== '' && fallbackModel !== '' ? { provider: fallbackProvider, model: fallbackModel } : undefined
  );
  const cwd = typeof raw.cwd === 'string' && raw.cwd.trim() !== '' ? raw.cwd.trim() : undefined;
  return { title, task, acceptance, route, cwd };
}

/**
 * The structured result every child produced under an acceptance check must
 * report. This is the technical landing point of "验收标准": the child cannot
 * finish with prose, it must answer these fields.
 * @returns the object-rooted schema.
 */
function acceptanceSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['done', 'summary', 'evidence'],
    properties: {
      done: { type: 'boolean', description: '是否全部达到验收标准' },
      summary: { type: 'string', description: '做了什么、结论是什么' },
      evidence: { type: 'string', description: '支撑结论的证据：原文、数字、文件:行号' },
      unmet: { type: 'string', description: '没做到的检查项；全部做到就写空字符串' },
    },
  };
}

/**
 * Build the child's prompt, appending the acceptance checks when present.
 * @param item - one normalized plan item.
 * @returns the prompt text.
 */
function childPrompt(item) {
  const lines = [item.task];
  if (item.acceptance.length > 0) {
    lines.push('', '验收标准（逐条做到，并在 evidence 里给出证据：原文、数字、文件:行号）：');
    for (const check of item.acceptance) lines.push(`- ${check}`);
    lines.push(
      '',
      '完成时调用 `structured_output` 汇报：done 表示是否全部达到；summary 写结论；evidence 写证据；unmet 写没做到的条目（全部做到就写空字符串）。不要用普通文字收尾。',
    );
  }
  return lines.join('\n');
}

/**
 * Start one child for one plan item.
 * @param ctx - plugin context.
 * @param exec - the tool call being served.
 * @param item - one normalized plan item.
 * @param providerName - the backend that starts this tool's children.
 * @returns the new child's session id.
 */
async function startOne(ctx, exec, item, providerName) {
  const maxDepth = ctx.subagents.resolveMaxDepth(undefined);
  const options = {};
  if (item.route !== undefined) {
    options.provider = item.route.provider;
    options.model = item.route.model;
  }
  if (typeof item.effort === 'string' && item.effort !== '') options.reasoningEffort = item.effort;
  const request = {
    prompt: [{ type: 'text', text: childPrompt(item) }],
    parent: exec.agent,
    ...(Object.keys(options).length === 0 ? {} : { agentOptions: options }),
    ...(item.acceptance.length === 0 ? {} : { outputSchema: acceptanceSchema() }),
    ...(maxDepth === undefined ? {} : { maxDepth }),
  };
  const cwd =
    typeof item.cwd === 'string' && item.cwd !== ''
      ? item.cwd
      : typeof exec.arguments?.cwd === 'string' && exec.arguments.cwd !== ''
        ? exec.arguments.cwd
        : undefined;
  if (cwd !== undefined) request.cwd = cwd;
  const activation = await ctx.subagents.startActivation({
    provider: providerName,
    label: item.title,
    request,
    signal: exec.signal,
    delivery: 'parent',
  });
  return activation.childId;
}

/**
 * Start every item of one plan, refusing to exceed the level's cap.
 * @param ctx - plugin context.
 * @param config - resolved plugin config.
 * @param exec - the tool call being served.
 * @param tree - the located tree.
 * @param level - the level the new children would occupy.
 * @param items - normalized plan items.
 * @param providerName - the backend that starts this tool's children.
 * @returns the tool result value.
 */
async function startPlan(ctx, config, exec, tree, level, items, providerName) {
  const cap = capFor(config, level);
  if (cap !== undefined && tree !== undefined) {
    const live = liveAt(tree.rows, level);
    if (live + items.length > cap) {
      return {
        kind: 'blocked',
        message:
          `${level} 级已有 ${live} 个在运行，上限 ${cap}；你的计划是 ${items.length} 个，会超过这一层的配额。` +
          '请缩小计划，或等有子代理结束再派。没有启动任何子代理。',
      };
    }
  }
  const ids = [];
  for (const item of items) {
    try {
      ids.push(await startOne(ctx, exec, item, providerName));
    } catch (error) {
      return {
        kind: 'started',
        subagentIds: ids,
        message: `已启动 ${ids.length} 个，第 ${ids.length + 1} 个启动失败：${String(error)}`,
      };
    }
  }
  return { kind: 'started', subagentIds: ids, message: `started ${ids.length} subagent(s)` };
}

/**
 * Serve one `delegate` call: consult first, then start only the caller's plan.
 * The calling agent stays the decision-maker; this tool never invents a plan.
 * @param rootCtx - plugin context.
 * @param config - resolved plugin config.
 * @param adviceOf - per-agent cache of the last advice.
 * @param args - model-authored arguments.
 * @param exec - the tool call.
 * @returns the tool result value.
 */
async function runDelegate(rootCtx, config, adviceOf, args, exec) {
  const parent = exec.agent;
  if (parent === undefined) throw new Error('delegate requires a calling agent (exec.agent was undefined)');
  if (read(config, 'consultantEnabled') !== true) {
    throw new Error('意见专家没有启用：请直接使用 `subagent` / `subagent_fork` 派活。');
  }

  let tree;
  try {
    tree = await locate(rootCtx, parent.id);
  } catch (error) {
    if (rootCtx.logger && typeof rootCtx.logger.warn === 'function') {
      rootCtx.logger.warn('subagent-depth: could not read the delegation tree: %s', String(error));
    }
    tree = undefined;
  }

  const callerDepth = tree === undefined ? depthOf(parent) : tree.depth;
  const level = callerDepth + 1;
  const maxDepth = rootCtx.subagents.resolveMaxDepth(undefined);
  if (maxDepth !== undefined && level > maxDepth) {
    throw new Error(
      `Delegation depth for \`${DELEGATE_TOOL}\`: current ${callerDepth}, maximum ${maxDepth}, remaining levels 0. ` +
        'Do not delegate at this depth; carry out the work directly.',
    );
  }

  const providerName = args?.fork === true ? 'fork' : 'spawn';
  const rawPlan = Array.isArray(args?.plan) ? args.plan : [];
  const fallbackProvider = typeof args?.provider === 'string' ? args.provider : '';
  const fallbackModel = typeof args?.model === 'string' ? args.model : '';
  const items = rawPlan.map((raw) => normalizeItem(raw, fallbackProvider, fallbackModel)).filter((item) => item !== undefined);
  const task = typeof args?.prompt === 'string' ? args.prompt.trim() : (items[0]?.task ?? '');
  const need = typeof args?.need === 'string' ? args.need.trim() : '';

  if (items.length > 0) {
    // A plan that never heard the consultant still gets the advice first: the
    // calling agent must decide with the advice in hand, not after the fact.
    if (takeAdvice(adviceOf, parent.id) === undefined) {
      const answer = await askConsultant(rootCtx, config, parent, tree, callerDepth, need, task, exec.signal);
      if (answer.advice !== undefined) {
        rememberAdvice(adviceOf, parent.id, answer.advice);
        return {
          kind: 'advice',
          advice: answer.advice,
          message: `意见专家（${answer.route.provider}/${answer.route.model}）给了建议；还没有派任何人。看完后由你决定人数、模型与验收标准，再带 plan 调用一次。`,
        };
      }
      // A consultant that cannot answer must not block the delegation.
    }
    return startPlan(rootCtx, config, exec, tree, level, items, providerName);
  }

  if (task === '') {
    return { kind: 'blocked', message: '需要 prompt（要派出去的活），或者在 plan 里给出至少一项。没有任何子代理被启动。' };
  }

  const answer = await askConsultant(rootCtx, config, parent, tree, callerDepth, need, task, exec.signal);
  if (answer.advice === undefined) {
    const route = answer.route;
    return {
      kind: 'unavailable',
      message:
        (route === undefined
          ? `第 ${callerDepth} 级没有配置意见专家。`
          : `意见专家（${route.provider}/${route.model}）没有回应：${answer.error}`) +
        ' 这次不拦你：直接带 plan 调用一次，按你自己的判断派。',
    };
  }
  rememberAdvice(adviceOf, parent.id, answer.advice);
  return {
    kind: 'advice',
    advice: answer.advice,
    message: `意见专家（${answer.route.provider}/${answer.route.model}）给了建议；没有启动任何子代理。`,
  };
}


/**
 * Remember one consultant answer for the agent's next `plan` call. Answers are
 * kept in a small queue so two delegations issued in one message each find
 * their own advice.
 * @param adviceOf - per-agent cache.
 * @param agentId - the calling agent.
 * @param advice - the consultant's text.
 */
function rememberAdvice(adviceOf, agentId, advice) {
  const queue = adviceOf.get(agentId) ?? [];
  queue.push({ advice, at: Date.now() });
  while (queue.length > 5) queue.shift();
  adviceOf.set(agentId, queue);
}

/**
 * Take, and consume, the agent's oldest pending advice.
 * @param adviceOf - per-agent cache.
 * @param agentId - the calling agent.
 * @returns the advice, or undefined when absent or stale.
 */
function takeAdvice(adviceOf, agentId) {
  const queue = adviceOf.get(agentId);
  if (queue === undefined) return undefined;
  while (queue.length > 0) {
    const entry = queue.shift();
    if (Date.now() - entry.at <= ADVICE_TTL_MS) return entry.advice;
  }
  adviceOf.delete(agentId);
  return undefined;
}

/**
 * The output shape every delegation result shares, so one renderer can show
 * either a started batch, an advice step, or a refusal.
 */
const DELEGATION_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['started', 'advice', 'unavailable', 'blocked', 'activation'] },
    subagentId: { type: 'string' },
    subagentIds: { type: 'array', items: { type: 'string' } },
    advice: { type: 'string' },
    message: { type: 'string' },
  },
};

/**
 * Render one delegation result back to the model.
 * @param toolName - the tool that produced the value.
 * @param value - the stored result value.
 * @returns content blocks.
 */
function renderDelegation(toolName, value) {
  const result = value ?? {};
  if (result.kind === 'started' || result.kind === 'activation') {
    const ids = Array.isArray(result.subagentIds) && result.subagentIds.length > 0
      ? result.subagentIds
      : typeof result.subagentId === 'string'
        ? [result.subagentId]
        : [];
    const head = ids.length === 0 ? 'no subagent started' : `started subagent ${ids.join(', ')}`;
    const extra = typeof result.message === 'string' && result.message !== '' && ids.length === 0 ? `\n${result.message}` : '';
    return [{ type: 'text', text: `${head}${extra}` }];
  }
  if (result.kind === 'advice') {
    return [
      {
        type: 'text',
        text:
          `意见专家（Consultant）的建议：\n\n${result.advice ?? ''}\n\n` +
          `—— 决定权在你。你可以改人数、改分法、换模型、改验收标准，然后带 plan 再调用一次 \`${toolName}\`。` +
          '没有启动任何子代理。',
      },
    ];
  }
  return [{ type: 'text', text: typeof result.message === 'string' ? result.message : `delegation ${String(result.kind)}` }];
}


/**
 * Build the `delegate` tool definition for the calling agent's scope.
 * @param rootCtx - plugin context.
 * @param config - resolved plugin config.
 * @param adviceOf - per-agent advice cache.
 * @returns the definition handed to `tools.register`.
 */
function delegateDefinition(rootCtx, config, adviceOf) {
  return {
    name: DELEGATE_TOOL,
    description:
      'Ask this level\'s consultant (意见专家) and then start YOUR OWN plan for the delegated work. ' +
      'Use it when a delegation looks complex: the shipped `subagent` tool refuses that case and tells you to come here. ' +
      'STEP 1 (ASK): call with `need` — your own precise statement of what this layer needs: why the goal is hard, how it might split, the constraints, what "done" means — plus `prompt`, the work itself. ' +
      'The consultant for this level answers and NOTHING is started. ' +
      'STEP 2 (DECIDE & START): read the advice, then decide yourself how many subagents to start, which model each one uses, and which acceptance checks each must meet. Call again with `plan`; that plan — not the advice — is what runs. ' +
      'Every `acceptance` entry becomes a required structured-output field the child must answer, so it cannot finish with prose. ' +
      'The consultant has no authority: it never starts work, never accepts a result, and you may ignore or change its advice.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cwd: {
          type: 'string',
          description: 'Initial working directory for every child; omitted inherits the current directory.',
        },
        prompt: {
          type: 'string',
          description:
            'The work being considered for delegation, complete enough that the consultant can reason about it. Required when `plan` is absent.',
        },
        need: {
          type: 'string',
          description:
            'What THIS layer needs, in your own words: why the goal is hard, how it might split, the constraints, what "done" means. ' +
            'The consultant sees only this text and `prompt`, so state the request precisely. Write it yourself; do not paste the raw task.',
        },
        plan: {
          type: 'array',
          description:
            'YOUR decision after reading the advice: one entry per subagent to start. Sending a plan starts exactly these children.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'task'],
            properties: {
              title: { type: 'string', description: 'A short label for this child, for display.' },
              task: { type: 'string', description: 'The complete, self-contained task for this child.' },
              cwd: { type: 'string', description: 'Working directory for this child; omitted inherits the parent\'s.' },
              provider: { type: 'string', description: 'LLM provider route for this child. Supply together with model; omit both to inherit.' },
              model: { type: 'string', description: 'Model id for this child. Supply together with provider.' },
              acceptance: {
                type: 'array',
                items: { type: 'string' },
                description: 'Checkable acceptance criteria. Each one becomes a required structured-output field the child must answer.',
              },
            },
          },
        },
        fork: {
          type: 'boolean',
          description: 'Start forked children that inherit this conversation (like `subagent_fork`) instead of fresh ones.',
        },
        provider: { type: 'string', description: 'Default LLM provider route for plan items that name none.' },
        model: { type: 'string', description: 'Default model id for plan items that name none.' },
      },
    },
    output: {
      schema: DELEGATION_OUTPUT,
      render: (_args, value) => renderDelegation(DELEGATE_TOOL, value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return runDelegate(rootCtx, config, adviceOf, args, exec);
    },
  };
}

/**
 * The `consult` tool's output shape.
 */
const CONSULT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  required: ['advice'],
  properties: {
    advice: { type: 'string' },
    model: { type: 'string' },
  },
};

/**
 * Build the `consult` tool definition for the calling agent's scope.
 * @param rootCtx - plugin context.
 * @param config - resolved plugin config.
 * @returns the definition handed to `tools.register`.
 */
function consultDefinition(rootCtx, config) {
  return {
    name: 'consult',
    description:
      'Ask this level\'s consultant (意见专家) for an opinion. The consultant has no authority: it does not delegate, does not accept work, and does not take over results — it only gives advice that you may follow or ignore. ' +
      'Use it when you are unsure how to proceed, when you are stuck, when a step failed and you do not understand why, or when you want a second opinion before deciding. ' +
      'It is not a replacement for delegating work, and it cannot approve or verify a result. State your question and the relevant facts precisely: the consultant sees only what you write.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['question'],
      properties: {
        question: {
          type: 'string',
          description: 'What you want the consultant\'s opinion on, stated precisely enough to answer without guessing.',
        },
        context: {
          type: 'string',
          description: 'The facts the consultant needs: what you tried, the exact error, the constraints, what you already ruled out.',
        },
      },
    },
    output: {
      schema: CONSULT_OUTPUT,
      render: (_args, value) => {
        const model = typeof value?.model === 'string' ? value.model : '';
        return [{ type: 'text', text: (model === '' ? '' : `[顾问 ${model}]\n`) + String(value?.advice ?? '') }];
      },
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (read(config, 'consultantEnabled') !== true) {
        throw new Error('意见专家没有启用：在插件设置里打开「顾问」开关，并给对应层级填一个模型。');
      }
      const parent = exec.agent;
      if (parent === undefined) throw new Error('consult requires a calling agent');
      const question = typeof args?.question === 'string' ? args.question.trim() : '';
      if (question === '') throw new Error('consult requires a question');
      const context = typeof args?.context === 'string' ? args.context.trim() : '';
      const depth = depthOf(parent);
      const route = consultantFor(config, depth);
      if (route === undefined) {
        throw new Error(`第 ${depth} 级没有配置意见专家：在设置里给 0 级或 1 级填一个 provider 和 model。`);
      }
      const answer = await askModel(rootCtx, {
        provider: route.provider,
        model: route.model,
        system: CONSULTANT_SYSTEM,
        text: [question, '', context === '' ? '' : `已知事实：\n${context}`].join('\n'),
        signal: exec.signal,
      });
      if (answer.error !== undefined) {
        throw new Error(`意见专家（${route.provider}/${route.model}）调用失败：${answer.error}`);
      }
      return { advice: answer.text, model: `${route.provider}/${route.model}` };
    },
  };
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
 * @param answer - accumulated assistant text.
 * @returns the decision and reason, or undefined when unusable.
 */
function parseVerdict(answer) {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(answer.slice(start, end + 1));
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

  const answer = await askModel(ctx, {
    provider,
    model,
    system: REVIEWER_SYSTEM,
    text: reviewerText(read(config, 'policy'), exec, tree, level, caps),
    signal: exec.signal,
  });
  if (answer.error !== undefined) return undefined;
  return parseVerdict(answer.text);
}

/**
 * A stable short fingerprint for one task text, used to remember a refusal.
 * @param value - the task text.
 * @returns a hexadecimal fingerprint.
 */
function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * The refusal a complex delegation gets: go ask the consultant first.
 * @param toolName - the shipped tool that was refused.
 * @returns a deny decision.
 */
function consultantFirst(toolName) {
  return {
    kind: 'deny',
    reason:
      `This delegation looks complex, so \`${toolName}\` was refused before anything started. ` +
      'Ask the consultant first: call `delegate` with `prompt` plus `need` written in your own words ' +
      '(why it is hard, how it might split, the constraints, what "done" means). Read the advice, decide yourself ' +
      'how many subagents to start, which model each uses, and their acceptance checks, then call `delegate(plan=[...])`. ' +
      '（中文：这次委派看起来复杂，先调用 delegate 取得意见专家的建议；看完建议后由你自己决定人数、模型与验收标准，再带 plan 派活。）',
  };
}

/**
 * Map one reviewer verdict onto a pre-execute decision.
 * @param ctx - plugin context.
 * @param config - resolved plugin config.
 * @param exec - the pending tool call.
 * @param tree - the located tree.
 * @param level - the level the new children would occupy.
 * @returns a deny/ask decision, or undefined when the call may run.
 */
async function reviewDecision(ctx, config, exec, tree, level) {
  const verdict = await review(ctx, config, exec, tree, level);
  if (verdict === undefined || verdict.decision === 'allow') return undefined;
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
}

/**
 * Install the delegation guard.
 *
 * For the shipped tools it keeps the original job (width, then shape). With the
 * consultant switched on it adds one rule in front: a complex delegation is
 * refused and pointed at `delegate`, so the advice always comes before the
 * decision. `delegate` itself is reviewed but never screened — the agent has
 * already decided by then.
 * @param ctx - plugin context.
 * @param config - this plugin's resolved config.
 */
function installGuard(ctx, config) {
  const blocked = new Map();
  return ctx.on('tools/pre-execute', async (exec, next) => {
    if (!DELEGATION_TOOLS.has(exec.name) && exec.name !== DELEGATE_TOOL) return next();
    const caller = exec.agent;
    if (caller === undefined) return next();

    const args = exec.arguments ?? {};
    const enabled = read(config, 'consultantEnabled') === true;

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

    // `delegate` without a plan starts nothing: it only collects advice.
    if (exec.name === DELEGATE_TOOL) {
      if (!Array.isArray(args.plan) || args.plan.length === 0) return next();
      return (await reviewDecision(ctx, config, exec, tree, level)) ?? next();
    }

    // 1. Consultant first: a complex delegation is refused, not started.
    if (enabled) {
      const prompt = typeof args.prompt === 'string' ? args.prompt : '';
      const key = `${caller.id}\u0000${hashText(prompt)}`;
      const deniedAt = blocked.get(key);
      if (deniedAt !== undefined && Date.now() - deniedAt < BLOCK_TTL_MS) return consultantFirst(exec.name);
      const hard = text(config, 'consultantMode') === 'always'
        ? true
        : await needsConsultant(ctx, config, caller, tree, '', prompt, exec.signal);
      if (hard) {
        blocked.set(key, Date.now());
        return consultantFirst(exec.name);
      }
      blocked.delete(key);
    }

    // 2. Width: cheap and deterministic, so it runs before the reviewer.
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

    // 3. Shape: a separate model judges the delegation itself.
    return (await reviewDecision(ctx, config, exec, tree, level)) ?? next();
  });
}

/**
 * Register this plugin's tools and prompt guidance inside one agent's scope.
 * `delegate` and `consult` are new names, so they never collide with the
 * shipped delegation tools that the agent preset already owns.
 * @param rootCtx - plugin context.
 * @param config - resolved plugin config.
 * @param adviceOf - per-agent advice cache.
 * @param scoped - the agent's injected context.
 * @returns the disposer that removes every registration.
 */
function installScoped(rootCtx, config, adviceOf, scoped) {
  const disposers = [];
  disposers.push(scoped.tools.register(delegateDefinition(rootCtx, config, adviceOf)));
  disposers.push(scoped.tools.register(consultDefinition(rootCtx, config)));
  disposers.push(
    scoped.systemPrompt.section({
      name: `tool:${DELEGATE_TOOL}`,
      order: scoped.systemPrompt.getSectionOrder('TOOL_SUBAGENT'),
      text: () =>
        read(config, 'consultantEnabled') !== true
          ? ''
          : 'When a delegation is complex, the shipped `subagent` tool refuses it: ask the consultant first with `delegate` (provide `need` in your own words), read the advice, then start your own `plan` with `delegate`. You keep the decision: the number of children, their models, and their acceptance checks are yours to set.',
    }),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}

/**
 * Install the consultant layer: shadow the delegation tools in every agent scope.
 * @param ctx - plugin context.
 * @param config - this plugin's resolved config.
 */
function installConsultant(ctx, config) {
  const adviceOf = new Map();
  const mounted = new Map();

  const mount = async (agent) => {
    if (agent === undefined || agent.ctx === undefined) {
      return;
    }
    if (mounted.has(agent.id)) return;
    try {
      const fiber = agent.ctx.inject(['tools', 'subagents', 'llm', 'systemPrompt'], (scoped) =>
        installScoped(ctx, config, adviceOf, scoped),
      );
      mounted.set(agent.id, fiber);
      await fiber;
    } catch (error) {
      if (ctx.logger && typeof ctx.logger.warn === 'function') {
        ctx.logger.warn('subagent-depth: could not install the consultant tools on %s: %s', String(agent.id), String(error));
      }
    }
  };

  const unmount = (agentId) => {
    const fiber = mounted.get(agentId);
    mounted.delete(agentId);
    adviceOf.delete(agentId);
    if (fiber === undefined) return;
    try {
      Promise.resolve(fiber.dispose()).catch(() => undefined);
    } catch {
      // A disposal race must not surface to the agent.
    }
  };

  ctx.effect(() => {
    const offCreated = ctx.on('agent/created', async ({ agent }) => {
      await mount(agent);
    });
    const offDisposed = ctx.on('agent/disposed', ({ agent }) => {
      unmount(agent.id);
    });
    for (const agent of ctx.agents.list()) mount(agent);
    return () => {
      offCreated();
      offDisposed();
      for (const agentId of [...mounted.keys()]) unmount(agentId);
    };
  }, 'subagent-depth: consultant tools in every agent scope');
}

/**
 * Install the host half.
 * @param ctx - plugin context.
 * @param config - this plugin's resolved config.
 */
export function apply(ctx, config) {
  ctx.effect(() => installGuard(ctx, config), 'subagent-depth: per-level quota and delegation reviewer');
  installConsultant(ctx, config);
}