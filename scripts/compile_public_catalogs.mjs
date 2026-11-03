#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_ROOT = path.join(ROOT, "raw", "public-web");
const OUTPUT_DIR = path.join(ROOT, "corpus", "compiled");

const STAT_KEYS = new Map([
  ["HP", "hp_flat"], ["Health", "hp_flat"], ["HP%", "hp_pct"],
  ["Attack", "atk_flat"], ["ATK", "atk_flat"], ["Attack%", "atk_pct"], ["ATK%", "atk_pct"],
  ["Defense", "def_flat"], ["DEF", "def_flat"], ["Defense%", "def_pct"], ["DEF%", "def_pct"],
  ["Crit Rate", "crit_rate"], ["Crit Damage", "crit_damage"], ["Crit Dmg", "crit_damage"],
  ["Accuracy", "accuracy"], ["Resistance", "resistance"],
  ["Mastery", "enlightenment"], ["Enlightenment", "enlightenment"],
  ["Skill Haste", "skill_haste"], ["Attack Speed", "attack_speed_pct"]
]);

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function latestSnapshot(sourceId) {
  const sourceRoot = path.join(RAW_ROOT, sourceId);
  const dates = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const date = dates.at(-1);
  if (!date) throw new Error(`No snapshot exists for ${sourceId}`);
  const dir = path.join(sourceRoot, date);
  const [html, metadata] = await Promise.all([
    readFile(path.join(dir, "snapshot.html"), "utf8"),
    readFile(path.join(dir, "metadata.json"), "utf8").then(JSON.parse)
  ]);
  return { date, html, metadata };
}

function extractNuxt(html, sourceId) {
  const match = html.match(/<script>(window\.__NUXT__=[\s\S]*?)<\/script>/);
  if (!match) throw new Error(`window.__NUXT__ not found in ${sourceId}`);
  const sandbox = { window: {} };
  vm.runInNewContext(match[1], sandbox, { timeout: 5000, filename: `${sourceId}-nuxt-state.js` });
  if (!sandbox.window.__NUXT__) throw new Error(`window.__NUXT__ did not initialize for ${sourceId}`);
  return sandbox.window.__NUXT__;
}

function evidence(sourceId, snapshot) {
  return {
    sourceId,
    requestedUrl: snapshot.metadata.requestedUrl,
    retrievedAt: snapshot.metadata.retrievedAt,
    snapshotPath: snapshot.metadata.snapshotPath,
    snapshotSha256: snapshot.metadata.sha256 || sha256(snapshot.html)
  };
}

function heroStats(hero) {
  return {
    hp_flat: hero["max_health*base"],
    def_flat: hero["defense*base"],
    atk_flat: hero["phy_dmg*base"],
    crit_rate: hero["crit_chance*bpct"],
    crit_damage: hero["crit_bonus*bpct"],
    accuracy: hero["accuracy*base"],
    resistance: hero["resistance*base"],
    enlightenment: hero["mastery*base"],
    skill_haste: hero["cd_haste*base"],
    attack_speed_pct: hero["atk_speed*bpct"]
  };
}

function heroGrowth(hero) {
  const growth = hero.lv_up_base || {};
  return {
    hp_flat: growth["max_health*base"],
    def_flat: growth["defense*base"],
    atk_flat: growth["phy_dmg*base"],
    crit_rate: growth["crit_chance*bpct"],
    crit_damage: growth["crit_bonus*bpct"],
    accuracy: growth["accuracy*base"],
    resistance: growth["resistance*base"],
    enlightenment: growth["mastery*base"],
    skill_haste: growth["cd_haste*base"],
    attack_speed_pct: growth["atk_speed*bpct"]
  };
}

