# dsh-subagent-depth

在 DSH 聊天输入栏加一个「子代理」控件，把**子代理最大递归深度**在 `0 / 1 / 2` 之间切换。

> **这不是新能力。** 递归深度上限是 DeepSeek Harness 内置的（设置 → Subagent → 最大递归深度）。
> 本插件只补一个顺手入口，读写的是同一份配置，与设置页双向一致。

输入栏里的样子（无边框，与旁边的「自动审查」同为 13px，融进工具行）：

![输入栏里的样子](docs/idle.png)

点击 chip，菜单**向上**弹出。每一档带一个层级图标（⊘ / 两节点 / 三节点），行有 hover 高亮、当前档带勾、指针变手型：

![菜单](docs/hover.png)

尺寸与配色不是估的，是从这两个已发布包里的 CSS 抄的：

- `@deepseek-ai/dsh-client-ui-permission-presets` → `PermissionSelect.module.css`（chip 的 `height:28px`、`padding:0 4px 0 8px`、`font-size:13px; font-weight:500; line-height:20px`、`color:var(--dsw-alias-label-secondary)`、hover `var(--dsw-alias-interactive-bg-hover)`）
- `@deepseek-ai/dsh-client-ui-primitives` → `Menu.module.css` + `MenuSurface.module.css`（菜单卡片的 `--dsw-menu-surface-fill`、`--dsw-elevation-prominent`、行高 `min-height:34px`）

## 三档含义

| 值 | 含义 | 效果 |
|---|---|---|
| `0` | 禁用子智能体 | 主 Agent 也不能派子代理 |
| `1` | 仅主 Agent 可派 | 子代理不能再往下派 |
| `2` | 可递归一层 | 子代理可以再派一层 |

**这是上限，不是指令。** 派不派、派几层，仍由 Agent 按任务自己决定；调到 2 不会让它变啰嗦，调到 1 也不会逼它别派。

## 安装

方式一，应用内：插件 → 安装本地目录，选这个包目录。

方式二，命令行（**仅限非 desktop profile**）：

```
dsh plugin --profile <profile> add <本目录绝对路径>
```

> desktop profile 由 Electron 独占管理，CLI 会直接报
> `error: profile "desktop" is managed exclusively by the Electron application`。
> 这种 profile 请在应用内安装。

## 原理

输入栏是插槽化的。这个控件注册到 `conversation.input.left`——composer 工具行左侧的紧凑控件位，
`replaceRisk: none`，与「自动审查」「模型选择」同一排，`order: 10`。

读写不另立存储，而是复用设置页那一套：

```
React <select>  ──change──▶  ConfigFormController.set("maxDepth", n)
                               │
                               ├─ ctx.remote.settings.mutate("subagent",
                               │     [{ op: "set", path: ["maxDepth"], value: n }], revision)
                               │
                               └─ Host: settings.write → configEditor.edit → profile 的 cordis.patch.yml
```

- `configForms` 是 `@deepseek-ai/dsh-client-ui-settings` 提供的服务，本插件只 `inject: ["slots", "locale", "configForms"]`
- 读取靠 `useSyncExternalStore(form.subscribe, form.getSnapshot)`，设置页一改这边立刻跟着变
- 写入带 revision，两边同时改不会静默覆盖，冲突会报错

`maxDepth` 在 schema 里是 `x-cordis.volatile: true`，所以改完立即生效，不需要重启。

## 评审员（可选，默认不启用）

配额只管「几个」，管不了「该不该派」。把评审员接上之后，每次委派在放行前会先问**另一个模型**：

- 设置页填 `reviewerProvider` / `reviewerModel` —— **必须是你已经授权给子智能体的路由**（设置 → Subagent → 允许 Agent 为子智能体选择模型）
- 填 `policy`：你自己对这个项目的分层原则（什么该派、什么该自己干）
- 评审员只会回一个 JSON：`{"decision":"allow|ask|deny","reason":"…"}`
- `allow` 放行 · `ask` 弹给你定 · `deny` 直接拒
- 评审员调用失败、或回不出合法 JSON 时**一律放行**——守卫不能把委派本身弄坏
- `reviewMode` 设成 `off` 可以只保留配额、关掉评审

两者顺序是固定的：**先判配额（便宜、确定），通过了才花一次模型调用去审形状**。

## 一个容易踩的坑

`subagent` 之外，`tool-subagent` / `tool-subagent-fork` 也各自有 `maxDepth`，而且**工具级优先**
（官方说明：「如果某个工具单独设置了最大递归深度，以该工具的设置为准」）。
那两行一旦被钉死，设置页和本控件都会失效。

官方 `@deepseek-ai/dsh-base` 的 bundle patch 对这两行**不设** `maxDepth`，所以正常安装不用管；
只有手改过 profile 才需要检查：

```yaml
- id: tool-subagent
  config:
    provider: spawn
    toolName: subagent      # ← 这里不该出现 maxDepth
```

## 兼容性

在 DSH 桌面版 `0.2.1-rc.2` / profile `desktop` 上实机验证。用到的接口：
`ctx.slots`、`ctx.locale`、`ctx.configForms`、`ctx.remote.settings.mutate`、`configEditor`。

## 风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 客户端 bundle 加载失败 | 写错就整块不渲染 | 组件外包 `ErrorBoundary`，`apply()` 整体 `try/catch`；失败只掉控件，不掉输入栏 |
| API 漂移 | DSH 升级改了服务名 | 只用已确认存在的 API；`inject` 声明硬依赖，缺服务时不激活而不是抛错 |
| 与设置页同时写 | revision 冲突 | 交给 Host 的 revision 校验，不强行覆盖 |
| 默认值 | 官方默认 `maxDepth` 是 `1` | 本插件不改默认值，只做显示与切换 |

## 回滚 / 卸载

应用内：插件 → 找到 `dsh-subagent-depth` → 卸载。

命令行（非 desktop profile）：`dsh plugin --profile <profile> remove dsh-subagent-depth`

卸载后：

- 控件消失
- **`maxDepth` 设置保留**（它是 `subagent` 分节的一部分，跟插件在不在无关）
- 若是以本地目录 link 方式装入 profile，`node_modules` 下可能残留一个 junction，需要手工删除：

```powershell
Remove-Item -Path '<profile>\node_modules\dsh-subagent-depth' -Force
```

（本项目验收时确实遇到这个残留，`remove_bundle` 没有清掉它。）

## 目录

```
client.js          浏览器半部：控件本身
index.js           Host 半部：空实现（bundle 需要一行可挂载的包）
cordis.patch.yml   插入 bundle 行
locale/en.json     插件列表里的标题与描述
locale/zh.json
icon.svg
docs/              README 截图
```

## 关于本项目的来源（免责声明）

本项目的全部内容——代码、README、提交信息、验收记录——由 AI 助手（DeepSeek Harness 中的编码 Agent）
全程编写与实机验证。使用者不写代码，不是程序员，只负责提出需求、判断产品表现、并在关键决策点拍板。

所有技术结论都以实测为准：每一条「PASS」背后都有原始报错原文、文件片段或截图，不是推测。
但**请自行复核**：如果你打算在别的 DSH 版本或生产环境使用，先读一遍 `client.js`（约 340 行，只有一个控件），
确认它在你那里做的正是你想让它做的事。

本项目按 MIT 许可「按原样」提供，不附带任何担保；作者不对因使用本项目造成的任何后果负责。

## 许可

MIT
