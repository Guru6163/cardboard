import DropZone from '../DropZone.jsx';
import ClipCard from '../ClipCard.jsx';

export default function MediaLibraryPanel({
  clips,
  onFiles,
  onRetry,
  disabled,
  persistenceLoading,
  metaByClipId,
}) {
  return (
    <aside className="w-[280px] shrink-0 flex flex-col border-r border-editor-border-subtle panel-chrome">
      <div className="px-4 py-3 border-b border-editor-border-subtle">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-editor-dim">
          Media Library
        </h2>
        <p className="text-[11px] text-editor-muted mt-0.5">Uploads &amp; assets</p>
      </div>

      <div className="p-3 border-b border-editor-border-subtle">
        <DropZone onFiles={onFiles} disabled={disabled} compact />
      </div>

      <div className="flex-1 overflow-y-auto filmstrip-scroll p-2 space-y-1.5">
        {persistenceLoading && (
          <p className="text-xs text-editor-muted animate-pulse px-2 py-4 text-center">
            Restoring library…
          </p>
        )}

        {!clips.length && !persistenceLoading && (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-editor-dim">No clips yet</p>
            <p className="text-[11px] text-editor-muted mt-1 leading-relaxed">
              Drop footage to index and search by what happened
            </p>
          </div>
        )}

        {clips.map((clip) => (
          <ClipCard
            key={clip.clipId}
            clip={clip}
            thumbnailDataUrl={metaByClipId[clip.clipId]?.thumbnailDataUrl}
            onRetry={onRetry}
          />
        ))}
      </div>
    </aside>
  );
}
