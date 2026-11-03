import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLayout } from "../collectors/lib/layout-extractor.mjs";
import { applyOcrReview } from "../collectors/lib/apply-ocr-review.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "examples", "ocr-recognition-layout.example.json");

const matches = {
  "埃里奇": { kind: "hero", id: "hero-errich", externalId: null, alias: "埃里奇", normalized: "埃里奇" },
  "武器": { kind: "slot", id: "weapon", externalId: null, alias: "武器", normalized: "武器" },
  "野蛮人": { kind: "set", id: "set-barbarian", externalId: null, alias: "野蛮人", normalized: "野蛮人" },
  "巨人眼球": { kind: "artifact", id: "artifact-eyeball-of-the-giant", externalId: 300008, alias: "巨人眼球", normalized: "巨人眼球" },
  "攻击": { kind: "stat", id: "atk_flat", externalId: null, alias: "攻击", normalized: "攻击" },
  "生命": { kind: "stat", id: "hp_flat", externalId: null, alias: "生命", normalized: "生命" },
  "防御": { kind: "stat", id: "def_flat", externalId: null, alias: "防御", normalized: "防御" },
  "重击率": { kind: "stat", id: "crit_rate", externalId: null, alias: "重击率", normalized: "重击率" },
  "重击伤害": { kind: "stat", id: "crit_damage", externalId: null, alias: "重击伤害", normalized: "重击伤害" },
  "攻击%": { kind: "stat", id: "atk_pct", externalId: null, alias: "攻击%", normalized: "攻击%" }
};

function line(lineIndex, text, x, y, width = 120, height = 24) {
  return { lineIndex, text, boundingRect: { x, y, width, height } };
}

function image(sequence, captureType, rows, labels) {
  return {
    sequence,
    originalName: `${captureType}-${sequence}.png`,
    imageLocalPath: `evidence/${captureType}-${sequence}.png`,
    imageSha256: String(sequence).repeat(64),
    mediaType: "image/png",
    captureType,
    reviewStatus: "accepted",
    ocrLocalPath: `derived/${captureType}-${sequence}.json`,
    width: 1000,
    height: 1000,
    lineCount: rows.length,
    detections: labels.map((label) => ({
      lineIndex: rows.findIndex((row) => row.text === label),
      text: label,
      normalizedText: label,
      boundingRect: rows.find((row) => row.text === label).boundingRect,
      matches: [matches[label]]
    })),
    lines: rows
  };
}

const heroRows = [
  line(0, "角色详情", 40, 20), line(1, "埃里奇", 60, 95), line(2, "等级 1", 60, 165),
  line(3, "星级 1", 60, 215), line(4, "灵感 0", 60, 265),
  line(5, "攻击", 100, 350), line(6, "1200", 400, 350),
  line(7, "生命", 100, 400), line(8, "18000", 400, 400),
  line(9, "防御", 100, 450), line(10, "750", 400, 450)
];
const gearRows = [
  line(0, "装备详情", 40, 20), line(1, "武器", 60, 95), line(2, "野蛮人", 60, 155), line(3, "强化 +16", 60, 210),
  line(4, "攻击", 100, 300), line(5, "235", 400, 300),
  line(6, "重击率", 100, 350), line(7, "12%", 400, 350),
  line(8, "重击伤害", 100, 400), line(9, "27%", 400, 400)
];
const artifactRows = [
  line(0, "神器详情", 40, 20), line(1, "巨人眼球", 60, 95), line(2, "强化 +6", 60, 155), line(3, "精炼 1", 60, 215),
  line(4, "攻击", 100, 300), line(5, "120", 400, 300),
  line(6, "攻击%", 100, 350), line(7, "8%", 400, 350)
];

const recognition = {
  schemaVersion: "0.1.0",
  jobId: "synthetic-layout-job-001",
  createdAt: "2026-11-03T12:00:00+08:00",
  sourceManifest: "synthetic-layout-manifest.json",
  privacy: { localOnly: true, containsPotentialAccountData: false },
  engine: "synthetic-coordinate-fixture",
  language: "zh-Hans-CN",
  images: [
    image(1, "hero_detail", heroRows, ["埃里奇", "攻击", "生命", "防御"]),
    image(2, "gear_detail", gearRows, ["武器", "野蛮人", "攻击", "重击率", "重击伤害"]),
    image(3, "artifact_detail", artifactRows, ["巨人眼球", "攻击", "攻击%"])
  ]
};

await writeFile(output, `${JSON.stringify(recognition, null, 2)}\n`, "utf8");
const profile = JSON.parse(await readFile(path.join(root, "examples", "layout-profile.synthetic.json"), "utf8"));
const extracted = extractLayout(recognition, profile, { createdAt: "2026-11-03T12:10:00+08:00" });
const stagingOutput = path.join(root, "examples", "ocr-staging-layout.example.json");
const reportOutput = path.join(root, "examples", "layout-extraction-report.example.json");
const reviewOutput = path.join(root, "examples", "ocr-review-layout.example.json");
const stagingSerialized = `${JSON.stringify(extracted.staging, null, 2)}\n`;
await writeFile(stagingOutput, stagingSerialized, "utf8");
await writeFile(reportOutput, `${JSON.stringify(extracted.report, null, 2)}\n`, "utf8");
const review = {
  schemaVersion: "0.1.0",
  jobId: recognition.jobId,
  reviewedAt: "2026-11-03T12:08:00+08:00",
  sourceManifest: recognition.sourceManifest,
  images: recognition.images.map((entry) => ({
    sequence: entry.sequence,
    originalName: entry.originalName,
    imageSha256: entry.imageSha256,
    captureType: entry.captureType,
    reviewStatus: "accepted",
    decisions: entry.detections.map((detection) => ({
      lineIndex: detection.lineIndex,
      rawText: detection.text,
      kind: detection.matches[0].kind,
      selectedId: detection.matches[0].id,
      status: "matched"
    }))
  }))
};
await writeFile(reviewOutput, `${JSON.stringify(review, null, 2)}\n`, "utf8");
const appliedReview = applyOcrReview(recognition, review, { createdAt: "2026-11-03T12:09:00+08:00" });
await writeFile(path.join(root, "examples", "ocr-recognition-reviewed-layout.example.json"), `${JSON.stringify(appliedReview.recognition, null, 2)}\n`, "utf8");
await writeFile(path.join(root, "examples", "ocr-review-application-report.example.json"), `${JSON.stringify(appliedReview.report, null, 2)}\n`, "utf8");
const reviewedStaging = {
  ...structuredClone(extracted.staging),
  createdAt: "2026-11-03T12:12:00+08:00",
  review: {
    status: "human_reviewed",
    reviewedAt: "2026-11-03T12:12:00+08:00",
    sourceStagingSha256: createHash("sha256").update(stagingSerialized).digest("hex"),
    tool: "prototype/staging-review.html"
  }
};
await writeFile(path.join(root, "examples", "ocr-staging-reviewed-layout.example.json"), `${JSON.stringify(reviewedStaging, null, 2)}\n`, "utf8");
console.log(`Wrote synthetic recognition, Review decisions/application, ${extracted.staging.records.length} staging records, and extraction report`);
