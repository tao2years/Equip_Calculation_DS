#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = {
  "SRC-022": {
    snapshotPath: "raw/public-web/SRC-022/2026-11-03/snapshot.html",
    metadataPath: "raw/public-web/SRC-022/2026-11-03/metadata.json",
    sourceClass: "community_catalog"
  },
  "SRC-023": {
    snapshotPath: "raw/public-web/SRC-023/2026-11-03/snapshot.html",
    metadataPath: "raw/public-web/SRC-023/2026-11-03/metadata.json",
    sourceClass: "official_cn_product_site"
  }
};

const ELEMENTS = new Map([
  ["火焰", "fire"],
  ["冷冻", "cold"],
  ["暗蚀", "necrosis"],
  ["光耀", "radiance"],
  ["闪电", "lightning"],
  ["毒素", "poison"]
]);

function cleanText(value) {
  return value.replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

async function sourceRecord(sourceId) {
  const source = SOURCES[sourceId];
  const metadata = JSON.parse(await readFile(path.join(ROOT, source.metadataPath), "utf8"));
  return {
    sourceId,
    sourceClass: source.sourceClass,
    snapshotPath: source.snapshotPath,
    url: metadata.finalUrl ?? metadata.requestedUrl,
    capturedAt: metadata.retrievedAt,
    sha256: metadata.sha256
  };
}

function extractCommunity(html) {
  const headingAt = html.indexOf("<h3><strong>龙息神寂英雄图鉴大全</strong></h3>");
  const tableAt = html.indexOf("<table", headingAt);
  const tableEnd = html.indexOf("</table>", tableAt);
  if (headingAt < 0 || tableAt < 0 || tableEnd < 0) throw new Error("SRC-022 hero catalog table not found");
  const table = html.slice(tableAt, tableEnd + 8);
  const token = /<b>([^<]+)<\/b>|<p[^>]*>\s*<a href="([^"]+)"[^>]*>\s*<span style="color:#0000ff;">([^<]+)<\/span>/g;
  const records = [];
  let element = null;
  let match;
  while ((match = token.exec(table))) {
    const heading = cleanText(match[1] ?? "");
    if (ELEMENTS.has(heading)) {
      element = { labelZh: heading, id: ELEMENTS.get(heading) };
      continue;
    }
    if (!match[3] || !element) continue;
    records.push({
      displayName: cleanText(match[3]),
      element,
      detailUrl: match[2],
      extractionOffset: tableAt + match.index
    });
  }
  if (records.length < 50) throw new Error(`SRC-022 extraction unexpectedly small: ${records.length}`);
  return records;
}

function extractOfficial(html) {
  const records = [];
  const token = /<div class="camp-title [^"]+">([^<]+)<\/div>/g;
  let match;
  while ((match = token.exec(html))) {
    records.push({ displayName: cleanText(match[1]), extractionOffset: match.index });
  }
  if (records.length < 3) throw new Error(`SRC-023 extraction unexpectedly small: ${records.length}`);
  return records;
}

const [communitySource, officialSource] = await Promise.all([sourceRecord("SRC-022"), sourceRecord("SRC-023")]);
const communityHtml = await readFile(path.join(ROOT, communitySource.snapshotPath), "utf8");
const officialHtml = await readFile(path.join(ROOT, officialSource.snapshotPath), "utf8");
const community = extractCommunity(communityHtml);
const official = extractOfficial(officialHtml);

const observations = [];
for (const [index, record] of community.entries()) {
  observations.push({
    observationId: `CNH-C-${String(index + 1).padStart(3, "0")}`,
    entityKind: "hero",
    displayName: record.displayName,
    element: record.element,
    sourceId: "SRC-022",
    sourceClass: communitySource.sourceClass,
    evidenceStatus: "community_name_candidate",
    mappingStatus: "unlinked_candidate",
    canonicalHeroId: null,
    sourceLocator: {
      snapshotPath: communitySource.snapshotPath,
      detailUrl: record.detailUrl,
      extraction: `hero catalog table byte/character offset ${record.extractionOffset}`
    },
    notes: ["Transcribed literally from the community catalog; spelling, truncation and current-client applicability are unverified."]
  });
}
for (const [index, record] of official.entries()) {
  observations.push({
    observationId: `CNH-O-${String(index + 1).padStart(3, "0")}`,
    entityKind: "hero",
    displayName: record.displayName,
    element: null,
    sourceId: "SRC-023",
    sourceClass: officialSource.sourceClass,
    evidenceStatus: "official_name_observation",
    mappingStatus: "unlinked_candidate",
    canonicalHeroId: null,
    sourceLocator: {
      snapshotPath: officialSource.snapshotPath,
      detailUrl: null,
      extraction: `camp-title byte/character offset ${record.extractionOffset}`
    },
    notes: ["Official marketing-page name observation; the page does not expose a stable bilingual hero ID."]
  });
}

