import OpenAI from 'openai';
import { BM25Index } from '../lib/bm25.js';
import {
  saveIndex,
  loadIndex,
  saveClipBuffer,
} from '../lib/store.js';
import {
  getFFmpeg,
  cloneArrayBuffer,
  probeDuration,
  extractAudioWav,
  extractFramesWithFfmpegBatch,
  uint8ToBase64,
} from '../lib/ffmpegUtils.js';
import { thumbnailDataUrlFromFrames } from '../lib/thumbnail.js';
import {
  TRANSCRIPT_CHUNK_SEC,
  FRAME_SAMPLE_INTERVAL_SEC,
  VISION_BATCH_SIZE,
  EMBEDDING_MODEL,
  WHISPER_MODEL,
  VISION_MODEL,
  EXPANSION_MODEL,
} from '../constants.js';

function postProgress(clipId, stage) {
  self.postMessage({ type: 'progress', clipId, stage });
}

function postError(clipId, stage, err) {
  self.postMessage({
    type: 'error',
    clipId,
    stage,
    message: err?.message || String(err),
    stack: err?.stack,
  });
}

function chunkTranscript(clipId, segments, durationSec) {
  const chunks = [];
  const numWindows = Math.ceil(durationSec / TRANSCRIPT_CHUNK_SEC) || 1;

  for (let w = 0; w < numWindows; w++) {
    const startTime = w * TRANSCRIPT_CHUNK_SEC;
    const endTime = Math.min((w + 1) * TRANSCRIPT_CHUNK_SEC, durationSec);
    const texts = [];

    for (const seg of segments || []) {
      const segStart = seg.start ?? 0;
      const segEnd = seg.end ?? segStart;
      if (segEnd > startTime && segStart < endTime) {
        texts.push(seg.text?.trim() || '');
      }
    }

    const text = texts.join(' ').trim();
    if (text) {
      chunks.push({
        clipId,
        startTime,
        endTime,
        text,
        type: 'transcript',
      });
    }
  }

  return chunks;
}

async function transcribeAudio(openai, audioData) {
  const bytes = audioData instanceof Uint8Array ? audioData : new Uint8Array(audioData);
  const blob = new Blob([bytes], { type: 'audio/wav' });
  const file = new File([blob], 'audio.wav', { type: 'audio/wav' });

  const result = await openai.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  return result;
}

