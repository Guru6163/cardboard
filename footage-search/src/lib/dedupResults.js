const DEDUP_TEXT_LEN = 60;
const DEDUP_TIME_SEC = 6;

/**
 * Collapse near-duplicate visual hits (same clip, similar text, within 6s).
 */
export function dedupResults(results) {
  const kept = [];
  const buckets = new Map();

  for (const r of results) {
    const textKey = (r.matchedText || '').slice(0, DEDUP_TEXT_LEN);
    const bucketKey = `${r.clipId}\0${textKey}`;
    let dupIdx = -1;

    const indices = buckets.get(bucketKey);
    if (indices) {
      for (const i of indices) {
        const k = kept[i];
        if (Math.abs((k.startTime ?? 0) - (r.startTime ?? 0)) < DEDUP_TIME_SEC) {
          dupIdx = i;
          break;
        }
      }
    }

    if (dupIdx === -1) {
      const idx = kept.length;
      kept.push(r);
      if (!indices) buckets.set(bucketKey, [idx]);
      else indices.push(idx);
    } else if ((r.score ?? 0) > (kept[dupIdx].score ?? 0)) {
      kept[dupIdx] = r;
    }
  }

  return kept;
}
