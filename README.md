# 龙息：神寂装备计算器

面向《龙息：神寂》（Dragonheir: Silent Gods）的本地优先装备管理与配装求解器。当前仓库处于 Phase 1/2 交界：产品定义、证据体系、离线求解闭环、批量 OCR 与人工校对壳已落地；账号自动采集和游戏公式仍待客户端样本验证。

## 当前结论

- **计算与产品形态可行**：七个槽位（神器、头盔、武器、胸甲、手套、正位符文、负位符文）可以建模为“离散装备组合 + 套装/神器条件效果 + 属性约束 + 目标函数”的求解问题。
- **静态游戏资料可建立版本化数据集**：现有资料已能验证基础属性、槽位、部分主副词条、强化档位和套装效果；但国服/国际服、赛季与重生版本必须分开管理，不能拼成一个无版本表。
- **自动读取账号是首要风险**：读取静态资源不等于能读取玩家背包。现行服务条款对反编译、datamine、运行时数据与非授权工具限制较宽，因此 MVP 默认支持手工录入、文件导入和用户主动截图 OCR；内存读取、抓包、注入均不作为默认路线。

## 运行当前原型

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\serve_prototype.ps1
```

然后访问 `http://127.0.0.1:4173/prototype/`，点击“载入示例”。截图 OCR 校对工作台位于 `http://127.0.0.1:4173/prototype/review.html`。示例账号和装备是合成测试数据；角色基础值及少量公共定义带来源，但均未与当前客户端校验。

账号库存编辑器位于 `http://127.0.0.1:4173/prototype/inventory.html`。它可以新建或导入账号快照，手工添加角色、六槽位装备与神器，校验公共定义引用，导出 JSON，并把当前账号直接交给配装页。重复导入可选择整体替换或按稳定 ID 合并，并显示新增、更新、未变和本次未出现的记录数；“未出现”不会被擅自当作已删除。它是自动扫描尚未接通时的可用保底入口，也是未来采集器输出的人工 oracle。

当前可运行能力：账号 JSON 导入、角色/神器选择、六槽位固定、允许拆所有角色/仅当前角色/仅背包的候选策略、可选排除锁定装备、十种面板属性的动态 `>= / > / <= / < / =` 约束、同属性区间、最大化/最小化目标、满暴输出代理、自定义加权面板、套装加成、Top 20、换装清单和通用上下限诊断。求解器按规模在完整枚举、全局精确 Top N 分支定界与明确标记的快速启发式之间切换，用户也可手动选择；HTML 当前加载自动生成的公共数据包，其中包含 351 个英雄、682 个装备和 147 个神器定义。装备实例可引用公共定义，套装的可计算静态效果暂时只建模 4 组。

账号采集 CLI：

```powershell
node collectors/cli.mjs probe
node collectors/cli.mjs validate-account --input account.json
node collectors/cli.mjs audit-account --input account.json --reference manual-reference.json --output completeness-report.json
node collectors/cli.mjs resolve --kind artifact --text 巨人眼球
node collectors/cli.mjs resolve --kind equipment --text equipment-532513
node collectors/cli.mjs adb-probe
node collectors/cli.mjs adb-screenshot --output capture.png --capture-type gear_detail
node collectors/cli.mjs window-probe
node collectors/cli.mjs window-screenshot --pid 1234 --output capture.png --capture-type hero_detail
node collectors/window-session.mjs --plan examples/pc-capture-plan.example.json --pid 1234 --output captures
node collectors/adb-session.mjs --plan examples/emulator-capture-plan.example.json --dry-run
node collectors/adb-session.mjs --plan examples/emulator-capture-plan.example.json --output captures
node collectors/cli.mjs stage-screenshots --input screenshots --output staging
node collectors/cli.mjs ocr-bundle --manifest staging/<job>/manifest.json
node collectors/cli.mjs ocr-image --input screenshot.png --output raw-ocr.json
node collectors/cli.mjs finalize-staging --input ocr-staging.json --output account.json
```

`adb-screenshot` 是模拟器候选入口：只从用户已授权的 ADB 设备截取当前可见画面并保存本地 PNG/哈希元数据，不自动点击、不读内存、不抓包。本机目前没有 ADB，因此适配器逻辑已测试、真实模拟器采集未验证。

`window-screenshot` 是官方 PC 客户端候选入口：只接受用户明确给出的进程 PID，只截取当前可见且未最小化的主窗口，保存本地 PNG、窗口边界与哈希元数据，不枚举窗口标题、不自动登录或点击。本机 Windows 能力探测已通过，但没有游戏客户端，因此尚未验证遮挡、DPI、全屏模式和真实页面覆盖。

