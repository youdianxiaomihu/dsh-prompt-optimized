# 提示词优化器（dsh-prompt-optimized）

DeepSeek Harness 插件：把原始需求或提示词草稿重构为**结构化、可执行的系统提示词**，对标 WorkBuddy 的优化标准。

## 能力

注册一个可被模型与用户调用的技能 `prompt-optimizer`。当用户要求优化、改写、结构化或审查提示词、系统提示词、Agent 人设、需求说明时，技能指导模型：

1. **需求解析**：提取核心目标、使用场景、受众与语气，建立原始要求清单，识别角色模糊、目标不可判定、步骤缺失、约束冲突等缺陷。
2. **具象化拆解**：把「美观、专业、好用、高效」等形容词拆成可验证标准，覆盖风格、质量、效果三个维度，不允许形容词裸奔。
3. **多维度补全**：按场景补齐缺失维度——设计类补风格规范、布局逻辑、视觉素材、设备适配、输出格式；文案类补结构框架、语言风格、篇幅要求、适用场景；代码、数据、Agent 场景按对应清单补齐。
4. **结构化重构**：生成六个板块——角色设定、核心目标、工作流程、输出规范、约束规则（必须 / 禁止 / 注意事项）、思考要求；除角色设定、核心目标按例外处理外，每个板块「总起概括 + 分点罗列」，一条一个维度；思考要求须写 3–6 条可执行校验。
5. **语言与守恒校验**：口语化表述转为书面语并给出判定条件；逐条追溯原始需求，不新增、不删减、不改目标。
6. **自检与交付**：按质量门槛逐项检查结构与内容，不通过则回到对应步骤修正。

六条硬性规则：

| 规则 | 要求 | 判定 |
| --- | --- | --- |
| 具象化拆解 | 形容词 → 可验证标准 | 每个形容词都有阈值、范围或验收方式 |
| 多维度补全 | 按场景补齐执行必需维度 | 场景必查维度表全覆盖 |
| 结构化呈现 | 总起概括 + 数字编号分点 | 任一条目可独立执行 |
| 语言规范化 | 口语转书面语，强度三档（必须 / 应当 / 可选）与约束分组措辞统一 | 无无阈值、无判定条件的模糊措辞 |
| 原意守恒 | 只细化不改写 | 每条要求可追溯原文 |
| 逻辑分层 | 整体→细节、内容→形式 | 读者无需回跳即可理解 |

输出严格遵循 `# 标题` + 六个 `##` 板块的框架，语言严谨、无寒暄、保持原意。

## 结构

```
dsh-prompt-optimized/
├── cordis.patch.yml            # 插件激活条目
├── index.js                    # 读取 SKILL.md 并注册技能
├── skills/prompt-optimizer/
│   └── SKILL.md                # 优化器操作手册（技能正文）
├── locale/{en,zh}.json         # 插件管理器显示名称与描述
└── icon.svg                    # 插件图标
```

## 安装

本插件是一个 DSH **plugin bundle**（`package.json` 里声明 `dsh.bundle.patch`），安装方式是让 plugin manager 把这个包装进当前 profile，**不要**手写 profile 的 `package.json` / `cordis.patch.yml`，也不要在 profile 目录里跑 pnpm。

### 方式一：从 GitHub 安装（仓库发布后推荐）

在任意 Harness 会话里调用：

```
plugin_manager({ action: "install_bundle", target: "github:youdianxiaomihu/dsh-prompt-optimized" })
```

`target` 接受 pnpm 支持的包 spec，因此下面几种写法等价可用：

- `github:youdianxiaomihu/dsh-prompt-optimized`
- `git+https://github.com/youdianxiaomihu/dsh-prompt-optimized.git`
- `https://github.com/youdianxiaomihu/dsh-prompt-optimized/archive/refs/heads/main.tar.gz`（tarball URL）

git 源在安装前会先探测 github.com 连通性；内网或代理环境下若报超时，改用 HTTPS tarball 或在能访问 GitHub 的网络下重试。

### 方式二：从本地目录安装（开发调试推荐）

```
plugin_manager({ action: "install_bundle", target: "<本目录的绝对路径>" })
```

例如 Windows 下：

```
plugin_manager({ action: "install_bundle", target: "C:\\Users\\Root\\Desktop\\dsh\\dsh-plugins\\dsh-prompt-optimized" })
```

两个方式都会完成「pnpm 安装依赖 → 注册到 profile 的 bundle 列表 → 应用 `cordis.patch.yml` 补丁层」，新 bundle 通过 HMR 即可生效，重启后依然有效。

### 方式三：CLI（只适用于 DSH 未运行、需要修复 profile 时）

```
dsh plugin --profile <profile> add github:youdianxiaomihu/dsh-prompt-optimized
```

`dsh plugin` 只是把参数透传给 profile 里的 pnpm，不会做 bundle 选择，所以只在 plugin manager 不可用时作为救援手段；DSH 正在运行时不要这样改 profile。

### 验证与卸载

```
plugin_manager({ action: "list_bundles" })   # 能看到 dsh-prompt-optimized 即安装成功
plugin_manager({ action: "list_plugins" })   # 查看插入的 dsh-prompt-optimized 条目及激活状态
plugin_manager({ action: "remove_bundle", target: "dsh-prompt-optimized" })
```

### 升级

```
plugin_manager({ action: "remove_bundle", target: "dsh-prompt-optimized" })
plugin_manager({ action: "install_bundle", target: "github:youdianxiaomihu/dsh-prompt-optimized" })
```

`install_bundle` 对已安装的包会报 `already-installed`，所以升级要先 remove 再 install。

## 使用

- 模型侧：当请求匹配技能描述时自动调用。
- 用户侧：直接调用技能 `prompt-optimizer`，例如「用 prompt-optimizer 把这段提示词改造成系统提示词」。

## 注意

- 插件为 Host-only，不包含任何 UI 组件。
- 从本地目录安装时 profile 里存的是 `link:` 指向，**移动或删除本目录会让已安装的插件变成悬空链接**，下次启动 profile 可能无法组装；移动后重新执行一次 `install_bundle` 指向新路径即可修复。
- 从 npm 安装时不要把 `private` 改成 `false` 除非确实要发布到 npm 仓库。
