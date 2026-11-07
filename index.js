// dsh-prompt-optimized — registers the bundled `prompt-optimizer` skill.
//
// The skill body lives in ./skills/prompt-optimizer/SKILL.md and is loaded once
// at plugin import time, then registered into the host skills layer so every
// agent session (and the user) can invoke it by name.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROVIDER = 'dsh-prompt-optimized';
const SKILL_NAME = 'prompt-optimizer';
const SKILL_DIR = new URL('./skills/prompt-optimizer/', import.meta.url);

export const inject = ['skills'];

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
}
