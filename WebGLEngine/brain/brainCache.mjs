// brain/brainCache.mjs -- pure in-memory LRU cache of brain "chunks of thought" (flow-fields per (map,goal), policy
// actions per state, tactics per engagement). "Play this chunk if you can": instant cached result, else compute via
// fallback and cache it; prefetch warms chunks ahead of need. Persistence is INJECTED via an optional store adapter
// ({exists,read,write}) so this core imports NO node builtins and stays `bun build --compile`-clean in the
// cell-manager (esPilot) tree. The server can pass a disk store (brainCacheStore.mjs); the pilot uses memory only.
function key(kind, ...ids) { return kind + ":" + ids.join("/"); }

class BrainCache {
    constructor(opts = {}) { this.max = opts.max || 256; this.mem = new Map(); this.store = opts.store || null; this.hits = 0; this.misses = 0; }
    has(k) { if (this.mem.has(k)) return true; if (this.store) { try { return !!this.store.exists(k); } catch (e) {} } return false; }
    get(k) {
        if (this.mem.has(k)) { const v = this.mem.get(k); this.mem.delete(k); this.mem.set(k, v); return v; }     // LRU touch
        if (this.store) { try { const d = this.store.read(k); if (d != null) { this._mem(k, d); return d; } } catch (e) {} }
        return null;
    }
    put(k, data) { this._mem(k, data); if (this.store) { try { this.store.write(k, data); } catch (e) {} } return data; }
    _mem(k, d) { this.mem.set(k, d); if (this.mem.size > this.max) { const first = this.mem.keys().next().value; this.mem.delete(first); } }
    playIfYouCan(k, fallback) { const c = this.get(k); if (c != null) { this.hits++; return { data: c, cached: true }; } this.misses++; if (!fallback) return { data: null, cached: false, miss: true }; const d = fallback(); this.put(k, d); return { data: d, cached: false }; }
    prefetch(keys, producer) { let n = 0; for (const k of keys) { if (!this.has(k)) { this.put(k, producer(k)); n++; } } return n; }
    stats() { return { inMemory: this.mem.size, max: this.max, hits: this.hits, misses: this.misses }; }
}
export { BrainCache, key };
