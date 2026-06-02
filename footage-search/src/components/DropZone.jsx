import { useCallback, useState } from 'react';
import { IconUpload } from './icons.jsx';

const ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';

export default function DropZone({ onFiles, disabled, compact = false }) {
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (fileList) => {
      const videos = [...fileList].filter((f) =>
        /\.(mp4|mov|webm)$/i.test(f.name)
      );
      if (videos.length) onFiles(videos);
    },
    [onFiles]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  if (compact) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border border-dashed p-3 text-center transition-all ${
          dragOver
            ? 'border-accent bg-accent/10'
            : 'border-editor-border hover:border-editor-muted/50 bg-editor-elevated/30'
        } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      >
        <label className="cursor-pointer flex flex-col items-center gap-1.5">
          <span className="w-8 h-8 rounded-lg bg-editor-elevated flex items-center justify-center text-editor-dim">
            <IconUpload className="w-4 h-4" />
          </span>
          <span className="text-xs font-medium text-editor-text">Add footage</span>
          <span className="text-[10px] text-editor-muted">.mp4 · .mov · .webm</span>
          <input
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
        dragOver
          ? 'border-accent bg-accent/10 shadow-glow'
          : 'border-editor-border bg-editor-panel/50 hover:border-editor-muted'
      } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
    >
      <div className="w-14 h-14 mx-auto rounded-2xl bg-editor-elevated flex items-center justify-center text-editor-dim mb-4">
        <IconUpload className="w-6 h-6" />
      </div>
      <p className="text-editor-text font-medium">Drop video clips here</p>
      <p className="text-sm text-editor-muted mt-1">or browse from your machine</p>
      <label className="mt-5 inline-block cursor-pointer btn-primary">
        Browse files
        <input
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
