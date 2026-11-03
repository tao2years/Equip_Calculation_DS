# 数据获取与合规边界

## 结论

产品必须把“静态游戏资料”和“用户账号资产”设计为两个独立适配器。公开 Wiki 和客户端静态资源可能提供角色模板、装备集合、词条与效果；它们通常不包含用户拥有哪件装备、随机副词条和穿戴关系。账号背包需要另一条导入链路。

## 候选路径排序

| 路径 | 静态规则 | 用户背包 | 可维护性 | 账号/合规风险 | 当前建议 |
|---|---:|---:|---:|---:|---|
| 官方 API/官方导出 | 高 | 高 | 高 | 低 | 若存在则首选；尚未发现 |
| 版本化 JSON/CSV 手工导入 | 中 | 高 | 高 | 低 | MVP 必须支持 |
| 手工录入/粘贴 | 低 | 高 | 中 | 低 | MVP 保底路径 |
| 用户主动截图 + OCR | 中 | 高 | 中 | 低至中 | Phase 2 推荐，先做准确率实验 |
| 自动导航可见 UI + OCR | 中 | 高 | 中 | 中 | 必须显式启动、限菜单、可中止；先复核条款 |
| 读取本地公开缓存/日志 | 高 | 可能 | 中 | 中 | 仅当文件明确可读且无凭据时实验 |
| 被动抓包/代理 | 高 | 高 | 低 | 高 | 默认禁用；条款和 TLS 风险明显 |
| 进程内存读取 | 高 | 高 | 低 | 高 | 默认禁用 |
| 注入、Hook、修改客户端 | 高 | 高 | 低 | 极高 | 不纳入产品路线 |

## 已知技术事实与推断

- SteamDB 的当前文件清单显示 `UnityPlayer.dll`、`GameAssembly.dll`、`global-metadata.dat`、`StreamingAssets` 等，支持“当前 PC 客户端为 Unity IL2CPP 构建”的判断。这只说明技术栈，不证明静态表未加密或账号数据可直接读取。
- 当前公开 Wiki 提供角色列表、角色基础属性、装备/神器页面和赛季筛选，适合作为发现源和交叉检查源；其版权页与数据更新机制尚未核清，不能直接当成可再发布的数据许可。
- Level Infinite 当前条款的搜索可见文本包含对 reverse engineer、datamine、decompile 等行为的限制；腾讯中文游戏协议还明确覆盖客户端—服务端交互数据和非授权第三方工具。最终适用条款取决于国服/国际服与渠道，需在实验前重新核对。

## 推荐接入架构

```text
Source Adapter
  ├─ ManualEditorAdapter
  ├─ JsonCsvAdapter
  ├─ ScreenshotOcrAdapter
  └─ FutureOfficialAdapter
          ↓
Staging records + provenance + validation errors
          ↓ human review/repair
Canonical Account Snapshot (versioned, local-first)
          ↓
Optimizer / Inventory / Export
```

所有适配器输出同一 canonical schema，并保留 `source_method`、原始截图/文件哈希、识别置信度和修订记录。OCR 低置信字段不得静默进入求解器。

## 国服名称映射边界

公开中文页面中的“可见名称”与公共英文目录中的“稳定角色 ID”是两层数据。仓库已将 70 条社区英雄名和 6 条 WeGame 官方营销页样例编译到 `corpus/compiled/cn-name-candidates.json`，但不会仅凭文字相似度写入 OCR/导入字典。已观察到截断、重复及一字差异，说明自动猜配会污染账号快照。

名称进入 `research/curated-aliases.json` 前，必须取得客户端截图、官方双语/稳定 ID 数据，或经人工复核的多字段证据链。覆盖率和合并门槛见 `outputs/cn-alias-coverage.md`。

## OCR 最小实验

1. 收集不少于 50 件装备、10 件神器、10 个角色面板的脱敏截图，覆盖两种分辨率与简中 UI。
2. 固定截图区域，先做文字检测与规则字典纠错，再做数值解析。
3. 用词条合法集合、主副词条互斥、强化档位与数值范围做机械校验。
4. 分别统计字段准确率、整件装备完全正确率、重复/漏扫率和人工修正耗时。
5. 只有关键字段整件正确率达到项目门槛后，才考虑自动导航；门槛建议初始设为 99.5%，最终由真实样本调整。

## 模拟器 ADB 候选适配器

仓库已有 `adb-probe` 和 `adb-screenshot`。它们只检查用户已授权设备并抓取当前屏幕 PNG，不自动点击、不读取应用私有目录、不读取进程内存，也不拦截网络。截图保存 SHA-256、设备标识、capture type 和本地处理声明。该能力目前为 `adapter_scaffolded`：代码和纯逻辑测试通过，但本机未安装 ADB，未在任何游戏/账号上运行。

完整实验步骤、页面覆盖和停止条件见 `research/client-capture-plan.md`。

## 参考证据

- Dragonheir Steam depot file list: https://steamdb.info/depot/2203071/
- Level Infinite Terms: https://account.levelinfinite.com/tos.html
- Tencent Service Agreement: https://en.security.tencent.com/tencent/service_agreement/en-us/
- Inventory Kamera OCR workflow: https://github.com/Andrewthe13th/Inventory_Kamera
- GOODScanner validation pattern: https://github.com/BigOrange666/GOODScanner
