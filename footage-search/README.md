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

## Deploy on Vercel

Pick **one** setup (not both):

**Option A — Root Directory `footage-search` (recommended)**  
1. Project → Settings → General → **Root Directory**: `footage-search`  
2. Install / Build: default (`npm install`, `npm run build`)  
3. Clear any custom **Install Command** override (remove `cd footage-search …`)  
4. Uses `footage-search/vercel.json` for headers and SPA routing  

**Option B — Repo root**  
1. Leave **Root Directory** empty  
2. Uses root `vercel.json` (`npm install --prefix footage-search`)  
3. Do not set Root Directory to `footage-search` with this option  

## Notes

- First index of a clip calls OpenAI APIs and may take several minutes depending on length.
- Reload restores the index from IndexedDB in under ~200ms.
- Clear index removes stored clips and embeddings.
