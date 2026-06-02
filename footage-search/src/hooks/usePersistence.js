import { useState, useEffect, useCallback } from 'react';
import {
  loadIndex,
  clearAllData,
  loadClipsMeta,
  loadClipBuffer,
  loadQueryCache,
  saveQueryCache,
} from '../lib/store.js';

export function usePersistence() {
  const [index, setIndex] = useState(null);
  const [clipBuffers, setClipBuffers] = useState({});
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await loadIndex();
      if (loaded) {
        const storedMeta = await loadClipsMeta();
        const thumbByClip = new Map();
        for (const m of storedMeta) {
          if (m.thumbnailDataUrl) thumbByClip.set(m.clipId, m.thumbnailDataUrl);
        }
        loaded.clipMeta = (loaded.clipMeta || []).map((m) => ({
          ...m,
          thumbnailDataUrl: m.thumbnailDataUrl || thumbByClip.get(m.clipId) || null,
        }));

        setIndex(loaded);
        const meta = storedMeta.length ? storedMeta : loaded.clipMeta;
        const buffers = {};
        await Promise.all(
          meta.map(async (m) => {
            const buf = await loadClipBuffer(m.clipId);
            if (buf) buffers[m.clipId] = buf;
          })
        );
        setClipBuffers(buffers);
        await loadQueryCache();
        setReady(true);
      } else {
        await loadQueryCache();
        setIndex(null);
        setClipBuffers({});
        setReady(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveQueryCache().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const clearIndex = useCallback(async () => {
    await clearAllData();
    setIndex(null);
    setClipBuffers({});
    setReady(false);
  }, []);

  const reloadIndex = useCallback(async () => {
    await restore();
  }, [restore]);

  return {
    index,
    setIndex,
    clipBuffers,
    setClipBuffers,
    loading,
    ready,
    clearIndex,
    reloadIndex,
  };
}
