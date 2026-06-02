import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import {
  FRAME_SAMPLE_INTERVAL_SEC,
  FRAME_MAX_WIDTH,
  MAX_FRAMES_PER_CLIP,
  MAX_FFMPEG_BATCH_FRAMES,
} from '../constants.js';

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

const FRAME_SCALE_FILTER = `scale=${FRAME_MAX_WIDTH}:-2`;

let ffmpegInstance = null;
let loadPromise = null;

function assertCrossOriginIsolated() {
  if (typeof self !== 'undefined' && self.crossOriginIsolated === false) {
    throw new Error(
      'crossOriginIsolated is false — ffmpeg.wasm requires COOP/COEP headers. Restart the Vite dev server.'
    );
  }
}

export async function getFFmpeg() {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!loadPromise) {
    loadPromise = (async () => {
      assertCrossOriginIsolated();

      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }) => console.log('[ffmpeg]', message));

      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${CORE_BASE}/ffmpeg-core.js`,
            'text/javascript'
          ),
          wasmURL: await toBlobURL(
            `${CORE_BASE}/ffmpeg-core.wasm`,
            'application/wasm'
          ),
        });
        console.log('[ffmpeg] loaded successfully');
      } catch (err) {
        console.error('[ffmpeg] load failed:', err);
        loadPromise = null;
        throw new Error(`ffmpeg failed to load: ${err?.message || String(err)}`);
      }

      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }

  return loadPromise;
}

/**
 * ffmpeg.wasm writeFile can transfer/detach the backing ArrayBuffer.
 * Always clone before passing video bytes into ffmpeg.
 */
export function cloneArrayBuffer(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('Invalid or empty video buffer');
  }
  return arrayBuffer.slice(0);
}

function bytesForFfmpeg(arrayBuffer) {
  return new Uint8Array(cloneArrayBuffer(arrayBuffer));
}

async function safeDeleteFile(ffmpeg, name) {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    /* ignore */
  }
}

/**
 * Write video once to the ffmpeg virtual FS (reuse for multiple frame extractions).
 */
export async function writeVideoToFfmpeg(ffmpeg, arrayBuffer, inputName) {
  await ffmpeg.writeFile(inputName, bytesForFfmpeg(arrayBuffer));
}

export async function removeVideoFromFfmpeg(ffmpeg, inputName) {
  await safeDeleteFile(ffmpeg, inputName);
}

/**
 * Probe duration via ffmpeg stderr log parsing (fallback when metadata unavailable).
 */
export async function probeDuration(arrayBuffer) {
  const ffmpeg = await getFFmpeg();
  const inputName = 'probe_input.mp4';
  await writeVideoToFfmpeg(ffmpeg, arrayBuffer, inputName);

  let duration = 0;
  const handler = ({ message }) => {
    const match = message.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseFloat(match[3]);
      duration = h * 3600 + m * 60 + s;
    }
  };

  ffmpeg.on('log', handler);
  try {
    await ffmpeg.exec(['-i', inputName, '-f', 'null', '-']);
  } catch {
    // non-zero exit is expected when no output file is written
  }
  ffmpeg.off('log', handler);
  await removeVideoFromFfmpeg(ffmpeg, inputName);

  return duration > 0 ? duration : 0;
}

export async function extractAudioWav(ffmpeg, arrayBuffer, inputName = 'video.mp4') {
  await writeVideoToFfmpeg(ffmpeg, arrayBuffer, inputName);
  const wavName = 'audio.wav';
  await ffmpeg.exec([
    '-i',
    inputName,
    '-vn',
    '-acodec',
    'pcm_s16le',
    '-ar',
    '16000',
    '-ac',
    '1',
    wavName,
  ]);
  const data = await ffmpeg.readFile(wavName);
  await removeVideoFromFfmpeg(ffmpeg, inputName);
  await safeDeleteFile(ffmpeg, wavName);
  return data;
}

/**
 * Batch-extract frames with image2 sequence pattern (ffmpeg fallback in worker).
 */
export async function extractFramesWithFfmpegBatch(
  ffmpeg,
  arrayBuffer,
  durationSec,
  clipId
) {
  const inputName = `batch_in_${clipId}.mp4`;
  const pattern = `frame_${clipId}_%03d.jpg`;
  const maxFrames = Math.min(
    MAX_FFMPEG_BATCH_FRAMES,
    Math.max(1, Math.ceil(durationSec / FRAME_SAMPLE_INTERVAL_SEC))
  );

  await writeVideoToFfmpeg(ffmpeg, arrayBuffer, inputName);

  try {
    await ffmpeg.exec([
      '-i',
      inputName,
      '-an',
      '-vf',
      `fps=1/${FRAME_SAMPLE_INTERVAL_SEC},scale=512:-2`,
      '-vframes',
      String(maxFrames),
      '-q:v',
      '8',
      '-pix_fmt',
      'yuvj420p',
      pattern,
    ]);
  } catch (err) {
    console.warn('[ffmpeg] batch frame extract failed:', err);
    return [];
  } finally {
    await removeVideoFromFfmpeg(ffmpeg, inputName);
  }

  const frames = [];
  for (let i = 1; i <= maxFrames; i++) {
    const filename = `frame_${clipId}_${String(i).padStart(3, '0')}.jpg`;
    try {
      const data = await ffmpeg.readFile(filename);
      frames.push({
        timestamp: (i - 1) * FRAME_SAMPLE_INTERVAL_SEC,
        data: data instanceof Uint8Array ? data : new Uint8Array(data),
      });
      await safeDeleteFile(ffmpeg, filename);
    } catch {
      break;
    }
  }

  return frames;
}

/**
 * Single-shot frame extract (writes video once).
 */
export async function extractFrameAt(
  ffmpeg,
  arrayBuffer,
  timestampSec,
  inputName = 'frame_video.mp4'
) {
  const batch = await extractFramesWithFfmpegBatch(
    ffmpeg,
    arrayBuffer,
    timestampSec + FRAME_SAMPLE_INTERVAL_SEC,
    `thumb_${Math.round(timestampSec)}`
  );
  const match =
    batch.find((f) => Math.abs(f.timestamp - timestampSec) < 0.5) || batch[0];
  if (match) return match.data;
  throw new Error('Thumbnail frame extract failed');
}

export function buildFrameTimestamps(
  durationSec,
  intervalSec = FRAME_SAMPLE_INTERVAL_SEC,
  maxFrames = MAX_FRAMES_PER_CLIP
) {
  const timestamps = [];
  for (let t = 0; t < durationSec && timestamps.length < maxFrames; t += intervalSec) {
    timestamps.push(t);
  }
  if (timestamps.length === 0) timestamps.push(0);
  return timestamps;
}

export function uint8ToBase64(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Extract thumbnail JPEG as data URL at timestamp (main thread).
 */
export async function extractThumbnailDataUrl(arrayBuffer, timestampSec) {
  const ffmpeg = await getFFmpeg();
  const data = await extractFrameAt(ffmpeg, arrayBuffer, timestampSec, 'thumb_video.mp4');
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const base64 = uint8ToBase64(bytes);
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * Format seconds as M:SS or H:MM:SS
 */
export function formatTimestamp(sec) {
  if (sec == null || Number.isNaN(sec)) return '0:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
