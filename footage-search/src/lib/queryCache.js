const TTL_MS = 30 * 60 * 1000;

export class QueryCache {
  constructor() {
    this._map = new Map();
  }

  hashQuery(query) {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  get(query) {
    const key = this.hashQuery(query);
    const entry = this._map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > TTL_MS) {
      this._map.delete(key);
      return null;
    }
    return entry;
  }

  set(query, expandedQueries, embeddings) {
    const key = this.hashQuery(query);
    this._map.set(key, {
      expandedQueries,
      embeddings,
      timestamp: Date.now(),
    });
  }

  serialize() {
    const entries = [];
    const now = Date.now();
    for (const [key, entry] of this._map) {
      if (now - entry.timestamp > TTL_MS) continue;
      entries.push([
        key,
        {
          expandedQueries: entry.expandedQueries,
          embeddings: {
            visual: Array.from(entry.embeddings.visual),
            transcript: Array.from(entry.embeddings.transcript),
          },
          timestamp: entry.timestamp,
        },
      ]);
    }
    return entries;
  }

  restore(serialized) {
    if (!serialized?.length) return;
    const now = Date.now();
    for (const [key, entry] of serialized) {
      if (now - entry.timestamp > TTL_MS) continue;
      this._map.set(key, {
        expandedQueries: entry.expandedQueries,
        embeddings: {
          visual: new Float32Array(entry.embeddings.visual),
          transcript: new Float32Array(entry.embeddings.transcript),
        },
        timestamp: entry.timestamp,
      });
    }
  }

  clear() {
    this._map.clear();
  }
}

export const queryCache = new QueryCache();
