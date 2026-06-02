import { get, set, del, keys } from 'idb-keyval';
import { BM25Index } from './bm25.js';
import { INDEX_KEY, CLIPS_META_KEY, QUERY_CACHE_KEY } from '../constants.js';
import { queryCache } from './queryCache.js';

const CLIP_BUFFER_PREFIX = 'clip-buffer:';

export function clipBufferKey(clipId) {
  return `${CLIP_BUFFER_PREFIX}${clipId}`;
}

function serializeEmbeddings(embeddings) {
  return embeddings.map((emb) => {
    if (emb instanceof Float32Array) {
      return { buffer: emb.buffer.slice(emb.byteOffset, emb.byteOffset + emb.byteLength), length: emb.length };
    }
    if (emb && emb.buffer) {
      return { buffer: emb.buffer, length: emb.length };
    }
    return null;
  });
}

function deserializeEmbeddings(serialized) {
  if (!serialized) return [];
  return serialized.map((item) => {
    if (!item || !item.buffer) return new Float32Array(0);
    return new Float32Array(item.buffer, 0, item.length);
  });
}

export async function saveIndex(indexData) {
  const payload = {
    chunks: indexData.chunks,
    embeddings: serializeEmbeddings(indexData.embeddings),
    bm25Index: indexData.bm25Index instanceof BM25Index
      ? indexData.bm25Index.serialize()
      : indexData.bm25Index,
    clipMeta: indexData.clipMeta,
  };
  await set(INDEX_KEY, payload);
}

export async function loadIndex() {
  const raw = await get(INDEX_KEY);
  if (!raw) return null;

  const bm25Index = BM25Index.deserialize(raw.bm25Index);
  const embeddings = deserializeEmbeddings(raw.embeddings);

  return {
    chunks: raw.chunks || [],
    embeddings,
    bm25Index,
    clipMeta: raw.clipMeta || [],
  };
}

export async function saveClipBuffer(clipId, arrayBuffer, meta) {
  await set(clipBufferKey(clipId), arrayBuffer);
  const allMeta = (await get(CLIPS_META_KEY)) || [];
  const filtered = allMeta.filter((m) => m.clipId !== clipId);
  filtered.push({ clipId, ...meta });
  await set(CLIPS_META_KEY, filtered);
}

export async function loadClipBuffer(clipId) {
  return get(clipBufferKey(clipId));
}

export async function loadClipsMeta() {
  return (await get(CLIPS_META_KEY)) || [];
}

export async function saveQueryCache() {
  await set(QUERY_CACHE_KEY, queryCache.serialize());
}

export async function loadQueryCache() {
  const serialized = await get(QUERY_CACHE_KEY);
  if (serialized) queryCache.restore(serialized);
}

export async function clearAllData() {
  queryCache.clear();
  const allKeys = await keys();
  const toDelete = allKeys.filter(
    (k) =>
      k === INDEX_KEY ||
      k === CLIPS_META_KEY ||
      k === QUERY_CACHE_KEY ||
      (typeof k === 'string' && k.startsWith(CLIP_BUFFER_PREFIX))
  );
  await Promise.all(toDelete.map((k) => del(k)));
}
