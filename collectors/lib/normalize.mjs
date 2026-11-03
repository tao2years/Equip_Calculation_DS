export function normalizeAlias(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\s\-_'’·:：()（）[\]【】.,，。]/g, "");
}

export function createResolver(dictionary) {
  const indexes = {};
  for (const [kind, entries] of Object.entries(dictionary.entities || {})) {
    const index = new Map();
    for (const entry of entries) {
      for (const alias of entry.aliases || []) {
        const key = normalizeAlias(alias);
        if (!key) continue;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(entry);
      }
    }
    indexes[kind] = index;
  }

  return {
    resolve(kind, rawText) {
      const normalized = normalizeAlias(rawText);
      const matches = indexes[kind]?.get(normalized) || [];
      if (matches.length === 1) return { status: "matched", kind, rawText, normalized, match: matches[0] };
      if (matches.length > 1) return { status: "ambiguous", kind, rawText, normalized, matches };
      return { status: "unmatched", kind, rawText, normalized, matches: [] };
    }
  };
}
