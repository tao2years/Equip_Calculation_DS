#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [catalog, gameData] = await Promise.all([
  readFile(path.join(ROOT, "corpus", "compiled", "public-catalogs.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8").then(JSON.parse)
]);

function countBy(entries, getter) {
  const counts = {};
  for (const entry of entries) {
    const values = getter(entry);
    for (const value of Array.isArray(values) ? values : [values]) {
      const key = String(value ?? "unknown") || "unknown";
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function duplicateCount(entries, getter) {
  const seen = new Set();
  let duplicates = 0;
  for (const entry of entries) {
    const value = getter(entry);
    if (seen.has(value)) duplicates += 1;
    else seen.add(value);
  }
  return duplicates;
}

const refinementLengths = catalog.artifacts.map((entry) => entry.refinementCurve?.length || 0);
const audit = {
  schemaVersion: "0.1.0",
  generatedAt: gameData.dataVersion.retrievedAt,
  dataVersionId: gameData.dataVersion.id,
  evidenceState: "public_catalog_compiled_not_client_validated",
  heroes: {
    total: catalog.heroes.length,
    withBaseStats: catalog.heroes.filter((entry) => Object.keys(entry.baseStats || {}).length > 0).length,
    withPerLevelGrowth: catalog.heroes.filter((entry) => Object.keys(entry.perLevelGrowth || {}).length > 0).length,
    withSkills: catalog.heroes.filter((entry) => (entry.skills || []).length > 0).length,
    withInspirations: catalog.heroes.filter((entry) => (entry.inspirations || []).length > 0).length,
    bySeason: countBy(catalog.heroes, (entry) => entry.season),
    byRarity: countBy(catalog.heroes, (entry) => entry.rarity),
    byElement: countBy(catalog.heroes, (entry) => entry.element),
    byOrientation: countBy(catalog.heroes, (entry) => entry.orientation),
    duplicateExternalIds: duplicateCount(catalog.heroes, (entry) => entry.externalId)
  },
  equipment: {
    total: catalog.equipment.length,
    withKnownSlot: catalog.equipment.filter((entry) => entry.slot !== "unknown").length,
    unknownSlot: catalog.equipment.filter((entry) => entry.slot === "unknown").length,
    enhancedVariants: catalog.equipment.filter((entry) => entry.enhancedVariant).length,
    withPrimaryStats: catalog.equipment.filter((entry) => (entry.primaryStats || []).length > 0).length,
    withRefinementCurve: catalog.equipment.filter((entry) => (entry.refinementCurve || []).length > 0).length,
    withSetEffectText: catalog.equipment.filter((entry) => (entry.setEffects || []).length > 0).length,
    bySlot: countBy(catalog.equipment, (entry) => entry.slot),
    byRarity: countBy(catalog.equipment, (entry) => entry.rarity),
    bySeason: countBy(catalog.equipment, (entry) => entry.season),
    primaryStatKinds: countBy(catalog.equipment, (entry) => (entry.primaryStats || []).map((stat) => stat.statKey)),
    duplicateExternalIds: duplicateCount(catalog.equipment, (entry) => entry.externalId)
  },
  artifacts: {
    total: catalog.artifacts.length,
    withPrimaryStats: catalog.artifacts.filter((entry) => (entry.primaryStats || []).length > 0).length,
    withRefinementCurve: catalog.artifacts.filter((entry) => (entry.refinementCurve || []).length > 0).length,
    withEffectLevels: catalog.artifacts.filter((entry) => (entry.effectLevels || []).length > 0).length,
    refinementCurveLevels: { minimum: Math.min(...refinementLengths), maximum: Math.max(...refinementLengths) },
    byRarity: countBy(catalog.artifacts, (entry) => entry.rarity),
    bySeason: countBy(catalog.artifacts, (entry) => entry.season),
    primaryStatKinds: countBy(catalog.artifacts, (entry) => (entry.primaryStats || []).map((stat) => stat.statKey)),
    duplicateExternalIds: duplicateCount(catalog.artifacts, (entry) => entry.externalId)
  },
  sets: {
    totalFamilies: catalog.setFamilies.length,
    withSemanticText: catalog.setFamilies.filter((entry) => (entry.effectTexts || []).length > 0).length,
    publicStaticSheetBonusDefinitions: gameData.sets.filter((entry) => entry.id.startsWith("set-public-") && (entry.bonuses || []).length > 0).length,
    executableSheetBonusDefinitions: gameData.sets.filter((entry) => (entry.bonuses || []).length > 0).length,
    bySeason: countBy(catalog.setFamilies, (entry) => entry.season)
  },
  definitions: {
    stats: gameData.statDefinitions,
    slots: gameData.slotDefinitions
  },
  limitations: [
    "The catalog is compiled from the public official Wiki and is not proof of the current China client.",
    "Owned inventory, random substats, locks and equipped relationships never come from the public catalog.",
    "Most set and artifact behavior remains source text, not executable combat semantics.",
    "Hero star, inspiration and current-build growth rules require client golden cases."
  ]
};

function tableRows(record) {
  return Object.entries(record).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
}

const markdown = `# 公共领域数据覆盖审计

生成：${audit.generatedAt}

数据版本：\`${audit.dataVersionId}\`

证据等级：公开目录已编译，**未经过当前游戏客户端验证**。

## 执行摘要

- 角色：${audit.heroes.total}，其中 ${audit.heroes.withBaseStats} 条带基础属性，${audit.heroes.withPerLevelGrowth} 条带每级成长，${audit.heroes.withSkills} 条带技能文本。
- 装备定义：${audit.equipment.total}，${audit.equipment.withKnownSlot} 条已映射槽位；仍有 ${audit.equipment.unknownSlot} 条特殊定义保持 unknown。
- 神器：${audit.artifacts.total}，${audit.artifacts.withPrimaryStats} 条带主属性，${audit.artifacts.withRefinementCurve} 条带 0–20 级强化属性曲线，${audit.artifacts.withEffectLevels} 条带 0–5 阶精炼效果文本。两类成长不可混用。
- 套装/变体家族：${audit.sets.totalFamilies}；其中 ${audit.sets.publicStaticSheetBonusDefinitions} 组官方 Wiki 静态效果通过白名单语法解析，加上 4 个种子定义，共 ${audit.sets.executableSheetBonusDefinitions} 组面板加成进入求解器。条件型效果只保存原文，不假装可计算。

这些数据适合充当所有账号共享的 \`GameDataVersion\`。它们不能回答用户拥有什么，也不能替代登录态采集器。

## 角色数据可直接承载的字段

\`externalId / name / season / rarity / element / orientation / attackType / baseStats / perLevelGrowth / skills / inspirations\`

角色稀有度分布：

| 稀有度 | 数量 |
|---|---:|
${tableRows(audit.heroes.byRarity)}

角色元素分布：

| 元素 | 数量 |
|---|---:|
${tableRows(audit.heroes.byElement)}

## 装备与神器

装备槽位分布：

| 槽位 | 定义数 |
|---|---:|
${tableRows(audit.equipment.bySlot)}

神器主属性覆盖：

| 属性 ID | 出现次数 |
|---|---:|
${tableRows(audit.artifacts.primaryStatKinds)}

建议继续保持两层：

1. \`ArtifactDefinition\` 保存所有账号共享的名称、品质、初始属性、强化曲线和效果原文。
2. \`OwnedArtifact\` 只保存某账号是否拥有、当前精炼/强化、锁定和穿戴者，并引用 definition ID。

装备同理：公共定义描述“可能存在什么”；\`OwnedGear\` 描述随机词条、强化等级、锁定和穿戴关系。

## 计算可用性

当前可直接进入面板求解的属性共 ${audit.definitions.stats.length} 类：${audit.definitions.stats.map((entry) => `\`${entry.id}\``).join("、")}。

七槽位模型为：${audit.definitions.slots.map((entry) => `\`${entry.id}\``).join("、")}。

以下仍不能作为已验证规则：星级/灵感成长、固定值与百分比的最终结算顺序、所有条件套装/神器效果、国服当前版本差异、重击率溢出机制。已解析静态套装仍属于“官方 Wiki 文本编译、未经客户端实测”。

## 数据质量与下一步

- 角色/装备/神器 external ID 重复数分别为 ${audit.heroes.duplicateExternalIds}/${audit.equipment.duplicateExternalIds}/${audit.artifacts.duplicateExternalIds}。
- 公共目录在仓库中可复算；来源、快照和编译器分离。
- 下一步不是继续堆 Wiki 摘要，而是用目标客户端截图建立版本映射和 golden cases，把公共 definition 与账号 owned records 对齐。
`;

const jsonPath = path.join(ROOT, "corpus", "compiled", "public-domain-audit.json");
const markdownPath = path.join(ROOT, "outputs", "public-domain-audit.md");
await mkdir(path.dirname(jsonPath), { recursive: true });
await mkdir(path.dirname(markdownPath), { recursive: true });
await Promise.all([
  writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`),
  writeFile(markdownPath, markdown)
]);
console.log(JSON.stringify({ jsonPath: path.relative(ROOT, jsonPath), markdownPath: path.relative(ROOT, markdownPath), heroes: audit.heroes.total, equipment: audit.equipment.total, artifacts: audit.artifacts.total, sets: audit.sets.totalFamilies }, null, 2));