async function describeFrameBatch(openai, frames) {
  if (frames.length === 0) return [];

  const content = [
    {
      type: 'text',
      text:
        'Describe each image in one concise sentence for video search indexing. ' +
        'Return exactly one line per image, numbered like "1. ..." matching the image order.',
    },
    ...frames.map((f) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${f.base64}` },
    })),
  ];

  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content }],
  });

  const raw = response.choices[0]?.message?.content || '';
  const lines = raw.split('\n').filter((l) => l.trim());
  const descriptions = [];

  for (let i = 0; i < frames.length; i++) {
    const line =
      lines.find((l) => l.match(new RegExp(`^\\s*${i + 1}[.)\\s]`))) ||
      lines[i] ||
      '';
    const text = line.replace(/^\s*\d+[.)]\s*/, '').trim() || 'Frame content';
    descriptions.push(text);
  }

  return descriptions;
}

async function extractMoodTags(openai, clipId, duration, transcriptText) {
  const text = (transcriptText || '').trim();
  if (!text) return [];

  try {
    const response = await openai.chat.completions.create({
      model: EXPANSION_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: 'Return only valid JSON, no markdown.' },
        {
          role: 'user',
          content: `From this transcript, list 4-8 single-word audio mood/tone tags (e.g. calm, tense, upbeat).
Transcript: ${text.slice(0, 2500)}
Return JSON: { "tags": string[] }`,
        },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim() || '';
    const parsed = JSON.parse(raw);
    const tags = (parsed.tags || []).filter(Boolean);
    if (tags.length === 0) return [];
    return [
      {
        clipId,
        startTime: 0,
        endTime: duration,
        text: tags.join(' '),
        type: 'mood',
      },
    ];
  } catch {
    return [];
  }
}

async function embedTexts(openai, texts) {
  if (texts.length === 0) return [];
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => new Float32Array(d.embedding));
}

function normalizeRawFrames(canvasFrames) {
  if (!canvasFrames?.length) return [];
  return canvasFrames.map((f) => {
    const data =
      f.data instanceof Uint8Array
        ? f.data
        : new Uint8Array(f.data || f.jpegBuffer || []);
    return { timestamp: f.timestamp ?? 0, data };
  });
}

async function resolveRawFrames(ffmpeg, arrayBuffer, duration, clipId, canvasFrames) {
  const fromCanvas = normalizeRawFrames(canvasFrames);
  if (fromCanvas.length > 0) {
    console.log(`[indexer] using ${fromCanvas.length} canvas frames from main thread`);
    return fromCanvas;
  }

  try {
    const fromFfmpeg = await extractFramesWithFfmpegBatch(
      ffmpeg,
      arrayBuffer,
      duration,
      clipId
    );
    if (fromFfmpeg.length > 0) {
      console.log(`[indexer] using ${fromFfmpeg.length} ffmpeg batch frames`);
      return fromFfmpeg;
    }
  } catch (err) {
    console.warn('[indexer] ffmpeg frame extraction failed:', err);
  }

  return [];
}

async function buildVisualChunks(openai, clipId, rawFrames) {
  const visualChunks = [];

  if (!rawFrames.length) {
    console.warn(
      '[indexer] frame extraction failed, continuing without visual descriptions'
    );
    return visualChunks;
  }

  for (let i = 0; i < rawFrames.length; i += VISION_BATCH_SIZE) {
    const batch = rawFrames.slice(i, i + VISION_BATCH_SIZE);
    const frames = batch.map((f) => ({
      timestamp: f.timestamp,
      base64: uint8ToBase64(f.data),
    }));

    try {
      const descriptions = await describeFrameBatch(openai, frames);
      for (let j = 0; j < frames.length; j++) {
        visualChunks.push({
          clipId,
          startTime: frames[j].timestamp,
          endTime: frames[j].timestamp + FRAME_SAMPLE_INTERVAL_SEC,
          timestamp: frames[j].timestamp,
          text: descriptions[j],
          type: 'visual',
        });
      }
    } catch (err) {
      console.warn('[indexer] vision API batch failed, skipping batch:', err);
    }
  }

  return visualChunks;
}

async function indexClip(payload) {
  const {
    clipId,
    fileName,
    buffer,
    fileBuffer,
    apiKey,
    duration: durationFromMain,
    canvasFrames,
    thumbnailDataUrl: thumbnailFromMain,
  } = payload;

  const incoming = fileBuffer || buffer;
  if (!incoming) {
    throw new Error('No video buffer received');
  }
  const arrayBuffer = cloneArrayBuffer(incoming);
  if (!apiKey?.trim()) {
    throw new Error('OpenAI API key missing — enter your key in the UI');
  }

  let currentStage = 'transcribing';
  const openai = new OpenAI({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });

  try {
    postProgress(clipId, currentStage);

    const ffmpeg = await getFFmpeg();

    let duration = durationFromMain > 0 ? durationFromMain : 0;
    if (!duration) {
      duration = await probeDuration(arrayBuffer);
    }
    if (!duration || duration <= 0) {
      duration = 30;
      console.warn('[indexer] duration unknown, using fallback 30s');
    }

    const audioData = await extractAudioWav(ffmpeg, arrayBuffer, `in_${clipId}.mp4`);
    const transcription = await transcribeAudio(openai, audioData);

    const segments = transcription.segments || [];
    if (segments.length === 0 && transcription.text) {
      segments.push({ start: 0, end: duration, text: transcription.text });
    }

    const transcriptChunks = chunkTranscript(clipId, segments, duration);
    const moodChunks = await extractMoodTags(
      openai,
      clipId,
      duration,
      transcription.text || segments.map((s) => s.text).join(' ')
    );

    currentStage = 'describing';
    postProgress(clipId, currentStage);

    const rawFrames = await resolveRawFrames(
      ffmpeg,
      arrayBuffer,
      duration,
      clipId,
      canvasFrames
    );
    const visualChunks = await buildVisualChunks(openai, clipId, rawFrames);

    const newChunks = [...transcriptChunks, ...moodChunks, ...visualChunks];

    currentStage = 'embedding';
    postProgress(clipId, currentStage);

    const existing = (await loadIndex()) || {
      chunks: [],
      embeddings: [],
      bm25Index: null,
      clipMeta: [],
    };

    const startIdx = existing.chunks.length;
    const newEmbeddings = await embedTexts(
      openai,
      newChunks.map((c) => c.text)
    );

    const allChunks = [...existing.chunks, ...newChunks];
    const allEmbeddings = [...existing.embeddings, ...newEmbeddings];

    const bm25 = new BM25Index();
    bm25.build(allChunks);

    const thumbnailDataUrl =
      thumbnailFromMain ||
      thumbnailDataUrlFromFrames(normalizeRawFrames(canvasFrames)) ||
      null;

    const clipMeta = [
      ...existing.clipMeta.filter((m) => m.clipId !== clipId),
      { clipId, fileName, duration, thumbnailDataUrl },
    ];

    await saveClipBuffer(clipId, arrayBuffer, {
      fileName,
      duration,
      thumbnailDataUrl,
    });
    await saveIndex({
      chunks: allChunks,
      embeddings: allEmbeddings,
      bm25Index: bm25,
      clipMeta,
    });

    currentStage = 'done';
    postProgress(clipId, currentStage);

    self.postMessage({
      type: 'indexed',
      clipId,
      clipMeta,
      chunkCount: allChunks.length,
      newChunkStartIndex: startIdx,
    });
  } catch (err) {
    console.error('[indexer] failed at stage', currentStage, err);
    postError(clipId, currentStage, err);
    throw err;
  }
}

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'index-clip' || type === 'index') {
    try {
      await indexClip(event.data);
    } catch {
      // error already posted from indexClip
    }
  }
};