function compileHero(hero) {
  const skills = Object.values(hero.skill || {})
    .filter(Boolean)
    .map((skill) => ({ id: skill.skillid, name: skill.skillname, description: skill.skilldesc }))
    .sort((a, b) => a.id - b.id);
  const inspirations = [1, 2, 3, 4, 5]
    .map((index) => hero[`inspiration${index}`])
    .filter(Boolean)
    .map((item, index) => ({ tier: index + 1, id: item.id, name: item.show_name || null, description: item.spell_tips }));
  return {
    heroDefinitionId: `hero-${hero.heroId || hero.id}`,
    externalId: hero.heroId || hero.id,
    name: hero.heroname,
    season: hero.season,
    rarity: hero.rarity,
    element: hero.element,
    orientation: hero.orientation,
    attackType: hero.atk_type,
    race: hero.hero_race,
    career: hero.hero_career,
    alignment: hero.hero_alignment,
    baseStats: heroStats(hero),
    perLevelGrowth: heroGrowth(hero),
    skills,
    inspirations,
    recommendedEquipmentExternalIds: hero.tj_eq || [],
    recommendedArtifactExternalIds: hero.tj_sq || [],
    recommendedTeamHeroExternalIds: hero.tj_team || [],
    assetUrls: { portrait: hero.avatarPath || null, elementIcon: hero.element_icon || null },
    verificationState: "public_catalog_compiled_not_client_validated"
  };
}

function statDefinition(entry) {
  const group = entry?.abt_group || {};
  return {
    groupId: group.abt_group || group.id || null,
    rawName: group.abt_name || null,
    statKey: STAT_KEYS.get(group.abt_name) || null,
    rollLower: group.lower_limit ?? null,
    rollUpper: group.upper_limit ?? null,
    sourceQualityCode: group.quality ?? null
  };
}

function refinementCurve(item) {
  const fields = item.abt_up_data?.fields || [];
  const statFields = fields.filter((field) => field.key !== "lv");
  return (item.abt_up_data?.data || []).map((row) => ({
    level: Number.parseInt(String(row.lv || "0").replace("+", ""), 10),
    values: Object.fromEntries(statFields.map((field, index) => [
      STAT_KEYS.get(field.label) || `unknown:${field.label}`,
      row[`attrNum_${index + 1}`] ?? null
    ])),
    displayValues: Object.fromEntries(statFields.map((field, index) => [field.label, row[`attr_${index + 1}`] ?? null]))
  }));
}

function inferSlot(name) {
  if (/Positive Rune$/i.test(name)) return "positive_rune";
  if (/Negative Rune$/i.test(name)) return "negative_rune";
  if (/(Helm|Helmet|Cowl|Hat|Hood|Headgear|Crown|Kerchief)\+?$/i.test(name)) return "helmet";
  if (/(Gloves|Gauntlets)\+?$/i.test(name)) return "gloves";
  if (/(Armor|Armour|Mail|Robe|Tunic|Cloak|Leather)\+?$/i.test(name)) return "chest";
  if (/(Weapon|Sword|Hammer|Crossbow|Staff|Dagger|Axe|Flintlock|Pipe|Rapier|Cutlass|Battleaxe|Scepter|Greataxe|Whip|Bow|Blade|Longbow|Halberd)\+?$/i.test(name)) return "weapon";
  return "unknown";
}

function inferSetName(name, slot) {
  if (["positive_rune", "negative_rune", "unknown"].includes(slot)) return null;
  return name.replace(/\s*-?\s*(Helm|Helmet|Cowl|Hat|Hood|Headgear|Crown|Kerchief|Gloves|Gauntlets|Armor|Armour|Mail|Robe|Tunic|Cloak|Leather|Weapon|Sword|Hammer|Crossbow|Staff|Dagger|Axe|Flintlock|Pipe|Rapier|Cutlass|Battleaxe|Scepter|Greataxe|Whip|Bow|Blade|Longbow|Halberd)\+?$/i, "").trim() || null;
}

