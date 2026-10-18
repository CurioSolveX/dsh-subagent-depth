/**
 * Browser half of `dsh-subagent-depth` — the "tree depth" chip.
 *
 * One compact control in `conversation.input.left`, the left end of the composer
 * tool row, beside the permission and model controls. It shows the maximum
 * Subagent recursion depth and selects 0, 1, or 2 from a menu that opens above
 * it.
 *
 * The value is an upper bound, not a command: the agent still decides per task
 * whether delegating is worthwhile. 0 disables Subagents entirely, 1 allows
 * only the main agent to create them, 2 lets a Subagent create one more level.
 *
 * Geometry and colour are copied from the shipped permission chip in the same
 * row (`@deepseek-ai/dsh-client-ui-permission-presets`, PermissionSelect.module
 * .css) and from the shared menu primitive (`@deepseek-ai/dsh-client-ui-
 * primitives`, Menu.module.css / MenuSurface.module.css), rather than guessed:
 *
 *   trigger  height 28px · radius var(--dsw-radius-sm) · padding 0 4px 0 8px
 *            gap 4px · 13px / weight 500 / line-height 20px
 *            colour var(--dsw-alias-label-secondary)
 *            hover  var(--dsw-alias-interactive-bg-hover)
 *            icon 14px · chevron var(--dsw-alias-label-caption)
 *   menu     radius var(--dsw-radius-lg) · padding 4px · shadow
 *            var(--dsw-elevation-prominent) · background
 *            var(--dsw-menu-surface-fill) with its backdrop filter
 *   row      min-height 34px · padding 6px 8px · gap 6px · radius
 *            var(--dsw-radius-md) · 13px / line-height 20px ·
 *            colour var(--dsw-alias-label-primary) · hover
 *            var(--dsw-alias-interactive-bg-hover)
 *
 * The control owns no state of its own: it reads and writes the shipped
 * `subagent` settings namespace through the client `configForms` service, the
 * same one the Settings page uses.
 *
 * Nothing here may break the composer: registration, styling, and rendering are
 * each isolated, and a render failure unmounts only this control.
 */
