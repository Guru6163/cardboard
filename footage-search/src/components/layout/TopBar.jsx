import CardboardLogo from '../CardboardLogo.jsx';
import { IconSettings } from '../icons.jsx';

export default function TopBar({
  indexedCount,
  totalCount,
  onOpenSettings,
  onClear,
  canClear,
}) {
  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-editor-border-subtle bg-editor-surface/80 backdrop-blur-md z-20">
      <div className="flex items-center gap-3 min-w-0">
        <a
          href="https://www.usecardboard.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 min-w-0 rounded-lg py-1 pr-2 -ml-1 transition-opacity hover:opacity-90"
        >
          <span className="size-8 shrink-0 text-editor-text flex items-center justify-center">
            <CardboardLogo className="h-full w-auto" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-normal tracking-tight text-editor-text leading-none">
              Cardboard
            </h1>
            <p className="text-[10px] text-editor-muted mt-0.5 truncate">
              Footage Search
            </p>
          </div>
        </a>
        <span className="hidden sm:inline h-4 w-px bg-editor-border" />
        <span className="hidden sm:inline text-xs text-editor-dim font-medium">
          My Library
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-editor-elevated/60 border border-editor-border-subtle">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
          <span className="text-xs text-editor-dim">
            <span className="text-editor-text font-medium tabular-nums">{indexedCount}</span>
            <span className="text-editor-muted"> / </span>
            <span className="tabular-nums">{totalCount || '—'}</span>
            <span className="ml-1 text-editor-muted">indexed</span>
          </span>
        </div>

        {canClear && (
          <button type="button" onClick={onClear} className="btn-ghost text-xs text-red-400/80 hover:text-red-300">
            Reset library
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          className="btn-ghost w-9 h-9 p-0 rounded-lg border border-transparent hover:border-editor-border"
          aria-label="Settings"
        >
          <IconSettings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