function compileCatalogItem(item) {
  const isArtifact = item.equipmentType === 1;
  const slot = isArtifact ? "artifact" : inferSlot(item.show_name || "");
  return {
    definitionId: `${isArtifact ? "artifact" : "equipment"}-${item.artifact_id || item.equipment_id || item.id}`,
    externalId: item.artifact_id || item.equipment_id || item.id,
    recordId: item.id,
    kind: isArtifact ? "artifact" : "equipment",
    name: item.show_name,
    rarity: item.rarity,
    season: item.season,
    slot,
    setName: isArtifact ? null : inferSetName(item.show_name || "", slot),
    enhancedVariant: /\+$/.test(item.show_name || ""),
    enhancementLimit: item.enhancement_limit,
    primaryStats: (item.primary_abt || []).map(statDefinition),
    refinementCurve: refinementCurve(item),
    effectLevels: isArtifact
      ? (item.spell_id || []).map((spell, index) => ({ refinement: index, id: spell.id, name: spell.show_name || null, description: spell.spell_tips || null }))
      : [],
    setEffects: isArtifact ? [] : (item.suite_data || []).filter(Boolean),
    assetUrl: item.iconPath || null,
    verificationState: "public_catalog_compiled_not_client_validated"
  };
}

const [heroSnapshot, equipmentSnapshot] = await Promise.all([
  latestSnapshot("SRC-005"),
  latestSnapshot("SRC-004")
]);
const heroState = extractNuxt(heroSnapshot.html, "SRC-005");
const equipmentState = extractNuxt(equipmentSnapshot.html, "SRC-004");
const heroesRaw = heroState.data?.[0]?.hero_list || [];
const equipmentRaw = equipmentState.data?.[0]?.equipList || [];
if (!heroesRaw.length || !equipmentRaw.length) throw new Error("Catalog extraction produced an empty collection");

const heroes = heroesRaw.map(compileHero).sort((a, b) => a.externalId - b.externalId);
const catalog = equipmentRaw.map(compileCatalogItem);
const artifacts = catalog.filter((item) => item.kind === "artifact");
const equipment = catalog.filter((item) => item.kind === "equipment");
const unknownSlots = equipment.filter((item) => item.slot === "unknown");
const setFamilyMap = new Map();
for (const item of equipment.filter((entry) => entry.setName && entry.setEffects.length)) {
  const key = `${item.season || "unknown"}|${item.setName}|${item.enhancedVariant ? "plus" : "normal"}`;
  if (!setFamilyMap.has(key)) {
    setFamilyMap.set(key, {
      setDefinitionId: `set-public-${sha256(key).slice(0, 12)}`,
      name: item.setName,
      season: item.season,
      enhancedVariant: item.enhancedVariant,
      slots: new Set(),
      equipmentDefinitionIds: [],
      effectTexts: new Set(),
      verificationState: "public_catalog_compiled_not_client_validated"
    });
  }
  const family = setFamilyMap.get(key);
  family.slots.add(item.slot);
  family.equipmentDefinitionIds.push(item.definitionId);
  item.setEffects.forEach((effect) => family.effectTexts.add(effect));
}
const setFamilies = [...setFamilyMap.values()].map((family) => ({
  ...family,
  slots: [...family.slots].sort(),
  equipmentDefinitionIds: family.equipmentDefinitionIds.sort(),
  effectTexts: [...family.effectTexts]
}));

const output = {
  schemaVersion: "0.1.0",
  compiledAt: [heroSnapshot.metadata.retrievedAt, equipmentSnapshot.metadata.retrievedAt].sort().at(-1),
  compiler: "scripts/compile_public_catalogs.mjs",
  sources: [evidence("SRC-005", heroSnapshot), evidence("SRC-004", equipmentSnapshot)],
  limitations: [
    "This is a structured compilation of the official Wiki (identity evidenced by SRC-024), not an official client/account export.",
    "Region, season, and future-release records may coexist in the source catalog.",
    "Unknown slots and semantic combat effects require manual review before optimizer use.",
    "Image URLs are references only; this repository does not copy the image assets."
  ],
  coverage: {
    heroes: heroes.length,
    equipment: equipment.length,
    artifacts: artifacts.length,
    setFamilies: setFamilies.length,
    equipmentWithUnknownSlot: unknownSlots.length,
    seasons: [...new Set([...heroes, ...catalog].map((item) => item.season).filter(Boolean))].sort()
  },
  heroes,
  equipment,
  artifacts,
  setFamilies
};

await mkdir(OUTPUT_DIR, { recursive: true });
const outputPath = path.join(OUTPUT_DIR, "public-catalogs.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(ROOT, outputPath), coverage: output.coverage }, null, 2));