window.__ModuleLoader__.load({
  id: 'dsh-subagent-depth',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var react = require('react');
    var h = react.createElement;

    /** Settings namespace that owns Subagent recursion depth. */
    var NAMESPACE = 'subagent';
    /** Settings namespace that owns this plugin's own settings (caps, reviewer, consultant). */
    var OWN_NAMESPACE = 'subagent-depth';
    /** Compact controls at the left of the composer tool row. */
    var SLOT = 'conversation.input.left';
    /** Bundle page seat for this bundle's own configuration. */
    var CONFIG_SLOT = 'plugins.bundle.config';
    /** Registry namespace of this plugin's own copy. */
    var I18N = 'subagent-depth';
    /** Schema default of `subagent.maxDepth` when the profile does not override it. */
    var SCHEMA_DEFAULT = 1;
    /** The depths offered by the menu, in display order. */
    var CHOICES = [0, 1, 2];

    var en = {
      name: 'Tree depth',
      title: 'Maximum subagent depth',
      level0: 'Off',
      level1: 'Main agent only',
      level2: 'One level of children',
      busy: 'Saving…',
      failed: 'Not saved',
      consultantTitle: 'Consultant',
      consultantEnabled: 'Enable the consultant',
      consultantLevel0: 'Level 0 consultant',
      consultantLevel0Short: 'Level 0 consultant',
      consultantLevel1Short: 'Level 1 consultant',
      consultantLevel1: 'Level 1 consultant',
      consultantProvider: 'Provider',
      consultantModel: 'Model',
      consultantMode: 'When to ask',
      consultantModeSmart: 'Only when complex',
      consultantModeAlways: 'Every delegation',
      consultantScreenerNote: 'Whether a delegation is complex is judged by the model chosen at the right of the composer - the working model itself, not a second route.',
      consultantHint:
        'The consultant only advises: the working agent still decides how many subagents to start, which model each uses, and what counts as acceptable. Leave a level blank to disable it. Fill routes that already exist in this DSH (Kimi, Claude, GPT, Gemini, GLM …).',
      consultantSaved: 'Saved',
      consultantDirty: 'Editing…',
      consultantPick: 'Choose a model',
      consultantClear: 'Clear',
      consultantSearch: 'Search models…',
      consultantLoading: 'Loading models…',
      consultantEmpty: 'No model is configured on this DSH yet.',
      consultantError: 'Could not load the model list',
      consultantOn: 'On',
      consultantOff: 'Off',
      consultantUnset: 'Not set',
      consultantEditInPlugin: 'Edit in Plugins → Tree depth',
      quotaTitle: 'Quota (live subagents per level)',
      quotaLevel0: 'Level 0',
      quotaLegend: 'Level 0 is the CEO (fixed at 1); level 1 is started by the CEO; level 2 is started by level 1.',
      quotaLevel1: 'Level 1',
      quotaLevel2: 'Level 2',
      quotaFixed: '1 (fixed)',
      quotaTotalPrefix: 'At most',
      quotaGlobal: 'Global limit / derived',
      quotaMismatch: 'The shipped page disagrees with this table',
      quotaRecalc: 'Recalculate from depth and levels',
      quotaWorkers: 'workers',
      quotaConsultants: 'consultants',
      quotaTotalSuffix: 'agents (CEO excluded).',
      quotaWithCeo: 'with the CEO that is',
      quotaRoles: 'roles.',
      quotaConsultantNote: 'Consultants do not take these slots: they sit beside the CEO as separate model calls.',
    };
    var zh = {
      name: '树深阈',
      title: '最大子代理深度',
      level0: '禁用子智能体',
      level1: '仅主 Agent 可派',
      level2: '可递归一层',
      busy: '保存中…',
      failed: '未保存',
      consultantTitle: 'Consultant',
      consultantEnabled: '启用Consultant',
      consultantLevel0: '0 级 Consultant（主 Agent 问的）',
      consultantLevel0Short: '0 级 Consultant',
      consultantLevel1Short: '1 级 Consultant',
      consultantLevel1: '1 级 Consultant（子代理问的）',
      consultantProvider: 'provider',
      consultantModel: '模型',
      consultantMode: '什么时候问',
      consultantModeSmart: '只在复杂时问',
      consultantModeAlways: '每次派活都问',
      consultantScreenerNote: '「难不难」由输入栏右侧选的主模型（干活的 CEO）自己判断，不再单独配一个模型。',
      consultantHint:
        '顾问只出主意：派几个人、每人用什么模型、验收标准，仍由做事的 Agent 自己决定。某级留空 = 这一级不启用。填的是这台 DSH 里已经配好的路由（Kimi、Claude、GPT、Gemini、GLM 都可以）。',
      consultantSaved: '已保存',
      consultantDirty: '编辑中…',
      consultantPick: '选择模型',
      consultantClear: '清除',
      consultantSearch: '搜索模型…',
      consultantLoading: '正在读取模型列表…',
      consultantEmpty: '这台 DSH 还没有配置任何模型。',
      consultantError: '读不到模型列表',
      consultantOn: '开',
      consultantOff: '关',
      consultantUnset: '未设置',
      consultantEditInPlugin: '在「插件 → 树深阈」里修改',
      quotaTitle: '配额（每一层同时最多几个）',
      quotaLevel0: '0 级',
      quotaLegend: '0 级是 CEO（固定 1 个）；1 级是主 Agent 直接派的；2 级是 1 级再往下派的。',
      quotaLevel1: '1 级',
      quotaLevel2: '2 级',
      quotaFixed: '1（固定）',
      quotaTotalPrefix: '同时最多',
      quotaGlobal: '内置全局上限 / 应为',
      quotaMismatch: '内置页的数字和上表不一致',
      quotaRecalc: '按深度与上表重新计算',
      quotaWorkers: '个工人',
      quotaConsultants: '个顾问',
      quotaTotalSuffix: '个（不含 CEO）。',
      quotaWithCeo: '加 CEO 共',
      quotaRoles: '个角色。',
      quotaConsultantNote: 'Consultant不占这些名额：它们和 CEO 同级，是单独的一次模型调用。',
    };

    var CSS = [
      /* Trigger — copied from PermissionSelect.module.css .trigger */
      '.sudg-trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:220px;',
      'height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;',
      'background:0 0;border:none;outline:none;align-items:center;gap:4px;',
      'padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;',
      'display:inline-flex;}',
      '.sudg-trigger:hover:not(:disabled)',
      '{background:var(--dsw-alias-interactive-bg-hover);}',
      '.sudg-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,',
      'var(--dsw-alias-state-business-primary));}',
      '.sudg-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default;}',
      '.sudg-triggerIcon{flex:none;display:inline-flex;}',
      '.sudg-triggerIcon svg{width:14px;height:14px;}',
      '.sudg-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;',
      'overflow:hidden;}',
      '.sudg-chevron{color:var(--dsw-alias-label-caption);flex:none;',
      'transition:transform .12s;display:inline-flex;}',
      '.sudg-chevronOpen{transform:rotate(180deg);}',
      /* Menu card — copied from Menu.module.css .list + MenuSurface.module.css */
      '.sudg-menu{position:fixed;z-index:1100;box-sizing:border-box;padding:4px;',
      'display:flex;flex-direction:column;gap:0;border:0;',
      'border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-prominent);',
      'background:var(--dsw-menu-surface-fill);',
      '-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter);',
      'backdrop-filter:var(--dsw-menu-backdrop-filter);',
      'min-width:144px;max-width:360px;}',
      /* Row — copied from Menu.module.css .item */
      '.sudg-item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;',
      'padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);',
      'background:transparent;cursor:pointer;font-size:13px;line-height:20px;',
      'color:var(--dsw-alias-label-primary);text-align:left;font-family:inherit;}',
      '.sudg-item:hover:not(:disabled),.sudg-item:focus-visible:not(:disabled)',
      '{background:var(--dsw-alias-interactive-bg-hover);outline:none;}',
      '.sudg-itemIcon{display:inline-flex;flex:none;width:14px;height:14px;',
      'align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon);}',
      '.sudg-itemIcon svg{width:14px;height:14px;}',
      '.sudg-itemLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;',
      'white-space:nowrap;}',
      '.sudg-check{flex:none;width:14px;height:14px;color:var(--dsw-alias-label-primary);}',
      /* Bundle-page configuration section (same page where the plugin is listed). */
      '.sudg-cfg{display:flex;flex-direction:column;gap:12px;padding:16px 0;',
      'border-top:.5px solid var(--dsw-alias-border-l2);}',
      '.sudg-cfgHead{display:flex;align-items:center;justify-content:space-between;',
      'gap:12px;flex-wrap:wrap;}',
      '.sudg-cfgTitle{font-size:14px;line-height:22px;font-weight:500;',
      'color:var(--dsw-alias-label-primary);}',
      '.sudg-cfgHint{font-size:12px;line-height:18px;margin:0;',
      'color:var(--dsw-alias-label-tertiary);}',
      '.sudg-cfgGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
      '.sudg-cfgCard{display:flex;flex-direction:column;gap:8px;padding:12px;',
      'border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);}',
      '.sudg-cfgField{display:flex;flex-direction:column;gap:4px;min-width:0;}',
      '.sudg-cfgLabel{font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary);}',
      '.sudg-cfgInput{box-sizing:border-box;width:100%;height:32px;border:none;',
      'border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);',
      'color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;',
      'padding:0 8px;outline:none;min-width:0;}',
      '.sudg-cfgInput:focus{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,',
      'var(--dsw-alias-state-business-primary));}',
      '.sudg-cfgRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
      '.sudg-cfgModes{display:flex;gap:6px;}',
      '.sudg-mode{padding:4px 10px;border-radius:var(--dsw-radius-sm);',
      'border:.5px solid var(--dsw-alias-border-l2);background:transparent;',
      'color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;',
      'line-height:18px;cursor:pointer;}',
      '.sudg-mode[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);',
      'color:var(--dsw-alias-label-primary);}',
      '.sudg-switch{position:relative;flex:none;width:40px;height:22px;border:none;',
      'border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer;',
      'transition:background .12s;padding:0;}',
      '.sudg-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary);}',
      '.sudg-switch i{position:absolute;top:2px;left:2px;width:18px;height:18px;',
      'border-radius:50%;background:#fff;transition:transform .12s;}',
      '.sudg-switch[aria-checked="true"] i{transform:translateX(18px);}',
      '.sudg-cfgStatus{font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary);}',
      '.sudg-cfgStatus[data-failed]{color:var(--dsw-alias-state-error-primary);}',
      '.sudg-cfgSummary{font-size:13px;line-height:20px;',
      'color:var(--dsw-alias-label-secondary);}',
      /* Model picker popup — same card as the composer menu, plus a filter row. */
      '.sudg-picker{max-height:320px;width:320px;overflow:hidden;display:flex;',
      'flex-direction:column;gap:0;}',
      '.sudg-pickerList{overflow-y:auto;min-height:0;display:flex;flex-direction:column;}',
      '.sudg-pickerSearch{box-sizing:border-box;width:100%;height:30px;margin:0 0 4px;',
      'border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);',
      'background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);',
      'font:inherit;font-size:13px;padding:0 8px;outline:none;}',
      '.sudg-pickerSearch:focus{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,',
      'var(--dsw-alias-state-business-primary));}',
      '.sudg-pickerGroup{font-size:11px;line-height:18px;padding:6px 8px 2px;',
      'color:var(--dsw-alias-label-tertiary);}',
      '.sudg-pickerEmpty{font-size:12px;line-height:18px;padding:8px;',
      'color:var(--dsw-alias-label-tertiary);}',
      '.sudg-pickerBtn{text-align:left;cursor:pointer;display:flex;align-items:center;',
      'justify-content:space-between;gap:8px;}',
      '.sudg-pickerBtn:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.sudg-pickerValue{min-width:0;overflow:hidden;text-overflow:ellipsis;',
      'white-space:nowrap;}',
      '.sudg-pickerChevron{flex:none;color:var(--dsw-alias-label-caption);}',
      '.sudg-pickerClear{margin:4px 0 0;padding:6px 8px;width:100%;border:none;',
      'border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;',
      'color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;',
      'text-align:left;}',
      '.sudg-pickerClear:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      /* Composer chip: consultant section inside the depth menu. */
      '.sudg-menuScroll{display:flex;flex-direction:column;max-height:min(68vh,430px);',
      'overflow-y:auto;min-height:0;}',
      '.sudg-sep{height:.5px;background:var(--dsw-alias-border-l2);margin:4px 0;}',
      '.sudg-menuTitle{font-size:11px;line-height:18px;padding:4px 8px 2px;',
      'color:var(--dsw-alias-label-tertiary);}',
      '.sudg-itemValue{flex:none;max-width:48%;overflow:hidden;text-overflow:ellipsis;',
      'white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;}',
      '.sudg-itemArrow{flex:none;color:var(--dsw-alias-label-caption);',
      'display:inline-flex;transform:rotate(-90deg);}',
      '.sudg-itemArrow svg{width:12px;height:12px;}',
      '.sudg-quota{display:flex;flex-direction:column;gap:8px;}',
      '.sudg-quotaRow{display:flex;align-items:center;justify-content:space-between;',
      'gap:12px;padding:8px 12px;border-radius:var(--dsw-radius-md);',
      'background:var(--dsw-alias-bg-module-platform);}',
      '.sudg-quotaLabel{font-size:13px;line-height:20px;',
      'color:var(--dsw-alias-label-secondary);}',
      '.sudg-quotaFixed{font-size:13px;color:var(--dsw-alias-label-tertiary);}',
      '.sudg-quotaFixed[data-mismatch="true"]{color:var(--dsw-alias-state-error-primary);}',
      '.sudg-quotaNum{width:88px;flex:none;}',
      '.sudg-statusRow{display:flex;align-items:center;gap:8px;padding:6px 8px;',
      'font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);}',
    ].join('');

    /**
     * Read the depth the Host will actually enforce from one form snapshot.
     * @param snapshot - `configForms` form snapshot, possibly not ready yet.
     * @returns the configured depth, or the schema default when unset.
     */
    function resolvedDepth(snapshot) {
      var value = snapshot && snapshot.value;
      if (value !== null && typeof value === 'object') {
        var depth = value.maxDepth;
        if (typeof depth === 'number' && isFinite(depth)) return depth;
      }
      return SCHEMA_DEFAULT;
    }

    /**
     * Localized meaning of one depth; empty for values this menu does not
     * describe, so an out-of-range setting is shown verbatim rather than
     * mislabelled.
     * @param t - bound translate function.
     * @param depth - candidate depth.
     */
    function levelText(t, depth) {
      if (depth === 0) return t('level0');
      if (depth === 1) return t('level1');
      if (depth === 2) return t('level2');
      return '';
    }

    var STROKE = {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    };

    /**
     * One 14px glyph per depth, drawn as the tree it describes: a lone node for
     * 0 (nothing can branch), one fork for 1, and a fork whose arms fork again
     * for 2.
     * @param depth - level to draw, or undefined for a value outside the set.
     */
    function DepthGlyph(depth) {
      var children;
      if (depth === 0) {
        // One node and no branch at all: nothing may be delegated.
        children = [h('circle', { key: 'n', cx: 7, cy: 7, r: 3 })];
      } else if (depth === 1) {
        // The root plus exactly one fork.
        children = [
          h('circle', { key: 'r', cx: 7, cy: 2.7, r: 1.5 }),
          h('path', { key: 's', d: 'M7 4.2 V 6.7' }),
          h('path', { key: 'f', d: 'M4 10.7 L7 6.7 L10 10.7' }),
          h('circle', { key: 'a', cx: 4, cy: 10.7, r: 1.5 }),
          h('circle', { key: 'b', cx: 10, cy: 10.7, r: 1.5 }),
        ];
      } else if (depth === 2) {
        // The same fork, with each arm forking once more.
        children = [
          h('circle', { key: 'r', cx: 7, cy: 2.1, r: 1.3 }),
          h('path', { key: 's', d: 'M7 3.4 V 4.9' }),
          h('path', { key: 'f', d: 'M4.6 8 L7 4.9 L9.4 8' }),
          h('circle', { key: 'a', cx: 4.6, cy: 8, r: 1.1 }),
          h('circle', { key: 'b', cx: 9.4, cy: 8, r: 1.1 }),
          h('path', { key: 'l', d: 'M3.1 11.9 L4.6 8 M6.1 11.9 L4.6 8' }),
          h('path', { key: 'm', d: 'M7.9 11.9 L9.4 8 M10.9 11.9 L9.4 8' }),
        ];
      } else {
        children = [h('circle', { key: 'n', cx: 7, cy: 7, r: 3 })];
      }
      // Inherited by the shapes below: without these the circles default to a
      // black fill and read as blobs at 14px.
      return h(
        'svg',
        {
          viewBox: '0 0 14 14',
          width: 14,
          height: 14,
          'aria-hidden': 'true',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        children,
      );
    }

    /** Chevron matching the primitive icon the permission chip uses. */
    function Chevron() {
      return h(
        'svg',
        { viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': 'true' },
        h('path', {
          d: 'M4 5.75 L7 8.75 L10 5.75',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Trailing check drawn on the selected row. */
    function Check() {
      return h(
        'svg',
        { className: 'sudg-check', viewBox: '0 0 14 14', 'aria-hidden': 'true' },
        h('path', {
          d: 'M3 7.3 L5.8 10 L11 4.6',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /**
     * The control itself. Kept free of side effects so a failed render stays
     * local to this subtree.
     * @param props - the slot face carrying the shared form plus the copy.
     */
    function DepthControl(props) {
      var form = props.form;
      var t = props.t;
      var subscribe = react.useCallback(
        function (listener) {
          return form.subscribe(listener);
        },
        [form],
      );
      var read = react.useCallback(function () {
        return form.getSnapshot();
      }, [form]);
      var snapshot = react.useSyncExternalStore(subscribe, read);

      // Read-only view of this plugin's own settings, used to keep the shipped
      // global limit in step with the depth this control selects.
      var ownForm = props.ownForm;
      var ownSubscribe = react.useCallback(
        function (listener) {
          return ownForm.subscribe(listener);
        },
        [ownForm],
      );
      var ownRead = react.useCallback(function () {
        return ownForm.getSnapshot();
      }, [ownForm]);
      var ownSnapshot = react.useSyncExternalStore(ownSubscribe, ownRead);
      var ownValue =
        ownSnapshot !== undefined && ownSnapshot !== null && ownSnapshot.status === 'ready' && ownSnapshot.value !== null && ownSnapshot.value !== undefined
          ? ownSnapshot.value
          : null;
      var ownLevel1 = ownValue !== null && Number.isFinite(Number(ownValue.level1)) ? Number(ownValue.level1) : 5;
      var ownLevel2 = ownValue !== null && Number.isFinite(Number(ownValue.level2)) ? Number(ownValue.level2) : 8;

      var write = react.useState({ pending: false, failed: false });
      var state = write[0];
      var setState = write[1];

      var menuState = react.useState(null);
      var menuBox = menuState[0];
      var setMenuBox = menuState[1];

      var root = react.useRef(null);
      var menuNode = react.useRef(null);
      var open = menuBox !== null;

      react.useEffect(
        function () {
          if (!open) return undefined;
          var onPointer = function (event) {
            var node = root.current;
            if (node !== null && node.contains(event.target)) return;
            var menuElement = menuNode.current;
            if (menuElement !== null && menuElement.contains(event.target)) return;
            setMenuBox(null);
          };
          var onKey = function (event) {
            if (event.key === 'Escape') setMenuBox(null);
          };
          document.addEventListener('mousedown', onPointer, true);
          document.addEventListener('keydown', onKey, true);
          return function () {
            document.removeEventListener('mousedown', onPointer, true);
            document.removeEventListener('keydown', onKey, true);
          };
        },
        [open],
      );

      if (snapshot === undefined || snapshot === null || snapshot.status !== 'ready') return null;

      var depth = resolvedDepth(snapshot);
      var disabled = snapshot.writable === false || state.pending;
      var options = CHOICES.indexOf(depth) === -1 ? [depth].concat(CHOICES) : CHOICES;
      var meaning = levelText(t, depth);

      var toggle = function () {
        if (disabled) return;
        if (open) {
          setMenuBox(null);
          return;
        }
        var node = root.current;
        if (node === null || typeof node.getBoundingClientRect !== 'function') return;
        var rect = node.getBoundingClientRect();
        var viewWidth = window.innerWidth || 1024;
        var viewHeight = window.innerHeight || 768;
        // `side: "top"` in the Menu primitive: above the anchor, 4px clear.
        setMenuBox({
          left: Math.max(8, Math.min(rect.left, viewWidth - 160)),
          bottom: Math.max(8, viewHeight - rect.top + 4),
        });
      };

      var choose = function (option) {
        setMenuBox(null);
        if (disabled || option === depth) return;
        setState({ pending: true, failed: false });
        // Written without the revision fence: this control owns exactly one
        // scalar, and a stale shared mirror used to make a click read as a
        // silent "Not saved" instead of changing the depth.
        Promise.resolve(props.commit([{ op: 'set', path: ['maxDepth'], value: option }]))
          .then(function (accepted) {
            setState({ pending: false, failed: accepted === false });
            if (accepted === false || props.commitGlobal === undefined) return;
            // The shipped global limit is derived from the depth that now
            // applies, so switching depth keeps both pages consistent.
            props.commitGlobal([
              { op: 'set', path: ['maxActiveSubagents'], value: Math.max(1, derivedLimit(option, ownLevel1, ownLevel2, ownValue)) },
            ]);
          })
          .catch(function () {
            setState({ pending: false, failed: true });
          });
      };

      var trigger = h(
        'button',
        {
          ref: root,
          type: 'button',
          className: 'sudg-trigger',
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': t('title') + ': ' + depth + (meaning === '' ? '' : ' ' + meaning),
          title: t('title') + ' · ' + depth + (meaning === '' ? '' : ' ' + meaning),
          disabled: disabled,
          onClick: toggle,
        },
        h('span', { className: 'sudg-triggerIcon', 'aria-hidden': 'true' }, DepthGlyph(depth)),
        h('span', { className: 'sudg-triggerLabel' }, state.failed ? t('failed') : state.pending ? t('busy') : t('name') + ' ' + depth),
        h('span', { className: open ? 'sudg-chevron sudg-chevronOpen' : 'sudg-chevron', 'aria-hidden': 'true' }, Chevron()),
      );

      if (!open) return trigger;

      var rows = options.map(function (option) {
        var current = option === depth;
        return h(
          'button',
          {
            key: String(option),
            type: 'button',
            className: 'sudg-item',
            role: 'menuitemradio',
            'aria-checked': current ? 'true' : 'false',
            onClick: function () {
              choose(option);
            },
          },
          h('span', { className: 'sudg-itemIcon', 'aria-hidden': 'true' }, DepthGlyph(option)),
          h('span', { className: 'sudg-itemLabel' }, levelText(t, option) || String(option)),
          current ? h(Check) : null,
        );
      });

      var menu = h(
        'div',
        {
          ref: menuNode,
          className: 'sudg-menu',
          role: 'menu',
          style: { left: menuBox.left + 'px', bottom: menuBox.bottom + 'px' },
        },
        h('div', { className: 'sudg-menuScroll' }, rows),
      );

      return h(react.Fragment, null, trigger, menu);
    }

    /**
     * Local error boundary: a control that throws loses only itself, never the
     * surrounding composer row.
     */
    class ErrorBoundary extends react.Component {
      constructor(properties) {
        super(properties);
        this.state = { broken: false };
      }
      static getDerivedStateFromError() {
        return { broken: true };
      }
      componentDidCatch() {}
      render() {
        return this.state.broken ? null : this.props.children;
      }
    }

    /** Coerce a settings value to the text an input shows. */
    function textOf(value) {
      return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
    }

    /**
     * How many consultants this configuration can actually use. A consultant is
     * only ever called while delegating, so it needs workers below it: the
     * level-0 one needs level-1 workers, the level-1 one needs level-2 workers.
     * @param depth - configured recursion depth (0, 1 or 2).
     * @param level1 - level-1 worker cap.
     * @param level2 - level-2 worker cap.
     * @param value - the plugin entry's settings.
     * @returns 0, 1 or 2.
     */
    function consultantCount(depth, level1, level2, value) {
      if (value === null || value === undefined || value.consultantEnabled !== true) return 0;
      var has0 = textOf(value.consultant0Provider) !== '' && textOf(value.consultant0Model) !== '';
      var has1 = textOf(value.consultant1Provider) !== '' && textOf(value.consultant1Model) !== '';
      var count = 0;
      if (depth >= 1 && level1 > 0 && has0) count += 1;
      if (depth >= 2 && level2 > 0 && has1) count += 1;
      return count;
    }

    /**
     * The concurrent-agent ceiling implied by the settings: workers reachable at
     * this depth plus the consultants that can advise them. The CEO is not one
     * of these and is never counted.
     * @param depth - configured recursion depth.
     * @param level1 - level-1 worker cap.
     * @param level2 - level-2 worker cap.
     * @param value - the plugin entry's settings.
     * @returns the derived `maxActiveSubagents` value.
     */
    function derivedLimit(depth, level1, level2, value) {
      var workers = (depth >= 1 ? level1 : 0) + (depth >= 2 ? level2 : 0);
      return workers + consultantCount(depth, level1, level2, value);
    }

    /**
     * One integer input that commits while typing (debounced) and on blur, so
     * the derived numbers below it never lag behind the field being edited.
     */
    function NumberField(props) {
      var draft = react.useState(String(props.value === undefined || props.value === null ? '' : props.value));
      var value = draft[0];
      var setValue = draft[1];

      react.useEffect(
        function () {
          setValue(String(props.value === undefined || props.value === null ? '' : props.value));
        },
        [props.value],
      );

      var publish = function () {
        if (props.disabled === true) return;
        var next = Number(value);
        if (value === '' || !Number.isFinite(next) || next < 0 || Math.floor(next) !== next) return;
        if (next !== props.value) props.commit(next);
      };

      react.useEffect(
        function () {
          var next = Number(value);
          if (value === '' || !Number.isFinite(next) || next < 0 || Math.floor(next) !== next) return undefined;
          if (next === props.value) return undefined;
          var timer = setTimeout(publish, 500);
          return function () {
            clearTimeout(timer);
          };
        },
        [value],
      );

      return h('input', {
        className: 'sudg-cfgInput sudg-quotaNum',
        type: 'number',
        disabled: props.disabled === true,
        min: 0,
        step: 1,
        value: value,
        onChange: function (event) {
          setValue(event.target.value);
        },
        onBlur: publish,
        onKeyDown: function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            publish();
          }
        },
      });
    }

    /**
     * Render one catalog's provider groups as menu rows. Shared by the settings
     * page's picker and the composer chip's inline picker so both list exactly
     * the same models.
     * @param options - t, catalog {status, groups, error}, query, current value, onPick.
     * @returns the row elements.
     */
    function modelRows(options) {
      var t = options.t;
      var catalog = options.catalog;
      var needle = textOf(options.query).trim().toLowerCase();
      var rows = [];
      if (catalog.status === 'loading') {
        rows.push(h('div', { key: 'loading', className: 'sudg-pickerEmpty' }, t('consultantLoading')));
        return rows;
      }
      if (catalog.status === 'error') {
        rows.push(h('div', { key: 'error', className: 'sudg-pickerEmpty' }, t('consultantError') + ' · ' + textOf(catalog.error)));
        return rows;
      }
      var visible = [];
      var groups = Array.isArray(catalog.groups) ? catalog.groups : [];
      for (var index = 0; index < groups.length; index += 1) {
        var group = groups[index];
        var models = Array.isArray(group.models) ? group.models : [];
        var providerLabel = textOf(group.name) || textOf(group.id);
        var matched = [];
        for (var m = 0; m < models.length; m += 1) {
          var model = models[m];
          var modelName = textOf(model.name) || textOf(model.id);
          var haystack = (providerLabel + ' ' + modelName + ' ' + textOf(group.id) + ' ' + textOf(model.id)).toLowerCase();
          if (needle === '' || haystack.includes(needle)) {
            matched.push({ provider: textOf(group.id), model: textOf(model.id), label: modelName });
          }
        }
        if (matched.length > 0) visible.push({ providerLabel: providerLabel, models: matched });
      }
      if (visible.length === 0) rows.push(h('div', { key: 'empty', className: 'sudg-pickerEmpty' }, t('consultantEmpty')));
      visible.forEach(function (entry) {
        rows.push(h('div', { key: 'g:' + entry.providerLabel, className: 'sudg-pickerGroup' }, entry.providerLabel));
        entry.models.forEach(function (item) {
          var id = item.provider + '/' + item.model;
          var current = id === textOf(options.value);
          rows.push(
            h(
              'button',
              {
                key: id,
                type: 'button',
                className: 'sudg-item',
                role: 'menuitemradio',
                'aria-checked': current ? 'true' : 'false',
                onClick: function () {
                  options.onPick(item);
                },
              },
              h('span', { className: 'sudg-itemLabel' }, item.label),
              current ? h(Check) : null,
            ),
          );
        });
      });
      return rows;
    }

    /**
     * A model picker fed by the same Host catalog the composer's model menu
     * uses, so it shows exactly the providers and models this DSH has
     * configured (add a provider and it appears; remove it and it is gone).
     * @param props - label, current `provider/model`, loader, choose, optional clear.
     */
    function ModelPicker(props) {
      var t = props.t;
      var openState = react.useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      var catalogState = react.useState({ status: 'idle', groups: [], error: null });
      var catalog = catalogState[0];
      var setCatalog = catalogState[1];
      var queryState = react.useState('');
      var query = queryState[0];
      var setQuery = queryState[1];
      var boxState = react.useState(null);
      var box = boxState[0];
      var setBox = boxState[1];
      var root = react.useRef(null);

      react.useEffect(
        function () {
          if (!open) return undefined;
          var onDown = function (event) {
            var node = root.current;
            if (node !== null && node.contains(event.target)) return;
            setOpen(false);
          };
          var onKey = function (event) {
            if (event.key === 'Escape') setOpen(false);
          };
          document.addEventListener('mousedown', onDown, true);
          document.addEventListener('keydown', onKey, true);
          return function () {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey, true);
          };
        },
        [open],
      );

      var toggle = function () {
        if (open) {
          setOpen(false);
          return;
        }
        var node = root.current;
        if (node === null || typeof node.getBoundingClientRect !== 'function') return;
        var rect = node.getBoundingClientRect();
        var viewWidth = window.innerWidth || 1024;
        var viewHeight = window.innerHeight || 768;
        setBox({
          left: Math.max(8, Math.min(rect.left, viewWidth - 330)),
          top: Math.max(8, Math.min(rect.bottom + 4, viewHeight - 340)),
        });
        setOpen(true);
        setQuery('');
        setCatalog({ status: 'loading', groups: [], error: null });
        props.load().then(
          function (catalogValue) {
            setCatalog({
              status: 'ready',
              groups: catalogValue !== null && catalogValue !== undefined && Array.isArray(catalogValue.groups) ? catalogValue.groups : [],
              error: null,
            });
          },
          function (error) {
            setCatalog({ status: 'error', groups: [], error: String(error && error.message ? error.message : error) });
          },
        );
      };

      var rows = modelRows({
        t: t,
        catalog: catalog,
        query: query,
        value: props.value,
        onPick: function (item) {
          setOpen(false);
          props.choose(item.provider, item.model);
        },
      });
      if (props.clear !== undefined) {
        rows.push(
          h(
            'button',
            {
              key: 'clear',
              type: 'button',
              className: 'sudg-pickerClear',
              onClick: function () {
                setOpen(false);
                props.clear();
              },
            },
            t('consultantClear'),
          ),
        );
      }

      return h(
        'div',
        { className: 'sudg-cfgField', ref: root },
        h('span', { className: 'sudg-cfgLabel' }, props.label),
        h(
          'button',
          {
            type: 'button',
            className: 'sudg-cfgInput sudg-pickerBtn',
            onClick: toggle,
            'aria-haspopup': 'listbox',
            'aria-expanded': open ? 'true' : 'false',
          },
          h('span', { className: 'sudg-pickerValue' }, textOf(props.value) === '' ? t('consultantPick') : textOf(props.value)),
          h('span', { className: 'sudg-pickerChevron' }, Chevron()),
        ),
        open && box !== null
          ? h(
              'div',
              { className: 'sudg-menu sudg-picker', role: 'listbox', style: { left: box.left + 'px', top: box.top + 'px' } },
              h('input', {
                className: 'sudg-pickerSearch',
                type: 'search',
                value: query,
                placeholder: t('consultantSearch'),
                onChange: function (event) {
                  setQuery(event.target.value);
                },
              }),
              h('div', { className: 'sudg-pickerList' }, rows),
            )
          : null,
      );
    }


    /**
     * The consultant form on this bundle's own page. It reads and writes this
     * plugin's `subagent-depth` entry through the same `configForms` service the
     * chip uses; nothing here touches the shipped Subagent page.
     * @param props - `configForm`, `t`, `commit`, `loadCatalog`, and the owner's `view`.
     */
    function ConsultantPanel(props) {
      var form = props.configForm;
      var t = props.t;
      var subscribe = react.useCallback(
        function (listener) {
          return form.subscribe(listener);
        },
        [form],
      );
      var read = react.useCallback(function () {
        return form.getSnapshot();
      }, [form]);
      var snapshot = react.useSyncExternalStore(subscribe, read);

      // The shipped `subagent` entry carries the global concurrent-subagent
      // limit. It is shown here and kept equal to level1 + level2, so the two
      // pages can never disagree about how many may run.
      var depthForm = props.depthForm;
      var depthSubscribe = react.useCallback(
        function (listener) {
          return depthForm.subscribe(listener);
        },
        [depthForm],
      );
      var depthRead = react.useCallback(function () {
        return depthForm.getSnapshot();
      }, [depthForm]);
      var depthSnapshot = react.useSyncExternalStore(depthSubscribe, depthRead);

      var status = react.useState({ pending: false, failed: false });
      var state = status[0];
      var setState = status[1];

      if (snapshot === undefined || snapshot === null || snapshot.status !== 'ready') return null;

      var value = snapshot.value === undefined || snapshot.value === null ? {} : snapshot.value;
      var enabled = value.consultantEnabled === true;
      var mode = textOf(value.consultantMode) === 'always' ? 'always' : 'smart';
      var globalLimit =
        depthSnapshot !== undefined && depthSnapshot !== null && depthSnapshot.status === 'ready' && depthSnapshot.value !== null && depthSnapshot.value !== undefined
          ? Number(depthSnapshot.value.maxActiveSubagents)
          : undefined;
      var depthValue =
        depthSnapshot !== undefined && depthSnapshot !== null && depthSnapshot.status === 'ready' && depthSnapshot.value !== null && depthSnapshot.value !== undefined
          ? Number(depthSnapshot.value.maxDepth)
          : undefined;
      var depth = Number.isFinite(depthValue) ? depthValue : undefined;

      var commitOps = function (ops) {
        setState({ pending: true, failed: false });
        return Promise.resolve(props.commit(ops)).then(
          function (accepted) {
            setState({ pending: false, failed: accepted === false });
            return accepted !== false;
          },
          function () {
            setState({ pending: false, failed: true });
            return false;
          },
        );
      };

      /** Merge one field into a copy of the settings, for the derived limit. */
      var withField = function (field, next) {
        var copy = {};
        for (var key in value) if (Object.prototype.hasOwnProperty.call(value, key)) copy[key] = value[key];
        copy[field] = next;
        return copy;
      };

      /**
       * Push the derived ceiling after a settings change made here. The built-in
       * page's number is a projection of depth + levels + consultants; this is
       * the only writer of it.
       */
      var syncGlobal = function (merged) {
        if (depth === undefined) return;
        props.commitGlobal([{ op: 'set', path: ['maxActiveSubagents'], value: Math.max(1, derivedLimit(depth, safe1, safe2, merged)) }]);
      };

      var write = function (field, next) {
        return commitOps([{ op: 'set', path: [field], value: next }]).then(function (accepted) {
          if (accepted) syncGlobal(withField(field, next));
          return accepted;
        });
      };

      var chooseRoute = function (prefix, provider, model) {
        var merged = withField(prefix + 'Provider', provider);
        merged[prefix + 'Model'] = model;
        return commitOps([
          { op: 'set', path: [prefix + 'Provider'], value: provider },
          { op: 'set', path: [prefix + 'Model'], value: model },
        ]).then(function (accepted) {
          if (accepted) syncGlobal(merged);
          return accepted;
        });
      };

      if (props.view === 'summary') {
        return h('span', { className: 'sudg-cfgSummary' }, t('consultantTitle') + ' · ' + (enabled ? 'ON' : 'OFF'));
      }

      var level = function (index, title) {
        var provider = textOf(value['consultant' + index + 'Provider']);
        var model = textOf(value['consultant' + index + 'Model']);
        return h(
          'div',
          { className: 'sudg-cfgCard' },
          h('span', { className: 'sudg-cfgLabel' }, title),
          h(ModelPicker, {
            t: t,
            label: t('consultantModel'),
            value: provider === '' || model === '' ? '' : provider + '/' + model,
            load: props.loadCatalog,
            choose: function (nextProvider, nextModel) {
              chooseRoute('consultant' + index, nextProvider, nextModel);
            },
          }),
        );
      };

      var modeButton = function (id, label) {
        return h(
          'button',
          {
            type: 'button',
            className: 'sudg-mode',
            'aria-pressed': mode === id ? 'true' : 'false',
            onClick: function () {
              if (mode !== id) write('consultantMode', id);
            },
          },
          label,
        );
      };

      var level1 = value.level1 === undefined || value.level1 === null ? 5 : Number(value.level1);
      var level2 = value.level2 === undefined || value.level2 === null ? 8 : Number(value.level2);
      var safe1 = Number.isFinite(level1) ? level1 : 0;
      var safe2 = Number.isFinite(level2) ? level2 : 0;
      // Effective levels: without level-1 workers there cannot be level-2
      // workers, and a depth of 0 or 1 cannot reach level 2 at all. The stored
      // numbers are kept, but only what is reachable counts.
      var eff1 = depth !== undefined && depth >= 1 ? safe1 : 0;
      var eff2 = depth !== undefined && depth >= 2 && eff1 > 0 ? safe2 : 0;
      var level2Reachable = depth !== undefined && depth >= 2 && eff1 > 0;
      var consultants = depth === undefined ? 0 : consultantCount(depth, eff1, eff2, value);
      var target = depth === undefined ? undefined : derivedLimit(depth, eff1, eff2, value);

      /**
       * Change one level and keep the shipped global limit equal to the derived
       * ceiling (workers at this depth plus the consultants that can advise them).
       */
      var commitLevel = function (field, next) {
        var next1 = field === 'level1' ? next : eff1;
        var next2 = field === 'level2' ? next : eff2;
        // The dependency is absolute: no level-1 workers, no level-2 workers.
        if (next1 === 0) next2 = 0;
        commitOps([{ op: 'set', path: [field], value: next }]).then(function (accepted) {
          if (!accepted || depth === undefined) return;
          var merged = withField(field, next);
          props.commitGlobal([{ op: 'set', path: ['maxActiveSubagents'], value: Math.max(1, derivedLimit(depth, next1, next2, merged)) }]);
        });
      };

      /**
       * Reconcile the shipped global limit with the table and the depth. A lower
       * global is honoured by shrinking level 2 first, then level 1; a higher one
       * is simply lowered to the derived ceiling.
       */
      var recalcQuota = function () {
        if (depth === undefined || !Number.isFinite(globalLimit)) return;
        var l1 = eff1;
        var l2 = eff2;
        for (var guard = 0; guard < 64; guard += 1) {
          if (derivedLimit(depth, l1, l2, value) <= globalLimit) break;
          if (l2 > 0) l2 -= 1;
          else if (l1 > 0) l1 -= 1;
          else break;
        }
        if (l1 === 0) l2 = 0;
        var ops = [];
        if (l1 !== safe1) ops.push({ op: 'set', path: ['level1'], value: l1 });
        if (l2 !== safe2) ops.push({ op: 'set', path: ['level2'], value: l2 });
        var merged = withField('level1', l1);
        merged.level2 = l2;
        var nextTarget = Math.max(1, derivedLimit(depth, l1, l2, merged));
        var finish = function () {
          if (nextTarget !== globalLimit) props.commitGlobal([{ op: 'set', path: ['maxActiveSubagents'], value: nextTarget }]);
        };
        if (ops.length === 0) finish();
        else commitOps(ops).then(function (accepted) { if (accepted) finish(); });
      };

      var writtenTarget = target === undefined ? undefined : Math.max(1, target);
      var mismatch = Number.isFinite(globalLimit) && writtenTarget !== undefined && globalLimit !== writtenTarget;

      var quota = h(
        'section',
        { className: 'sudg-cfg' },
        h('div', { className: 'sudg-cfgHead' }, h('span', { className: 'sudg-cfgTitle' }, t('quotaTitle'))),
        h('p', { className: 'sudg-cfgHint' }, t('quotaLegend')),
        h(
          'div',
          { className: 'sudg-quota' },
          h(
            'div',
            { className: 'sudg-quotaRow' },
            h('span', { className: 'sudg-quotaLabel' }, t('quotaLevel0')),
            h('span', { className: 'sudg-quotaFixed' }, t('quotaFixed')),
          ),
          h(
            'div',
            { className: 'sudg-quotaRow' },
            h('span', { className: 'sudg-quotaLabel' }, t('quotaLevel1')),
            h(NumberField, {
              value: safe1,
              commit: function (next) {
                commitLevel('level1', next);
              },
            }),
          ),
          h(
            'div',
            { className: 'sudg-quotaRow' },
            h('span', { className: 'sudg-quotaLabel' }, t('quotaLevel2')),
            h(NumberField, {
              value: eff2,
              disabled: !level2Reachable,
              commit: function (next) {
                commitLevel('level2', next);
              },
            }),
          ),
          h(
            'div',
            { className: 'sudg-quotaRow' },
            h('span', { className: 'sudg-quotaLabel' }, t('quotaGlobal')),
            h(
              'span',
              { className: 'sudg-quotaFixed', 'data-mismatch': mismatch ? 'true' : undefined },
              (Number.isFinite(globalLimit) ? String(globalLimit) : '—') + ' / ' + (target === undefined ? '—' : target === 0 ? '0（内置最小 1）' : String(writtenTarget)),
            ),
          ),
          mismatch
            ? h(
                'div',
                { className: 'sudg-quotaRow' },
                h('span', { className: 'sudg-quotaLabel' }, t('quotaMismatch')),
                h('button', { type: 'button', className: 'sudg-mode', onClick: recalcQuota }, t('quotaRecalc')),
              )
            : null,
        ),
        h(
          'p',
          { className: 'sudg-cfgHint' },
          t('quotaTotalPrefix') +
            ' ' +
            (depth === undefined ? '—' : String(eff1 + eff2)) +
            ' ' +
            t('quotaWorkers') +
            ' + ' +
            String(consultants) +
            ' ' +
            t('quotaConsultants') +
            ' = ' +
            (target === undefined ? '—' : String(target)) +
            ' ' +
            t('quotaTotalSuffix') +
            ' ' +
            t('quotaConsultantNote'),
        ),
      );

      return h(
        react.Fragment,
        null,
        quota,
        h(
        'section',
        { className: 'sudg-cfg' },
        h(
          'div',
          { className: 'sudg-cfgHead' },
          h('span', { className: 'sudg-cfgTitle' }, t('consultantTitle')),
          h(
            'div',
            { className: 'sudg-cfgRow' },
            h('span', { className: 'sudg-cfgLabel' }, t('consultantEnabled')),
            h(
              'button',
              {
                type: 'button',
                role: 'switch',
                className: 'sudg-switch',
                'aria-checked': enabled ? 'true' : 'false',
                'aria-label': t('consultantEnabled'),
                onClick: function () {
                  write('consultantEnabled', !enabled);
                },
              },
              h('i'),
            ),
          ),
        ),
        h('p', { className: 'sudg-cfgHint' }, t('consultantHint')),
        h('div', { className: 'sudg-cfgGrid' }, level(0, t('consultantLevel0')), level(1, t('consultantLevel1'))),
        h(
          'div',
          { className: 'sudg-cfgRow' },
          h('span', { className: 'sudg-cfgLabel' }, t('consultantMode')),
          h('div', { className: 'sudg-cfgModes' }, modeButton('smart', t('consultantModeSmart')), modeButton('always', t('consultantModeAlways'))),
        ),
        h('p', { className: 'sudg-cfgHint' }, t('consultantScreenerNote')),
        h(
          'span',
          { className: 'sudg-cfgStatus', 'data-failed': state.failed ? 'true' : undefined },
          state.pending ? t('busy') : state.failed ? t('failed') : '',
        ),
        ),
      );
    }


    /** Insert this plugin's stylesheet and return its removal. */
    function installStyles() {
      if (typeof document === 'undefined') return function () {};
      var tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-subagent-depth';
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return function () {
        tag.remove();
      };
    }

    exports.inject = ['slots', 'locale', 'configForms', 'remote', 'remote.session', 'remote.settings'];
    exports.apply = function apply(ctx) {
      try {
        var t = ctx.locale.bind(I18N);
        ctx.effect(function () {
          return ctx.locale.register(I18N, { zh: zh, en: en });
        }, 'subagent-depth: dictionaries');
        ctx.effect(installStyles, 'dsh-subagent-depth: stylesheet');

        var form = ctx.configForms.get(NAMESPACE);
        var ownForm = ctx.configForms.get(OWN_NAMESPACE);

        /**
         * The Host's global model catalog — the same one the composer's model
         * menu reads — so the pickers list exactly the providers and models
         * configured in this DSH. Fetched per open, sharing one in-flight call.
         */
        var catalog = { inflight: null };
        var loadCatalog = function () {
          if (catalog.inflight !== null) return catalog.inflight;
          var operation = Promise.resolve(ctx.remote.session.modelCatalog())
            .then(function (response) {
              if (response === undefined || response === null || response.ok === false) {
                throw new Error(
                  response && response.error
                    ? textOf(response.error.code) + ': ' + textOf(response.error.message)
                    : 'model catalog unavailable',
                );
              }
              return response.value;
            })
            .finally(function () {
              if (catalog.inflight === operation) catalog.inflight = null;
            });
          catalog.inflight = operation;
          return operation;
        };

        /**
         * Read the namespace's current revision straight from the Host. The
         * shared mirror can lag behind a write made from another surface, and a
         * stale revision is exactly what turned a click into "Not saved".
         */
        var freshRevision = function (namespace) {
          var settings = ctx.remote && ctx.remote.settings;
          if (!settings || typeof settings.describe !== 'function') return Promise.resolve(undefined);
          return Promise.resolve(settings.describe()).then(
            function (response) {
              if (!response || response.ok === false) return undefined;
              var view = response.value;
              var rows = view && Array.isArray(view.namespaces) ? view.namespaces : [];
              for (var index = 0; index < rows.length; index += 1) {
                if (rows[index].ns === namespace) return rows[index].revision;
              }
              return undefined;
            },
            function () {
              return undefined;
            },
          );
        };

        /**
         * Write fields with a freshly read revision, retrying once after a
         * conflict. The generated Remote requires the revision argument; the
         * Host skips the check only when it receives `undefined`.
         */
        var commit = function (namespace, ops) {
          var send = function (revision) {
            var settings = ctx.remote && ctx.remote.settings;
            if (settings && typeof settings.mutate === 'function') {
              return Promise.resolve(settings.mutate(namespace, ops, revision)).then(
                function (result) {
                  return !(result && result.ok === false);
                },
                function () {
                  return false;
                },
              );
            }
            var target = namespace === NAMESPACE ? form : ownForm;
            return target.mutate(ops, revision);
          };
          var attempt = function (remaining) {
            return freshRevision(namespace).then(function (revision) {
              return send(revision).then(function (accepted) {
                if (accepted !== false) return true;
                return remaining > 0 ? attempt(remaining - 1) : false;
              });
            });
          };
          return attempt(1);
        };

        var face = {
          form: form,
          ownForm: ownForm,
          t: t,
          commit: function (ops) {
            return commit(NAMESPACE, ops);
          },
          commitGlobal: function (ops) {
            return commit(NAMESPACE, ops);
          },
          commitOwn: function (ops) {
            return commit(OWN_NAMESPACE, ops);
          },
          loadCatalog: loadCatalog,
        };

        ctx.effect(function () {
          return ctx.configForms.whileServed([NAMESPACE], function () {
            return ctx.slots.register(
              {
                name: SLOT,
                id: 'subagent-depth',
                order: 10,
                locale: I18N,
                label: function () {
                  return t('title');
                },
                inject: function () {
                  return face;
                },
              },
              function ComposerDepthControl(props) {
                return h(ErrorBoundary, null, h(DepthControl, props));
              },
            );
          });
        }, 'subagent-depth: composer control');

        // The bundle page's own configuration seat: the only place the
        // consultant fields can be edited. A failing page must not take the
        // composer control down with it, so this registration is isolated.
        try {
          var ownFace = {
            configForm: ownForm,
            depthForm: form,
            t: t,
            commit: function (ops) {
              return commit(OWN_NAMESPACE, ops);
            },
            commitGlobal: function (ops) {
              return commit(NAMESPACE, ops);
            },
            loadCatalog: loadCatalog,
          };
          ctx.effect(function () {
            return ctx.configForms.whileServed([OWN_NAMESPACE], function () {
              return ctx.slots.register(
                {
                  name: CONFIG_SLOT,
                  key: 'dsh-subagent-depth',
                  locale: I18N,
                  label: function () {
                    return t('consultantTitle');
                  },
                  inject: function () {
                    return ownFace;
                  },
                },
                function BundleConfigSlot(props) {
                  return h(ErrorBoundary, null, h(ConsultantPanel, props));
                },
              );
            });
          }, 'subagent-depth: consultant settings');
        } catch (pageError) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[dsh-subagent-depth] failed to mount the settings page:', pageError);
          }
        }
      } catch (error) {
        // A plugin that cannot mount must not take the composer with it.
        if (typeof console !== 'undefined' && console.error) {
          console.error('[dsh-subagent-depth] failed to mount:', error);
        }
      }
    };

    return module.exports;
  },
});