#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeStaging } from "../collectors/lib/finalize-staging.mjs";
import { enumerateBuilds, resolveArtifactStats } from "../prototype/optimizer-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [gameData, account, staging, dictionary] = await Promise.all([
  readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "examples", "account-snapshot.example.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "examples", "ocr-staging.example.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "data", "import-dictionary.json"), "utf8").then(JSON.parse)
]);
const request = {
  gameData,
  account,
  ownedHeroId: "owned-aschetius",
  artifactId: "art-001",
  constraints: { crit_rate: 1, atk_sheet: 500, hp_sheet: 7000, accuracy: 0 },
  objective: "crit_proxy",
  limit: 20
};
const curveOnly = resolveArtifactStats(gameData, {
  ownedArtifactId: "curve-only",
  artifactDefinitionId: "artifact-malicious-manacle",
  level: 20,
  refinement: 5,
  locked: false
});
assert.equal(curveOnly.source, "public_level_curve");
assert.equal(curveOnly.stats.atk_flat, 335);
assert.equal(Number(curveOnly.stats.crit_damage.toFixed(2)), 0.8);
const observedOverride = resolveArtifactStats(gameData, {
  ownedArtifactId: "observed-override",
  artifactDefinitionId: "artifact-malicious-manacle",
  level: 20,
  refinement: 5,
  observedStats: [{ stat: "atk_flat", value: 999, raw_text: "Attack +999", confidence: 1 }],
  locked: false
});
assert.equal(observedOverride.source, "account_observed");
assert.deepEqual(observedOverride.stats, { atk_flat: 999 });
assert(observedOverride.warnings.some((entry) => entry.includes("计算采用账号观测值")));
const result = enumerateBuilds(request);
assert.equal(result.searched, 64);
assert.equal(result.validCount, 1);
assert.equal(result.results.length, 1);
assert.equal(result.results[0].stats.crit_rate, 1);
assert.deepEqual(result.results[0].gear.map((item) => item.ownedItemId), ["helm-001", "weapon-001", "chest-001", "gloves-001", "prune-001", "nrune-001"]);

const fullCritObjective = enumerateBuilds({
  ...request,
  constraints: [],
  objective: { kind: "full_crit_damage_proxy", direction: "maximize" }
});
assert.deepEqual(fullCritObjective.impliedConstraints, [
  { stat: "crit_rate", op: ">=", value: 1, layer: "sheet", source: "objective_full_crit" }
]);
assert(fullCritObjective.results.length > 0);
assert(fullCritObjective.results.every((entry) => entry.stats.crit_rate >= 1));
assert.equal(
  fullCritObjective.results[0].objectiveScore,
  fullCritObjective.results[0].stats.atk_sheet * (1 + fullCritObjective.results[0].stats.crit_damage)
);
const impossibleFullCrit = enumerateBuilds({
  ...request,
  constraints: [],
  fixed: { helmet: "helm-002" },
  objective: { kind: "full_crit_damage_proxy", direction: "maximize" }
});
assert.equal(impossibleFullCrit.validCount, 0);
const leveledWithoutObservation = structuredClone(account);
leveledWithoutObservation.ownedHeroes[0].level = 2;
assert.throws(() => enumerateBuilds({ ...request, account: leveledWithoutObservation }), /缺少账号观测基础属性/);
const explicitlyUnverifiedGrowth = enumerateBuilds({ ...request, account: leveledWithoutObservation, allowUnverifiedHeroGrowth: true });
assert.match(explicitlyUnverifiedGrowth.results[0].heroBaseSource, /未验证星级\/灵感修正/);
const anomalyGameData = structuredClone(gameData);
anomalyGameData.heroDataQuality.records.find((entry) => entry.heroDefinitionId === account.ownedHeroes[0].heroDefinitionId).requiresObservedBaseStats = true;
anomalyGameData.heroDataQuality.records.find((entry) => entry.heroDefinitionId === account.ownedHeroes[0].heroDefinitionId).anomalyFlags = ["synthetic_test_outlier"];
assert.throws(() => enumerateBuilds({ ...request, gameData: anomalyGameData }), /公共基础属性触发数据异常复核/);
assert.throws(() => enumerateBuilds({ ...request, gameData: anomalyGameData, allowUnverifiedHeroGrowth: true }), /公共基础属性触发数据异常复核/);

const fixed = enumerateBuilds({ ...request, fixed: { helmet: "helm-002" } });
assert.equal(fixed.searched, 32);
assert.equal(fixed.validCount, 0);
assert.equal(Number(fixed.maxima.crit_rate.toFixed(2)), 0.85);

const inventoryOnly = enumerateBuilds({
  ...request,
  candidatePolicy: { equippedItems: "inventory_only", respectItemLocks: false }
});
assert.equal(inventoryOnly.searched, 1);
assert.deepEqual(inventoryOnly.results.map((entry) => entry.gear.map((item) => item.ownedItemId)), []);
assert.throws(() => enumerateBuilds({
  ...request,
  candidatePolicy: { equippedItems: "inventory_only", respectItemLocks: true }
}), /No candidate gear for helmet/);
const fixedOverridesPolicy = enumerateBuilds({
  ...request,
  fixed: { helmet: "helm-002" },
  candidatePolicy: { equippedItems: "inventory_only", respectItemLocks: true },
  constraints: []
});
assert.equal(fixedOverridesPolicy.searched, 1);

