// dsh-prompt-optimized — registers the bundled `prompt-optimizer` skill and
// serves the one-click optimization channel used by the composer button.
//
// The Host half owns two things:
//   1. the skill itself (./skills/prompt-optimizer/SKILL.md), registered into the
//      host skill registry so any agent session can invoke it by name; and
//   2. the `/prompt-optimizer` connection channel. The Client half calls its
//      `optimize` endpoint with the composer draft; the Host runs one generation
//      through the harness LLM service using the skill body as the system prompt
//      and returns the optimized TEXT. No chat message is created and nothing is
//      submitted — the Client writes the text back into the composer.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROVIDER = 'dsh-prompt-optimized';
const SKILL_NAME = 'prompt-optimizer';
const SKILL_DIR = new URL('./skills/prompt-optimizer/', import.meta.url);
const CHANNEL = '/prompt-optimizer';
const MAX_PROMPT_CHARS = 8000;
const MAX_TOKENS = 6000;
const REQUEST_TIMEOUT_MS = 180000;
const REASONING_LEVEL_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export const inject = ['skills', 'connection', 'webServer'];

export function apply(ctx) {
  const content = readFileSync(new URL('SKILL.md', SKILL_DIR), 'utf8')
    // Tolerate an optional YAML frontmatter block if one is added later.
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

  ctx.effect(() =>
    ctx.skills.register({
      name: SKILL_NAME,
      description:
        '把原始需求或提示词草稿重构为结构化、可执行的系统提示词：按六条规则（具象化拆解、多维度补全、结构化呈现、语言规范化、原意守恒、逻辑分层）补齐风格、质量、效果等维度，输出角色设定、核心目标、工作流程、输出规范、约束规则、思考要求六板块，对标 WorkBuddy 优化标准。当用户要求优化、改写、结构化或审查提示词、系统提示词、Agent 人设、需求说明时使用。',
      whenToUse: '用户提供提示词草稿或简短模糊的需求，希望得到可直接使用的结构化系统提示词时。',
      content,
      source: 'bundled',
      provider: PROVIDER,
      resourceBase: {
        kind: 'directory',
        path: fileURLToPath(SKILL_DIR),
      },
      invocation: {
        modelInvocable: true,
        userInvocable: true,
      },
    }),
  );

  ctx.effect(() => registerOptimizeChannel(ctx, content), 'dsh-prompt-optimized: optimize channel');
}

/**
 * Register the `/prompt-optimizer` RPC channel, feature-detected: a deployment
 * whose connection service is unavailable keeps the skill and loses only the
 * one-click button path.
 */
function registerOptimizeChannel(ctx, skillText) {
  const connection = typeof ctx.get === 'function' ? ctx.get('connection') : undefined;
  if (!connection) return undefined;
  const handle = async (endpoint, payload) => {
    if (endpoint !== 'optimize') {
      return rpcError(new Error(`unknown endpoint ${JSON.stringify(endpoint)}`));
    }
    try {
      return { ok: true, value: await runOptimize(ctx, skillText, payload) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger?.warn?.(`dsh-prompt-optimized: optimize failed: ${message}`);
      return rpcError(error);
    }
  };
  const options = { authority: 'trusted-host' };
  if (typeof connection.register === 'function') return connection.register(ctx, CHANNEL, handle, options);
  if (connection.rpc && typeof connection.rpc.handle === 'function') {
    return connection.rpc.handle(CHANNEL, handle, options);
  }
  return undefined;
}

/** One optimization: resolve a model route, stream the answer, return its text. */
async function runOptimize(ctx, skillText, payload) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (text === '') throw new Error('the prompt is empty');
  if (text.length > MAX_PROMPT_CHARS) {
    throw new Error(`the prompt is too long: ${text.length} characters (max ${MAX_PROMPT_CHARS})`);
  }
  const llm = ctx.get('llm');
  if (!llm || typeof llm.stream !== 'function') throw new Error('the harness LLM service is unavailable');
  const route = resolveRoute(ctx, payload?.sessionId);
  if (!route) throw new Error('no model route is available for this session');

  const effort = await lowestReasoningEffort(llm, route);
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let output = '';
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      system: buildSystemPrompt(skillText),
      maxTokens: MAX_TOKENS,
      signal,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    })) {
      if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text;
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`the model did not answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`);
    }
    throw error;
  }
  const optimized = unwrapFence(output).trim();
  if (optimized === '') throw new Error('the model returned an empty result');
  return { text: optimized, provider: route.provider, model: route.model };
}

