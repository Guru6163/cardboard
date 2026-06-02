import { useState, useEffect, useRef, useMemo, startTransition } from 'react';
import OpenAI from 'openai';
import { queryCache } from '../lib/queryCache.js';
import {
  buildSubsetBm25,
  searchSubsetBm25,
  temporalSearch,
  semanticSearchByType,
  rrfFuse,
  buildClipMetaMap,
} from '../lib/searchSignals.js';
import {
  SEARCH_DEBOUNCE_MS,
  EMBEDDING_MODEL,
  EXPANSION_MODEL,
} from '../constants.js';
import { dedupResults } from '../lib/dedupResults.js';
import { scheduleIdleWork } from '../lib/scheduling.js';

const EMPTY_CHUNKS = [];
const EMPTY_EMBEDDINGS = [];

async function embedText(openai, text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return new Float32Array(response.data[0].embedding);
}

async function expandQuery(openai, query) {
  try {
    const response = await openai.chat.completions.create({
      model: EXPANSION_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You decompose video footage search queries. Return only valid JSON, no markdown.',
        },
        {
          role: 'user',
          content: `Decompose this search query into sub-queries for searching video footage.
Query: ${query}
Return JSON: { "visualQuery": string, "transcriptQuery": string }
visualQuery: describe what would be seen on screen
transcriptQuery: exact words or topics likely spoken`,
        },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim() || '';
    const parsed = JSON.parse(raw);
    return {
      visualQuery: parsed.visualQuery || query,
      transcriptQuery: parsed.transcriptQuery || query,
    };
  } catch {
    return { visualQuery: query, transcriptQuery: query };
  }
}

function countResultsBySignals(results) {
  let keyword = 0;
  let semantic = 0;
  let both = 0;
  for (const r of results) {
    const s = r.signals || {};
    const n = [s.keyword, s.visual, s.mood, s.transcriptSemantic].filter(Boolean).length;
    if (n >= 2) both++;
    else if (s.visual || s.transcriptSemantic) semantic++;
    else if (s.keyword || s.mood) keyword++;
  }
  return { keyword, semantic, both };
}

function runPhase1Search(q, chunks, clipMetaById, transcriptBm25, moodBm25) {
  if (!q || !chunks.length) return [];

  const transcriptHits = searchSubsetBm25(
    transcriptBm25?.bm25,
    transcriptBm25?.indexMap || [],
    q
  );

  const moodHits = searchSubsetBm25(
    moodBm25?.bm25,
    moodBm25?.indexMap || [],
    q
  );

  const temporalHits = temporalSearch(q, chunks, clipMetaById);

  return rrfFuse(
    [
      { signal: 'transcript', results: transcriptHits },
      { signal: 'mood', results: moodHits },
      { signal: 'temporal', results: temporalHits },
    ],
    chunks
  );
}

function runHybridFuse(
  q,
  chunks,
  embeddings,
  clipMetaById,
  transcriptBm25,
  moodBm25,
  visualEmbedding,
  transcriptEmbedding
) {
  const transcriptHits = searchSubsetBm25(
    transcriptBm25?.bm25,
    transcriptBm25?.indexMap || [],
    q
  );
  const moodHits = searchSubsetBm25(
    moodBm25?.bm25,
    moodBm25?.indexMap || [],
    q
  );
  const temporalHits = temporalSearch(q, chunks, clipMetaById);
  const visualHits = semanticSearchByType(
    visualEmbedding,
    chunks,
    embeddings,
    'visual'
  );
  const transcriptSemHits = semanticSearchByType(
    transcriptEmbedding,
    chunks,
    embeddings,
    'transcript'
  );

  return dedupResults(
    rrfFuse(
      [
        { signal: 'transcript', results: transcriptHits },
        { signal: 'mood', results: moodHits },
        { signal: 'temporal', results: temporalHits },
        { signal: 'visual', results: visualHits },
        { signal: 'transcriptSemantic', results: transcriptSemHits },
      ],
      chunks
    )
  );
}

export function useHybridSearch(index, apiKey) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchMode, setSearchMode] = useState('idle');
  const [resultSummary, setResultSummary] = useState('');
  const abortRef = useRef(0);
  const phase1CancelRef = useRef(() => {});

  const transcriptBm25Ref = useRef(null);
  const moodBm25Ref = useRef(null);
  const indexRef = useRef(index);

  const chunkCount = index?.chunks?.length ?? 0;

  useEffect(() => {
    indexRef.current = index;
    const chunks = index?.chunks;
    if (!chunks?.length) {
      transcriptBm25Ref.current = null;
      moodBm25Ref.current = null;
      return;
    }
    scheduleIdleWork(() => {
      transcriptBm25Ref.current = buildSubsetBm25(chunks, 'transcript');
      moodBm25Ref.current = buildSubsetBm25(chunks, 'mood');
    });
  }, [index, chunkCount]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const clipMetaById = useMemo(
    () => buildClipMetaMap(index?.clipMeta),
    [index?.clipMeta]
  );

  const isDebouncing = Boolean(
    query.trim() && query.trim() !== debouncedQuery
  );

  // Phase 1 — keyword results (idle + transition so typing stays smooth)
  useEffect(() => {
    phase1CancelRef.current();

    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchMode('idle');
      setResultSummary('');
      return;
    }

    const currentIndex = indexRef.current;
    const chunks = currentIndex?.chunks ?? EMPTY_CHUNKS;
    if (!currentIndex || chunks.length === 0) {
      setResults([]);
      return;
    }

    let cancelled = false;
    phase1CancelRef.current = () => {
      cancelled = true;
    };

    const cancelIdle = scheduleIdleWork(() => {
      if (cancelled) return;

      const phase1 = dedupResults(
        runPhase1Search(
          q,
          chunks,
          clipMetaById,
          transcriptBm25Ref.current,
          moodBm25Ref.current
        )
      );

      if (cancelled) return;

      startTransition(() => {
        setResults(phase1);
        setSearchMode('keyword');

        const debouncing = q !== debouncedQuery;
        if (debouncing) {
          const kw = phase1.filter((r) => r.signals?.keyword || r.signals?.mood).length;
          setResultSummary(
            `${kw || phase1.length} keyword matches · refining with semantic search...`
          );
        }
      });
    });

    phase1CancelRef.current = () => {
      cancelled = true;
      cancelIdle();
    };

    return () => phase1CancelRef.current();
  }, [query, debouncedQuery, chunkCount, clipMetaById]);

  // Phase 2 — debounced semantic + full RRF
  useEffect(() => {
    const q = debouncedQuery;
    if (!q) return;

    const currentIndex = indexRef.current;
    const chunks = currentIndex?.chunks ?? EMPTY_CHUNKS;
    const embeddings = currentIndex?.embeddings ?? EMPTY_EMBEDDINGS;
    if (!currentIndex || chunks.length === 0) return;
    if (!apiKey) return;

    const runId = ++abortRef.current;

    const finishHybrid = (visualEmbedding, transcriptEmbedding, expandedQueries) => {
      if (abortRef.current !== runId) return;

      const cancelIdle = scheduleIdleWork(() => {
        if (abortRef.current !== runId) return;

        const hybrid = runHybridFuse(
          q,
          chunks,
          embeddings,
          clipMetaById,
          transcriptBm25Ref.current,
          moodBm25Ref.current,
          visualEmbedding,
          transcriptEmbedding
        );

        if (abortRef.current !== runId) return;

        startTransition(() => {
          setResults(hybrid);
          setSearchMode('hybrid');

          const counts = countResultsBySignals(hybrid);
          setResultSummary(
            `${hybrid.length} results · ${counts.keyword} keyword · ${counts.semantic} semantic · ${counts.both} both`
          );
        });

        queryCache.set(q, expandedQueries, {
          visual: visualEmbedding,
          transcript: transcriptEmbedding,
        });
      });

      return cancelIdle;
    };

    const cached = queryCache.get(q);
    if (cached) {
      const cancel = finishHybrid(
        cached.embeddings.visual,
        cached.embeddings.transcript,
        cached.expandedQueries
      );
      return () => cancel?.();
    }

    let cancelFinish = () => {};

    (async () => {
      try {
        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const wordCount = q.trim().split(/\s+/).length;
        let expandedQueries;

        if (wordCount <= 3) {
          expandedQueries = { visualQuery: q, transcriptQuery: q };
        } else {
          expandedQueries = await expandQuery(openai, q);
        }

        if (abortRef.current !== runId) return;

        const [visualEmbedding, transcriptEmbedding] = await Promise.all([
          embedText(openai, expandedQueries.visualQuery),
          embedText(openai, expandedQueries.transcriptQuery),
        ]);

        cancelFinish = finishHybrid(visualEmbedding, transcriptEmbedding, expandedQueries) || (() => {});
      } catch {
        if (abortRef.current === runId) {
          startTransition(() => {
            setSearchMode('keyword');
            setResultSummary((prev) => prev || 'Keyword results · semantic search unavailable');
          });
        }
      }
    })();

    return () => {
      abortRef.current += 1;
      cancelFinish();
    };
  }, [debouncedQuery, chunkCount, apiKey, clipMetaById]);

  const searchReady = chunkCount > 0;

  const displayMode = isDebouncing && query.trim() ? 'searching' : searchMode;

  return {
    query,
    setQuery,
    results,
    searchMode: displayMode,
    searchReady,
    resultSummary,
    isDebouncing,
    hybridComplete:
      searchMode === 'hybrid' &&
      !isDebouncing &&
      debouncedQuery.length > 0 &&
      debouncedQuery === query.trim(),
  };
}
