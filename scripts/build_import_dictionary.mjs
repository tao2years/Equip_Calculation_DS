#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAlias } from "../collectors/lib/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameData = JSON.parse(await readFile(path.join(ROOT, "data", "game-data.public.json"), "utf8"));
const curated = JSON.parse(await readFile(path.join(ROOT, "research", "curated-aliases.json"), "utf8"));

const entities = { stat: [], slot: [], rarity: [], hero: [], equipment: [], artifact: [], set: [] };
const byKindAndId = new Map();

function add(kind, id, externalId, aliases, verification = "public_catalog") {
  const key = `${kind}:${id}`;
  let entry = byKindAndId.get(key);
  if (!entry) {
    entry = { id, externalId: externalId ?? null, aliases: [], verification: new Set() };
    byKindAndId.set(key, entry);
    entities[kind].push(entry);
  }
  for (const alias of aliases.filter(Boolean)) if (!entry.aliases.includes(alias)) entry.aliases.push(alias);
  entry.verification.add(verification);
  return entry;
}

for (const stat of gameData.statDefinitions) add("stat", stat.id, null, [stat.id, stat.labelZh]);
for (const slot of gameData.slotDefinitions) add("slot", slot.id, null, [slot.id, slot.labelZh]);
add("slot", "artifact", null, ["artifact"]);
for (const rarity of ["common", "rare", "epic", "legendary", "mythic", "unknown"]) add("rarity", rarity, null, [rarity]);
for (const hero of gameData.heroes) add("hero", hero.id, hero.externalId, Object.values(hero.names));
for (const equipment of gameData.equipment || []) add("equipment", equipment.id, equipment.externalId, [equipment.id, String(equipment.externalId), ...Object.values(equipment.names)]);
for (const artifact of gameData.artifacts) add("artifact", artifact.id, artifact.externalId, Object.values(artifact.names));
for (const set of gameData.sets) add("set", set.id, null, Object.values(set.names));

for (const alias of curated.entries) {
  let id = alias.canonicalId;
  if (!id && alias.externalId != null) {
    const candidates = entities[alias.kind].filter((entry) => entry.externalId === alias.externalId);
    if (candidates.length !== 1) throw new Error(`Curated alias cannot resolve ${alias.kind} externalId=${alias.externalId}`);
    id = candidates[0].id;
  }
  if (!id) throw new Error(`Curated alias lacks canonicalId/externalId for ${alias.kind}`);
  add(alias.kind, id, alias.externalId, alias.aliases, alias.verification);
}

for (const entries of Object.values(entities)) {
  entries.sort((a, b) => a.id.localeCompare(b.id));
  for (const entry of entries) {
    entry.aliases.sort((a, b) => a.localeCompare(b, "zh-CN"));
    entry.verification = [...entry.verification].sort();
  }
}

const collisions = [];
for (const [kind, entries] of Object.entries(entities)) {
  const seen = new Map();
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      const normalized = normalizeAlias(alias);
      if (!seen.has(normalized)) seen.set(normalized, new Map());
      seen.get(normalized).set(entry.id, alias);
    }
  }
  for (const [normalized, matches] of seen) {
    if (matches.size > 1) collisions.push({ kind, normalized, matches: [...matches].map(([id, alias]) => ({ id, alias })) });
  }
}

const output = {
  schemaVersion: "0.1.0",
  generatedAt: gameData.dataVersion.retrievedAt,
  gameDataVersionId: gameData.dataVersion.id,
  sources: ["SRC-004", "SRC-005", "SRC-016", "SRC-021"],
  normalization: "NFKC + lowercase + remove common whitespace/punctuation; preserve percent and plus markers",
  entities,
  collisions
};
const outputPath = path.join(ROOT, "data", "import-dictionary.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  output: path.relative(ROOT, outputPath),
  counts: Object.fromEntries(Object.entries(entities).map(([kind, entries]) => [kind, entries.length])),
  collisions: collisions.length
}, null, 2));
