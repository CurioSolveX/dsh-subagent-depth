/**
 * Browser half of `dsh-subagent-depth` — the "tree depth" control.
 *
 * One compact chip in `conversation.input.left`, the left end of the composer
 * tool row, beside the permission and model controls. It shows the maximum
 * Subagent recursion depth and selects 0, 1, or 2 from a menu that opens above
 * it, the way every other chip in that row behaves.
 *
 * The value is an upper bound, not a command: the agent still decides per task
 * whether delegating is worthwhile. 0 disables Subagents entirely, 1 allows
 * only the main agent to create them, 2 lets a Subagent create one more level.
 *
 * The control owns no state of its own: it reads and writes the shipped
 * `subagent` settings namespace through the client `configForms` service, the
 * same one the Settings page uses. That keeps one owner of `maxDepth`, so the
 * Settings page and this control can never disagree, and the Host still writes
 * the value into the profile patch through the normal Loader path.
 *
 * Three deliberate matches to the permission chip beside it:
 *   - a native `select` is not used; the OS dropdown it opens cannot be styled
 *     and would look nothing like the row's other menus;
 *   - the chip carries a chevron, hover background, and pointer cursor;
 *   - menu rows highlight on hover and the current level carries a tick.
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
    /** Menu width; wide enough for the longest level description. */
    var MENU_WIDTH = 200;

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
      '.sudg-root{display:inline-flex;align-items:center;gap:6px;height:28px;',
      'padding:0 8px;border:0;border-radius:8px;background:transparent;',
      'color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;',
      'line-height:1;white-space:nowrap;cursor:pointer;user-select:none;',
      'outline:none;}',
      '.sudg-root:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.sudg-root:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);}',
      '.sudg-root[data-open="true"]{background:var(--dsw-alias-bg-layer-2);}',
      '.sudg-root[data-failed="true"]{color:var(--dsw-alias-state-error-primary);}',
      '.sudg-chevron{flex:none;opacity:.7;transition:transform .12s ease;}',
      '.sudg-root[data-open="true"] .sudg-chevron{transform:rotate(180deg);}',
      '.sudg-menu{position:fixed;z-index:2147483000;box-sizing:border-box;',
      'padding:6px;border-radius:12px;border:.5px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 32px rgba(0,0,0,.45);}',
      '.sudg-item{display:flex;align-items:center;gap:8px;padding:7px 10px;',
      'border-radius:8px;color:var(--dsw-alias-label-primary);font-size:13px;',
      'line-height:1.25;cursor:pointer;}',
      '.sudg-item:hover,.sudg-item[data-active="true"]{background:var(--dsw-alias-bg-layer-2);}',
      '.sudg-num{flex:none;width:10px;text-align:right;opacity:.55;',
      'font-variant-numeric:tabular-nums;}',
      '.sudg-label{flex:1 1 auto;white-space:nowrap;}',
      '.sudg-check{flex:none;opacity:0;color:var(--dsw-alias-brand-primary);}',
      '.sudg-item[data-current="true"] .sudg-check{opacity:1;}',
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

    /** Small downward chevron marking that this chip opens a menu. */
    function Chevron() {
      return h(
        'svg',
        {
          className: 'sudg-chevron',
          width: 10,
          height: 10,
          viewBox: '0 0 10 10',
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M2 3.5 L5 6.5 L8 3.5',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Check mark marking the current level inside the menu. */
    function Check() {
      return h(
        'svg',
        { className: 'sudg-check', width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true' },
        h('path', {
          d: 'M2.5 6.2 L4.9 8.6 L9.5 3.6',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
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

      // Close on any press outside the control, and on Escape.
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
        var left = Math.max(8, Math.min(rect.left, viewWidth - MENU_WIDTH - 8));
        // The menu opens upward, like every other menu in this row.
        setMenuBox({ left: left, bottom: (window.innerHeight || 768) - rect.top + 6 });
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

      var chip = h(
        'div',
        {
          ref: root,
          className: 'sudg-root',
          role: 'button',
          tabIndex: 0,
          'data-open': open ? 'true' : 'false',
          'data-failed': state.failed ? 'true' : 'false',
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': t('title') + ': ' + depth,
          title: t('title') + ' · ' + depth + ' ' + levelText(t, depth),
          onClick: toggle,
          onKeyDown: function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggle();
            }
          },
        },
        h('span', null, state.failed ? t('failed') : state.pending ? t('busy') : t('name')),
        h('span', { className: 'sudg-num', style: { width: 'auto', opacity: 1 } }, String(depth)),
        h(Chevron),
      );

      if (!open) return chip;

      var menu = h(
        'div',
        {
          className: 'sudg-menu',
          role: 'menu',
          style: {
            left: menuBox.left + 'px',
            bottom: menuBox.bottom + 'px',
            minWidth: MENU_WIDTH + 'px',
          },
        },
        options.map(function (option) {
          return h(
            'div',
            {
              key: String(option),
              className: 'sudg-item',
              role: 'menuitemradio',
              'aria-checked': option === depth ? 'true' : 'false',
              'data-current': option === depth ? 'true' : 'false',
              onClick: function () {
                choose(option);
              },
            },
            h('span', { className: 'sudg-num' }, String(option)),
            h('span', { className: 'sudg-label' }, levelText(t, option) || String(option)),
            h(Check),
          );
        }),
      );

      return h(react.Fragment, null, chip, menu);
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
