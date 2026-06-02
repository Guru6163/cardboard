export function dotProduct(a, b) {
  let sum = 0;
  const len = a.length;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function magnitude(v) {
  let sum = 0;
  const len = v.length;
  for (let i = 0; i < len; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  const dot = dotProduct(a, b);
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

/**
 * Rank all chunk embeddings by similarity to query embedding.
 */
export function semanticSearch(queryEmbedding, embeddings, topK = 50) {
  const results = [];
  for (let i = 0; i < embeddings.length; i++) {
    const emb = embeddings[i];
    if (!emb || emb.length === 0) continue;
    const score = cosineSimilarity(queryEmbedding, emb);
    if (score > 0) {
      results.push({ chunkIndex: i, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
