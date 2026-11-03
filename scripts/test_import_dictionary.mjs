#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createResolver } from "../collectors/lib/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dictionary = JSON.parse(await readFile(path.join(ROOT, "data", "import-dictionary.json"), "utf8"));
const resolver = createResolver(dictionary);
const cases = [
  ["stat", "生命百分比", "hp_pct"],
  ["stat", "暴击率", "crit_rate"],
  ["stat", "技能极速", "skill_haste"],
  ["slot", "盔甲", "chest"],
  ["slot", "正位符文", "positive_rune"],
  ["artifact", "巨人眼球", "artifact-eyeball-of-the-giant"],
  ["artifact", "太阳王号角", "artifact-400010"]
];
const equipmentCollisionAliases = new Set(dictionary.collisions.filter((entry) => entry.kind === "equipment").map((entry) => entry.normalized));
const firstUniqueEquipment = dictionary.entities.equipment.find((entry) => entry.aliases.some((alias) => !equipmentCollisionAliases.has(alias.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""))));
const equipmentAlias = firstUniqueEquipment.aliases.find((alias) => resolver.resolve("equipment", alias).status === "matched");
cases.push(["equipment", equipmentAlias, firstUniqueEquipment.id]);
for (const [kind, input, expected] of cases) {
  const result = resolver.resolve(kind, input);
  if (result.status !== "matched" || result.match.id !== expected) {
    throw new Error(`${kind}:${input} expected ${expected}, got ${JSON.stringify(result)}`);
  }
}
const unknown = resolver.resolve("artifact", "不存在的神器");
if (unknown.status !== "unmatched") throw new Error(`Unknown alias should remain unmatched: ${JSON.stringify(unknown)}`);
for (const collision of dictionary.collisions.filter((entry) => ["stat", "slot", "artifact", "rarity"].includes(entry.kind))) {
  throw new Error(`Load-bearing alias collision must be resolved: ${JSON.stringify(collision)}`);
}
console.log(`Import dictionary tests passed: ${cases.length + 1}`);
