import { finalizeStaging } from "../collectors/lib/finalize-staging.mjs";

export function createStagingRecord(kind, id) {
  const common = { kind, sourceRecordId: id, confidence: 1, evidenceRefs: [], fieldEvidence: [], fields: {} };
  if (kind === "hero") common.fields = { name: "", level: 1, stars: null, inspiration: null, baseStats: [] };
  else if (kind === "artifact") common.fields = { name: "", level: 0, refinement: 0, stats: [], locked: false, equippedBy: null };
  else if (kind === "gear") common.fields = { slot: "helmet", setId: null, setName: null, enhanceLevel: 0, stats: [], locked: false, equippedBy: null };
  else throw new Error(`Unsupported staging record kind ${kind}`);
  return common;
}

export function validateReviewedStaging(staging, dictionary, gameData) {
  const structuralErrors = [];
  if (!staging || typeof staging !== "object") structuralErrors.push("staging must be an object");
  for (const key of ["schemaVersion", "jobId", "createdAt", "gameDataVersionId"]) if (!staging?.[key]) structuralErrors.push(`missing ${key}`);
  if (!Array.isArray(staging?.sourceFiles)) structuralErrors.push("sourceFiles must be an array");
  if (!Array.isArray(staging?.records) || !staging.records.length) structuralErrors.push("records must contain at least one record");
  for (const [index, source] of (staging?.sourceFiles || []).entries()) {
    if (!/^[0-9a-f]{64}$/.test(source?.sha256 || "")) structuralErrors.push(`sourceFiles[${index}] has invalid sha256`);
    if (!source?.mediaType) structuralErrors.push(`sourceFiles[${index}] missing mediaType`);
  }
  const sourceHashes = new Set((staging?.sourceFiles || []).map((source) => source.sha256));
  for (const [index, record] of (staging?.records || []).entries()) {
    const context = record?.sourceRecordId || `records[${index}]`;
    if (!new Set(["hero", "gear", "artifact"]).has(record?.kind)) structuralErrors.push(`${context}: invalid kind`);
    if (!record?.sourceRecordId) structuralErrors.push(`records[${index}] missing sourceRecordId`);
    if (!Number.isFinite(record?.confidence) || record.confidence < 0 || record.confidence > 1) structuralErrors.push(`${context}: confidence must be between 0 and 1`);
    if (!record?.fields || typeof record.fields !== "object") structuralErrors.push(`${context}: missing fields`);
    for (const [refIndex, ref] of (record?.evidenceRefs || []).entries()) {
      if (!/^[0-9a-f]{64}$/.test(ref?.sourceFileSha256 || "")) structuralErrors.push(`${context}: evidenceRefs[${refIndex}] has invalid sha256`);
      else if (!sourceHashes.has(ref.sourceFileSha256)) structuralErrors.push(`${context}: evidenceRefs[${refIndex}] is absent from sourceFiles`);
    }
    for (const [evidenceIndex, evidence] of (record?.fieldEvidence || []).entries()) {
      if (!evidence?.fieldPath) structuralErrors.push(`${context}: fieldEvidence[${evidenceIndex}] missing fieldPath`);
      if (!/^[0-9a-f]{64}$/.test(evidence?.sourceFileSha256 || "")) structuralErrors.push(`${context}: fieldEvidence[${evidenceIndex}] has invalid sha256`);
      else if (!sourceHashes.has(evidence.sourceFileSha256)) structuralErrors.push(`${context}: fieldEvidence[${evidenceIndex}] is absent from sourceFiles`);
      if (!Array.isArray(evidence?.boundingRects)) structuralErrors.push(`${context}: fieldEvidence[${evidenceIndex}] missing boundingRects`);
    }
    for (const target of ["stats", "baseStats"]) {
      for (const [statIndex, observation] of (record?.fields?.[target] || []).entries()) {
        if (!String(observation?.label || "").trim()) structuralErrors.push(`${context}: ${target}[${statIndex}] missing label`);
        if (observation?.value == null || observation.value === "") structuralErrors.push(`${context}: ${target}[${statIndex}] missing value`);
        if (!Number.isFinite(observation?.confidence) || observation.confidence < 0 || observation.confidence > 1) structuralErrors.push(`${context}: ${target}[${statIndex}] confidence must be between 0 and 1`);
      }
    }
  }
  if (structuralErrors.length) return { valid: false, errors: structuralErrors, warnings: [], snapshot: null };
  const result = finalizeStaging(staging, dictionary, gameData);
  return { valid: result.ok, errors: result.errors, warnings: result.warnings, snapshot: result.snapshot };
}

export function prepareReviewedStaging(staging, sourceStagingSha256, reviewedAt = new Date().toISOString()) {
  if (!/^[0-9a-f]{64}$/.test(sourceStagingSha256)) throw new Error("source staging SHA-256 is invalid");
  return {
    ...structuredClone(staging),
    createdAt: reviewedAt,
    review: {
      status: "human_reviewed",
      reviewedAt,
      sourceStagingSha256,
      tool: "prototype/staging-review.html"
    }
  };
}

export function recordIssueCount(record, errors) {
  const prefix = `${record.kind}:${record.sourceRecordId}`;
  return errors.filter((error) => error.startsWith(prefix) || error.includes(record.sourceRecordId)).length;
}
