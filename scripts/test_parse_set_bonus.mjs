#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStaticSetBonus } from "./lib/parse-set-bonus.mjs";
import { calculateSheet } from "../prototype/optimizer-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

assert.deepEqual(parseStaticSetBonus("[2-piece] ATK%+20%，Crit Rate+10%"), {
  pieces: 2,
  sheetStats: { atk_pct: 0.2, crit_rate: 0.1 },
  evidence: "parsed_static_official_wiki_text",
  sourceText: "[2-piece] ATK%+20%，Crit Rate+10%"
});
assert.deepEqual(parseStaticSetBonus("[2-piece] Attack+100，Skill Haste+20"), {
  pieces: 2,
  sheetStats: { atk_flat: 100, skill_haste: 20 },
  evidence: "parsed_static_official_wiki_text",
  sourceText: "[2-piece] Attack+100，Skill Haste+20"
});
assert.deepEqual(parseStaticSetBonus("[2-piece] HP%+20%，DEF%+15%")?.sheetStats, { hp_pct: 0.2, def_pct: 0.15 });

for (const unsafeText of [
  "[2-piece] Each time the wearer attacks, ATK%+2% for 10s",
  "[2-piece] Heals are increased by [+25%]",
  "[2-piece] Unknown Power+20",
  "[2-piece] Crit Rate+10",
  "[2-piece] Accuracy+40%",
  "ATK%+20%"
]) {
  assert.equal(parseStaticSetBonus(unsafeText), null, `must reject conditional or malformed effect: ${unsafeText}`);
}

const catalog = JSON.parse(await readFile(path.join(ROOT, "corpus", "compiled", "public-catalogs.json"), "utf8"));
const parsed = catalog.setFamilies.flatMap((family) =>
  (family.effectTexts || []).map((text) => ({ family, text, bonus: parseStaticSetBonus(text) })).filter((entry) => entry.bonus)
);
assert.ok(parsed.length >= 100, `expected broad static-set coverage, got ${parsed.length}`);
assert.ok(parsed.every((entry) => Object.keys(entry.bonus.sheetStats).length > 0));

const gameData = JSON.parse(await readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8"));
const publicHpSet = gameData.sets.find((entry) =>
  entry.id.startsWith("set-public-") && entry.bonuses?.some((bonus) => bonus.sheetStats?.hp_pct === 0.2 && bonus.sheetStats?.resistance === 60)
);
assert.ok(publicHpSet, "compiled game data must contain an executable public static set");
const sheet = calculateSheet(
  gameData,
  { baseStats: { hp_flat: 1000 }, perLevelGrowth: {} },
  { level: 1 },
  [
    { ownedItemId: "set-test-helmet", slot: "helmet", setId: publicHpSet.id, stats: {} },
    { ownedItemId: "set-test-weapon", slot: "weapon", setId: publicHpSet.id, stats: {} }
  ],
  null
);
assert.equal(sheet.stats.hp_sheet, 1200);
assert.equal(sheet.stats.resistance, 60);
assert.deepEqual(sheet.setLabels, [`${publicHpSet.names.en} 2件`]);

console.log(JSON.stringify({ test: "parse-static-set-bonus", parsedOfficialWikiEffects: parsed.length, status: "passed" }, null, 2));
