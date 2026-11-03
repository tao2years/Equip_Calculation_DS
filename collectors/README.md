# 登录账号资产采集器：候选方案

## 当前可执行入口

```powershell
node collectors/account-collector.mjs plan --channel emulator
node collectors/account-collector.mjs capture --channel emulator --output account-runs
node collectors/account-collector.mjs plan --channel official_pc --mode golden
node collectors/account-collector.mjs audit --account account.json --reference manual-reference.json --output completeness-report.json
node collectors/cli.mjs probe
node collectors/cli.mjs init --output account.json --game-data-version public-catalog-2026-11-03
node collectors/cli.mjs import-json --input account.json --output normalized.json
node collectors/cli.mjs validate-account --input account.json
node collectors/cli.mjs audit-account --input account.json --reference manual-reference.json --output completeness-report.json
node collectors/cli.mjs resolve --kind artifact --text 巨人眼球
node collectors/cli.mjs adb-probe
node collectors/cli.mjs adb-screenshot --output capture.png --capture-type gear_detail
node collectors/cli.mjs window-probe
node collectors/cli.mjs window-screenshot --pid 1234 --output capture.png --capture-type hero_detail
node collectors/window-session.mjs --plan examples/pc-capture-plan.example.json --pid 1234 --output captures
node collectors/adb-session.mjs --plan examples/emulator-capture-plan.example.json --dry-run
node collectors/adb-session.mjs --plan examples/emulator-capture-plan.example.json --output captures
node collectors/cli.mjs stage-screenshots --input screenshots --output staging
node collectors/cli.mjs ocr-bundle --manifest staging/<job>/manifest.json
node collectors/cli.mjs extract-layout --recognition recognition.json --profile layout-profile.json --output ocr-staging.json --report extraction-report.json
node collectors/cli.mjs ocr-image --input screenshot.png --output raw-ocr.json
node scripts/inspect_ocr_labels.mjs --input raw-ocr.json --output detected-labels.json
node collectors/cli.mjs finalize-staging --input ocr-staging.json --output account.json
node collectors/pipeline.mjs --manifest staging/<job>/manifest.json --profile profiles/<channel-build>.json --output runs/<job>
node collectors/pipeline.mjs --manifest staging/<job>/manifest.json --profile profiles/<channel-build>.json --output runs/<job> --ocr-review review.json
node collectors/pipeline.mjs --manifest staging/<job>/manifest.json --profile profiles/<channel-build>.json --output runs/<job> --ocr-review review.json --reviewed-staging corrected-staging.json
```

现有 CLI 已能创建空账号快照、做结构与公共数据引用校验、解析中英文属性/槽位/英雄/神器/套装别名，以及把用户截图复制为不可变证据包并记录顺序、SHA-256、媒体类型和 Review 状态。本机 Windows OCR 适配器已可离线输出文字、逐词坐标和图片哈希；`probe` 会实时报告安装语言。`visible-ui` 和 `official-api` 仍明确报告为未满足能力。

模拟器路线新增了只读 `adb-probe` 与 `adb-screenshot`。后者只执行 Android `screencap`，保存 PNG 与独立元数据，不登录、不触摸屏幕、不自动翻页。本机没有安装 ADB，所以当前只通过设备列表解析、授权检查与设备选择测试；不能据此声称已采集真实账号。

官方 PC 路线新增了只读 `window-probe` 与 `window-screenshot`。后者必须传入用户明确选择的 PID，只对该进程当前可见且未最小化的主窗口执行 `CopyFromScreen`，并输出 PNG、窗口边界、SHA-256 与限制说明。适配器不会枚举所有窗口、不会点击或导航；窗口被遮挡、全屏独占、DPI 缩放和客户端渲染方式都可能影响结果，必须在真实客户端 golden screenshots 上验证。

`account-collector.mjs` 默认选择 `full_account` 计划，而不是校准抽样：三类列表必须完整走到末尾，角色/装备/神器详情必须逐个覆盖所有拥有对象；每个全量阶段输入 `n` 后还要键入 `complete`，确认才进入 manifest。`--mode golden` 明确只用于 OCR/公式校准，不能作为完整账号证据。统一入口的 `audit` 命令把最终快照交给同一完整性审计。

`window-session.mjs` 将版本化 capture plan 复用到 PC 客户端。它与 ADB 会话使用相同的阶段、最低数量、覆盖确认、回车截屏/`n` 前进/`q` 部分结束语义，生成独立证据和 `manifest.json`；该 manifest 的 `captures[]` 可被现有 pipeline 归一化。程序不会主动寻找或操作游戏窗口，PID 必须由用户明确提供。

