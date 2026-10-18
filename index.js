/**
 * Host half of `dsh-subagent-depth`.
 *
 * Two jobs:
 *
 *   1. Declare the per-level caps. They are `volatile` fields, so the shipped
 *      Settings page projects them into a form for this plugin automatically —
 *      the same mechanism the Subagent page uses — and the Caps section there
 *      is where a user changes them. No client code is needed for that.
 *
 *   2. Enforce them. Subagents can spawn Subagents, so a delegation tree grows
 *      exponentially with depth; the depth limit alone says how deep it may go,
 *      never how wide. This caps the NUMBER of live Subagents at each level of
 *      one tree, counted across the whole level rather than per parent: level 1
 *      may hold at most `level1` live children of the main agent, level 2 at
 *      most `level2` live grandchildren under it, and how those are distributed
 *      among their parents is deliberately not constrained.
 *
 * Counting is "live now", not "ever created": a Subagent that finished frees
 * its slot. Exceeding a cap never blocks silently — the call is sent to the
 * user as an approval prompt, so they decide whether to let the tree grow.
 *
 * Two bounds can be true at once (this one and the Host's flat
 * `subagent.maxActiveSubagents`), and this plugin does not arbitrate: each asks,
 * and the user answers.
 */

import z from '@deepseek-ai/schemastery';

/** Delegation tools whose calls create a Subagent. */
const DELEGATION_TOOLS = new Set(['subagent', 'subagent_fork']);

/** How many levels this plugin caps: depth stops at 2, so levels 1 and 2. */
const CAPPED_LEVELS = 2;

export const name = 'subagent-depth';

/** Services the guard needs; the plugin stays inactive without them. */
export const inject = ['tools', 'subagents', 'agents'];

export const Config = z.object({
  level1: z.number().step(1).min(0).max(1000).default(5).volatile(),
  level2: z.number().step(1).min(0).max(1000).default(8).volatile(),
});

/**
 * Read one cap, tolerating a volatile config reference.
 * @param config - resolved plugin config, possibly still a volatile ref.
 * @param level - tree level whose cap is wanted.
 * @returns the configured cap, or undefined when unset or not a number.
 */
function capFor(config, level) {
  if (level > CAPPED_LEVELS) return undefined;
  // Both the config object and each `volatile` field arrive as cosmokit
  // references; unwrap either shape until a plain value comes back.
  const unwrap = (value) =>
    value !== null && typeof value === 'object' && typeof value.get === 'function'
      ? unwrap(value.get())
      : value;
  const plain = unwrap(config);
  if (plain === null || typeof plain !== 'object') return undefined;
  const raw = unwrap(plain[`level${level}`]);
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
        const cap = capFor(config, level);
        if (cap === undefined) return next();

        const live = liveAt(tree.rows, level);
        if (live < cap) return next();

        return {
          kind: 'ask',
          reason: `level ${level} already holds ${live} live Subagents (cap ${cap})`,
          displayReason: {
            en: `Level ${level} already holds ${live} live subagents (cap ${cap}). Allowing this one exceeds the per-level limit.`,
            zh: `${level} 级已有 ${live} 个子智能体在运行（上限 ${cap}），再派会超过这一层的配额。`,
          },
        };
      }),
    'subagent-depth: per-level delegation guard',
  );
}
