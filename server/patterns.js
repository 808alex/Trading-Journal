// Lightweight recurring-pattern detector over free-text trade notes.
// No ML/embeddings -- just n-gram frequency counting, which is exactly what
// the brief asks for: surface phrases like "fomo" or "sold too early" that
// keep showing up across trades.

// Trimmed from the edges of n-grams only (not the middle), so phrases like
// "sold too early" survive intact -- "too" carries meaning inside a phrase,
// it just shouldn't be allowed to start or end one (e.g. "the fomo").
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'at', 'for', 'this', 'that', 'these', 'those',
  'it', 'its', 'i', 'my', 'me', 'we', 'our', 'you', 'your', 'he', 'she',
  'they', 'them', 'their', 'so', 'then', 'with', 'as', 'by', 'from',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n);
    if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[gram.length - 1])) continue;
    if (n === 1 && gram[0].length < 3) continue; // skip noise like "ok", "it"
    out.push(gram.join(' '));
  }
  return out;
}

// One entry per trade: { text: string } where text is that trade's combined
// lesson_learned + thoughts_during. Returns top recurring phrases, each of
// which showed up in at least `minTrades` distinct trades.
function computeRecurringPatterns(trades, { minTrades = 2, limit = 8 } = {}) {
  const counts = new Map(); // phrase -> number of distinct trades mentioning it
  const maxN = new Map(); // phrase -> n (word count), for dedup below

  trades.forEach((text) => {
    if (!text || !text.trim()) return;
    const tokens = tokenize(text);
    const seenInThisTrade = new Set();
    for (const n of [3, 2, 1]) {
      for (const phrase of ngrams(tokens, n)) {
        seenInThisTrade.add(phrase);
        if (!maxN.has(phrase)) maxN.set(phrase, n);
      }
    }
    seenInThisTrade.forEach((phrase) => {
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    });
  });

  let candidates = [...counts.entries()]
    .filter(([, count]) => count >= minTrades)
    .map(([phrase, count]) => ({ phrase, count, n: maxN.get(phrase) }));

  // Dedup: if a shorter phrase is fully contained in a longer selected phrase
  // with the same count, it's redundant (the longer phrase already explains
  // every occurrence) -- e.g. don't show "sold too" next to "sold too early"
  // when they co-occur every time.
  candidates.sort((a, b) => b.count - a.count || b.n - a.n);
  const selected = [];
  for (const c of candidates) {
    const redundant = selected.some(
      (s) => s.count === c.count && s.n > c.n && s.phrase.includes(c.phrase)
    );
    if (!redundant) selected.push(c);
  }

  return selected.slice(0, limit).map(({ phrase, count }) => ({ phrase, count }));
}

module.exports = { computeRecurringPatterns };
