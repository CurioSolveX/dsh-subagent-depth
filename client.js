/**
 * Browser half of `dsh-subagent-depth`.
 *
 * One compact control in `conversation.input.left` — the left end of the
 * composer tool row, beside the permission and model controls. It shows the
 * maximum Subagent recursion depth and selects 0, 1, or 2.
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
 * Typography matches the neighbouring permission chip: 13px, primary label
 * colour, no border. The explanation appears below-right on hover, styled like
 * a dropdown panel, and the select menu itself is the one that opens upward.
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
    /** The depths offered by the selector, in display order. */
    var CHOICES = [0, 1, 2];
    /** Hover delay before the explanation appears, in milliseconds. */
    var HOVER_DELAY = 500;
    /** Panel width, matching the width of the shipped dropdown surfaces. */
    var TIP_WIDTH = 216;

    var en = {
      name: 'Tree depth',
      title: 'Maximum subagent depth',
      hint: 'A ceiling, not an instruction: the agent still decides whether to delegate.',
      level0: 'Off',
      level1: 'Main agent only',
      level2: 'One level of children',
      busy: 'Saving…',
      failed: 'Not saved',
    };
    var zh = {
      name: '树深阈',
      title: '最大子代理深度',
      hint: '上限而非指令：派不派、派几层，仍由 Agent 自己决定。',
      level0: '禁用子智能体',
      level1: '仅主 Agent 可派',
      level2: '可递归一层',
      busy: '保存中…',
      failed: '未保存',
    };

    // Metrics measured from the neighbouring permission chip in the same row:
    // 13px label, primary label colour, no border, 8px hover radius.
    var CSS = [
      '.sudg-root{position:relative;display:inline-flex;align-items:center;gap:4px;',
      'min-width:0;height:28px;padding:0 6px;border:0;border-radius:8px;',
      'background:transparent;color:var(--dsw-alias-label-primary);',
      'font:inherit;font-size:13px;line-height:1;white-space:nowrap;}',
      '.sudg-root:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.sudg-name{pointer-events:none;}',
      '.sudg-select{appearance:none;-webkit-appearance:none;background:transparent;',
      'border:0;border-radius:5px;padding:2px;cursor:pointer;outline:none;',
      'color:inherit;font:inherit;font-size:13px;line-height:1;',
      'font-variant-numeric:tabular-nums;}',
      '.sudg-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);',
      'outline-offset:1px;}',
      '.sudg-select:disabled{cursor:default;opacity:.55;}',
      '.sudg-select>option{background:var(--dsw-alias-bg-overlay);',
      'color:var(--dsw-alias-label-primary);}',
      '.sudg-root[data-depth="2"] .sudg-select{color:var(--dsw-alias-brand-primary);}',
      '.sudg-root[data-failed="true"] .sudg-name{color:var(--dsw-alias-state-error-primary);}',
      '.sudg-tip{position:fixed;z-index:2147483000;box-sizing:border-box;',
      'white-space:normal;padding:6px;border-radius:12px;',
      'border:.5px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 10px 30px rgba(0,0,0,.42);font-size:13px;line-height:1.45;',
      'pointer-events:none;}',
      '.sudg-tip-row{display:flex;align-items:center;gap:8px;padding:5px 8px;',
      'border-radius:8px;color:var(--dsw-alias-label-primary);}',
      '.sudg-tip-row[data-current="true"]{background:var(--dsw-alias-bg-layer-2);}',
      '.sudg-tip-num{width:10px;flex:none;text-align:right;',
      'font-variant-numeric:tabular-nums;opacity:.6;}',
      '.sudg-tip-mark{margin-left:auto;flex:none;opacity:.9;}',
      '.sudg-tip-hint{margin:4px 2px 2px;padding:8px 8px 4px;',
      'border-top:.5px solid var(--dsw-alias-border-l1);',
      'color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;}',
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
     * Localized meaning of one depth; empty for values this control does not
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

    /**
     * The explanation panel. Placed below-right of the control, fixed to the
     * viewport so the composer's own overflow cannot clip it. The select menu
     * is the surface that opens upward; this one never does.
     * @param props - anchor rectangle and copy.
     */
    function Tip(props) {
      var anchor = props.anchor;
      var viewWidth = typeof window === 'undefined' ? 1024 : window.innerWidth || 1024;
      var viewHeight = typeof window === 'undefined' ? 768 : window.innerHeight || 768;
      // Anchored to the control's left edge so it expands to the lower right,
      // dragged back inside the viewport when the control sits near the edge.
      var left = Math.max(8, Math.min(anchor.left, viewWidth - TIP_WIDTH - 8));
      var top = anchor.bottom + 8;
      // If it cannot fit below, flip above rather than run off-screen.
      var place = top;
      if (top + 150 > viewHeight - 8) place = Math.max(8, anchor.top - 8 - 150);
      var rows = CHOICES.map(function (option) {
        var current = option === props.depth;
        return h(
          'div',
          {
            key: String(option),
            className: 'sudg-tip-row',
            'data-current': current ? 'true' : 'false',
          },
          h('span', { className: 'sudg-tip-num' }, String(option)),
          h('span', null, levelText(props.t, option)),
          current ? h('span', { className: 'sudg-tip-mark' }, '✓') : null,
        );
      });
      return h(
        'div',
        {
          className: 'sudg-tip',
          role: 'tooltip',
          style: { left: left + 'px', top: place + 'px', width: TIP_WIDTH + 'px' },
        },
        rows,
        h('div', { className: 'sudg-tip-hint' }, props.t('hint')),
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

      var anchor = react.useState(null);
      var tipAnchor = anchor[0];
      var setTipAnchor = anchor[1];
      var root = react.useRef(null);
      var timer = react.useRef(null);

      react.useEffect(function () {
        return function () {
          if (timer.current !== null) clearTimeout(timer.current);
        };
      }, []);

      if (snapshot === undefined || snapshot === null || snapshot.status !== 'ready') return null;

      var depth = resolvedDepth(snapshot);
      var disabled = snapshot.writable === false || state.pending;
      // A profile may hold a depth this control does not offer; keep it visible
      // instead of silently showing a neighbour.
      var options = CHOICES.indexOf(depth) === -1 ? [depth].concat(CHOICES) : CHOICES;

      var openTip = function () {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(function () {
          var node = root.current;
          if (node === null || typeof node.getBoundingClientRect !== 'function') return;
          setTipAnchor(node.getBoundingClientRect());
        }, HOVER_DELAY);
      };
      var closeTip = function () {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        setTipAnchor(null);
      };

      var change = function (event) {
        var next = Number(event.target.value);
        if (disabled || !isFinite(next) || next === depth) return;
        setState({ pending: true, failed: false });
        Promise.resolve()
          .then(function () {
            return form.set('maxDepth', next);
          })
          .then(function (accepted) {
            setState({ pending: false, failed: accepted === false });
          })
          .catch(function () {
            setState({ pending: false, failed: true });
          });
      };

      return h(
        'label',
        {
          ref: root,
          className: 'sudg-root',
          'data-depth': String(depth),
          'data-failed': state.failed ? 'true' : 'false',
          onMouseEnter: openTip,
          onMouseLeave: closeTip,
          onFocus: openTip,
          onBlur: closeTip,
        },
        h(
          'span',
          { className: 'sudg-name' },
          state.failed ? t('failed') : state.pending ? t('busy') : t('name'),
        ),
        h(
          'select',
          {
            className: 'sudg-select',
            value: String(depth),
            disabled: disabled,
            'aria-label': t('title'),
            onChange: change,
          },
          options.map(function (option) {
            return h('option', { key: String(option), value: String(option) }, String(option));
          }),
        ),
        tipAnchor === null ? null : h(Tip, { anchor: tipAnchor, depth: depth, t: t }),
      );
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
        ctx.effect(installStyles, 'subagent-depth: stylesheet');

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