/** The provider/model the session runs on, else the harness default route. */
function resolveRoute(ctx, sessionId) {
  if (typeof sessionId === 'string' && sessionId !== '') {
    const options = ctx.get('agents')?.get?.(sessionId)?.options;
    if (isRoute(options)) return { provider: options.provider, model: options.model };
    try {
      const events = ctx.get('sessions')?.get?.(sessionId)?.snapshotEvents?.();
      if (Array.isArray(events)) {
        for (let index = events.length - 1; index >= 0; index -= 1) {
          const event = events[index];
          if (!event || event.type !== 'request/header') continue;
          const config = event.data?.header?.config;
          if (isRoute(config)) return { provider: config.provider, model: config.model };
        }
      }
    } catch {
      // Fall through to the default route.
    }
  }
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.();
  if (isRoute(selection)) return { provider: selection.provider, model: selection.model };
  return undefined;
}

function isRoute(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.provider === 'string' &&
    value.provider !== '' &&
    typeof value.model === 'string' &&
    value.model !== ''
  );
}

/** The lowest reasoning effort the model advertises, so a quick rewrite stays quick. */
async function lowestReasoningEffort(llm, route) {
  if (typeof llm.resolveModelInfo !== 'function') return undefined;
  let info;
  try {
    info = await Promise.resolve(llm.resolveModelInfo(route.provider, route.model)).catch(() => undefined);
  } catch {
    return undefined;
  }
  const efforts = info?.reasoning?.efforts;
  if (!Array.isArray(efforts)) return undefined;
  const ids = efforts
    .map((entry) => (entry && typeof entry === 'object' ? entry.id : entry))
    .filter((id) => typeof id === 'string' && id !== '');
  let best;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const rank = REASONING_LEVEL_ORDER.indexOf(id);
    if (rank >= 0 && rank < bestRank) {
      best = id;
      bestRank = rank;
    }
  }
  return best ?? ids[0];
}

/**
 * The skill body as the system prompt, minus its post-delivery confirmation
 * section (the in-composer run must output the document and stop) plus the
 * direct-output rules that replace it.
 */
function buildSystemPrompt(skillText) {
  return [
    stripSection(skillText, '交付后的确认询问').trim(),
    '',
    '---',
    '',
    '## 一键优化直接输出模式',
    '',
    '本次调用来自输入框工具栏的「一键优化」按钮，结果会写回用户输入框，由用户自行修改或发送，因此按下面格式输出，优先节省 token：',
    '',
    '1. 输出 3–5 个自然段落，每段 2–4 句；全文以 500–900 汉字为常态，不写废话。',
    '2. 只用普通文字段落，段落之间空一行；不写 Markdown 标题（#、##）、列表、编号、表格、代码围栏、加粗或分隔线。',
    '3. 不按 SKILL.md「输出模板」的六板块标题与分点格式排版，但六板块的实质内容（角色与目标、工作流程、输出规范、约束与边界、自检要求）须按顺序融入段落，不得遗漏。',
    '4. 不询问、不加前言后记、不做改动说明，直接给出最终提示词文字。',
  ].join('\n');
}

/** Remove one `##` section (its heading through the next `##` heading). */
function stripSection(text, title) {
  const heading = `\n## ${title}`;
  const start = text.indexOf(heading);
  if (start < 0) return text;
  const next = text.indexOf('\n## ', start + heading.length);
  return next < 0 ? text.slice(0, start) : text.slice(0, start) + text.slice(next);
}

/** A model that ignored "no fence" and wrapped the whole document gets unwrapped. */
function unwrapFence(text) {
  const trimmed = text.trim();
  const match = /^```[\w-]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  return match ? match[1] : text;
}

function rpcError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: { code: 'internal', message, details: {} } };
}
