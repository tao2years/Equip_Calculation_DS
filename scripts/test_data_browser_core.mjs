#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatPublicStat, listPublicRecords, paginateRecords, reviewSummary } from "../prototype/data-browser-core.mjs";

const gameData = JSON.parse(await readFile(new URL("../data/game-data.public.json", import.meta.url), "utf8"));
assert.equal(listPublicRecords(gameData, { kind: "heroes" }).records.length, 351);
assert.equal(listPublicRecords(gameData, { kind: "equipment" }).records.length, 682);
assert.equal(listPublicRecords(gameData, { kind: "artifacts" }).records.length, 147);
assert.equal(listPublicRecords(gameData, { kind: "sets" }).records.length, 252);

const child = listPublicRecords(gameData, { kind: "heroes", query: "hero-10002" }).records;
assert.equal(child.length, 1);
assert.equal(reviewSummary(gameData, child[0], "heroes").tone, "danger");
assert.deepEqual(listPublicRecords(gameData, { kind: "heroes", reviewOnly: true }).records.map((entry) => entry.id), ["hero-10002"]);
assert.equal(listPublicRecords(gameData, { kind: "equipment", reviewOnly: true }).records.length, 58);

const page = paginateRecords(gameData.equipment, 99, 50);
assert.equal(page.page, 14);
assert.equal(page.records.length, 32);
assert.equal(formatPublicStat("crit_rate", 0.1, gameData.statDefinitions), "重击率 10%");
assert.equal(formatPublicStat("atk_flat", 106.8, gameData.statDefinitions), "攻击 106.8");

console.log("Public data browser core tests passed: counts, search, review filters, pagination and stat formatting");
