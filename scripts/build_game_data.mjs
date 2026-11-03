#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = JSON.parse(await readFile(path.join(ROOT, "data", "game-data.seed.json"), "utf8"));
const publicCatalog = JSON.parse(await readFile(path.join(ROOT, "corpus", "compiled", "public-catalogs.json"), "utf8"));

const seedHeroById = new Map(seed.heroes.map((hero) => [hero.id, hero]));
const seedArtifactByName = new Map(seed.artifacts.map((artifact) => [artifact.names.en.toLowerCase(), artifact]));

const heroes = publicCatalog.heroes.map((hero) => {
  const id = hero.heroDefinitionId;
  const override = seedHeroById.get(id);
  return {
    id,
    externalId: hero.externalId,
    names: { en: hero.name, ...(override?.names.zh ? { zh: override.names.zh } : {}) },
    rarity: String(hero.rarity || "unknown").toLowerCase(),
    element: String(hero.element || "unknown").toLowerCase(),
    orientation: hero.orientation,
    attackType: hero.attackType,
    season: hero.season,
    baseStats: hero.baseStats,
    perLevelGrowth: hero.perLevelGrowth,
    skills: hero.skills,
    inspirations: hero.inspirations,
    source: {
      sourceId: "SRC-005",
      url: "https://www.dragonheir.info/heroes",
      verification: "public_catalog_compiled_not_client_validated"
    }
  };
});

const artifacts = publicCatalog.artifacts.map((artifact) => {
  const override = seedArtifactByName.get(artifact.name.toLowerCase());
  return {
    id: override?.id || artifact.definitionId,
    externalId: artifact.externalId,
    names: { en: artifact.name, ...(override?.names.zh ? { zh: override.names.zh } : {}) },
    rarity: String(artifact.rarity || "unknown").toLowerCase(),
    season: artifact.season,
    primaryStatKinds: artifact.primaryStats.map((stat) => stat.statKey).filter(Boolean),
    primaryStats: artifact.primaryStats,
    levelCurve: artifact.refinementCurve,
    effectLevels: artifact.effectLevels,
    effectSummary: artifact.effectLevels[0]?.description || override?.effectSummary || "",
    restrictions: override?.restrictions || null,
    source: {
      sourceId: "SRC-004",
      url: "https://www.dragonheir.info/equipment",
      verification: "public_catalog_compiled_not_client_validated"
    }
  };
});

const setIdByEquipmentId = new Map();
for (const family of publicCatalog.setFamilies) {
  for (const definitionId of family.equipmentDefinitionIds || []) setIdByEquipmentId.set(definitionId, family.setDefinitionId);
}
const equipment = publicCatalog.equipment.map((item) => ({
  id: item.definitionId,
  externalId: item.externalId,
  names: { en: item.name },
  rarity: String(item.rarity || "unknown").toLowerCase(),
  season: item.season || null,
  slot: item.slot,
  setId: setIdByEquipmentId.get(item.definitionId) || null,
  enhancedVariant: Boolean(item.enhancedVariant),
  enhancementLimit: Number(item.enhancementLimit || 0),
  primaryStatKinds: item.primaryStats.map((stat) => stat.statKey).filter(Boolean),
  primaryStats: item.primaryStats,
  levelCurve: item.refinementCurve,
  semanticEffects: item.setEffects || [],
  assetUrl: item.assetUrl || null,
  source: {
    sourceId: "SRC-004",
    url: "https://www.dragonheir.info/equipment",
    verification: "public_catalog_compiled_not_client_validated"
  }
}));

const publicSets = publicCatalog.setFamilies.map((family) => {
  return {
    id: family.setDefinitionId,
    names: { en: `${family.name}${family.enhancedVariant ? "+" : ""}` },
    season: family.season,
    enhancedVariant: family.enhancedVariant,
    bonuses: [],
    semanticEffects: family.effectTexts,
    equipmentDefinitionIds: family.equipmentDefinitionIds,
    source: {
      sourceId: "SRC-004",
      url: "https://www.dragonheir.info/equipment",
      verification: "public_effect_text_not_structured_for_calculation"
    }
  };
});
const sets = [];
const seenSetIds = new Set();
for (const set of [...publicSets, ...seed.sets]) {
  if (seenSetIds.has(set.id)) continue;
  seenSetIds.add(set.id);
  sets.push(set);
}

const data = {
  schemaVersion: "0.2.0-public-prototype",
  dataVersion: {
    id: `public-catalog-${publicCatalog.compiledAt.slice(0, 10)}`,
    region: "unknown_mixed_public_catalog",
    channel: "public_web",
    releaseLine: "mixed_s1_s9",
    retrievedAt: publicCatalog.compiledAt,
    verification: "public_catalog_compiled_not_client_validated"
  },
  statDefinitions: seed.statDefinitions,
  slotDefinitions: seed.slotDefinitions,
  heroes,
  equipment,
  sets,
  artifacts,
  catalogCoverage: publicCatalog.coverage,
  calculationAssumptions: seed.calculationAssumptions
};

const output = path.join(ROOT, "data", "game-data.public.json");
await writeFile(output, `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(ROOT, output), heroes: heroes.length, equipment: equipment.length, artifacts: artifacts.length, setDefinitions: data.sets.length, setsWithSheetBonuses: data.sets.filter((set) => set.bonuses.length).length }, null, 2));
