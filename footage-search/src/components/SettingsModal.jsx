import { IconClose } from './icons.jsx';

export default function SettingsModal({ open, apiKey, onSave, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl panel-chrome border shadow-panel overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-editor-border-subtle">
          <div>
            <h2 className="text-base font-semibold text-editor-text">Workspace settings</h2>
            <p className="text-xs text-editor-muted mt-0.5">API keys never leave your browser</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost w-8 h-8 p-0 rounded-lg">
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-editor-dim uppercase tracking-wider mb-2">
              OpenAI API key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onSave(e.target.value)}
              placeholder="sk-…"
              className="w-full rounded-xl border border-editor-border bg-editor-bg px-4 py-3 text-sm text-editor-text focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
              autoComplete="off"
            />
            <p className="text-[11px] text-editor-muted mt-2 leading-relaxed">
              Required for transcription, vision captions, and semantic embeddings. Stored in
              localStorage only.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-editor-border-subtle flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
