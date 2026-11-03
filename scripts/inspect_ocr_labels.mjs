#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { detectDictionaryLabels } from "../collectors/lib/detect-labels.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const inputPath = option("input");
if (!inputPath) throw new Error("Missing --input OCR JSON path");
const outputPath = option("output");
const dictionaryPath = option("dictionary", path.join(ROOT, "data", "import-dictionary.json"));
const kinds = option("kinds", "stat,slot,hero,artifact,rarity").split(",").map((value) => value.trim()).filter(Boolean);
const [ocr, dictionary] = await Promise.all([
  readFile(path.resolve(inputPath), "utf8").then(JSON.parse),
  readFile(path.resolve(dictionaryPath), "utf8").then(JSON.parse)
]);

const output = detectDictionaryLabels(ocr, dictionary, kinds);
const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (outputPath) await writeFile(path.resolve(outputPath), serialized);
else process.stdout.write(serialized);
