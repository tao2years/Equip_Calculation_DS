const PARSER_VERSION = "artifact-static-effect-0.1.0";
const EFFECT_PATTERN = /^The wearer (?:obtains|gains) (\d+(?:\.\d+)?)\s*(%?) extra (HP|Attack|Defense|Crit Rate|Crit Damage|Accuracy|Resistance|Enlightenment|Skill Haste|Attack Speed)\.$/i;

const STAT_RULES = {
  hp: { flat: "hp_flat", ratio: "hp_pct", units: ["flat", "ratio"] },
  attack: { flat: "atk_flat", ratio: "atk_pct", units: ["flat", "ratio"] },
  defense: { flat: "def_flat", ratio: "def_pct", units: ["flat", "ratio"] },
  "crit rate": { ratio: "crit_rate", units: ["ratio"] },
  "crit damage": { ratio: "crit_damage", units: ["ratio"] },
  accuracy: { flat: "accuracy", units: ["flat"] },
  resistance: { flat: "resistance", units: ["flat"] },
  enlightenment: { flat: "enlightenment", units: ["flat"] },
  "skill haste": { flat: "skill_haste", units: ["flat"] },
  "attack speed": { ratio: "attack_speed_pct", units: ["ratio"] }
};

export function parseArtifactStaticEffect(text) {
  const rawText = String(text || "").trim();
  const match = rawText.match(EFFECT_PATTERN);
  if (!match) return null;
  const [, rawValue, percent, rawStat] = match;
  const rule = STAT_RULES[rawStat.toLowerCase()];
  const unit = percent ? "ratio" : "flat";
  if (!rule || !rule.units.includes(unit)) return null;
  const stat = rule[unit];
  const value = Number(rawValue) / (unit === "ratio" ? 100 : 1);
  if (!stat || !Number.isFinite(value)) return null;
  return {
    sheetStats: { [stat]: value },
    rawText,
    parserVersion: PARSER_VERSION,
    evidenceLevel: "public_unconditional_static_effect_text_parsed_not_client_validated"
  };
}

export function compileArtifactStaticEffectLevels(effectLevels = []) {
  if (!Array.isArray(effectLevels) || !effectLevels.length) return [];
  const parsed = effectLevels.map((level) => ({ level, result: parseArtifactStaticEffect(level.description) }));
  if (parsed.some((entry) => !entry.result)) return [];
  return parsed.map(({ level, result }) => ({
    refinement: level.refinement,
    values: result.sheetStats,
    rawText: result.rawText,
    parserVersion: result.parserVersion,
    evidenceLevel: result.evidenceLevel
  }));
}

export { PARSER_VERSION as ARTIFACT_STATIC_EFFECT_PARSER_VERSION };
