import { memo, useEffect, useRef, useState } from 'react';
import { formatTimestamp } from '../lib/ffmpegUtils.js';
import { requestThumbnail, getCachedThumbnail } from '../lib/thumbnailQueue.js';
import { IconPlay } from './icons.jsx';

function highlightText(text, query) {
  if (!query?.trim()) return text;
  const terms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return text;

  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  );
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    terms.some((t) => part.toLowerCase() === t) ? (
      <mark key={i} className="bg-accent/30 text-accent-bright rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

const SIGNAL_BADGES = [
  { key: 'keyword', label: 'keyword', className: 'bg-amber-500/15 text-amber-300 border-amber-500/20' },
  { key: 'visual', label: 'visual', className: 'bg-purple-500/15 text-purple-300 border-purple-500/20' },
  { key: 'mood', label: 'mood', className: 'bg-sky-500/15 text-sky-300 border-sky-500/20' },
];

function ThumbnailPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-editor-bg">
      <IconPlay className="w-8 h-8 text-editor-muted/40" />
    </div>
  );
}

function ResultCardInner({
  result,
  fileName,
  query,
  maxScore,
  thumbnailDataUrl,
  clipFile,
  clipBuffer,
  onPlay,
  layout = 'grid',
}) {
  const rootRef = useRef(null);
  const time = result.startTime ?? 0;
  const cached = getCachedThumbnail(result.clipId, time);
  const [thumb, setThumb] = useState(thumbnailDataUrl || cached || null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setThumb(thumbnailDataUrl || getCachedThumbnail(result.clipId, time) || null);
  }, [thumbnailDataUrl, result.clipId, time]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: '80px', threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || thumb) return;

    const source = clipFile || clipBuffer;
    if (!source) return;

    let cancelled = false;
    requestThumbnail(result.clipId, time, source).then((url) => {
      if (!cancelled && url) setThumb(url);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, thumb, clipFile, clipBuffer, result.clipId, time]);

  const signals = result.signals || {};
  const scores = result.signalScores || {};
  const showKeyword = (scores.transcript ?? 0) > 0 || signals.keyword;
  const showVisual = (scores.visual ?? 0) > 0 || signals.visual;
  const showMood = (scores.mood ?? 0) > 0 || signals.mood;

  const activeBadges = [];
  if (showKeyword) activeBadges.push(SIGNAL_BADGES[0]);
  if (showVisual) activeBadges.push(SIGNAL_BADGES[1]);
  if (showMood) activeBadges.push(SIGNAL_BADGES[2]);

  const signalCount = [
    showKeyword,
    showVisual,
    showMood,
    (scores.transcriptSemantic ?? 0) > 0 || signals.transcriptSemantic,
    signals.temporal,
  ].filter(Boolean).length;
  const showBoth = signalCount >= 2;

  const barWidth = maxScore > 0 ? Math.round((result.score / maxScore) * 100) : 0;

  const handleClick = () => {
    onPlay({
      clipId: result.clipId,
      startTime: result.startTime,
      endTime: result.endTime,
      matchedText: result.matchedText,
    });
  };

  if (layout === 'filmstrip') {
    return (
      <button
        ref={rootRef}
        type="button"
        onClick={handleClick}
        className="result-card-glow shrink-0 w-[200px] text-left rounded-xl border border-editor-border bg-editor-panel overflow-hidden group"
      >
        <div className="relative aspect-video bg-editor-bg">
          {thumb ? (
            <img src={thumb} alt="" className="w-full h-full object-cover" onError={() => setThumb(null)} />
          ) : (
            <ThumbnailPlaceholder />
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <span className="w-10 h-10 rounded-full bg-white/90 text-editor-bg flex items-center justify-center">
              <IconPlay className="w-5 h-5 ml-0.5" />
            </span>
          </div>
          <span className="absolute bottom-1.5 right-1.5 timecode bg-black/70 px-1.5 py-0.5 rounded text-white/90">
            {formatTimestamp(result.startTime)}
          </span>
        </div>
        <div className="p-2">
          <p className="text-[11px] font-medium text-editor-text truncate">{fileName}</p>
          <div className="h-0.5 mt-1.5 rounded-full bg-editor-bg overflow-hidden">
            <div className="h-full bg-accent/70 rounded-full" style={{ width: `${barWidth}%` }} />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className="result-card-glow w-full text-left rounded-xl border border-editor-border bg-editor-panel overflow-hidden cursor-pointer"
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative sm:w-48 aspect-video sm:aspect-auto sm:h-28 shrink-0 bg-editor-bg">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setThumb(null)}
            />
          ) : (
            <ThumbnailPlaceholder />
          )}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/40 transition-opacity">
            <span className="w-11 h-11 rounded-full bg-white/95 text-editor-bg flex items-center justify-center shadow-lg">
              <IconPlay className="w-5 h-5 ml-0.5" />
            </span>
          </div>
        </div>

        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-editor-text truncate">{fileName}</p>
            <span className="timecode shrink-0 text-editor-dim">
              {formatTimestamp(result.startTime)} – {formatTimestamp(result.endTime)}
            </span>
          </div>
          <p className="text-sm text-editor-dim mt-2 line-clamp-2 leading-relaxed">
            {highlightText(result.matchedText, query)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {showBoth && (
              <span className="text-[10px] rounded-full px-2 py-0.5 border bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                multi-signal
              </span>
            )}
            {activeBadges.map((b) => (
              <span
                key={b.key}
                className={`text-[10px] rounded-full px-2 py-0.5 border ${b.className}`}
              >
                {b.label}
              </span>
            ))}
            <div className="flex-1 min-w-[48px] h-1 rounded-full bg-editor-bg overflow-hidden ml-auto max-w-[120px]">
              <div
                className="h-full bg-gradient-to-r from-accent/60 to-accent rounded-full transition-all"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ResultCard = memo(ResultCardInner);
export default ResultCard;
