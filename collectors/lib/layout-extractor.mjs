import { createHash } from "node:crypto";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·•．。,:：;；_\-—()（）\[\]【】]/g, "");
}

function absoluteRegion(region, image) {
  return {
    x: region.x * image.width,
    y: region.y * image.height,
    width: region.width * image.width,
    height: region.height * image.height
  };
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function entriesInRegion(entries, region, image) {
  const target = absoluteRegion(region, image);
  return (entries || [])
    .filter((entry) => entry.boundingRect && intersects(entry.boundingRect, target))
    .sort((a, b) => (a.boundingRect.y - b.boundingRect.y) || (a.boundingRect.x - b.boundingRect.x));
}

function joinedText(lines) {
  return lines.map((line) => String(line.text || "").trim()).filter(Boolean).join(" ").trim();
}

function parseInteger(value) {
  const match = String(value ?? "").normalize("NFKC").match(/[+-]?\d[\d,]*/);
  return match ? Number.parseInt(match[0].replaceAll(",", ""), 10) : null;
}

function dictionaryValue(image, field) {
  const detections = entriesInRegion(image.detections, field.region, image);
  for (const detection of detections) {
    const match = (detection.matches || []).find((candidate) => candidate.kind === field.dictionaryKind);
    if (match) return { value: match.alias || detection.text, confidence: 0.95, evidence: detection.text };
  }
  return null;
}

function extractField(image, field) {
  if (field.mode === "constant") return { value: field.value, confidence: 1, evidence: "profile constant" };
  if (field.mode === "dictionary") return dictionaryValue(image, field);
  const lines = entriesInRegion(image.lines, field.region, image);
  const text = joinedText(lines);
  if (!text) return null;
  if (field.mode === "integer") {
    const value = parseInteger(text);
    return value == null ? null : { value, confidence: 0.9, evidence: text };
  }
  return { value: text, confidence: 0.9, evidence: text };
}

function classifierMatches(image, page) {
  if (page.captureTypes?.length && !page.captureTypes.includes(image.captureType)) return false;
  const pageText = normalizeText((image.lines || []).map((line) => line.text).join(" "));
  return (page.classifier?.requiredTexts || []).every((anchor) => pageText.includes(normalizeText(anchor)));
}

function extractStats(image, rowGroup, issues, pageId) {
  const observations = [];
  let requiredMissing = false;
  for (const [rowIndex, row] of rowGroup.rows.entries()) {
    const label = row.dictionaryKind
      ? dictionaryValue(image, { ...row, region: row.labelRegion, dictionaryKind: row.dictionaryKind })
      : (() => {
          const value = joinedText(entriesInRegion(image.lines, row.labelRegion, image));
          return value ? { value, confidence: 0.9, evidence: value } : null;
        })();
    const rawValue = joinedText(entriesInRegion(image.lines, row.valueRegion, image));
    if (!label && !rawValue) continue;
    if (!label || !rawValue) {
      if (row.required) requiredMissing = true;
      issues.push({
        severity: row.required ? "error" : "warning",
        code: "incomplete_stat_row",
        pageId,
        row: rowIndex,
        detail: `label=${label?.value ?? "missing"}, value=${rawValue || "missing"}`
      });
      continue;
    }
    observations.push({ label: label.value, value: rawValue, confidence: Math.min(label.confidence, 0.9) });
  }
  return { observations, requiredMissing };
}

function makeRecordId(profile, image, page, fields) {
  const strategy = profile.recordId?.strategy || "capture_hash";
  if (strategy === "explicit_field") {
    const value = fields[profile.recordId.field];
    if (value == null || value === "") throw new Error(`recordId field ${profile.recordId.field} is empty`);
    return `${profile.recordId.prefix || "ocr"}-${String(value)}`;
  }
  const content = strategy === "content_fingerprint"
    ? JSON.stringify({ kind: page.kind, fields })
    : image.imageSha256;
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 20);
  return `${profile.recordId?.prefix || "ocr"}-${page.kind}-${digest}`;
}

