import { IconSearch } from './icons.jsx';

export default function SearchInput({
  value,
  onChange,
  disabled,
  searchMode,
  isDebouncing,
  hybridComplete,
}) {
  const modeStyles = {
    keyword: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    hybrid: 'bg-accent/15 text-accent-bright border-accent/25',
    searching: 'bg-editor-elevated text-editor-muted border-editor-border animate-pulse',
  };

  const modeLabels = {
    keyword: 'Keyword',
    hybrid: 'Hybrid',
    searching: 'Searching',
  };

  const showBadge = searchMode && searchMode !== 'idle';
  const progressState = hybridComplete
    ? 'complete'
    : isDebouncing
      ? 'debouncing'
      : 'idle';

  return (
    <div className="w-full max-w-2xl mx-auto space-y-1">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-editor-text">
          Find anything
        </h2>
        <p className="text-sm text-editor-muted mt-1.5">
          Search clips by what happened — not filenames
        </p>
      </div>

      <div className="relative">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-editor-muted pointer-events-none">
          <IconSearch className="w-5 h-5" />
        </span>

        <input
          type="search"
          autoFocus
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="person laughing on the beach…"
          className="search-command disabled:opacity-40 disabled:cursor-not-allowed"
        />

        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
          {showBadge && (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium border ${modeStyles[searchMode] || modeStyles.keyword}`}
            >
              {modeLabels[searchMode]}
            </span>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-editor-border bg-editor-bg px-1.5 py-0.5 text-[10px] text-editor-muted font-mono">
            ↵
          </kbd>
        </div>
      </div>

      <div
        className={`search-progress h-0.5 rounded-full overflow-hidden bg-transparent max-w-2xl mx-auto ${progressState}`}
        aria-hidden
      />
    </div>
  );
}