const defenseMax = enumerateBuilds({
  ...request,
  constraints: [{ stat: "def_sheet", op: ">=", value: 0, layer: "sheet" }],
  objective: { kind: "single_stat", stat: "def_sheet", direction: "maximize" }
});
assert.equal(defenseMax.results[0].stats.def_sheet, defenseMax.maxima.def_sheet);
const defenseMin = enumerateBuilds({
  ...request,
  constraints: [{ stat: "def_sheet", op: "<=", value: defenseMax.maxima.def_sheet, layer: "sheet" }],
  objective: { kind: "single_stat", stat: "def_sheet", direction: "minimize" }
});
assert.equal(defenseMin.results[0].stats.def_sheet, defenseMin.minima.def_sheet);
assert.equal(defenseMin.results[0].objectiveScore, defenseMin.minima.def_sheet);

const finalized = finalizeStaging(staging, dictionary, gameData);
assert.equal(finalized.ok, true);
const fromOcr = enumerateBuilds({ ...request, account: finalized.snapshot });
assert.equal(fromOcr.searched, result.searched);
assert.equal(fromOcr.validCount, result.validCount);
assert.deepEqual(fromOcr.results[0].gear.map((item) => item.ownedItemId), result.results[0].gear.map((item) => item.ownedItemId));

function scalableFixture(itemsPerSlot = 5) {
  const setIds = ["set-barbarian", "set-predator", "set-goblin", "set-guardian", null];
  const gear = [];
  const slots = ["helmet", "weapon", "chest", "gloves", "positive_rune", "negative_rune"];
  for (const [slotIndex, slot] of slots.entries()) {
    for (let index = 0; index < itemsPerSlot; index += 1) {
      gear.push({
        ownedItemId: `scale-${slotIndex}-${String(index).padStart(2, "0")}`,
        slot,
        setId: setIds[(slotIndex + index) % setIds.length],
        enhanceLevel: 16,
        stats: {
          atk_flat: 20 + ((index * 17 + slotIndex * 11) % 70),
          atk_pct: ((index * 7 + slotIndex * 3) % 18) / 100,
          hp_flat: 100 + ((index * 193 + slotIndex * 71) % 900),
          hp_pct: ((index * 5 + slotIndex * 2) % 16) / 100,
          def_flat: 10 + ((index * 13 + slotIndex * 5) % 55),
          crit_rate: ((index * 3 + slotIndex) % 12) / 100,
          crit_damage: ((index * 9 + slotIndex * 4) % 24) / 100,
          accuracy: (index * 7 + slotIndex * 3) % 30
        },
        locked: false,
        equippedBy: null
      });
    }
  }
  return { ...account, snapshotId: `scale-${itemsPerSlot}`, ownedGear: gear };
}

const scalableAccount = scalableFixture();
for (const scenario of [
  { constraints: [], objective: { kind: "single_stat", stat: "atk_sheet", direction: "maximize" } },
  { constraints: [], objective: { kind: "single_stat", stat: "hp_sheet", direction: "minimize" } },
  { constraints: [{ stat: "crit_rate", op: ">=", value: 0.55, layer: "sheet" }], objective: { kind: "crit_proxy", direction: "maximize" } },
  { constraints: [], objective: { kind: "full_crit_damage_proxy", direction: "maximize" } },
  { constraints: [{ stat: "accuracy", op: ">=", value: 70, layer: "sheet" }, { stat: "crit_rate", op: "<=", value: 0.9, layer: "sheet" }], objective: { kind: "weighted_stats", direction: "maximize", weights: { atk_sheet: 1, crit_damage: 600, accuracy: 2 } } }
]) {
  const common = { ...request, account: scalableAccount, constraints: scenario.constraints, objective: scenario.objective, limit: 10 };
  const exhaustive = enumerateBuilds({ ...common, solverMode: "exhaustive" });
  const bounded = enumerateBuilds({ ...common, solverMode: "branch_and_bound" });
  assert.equal(bounded.solver.topNExact, true);
  assert.equal(bounded.searchSpace, exhaustive.searchSpace);
  assert.deepEqual(
    bounded.results.map((entry) => [entry.gear.map((item) => item.ownedItemId).join("|"), Number(entry.score.toFixed(8))]),
    exhaustive.results.map((entry) => [entry.gear.map((item) => item.ownedItemId).join("|"), Number(entry.score.toFixed(8))])
  );
}

const heuristic = enumerateBuilds({
  ...request,
  account: scalableAccount,
  constraints: [],
  objective: { kind: "crit_proxy", direction: "maximize" },
  solverMode: "heuristic_candidate_cap",
  heuristicCandidateCap: 3
});
assert.equal(heuristic.solver.mode, "heuristic_candidate_cap");
assert.equal(heuristic.solver.topNExact, false);
assert.equal(heuristic.solver.validCountExact, false);
assert.equal(heuristic.solver.reducedSearchSpace, 3 ** 6);
assert(heuristic.solver.candidateCounts.every((entry) => entry.before === 5 && entry.after === 3));

console.log("Optimizer tests passed: full-crit implied constraint, artifact provenance, canonical/OCR parity, generic constraints, and exact Top-N parity");