export function extractLayout(recognition, profile, options = {}) {
  const records = [];
  const issues = [];
  const pages = [];
  const seenIds = new Map();
  for (const image of recognition.images || []) {
    if (image.reviewStatus === "rejected") {
      issues.push({ severity: "warning", code: "review_rejected_image_skipped", sequence: image.sequence });
      pages.push({ sequence: image.sequence, status: "skipped_rejected", profilePageId: null, recordId: null });
      continue;
    }
    const matches = (profile.pages || []).filter((page) => classifierMatches(image, page));
    if (matches.length !== 1) {
      const code = matches.length ? "ambiguous_page_profile" : "unclassified_page";
      issues.push({ severity: "error", code, sequence: image.sequence, matches: matches.map((page) => page.id) });
      pages.push({ sequence: image.sequence, status: code, profilePageId: null, recordId: null });
      continue;
    }
    const page = matches[0];
    const fields = {};
    const confidences = [];
    let requiredMissing = false;
    for (const field of page.fields || []) {
      const result = extractField(image, field);
      if (!result) {
        if (field.required) {
          requiredMissing = true;
          issues.push({ severity: "error", code: "missing_required_field", sequence: image.sequence, pageId: page.id, field: field.target });
        }
        continue;
      }
      fields[field.target] = result.value;
      confidences.push(result.confidence);
    }
    for (const rowGroup of page.statGroups || []) {
      const extractedStats = extractStats(image, rowGroup, issues, page.id);
      const stats = extractedStats.observations;
      if (extractedStats.requiredMissing) requiredMissing = true;
      if (stats.length) {
        fields[rowGroup.target] = stats;
        confidences.push(...stats.map((entry) => entry.confidence));
      }
      if (rowGroup.required && !stats.length) {
        requiredMissing = true;
        issues.push({ severity: "error", code: "missing_required_stat_group", sequence: image.sequence, pageId: page.id, field: rowGroup.target });
      }
    }
    if (requiredMissing) {
      pages.push({ sequence: image.sequence, status: "rejected_missing_required", profilePageId: page.id, recordId: null });
      continue;
    }
    let sourceRecordId;
    try {
      sourceRecordId = makeRecordId(profile, image, page, fields);
    } catch (error) {
      issues.push({ severity: "error", code: "record_id_failed", sequence: image.sequence, pageId: page.id, detail: error.message });
      pages.push({ sequence: image.sequence, status: "rejected_record_id", profilePageId: page.id, recordId: null });
      continue;
    }
    if (seenIds.has(sourceRecordId)) {
      issues.push({
        severity: "error",
        code: "duplicate_record_fingerprint",
        sequence: image.sequence,
        pageId: page.id,
        recordId: sourceRecordId,
        firstSequence: seenIds.get(sourceRecordId),
        detail: "Content fingerprints cannot distinguish visually identical duplicate inventory items; capture a stable client identifier or review manually."
      });
      pages.push({ sequence: image.sequence, status: "rejected_duplicate_fingerprint", profilePageId: page.id, recordId: null });
      continue;
    }
    seenIds.set(sourceRecordId, image.sequence);
    const confidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0.8;
    records.push({
      kind: page.kind,
      sourceRecordId,
      confidence: Number(confidence.toFixed(4)),
      evidenceRefs: [{
        sourceFileSha256: image.imageSha256,
        localName: image.imageLocalPath || image.originalName || null,
        sequence: image.sequence ?? null,
        captureType: image.captureType || null,
        reviewStatus: image.reviewStatus || "unreviewed"
      }],
      fields
    });
    pages.push({ sequence: image.sequence, status: "extracted", profilePageId: page.id, recordId: sourceRecordId });
  }

  const createdAt = options.createdAt || new Date().toISOString();
  const staging = {
    schemaVersion: "0.1.0",
    jobId: recognition.jobId,
    createdAt,
    gameDataVersionId: options.gameDataVersionId || profile.gameDataVersionId,
    sourceFiles: (recognition.images || []).map((image) => ({ sha256: image.imageSha256, mediaType: image.mediaType, localName: image.imageLocalPath || image.originalName || null })),
    records
  };
  const report = {
    schemaVersion: "0.1.0",
    createdAt,
    jobId: recognition.jobId,
    profile: { id: profile.profileId, clientBuild: profile.clientBuild, channel: profile.channel, language: profile.language },
    evidenceLevel: profile.evidenceLevel,
    counts: { images: recognition.images?.length || 0, extractedRecords: records.length, errors: issues.filter((issue) => issue.severity === "error").length, warnings: issues.filter((issue) => issue.severity === "warning").length },
    pages,
    issues,
    limitations: profile.limitations || []
  };
  return { staging, report };
}

export { normalizeText };
