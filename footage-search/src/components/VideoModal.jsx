import { useEffect, useRef, useState, useCallback } from 'react';
import { IconClose, IconPlay } from './icons.jsx';

function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimecode(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '00:00:00';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * @param {{ clip: { file?: File, blobUrl?: string, startTime: number, endTime: number, clipName: string, matchedText?: string } | null, onClose: () => void }} props
 */
export default function VideoModal({ clip, onClose }) {
  const videoRef = useRef(null);
  const [relativePos, setRelativePos] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const file = clip?.file;
  const blobUrl = clip?.blobUrl;
  const startTime = clip?.startTime ?? 0;
  const endTime = clip?.endTime ?? startTime;
  const clipName = clip?.clipName ?? 'clip';
  const segmentDuration = Math.max(0.1, endTime - startTime);

  const clampToSegment = useCallback(
    (video) => {
      if (!video) return;
      if (video.currentTime < startTime) video.currentTime = startTime;
      if (video.currentTime > endTime) video.currentTime = endTime;
      setRelativePos(Math.max(0, video.currentTime - startTime));
    },
    [startTime, endTime]
  );

  useEffect(() => {
    if (!videoRef.current || !clip) return;
    if (!file && !blobUrl) return;

    const video = videoRef.current;
    let objectUrl = blobUrl;
    let shouldRevoke = false;

    if (file) {
      objectUrl = URL.createObjectURL(file);
      shouldRevoke = true;
    }

    video.src = objectUrl;
    setRelativePos(0);
    setIsPlaying(false);

    const handleSeeked = () => {
      clampToSegment(video);
      video.play().catch(() => {});
      setIsPlaying(true);
    };

    const handleLoadedMetadata = () => {
      video.currentTime = startTime;
      setRelativePos(0);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked, { once: true });

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      if (shouldRevoke && objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [clip, file, blobUrl, startTime, clampToSegment]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= endTime - 0.05) {
        video.pause();
        video.currentTime = endTime;
        setRelativePos(segmentDuration);
        setIsPlaying(false);
        return;
      }
      if (video.currentTime < startTime) {
        video.currentTime = startTime;
      }
      setRelativePos(Math.max(0, video.currentTime - startTime));
    };

    const handleSeeking = () => clampToSegment(video);

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [clip, startTime, endTime, segmentDuration, clampToSegment]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (clip) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clip, onClose]);

  if (!clip) return null;

  const hasSource = Boolean(file || blobUrl);
  const video = videoRef.current;

  const togglePlay = () => {
    if (!video) return;
    if (isPlaying) {
      video.pause();
      return;
    }
    if (video.currentTime >= endTime - 0.05) {
      video.currentTime = startTime;
      setRelativePos(0);
    }
    video.play().catch(() => {});
  };

  const onScrub = (e) => {
    if (!video) return;
    const t = parseFloat(e.target.value);
    video.currentTime = startTime + t;
    setRelativePos(t);
  };

  const progressPct = segmentDuration > 0 ? (relativePos / segmentDuration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-editor-bg/95 backdrop-blur-xl"
      onClick={onClose}
    >
      <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-editor-border-subtle">
        <div className="min-w-0">
          <p className="text-sm font-medium text-editor-text truncate">{clipName}</p>
          <p className="timecode text-editor-muted">
            IN {formatTimecode(startTime)} · OUT {formatTimecode(endTime)}
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost w-9 h-9 p-0">
          <IconClose />
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center p-4 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {hasSource ? (
          <video
            ref={videoRef}
            playsInline
            className="max-w-full max-h-full rounded-lg shadow-panel bg-black"
            onClick={togglePlay}
          />
        ) : (
          <div className="w-full max-w-3xl aspect-video rounded-xl bg-editor-panel border border-editor-border flex items-center justify-center text-editor-muted text-sm">
            Video unavailable — re-upload clip to play
          </div>
        )}
      </div>

      {hasSource && (
        <div
          className="shrink-0 border-t border-editor-border-subtle bg-editor-panel/90 px-6 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="relative h-1.5 rounded-full bg-editor-bg overflow-hidden group">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent/80 to-accent rounded-full transition-[width] duration-75"
                style={{ width: `${progressPct}%` }}
              />
              <input
                type="range"
                min={0}
                max={segmentDuration}
                step={0.05}
                value={Math.min(relativePos, segmentDuration)}
                onChange={onScrub}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={togglePlay}
                className="w-11 h-11 rounded-full bg-editor-text text-editor-bg flex items-center justify-center hover:bg-white transition-colors shrink-0"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <IconPlay className="w-5 h-5 ml-0.5" />
                )}
              </button>

              <div className="flex-1 font-mono text-sm tabular-nums text-editor-dim">
                <span className="text-editor-text">{formatTimecode(relativePos)}</span>
                <span className="text-editor-muted mx-2">/</span>
                <span>{formatTimecode(segmentDuration)}</span>
              </div>
            </div>

            {clip.matchedText && (
              <p className="text-sm text-editor-dim line-clamp-2 border-l-2 border-accent/40 pl-3">
                {clip.matchedText}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
