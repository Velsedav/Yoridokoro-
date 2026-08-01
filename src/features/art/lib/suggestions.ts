const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .trim();

export function matchSuggestions(options: string[], query: string, minimumLength = 1, limit = 8) {
  const needle = normalize(query);
  if (needle.length < minimumLength) return [];
  const matchRank = (value: string) => {
    const normalized = normalize(value);
    if (normalized.startsWith(needle)) return 0;
    if (normalized.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(needle))) return 1;
    return 2;
  };
  return [...new Map(options.map((option) => [normalize(option), option.trim()])).values()]
    .filter((option) => normalize(option).includes(needle))
    .sort((a, b) => {
      return matchRank(a) - matchRank(b) || a.length - b.length || a.localeCompare(b);
    })
    .slice(0, limit);
}
