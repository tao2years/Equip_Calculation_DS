import { normalizeAlias } from "./normalize.mjs";

export const DEFAULT_DETECTION_KINDS = ["stat", "slot", "hero", "artifact", "set", "rarity"];

export function lineBounds(words) {
  if (!words?.length) return null;
  const left = Math.min(...words.map((word) => word.boundingRect.x));
  const top = Math.min(...words.map((word) => word.boundingRect.y));
  const right = Math.max(...words.map((word) => word.boundingRect.x + word.boundingRect.width));
  const bottom = Math.max(...words.map((word) => word.boundingRect.y + word.boundingRect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function detectDictionaryLabels(ocr, dictionary, kinds = DEFAULT_DETECTION_KINDS) {
  const aliasIndex = [];
  for (const kind of kinds) {
    if (!dictionary.entities[kind]) throw new Error(`Unknown dictionary kind ${kind}`);
    for (const entity of dictionary.entities[kind]) {
      for (const alias of entity.aliases || []) {
        const normalized = normalizeAlias(alias);
        if (normalized.length < 2) continue;
        aliasIndex.push({ kind, id: entity.id, externalId: entity.externalId, alias, normalized });
      }
    }
  }
  aliasIndex.sort((a, b) => b.normalized.length - a.normalized.length || a.kind.localeCompare(b.kind));

  const detections = [];
  for (const [lineIndex, line] of (ocr.lines || []).entries()) {
    const normalizedLine = normalizeAlias(line.text);
    const matches = [];
    const seen = new Set();
    for (const candidate of aliasIndex) {
      if (!normalizedLine.includes(candidate.normalized)) continue;
      const key = `${candidate.kind}:${candidate.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(candidate);
    }
    if (matches.length) detections.push({
      lineIndex,
      text: line.text,
      normalizedText: normalizedLine,
      boundingRect: lineBounds(line.words),
      matches
    });
  }

  return {
    schemaVersion: "0.1.0",
    input: ocr.input,
    engine: ocr.engine,
    language: ocr.language,
    kinds,
    detectionCount: detections.length,
    matchCountByKind: Object.fromEntries(kinds.map((kind) => [
      kind,
      detections.reduce((count, line) => count + line.matches.filter((match) => match.kind === kind).length, 0)
    ])),
    detections
  };
}
