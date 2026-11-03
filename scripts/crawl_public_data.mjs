#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const CONFIG_PATH = path.join(ROOT, "research", "public-data-sources.json");

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    reuseExisting: argv.includes("--reuse-existing"),
    sourceId: argv.find((value) => value.startsWith("--source="))?.split("=", 2)[1] || null,
    date: argv.find((value) => value.startsWith("--date="))?.split("=", 2)[1] || new Date().toISOString().slice(0, 10)
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function captureSource(source, date) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "EquipCalculationResearch/0.1 (+local research; contact repository owner)",
      accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1"
    },
    redirect: "follow"
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const mediaType = response.headers.get("content-type") || "application/octet-stream";
  const extension = mediaType.includes("json") ? "json" : "html";
  const outputDir = path.join(ROOT, "raw", "public-web", source.sourceId, date);
  await mkdir(outputDir, { recursive: true });
  const snapshotPath = path.join(outputDir, `snapshot.${extension}`);
  const metadataPath = path.join(outputDir, "metadata.json");
  await writeFile(snapshotPath, bytes, { flag: "wx" });
  const metadata = {
    sourceId: source.sourceId,
    kind: source.kind,
    requestedUrl: source.url,
    finalUrl: response.url,
    retrievedAt: new Date().toISOString(),
    status: response.status,
    mediaType,
    byteLength: bytes.length,
    sha256: sha256(bytes),
    region: source.region,
    expectedContent: source.expectedContent,
    snapshotPath: path.relative(ROOT, snapshotPath).replaceAll("\\", "/")
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
  return metadata;
}

async function reuseSource(source, date) {
  const metadataPath = path.join(ROOT, "raw", "public-web", source.sourceId, date, "metadata.json");
  try { await access(metadataPath); } catch { return null; }
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (metadata.sourceId !== source.sourceId || metadata.requestedUrl !== source.url) {
    throw new Error(`Existing metadata identity mismatch: ${metadataPath}`);
  }
  const snapshotPath = path.join(ROOT, metadata.snapshotPath);
  const bytes = await readFile(snapshotPath);
  const actualHash = sha256(bytes);
  if (actualHash !== metadata.sha256) throw new Error(`Existing snapshot hash mismatch: ${snapshotPath}`);
  return { ...metadata, reused: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const selected = config.sources.filter((source) => !args.sourceId || source.sourceId === args.sourceId);
  if (!selected.length) throw new Error(`No source matched ${args.sourceId || "configuration"}`);

  if (args.dryRun) {
    console.log(JSON.stringify({ date: args.date, sources: selected }, null, 2));
    return;
  }

  for (const source of selected) {
    try {
      const metadata = args.reuseExisting ? await reuseSource(source, args.date) : null;
      const result = metadata || await captureSource(source, args.date);
      console.log(`${metadata ? "reused" : "captured"} ${source.sourceId}: ${result.status} ${result.byteLength} bytes ${result.sha256}`);
    } catch (error) {
      console.error(`failed ${source.sourceId}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

await main();
