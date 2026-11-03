#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recognition = JSON.parse(await readFile(path.join(ROOT, "examples", "ocr-recognition.example.json"), "utf8"));
const review = {
  schemaVersion: "0.1.0",
  jobId: recognition.jobId,
  reviewedAt: "2026-11-03T12:10:00+08:00",
  sourceManifest: recognition.sourceManifest,
  images: recognition.images.map((image) => ({
    sequence: image.sequence,
    originalName: image.originalName,
    imageSha256: image.imageSha256,
    captureType: image.captureType,
    reviewStatus: "pending",
    decisions: image.detections.map((detection) => {
      const match = detection.matches.length === 1 ? detection.matches[0] : null;
      return {
        lineIndex: detection.lineIndex,
        rawText: detection.text,
        kind: match?.kind || "unresolved",
        selectedId: match?.id || null,
        status: match ? "matched" : "unresolved"
      };
    })
  }))
};

await writeFile(path.join(ROOT, "examples", "ocr-review.example.json"), `${JSON.stringify(review, null, 2)}\n`);
console.log(`OCR review fixture: ${review.images.length} image, ${review.images[0].decisions.length} decisions`);