const reconciliationLeads = [];
for (const officialRecord of official) {
  for (const communityRecord of community) {
    const exact = officialRecord.displayName === communityRecord.displayName;
    const prefix = officialRecord.displayName.startsWith(communityRecord.displayName) || communityRecord.displayName.startsWith(officialRecord.displayName);
    const distance = levenshtein(officialRecord.displayName, communityRecord.displayName);
    if (!exact && !prefix && distance > 2) continue;
    reconciliationLeads.push({
      officialDisplayName: officialRecord.displayName,
      communityDisplayName: communityRecord.displayName,
      relation: exact ? "exact_text" : prefix ? "prefix_text" : "edit_distance_le_2",
      editDistance: distance,
      status: "review_lead_only",
      reason: "Text similarity is not sufficient to assign a stable canonical hero ID."
    });
  }
}

const dictionary = JSON.parse(await readFile(path.join(ROOT, "data/import-dictionary.json"), "utf8"));
const hasHan = (text) => [...text].some((char) => char.codePointAt(0) > 127);
const coverage = {};
for (const kind of ["hero", "artifact", "set"]) {
  const entries = dictionary.entities[kind];
  coverage[kind] = {
    totalCanonicalEntities: entries.length,
    entitiesWithNonAsciiAlias: entries.filter((entry) => entry.aliases.some(hasHan)).length
  };
}

const output = {
  schemaVersion: "0.1.0",
  generatedAt: new Date().toISOString(),
  policy: "Candidate observations never enter the resolver until linked to a stable canonical ID with reviewed evidence.",
  sources: [communitySource, officialSource],
  dictionaryCoverageBeforeMerge: coverage,
  observations,
  reconciliationLeads
};

const outputPath = path.join(ROOT, "corpus", "compiled", "cn-name-candidates.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

const exactLeads = reconciliationLeads.filter((lead) => lead.relation === "exact_text").length;
const report = `# 国服名称候选与字典覆盖审计\n\n` +
  `生成时间：${output.generatedAt}\n\n` +
  `## 结论\n\n` +
  `当前导入字典不能被描述为“已覆盖国服名称”。351 个英雄中仅 ${coverage.hero.entitiesWithNonAsciiAlias} 个拥有非 ASCII 别名；147 个神器中为 ${coverage.artifact.entitiesWithNonAsciiAlias} 个；252 个套装中为 ${coverage.set.entitiesWithNonAsciiAlias} 个。` +
  `本次从社区目录固化 ${community.length} 条英雄名称观察，从 WeGame 官方营销页固化 ${official.length} 条官方名称观察，但全部保持 \`unlinked_candidate\`，未自动写入解析字典。\n\n` +
  `## 来源与证据等级\n\n` +
  `- \`SRC-022\`（游侠网）：社区目录，只能作为候选线索。页面存在疑似截断、重复或文字差异，不能据此认定当前国服标准名。\n` +
  `- \`SRC-023\`（WeGame）：官方营销页，可证明页面当时展示了这些中文名，但它只列出 ${official.length} 个样例，也没有给出可与国际服目录连接的稳定 ID。\n\n` +
  `## 机器编译结果\n\n` +
  `| 项目 | 数量 | 可直接进入解析器 |\n|---|---:|---:|\n` +
  `| 社区英雄名称观察 | ${community.length} | 0 |\n` +
  `| 官方英雄名称观察 | ${official.length} | 0 |\n` +
  `| 文本相似复核线索 | ${reconciliationLeads.length}（其中完全一致 ${exactLeads}） | 0 |\n\n` +
  `相似线索用于人工定位矛盾，例如全称/截断或一字差异；它不是身份映射。详情见 \`corpus/compiled/cn-name-candidates.json\`。\n\n` +
  `## 合并门槛\n\n` +
  `候选名只有在满足以下任一证据链后才进入 \`research/curated-aliases.json\`：\n\n` +
  `1. 当前目标客户端截图同时提供名称和可稳定复核的角色身份；\n` +
  `2. 官方双语页面、官方可导出数据或客户端静态数据给出中文名与稳定 ID；\n` +
  `3. 两个独立来源完成映射，且至少一个是官方或客户端证据，并经人工 Review。\n\n` +
  `## 下一步\n\n` +
  `优先获取国服角色列表/详情黄金截图，以“客户端中文名 → 角色图标/元素/稀有度/技能 → 公共目录稳定 ID”的多字段方式建立映射。任何不能唯一确认的记录继续保留为候选。\n`;
await writeFile(path.join(ROOT, "outputs", "cn-alias-coverage.md"), report);

console.log(JSON.stringify({
  output: path.relative(ROOT, outputPath),
  communityObservations: community.length,
  officialObservations: official.length,
  reconciliationLeads: reconciliationLeads.length,
  dictionaryCoverage: coverage
}, null, 2));
