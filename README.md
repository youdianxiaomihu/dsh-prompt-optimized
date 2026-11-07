# 提示词优化器（dsh-prompt-optimized）

把原始需求或提示词草稿重构为**结构化、可执行的系统提示词**的 DeepSeek Harness 插件，对标 WorkBuddy 的优化标准。

仓库地址：<https://github.com/youdianxiaomihu/dsh-prompt-optimized>

## 快速安装

在任意 DSH 会话里调用一次即可：

```
plugin_manager({ action: "install_bundle", target: "github:youdianxiaomihu/dsh-prompt-optimized" })
```

装完用 `plugin_manager({ action: "list_bundles" })` 确认列表里出现 `dsh-prompt-optimized`；重启 DSH 后依然生效。其他安装方式与卸载、升级见[安装](#安装)。

装好后输入框工具栏左侧会出现「一键优化」按钮；以后插件发布新版本时，按钮旁会自动多出一个「更新 x.y.z」徽标，点一下即可原地升级（见[升级](#升级)）。

## 能力

注册一个可被模型与用户调用的技能 `prompt-optimizer`，并在输入框工具栏加一个**一键按钮**。当用户要求优化、改写、结构化或审查提示词、系统提示词、Agent 人设、需求说明时，技能指导模型：

1. **需求解析**：提取核心目标、使用场景、受众与语气，建立原始要求清单，识别角色模糊、目标不可判定、步骤缺失、约束冲突等缺陷。
2. **具象化拆解**：把「美观、专业、好用、高效」等形容词拆成可验证标准，覆盖风格、质量、效果三个维度，不允许形容词裸奔。
3. **多维度补全**：按场景补齐缺失维度——设计类补风格规范、布局逻辑、视觉素材、设备适配、输出格式；文案类补结构框架、语言风格、篇幅要求、适用场景；代码、数据、Agent 场景按对应清单补齐。
4. **结构化重构**：生成六个板块——角色设定、核心目标、工作流程、输出规范、约束规则（必须 / 禁止 / 注意事项）、思考要求；除角色设定、核心目标按例外处理外，每个板块「总起概括 + 分点罗列」，一条一个维度；思考要求须写 3–6 条可执行校验。
5. **语言与守恒校验**：口语化表述转为书面语并给出判定条件；逐条追溯原始需求，不新增、不删减、不改目标。
6. **自检与交付**：按质量门槛逐项检查结构与内容，不通过则回到对应步骤修正。
7. **确认询问**：以聊天回复交付结果时，主动询问「使用此提示词 / 重新生成 / 取消」；选「使用」输出可复制的终稿代码块，选「重新生成」重做一版并再次询问。由「一键优化」按钮触发、结果直接写回输入框的调用不询问，用户自行修改或发送。

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
├── index.js                    # 注册技能 + 一键优化 RPC 通道（Host 半）
├── client.js                   # 输入框「一键优化」按钮 + 原地升级徽标（Client 半）
├── skills/prompt-optimizer/
│   └── SKILL.md                # 优化器操作手册（技能正文）
├── locale/{en,zh}.json         # 插件管理器显示名称与描述
└── icon.svg                    # 插件图标
```

## 安装

本插件是一个 DSH **plugin bundle**（`package.json` 里声明 `dsh.bundle.patch`），安装方式是让 plugin manager 把这个包装进当前 profile，**不要**手写 profile 的 `package.json` / `cordis.patch.yml`，也不要在 profile 目录里跑 pnpm。

### 方式一：从 GitHub 安装（推荐）

```
plugin_manager({ action: "install_bundle", target: "github:youdianxiaomihu/dsh-prompt-optimized" })
```

`target` 接受 pnpm 支持的包 spec，因此下面几种写法等价可用：

- `github:youdianxiaomihu/dsh-prompt-optimized`
- `git+https://github.com/youdianxiaomihu/dsh-prompt-optimized.git`
- `https://github.com/youdianxiaomihu/dsh-prompt-optimized/archive/refs/heads/main.tar.gz`（tarball URL）

需要锁定版本时，可以在 git spec 后面加 ref，例如 `github:youdianxiaomihu/dsh-prompt-optimized#<commit-sha>`。

git 源在安装前会先探测 github.com 连通性；内网或代理环境下若报超时，改用 HTTPS tarball 或在能访问 GitHub 的网络下重试。

### 方式二：从本地目录安装（开发调试推荐）

```
plugin_manager({ action: "install_bundle", target: "<本仓库的绝对路径>" })
```

例如 Windows 下：

```
plugin_manager({ action: "install_bundle", target: "D:\\work\\dsh-prompt-optimized" })
```

前两种方式都会完成「pnpm 安装依赖 → 注册到 profile 的 bundle 列表 → 应用 `cordis.patch.yml` 补丁层」，新 bundle 通过 HMR 即可生效，重启后依然有效。

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

### 升级（原地升级）

插件自带原地升级：从 Git 源或 npm 安装、且 DSH 里装了插件市场（`dshmarket`）时，检测到新版本会在「一键优化」按钮旁显示「更新 x.y.z」徽标，点一下即可完成「下载 → 替换 → 失败自动回滚」，成功后徽标变成「已更新，重启生效」，重启 DSH 即可。

- 徽标只在真的有新版本时出现；没有插件市场、或市场版本过旧时静默隐藏，不影响按钮本身。
- 升级走插件市场的 update API（`/dsh-market/api/v1`），插件不自己跑 pnpm，也不需要先卸载。
- 从本地目录安装（`link:`）时没有可比较的远端版本，市场会报 `source: linked`，不会提示更新——此时目录里的文件就是当前版本，改完重启 DSH 即生效。

手动升级（没有插件市场、或想指定版本时）：

```
plugin_manager({ action: "remove_bundle", target: "dsh-prompt-optimized" })
plugin_manager({ action: "install_bundle", target: "github:youdianxiaomihu/dsh-prompt-optimized" })
```

`install_bundle` 对已安装的包会报 `already-installed`，所以手动升级要先 remove 再 install；原地升级徽标正是为了免掉这一步。

## 使用

- 一键按钮：输入框工具栏左侧的「一键优化 / One-click optimize」按钮。先在输入框写下需求，点按钮后 Host 半调用当前会话所用模型完成优化，结果以**几段完整文字**（无标题、无列表，控制篇幅以节省 token）**直接写回输入框**（不发送、不产生聊天消息），可继续修改或自行发送。输入框为空、正在发送或正在优化时按钮自动禁用，避免重复触发；失败时按钮提示重试，原内容保留。
- 原地升级徽标：「更新 x.y.z」出现在按钮右侧，点一下开始升级，过程中显示「更新中…」，失败会变成「更新失败，点此重试」（悬停可看具体原因），成功后提示重启 DSH。
- 模型侧：当请求匹配技能描述时自动调用。
- 用户侧：直接调用技能 `prompt-optimizer`，例如：

  ```
  用 prompt-optimizer 把这段提示词改造成系统提示词：把我们的周报模板改成更专业的写法
  ```

## 更新记录

- `0.4.0`：原地升级徽标正式发布（实现自 0.3.2 起）；修复按钮样式此前未注入页面、导致外观不生效的问题。
- `0.3.1`：输入框工具栏「一键优化」按钮，把草稿原地改写为结构化提示词。
- `0.1.1`：首个可安装版本，注册 `prompt-optimizer` 技能。

## 反馈

- 问题与建议：<https://github.com/youdianxiaomihu/dsh-prompt-optimized/issues>
- 技能正文改动请在 PR 里说明改了哪个板块、为什么改，方便对照 `skills/prompt-optimizer/SKILL.md` 复核。

## 注意

- 插件为 Host + Client 双半：Host 半注册技能，Client 半只在 Web 界面渲染输入框按钮；终端等无 Web 界面的宿主只提供技能。
- 从本地目录安装时 profile 里存的是 `link:` 指向，**移动或删除本目录会让已安装的插件变成悬空链接**，下次启动 profile 可能无法组装；移动后重新执行一次 `install_bundle` 指向新路径即可修复。
- 原地升级徽标依赖插件市场 `dshmarket` 的 update API；没有它时只保留手动升级路径，按钮功能不受影响。
- 从 npm 安装时不要把 `private` 改成 `false` 除非确实要发布到 npm 仓库。
