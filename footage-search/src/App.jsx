import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { clearThumbnailCache } from './lib/thumbnailQueue.js';
import TopBar from './components/layout/TopBar.jsx';
import MediaLibraryPanel from './components/layout/MediaLibraryPanel.jsx';
import AgentPanel from './components/layout/AgentPanel.jsx';
import SearchInput from './components/SearchInput.jsx';
import ResultCard from './components/ResultCard.jsx';
import VideoModal from './components/VideoModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { IconGrid, IconList } from './components/icons.jsx';
import { usePersistence } from './hooks/usePersistence.js';
import { useIndexer } from './hooks/useIndexer.js';
import { useHybridSearch } from './hooks/useHybridSearch.js';
import { API_KEY_STORAGE } from './constants.js';

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '');
  const [playTarget, setPlayTarget] = useState(null);
  const [clipUrls, setClipUrls] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resultsLayout, setResultsLayout] = useState('grid');

  const {
    index,
    clipBuffers,
    loading: persistenceLoading,
    ready: indexReady,
    clearIndex,
    reloadIndex,
  } = usePersistence();

  const handleIndexerError = useCallback((msg) => {
    console.error('Indexer error:', msg);
  }, []);

  const handleIndexed = useCallback(async () => {
    await reloadIndex();
  }, [reloadIndex]);

  const {
    clips,
    enqueueClip,
    retryClip,
    getClipFile,
    clearClipFiles,
    indexedCount,
    totalCount,
    setClips,
  } = useIndexer({
    apiKey,
    onIndexed: handleIndexed,
    onError: handleIndexerError,
  });

  const {
    query,
    setQuery,
    results,
    searchMode,
    searchReady,
    resultSummary,
    isDebouncing,
    hybridComplete,
  } = useHybridSearch(index, apiKey);

  const handleFiles = useCallback(
    async (files) => {
      for (const file of files) {
        await enqueueClip(file);
      }
    },
    [enqueueClip]
  );

  const metaByClipId = useMemo(() => {
    const map = {};
    for (const m of index?.clipMeta || []) {
      map[m.clipId] = { ...m };
    }
    for (const c of clips) {
      const prev = map[c.clipId];
      if (!prev) {
        map[c.clipId] = { ...c };
      } else {
        map[c.clipId] = {
          ...prev,
          ...c,
          thumbnailDataUrl: c.thumbnailDataUrl || prev.thumbnailDataUrl,
          fileName: c.fileName || prev.fileName,
        };
      }
    }
    return map;
  }, [index?.clipMeta, clips]);

  useEffect(() => {
    if (typeof crossOriginIsolated !== 'undefined') {
      console.log('[footage-search] crossOriginIsolated:', crossOriginIsolated);
      if (!crossOriginIsolated) {
        console.warn(
          '[footage-search] ffmpeg.wasm requires crossOriginIsolated. Restart `npm run dev` so Vite COOP/COEP headers apply.'
        );
      }
    }
  }, []);

  useEffect(() => {
    if (!apiKey && !indexReady) {
      setSettingsOpen(true);
    }
  }, [apiKey, indexReady]);

  useEffect(() => {
    if (persistenceLoading || !index?.clipMeta?.length) return;
    const hydrated = index.clipMeta.map((m) => ({
      clipId: m.clipId,
      fileName: m.fileName,
      duration: m.duration,
      stage: 'done',
      status: 'ready',
    }));
    setClips((prev) => {
      if (
        prev.length === hydrated.length &&
        prev.every(
          (p, i) =>
            p.clipId === hydrated[i].clipId &&
            p.status === 'ready' &&
            p.fileName === hydrated[i].fileName
        )
      ) {
        return prev;
      }
      return hydrated;
    });
  }, [persistenceLoading, index?.clipMeta, setClips]);

  useEffect(() => {
    const urls = {};
    for (const [clipId, buffer] of Object.entries(clipBuffers)) {
      const blob = new Blob([buffer], { type: 'video/mp4' });
      urls[clipId] = URL.createObjectURL(blob);
    }
    setClipUrls(urls);
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [clipBuffers]);

  const saveApiKey = (value) => {
    setApiKey(value);
    if (value) localStorage.setItem(API_KEY_STORAGE, value);
    else localStorage.removeItem(API_KEY_STORAGE);
  };

  const deferredResults = useDeferredValue(results);

  const maxScore = useMemo(() => {
    if (!deferredResults.length) return 1;
    let max = 0;
    for (const r of deferredResults) {
      if (r.score > max) max = r.score;
    }
    return max || 1;
  }, [deferredResults]);

  const handleClear = async () => {
    if (!confirm('Clear all indexed clips and search data?')) return;
    await clearIndex();
    clearClipFiles();
    clearThumbnailCache();
    setClips([]);
    setQuery('');
  };

  const handlePlayResult = useCallback((segment) => {
    setPlayTarget(segment);
  }, []);

  const modalClip = useMemo(() => {
    if (!playTarget) return null;
    const file = getClipFile(playTarget.clipId);
    return {
      file: file || undefined,
      blobUrl: !file ? clipUrls[playTarget.clipId] : undefined,
      startTime: playTarget.startTime ?? 0,
      endTime: playTarget.endTime ?? 0,
      clipName: metaByClipId[playTarget.clipId]?.fileName || 'clip',
      matchedText: playTarget.matchedText,
    };
  }, [playTarget, clipUrls, metaByClipId, getClipFile]);

  const canSearch = searchReady || indexReady;
  const displayIndexed = Math.max(indexedCount, index?.clipMeta?.length || 0);
  const displayTotal = Math.max(totalCount, index?.clipMeta?.length || 0);
  const hasResults = query && deferredResults.length > 0;
  const resultsPending = results !== deferredResults;
  const showEmptySearch =
    query && canSearch && deferredResults.length === 0 && searchMode !== 'searching';

  return (
    <div className="h-full flex flex-col">
      <TopBar
        indexedCount={displayIndexed}
        totalCount={displayTotal}
        onOpenSettings={() => setSettingsOpen(true)}
        onClear={handleClear}
        canClear={indexReady || displayIndexed > 0}
      />

      <div className="flex-1 flex min-h-0">
        <MediaLibraryPanel
          clips={clips}
          onFiles={handleFiles}
          onRetry={retryClip}
          disabled={!apiKey}
          persistenceLoading={persistenceLoading}
          metaByClipId={metaByClipId}
        />

        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 overflow-y-auto filmstrip-scroll">
            <div className="px-6 py-8 lg:py-12">
              <SearchInput
                value={query}
                onChange={setQuery}
                disabled={!canSearch}
                searchMode={query ? searchMode : 'idle'}
                isDebouncing={isDebouncing}
                hybridComplete={hybridComplete}
              />

              {!apiKey && (
                <div className="max-w-md mx-auto mt-6 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-center">
                  <p className="text-sm text-editor-dim">
                    Add your OpenAI key in{' '}
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="text-accent-bright underline underline-offset-2 hover:text-white"
                    >
                      settings
                    </button>{' '}
                    to index and search footage.
                  </p>
                </div>
              )}

              {!canSearch && apiKey && (
                <p className="text-center text-sm text-editor-muted mt-8 max-w-sm mx-auto">
                  Upload and index at least one clip — then search by moment, mood, or dialogue.
                </p>
              )}

              {showEmptySearch && (
                <p className="text-center text-sm text-editor-muted mt-10">
                  No matches — try different words or a broader description.
                </p>
              )}

              {hasResults && (
                <div
                  className={`max-w-4xl mx-auto mt-10 transition-opacity duration-150 ${resultsPending ? 'opacity-70' : 'opacity-100'}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs text-editor-muted uppercase tracking-wider font-medium">
                      {deferredResults.length} moment{deferredResults.length !== 1 ? 's' : ''} found
                      {resultSummary && (
                        <span className="normal-case text-editor-dim ml-2">· {resultSummary}</span>
                      )}
                    </p>
                    <div className="flex rounded-lg border border-editor-border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setResultsLayout('grid')}
                        className={`p-1.5 ${resultsLayout === 'grid' ? 'bg-editor-elevated text-editor-text' : 'text-editor-muted hover:text-editor-dim'}`}
                        aria-label="Grid view"
                      >
                        <IconGrid />
                      </button>
                      <button
                        type="button"
                        onClick={() => setResultsLayout('filmstrip')}
                        className={`p-1.5 border-l border-editor-border ${resultsLayout === 'filmstrip' ? 'bg-editor-elevated text-editor-text' : 'text-editor-muted hover:text-editor-dim'}`}
                        aria-label="Filmstrip view"
                      >
                        <IconList />
                      </button>
                    </div>
                  </div>

                  {resultsLayout === 'filmstrip' ? (
                    <div className="flex gap-3 overflow-x-auto filmstrip-scroll pb-2 -mx-1 px-1">
                      {deferredResults.map((result, i) => (
                        <ResultCard
                          key={`${result.clipId}-${result.startTime}-${i}`}
                          result={result}
                          fileName={metaByClipId[result.clipId]?.fileName || 'clip'}
                          query={query}
                          maxScore={maxScore}
                          thumbnailDataUrl={metaByClipId[result.clipId]?.thumbnailDataUrl}
                          clipFile={getClipFile(result.clipId)}
                          clipBuffer={clipBuffers[result.clipId]}
                          onPlay={handlePlayResult}
                          layout="filmstrip"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deferredResults.map((result, i) => (
                        <ResultCard
                          key={`${result.clipId}-${result.startTime}-${i}`}
                          result={result}
                          fileName={metaByClipId[result.clipId]?.fileName || 'clip'}
                          query={query}
                          maxScore={maxScore}
                          thumbnailDataUrl={metaByClipId[result.clipId]?.thumbnailDataUrl}
                          clipFile={getClipFile(result.clipId)}
                          clipBuffer={clipBuffers[result.clipId]}
                          onPlay={handlePlayResult}
                          layout="grid"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        <AgentPanel
          clips={clips}
          searchMode={query ? searchMode : 'idle'}
          resultSummary={resultSummary}
          query={query}
        />
      </div>

      <VideoModal clip={modalClip} onClose={() => setPlayTarget(null)} />

      <SettingsModal
        open={settingsOpen}
        apiKey={apiKey}
        onSave={saveApiKey}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
