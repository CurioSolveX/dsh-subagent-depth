/**
 * Host half of `dsh-subagent-depth`.
 *
 * The capability itself is built into DSH: the `subagent` plugin owns
 * `maxDepth`, and the Settings page edits it. This bundle adds no Host
 * behaviour of its own — the visible control lives in `client.js` and writes
 * through the shipped `configForms` service, so there is exactly one owner of
 * the value and no second source of truth.
 *
 * A Host entry is still required: a bundle row names a package that the Loader
 * mounts, and the plugin inventory lists it.
 */

/** Mount point for the bundle row; intentionally does nothing. */
export function apply() {}
