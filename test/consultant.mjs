/**
 * Local harness for the consultant layer. Runs the real `apply()` against a
 * fake cordis context: no DSH, no network, no profile changes.
 *
 *   node work/test-consultant.mjs
 */

import { apply } from '../index.js';

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      got  = ${JSON.stringify(got)}\n      want = ${JSON.stringify(want)}`);
}

function makeWorld(overrides = {}) {
  return {
    agents: [],
    log: [],
    calls: [],
    starts: [],
    defs: new Map(),
    handlers: new Map(),
    rows: [],
    maxDepth: 2,
    screenerAnswer: '{"hard":false,"why":"简单"}',
    consultantAnswer: '建议 3 个人，每人一个文件；验收标准：跑通测试。',
    consultantThrows: false,
    ...overrides,
  };
}

function makeAgent(world, id, depth) {
  const agent = {
    id,
    depth,
    session: {
      header: { delegationDepth: depth },
      requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash' } }),
    },
    options: {},
    ctx: {
      inject(_deps, callback) {
        const scoped = {
          tools: {
            register(definition) {
              if (world.defs.has(definition.name)) throw new Error(`tool "${definition.name}" is already registered in this scope`);
              world.defs.set(definition.name, definition);
              return () => world.defs.delete(definition.name);
            },
          },
          systemPrompt: {
            section() {
              return () => {};
            },
            context() {
              return () => {};
            },
            getSectionOrder() {
              return 0;
            },
            getContextOrder() {
              return 0;
            },
          },
        };
        callback(scoped);
        return { dispose() {} };
      },
    },
  };
  world.agents.push(agent);
  return agent;
}

function makeCtx(world) {
  return {
    logger: { warn: (...args) => world.log.push(args.join(' ')), info() {} },
    effect(fn) {
      return fn();
    },
    on(name, handler) {
      const list = world.handlers.get(name) ?? [];
      list.push(handler);
      world.handlers.set(name, list);
      return () => {};
    },
    agents: {
      list: () => world.agents,
      roots: () => world.agents.filter((agent) => agent.depth === 0),
    },
    subagents: {
      resolveMaxDepth: () => world.maxDepth,
      listDescendants: async () => world.rows,
      startActivation: async (spec) => {
        world.starts.push(spec);
        return { childId: `child-${world.starts.length}` };
      },
    },
    llm: {
      stream(options) {
        const system = String(options.system ?? '');
        const kind = system.includes('任务分诊员') ? 'screener' : system.includes('意见专家') ? 'consultant' : 'other';
        world.calls.push({
          kind,
          provider: options.provider,
          model: options.model,
          text: options.messages?.[0]?.content?.[0]?.text ?? '',
        });
        return (async function* stream() {
          if (kind === 'consultant' && world.consultantThrows) throw new Error('provider exploded');
          const answer = kind === 'screener' ? world.screenerAnswer : kind === 'consultant' ? world.consultantAnswer : '{"decision":"allow","reason":"ok"}';
          yield { type: 'text-delta', text: answer };
          yield { type: 'finish', reason: { kind: 'stop' } };
        })();
      },
    },
  };
}

function baseConfig(patch = {}) {
  return {
    level1: 5,
    level2: 8,
    reviewerProvider: '',
    reviewerModel: '',
    reviewMode: 'every',
    policy: '拆得动才拆。',
    consultantEnabled: false,
    consultant0Provider: '',
    consultant0Model: '',
    consultant1Provider: '',
    consultant1Model: '',
    consultantMode: 'smart',
    screenerProvider: '',
    screenerModel: '',
    ...patch,
  };
}

function execOf(agent, args, name = 'subagent') {
  return { name, agent, arguments: args, signal: new AbortController().signal };
}

async function boot(config, world) {
  const ctx = makeCtx(world);
  apply(ctx, config);
  const root = makeAgent(world, 'root', 0);
  for (const handler of world.handlers.get('agent/created') ?? []) await handler({ agent: root });
  return { ctx, root };
}

async function guard(world, exec) {
  const handlers = world.handlers.get('tools/pre-execute') ?? [];
  const next = async () => ({ kind: 'next' });
  for (const handler of handlers) {
    const result = await handler(exec, next);
    if (result !== undefined) return result;
  }
  return { kind: 'next' };
}

const PRO = { consultantEnabled: true, consultant0Provider: 'deepseek-account', consultant0Model: 'claude-opus' };

// 1. Registration and schemas.
{
  const world = makeWorld();
  await boot(baseConfig(), world);
  check('1a 只注册 delegate 与 consult', [...world.defs.keys()].sort(), ['consult', 'delegate']);
  const params = JSON.parse(JSON.stringify(world.defs.get('delegate').parameters));
  check('1b 参数根是 object', params.type, 'object');
  check('1c 有 need/prompt/plan/fork', Object.keys(params.properties).sort(), ['cwd', 'fork', 'model', 'need', 'plan', 'prompt', 'provider']);
  check('1d 输出根是 object', world.defs.get('delegate').output.schema.type, 'object');
}

// 2. Switch off: delegate refuses, guard lets every delegation through untouched.
{
  const world = makeWorld();
  const { root } = await boot(baseConfig(), world);
  let message = '';
  try {
    await world.defs.get('delegate').execute({ prompt: 'x', need: 'y' }, execOf(root, { prompt: 'x', need: 'y' }));
  } catch (error) {
    message = String(error.message ?? error);
  }
  check('2a 关闭时 delegate 明说别用', message.includes('没有启用'), true);
  const verdict = await guard(world, execOf(root, { prompt: 'do it', description: 'd' }));
  check('2b 关闭时官方派活不被拦', verdict.kind, 'next');
  check('2c 关闭时不花模型调用', world.calls.length, 0);
}

// 3. Guard: easy delegation passes, no consultant.
{
  const world = makeWorld();
  const { root } = await boot(baseConfig(PRO), world);
  const verdict = await guard(world, execOf(root, { prompt: '读一个文件', description: 'd' }));
  check('3a 简单任务放行', verdict.kind, 'next');
  check('3b 只调了筛子', world.calls.map((call) => call.kind), ['screener']);
}

// 4. Guard: complex delegation is refused with instructions, then remembered.
{
  const world = makeWorld({ screenerAnswer: '{"hard":true,"why":"跨多文件"}' });
  const { root } = await boot(baseConfig(PRO), world);
  const first = await guard(world, execOf(root, { prompt: '重构三个模块', description: 'd' }));
  check('4a 复杂任务被拒', first.kind, 'deny');
  check('4b 拒绝文案指向 delegate', first.reason.includes('delegate') && first.reason.includes('prompt'), true);
  const second = await guard(world, execOf(root, { prompt: '重构三个模块', description: 'd' }));
  check('4c 同一个任务再派直接拒，不再花筛子', [second.kind, world.calls.length], ['deny', 1]);
}

// 5. Ask then decide: advice first, then the agent's own plan.
{
  const world = makeWorld();
  const { root } = await boot(baseConfig(PRO), world);
  const ask = { prompt: '重构三个模块', need: '三个模块要分开验，怕互相影响' };
  const advice = await world.defs.get('delegate').execute(ask, execOf(root, ask, 'delegate'));
  check('5a 只返回建议', advice.kind, 'advice');
  check('5b 建议原文带回来', advice.advice, world.consultantAnswer);
  check('5c 一个都没启动', world.starts.length, 0);
  check('5d 只调了顾问（不筛）', world.calls.map((call) => call.kind), ['consultant']);

  const plan = {
    need: '三个模块要分开验，怕互相影响',
    plan: [
      { title: 'a', task: '改 a', provider: 'deepseek-account', model: 'deepseek-flash', acceptance: ['a 的测试通过'] },
      { title: 'b', task: '改 b', provider: 'deepseek-account', model: 'gpt-5' },
      { title: 'c', task: '改 c' },
    ],
  };
  const started = await world.defs.get('delegate').execute(plan, execOf(root, plan, 'delegate'));
  check('5e 按 CEO 的计划派 3 个', started.subagentIds.length, 3);
  check('5f 三个人三个模型', world.starts.map((spec) => spec.request.agentOptions ?? null), [
    { provider: 'deepseek-account', model: 'deepseek-flash' },
    { provider: 'deepseek-account', model: 'gpt-5' },
    null,
  ]);
  check('5g 有验收标准的才带 outputSchema', world.starts.map((spec) => spec.request.outputSchema !== undefined), [true, false, false]);
  check('5h 验收标准写进子任务', world.starts[0].request.prompt[0].text.includes('a 的测试通过'), true);
  check('5i 第二次没有重复问顾问', world.calls.length, 1);
}

// 6. A plan without advice still hears the consultant first.
{
  const world = makeWorld();
  const { root } = await boot(baseConfig(PRO), world);
  const plan = { need: '没问过就先派', plan: [{ title: 'a', task: '做 a' }] };
  const first = await world.defs.get('delegate').execute(plan, execOf(root, plan, 'delegate'));
  check('6a 没问过先给建议', first.kind, 'advice');
  check('6b 仍然没启动', world.starts.length, 0);
  const second = await world.defs.get('delegate').execute(plan, execOf(root, plan, 'delegate'));
  check('6c 再调才派', second.subagentIds, ['child-1']);
}

// 7. Consultant down: nothing blocks the delegate's plan.
{
  const world = makeWorld({ consultantThrows: true });
  const { root } = await boot(baseConfig(PRO), world);
  const ask = { prompt: 'hard job', need: '不确定' };
  const value = await world.defs.get('delegate').execute(ask, execOf(root, ask, 'delegate'));
  check('7a 顾问挂了说清楚', value.kind, 'unavailable');
  const plan = { need: '不确定', plan: [{ title: 'a', task: '做 a' }] };
  const started = await world.defs.get('delegate').execute(plan, execOf(root, plan, 'delegate'));
  check('7b 带计划照样能派', started.subagentIds, ['child-1']);
  check('7c 失败有日志', world.log.some((line) => line.includes('model call failed')), true);
}

// 8. Batch larger than the remaining cap is refused, not truncated.
{
  const world = makeWorld();
  const { root } = await boot(baseConfig({ ...PRO, level1: 3 }), world);
  world.rows = [
    { kind: 'child', id: 'x', depth: 1, activity: 'running' },
    { kind: 'child', id: 'y', depth: 1, activity: 'running' },
    { kind: 'child', id: 'z', depth: 1, activity: 'running' },
  ];
  const plan = { need: 'n', plan: [{ title: 'a', task: 'a' }, { title: 'b', task: 'b' }] };
  await world.defs.get('delegate').execute({ prompt: 'p', need: 'n' }, execOf(root, { prompt: 'p', need: 'n' }, 'delegate'));
  const value = await world.defs.get('delegate').execute(plan, execOf(root, plan, 'delegate'));
  check('8a 超配额被拒', value.kind, 'blocked');
  check('8b 拒绝文案带数字', /已有 3 个在运行，上限 3/.test(value.message), true);
  check('8c 一个都没启动', world.starts.length, 0);
}

// 9. Depth ceiling applies before anything is asked.
{
  const world = makeWorld();
  const { root } = await boot(baseConfig(PRO), world);
  const deep = makeAgent(world, 'deep', 2);
  let message = '';
  try {
    await world.defs.get('delegate').execute({ prompt: 'p', need: 'n' }, execOf(deep, { prompt: 'p', need: 'n' }, 'delegate'));
  } catch (error) {
    message = String(error.message ?? error);
  }
  check('9a 深度 2 直接拒', message.includes('current 2, maximum 2, remaining levels 0'), true);
  check('9b 没有模型/子代理调用', [world.starts.length, world.calls.length], [0, 0]);
}

// 10. Level-1 agents ask the level-1 consultant.
{
  const world = makeWorld({ rows: [{ kind: 'child', id: 'lvl1', depth: 1, activity: 'running' }] });
  const booted = await boot(baseConfig({ consultantEnabled: true, consultant0Provider: 'p0', consultant0Model: 'm0', consultant1Provider: 'p1', consultant1Model: 'm1' }), world);
  const level1 = makeAgent(world, 'lvl1', 1);
  const args = { prompt: 'hard', need: '卡住了' };
  await world.defs.get('delegate').execute(args, execOf(level1, args, 'delegate'));
  const consultantCall = world.calls.find((call) => call.kind === 'consultant');
  check('10a 1 级用 1 级顾问', [consultantCall?.provider, consultantCall?.model], ['p1', 'm1']);
}

// 11. consult answers, refuses when off, never delegates.
{
  const world = makeWorld();
  const { root } = await boot(baseConfig(PRO), world);
  const value = await world.defs.get('consult').execute({ question: '这一步怎么做', context: '报错 E1' }, execOf(root, {}));
  check('11a consult 返回原文', value.advice, world.consultantAnswer);
  check('11b consult 不派活', world.starts.length, 0);

  const off = makeWorld();
  const booted = await boot(baseConfig(), off);
  let message = '';
  try {
    await off.defs.get('consult').execute({ question: 'q' }, execOf(booted.root, {}));
  } catch (error) {
    message = String(error.message ?? error);
  }
  check('11c 关闭时 consult 明确拒绝', message.includes('没有启用'), true);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;

