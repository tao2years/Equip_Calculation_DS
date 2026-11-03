#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = JSON.parse(await readFile(path.join(ROOT, "research", "public-data-sources.json"), "utf8"));
const STAT_LABELS = {
  Health: "hp_flat",
  Defense: "def_flat",
  Attack: "atk_flat",
  Mastery: "enlightenment",
  "Crit Rate": "crit_rate",
  "Crit Dmg": "crit_damage",
  Accuracy: "accuracy",
  Resistance: "resistance",
  "Skill Haste": "skill_haste"
};

function normalizeValue(raw) {
  const text = raw.trim();
  if (text.endsWith("%")) return Number.parseFloat(text) / 100;
  return Number.parseFloat(text);
}

function extractHero(html, source, metadata) {
  const name = html.match(/<h4[^>]*>([^<]+)<\/h4>/)?.[1]?.trim();
  const heroId = source.url.match(/\/heroes\/(\d+)/)?.[1];
  if (!name || !heroId) throw new Error(`Cannot identify hero in ${source.sourceId}`);

  const stats = {};
  for (const [label, key] of Object.entries(STAT_LABELS)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = html.match(new RegExp(`${escaped}：<\\/div>\\s*<div[^>]*>\\s*([^<]+)`));
    if (!match) throw new Error(`Missing ${label} for ${source.sourceId}`);
    stats[key] = normalizeValue(match[1]);
  }

  const leading = html.slice(html.indexOf(`<h4`), html.indexOf(`d-none d-lg-block`));
  const tags = [...leading.matchAll(/badge-primary2[^>]*>([^<]+)<\/span>/g)].map((match) => match[1].trim());
  return {
    heroDefinitionId: `hero-${heroId}`,
    externalId: heroId,
    names: { en: name },
    tags,
    level1Stats: stats,
    evidence: {
      sourceId: source.sourceId,
      requestedUrl: metadata.requestedUrl,
      retrievedAt: metadata.retrievedAt,
      snapshotPath: metadata.snapshotPath,
      snapshotSha256: metadata.sha256
    },
    verificationState: "public_page_compiled_not_client_validated"
  };
}

const heroes = [];
const retrievedAtValues = [];
for (const source of SOURCES.sources.filter((entry) => entry.kind === "hero_detail")) {
  const root = path.join(ROOT, "raw", "public-web", source.sourceId);
  const dated = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!dated) throw new Error(`No raw snapshot for ${source.sourceId}`);
  const dir = path.join(root, dated);
  const [html, metadata] = await Promise.all([
    readFile(path.join(dir, "snapshot.html"), "utf8"),
    readFile(path.join(dir, "metadata.json"), "utf8").then(JSON.parse)
  ]);
  retrievedAtValues.push(metadata.retrievedAt);
  heroes.push(extractHero(html, source, metadata));
}

const output = {
  schemaVersion: "0.1.0",
  compiledAt: retrievedAtValues.sort().at(-1),
  compiler: "scripts/compile_public_heroes.mjs",
  limitations: [
    "Values come from public SSR pages and are not validated against the current game client.",
    "The public site may mix regions, seasons, or historical versions."
  ],
  heroes
};
const outputDir = path.join(ROOT, "corpus", "compiled");
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "heroes.public.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`compiled ${heroes.length} heroes -> ${path.relative(ROOT, outputPath)}`);
