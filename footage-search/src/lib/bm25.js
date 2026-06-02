import { BM25_K1, BM25_B } from '../constants.js';

/**
 * Tokenize: lowercase, remove punctuation, split on whitespace.
 */
export function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export class BM25Index {
  constructor() {
    this.docCount = 0;
    this.avgDocLength = 0;
    this.docLengths = [];
    this.invertedIndex = new Map();
    this.idf = new Map();
    this.docTokens = [];
  }

  build(chunks) {
    this.docCount = chunks.length;
    this.docLengths = [];
    this.docTokens = [];
    this.invertedIndex = new Map();
    const termDocFreq = new Map();

    for (let i = 0; i < chunks.length; i++) {
      const tokens = tokenize(chunks[i].text || '');
      this.docTokens.push(tokens);
      this.docLengths.push(tokens.length);

      const tfMap = new Map();
      for (const term of tokens) {
        tfMap.set(term, (tfMap.get(term) || 0) + 1);
      }

      for (const [term, tf] of tfMap) {
        if (!this.invertedIndex.has(term)) {
          this.invertedIndex.set(term, []);
        }
        this.invertedIndex.get(term).push({ chunkIndex: i, tf });
        termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
      }
    }

    const totalLen = this.docLengths.reduce((a, b) => a + b, 0);
    this.avgDocLength = this.docCount > 0 ? totalLen / this.docCount : 0;

    this.idf = new Map();
    const N = this.docCount;
    for (const [term, df] of termDocFreq) {
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      this.idf.set(term, idf);
    }
  }

  score(query) {
    const queryTerms = tokenize(query);
    const scores = new Float64Array(this.docCount);

    for (const term of queryTerms) {
      const idf = this.idf.get(term);
      if (idf === undefined) continue;

      const postings = this.invertedIndex.get(term);
      if (!postings) continue;

      for (const { chunkIndex, tf } of postings) {
        const docLen = this.docLengths[chunkIndex];
        const numerator = tf * (BM25_K1 + 1);
        const denominator =
          tf +
          BM25_K1 *
            (1 -
              BM25_B +
              BM25_B * (docLen / (this.avgDocLength || 1)));
        scores[chunkIndex] += idf * (numerator / denominator);
      }
    }

    const results = [];
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > 0) {
        results.push({ chunkIndex: i, score: scores[i] });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  search(query, topK = 50) {
    return this.score(query).slice(0, topK);
  }

  serialize() {
    const invertedIndex = {};
    for (const [term, postings] of this.invertedIndex) {
      invertedIndex[term] = postings;
    }
    const idf = {};
    for (const [term, value] of this.idf) {
      idf[term] = value;
    }
    return {
      docCount: this.docCount,
      avgDocLength: this.avgDocLength,
      docLengths: this.docLengths,
      invertedIndex,
      idf,
    };
  }

  static deserialize(data) {
    const index = new BM25Index();
    index.docCount = data.docCount;
    index.avgDocLength = data.avgDocLength;
    index.docLengths = data.docLengths;
    index.invertedIndex = new Map(
      Object.entries(data.invertedIndex).map(([k, v]) => [k, v])
    );
    index.idf = new Map(Object.entries(data.idf).map(([k, v]) => [k, +v]));
    return index;
  }
}
