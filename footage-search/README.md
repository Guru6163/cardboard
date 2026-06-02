# Footage Search

Browser-only hybrid video search demo: Whisper transcription, GPT-4o frame descriptions, BM25 + semantic search with RRF fusion.

## Setup

```bash
cd footage-search
npm install
npm run dev
```

Open the URL shown in the terminal (requires COOP/COEP headers — Vite dev server sets these automatically).

Enter your OpenAI API key in the UI. Drop `.mp4`, `.mov`, or `.webm` files to index, then search.

## Stack

- React 18 + Vite
- Tailwind CSS
- OpenAI SDK (Whisper, GPT-4o vision, text-embedding-3-small)
- ffmpeg.wasm for audio/frame extraction
- idb-keyval for IndexedDB persistence
- Web Worker indexer (no main-thread blocking)

## Notes

- First index of a clip calls OpenAI APIs and may take several minutes depending on length.
- Reload restores the index from IndexedDB in under ~200ms.
- Clear index removes stored clips and embeddings.
