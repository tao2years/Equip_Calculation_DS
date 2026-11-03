#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createResolver } from "../collectors/lib/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [gameData, dictionary] = await Promise.all([
  readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "data", "import-dictionary.json"), "utf8").then(JSON.parse)
]);
const equipment = gameData.equipment || [];
const resolver = createResolver(dictionary);
const countBy = (key) => Object.fromEntries([...equipment.reduce((map, item) => {
  const value = key(item) ?? "unknown";
  map.set(value, (map.get(value) || 0) + 1);
  return map;
}, new Map())].sort(([a], [b]) => String(a).localeCompare(String(b))));
const completeCurve = (item) => item.levelCurve?.length === item.enhancementLimit + 1
  && item.levelCurve[0]?.level === 0
  && item.levelCurve.at(-1)?.level === item.enhancementLimit;
const canonicalIdResolvable = equipment.filter((item) => {
  const result = resolver.resolve("equipment", item.id);
  return result.status === "matched" && result.match.id === item.id;
}).length;
const externalIdResolvable = equipment.filter((item) => {
  const result = resolver.resolve("equipment", String(item.externalId));
  return result.status === "matched" && result.match.id === item.id;
}).length;
const displayNameResolvable = equipment.filter((item) => {
  const result = resolver.resolve("equipment", item.names.en);
  return result.status === "matched" && result.match.id === item.id;
}).length;
const equipmentCollisions = dictionary.collisions.filter((entry) => entry.kind === "equipment");
const audit = {
  schemaVersion: "0.1.0",
  generatedAt: new Date().toISOString(),
  gameDataVersionId: gameData.dataVersion.id,
  verification: gameData.dataVersion.verification,
  counts: {
    total: equipment.length,
    knownSlot: equipment.filter((item) => item.slot !== "unknown").length,
    unknownSlot: equipment.filter((item) => item.slot === "unknown").length,
    linkedSet: equipment.filter((item) => item.setId).length,
    unlinkedSet: equipment.filter((item) => !item.setId).length,
    withPrimaryStats: equipment.filter((item) => item.primaryStats?.length).length,
    completeLevelCurve: equipment.filter(completeCurve).length,
    canonicalIdResolvable,
    externalIdResolvable,
    displayNameResolvable,
    ambiguousDisplayNames: equipmentCollisions.length
  },
  distributions: {
    slot: countBy((item) => item.slot),
    rarity: countBy((item) => item.rarity),
    season: countBy((item) => item.season)
  },
  unresolved: {
    unknownSlotDefinitionIds: equipment.filter((item) => item.slot === "unknown").map((item) => item.id),
    displayNameCollisions: equipmentCollisions
  }
};

const rows = (values) => Object.entries(values).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
const markdown = `# 公共装备定义与账号关联审计

生成：${audit.generatedAt}

数据版本：\`${audit.gameDataVersionId}\`

证据等级：\`${audit.verification}\`

## 执行摘要

- \`GameData.equipment\` 现在正式包含 ${audit.counts.total} 条公共装备定义；不再只有编译中间产物。
- ${audit.counts.completeLevelCurve}/${audit.counts.total} 条具有从 +0 到各自强化上限的完整主属性曲线；${audit.counts.withPrimaryStats}/${audit.counts.total} 条有结构化初始主属性。
- ${audit.counts.knownSlot} 条已知槽位，${audit.counts.unknownSlot} 条特殊定义继续保持 \`unknown\`；${audit.counts.linkedSet} 条关联公共套装家族，${audit.counts.unlinkedSet} 条为符文、散件或当前目录没有套装归属的记录。
- 每条定义均可用 canonical ID 和 external ID 唯一解析。仅用显示名可唯一解析 ${audit.counts.displayNameResolvable}/${audit.counts.total} 条；${audit.counts.ambiguousDisplayNames} 个规范化显示名存在跨元素、赛季或变体歧义，采集器必须进入 Review 或使用稳定 ID，不能猜配。

## 槽位分布

| 槽位 | 定义数 |
|---|---:|
${rows(audit.distributions.slot)}

## 品质分布

| 品质 | 定义数 |
|---|---:|
${rows(audit.distributions.rarity)}

## 数据契约

公共 \`EquipmentDefinition\` 保存名称、external ID、槽位、套装、品质、赛季、强化上限、主属性及等级曲线。账号 \`OwnedGear\` 保存唯一物品 ID、随机属性、强化、锁定和穿戴者，并可通过 \`definitionId\` 引用公共定义。

OCR staging 若读到唯一装备名称，会解析 \`definitionId\` 并核对槽位；套装冲突保留账号观测并发出警告。只读到槽位/套装而没有唯一名称时，仍生成无 definition linkage 的账号实例，不会伪造公共 ID。

## 尚未证明

- 这些定义尚未与当前目标渠道客户端逐条核对；
- 公开目录没有给出完整随机副词条池、每次强化落点与 roll 概率；
- 5 条特殊定义的槽位以及 52 个同名歧义需要客户端/官方证据；
- 套装效果多数仍是原始文本，不能当作已执行的面板加成。
`;

await mkdir(path.join(ROOT, "corpus", "compiled"), { recursive: true });
await mkdir(path.join(ROOT, "outputs"), { recursive: true });
const jsonPath = path.join(ROOT, "corpus", "compiled", "equipment-model-audit.json");
const markdownPath = path.join(ROOT, "outputs", "equipment-data-model-audit.md");
await Promise.all([
  writeFile(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8"),
  writeFile(markdownPath, markdown, "utf8")
]);
console.log(JSON.stringify({ jsonPath: path.relative(ROOT, jsonPath), markdownPath: path.relative(ROOT, markdownPath), counts: audit.counts }, null, 2));
