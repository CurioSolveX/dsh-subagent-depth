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
    /** Compact controls at the left of the composer tool row. */
    var SLOT = 'conversation.input.left';
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
    };
    var zh = {
      name: '树深阈',
      title: '最大子代理深度',
      level0: '禁用子智能体',
      level1: '仅主 Agent 可派',
      level2: '可递归一层',
      busy: '保存中…',
      failed: '未保存',
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

      var write = react.useState({ pending: false, failed: false });
      var state = write[0];
      var setState = write[1];

      var menuState = react.useState(null);
      var menuBox = menuState[0];
      var setMenuBox = menuState[1];

      var root = react.useRef(null);
      var open = menuBox !== null;

      react.useEffect(
        function () {
          if (!open) return undefined;
          var onPointer = function (event) {
            var node = root.current;
            if (node !== null && node.contains(event.target)) return;
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
        Promise.resolve()
          .then(function () {
            return form.set('maxDepth', option);
          })
          .then(function (accepted) {
            setState({ pending: false, failed: accepted === false });
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

      var menu = h(
        'div',
        {
          className: 'sudg-menu',
          role: 'menu',
          style: { left: menuBox.left + 'px', bottom: menuBox.bottom + 'px' },
        },
        options.map(function (option) {
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
        }),
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

    exports.inject = ['slots', 'locale', 'configForms'];
    exports.apply = function apply(ctx) {
      try {
        var t = ctx.locale.bind(I18N);
        ctx.effect(function () {
          return ctx.locale.register(I18N, { zh: zh, en: en });
        }, 'subagent-depth: dictionaries');
        ctx.effect(installStyles, 'dsh-subagent-depth: stylesheet');

        var form = ctx.configForms.get(NAMESPACE);
        var face = { form: form, t: t };

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
