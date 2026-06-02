import { BM25Index } from './bm25.js';
import { semanticSearch } from './similarity.js';
import { RRF_K, TOP_K_RESULTS } from '../constants.js';

export function buildSubsetBm25(chunks, type) {
  const subset = [];
  const indexMap = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].type === type) {
      indexMap.push(i);
      subset.push(chunks[i]);
    }
  }
  const bm25 = new BM25Index();
  if (subset.length > 0) bm25.build(subset);
  return { bm25, indexMap, hasDocs: subset.length > 0 };
}

export function searchSubsetBm25(bm25, indexMap, query, topK = 50) {
  if (!bm25 || indexMap.length === 0 || !query?.trim()) return [];
  const hits = bm25.search(query, topK);
  return hits.map((h) => ({
    chunkIndex: indexMap[h.chunkIndex],
    score: h.score,
  }));
}

/**
 * Positional / temporal rule matching from query cues.
 */
export function temporalSearch(query, chunks, clipMetaById) {
  const q = query.toLowerCase();
  const rules = [];

  if (/\b(start|beginning|opening|intro|first)\b/.test(q)) {
    rules.push({ lo: 0, hi: 0.2 });
  }
  if (/\b(end|ending|closing|outro|final|last)\b/.test(q)) {
    rules.push({ lo: 0.8, hi: 1 });
  }
  if (/\b(middle|midway|center)\b/.test(q)) {
    rules.push({ lo: 0.4, hi: 0.6 });
  }

  const timeMatch = q.match(/\b(\d{1,2}):(\d{2})\b/);
  let targetSec = null;
  if (timeMatch) {
    targetSec = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
  }

  if (rules.length === 0 && targetSec == null) return [];

  const results = [];
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const meta = clipMetaById[chunk.clipId];
    const dur = meta?.duration || chunk.endTime || 60;
    const start = chunk.startTime ?? chunk.timestamp ?? 0;
    const end = chunk.endTime ?? start + 3;
    const mid = (start + end) / 2;

    let score = 0;
    if (targetSec != null) {
      const dist = Math.abs(mid - targetSec);
      if (dist < 15) score = 1 - dist / 15;
    }
    if (rules.length > 0) {
      const ratio = dur > 0 ? mid / dur : 0;
      for (const rule of rules) {
        if (ratio >= rule.lo && ratio <= rule.hi) {
          score = Math.max(score, 1);
          break;
        }
      }
    }
    if (score > 0) results.push({ chunkIndex, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 50);
}

export function semanticSearchByType(queryEmbedding, chunks, embeddings, type, topK = 50) {
  const typedIndices = [];
  const typedEmbeddings = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].type === type && embeddings[i]?.length) {
      typedIndices.push(i);
      typedEmbeddings.push(embeddings[i]);
    }
  }
  if (typedEmbeddings.length === 0) return [];

  const hits = semanticSearch(queryEmbedding, typedEmbeddings, topK);
  return hits.map((h) => ({
    chunkIndex: typedIndices[h.chunkIndex],
    score: h.score,
  }));
}

/**
 * RRF fuse multiple ranked lists. Each list: { signal, results: [{chunkIndex, score?}] }
 */
export function rrfFuse(rankLists, chunks, k = RRF_K) {
  const fused = new Map();

  for (const { signal, results } of rankLists) {
    results.forEach((r, rank) => {
      const prev = fused.get(r.chunkIndex) || {
        chunkIndex: r.chunkIndex,
        score: 0,
        signals: {},
        signalScores: {},
      };
      prev.score += 1 / (k + rank + 1);
      prev.signals[signal] = true;
      if (r.score != null) {
        prev.signalScores[signal] = Math.max(prev.signalScores[signal] || 0, r.score);
      }
      fused.set(r.chunkIndex, prev);
    });
  }

  const ranked = [...fused.values()].sort((a, b) => b.score - a.score);

  return ranked.slice(0, TOP_K_RESULTS).map((item) => {
    const chunk = chunks[item.chunkIndex];
    const matched = Object.keys(item.signals).filter((s) => item.signals[s]);
    const signalCount = matched.length;

    let matchType = 'keyword';
    if (signalCount >= 2) matchType = 'both';
    else if (item.signals.visual || item.signals.transcriptSemantic) matchType = 'semantic';

    return {
      clipId: chunk.clipId,
      startTime: chunk.startTime ?? chunk.timestamp ?? 0,
      endTime:
        chunk.endTime ??
        (chunk.timestamp != null ? chunk.timestamp + 3 : chunk.startTime),
      matchedText: chunk.text,
      score: item.score,
      matchType,
      chunkType: chunk.type,
      signals: {
        keyword: Boolean(item.signals.transcript),
        visual: Boolean(item.signals.visual),
        mood: Boolean(item.signals.mood),
        temporal: Boolean(item.signals.temporal),
        transcriptSemantic: Boolean(item.signals.transcriptSemantic),
      },
      signalScores: {
        transcript: item.signalScores?.transcript ?? 0,
        visual: item.signalScores?.visual ?? 0,
        mood: item.signalScores?.mood ?? 0,
        temporal: item.signalScores?.temporal ?? 0,
        transcriptSemantic: item.signalScores?.transcriptSemantic ?? 0,
      },
    };
  });
}

export function buildClipMetaMap(clipMeta) {
  const map = {};
  for (const m of clipMeta || []) {
    map[m.clipId] = m;
  }
  return map;
}
