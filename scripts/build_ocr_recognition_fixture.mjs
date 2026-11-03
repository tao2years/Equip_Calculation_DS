#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectDictionaryLabels, lineBounds } from "../collectors/lib/detect-labels.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [ocr, dictionary] = await Promise.all([
  readFile(path.join(ROOT, "outputs", "qa", "windows-ocr-prototype.json"), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, "data", "import-dictionary.json"), "utf8").then(JSON.parse)
]);
const labels = detectDictionaryLabels(ocr, dictionary);
const fixture = {
  schemaVersion: "0.1.0",
  jobId: "example-review-job-001",
  createdAt: "2026-11-03T12:00:00+08:00",
  sourceManifest: "synthetic-review-manifest.json",
  privacy: { localOnly: true, containsPotentialAccountData: false },
  engine: "Windows.Media.Ocr",
  language: ocr.language,
  images: [{
    sequence: 1,
    originalName: ocr.input.localName,
    imageLocalPath: "../outputs/design/prototype-browser-verified.png",
    imageSha256: ocr.input.sha256,
    mediaType: "image/png",
    captureType: "unclassified",
    reviewStatus: "pending",
    ocrLocalPath: "../outputs/qa/windows-ocr-prototype.json",
    width: ocr.input.width,
    height: ocr.input.height,
    lineCount: ocr.lines.length,
    detections: labels.detections,
    lines: ocr.lines.map((line, lineIndex) => ({ lineIndex, text: line.text, boundingRect: lineBounds(line.words) }))
  }]
};

await writeFile(path.join(ROOT, "examples", "ocr-recognition.example.json"), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`OCR recognition fixture: ${fixture.images.length} image, ${labels.detectionCount} detections, ${ocr.lines.length} lines`);
