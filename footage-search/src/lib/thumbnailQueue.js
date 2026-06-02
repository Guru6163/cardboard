import { captureThumbnailDataUrl } from './canvasFrames.js';

const cache = new Map();
const pending = new Map();
let queue = [];
let active = 0;
const MAX_CONCURRENT = 1;

function cacheKey(clipId, timeSec) {
  return `${clipId}:${Math.round(timeSec * 2) / 2}`;
}

export function getCachedThumbnail(clipId, timeSec) {
  return cache.get(cacheKey(clipId, timeSec)) ?? null;
}

function drain() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    if (!job) break;
    active += 1;
    captureThumbnailDataUrl(job.source, job.timeSec)
      .then((url) => {
        if (url) {
          cache.set(job.key, url);
          job.resolvers.forEach((r) => r(url));
        } else {
          job.resolvers.forEach((r) => r(null));
        }
      })
      .catch(() => {
        job.resolvers.forEach((r) => r(null));
      })
      .finally(() => {
        pending.delete(job.key);
        active -= 1;
        drain();
      });
  }
}

/**
 * Queue a frame capture so only one video decodes at a time.
 * @returns {Promise<string|null>}
 */
export function requestThumbnail(clipId, timeSec, source) {
  const key = cacheKey(clipId, timeSec);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const existing = pending.get(key);
  if (existing) {
    return new Promise((resolve) => {
      existing.resolvers.push(resolve);
    });
  }

  const job = { key, clipId, timeSec, source, resolvers: [] };
  pending.set(key, job);
  queue.push(job);

  return new Promise((resolve) => {
    job.resolvers.push(resolve);
    drain();
  });
}

export function clearThumbnailCache() {
  cache.clear();
  queue = [];
  pending.clear();
}
