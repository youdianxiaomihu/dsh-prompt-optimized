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
      updateLabel: '更新 {latest}',
      updateBusy: '更新中…',
      updateDone: '已更新，重启生效',
      updateFailed: '更新失败，点此重试',
      updateHint: '已安装 {installed}，最新 {latest}。点击原地升级，完成后重启 DSH 生效',
      updateFailedHint: '原地升级失败：{error}',
    };
    const en = {
      label: 'One-click optimize',
      busy: 'Optimizing…',
      hint: 'Turn the draft into a ready-to-use prompt written as plain paragraphs (no headings), in place; nothing is sent',
      emptyHint: 'Write your prompt in the composer first, then click optimize',
      errorLabel: 'Optimization failed, retry',
      updateLabel: 'Update {latest}',
      updateBusy: 'Updating…',
      updateDone: 'Updated, restart to apply',
      updateFailed: 'Update failed, retry',
      updateHint: 'Installed {installed}, latest {latest}. Click to update in place, then restart DSH',
      updateFailedHint: 'In-place update failed: {error}',
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
      '.dsh-po-update{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;margin-left:6px;',
      'font:inherit;font-size:12px;line-height:1;color:var(--dsw-alias-brand-primary);',
      'background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;',
      'cursor:pointer;transition:color .12s ease,background-color .12s ease,border-color .12s ease}',
      '.dsh-po-update:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);',
      'border-color:var(--dsw-alias-border-l2)}',
      '.dsh-po-update:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-po-update:disabled{opacity:.6;cursor:default}',
      '.dsh-po-update-dot{width:6px;height:6px;border-radius:50%;flex:none;background:currentColor}',
      '.dsh-po-update[data-tone="running"] .dsh-po-update-dot{animation:dsh-po-pulse 1.1s ease-in-out infinite}',
      '.dsh-po-update[data-tone="done"]{color:var(--dsw-alias-label-secondary)}',
      '.dsh-po-update[data-tone="failed"]{color:var(--dsw-alias-label-secondary);',
      'border-color:var(--dsw-alias-border-l2)}',
      '@keyframes dsh-po-pulse{50%{opacity:.25}}',
    ].join('');

    // Idempotent style injection: this client bundle can be evaluated more than once
    // (HMR, a second window), so keep exactly one <style> tag for the plugin.
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css="dsh-prompt-optimized"]') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-prompt-optimized';
      tag.dataset.pluginCss = 'dsh-prompt-optimized';
      tag.textContent = styles;
      document.head.appendChild(tag);
    }

    let translate = (key) => key;
    let callHost = () => Promise.reject(new Error('the optimization channel is unavailable'));

    // ---- in-place upgrade -------------------------------------------------------
    //
    // The DSH plugin market exposes a small HTTP API for checking and applying
    // updates in place (package helpers in `dshmarket`: dsh-market/update-api/v1).
    // Using it means the plugin never shells out to a package manager itself: the
    // market performs install + rollback and reports progress, we only render one
    // badge. When dshmarket is absent or too old every call fails and the badge
    // stays hidden, so this degrades to the manual upgrade flow in the README.
    const UPDATE_API = '/dsh-market/api/v1';
    const UPDATE_PACKAGE = 'dsh-prompt-optimized';
    const UPDATE_POLL_MS = 1200;
    const UPDATE_TIMEOUT_MS = 10 * 60 * 1000;
    const UPDATE_TERMINAL = ['succeeded', 'failed', 'cancelled', 'rolled-back'];

    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) =>
        values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
      );
    }

    function shortVersion(value) {
      const text = typeof value === 'string' ? value : '';
      return /^[0-9a-f]{40}$/i.test(text) ? text.slice(0, 7) : text;
    }

    async function fetchApi(path, init) {
      const options = init || {};
      const response = await window.fetch(UPDATE_API + path, {
        credentials: 'same-origin',
        ...options,
        headers: { accept: 'application/json', ...(options.headers || {}) },
      });
      const text = await response.text();
      let body = null;
      try {
        body = text === '' ? null : JSON.parse(text);
      } catch {
        body = null;
      }
      if (!response.ok) {
        const failure = body && body.failure;
        const message = failure && typeof failure.message === 'string'
          ? failure.message
          : body && typeof body.error === 'string' && body.error !== ''
            ? body.error
            : 'HTTP ' + response.status;
        throw new Error(message);
      }
      return body;
    }

    // The probe is cached per page load: several composers may mount at once and
    // each one should not hit the market API on its own.
    let updateProbe = null;

    function probeUpdate() {
      if (updateProbe === null) {
        updateProbe = (async () => {
          try {
            const capabilities = await fetchApi('/capabilities');
            const features = capabilities && capabilities.features;
            if (!features || features.update !== true) return null;
            const answer = await fetchApi('/updates?name=' + encodeURIComponent(UPDATE_PACKAGE));
            const plugin = answer && answer.package;
            if (!plugin || plugin.updateAvailable !== true) return null;
            return {
              installedVersion: shortVersion(plugin.installedVersion) || '?',
              latestVersion: shortVersion(plugin.latestVersion) || '?',
              source: typeof plugin.source === 'string' ? plugin.source : '',
            };
          } catch (reason) {
            // No market, no plugin entry, or an older market: stay silent.
            console.debug('[prompt-optimizer] in-place update unavailable:', reason);
            return null;
          }
        })();
      }
      return updateProbe;
    }

    function waitForOperation(operationId) {
      const startedAt = Date.now();
      return new Promise((resolve, reject) => {
        const poll = () => {
          fetchApi('/operations?operationId=' + encodeURIComponent(operationId))
            .then((answer) => {
              const operation = answer && answer.operation;
              if (!operation) {
                reject(new Error('the update operation disappeared'));
                return;
              }
              if (UPDATE_TERMINAL.indexOf(operation.state) !== -1) {
                resolve(operation);
                return;
              }
              if (Date.now() - startedAt > UPDATE_TIMEOUT_MS) {
                reject(new Error('the update is still running; check the plugin market'));
                return;
              }
              window.setTimeout(poll, UPDATE_POLL_MS);
            })
            .catch(reject);
        };
        poll();
      });
    }

    /** Renders the "new version available" badge; nothing at all when up to date. */
    function UpdateBadge() {
      const [state, setState] = React.useState({ phase: 'idle', update: null, error: '' });

      React.useEffect(() => {
        let alive = true;
        probeUpdate().then((found) => {
          if (!alive || !found) return;
          setState({ phase: 'available', update: found, error: '' });
        });
        return () => {
          alive = false;
        };
      }, []);

      if (state.phase === 'idle') return null;

      const start = () => {
        if (state.phase === 'running' || state.phase === 'done') return;
        const current = state.update;
        setState({ phase: 'running', update: current, error: '' });
        fetchApi('/updates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ packageName: UPDATE_PACKAGE }),
        })
          .then((answer) => {
            const operation = answer && answer.operation;
            if (!operation || typeof operation.operationId !== 'string') {
              throw new Error('the update did not start');
            }
            return waitForOperation(operation.operationId);
          })
          .then((operation) => {
            updateProbe = null;
            if (operation.state === 'succeeded') {
              const installed = shortVersion(operation.installedVersion);
              setState({
                phase: 'done',
                update: current ? { ...current, installedVersion: installed || current.installedVersion } : null,
                error: '',
              });
              return;
            }
            const failure = operation.failure;
            const message = failure && typeof failure.message === 'string'
              ? failure.message
              : 'the update ended as ' + operation.state;
            setState({ phase: 'failed', update: current, error: message });
          })
          .catch((reason) => {
            updateProbe = null;
            const message = reason && reason.message ? reason.message : String(reason);
            console.error('[prompt-optimizer] in-place update failed:', reason);
            setState({ phase: 'failed', update: current, error: message });
          });
      };

      const update = state.update;
      const versions = update
        ? { installed: update.installedVersion, latest: update.latestVersion }
        : { installed: '?', latest: '?' };
      let tone = 'available';
      let label = format(translate('updateLabel'), versions);
      let title = format(translate('updateHint'), versions);
      let disabled = false;
      if (state.phase === 'running') {
        tone = 'running';
        label = translate('updateBusy');
        disabled = true;
      } else if (state.phase === 'done') {
        tone = 'done';
        label = translate('updateDone');
        disabled = true;
      } else if (state.phase === 'failed') {
        tone = 'failed';
        label = translate('updateFailed');
        title = format(translate('updateFailedHint'), { error: state.error });
      }

      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-po-update',
          'data-tone': tone,
          disabled,
          title,
          'aria-label': title,
          onClick: start,
        },
        h('span', { className: 'dsh-po-update-dot', 'aria-hidden': true }),
        h('span', null, label),
      );
    }

    /** Slot payload: the optimize button, plus the update badge when one applies. */
    function ComposerTools(props) {
      return h(React.Fragment, null, h(Trigger, props), h(UpdateBadge, null));
    }


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
            ComposerTools,
          ),
        );
      },
    };
  },
});
