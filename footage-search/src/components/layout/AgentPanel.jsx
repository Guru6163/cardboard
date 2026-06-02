const STAGES = [
  { key: 'transcribing', label: 'Transcribe', desc: 'Speech → text' },
  { key: 'describing', label: 'Vision', desc: 'Frame captions' },
  { key: 'embedding', label: 'Embed', desc: 'Semantic index' },
  { key: 'done', label: 'Ready', desc: 'Searchable' },
];

function stageIndex(stage) {
  if (stage === 'queued') return -1;
  const i = STAGES.findIndex((s) => s.key === stage);
  return i >= 0 ? i : -1;
}

export default function AgentPanel({ clips, searchMode, resultSummary, query }) {
  const activeClip = clips.find((c) => c.status !== 'ready' && c.status !== 'error');
  const errorClip = clips.find((c) => c.status === 'error');
  const focus = activeClip || errorClip;

  const current = focus ? stageIndex(focus.stage) : -1;
  const isIndexing = Boolean(activeClip);

  return (
    <aside className="w-[260px] shrink-0 flex flex-col border-l border-editor-border-subtle panel-chrome">
      <div className="px-4 py-3 border-b border-editor-border-subtle">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isIndexing ? 'bg-accent-warm animate-pulse-soft' : 'bg-emerald-400'
            }`}
          />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-editor-dim">
            Indexer
          </h2>
        </div>
        <p className="text-[11px] text-editor-muted mt-1">
          {isIndexing ? 'Processing your footage…' : 'Standing by'}
        </p>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {focus ? (
          <div className="rounded-xl border border-editor-border bg-editor-elevated/50 p-3">
            <p className="text-sm font-medium text-editor-text truncate">{focus.fileName}</p>
            {focus.status === 'error' ? (
              <p className="text-xs text-red-400/90 mt-2 break-words leading-relaxed">
                {focus.error || 'Indexing failed'}
              </p>
            ) : (
              <p className="text-xs text-editor-muted mt-1">Pipeline in progress</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-editor-border/80 p-4 text-center">
            <p className="text-sm text-editor-dim">All clips indexed</p>
            <p className="text-[11px] text-editor-muted mt-1">
              Upload more or search what you have
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {STAGES.map((s, i) => {
            const active = focus && !errorClip && current === i;
            const done = focus && !errorClip && (current > i || focus.stage === 'done');
            const failed = errorClip && errorClip.stage === s.key;
            return (
              <li
                key={s.key}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  failed
                    ? 'border-red-500/30 bg-red-950/20'
                    : active
                      ? 'stage-pill-active border'
                      : done
                        ? 'stage-pill-done border'
                        : 'border-transparent opacity-40'
                }`}
              >
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono shrink-0 ${
                    done ? 'bg-emerald-500/20 text-emerald-400' : active ? 'bg-accent/20 text-accent' : 'bg-editor-elevated text-editor-muted'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <div>
                  <p className="font-medium text-editor-text leading-none">{s.label}</p>
                  <p className="text-[10px] text-editor-muted mt-0.5">{s.desc}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {query && resultSummary && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-accent/80 font-medium">
              Last search
            </p>
            <p className="text-xs text-editor-dim mt-2 leading-relaxed">{resultSummary}</p>
            {searchMode && searchMode !== 'idle' && (
              <span className="inline-block mt-2 text-[10px] rounded-full px-2 py-0.5 bg-editor-elevated text-editor-muted capitalize">
                {searchMode}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-editor-border-subtle text-[10px] text-editor-muted leading-relaxed">
        Hybrid BM25 + semantic · runs entirely in your browser
      </div>
    </aside>
  );
}
