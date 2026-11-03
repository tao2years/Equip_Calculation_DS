const STAT_RULES = new Map([
  ["HP", { statKey: "hp_flat", kind: "flat" }],
  ["HP%", { statKey: "hp_pct", kind: "ratio" }],
  ["ATK", { statKey: "atk_flat", kind: "flat" }],
  ["Attack", { statKey: "atk_flat", kind: "flat" }],
  ["ATK%", { statKey: "atk_pct", kind: "ratio" }],
  ["Attack%", { statKey: "atk_pct", kind: "ratio" }],
  ["DEF", { statKey: "def_flat", kind: "flat" }],
  ["Defense", { statKey: "def_flat", kind: "flat" }],
  ["DEF%", { statKey: "def_pct", kind: "ratio" }],
  ["Defense%", { statKey: "def_pct", kind: "ratio" }],
  ["Crit Rate", { statKey: "crit_rate", kind: "ratio" }],
  ["Crit Damage", { statKey: "crit_damage", kind: "ratio" }],
  ["Accuracy", { statKey: "accuracy", kind: "flat" }],
  ["Resistance", { statKey: "resistance", kind: "flat" }],
  ["Enlightenment", { statKey: "enlightenment", kind: "flat" }],
  ["Skill Haste", { statKey: "skill_haste", kind: "flat" }],
  ["Attack Speed", { statKey: "attack_speed_pct", kind: "ratio" }]
]);

const PIECE_PREFIX = /^\[([1-9]\d*)-piece\]\s+(.+)$/;
const STAT_TERM = /^(.+?)\+([0-9]+(?:\.[0-9]+)?)(%)?$/;

/**
 * Compile only a complete, unconditional static-stat set sentence.
 *
 * Deliberately conservative: one unknown word, trigger, duration or bracketed
 * conditional value rejects the whole sentence. Raw source text remains stored
 * separately by the catalog builder for later semantic modelling.
 */
export function parseStaticSetBonus(sourceText) {
  if (typeof sourceText !== "string") return null;
  const pieceMatch = sourceText.trim().match(PIECE_PREFIX);
  if (!pieceMatch) return null;

  const pieces = Number(pieceMatch[1]);
  const terms = pieceMatch[2].split(/，|,\s*/);
  if (!terms.length) return null;

  const sheetStats = {};
  for (const rawTerm of terms) {
    const term = rawTerm.trim();
    const termMatch = term.match(STAT_TERM);
    if (!termMatch) return null;

    const [, label, rawValue, percentMark] = termMatch;
    const rule = STAT_RULES.get(label);
    if (!rule) return null;
    if ((rule.kind === "ratio") !== Boolean(percentMark)) return null;

    const value = Number(rawValue);
    if (!Number.isFinite(value)) return null;
    sheetStats[rule.statKey] = (sheetStats[rule.statKey] || 0) + (rule.kind === "ratio" ? value / 100 : value);
  }

  return {
    pieces,
    sheetStats,
    evidence: "parsed_static_official_wiki_text",
    sourceText
  };
}

export const supportedStaticSetLabels = Object.freeze([...STAT_RULES.keys()]);