`window-session.mjs` 将同一份 7 阶段采集计划应用到 PC 窗口：用户自行在游戏内导航，每次按回车才截屏；各阶段最低截图数未满足时不能进入下一步，提前退出只会生成 `partial` manifest。该 manifest 可直接交给后续 OCR/pipeline，dry-run 已通过但真实窗口会话尚未执行。

`adb-session.mjs` 是引导式完整采集程序。它按 7 个阶段提示用户手动打开渠道/版本、角色列表、角色详情、装备列表/详情、神器列表/详情；回车截屏，`n` 进入下一阶段，`q` 以 partial 状态结束。示例计划至少覆盖 50 张 golden screenshots，并为每张图保存独立元数据和最终 manifest。

`ocr-bundle` 会对任务内全部原图运行本机 Windows OCR，并另存 `recognition.json`、逐图文字与坐标；它拒绝覆盖已有识别证据。`extract-layout` 再按渠道/build 专属 profile 生成 staging 与问题报告。当前只有三类合成详情页通过这条链路，尚无真实国服 profile。校对页可关联本地原图、叠加 OCR 框、修正字典候选、接受/驳回截图并导出 Review 决策；在没有目标客户端与真实样本时不宣称真实 OCR 准确率或自动登录采集已完成。

`collectors/pipeline.mjs` 已把这些步骤组织为带 checkpoint 和产物哈希的一键/续跑采集程序。它先在 recognition 后等待逐行 OCR Review，再在 machine staging 后由 `prototype/staging-review.html` 完成字段级 Review；两级确认完成后才生成并校验 `AccountSnapshot`。

生成账号文件后还必须运行 `audit-account`。它将快照与独立人工清点参考对比：角色/装备/神器总数、六个装备槽位数量、完整角色/神器定义 ID、重复 owned ID、重复定义和未知公共引用。只有全部一致才返回 `passed`；这证明与参考一致，但不会把参考本身未经验证的完整性夸大为事实。

无需打开网页也可以用同一个求解核心执行请求：

```powershell
node scripts/solve_request.mjs `
  --account examples/account-snapshot.example.json `
  --request examples/optimization-request.example.json `
  --output examples/optimization-result.example.json
```

重建公共数据并验证仓库：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

## 从哪里开始读

1. [阶段 0 产品与可行性方案](outputs/phase-0-product-and-feasibility-plan.md)
2. [Wiki 索引](wiki/index.md)
3. [研究协议](research/protocol.md)
4. [当前 checkpoint](state/checkpoint.md)
5. [待验证问题](state/open-questions.md)
6. [端到端数据管线](wiki/topics/end-to-end-data-pipeline.md)
7. [公共数据覆盖报告](outputs/public-data-coverage.md)
8. [用户目标完成度审计](outputs/goal-coverage-audit.md)
9. [公共领域数据覆盖审计](outputs/public-domain-audit.md)
10. [国服名称候选与字典覆盖审计](outputs/cn-alias-coverage.md)
11. [三项成品实施与验收合同](outputs/implementation-contract.md)
12. [当前阶段交接说明](outputs/HANDOFF-2026-11-03.md)
13. [公共装备定义与账号关联审计](outputs/equipment-data-model-audit.md)

## 仓库分层

| 目录 | 用途 |
|---|---|
| `corpus/` | 来源台账、稳定 ID、筛查和覆盖状态 |
| `schemas/` | 领域对象、导入导出和目标配置的数据契约 |
| `wiki/` | 按主题维护的可持续知识库 |
| `outputs/` | 面向产品、开发和评审的阶段性输出 |
| `research/` | 研究协议、实验设计和调研笔记 |
| `state/` | checkpoint、决策、问题与追加式日志 |
| `scripts/` | 摄取、转换、校验和生成脚本（随实现逐步增加） |
| `prototype/` | 可离线运行的 HTML/CSS/JS 配装器原型 |
| `collectors/` | 登录态/截图/导出的采集器接口与风险门 |

## 近期路线

`Phase 0 规则与风险确认 → Phase 1 手工/文件导入的单角色 MVP → Phase 2 截图 OCR → Phase 3 多角色装备分配 → Phase 4 经授权的数据接入实验`

本项目不是官方工具。任何客户端数据实验都必须使用测试账号、最小权限、只读设计，并先通过适用地区、发行渠道与当前版本条款复核。