`adb-session.mjs` 在单张截图能力之上提供引导式会话。它读取版本化 capture plan，逐步显示人工导航说明；每次回车才截屏，阶段最低数量不满足时拒绝直接进入下一步，full 的列表/详情阶段还需键入 `complete`，否则不能完成。允许用 `q` 生成 partial session。图片和逐图元数据不可覆盖，最终 manifest 记录数量与覆盖确认。`--dry-run` 不需要 ADB，可用于 Review 计划。

别名字典由 `scripts/build_import_dictionary.mjs` 生成。当前包含 13 种属性、7 个槽位、6 种品质、351 个英雄、147 件神器和 252 个套装定义。负载关键类别（属性、槽位、品质、神器）没有未处理冲突；同名英雄和跨赛季同名套装保留为歧义，必须结合外部 ID、赛季或截图上下文解析。

## 需要采集什么

公共游戏数据回答“有哪些角色、装备、神器和规则”；账号采集器只回答：

- 用户拥有的角色及成长状态；
- 每件账号装备的槽位、套装、强化、主副词条、锁定与穿戴者；
- 用户拥有的神器、精炼等级和穿戴者；
- 采集时间、游戏版本和来源方法。

采集器不得复制公共定义到每个账号文件，也不得包含密码、登录令牌或支付信息。

## 推荐实现顺序

### Collector A — 用户导出/文件适配器

输入 JSON/CSV/剪贴板，输出 canonical `AccountSnapshot`。这是首个可交付采集器，也是其他采集方式的回归 oracle。

### Collector B — 截图 OCR

用户在游戏内打开角色、装备和神器页面并主动保存截图；工具只读取截图文件。流程：

```text
Screenshot → OCR lines/coordinates → versioned layout extraction
           → alias/stat normalization → game-rule validation
           → staging repair UI → canonical AccountSnapshot
```

它不要求读取进程内存或网络数据，最适合当前无官方 API 的情况。先做单图/批量截图；只有准确率和条款复核通过后，才考虑自动翻页。

`stage-screenshots` 已实现上图中第一步：固化原始截图和 manifest。`ocr-bundle` 会逐图调用本机 Windows OCR，生成 `derived/windows-ocr/*.json` 和独立的 `recognition.json`；任何既有派生结果都拒绝覆盖。后续 OCR 不得覆盖原图。

`extract-layout` 已实现通用、配置驱动的坐标布局解析层。layout profile 绑定渠道、客户端 build、语言、页面锚点、归一化字段区域、必填规则和证据等级；输出 `OcrStaging` 与独立 extraction report。当前 `examples/layout-profile.synthetic.json` 只由三张合成详情页验证，证据等级是 `synthetic_fixture`，不是国服客户端 profile。真实截图到位后必须新建 channel/build profile，不能直接修改合成规则并冒充实测。

`pipeline.mjs` 把 manifest/session → OCR → OCR Review → layout extraction → staging Review → finalize → validation 串成一个可续跑程序。`pipeline-state.json` 保存输入哈希、逐步状态、产物哈希和追加事件；已完成且哈希一致的步骤复用，产物被修改后拒绝继续。状态写入使用临时文件原子替换；Windows 杀毒/索引造成的短暂 `EPERM`/`EBUSY`/`EACCES` 会有界退避重试，但不会退化为可能留下半截 JSON 的原地覆盖。普通截图任务的 `files[]` 与 ADB 引导会话的 `captures[]` 使用同一适配层。OCR 支持 `--resume`：完整 recognition 可复用；中断留下的逐图 OCR 只有在原图 SHA-256 和语言一致时才复用。

面向操作者统一使用 `account-collector.mjs`，不必记忆各内部脚本：

```powershell
node collectors/account-collector.mjs plan --channel official_pc
node collectors/account-collector.mjs capture --channel official_pc --pid 1234 --output account-runs
node collectors/account-collector.mjs process --manifest account-runs/<session>/manifest.json --profile <real-layout.json> --output account-runs/<session>/pipeline
node collectors/account-collector.mjs status --state account-runs/<session>/pipeline/pipeline-state.json
node collectors/account-collector.mjs audit --account account-runs/<session>/pipeline/account-snapshot.json --reference manual-reference.json --output account-runs/<session>/completeness-report.json
```

`process` 第一次会停在 OCR 行级 Review，第二次会停在字段级 Review；分别传回导出的 `--ocr-review` 和 `--reviewed-staging` 后继续。统一入口不会自动登录、点击、读内存或抓包。

