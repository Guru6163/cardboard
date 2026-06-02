import { formatTimestamp } from '../lib/ffmpegUtils.js';

export default function ClipCard({ clip, onRetry, thumbnailDataUrl }) {
  const isError = clip.status === 'error';
  const isReady = clip.status === 'ready' || clip.stage === 'done';
  const isProcessing = !isReady && !isError;

  return (
    <div
      className={`group rounded-lg border overflow-hidden transition-colors ${
        isError
          ? 'border-red-500/25 bg-red-950/15'
          : isProcessing
            ? 'border-accent/20 bg-editor-elevated/40'
            : 'border-editor-border-subtle bg-editor-elevated/30 hover:border-editor-border'
      }`}
    >
      <div className="flex gap-2 p-2">
        <div className="w-14 h-10 shrink-0 rounded-md overflow-hidden bg-editor-bg border border-editor-border-subtle">
          {thumbnailDataUrl ? (
            <img src={thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-editor-muted">
              <svg className="w-4 h-4 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-xs font-medium text-editor-text truncate">{clip.fileName}</p>
          <p className="timecode mt-0.5">{formatTimestamp(clip.duration || 0)}</p>
          <div className="mt-1">
            {isReady ? (
              <span className="text-[10px] text-emerald-400/90 font-medium">Ready</span>
            ) : isError ? (
              <span className="text-[10px] text-red-400 font-medium">Failed</span>
            ) : (
              <span className="text-[10px] text-accent animate-pulse-soft font-medium">
                Indexing…
              </span>
            )}
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="h-0.5 bg-editor-bg">
          <div
            className="h-full bg-gradient-to-r from-accent/50 via-accent to-accent/50 animate-shimmer"
            style={{ backgroundSize: '200% 100%', width: '60%' }}
          />
        </div>
      )}

      {isError && onRetry && (
        <div className="px-2 pb-2">
          <p className="text-[10px] text-red-400/80 line-clamp-2 mb-1.5">{clip.error || 'Failed'}</p>
          <button
            type="button"
            onClick={() => onRetry(clip.clipId)}
            className="text-[10px] w-full rounded-md py-1 bg-editor-elevated hover:bg-white/5 text-editor-text border border-editor-border"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
