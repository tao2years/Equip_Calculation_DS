# 端到端数据管线

## 目标结构

本项目明确分开两类输入，最后在本地 HTML 中汇合：

`公开规则/图鉴 → raw 快照 → corpus 编译数据 → versioned game data`

`用户登录态/截图/导出 → collector → account snapshot → schema validation`

`game data + account snapshot + optimization request → 带精确性标记的 solver → 可解释方案`

公开数据回答“游戏里可能存在什么”；账号快照回答“这个账号实际拥有什么”。两者不能用同一个抓取器，也不能用公开图鉴冒充用户背包。

## 已落地的最小闭环

1. `scripts/crawl_public_data.mjs` 按来源与日期固化 HTML 和元数据，使用 `wx` 防止覆盖旧证据。
2. `scripts/compile_public_heroes.mjs` 从最新的英雄详情快照提取一级基础属性，并保留来源、哈希和验证状态。
3. `scripts/compile_public_catalogs.mjs` 从目录页结构化状态生成英雄、装备、神器和套装家族；`scripts/build_game_data.mjs` 通过严格白名单把完整、无条件的静态套装句编译为面板加成，并输出 HTML 使用的数据包。未通过的效果仍保留原文。
4. `scripts/build_import_dictionary.mjs` 把公共名称和经过溯源的中文词汇合并为导入/OCR 别名字典，碰撞不会被静默吞掉。
5. `data/game-data.seed.json` 是少量已建模效果的人工种子，不宣称完整或客户端已验证。
6. `examples/account-snapshot.example.json` 是合成背包，只用于导入、约束、锁定和求解测试。
7. `prototype/` 在浏览器本地读取两类数据，按规模选择完整枚举、精确分支定界或明确标记的启发式候选缩减，叠加固定神器和已建模套装效果。

## OCR 中间层

OCR 引擎不直接生成最终账号文件。它先输出逐行文字、坐标与字典命中的 `recognition.json`，再由绑定渠道/build 的 layout profile 转成 `OcrStaging`；extraction report 关联截图顺序、页面规则、记录 ID 与问题。当前通用解析器只通过合成详情页，真实 profile 仍需 golden screenshots。Review 后运行：

`collectors/pipeline.mjs` 是这条账号链路的编排入口：输入可以是普通截图 manifest 或 ADB capture session，输出目录保存 recognition、reviewed recognition、machine staging、extraction report、最终账号、validation report 和 `pipeline-state.json`。状态文件记录输入/产物哈希，支持中断续跑。第一个门应用截图校对页导出的逐行决策；第二个门由 `prototype/staging-review.html` 编辑并以正式 finalizer 校验结构化字段，导出时绑定原 staging 哈希。真实 profile 不能静默绕过任一门。

```powershell
node collectors/cli.mjs finalize-staging --input ocr-staging.json --output account.json
```

Finalizer 负责别名解析、百分比转换、定义引用检查、重复检查和低置信度警告。名称未知或跨赛季歧义时停止生成，不靠模糊猜测继续。

Windows 环境已有离线像素识别入口：

```powershell
node collectors/cli.mjs ocr-image --input screenshot.png --output raw-ocr.json
node scripts/inspect_ocr_labels.mjs --input raw-ocr.json --output detected-labels.json
node collectors/cli.mjs ocr-bundle --manifest staging/<job>/manifest.json
```

第一条输出原文和逐词矩形；第二条只做确定性字典匹配；第三条对不可变截图任务批量执行两者，并输出独立 recognition bundle。`prototype/review.html` 已能读取该 bundle、显示原图/坐标框、修正候选并导出 Review 决策。将页面识别成 `hero/gear/artifact` 记录仍需要真实游戏 UI 的布局样本和 golden set；Review 决策目前不会假装成完整装备记录。

生成账号快照后，可通过 HTML 导入，也可直接运行版本化求解请求。两条路径调用同一求解核心，当前测试证明直接 JSON 与 OCR staging 生成的快照会得到相同的 64 组合搜索结果。

## 账号采集器路线

- A：官方导出/API（若存在）——优先级最高，风险最低。
- B：用户主动截图 OCR——MVP 自动化路线，可回看原图并逐字段确认。
- C：可见 UI 辅助采集——只做正常界面翻页/截图，需在目标渠道和条款确认后实验。
- D：客户端静态资源抽取——仅用于公共定义，不默认读取登录态背包。

默认不做内存扫描、进程注入、TLS 绕过、封包解密或修改客户端。登录态采集实验必须有测试账号、可删除的本地输出、字段级置信度和人工复核入口。

## 下一道验证门

取得目标渠道、版本号，以及一组脱敏的角色列表、装备详情和神器详情截图后，才能建立 OCR golden set 并判断 B/C 路线的真实成本。在此之前，“自动拉取全部账号信息”保持为待实验能力，不写成已实现功能。
