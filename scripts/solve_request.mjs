#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { executeOptimizationRequest } from "../prototype/optimization-request-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name, fallback = null) {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const accountPath = path.resolve(option("account", path.join(ROOT, "examples", "account-snapshot.example.json")));
const requestPath = path.resolve(option("request", path.join(ROOT, "examples", "optimization-request.example.json")));
const gameDataPath = path.resolve(option("game-data", path.join(ROOT, "data", "game-data.public.json")));
const outputOption = option("output");
const [account, request, gameData] = await Promise.all([
  readFile(accountPath, "utf8").then(JSON.parse),
  readFile(requestPath, "utf8").then(JSON.parse),
  readFile(gameDataPath, "utf8").then(JSON.parse)
]);
const output = executeOptimizationRequest({ account, request, gameData });
const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (outputOption) await writeFile(path.resolve(outputOption), serialized);
else process.stdout.write(serialized);
