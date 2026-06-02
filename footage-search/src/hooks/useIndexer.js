import { useState, useRef, useCallback, useEffect } from 'react';
import { saveClipBuffer } from '../lib/store.js';
import { getVideoDuration } from '../lib/videoDuration.js';
import {
  extractFramesWithCanvas,
  thumbnailDataUrlFromFrames,
} from '../lib/canvasFrames.js';
import { API_KEY_STORAGE } from '../constants.js';

function makeClipId() {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveApiKey(apiKey) {
  return (apiKey || localStorage.getItem(API_KEY_STORAGE) || '').trim();
}

async function extractCanvasFramesForFile(file, duration) {
  try {
    const { frames, thumbnailDataUrl } = await extractFramesWithCanvas(file, duration);
    if (frames.length > 0) {
      console.log(`[indexer] extracted ${frames.length} frames via canvas`);
    }
    return {
      frames,
      thumbnailDataUrl:
        thumbnailDataUrl || thumbnailDataUrlFromFrames(frames) || null,
    };
  } catch (err) {
    console.warn('[indexer] canvas frame extraction failed:', err);
    return { frames: [], thumbnailDataUrl: null };
  }
}

export function useIndexer({ apiKey, onIndexed, onError }) {
  // Hooks: useState x1, useRef x8, useCallback x5, useEffect x4

  const [clips, setClips] = useState([]);

  const workerRef = useRef(null);
  const queueRef = useRef([]);
  const clipDataRef = useRef(new Map());
  const clipFilesRef = useRef(new Map());
  const busyRef = useRef(false);
  const apiKeyRef = useRef(apiKey);
  const onIndexedRef = useRef(onIndexed);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  useEffect(() => {
    onIndexedRef.current = onIndexed;
  }, [onIndexed]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const getClipFile = useCallback((clipId) => clipFilesRef.current.get(clipId), []);

  const clearClipFiles = useCallback(() => {
    clipFilesRef.current.clear();
    clipDataRef.current.clear();
  }, []);

  const processQueue = useCallback(() => {
    const key = resolveApiKey(apiKeyRef.current);
    if (busyRef.current || !key) return;

    const next = queueRef.current.shift();
    if (!next) return;

    busyRef.current = true;
    workerRef.current?.postMessage({
      type: 'index-clip',
      clipId: next.clipId,
      fileName: next.fileName,
      fileBuffer: next.buffer,
      apiKey: key,
      duration: next.duration,
      canvasFrames: next.canvasFrames ?? [],
      thumbnailDataUrl: next.thumbnailDataUrl ?? null,
    });
  }, []);

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/indexer.worker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === 'progress') {
        setClips((prev) =>
          prev.map((c) =>
            c.clipId === msg.clipId
              ? { ...c, stage: msg.stage, status: 'indexing', error: undefined }
              : c
          )
        );
      }

      if (msg.type === 'indexed') {
        const meta = msg.clipMeta?.find((m) => m.clipId === msg.clipId);
        setClips((prev) =>
          prev.map((c) =>
            c.clipId === msg.clipId
              ? {
                  ...c,
                  stage: 'done',
                  status: 'ready',
                  duration: meta?.duration ?? c.duration,
                  thumbnailDataUrl: meta?.thumbnailDataUrl,
                  error: undefined,
                }
              : c
          )
        );
        onIndexedRef.current?.(msg);
        busyRef.current = false;
        processQueue();
      }

      if (msg.type === 'error') {
        console.error('[indexer]', msg.stage, msg.message, msg.stack);
        setClips((prev) =>
          prev.map((c) =>
            c.clipId === msg.clipId
              ? {
                  ...c,
                  status: 'error',
                  stage: msg.stage || c.stage,
                  error: msg.message,
                }
              : c
          )
        );
        onErrorRef.current?.(msg);
        busyRef.current = false;
        processQueue();
      }
    };

    worker.onerror = (event) => {
      console.error('[indexer] worker error', event.message);
      busyRef.current = false;
      processQueue();
    };

    return () => worker.terminate();
  }, [processQueue]);

  const queueClipForIndexing = useCallback(
    async (clipId, fileName, buffer, duration, file) => {
      const { frames: canvasFrames, thumbnailDataUrl } = file
        ? await extractCanvasFramesForFile(file, duration)
        : { frames: [], thumbnailDataUrl: null };

      if (file) {
        clipFilesRef.current.set(clipId, file);
      }

      clipDataRef.current.set(clipId, {
        file,
        buffer,
        fileName,
        duration,
        canvasFrames,
        thumbnailDataUrl,
      });

      queueRef.current.push({
        clipId,
        fileName,
        buffer,
        duration,
        canvasFrames,
        thumbnailDataUrl,
      });
      processQueue();
    },
    [processQueue]
  );

  const sendClipToWorker = useCallback(
    async (clipId) => {
      const data = clipDataRef.current.get(clipId);
      if (!data) return;

      const key = resolveApiKey(apiKeyRef.current);
      if (!key) {
        onErrorRef.current?.({ message: 'OpenAI API key required' });
        return;
      }

      setClips((prev) =>
        prev.map((c) =>
          c.clipId === clipId
            ? {
                ...c,
                status: 'indexing',
                stage: 'transcribing',
                error: undefined,
              }
            : c
        )
      );

      await queueClipForIndexing(
        clipId,
        data.fileName,
        data.buffer,
        data.duration,
        data.file
      );
    },
    [queueClipForIndexing]
  );

  const enqueueClip = useCallback(
    async (file) => {
      const key = resolveApiKey(apiKeyRef.current);
      if (!key) {
        onErrorRef.current?.({ message: 'OpenAI API key required' });
        return null;
      }

      const clipId = makeClipId();
      const duration = await getVideoDuration(file);
      const buffer = await file.arrayBuffer();

      clipFilesRef.current.set(clipId, file);

      const clip = {
        clipId,
        fileName: file.name,
        duration,
        stage: 'transcribing',
        status: 'indexing',
      };

      setClips((prev) => [...prev, clip]);
      await queueClipForIndexing(clipId, file.name, buffer, duration, file);
      return clipId;
    },
    [queueClipForIndexing]
  );

  const retryClip = useCallback(
    (clipId) => {
      sendClipToWorker(clipId);
    },
    [sendClipToWorker]
  );

  const indexedCount = clips.filter(
    (c) => c.stage === 'done' || c.status === 'ready'
  ).length;
  const totalCount = clips.length;

  return {
    clips,
    setClips,
    enqueueClip,
    retryClip,
    getClipFile,
    clearClipFiles,
    indexedCount,
    totalCount,
  };
}
