// dsh-prompt-optimized — one-click, in-place prompt optimization.
//
// The Host half (index.js) registers the `prompt-optimizer` skill and serves the
// `/prompt-optimizer` connection channel. This Client half puts a compact button at
// the left of the composer tool row: clicking it sends the current draft to the Host,
// waits for the model to return the optimized prompt, and writes the result straight
// back into the composer. Nothing is submitted and no chat message is created — the
// user keeps editing, then sends it themselves.

window.__ModuleLoader__.load({
  id: 'dsh-prompt-optimized',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'prompt-optimizer';
    const CHANNEL = '/prompt-optimizer';
    const CALL_TIMEOUT_MS = 200000;

    const zh = {
      label: '一键优化',
      busy: '优化中…',
      hint: '把输入框里的草稿优化成可直接使用的提示词文字（分段、无标题），写回输入框，不发送',
      emptyHint: '先在输入框写下提示词，再点「一键优化」',
      errorLabel: '优化失败，重试',
    };
    const en = {
      label: 'One-click optimize',
      busy: 'Optimizing…',
      hint: 'Turn the draft into a ready-to-use prompt written as plain paragraphs (no headings), in place; nothing is sent',
      emptyHint: 'Write your prompt in the composer first, then click optimize',
      errorLabel: 'Optimization failed, retry',
    };

    const styles = [
      '.dsh-po-trigger{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;',
      'font:inherit;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary);',
      'background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;',
      'cursor:pointer;transition:color .12s ease,background-color .12s ease,border-color .12s ease}',
      '.dsh-po-trigger:hover:not(:disabled){color:var(--dsw-alias-label-primary);',
      'background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-po-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-po-trigger:disabled{opacity:.5;cursor:default}',
      '.dsh-po-trigger[data-error="true"]{color:var(--dsw-alias-label-secondary);',
      'border-color:var(--dsw-alias-border-l2)}',
      '.dsh-po-trigger svg{flex:none}',
      '.dsh-po-spinner{width:12px;height:12px;border-radius:50%;flex:none;',
      'border:1.5px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);',
      'animation:dsh-po-spin .8s linear infinite}',
      '@keyframes dsh-po-spin{to{transform:rotate(360deg)}}',
    ].join('');

    let translate = (key) => key;
    let callHost = () => Promise.reject(new Error('the optimization channel is unavailable'));

    /** Unwrap the connection RPC envelope, or throw the remote message. */
    function unwrap(result) {
      if (result && result.ok === true) return result.value;
      const error = result && result.error;
      const message = error && typeof error.message === 'string' && error.message !== ''
        ? error.message
        : 'the optimization request failed';
      throw new Error(message);
    }

    function Trigger(props) {
      const inputActions = props.inputActions;
      const sessionId = props.sessionId;
      const draft = props.useInput((state) => state.draft) || '';
      const phase = props.useInput((state) => state.phase);
      const busy = phase === 'adjudicating' || phase === 'submitting';
      const empty = String(draft).trim() === '';
      const [optimizing, setOptimizing] = React.useState(false);
      const [failure, setFailure] = React.useState('');

      const disabled = busy || optimizing || empty;
      const label = optimizing ? translate('busy') : failure ? translate('errorLabel') : translate('label');
      const title = failure ? failure : empty ? translate('emptyHint') : translate('hint');

      const onClick = () => {
        if (disabled) return;
        const text = String(draft).trim();
        if (text === '') return;
        setFailure('');
        setOptimizing(true);
        const timer = new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error('the model did not answer in time')), CALL_TIMEOUT_MS);
        });
        Promise.race([Promise.resolve().then(() => callHost('optimize', { text, sessionId })), timer])
          .then((result) => {
            const value = unwrap(result);
            const optimized = value && typeof value.text === 'string' ? value.text : '';
            if (optimized.trim() === '') throw new Error('the model returned an empty result');
            // Write the result back into the composer; the user reviews and sends it.
            inputActions.setDraft(optimized);
          })
          .catch((reason) => {
            const message = reason && reason.message ? reason.message : String(reason);
            setFailure(message);
            console.error('[prompt-optimizer] optimize failed:', reason);
          })
          .finally(() => setOptimizing(false));
      };

      const icon = optimizing
        ? h('span', { key: 'spinner', className: 'dsh-po-spinner', 'aria-hidden': true })
        : h(
            'svg',
            {
              key: 'icon',
              width: 13,
              height: 13,
              viewBox: '0 0 16 16',
              'aria-hidden': true,
              focusable: false,
            },
            h('path', {
              fill: 'currentColor',
              d: 'M7.25 1.5a.75.75 0 0 1 .75.75v1.1l.77-.44a.75.75 0 1 1 .75 1.3l-.77.44.77.44a.75.75 0 1 1-.75 1.3l-.77-.44v1.1a.75.75 0 0 1-1.5 0v-1.1l-.77.44a.75.75 0 1 1-.75-1.3l.77-.44-.77-.44a.75.75 0 1 1 .75-1.3l.77.44v-1.1a.75.75 0 0 1 .75-.75Zm5.5 6.5a.6.6 0 0 1 .6.6v.62l.43-.25a.6.6 0 0 1 .6 1.04l-.43.25.43.25a.6.6 0 0 1-.6 1.04l-.43-.25v.62a.6.6 0 0 1-1.2 0v-.62l-.43.25a.6.6 0 0 1-.6-1.04l.43-.25-.43-.25a.6.6 0 0 1 .6-1.04l.43.25v-.62a.6.6 0 0 1 .6-.6Zm-6.4 3.3a.6.6 0 0 1 .6.6v.62l.43-.25a.6.6 0 0 1 .6 1.04l-.43.25.43.25a.6.6 0 0 1-.6 1.04l-.43-.25v.62a.6.6 0 0 1-1.2 0v-.62l-.43.25a.6.6 0 0 1-.6-1.04l.43-.25-.43-.25a.6.6 0 0 1 .6-1.04l.43.25v-.62a.6.6 0 0 1 .6-.6Z',
            }),
          );

      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-po-trigger',
          disabled,
          title,
          'aria-label': title,
          'aria-busy': optimizing || undefined,
          'data-error': failure ? 'true' : undefined,
          onClick,
        },
        icon,
        h('span', { key: 'label' }, label),
      );
    }

    return {
      inject: ['slots', 'locale', 'connection'],
      apply(ctx) {
        const bound = ctx.locale.bind(NS);
        translate = (key) => {
          const value = bound(key);
          return typeof value === 'string' && value !== '' ? value : key;
        };
        const connection = ctx.get('connection');
        const rpc = connection && connection.rpc;
        if (rpc && typeof rpc.call === 'function') {
          callHost = (endpoint, payload) => rpc.call(CHANNEL, endpoint, payload);
        } else {
          console.warn('[prompt-optimizer] connection RPC is unavailable; one-click optimize is disabled');
        }
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'prompt-optimizer: zh copy');
        ctx.effect(() => ctx.locale.register(NS, 'en', en), 'prompt-optimizer: en copy');
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'prompt-optimizer',
              order: 20,
              label: () => translate('label'),
            },
            Trigger,
          ),
        );
      },
    };
  },
});
