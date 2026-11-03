# 知识库索引

查询时先从本页进入主题，不默认重读全部来源。

## 产品与技术主题

- [数据获取与合规边界](topics/data-acquisition.md)：静态资料、账号背包、候选导入路径和风险门。
- [领域模型与属性口径](topics/domain-model.md)：角色、七槽位、词条、套装、神器与版本维度。
- [配装求解与结果解释](topics/optimizer.md)：目标、约束、锁定、算法阶段和准确性标记。
- [同类工具模式](topics/competitive-patterns.md)：痒痒鼠魔方、Fribbels、Genshin Optimizer、OCR 扫描器带来的产品启示。
- [端到端数据管线](topics/end-to-end-data-pipeline.md)：公共图鉴、账号快照、Schema 与离线求解器如何汇合。
- [神器等级、精炼与属性来源](topics/artifact-model.md)：0–20 强化、0–5 精炼、账号观测覆盖与条件效果边界。

## 主要输出

- [Phase 0 产品定义与可行性方案](../outputs/phase-0-product-and-feasibility-plan.md)
- [可运行离线原型](../prototype/index.html)
- [OCR 截图校对工作台](../prototype/review.html)
- [OCR 结构化字段校对工作台](../prototype/staging-review.html)
- [视觉与交互核对](../outputs/design/fidelity-ledger.md)
- [公共数据覆盖报告](../outputs/public-data-coverage.md)
- [公共领域数据覆盖审计](../outputs/public-domain-audit.md)
- [国服名称候选与字典覆盖审计](../outputs/cn-alias-coverage.md)
- [用户目标完成度审计](../outputs/goal-coverage-audit.md)
- [三项成品实施与验收合同](../outputs/implementation-contract.md)
- [求解器合成规模基准](../outputs/optimizer-scalability-benchmark.md)
- [神器数据模型审计](../outputs/artifact-data-model-audit.md)
- [公共装备定义与账号关联审计](../outputs/equipment-data-model-audit.md)
- [当前阶段交接说明](../outputs/HANDOFF-2026-11-03.md)
- [登录账号采集实验计划](../research/client-capture-plan.md)

## 当前研究状态

- 产品定义：`modeled`
- 公开游戏规则：`screened`（仅少量关键规则，未完成全量数据覆盖）
- 静态数据摄取：`compiled_public_catalog`（11 份页面快照已固化；351 英雄、682 装备、147 神器已自动编译，当前客户端适用性未验证）
- 国服名称映射：`candidate_corpus_only`（70 条社区英雄名与 6 条官方页面样例已固化，均未连接到稳定角色 ID；当前字典只有 2/351 英雄拥有非 ASCII 别名）
- 账号背包自动获取：`adapter_scaffolded`（模拟器只读截屏适配器已实现，本机无 ADB/客户端，未实测真实账号）
- OCR：`synthetic_layout_verified`（本机批量 OCR、坐标、字典匹配、配置驱动布局解析与 Review UI 已验证；布局解析只通过三类合成详情页，未对真实游戏截图测准确率）
- 求解器：`prototype_verified`（合成 12 件背包已在隐藏浏览器完成 64 套枚举；尚无真实背包基准）

## 首要待验证项

见 [state/open-questions.md](../state/open-questions.md)。当前最高优先级是确定目标地区/发行渠道，以及取得一组脱敏的角色、装备、神器截图样本。
