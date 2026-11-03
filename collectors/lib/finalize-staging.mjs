import { createResolver } from "./normalize.mjs";

function parseNumber(raw, label) {
  if (typeof raw === "number") return raw;
  const normalized = String(raw).normalize("NFKC").replace(/[,+\s]/g, "");
  const percent = normalized.endsWith("%");
  const numeric = Number.parseFloat(percent ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(numeric)) throw new Error(`cannot parse numeric value ${raw} for ${label}`);
  return percent ? numeric / 100 : numeric;
}

function parseInteger(raw, fallback = null) {
  if (raw == null || raw === "") return fallback;
  const value = Number.parseInt(String(raw).normalize("NFKC").replace(/[^0-9-]/g, ""), 10);
  if (!Number.isFinite(value)) throw new Error(`cannot parse integer value ${raw}`);
  return value;
}

function resolveOne(resolver, kind, raw, context) {
  const result = resolver.resolve(kind, raw);
  if (result.status === "matched") return result.match.id;
  if (result.status === "ambiguous") throw new Error(`${context}: ambiguous ${kind} '${raw}' -> ${result.matches.map((entry) => entry.id).join(", ")}`);
  throw new Error(`${context}: unknown ${kind} '${raw}'`);
}

function normalizeStats(resolver, observations, context, warnings) {
  const stats = {};
  for (const observation of observations || []) {
    const key = resolveOne(resolver, "stat", observation.label, context);
    if (Object.hasOwn(stats, key)) throw new Error(`${context}: duplicate stat ${key}`);
    stats[key] = parseNumber(observation.value, observation.label);
    if (observation.confidence < 0.8) warnings.push(`${context}: low confidence ${observation.label}=${observation.value} (${observation.confidence})`);
  }
  return stats;
}

function normalizeObservedStats(resolver, observations, context, warnings) {
  const stats = normalizeStats(resolver, observations, context, warnings);
  return Object.entries(stats).map(([stat, value]) => {
    const source = (observations || []).find((entry) => resolveOne(resolver, "stat", entry.label, context) === stat);
    return {
      stat,
      value,
      raw_text: source ? `${source.label} ${source.value}` : null,
      confidence: typeof source?.confidence === "number" ? source.confidence : 1
    };
  });
}

export function finalizeStaging(staging, dictionary, gameData) {
  const resolver = createResolver(dictionary);
  const errors = [];
  const warnings = [];
  const ownedHeroes = [];
  const ownedGear = [];
  const ownedArtifacts = [];
  const heroIds = new Set(gameData.heroes.map((entry) => entry.id));
  const artifactIds = new Set(gameData.artifacts.map((entry) => entry.id));
  const equipmentById = new Map((gameData.equipment || []).map((entry) => [entry.id, entry]));
  const setIds = new Set(gameData.sets.map((entry) => entry.id));

  for (const record of staging.records || []) {
    const context = `${record.kind}:${record.sourceRecordId}`;
    try {
      if (record.confidence < 0.8) warnings.push(`${context}: low record confidence ${record.confidence}`);
      if (record.kind === "hero") {
        const definitionId = resolveOne(resolver, "hero", record.fields.name, context);
        if (!heroIds.has(definitionId)) throw new Error(`${context}: resolved hero is absent from game data`);
        const baseStatsOverride = normalizeStats(resolver, record.fields.baseStats, context, warnings);
        ownedHeroes.push({
          ownedHeroId: record.sourceRecordId,
          heroDefinitionId: definitionId,
          level: parseInteger(record.fields.level, 1),
          stars: parseInteger(record.fields.stars, null),
          inspiration: parseInteger(record.fields.inspiration, null),
          evidenceRefs: record.evidenceRefs || [],
          ...(Object.keys(baseStatsOverride).length ? { baseStatsOverride } : {})
        });
      } else if (record.kind === "artifact") {
        const definitionId = resolveOne(resolver, "artifact", record.fields.name, context);
        if (!artifactIds.has(definitionId)) throw new Error(`${context}: resolved artifact is absent from game data`);
        ownedArtifacts.push({
          ownedArtifactId: record.sourceRecordId,
          artifactDefinitionId: definitionId,
          level: parseInteger(record.fields.level, 0),
          refinement: parseInteger(record.fields.refinement, 0),
          observedStats: normalizeObservedStats(resolver, record.fields.stats, context, warnings),
          locked: Boolean(record.fields.locked),
          equippedBy: record.fields.equippedBy || null,
          evidenceRefs: record.evidenceRefs || []
        });
      } else if (record.kind === "gear") {
        const slot = resolveOne(resolver, "slot", record.fields.slot, context);
        if (slot === "artifact") throw new Error(`${context}: artifact cannot be emitted as gear`);
        const definitionId = record.fields.definitionId || (record.fields.name ? resolveOne(resolver, "equipment", record.fields.name, context) : null);
        const definition = definitionId ? equipmentById.get(definitionId) : null;
        if (definitionId && !definition) throw new Error(`${context}: resolved equipment is absent from game data`);
        if (definition?.slot && definition.slot !== "unknown" && definition.slot !== slot) throw new Error(`${context}: equipment definition slot ${definition.slot} conflicts with observed slot ${slot}`);
        let setId = record.fields.setId || null;
        if (!setId && record.fields.setName) setId = resolveOne(resolver, "set", record.fields.setName, context);
        if (setId && !setIds.has(setId)) throw new Error(`${context}: unknown setId ${setId}`);
        if (definition?.setId && setId && definition.setId !== setId) warnings.push(`${context}: equipment definition set ${definition.setId} conflicts with observed set ${setId}; observed set retained`);
        if (!setId && definition?.setId) setId = definition.setId;
        ownedGear.push({
          ownedItemId: record.sourceRecordId,
          ...(definitionId ? { definitionId } : {}),
          ...(record.fields.name || definition ? { displayName: record.fields.name || definition?.names?.zh || definition?.names?.en || null } : {}),
          slot,
          setId,
          ...(definition ? { rarity: definition.rarity || "unknown" } : {}),
          enhanceLevel: parseInteger(record.fields.enhanceLevel, 0),
          stats: normalizeStats(resolver, record.fields.stats, context, warnings),
          locked: Boolean(record.fields.locked),
          equippedBy: record.fields.equippedBy || null,
          sourceConfidence: record.confidence,
          evidenceRefs: record.evidenceRefs || []
        });
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  const duplicateChecks = [
    ["hero", ownedHeroes, "ownedHeroId"],
    ["gear", ownedGear, "ownedItemId"],
    ["artifact", ownedArtifacts, "ownedArtifactId"]
  ];
  for (const [kind, entries, key] of duplicateChecks) {
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry[key])) errors.push(`duplicate ${kind} id ${entry[key]}`);
      seen.add(entry[key]);
    }
  }

  if (errors.length) return { ok: false, errors: [...new Set(errors)], warnings: [...new Set(warnings)], snapshot: null };
  return {
    ok: true,
    errors: [],
    warnings: [...new Set(warnings)],
    snapshot: {
      schemaVersion: "0.2.0",
      snapshotId: `snapshot-${staging.jobId}`,
      createdAt: new Date().toISOString(),
      gameDataVersionId: staging.gameDataVersionId,
      sourceMethod: "screenshot_ocr",
      sourceFiles: staging.sourceFiles || [],
      warning: warnings.length ? "Contains low-confidence OCR fields; review warnings before optimization." : "Generated from OCR staging records; values have not been compared with the live client.",
      ownedHeroes,
      ownedGear,
      ownedArtifacts
    }
  };
}
