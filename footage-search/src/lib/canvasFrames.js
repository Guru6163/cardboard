import {
  FRAME_SAMPLE_INTERVAL_SEC,
  MAX_CANVAS_FRAMES,
  CANVAS_FRAME_WIDTH,
  CANVAS_FRAME_HEIGHT,
} from '../constants.js';

function waitForVideoReady(video) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not load video'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function seekVideo(video, timeSec) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video seek failed'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    const maxTime = Number.isFinite(video.duration) ? video.duration : timeSec;
    const target = Math.min(Math.max(0, timeSec), Math.max(0, maxTime - 0.05));
    video.currentTime = target;
  });
}

function openVideoSource(fileOrBuffer) {
  const url =
    fileOrBuffer instanceof File || fileOrBuffer instanceof Blob
      ? URL.createObjectURL(fileOrBuffer)
      : URL.createObjectURL(new Blob([fileOrBuffer], { type: 'video/mp4' }));
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  return { video, url };
}

/**
 * Capture a single JPEG data URL at a timestamp (main thread).
 */
export async function captureThumbnailDataUrl(fileOrBuffer, timeSec = 0) {
  const { video, url } = openVideoSource(fileOrBuffer);
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_FRAME_WIDTH;
  canvas.height = CANVAS_FRAME_HEIGHT;
  const ctx = canvas.getContext('2d');

  try {
    await waitForVideoReady(video);
    if (timeSec > 0.05) {
      await seekVideo(video, timeSec);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Extract JPEG frames via canvas (main thread) — no ffmpeg WASM memory.
 */
export async function extractFramesWithCanvas(file, durationSec) {
  const frames = [];
  let thumbnailDataUrl = null;
  const { video, url } = openVideoSource(file);

  try {
    await waitForVideoReady(video);

    const duration =
      durationSec > 0 && Number.isFinite(durationSec)
        ? durationSec
        : video.duration || 0;

    const timestamps = [];
    for (
      let t = 0;
      t < duration && timestamps.length < MAX_CANVAS_FRAMES;
      t += FRAME_SAMPLE_INTERVAL_SEC
    ) {
      timestamps.push(t);
    }
    if (timestamps.length === 0) timestamps.push(0);

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_FRAME_WIDTH;
    canvas.height = CANVAS_FRAME_HEIGHT;
    const ctx = canvas.getContext('2d');

    for (const t of timestamps) {
      try {
        if (t > 0.05) {
          await seekVideo(video, t);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', 0.7);
        });
        if (!blob) continue;
        if (thumbnailDataUrl == null) {
          thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.6);
        }
        const data = new Uint8Array(await blob.arrayBuffer());
        frames.push({ timestamp: t, data });
      } catch (err) {
        console.warn(`[canvas] frame at ${t}s skipped:`, err);
      }
    }

    if (!thumbnailDataUrl && frames.length > 0) {
      thumbnailDataUrl = await captureThumbnailDataUrl(file, 0);
    }
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }

  return { frames, thumbnailDataUrl };
}

export { thumbnailDataUrlFromFrames } from './thumbnail.js';