第一次默认停为 `awaiting_ocr_review`。在 `prototype/review.html` 校对截图、字段候选和接受/驳回状态，导出 Review JSON 后用 `--ocr-review` 续跑；`apply-review` 会验证任务 ID、截图哈希、未解决字段和候选 ID，生成不可覆盖的 reviewed recognition。布局解析后第二次停为 `awaiting_staging_review`：在 `prototype/staging-review.html` 载入该运行的 `machine-staging.json`，逐条修正角色、装备、神器和属性词条；页面以正式 finalizer 实时校验，并导出带原 staging SHA-256 的 reviewed staging。只有以 `--reviewed-staging` 提供该文件，才生成 `account-snapshot.json`。`--accept-synthetic-staging` 只能用于 `evidenceLevel=synthetic_fixture` 的自动回归，不能绕过真实渠道的两级 Review。

启动本地原型后访问 `prototype/review.html`，可载入 recognition bundle，并按文件名关联本地原图。页面支持坐标框、全部 OCR 行切换、截图类型、字典候选修正、接受/驳回和 Review JSON 导出。Review JSON 可由 `apply-review` 或一键管线正式应用到 recognition，但仍不等于最终 `OcrStaging` 或 `AccountSnapshot`；真实游戏 profile 尚需 golden screenshots 校准。

`ocr-image` 使用系统自带 `Windows.Media.Ocr`，不上传图片。本机探测到 `zh-Hans-CN` 与 `en-US`。在当前原型页面截图上的 smoke test 识别出 58 行文字，其中 12 行可关联到字典中的角色、神器、属性或槽位。它只证明 OCR 管线可运行，不代表对真实游戏截图的准确率。

`finalize-staging` 已实现最后三步中的确定性部分：把 OCR/人工 Review 后的英雄、装备、神器记录解析为 canonical ID，转换百分比和整数，拒绝未知/歧义名称、重复词条和非法套装，最后生成 HTML 可直接导入的 `AccountSnapshot`。示例 `examples/ocr-staging.example.json` 包含 17 条合成识别记录，并已验证能还原成 2 个英雄、12 件装备和 3 件神器。

`audit-account` 是 finalize 后的完整性门。输入一份独立人工清点参考，检查三类资产总数、六槽位装备数、角色/神器定义 ID 集合、重复 owned ID、重复角色/神器定义和未知公共引用。失败报告仍会落盘并以非零退出码结束，方便 CI 或采集向导阻止“脚本跑完＝已经收全”的误判。当前示例只使用 synthetic fixture；真实账号必须由人工独立清点生成 reference。

### Collector C — 可见 UI 辅助采集

独立桌面 companion 在用户显式启动后，只做窗口截图、菜单导航和 OCR。必须有停止热键、速率限制、当前步骤预览和完整日志。它仍可能被发行方视为第三方自动化，因此不是默认能力。

### Collector D — 官方接口或官方个人数据导出

一旦确认存在，优先级最高。适配器只保存必要字段，不长期保存令牌。

### 默认排除

代理抓包、证书绕过、内存扫描、DLL/so 注入、Hook、客户端修改、请求伪造。当前条款风险和账号风险都高，且不是完成计算器的必要条件。

## 采集器接口

每个采集器应实现相同生命周期：

```ts
interface AccountCollector {
  probe(): Promise<CapabilityReport>;
  collect(options: CollectOptions): AsyncIterable<StagingRecord>;
  validate(records: StagingRecord[], gameData: GameData): ValidationReport;
  finalize(records: StagingRecord[], corrections: Correction[]): AccountSnapshot;
}
```

`probe()` 只报告是否具备所需输入，不登录账号；`collect()` 产生带 provenance/confidence 的 staging 数据；只有 `finalize()` 能生成求解器接受的快照。

## 登录客户端实验门

在有游戏本体的环境中，按以下顺序做只读探测：

1. 确认渠道、版本、运营主体和适用条款。
2. 检查游戏是否提供官方导出、分享码或个人数据下载。
3. 观察用户可见 UI 是否能完整展示所需字段。
4. 检查公开的本地日志/导出目录，但不读取凭据和受保护缓存。
5. 用隔离测试账号和少量截图验证 OCR。
6. 达不到安全/准确门槛则停止，不升级为抓包、内存或注入路线。

## 验收指标

- 角色、装备、神器无重复/漏项；
- 槽位、主词条、每个副词条、百分号和小数点逐字段统计准确率；
- 低置信字段全部进入人工修复队列；
- 二次采集能正确识别新增、强化、穿戴变化和删除；
- 导出文件可由 `prototype/` 和未来正式求解器无损读取；
- 日志中不出现密码、令牌、设备标识等敏感信息。
