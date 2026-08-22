// FILE: gpu/gpuAssetLoader.js
// VERSION: v2 - PATH FIX + DUAL SCHEMA + GRACEFUL 404
//
// Loads VBA-exported binary triangle meshes from /GPU_Assets/<name>/.
//
// Fixes from v1:
//   * v1 fetched /GPU_Assets/${name}/${name}/... (double name in path).
//     Real layout is /GPU_Assets/${name}/. Fixed.
//   * v1 expected meta.vertexFile/indexFile but actual mesh.json uses
//     vertexBuffer/indexBuffer. Now reads either, with sensible fallbacks.
//   * v1 had no error handling — a missing asset would reject the
//     promise and likely crash the loop. Now caches null on failure
//     so the renderer can fall back to cubes.
//
// Asset format observed in 506pm GPU_Assets/mesh_0/:
//   mesh.json    { name, vertexBuffer, indexBuffer, vertexCount, indexCount }
//   vertices.bin Float32Array of position triples (3 * vertexCount floats)
//   indices.bin  Uint32Array (indexCount uint32s)
//
// The other 73 Mesh_X.asset.json files lack .bin payloads — they fail
// gracefully into the negative cache.

import { GLBParser } from "./GLBParser.js";
import { OBJParser } from "./OBJParser.js";
import { DEFAULT_MESHES, KIND_TO_ARCHETYPE } from "./defaultMeshes.js";

export class GPUAssetLoader {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.basePath = opts.basePath ?? "./GPU_Assets/";
        this.cache = new Map();   // name -> mesh | null (null = known-missing)
        this.inflight = new Map(); // name -> Promise (for dedup)
        // Round 45 — Ollama auto-generation hooks
        this.ollama = opts.ollama ?? null;
        this.bridgeBaseUrl = opts.bridgeBaseUrl ?? `http://${location.hostname}:8787`;
        this._ollamaRequested = new Set();   // names already attempted; never retry
        this._ollamaDescriptions = new Map(); // name -> description
        // Round 117 — keep the raw OBJ text returned by ollama for
        // each generated asset, so the Asset Gallery hover bubble can
        // show what the model actually produced. Capped at 4 KB per
        // entry to keep memory bounded (the LLM rarely returns more).
        this._ollamaObjTexts = new Map();    // name -> raw OBJ text (truncated)
        this._ollamaModelName = null;        // last-known model name (for bubble header)
        // Round 91 — track names that asked Ollama and got nothing back.
        // VariantExpander.regenerateFailed() reads this set, has the LLM
        // rewrite each entry's description, then clears the name from
        // _ollamaRequested so the next asset load retries with the new
        // prompt. Persisted via /variants/failed for cross-session retry.
        this._ollamaFailed = new Set();
        this._onMeshReplaced = null;          // callback fired when an OBJ arrives + replaces a default
        // Round 195 — priority queue. Names in this set should be
        // generated ASAP. setPriority() adds + immediately kicks off
        // generation if the asset isn't already loaded or inflight,
        // jumping the line in front of Ollama's serial dispatch.
        this._priorityNames = new Set();
        // Round 198 — JS-side request queue. _maybeRequestFromOllama
        // enqueues jobs here instead of calling Ollama directly; a single
        // dispatcher loop pops them in priority-first order. This is what
        // makes the priority queue actually reorder requests, not just
        // tag them — without it, Ollama processes whatever lands first.
        this._pendingQueue = [];           // [{ name, kindOrStyle, archetype }]
        this._currentlyRunning = null;     // name of asset Ollama is processing NOW
        this._dispatching = false;
        // Round 199 — WebGL allocation accounting. Every gl.bufferData
        // we issue gets tracked by byte length, scoped to the asset name
        // when known. Use _accountBufferBytes(name, byteLength) at each
        // bufferData call site. Used by the memory HUD to surface what
        // our GL allocations actually cost.
        this._allocBytesTotal = 0;
        this._allocBytesByAsset = new Map();   // name -> total bytes
        // Round 178 — mesh swap listeners. Round 177 paved the way for
        // material set hot-swap; round 178 does the same for the mesh
        // itself. When the Trellis step in the bench/roster produces a
        // GLB, swapMesh() is called here and we notify subscribers so
        // the renderer can invalidate its VAO cache for that asset.
        this._meshSwapListeners = [];
        // Round 58 - known-asset set primed from /assets/list at boot. When
        // populated (non-null), any loadAsset() call for a name NOT in this
        // set short-circuits to negative-cache immediately, skipping the
        // 4-attempt HTTP probe chain (.glb HEAD, .obj HEAD, mesh.json GET,
        // <name>.asset.json GET). Cuts 404 console noise from ~50 lines
        // per missing asset to zero, since entities still ask for meshes
        // by kind (tree_pine, civ_ruin, etc.) every frame even when no
        // file exists.
        this._knownAssets = null;
    }

    // Round 58 - prime the negative-cache fast path. Called once by main.js
    // name not in `names` returns null without firing HTTP requests.
    // Round 193 — second arg is the per-asset format map from the bridge
    // (each entry: { glb:bool, obj:bool, json:bool, folder:bool }). When
    // present, _load() skips HEAD probes for formats known to be absent.
    primeKnownAssets(names, formats = null) {
        this._knownAssets = new Set(names);
        this._listCache = formats;
        // Don't pre-populate the cache map; we want to keep memory low
        // and let the renderer's lazy lookups hit the fast path naturally.
    }

    // Round 193 — lazy fallback for when primeKnownAssets() wasn't called
    // (e.g. an asset loader used outside main.js, or pre-prime). Fetches
    // /assets/list once and caches.
    async _ensureListCache() {
        if (this._listCache != null) return;        // already primed
        if (this._listCachePending) return this._listCachePending;
        this._listCachePending = (async () => {
            try {
                const r = await fetch(`${this.basePath.replace(/GPU_Assets\/?$/, "")}assets/list`);
                const j = await r.json();
                this._listCache = j.ok ? (j.formats || {}) : {};
            } catch {
                this._listCache = {};
            }
        })();
        await this._listCachePending;
        this._listCachePending = null;
    }

    // Round 45 — register a description for a future Ollama request.
    // Called by managers up front so when the asset is requested and
    // missing, the loader has a description to send.
    registerDescription(name, description) {
        if (description) this._ollamaDescriptions.set(name, description);
    }

    // Round 195 — priority queue API. setPriority(name, true) marks a
    // name as wanted-ASAP; if the asset is not already cached or
    // inflight, immediately kicks off generation, putting it at the
    // front of Ollama's serial dispatch. Returns the new priority
    // state. setPriority(name, false) removes from the priority set.
    //
    // Gallery UI calls this on cell-click; console alternative:
    //   window.assetLoader.setPriority("kaiju_water", true)
    // Round 199 — byte accounting for the memory HUD. Called at every
    // bufferData site with the byte length and (when known) the asset
    // name. Cheap: O(1) Map updates, no GL state queried.
    _accountBufferBytes(name, byteLength) {
        if (!byteLength || byteLength <= 0) return;
        this._allocBytesTotal += byteLength;
        if (name) {
            this._allocBytesByAsset.set(name, (this._allocBytesByAsset.get(name) || 0) + byteLength);
        }
    }

    // Returns a snapshot of GL allocations for HUD display.
    getAllocationStats() {
        // Top 10 assets by byte cost, sorted descending
        const byAsset = Array.from(this._allocBytesByAsset.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, bytes]) => ({ name, bytes }));
        return {
            totalBytes: this._allocBytesTotal,
            assetCount: this._allocBytesByAsset.size,
            top: byAsset,
        };
    }

    // Round 200 — apply the v196 post-processor's output in place. The
    // smoothed positions and recomputed normals get uploaded over the
    // existing VBO/NBO contents; the hole-filled index buffer replaces
    // the existing IBO. The VAO doesn't need re-binding because the
    // buffer handles haven't changed — just their data has. Hole-fill
    // may have added triangles, so we update mesh.indexCount too.
    //
    // No-op when the mesh has no .processed data or has already had it
    // applied (idempotent so the post-processor task can call this
    // freely).
    applyProcessedMesh(name) {
        const mesh = this.cache.get(name);
        if (!mesh || !mesh.processed || mesh._processedApplied) return false;
        const p = mesh.processed;
        const gl = this.gl;
        try {
            if (mesh.vbo) {
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
                gl.bufferData(gl.ARRAY_BUFFER, p.positions, gl.STATIC_DRAW);
                this._accountBufferBytes(name, p.positions.byteLength);
            }
            if (mesh.ibo) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.indices, gl.STATIC_DRAW);
                this._accountBufferBytes(name, p.indices.byteLength);
            }
            if (mesh.nbo && p.normals) {
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nbo);
                gl.bufferData(gl.ARRAY_BUFFER, p.normals, gl.STATIC_DRAW);
                this._accountBufferBytes(name, p.normals.byteLength);
            }
            mesh.indexCount = p.indices.length;
            mesh._processedApplied = true;
            console.log(`[gpuAssetLoader] applied processed mesh for "${name}" (${p.positions.length / 3} verts, ${p.indices.length / 3} tris${p.addedTriangles ? `, ${p.addedTriangles} hole tri(s)` : ""})`);

            // Round 262 — fire mesh-swap listeners so the renderer drops
            // its cached VAO + instance buffer for this asset. Without
            // this, the EntityMeshRenderer keeps reusing a VAO whose
            // primitiveRanges / cached state matches the PRE-processed
            // mesh — and once mesh.indexCount grows (hole-fill added
            // triangles), drawElementsInstanced overruns the cached
            // primitive ranges and floods INVALID_OPERATION ×400+.
            // Pass (mesh, mesh) since the ref is the same — listeners
            // just need the cue to invalidate caches.
            for (const cb of this._meshSwapListeners) {
                try { cb(name, mesh, mesh); }
                catch (err) { console.warn("[gpuAssetLoader] applyProcessedMesh listener threw:", err); }
            }
            return true;
        } catch (e) {
            console.warn(`[gpuAssetLoader] applyProcessedMesh failed for "${name}":`, e?.message || e);
            return false;
        }
    }

    // Round 200 — lazily create GL buffers for the v197 quadric
    // decimator's output. EntityMeshRenderer calls this the first time
    // it decides to draw an asset at LOD distance. Cached on the
    // lodMesh object itself as _vbo/_ibo/_indexCount; subsequent calls
    // are O(1) lookups.
    //
    // Returns the lodMesh GL info, or null if no lodMesh data exists.
    ensureLODGPUBuffers(name) {
        const mesh = this.cache.get(name);
        if (!mesh || !mesh.lodMesh) return null;
        const lm = mesh.lodMesh;
        if (lm._vbo && lm._ibo) {
            return { vbo: lm._vbo, ibo: lm._ibo, indexCount: lm._indexCount };
        }
        const gl = this.gl;
        try {
            lm._vbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, lm._vbo);
            gl.bufferData(gl.ARRAY_BUFFER, lm.positions, gl.STATIC_DRAW);
            this._accountBufferBytes(name + ":lod", lm.positions.byteLength);

            lm._ibo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lm._ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lm.indices, gl.STATIC_DRAW);
            this._accountBufferBytes(name + ":lod", lm.indices.byteLength);

            lm._indexCount = lm.indices.length;
            console.log(`[gpuAssetLoader] LOD buffers ready for "${name}" (${lm.vertexCount} verts, ${lm.indexCount / 3} tris, ${lm.reductionPct}% off)`);
            return { vbo: lm._vbo, ibo: lm._ibo, indexCount: lm._indexCount };
        } catch (e) {
            console.warn(`[gpuAssetLoader] ensureLODGPUBuffers failed for "${name}":`, e?.message || e);
            return null;
        }
    }

    setPriority(name, priority = true) {
        if (priority) {
            this._priorityNames.add(name);
            // Kick generation now if neither cached nor inflight
            // Round 198 — check _ollamaRequested (canonical "has been
            // queued or run" flag) rather than the legacy inflight Map,
            // which only tracks HTTP fetches not the Ollama queue.
            if (!this.cache.has(name) && !this._ollamaRequested.has(name) && !this._ollamaFailed.has(name)) {
                const desc = this._ollamaDescriptions.get(name);
                if (desc) {
                    // Use name as both name and kind hint (best-effort);
                    // managers register descriptions with proper kinds when known.
                    Promise.resolve(this._maybeRequestFromOllama(name, name, desc))
                        .catch(e => console.warn(`[GPUAssetLoader] priority kick for "${name}" failed:`, e?.message || e));
                }
            }
        } else {
            this._priorityNames.delete(name);
        }
        return priority;
    }

    getPriority() { return Array.from(this._priorityNames); }

    onMeshReplaced(fn) { this._onMeshReplaced = fn; }

    // Round 91 — VariantExpander integration: read/clear the failed-OBJ
    // set. After rewriting the description, call resetForRetry(name) to
    // clear the "already requested" flag so the next loadAsset triggers
    // a fresh Ollama call with the new prompt.
    getFailedNames() { return Array.from(this._ollamaFailed); }
    resetForRetry(name) {
        this._ollamaRequested.delete(name);
        this._ollamaFailed.delete(name);
        // Evict the negative cache entry so loadAsset re-tries the HEAD probes.
        this.cache.delete(name);
    }
    // Used by /variants/failed restore at boot to seed the in-memory set
    // from disk-persisted state.
    seedFailedNames(names) {
        if (!Array.isArray(names)) return;
        for (const n of names) this._ollamaFailed.add(n);
    }

    // Returns the loaded mesh, or null if it can't be loaded. Idempotent
    // on success and on permanent failure (negative cache).
    async loadAsset(name) {
        if (this.cache.has(name)) return this.cache.get(name);
        if (this.inflight.has(name)) return this.inflight.get(name);
        // Round 58 - fast path: if /assets/list told us this name isn't on
        // disk, cache null without firing the 4-request probe chain. Only
        // active after primeKnownAssets() has run (otherwise we'd block
        // legitimate loads during startup).
        if (this._knownAssets && !this._knownAssets.has(name)) {
            // v469 — before giving up on a kind that's not on disk, hand it to
            // the acquisition service. For AI-asset kinds (kaiju_*, tree_*, …)
            // it runs the obj→texture→trellis→hitem3d ladder and installs the
            // OBJ via installOBJText(), which overwrites this negative-cache
            // entry — so the entity that asked (and got a cube this frame)
            // picks up the real mesh once it lands. Fire-and-forget; dedup +
            // concurrency live in the service.
            try { window.assetService?.requestAuto?.(name); } catch {}
            this.cache.set(name, null);
            return null;
        }
        // Round 59 - if the asset list hasn't arrived yet, defer this
        // load instead of probing into the dark. The renderer's caller
        // gets null this frame (falls back to cube), and once the list
        // arrives, the next render frame will either fast-path-null or
        // actually load. Eliminates the early-startup 4-request probe
        // burst for entities that render before /assets/list resolves.
        if (this._knownAssets === null) {
            return null;
        }

        const promise = this._load(name).catch((err) => {
            console.warn(`[GPUAssetLoader] "${name}" failed:`, err.message);
            this.cache.set(name, null);
            this.inflight.delete(name);
            return null;
        });
        this.inflight.set(name, promise);

        const result = await promise;
        this.cache.set(name, result);
        this.inflight.delete(name);
        return result;
    }

    async _load(name) {
        // Round 193 — pre-fetch /assets/list once and cache the per-asset
        // format map so we can skip HEAD probes for formats we know are
        // absent on disk. Eliminates the wall of red 404 lines in console
        // every time a missing GLB gets probed. Falls back to legacy
        // "probe every format" behavior for names not in the cache (e.g.
        // assets added after startup via OBJ install).
        await this._ensureListCache();
        const fmt = this._listCache ? this._listCache[name] : null;

        const tryGlb = !fmt || fmt.glb;
        const tryObj = !fmt || fmt.obj;
        const tryFolder = !fmt || fmt.folder || fmt.json;   // .json key was the older folder marker

        // Round 17 — try direct .glb file at GPU_Assets/<name>.glb
        // first. If found, parse via GLBParser and return a textured
        // mesh. Falls through to the existing folder-based format
        // (mesh.json + .bin files) for backwards compatibility.
        if (tryGlb) {
            const glbUrl = `${this.basePath}${name}.glb`;
            try {
                const probe = await fetch(glbUrl, { method: "HEAD" });
                if (probe.ok) {
                    return await this._loadGLB(name, glbUrl);
                }
            } catch {
                // network error, fall through
            }
        }

        // Round 44 — try .obj before falling to mesh.json folder format.
        // OBJ is what Ollama produces directly.
        if (tryObj) {
            const objUrl = `${this.basePath}${name}.obj`;
            try {
                const probe = await fetch(objUrl, { method: "HEAD" });
                if (probe.ok) {
                    return await this._loadOBJ(name, objUrl);
                }
            } catch {
                // fall through
            }
        }

        if (!tryFolder) {
            throw new Error(`asset "${name}": no format available on disk`);
        }

        const base = `${this.basePath}${name}/`;

        // Try mesh.json (full schema), then ${name}.asset.json (older).
        let meta = null;
        try {
            meta = await this._loadJSON(`${base}mesh.json`);
        } catch (e1) {
            try {
                meta = await this._loadJSON(`${base}${name}.asset.json`);
            } catch (e2) {
                throw new Error(`no manifest at ${base}mesh.json or ${base}${name}.asset.json`);
            }
        }

        const vbName = meta.vertexBuffer ?? meta.vertexFile ?? "vertices.bin";
        const ibName = meta.indexBuffer  ?? meta.indexFile  ?? "indices.bin";

        // v3 schema: optional normals + per-vertex colors. Fall through
        // gracefully if missing (old export) or 404 (new schema declared
        // but file absent).
        const wantNormals = meta.hasNormals === true && meta.normalBuffer;
        const wantColors  = meta.hasColors  === true && meta.colorBuffer;

        const optional = (relpath) =>
            this._loadBinary(`${base}${relpath}`).catch(() => null);

        const [vb, ib, nb, cb] = await Promise.all([
            this._loadBinary(`${base}${vbName}`),
            this._loadBinary(`${base}${ibName}`),
            wantNormals ? optional(meta.normalBuffer) : Promise.resolve(null),
            wantColors  ? optional(meta.colorBuffer)  : Promise.resolve(null),
        ]);

        return this._createMesh(vb, ib, nb, cb, meta);
    }

    async _loadJSON(url) {
        const res = await fetch(url, { cache: "default" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        return res.json();
    }

    async _loadBinary(url) {
        const res = await fetch(url, { cache: "default" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        return res.arrayBuffer();
    }

    _createMesh(vertexBuffer, indexBuffer, normalBuffer, colorBuffer, meta) {
        const gl = this.gl;
        const vertices = new Float32Array(vertexBuffer);
        const indices  = new Uint32Array(indexBuffer);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        this._accountBufferBytes(meta?.name, vertices.byteLength);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this._accountBufferBytes(meta?.name, indices.byteLength);

        // Optional normals: only allocate a GL buffer if we got real data
        // AND its size matches the position count. A mismatch means VBA
        // wrote something inconsistent — better to fall back than to
        // confuse the shader with garbage.
        let nbo = null;
        if (normalBuffer) {
            const normals = new Float32Array(normalBuffer);
            if (normals.length === vertices.length) {
                nbo = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
                gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
                this._accountBufferBytes(meta?.name, normals.byteLength);
            } else {
                console.warn(`[GPUAssetLoader] "${meta.name}" normal/position size mismatch (${normals.length} vs ${vertices.length}); falling back to dFdx normals`);
            }
        }

        let cbo = null;
        if (colorBuffer) {
            const colors = new Float32Array(colorBuffer);
            if (colors.length === vertices.length) {
                cbo = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
                gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
                this._accountBufferBytes(meta?.name, colors.byteLength);
            } else {
                console.warn(`[GPUAssetLoader] "${meta.name}" color/position size mismatch; falling back to per-instance tint only`);
            }
        }

        // Compute bounds for diagnostic + future LOD/cull use.
        let minX = +Infinity, minY = +Infinity, minZ = +Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        return {
            name: meta.name || "?",
            vbo, ibo, nbo, cbo,
            hasNormals: nbo !== null,
            hasColors:  cbo !== null,
            vertexCount: vertices.length / 3,
            indexCount:  indices.length,
            bounds: { minX, minY, minZ, maxX, maxY, maxZ },
            // Round 43s - keep raw arrays for the asset gallery preview
            // canvas (different GL context, needs its own VBO uploads).
            _rawPositions: vertices,
            _rawIndices:   indices,
            _rawNormals:   normalBuffer ? new Float32Array(normalBuffer) : null,
            _rawColors:    colorBuffer  ? new Float32Array(colorBuffer)  : null,
            _loadedAt:     Date.now(),
        };
    }

    // Round 17 — load a GLB file directly. Bypasses the VBA-exported
    // JSON+BIN path and produces a textured mesh asset with the same
    // shape (plus optional .tbo for UVs and .texture for the GL texture
    // handle). EntityMeshRenderer reads the new fields when present.
    // Round 44 — load .obj file from URL. Plain text format. Used as
    // fallback after .glb misses. Same downstream output shape via
    // _createMesh — splits the OBJParser's interleaved stream into
    // position/normal/color buffers.
    async _loadOBJ(name, url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        const text = await res.text();
        return this._loadOBJFromText(name, text);
    }

    // Reused for both on-disk .obj files and inline default meshes.
    _loadOBJFromText(name, text, opts = {}) {
        const parsed = OBJParser.parse(text, opts);
        // Interleaved [px,py,pz, nx,ny,nz, r,g,b] → split for _createMesh.
        const inter = new Float32Array(parsed.vertexBuffer);
        const vCount = parsed.meta.vertexCount;
        let positions = new Float32Array(vCount * 3);
        let normals   = new Float32Array(vCount * 3);
        const colors    = new Float32Array(vCount * 3);
        for (let i = 0; i < vCount; i++) {
            positions[i * 3]     = inter[i * 9];
            positions[i * 3 + 1] = inter[i * 9 + 1];
            positions[i * 3 + 2] = inter[i * 9 + 2];
            normals[i * 3]       = inter[i * 9 + 3];
            normals[i * 3 + 1]   = inter[i * 9 + 4];
            normals[i * 3 + 2]   = inter[i * 9 + 5];
            colors[i * 3]        = inter[i * 9 + 6];
            colors[i * 3 + 1]    = inter[i * 9 + 7];
            colors[i * 3 + 2]    = inter[i * 9 + 8];
        }
        let indices = parsed.indexBuffer;
        let finalVCount = vCount;

        // v335 — opt-in mesh post-processing (weld duplicate vertices,
        // recompute smooth normals). Skipped unless meshPP is wired up
        // AND enabled via meshPP.setEnabled(true) from the console.
        // The processSync path runs the kernels on the main thread —
        // adds ~1-5ms per typical mesh, gives back welded geometry +
        // smoothed normals ready for the existing _createMesh call.
        //
        // Color buffer doesn't go through the post-processor (no
        // per-vertex weld for colors yet), so we truncate it down to
        // the welded vertex count using the welded mesh's original→
        // new index map. Actually simpler: since weldAndNormals uses
        // strict position-equality (epsilon-quantized) for welding,
        // any duplicates being merged should have shared the same
        // color anyway in a well-formed OBJ — we just take the first
        // color per welded vertex by indexing through the original
        // positions in order.
        const meshPP = (typeof window !== "undefined") ? window.meshPP : null;
        if (meshPP && meshPP.enabled?.() && typeof meshPP.processSync === "function") {
            try {
                // Note: processSync does NOT transfer inputs, so we can
                // keep using positions/normals/indices for the color
                // remap below.
                const result = meshPP.processSync({
                    positions, indices, name: `obj:${name}`,
                });
                // Build a remap table by hashing original positions to
                // welded positions. Because the kernel uses an epsilon-
                // quantized hash, two original verts at the same
                // position map to the same welded vert. We rebuild that
                // mapping here so we can carry colors forward.
                const eps = 1e-4, inv = 1 / eps;
                const lut = new Map();
                for (let i = 0; i < result.weldedCount; i++) {
                    const x = Math.round(result.positions[i * 3]     * inv);
                    const y = Math.round(result.positions[i * 3 + 1] * inv);
                    const z = Math.round(result.positions[i * 3 + 2] * inv);
                    lut.set(`${x},${y},${z}`, i);
                }
                const newColors = new Float32Array(result.weldedCount * 3);
                const colorWritten = new Uint8Array(result.weldedCount);
                for (let i = 0; i < vCount; i++) {
                    const x = Math.round(positions[i * 3]     * inv);
                    const y = Math.round(positions[i * 3 + 1] * inv);
                    const z = Math.round(positions[i * 3 + 2] * inv);
                    const ni = lut.get(`${x},${y},${z}`);
                    if (ni !== undefined && !colorWritten[ni]) {
                        newColors[ni * 3]     = colors[i * 3];
                        newColors[ni * 3 + 1] = colors[i * 3 + 1];
                        newColors[ni * 3 + 2] = colors[i * 3 + 2];
                        colorWritten[ni] = 1;
                    }
                }
                // Substitute the post-processed buffers
                positions = result.positions;
                normals   = result.normals;
                indices   = result.indices;
                finalVCount = result.weldedCount;
                // Replace colors with the remapped subset
                colors.set(newColors.subarray(0, Math.min(newColors.length, colors.length)));
                // Trim colors to actual size
                const trimmedColors = new Float32Array(finalVCount * 3);
                trimmedColors.set(newColors);
                // Note: meta below uses finalVCount, so the returned
                // mesh has matching counts everywhere.
                console.log(`[meshPP] ${name}: welded ${result.originalCount} → ${result.weldedCount} (${result.durationMs.toFixed(1)}ms)`);
                const meta = {
                    vertexCount: finalVCount,
                    indexCount:  indices.length,
                    hasNormals:  true,
                    hasColors:   true,
                    source:      `obj:${name}`,
                    postProcessed: true,
                };
                return this._createMesh(positions.buffer, indices.buffer, normals.buffer, trimmedColors.buffer, meta);
            } catch (e) {
                console.warn(`[meshPP] post-process failed for ${name}, using original mesh:`, e?.message ?? e);
                // Fall through to the default path with the un-welded data
            }
        }

        const meta = {
            vertexCount: finalVCount,
            indexCount:  indices.length,
            hasNormals:  true,
            hasColors:   true,
            source:      `obj:${name}`,
        };
        return this._createMesh(positions.buffer, indices.buffer, normals.buffer, colors.buffer, meta);
    }

    // Round 44 — load a designed-default mesh from the inline OBJ
    // library. Caller supplies an archetype name (humanoid/beast/
    // flyer/floater/generic). Returns a fresh mesh (no caching by
    // default — same archetype loaded twice would dupe; cache layer
    // above handles that via name keying).
    loadDefault(archetype, opts = {}) {
        const obj = DEFAULT_MESHES[archetype];
        if (!obj) throw new Error(`unknown default archetype: ${archetype}`);
        return this._loadOBJFromText(`default:${archetype}`, obj, opts);
    }

    // Round 44 — resolves a canonical asset name (e.g. "civ_organic" /
    // "kaiju_sky") to a designed-default mesh based on a kind/style
    // hint. Caches under BOTH the canonical name and __default__:arch
    // so subsequent direct cache lookups by the canonical name hit.
    // Returns the loaded mesh (or null if even the default failed).
    //
    // Round 45 — also fire-and-forget request Ollama to generate a
    // proper OBJ for this name. Future spawns of the same name pick
    // up the real mesh once the OBJ is saved.
    loadDefaultForKindOrStyle(canonicalName, kindOrStyle) {
        const lookup = kindOrStyle ?? canonicalName;
        const archetype = KIND_TO_ARCHETYPE[lookup] ?? "generic";
        const archCache = `__default__:${archetype}`;
        let mesh = this.cache.get(archCache);
        if (!mesh) {
            try {
                mesh = this.loadDefault(archetype);
                this.cache.set(archCache, mesh);
            } catch (e) {
                console.warn(`[GPUAssetLoader] default load failed: ${e.message}`);
                return null;
            }
        }
        // Also register under the canonical name so direct cache.get hits
        if (canonicalName && canonicalName !== archCache) {
            this.cache.set(canonicalName, mesh);
        }
        // Round 45 — kick off async Ollama generation if available and
        // we haven't already tried for this name.
        if (canonicalName && this.ollama) {
            this._maybeRequestFromOllama(canonicalName, kindOrStyle, archetype);
        }
        return mesh;
    }

    // Round 45 — async pipeline: ask Ollama for an OBJ, save via ai-bridge,
    // evict the cache so the next loadAsset(name) re-fetches from disk.
    // Never throws. Logs progress.
    //
    // Round 198 — splits into queue-and-kick: the actual Ollama call lives
    // in _runOllamaJob; this entry point just queues the request and starts
    // the dispatcher if it's not already running. This is what makes the
    // priority queue real — the dispatcher sorts by priority on every
    // pick, so starring an item while others are queued ahead of it now
    // genuinely jumps the line.
    async _maybeRequestFromOllama(name, kindOrStyle, archetype) {
        if (this._ollamaRequested.has(name)) return;
        if (!this.ollama || this.ollama.available === false) return;
        this._ollamaRequested.add(name);

        const job = { name, kindOrStyle, archetype };
        // Priority items go to the front of the queue. Non-priority items
        // append. The dispatcher will also re-sort each pick in case
        // priority is set later (after we've already enqueued).
        if (this._priorityNames.has(name)) {
            this._pendingQueue.unshift(job);
        } else {
            this._pendingQueue.push(job);
        }
        // Kick the dispatcher (no-op if already running)
        this._tryDispatch();
    }

    // Round 198 — dispatcher loop. Pops one job at a time, re-sorting on
    // each iteration so priority items added after enqueue still jump
    // ahead. Runs until the queue empties; idempotent — concurrent calls
    // are a no-op while _dispatching is true.
    //
    // v721 — GPU contention guard. Ollama runs on the same GPU as the
    // engine renderer. When Ollama is generating a 100-300 token OBJ,
    // VRAM + CUDA cores get yanked from WebGL, FPS drops to 10-15, and
    // autoQuality starts thrashing. The fix is to NOT pile jobs on top
    // of each other: between jobs, (1) wait for engine FPS to recover
    // and (2) add a small cooldown so the GPU memory traffic settles.
    // Disabled by setting `_throttleConfig.minFps = 0`.
    async _tryDispatch() {
        if (this._dispatching) return;
        this._dispatching = true;
        // Default throttle config — overridable via setOllamaThrottle()
        if (!this._throttleConfig) {
            this._throttleConfig = {
                minFps:     30,     // wait for engine to recover above this
                cooldownMs: 1200,   // post-job pause so VRAM traffic settles
                maxWaitMs:  15000,  // give up waiting after this (don't block forever)
            };
        }
        try {
            while (this._pendingQueue.length > 0) {
                // Re-sort priority items to the front
                this._pendingQueue.sort((a, b) => {
                    const aP = this._priorityNames.has(a.name) ? 1 : 0;
                    const bP = this._priorityNames.has(b.name) ? 1 : 0;
                    return bP - aP;
                });
                // v721 — wait until engine FPS is healthy before starting
                // the next job. Priority items skip this gate so the
                // user's explicit "give me this thing" calls don't get
                // blocked behind ambient asset generation.
                const nextJob = this._pendingQueue[0];
                const isPriority = nextJob && this._priorityNames.has(nextJob.name);
                if (!isPriority && this._throttleConfig.minFps > 0) {
                    await this._waitForHealthyFps();
                }
                const job = this._pendingQueue.shift();
                this._currentlyRunning = job.name;
                try {
                    await this._runOllamaJob(job);
                } catch (e) {
                    console.warn(`[GPUAssetLoader] queue job for "${job.name}" threw:`, e?.message || e);
                } finally {
                    this._currentlyRunning = null;
                }
                // v721 — post-job GPU cooldown. Lets autoQuality's hysteresis
                // counters reset before the next request piles on.
                if (this._pendingQueue.length > 0 && this._throttleConfig.cooldownMs > 0) {
                    await new Promise(r => setTimeout(r, this._throttleConfig.cooldownMs));
                }
            }
        } finally {
            this._dispatching = false;
        }
    }

    // v721 — poll FPS and resolve when the engine is healthy enough for
    // the next Ollama job. Returns immediately if _perfStats isn't wired
    // (no observability => no gating, assume OK). Bounded by maxWaitMs
    // so we never block the queue forever.
    async _waitForHealthyFps() {
        const cfg = this._throttleConfig;
        const tStart = Date.now();
        const poll = 250;   // 4 Hz
        while (Date.now() - tStart < cfg.maxWaitMs) {
            let fps = 60;   // optimistic default if perfStats missing
            try { fps = window?._perfStats?.fps ?? 60; } catch {}
            if (!Number.isFinite(fps) || fps <= 0) return;   // no signal, don't block
            if (fps >= cfg.minFps) return;
            await new Promise(r => setTimeout(r, poll));
        }
        // Timeout — kick the job anyway so the queue makes forward progress
    }

    // v721 — public knob. Call e.g. window.assetLoader.setOllamaThrottle({minFps: 45})
    // to be more aggressive, or {minFps: 0} to disable throttling entirely.
    setOllamaThrottle(opts = {}) {
        this._throttleConfig = Object.assign(
            { minFps: 30, cooldownMs: 1200, maxWaitMs: 15000 },
            this._throttleConfig || {},
            opts,
        );
        console.log("[GPUAssetLoader] Ollama throttle:", this._throttleConfig);
        return this._throttleConfig;
    }

    // Round 198 — the actual work that used to live inline in
    // _maybeRequestFromOllama. Split out so the dispatcher can call it
    // serially in priority order.
    // Round 201 — quick structural OBJ validator. Doesn't try to fully
    // parse — just classifies whether the text looks like OBJ at all,
    // because Ollama models occasionally return Python, JSON, markdown
    // commentary, or empty markdown fences masquerading as 3D output.
    //
    // Counts the line types we expect (v, vn, vt, f, plus structural
    // directives) and the suspicious lines that don't match any known
    // OBJ pattern. Returns { ok, reason, counts } so the retry logic
    // can log a precise diagnosis.
    //
    // Bar:
    //   - At least 3 vertex lines (a triangle minimum)
    //   - At least 1 face line
    //   - Suspicious-line ratio under 50% (filters Python pseudocode
    //     mixed with comment-prefixed OBJ, JSON dicts, etc.)
    _validateOBJ(text) {
        if (!text || typeof text !== "string") {
            return { ok: false, reason: "empty response", counts: {}, kind: "empty" };
        }
        // Round 204 — sniff for Python pseudocode signature. Used to
        // route retries: if the output looks like malformed Blender
        // Python (which the C3D class of models loves to emit), we'll
        // retry with a Python-specific stronger prompt instead of the
        // generic STRICT-MODE-OBJ prompt.
        const looksLikePython = /\bbpy\.|\bimport\s+bpy\b|_factory\s*\(/i.test(text);
        let v = 0, vn = 0, vt = 0, f = 0, structural = 0, comment = 0, suspicious = 0, total = 0;
        for (const raw of text.split("\n")) {
            const line = raw.trim();
            if (!line) continue;
            total++;
            if (line[0] === "#") { comment++; continue; }
            if (/^v\s/.test(line))         v++;
            else if (/^vn\s/.test(line))   vn++;
            else if (/^vt\s/.test(line))   vt++;
            else if (/^f\s/.test(line))    f++;
            else if (/^(s|o|g|usemtl|mtllib)\s/.test(line)) structural++;
            else suspicious++;
        }
        const counts = { v, vn, vt, f, structural, comment, suspicious, total };
        if (v < 3) {
            return {
                ok: false,
                reason: `only ${v} vertex line(s)`,
                counts,
                kind: looksLikePython ? "python" : "no-verts",
            };
        }
        if (f < 1) return { ok: false, reason: "no face (f) lines", counts, kind: "no-faces" };
        if (suspicious > Math.max(3, v * 0.5)) {
            return {
                ok: false,
                reason: `${suspicious} non-OBJ lines (looks like mixed format)`,
                counts,
                kind: looksLikePython ? "python" : "mixed",
            };
        }
        return { ok: true, reason: "valid", counts, kind: "valid" };
    }

    async _runOllamaJob({ name, kindOrStyle, archetype }) {
        // Build a description from registered hints OR a sensible
        // fallback derived from the canonical name + archetype.
        let description = this._ollamaDescriptions.get(name);
        if (!description) {
            description = this._defaultDescription(name, kindOrStyle, archetype);
        }

        // Round 201 — retry tracking. On retry, prepend a stronger
        // instruction header to the description. Two retries max
        // (so 3 attempts total).
        // Round 204 — retry prompt is now picked by the last failure
        // kind, stored in _ollamaLastFailKind. "python" failures get a
        // Python-specific reformatting nudge (since these come from C3D-
        // class models that the OllamaClient's c3dPythonToOBJ already
        // tried to recover and failed). Everything else gets the
        // generic STRICT-MODE-OBJ retry.
        if (!this._ollamaRetries) this._ollamaRetries = new Map();
        if (!this._ollamaLastFailKind) this._ollamaLastFailKind = new Map();
        const retryCount   = this._ollamaRetries.get(name) || 0;
        const lastFailKind = this._ollamaLastFailKind.get(name) || null;
        const MAX_RETRIES = 2;
        if (retryCount > 0) {
            if (lastFailKind === "python") {
                description = `STRICT FORMAT: Output well-formed Blender Python only. Each primitive on its own line using this exact pattern: head = bpy.data.objects.new("head", bpy.data.mesh.sphere_factory("kaiju", 0.3)); then head.location = (x, y, z). Use 6-12 primitive parts: cone_factory, sphere_factory, or cube_factory. Keep coordinates between -1 and 1. No prose, no markdown fences. Description: ${description}`;
            } else {
                description = `STRICT MODE: Output ONLY valid Wavefront OBJ. Every line must start with one of: 'v ' (vertex), 'vn ' (normal), 'vt ' (texcoord), 'f ' (face), or '#' (comment). No Python, no JSON, no markdown fences, no prose. Description: ${description}`;
            }
        }

        const priorityTag = this._priorityNames.has(name) ? " [⭐ priority]" : "";
        const retryTag    = retryCount > 0
            ? ` [retry ${retryCount}/${MAX_RETRIES} via ${lastFailKind || "generic"}]`
            : "";
        console.log(`[GPUAssetLoader] requesting OBJ from Ollama for "${name}" (${kindOrStyle || archetype})${priorityTag}${retryTag}`);

        let objText;
        try {
            objText = await this.ollama.generateOBJ(description);
        } catch (e) {
            console.warn(`[GPUAssetLoader] Ollama generateOBJ threw: ${e.message}`);
            return;
        }
        if (!objText) {
            console.log(`[GPUAssetLoader] Ollama returned no OBJ for "${name}"`);
            // Round 201 — empty response also retryable, since model
            // could have hit a stop sequence prematurely.
            if (retryCount < MAX_RETRIES) {
                this._ollamaRetries.set(name, retryCount + 1);
                this._ollamaRequested.delete(name);   // allow re-enqueue
                console.log(`[GPUAssetLoader] re-queueing "${name}" (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`);
                this._maybeRequestFromOllama(name, kindOrStyle, archetype);
                return;
            }
            this._ollamaRetries.delete(name);
            // Round 91 — record into the failed set so VariantExpander
            // can re-prompt with a rewritten description later.
            this._ollamaFailed.add(name);
            // Persist failure so it survives reload (best-effort).
            try {
                const r = fetch(`${this.bridgeBaseUrl}/variants/failed`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                });
                r.catch(() => {});       // fire-and-forget
            } catch {}
            return;
        }

        // Round 201 — structural validation before install. Catches
        // Python pseudocode that wasn't auto-recovered, JSON dicts,
        // markdown-only output, etc.
        // Round 204 — record the failure kind so next retry can pick
        // the most-effective stronger prompt (Python-specific vs OBJ-
        // specific).
        const v = this._validateOBJ(objText);
        if (!v.ok) {
            console.log(`[GPUAssetLoader] OBJ validation failed for "${name}": ${v.reason}  (kind=${v.kind}, v=${v.counts.v}, f=${v.counts.f}, suspicious=${v.counts.suspicious})`);
            this._ollamaLastFailKind.set(name, v.kind);
            if (retryCount < MAX_RETRIES) {
                this._ollamaRetries.set(name, retryCount + 1);
                this._ollamaRequested.delete(name);
                const promptStyle = v.kind === "python" ? "Python-specific" : "stricter OBJ";
                console.log(`[GPUAssetLoader] re-queueing "${name}" with ${promptStyle} prompt (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`);
                this._maybeRequestFromOllama(name, kindOrStyle, archetype);
                return;
            }
            console.warn(`[GPUAssetLoader] giving up on "${name}" after ${MAX_RETRIES + 1} attempts (last kind=${v.kind})`);
            this._ollamaRetries.delete(name);
            this._ollamaLastFailKind.delete(name);
            this._ollamaFailed.add(name);
            try {
                const r = fetch(`${this.bridgeBaseUrl}/variants/failed`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                });
                r.catch(() => {});
            } catch {}
            return;
        }

        // Round 91 — successful OBJ arrived, clear any prior failure
        this._ollamaFailed.delete(name);
        // Round 201 — clear retry counter on success
        // Round 204 — also clear the last-fail-kind
        if (this._ollamaLastFailKind) this._ollamaLastFailKind.delete(name);
        this._ollamaRetries.delete(name);
        if (retryCount > 0) {
            console.log(`[GPUAssetLoader] "${name}" succeeded after ${retryCount} retry(s) — v=${v.counts.v}, f=${v.counts.f}`);
        }

        // Round 117 — stash the raw OBJ for Asset Gallery thought bubbles.
        // Truncate to keep memory bounded; the bubble only shows ~14 lines.
        const TRUNC = 4096;
        this._ollamaObjTexts.set(
            name,
            objText.length > TRUNC ? objText.slice(0, TRUNC) + "\n// …truncated…" : objText
        );
        if (this.ollama?.model) this._ollamaModelName = this.ollama.model;

        // Round 189 — install path factored into a public method so the
        // live-pipeline demo can use it directly (after generating OBJ
        // from a separate Ollama client). _maybeRequestFromOllama is
        // still the entry point for the normal demand-driven flow.
        await this.installOBJText(name, objText);
    }

    /**
     * Save OBJ text via the bridge, evict the cache for `name`, reload
     * the mesh, and notify both kinds of swap listeners so renderers
     * invalidate their VAO caches. Public so external orchestrators
     * (the v189 live-pipeline demo) can install OBJ generated from
     * their own Ollama client.
     *
     * Returns the loaded mesh on success, null on failure.
     */
    async installOBJText(name, objText) {
        // Save via ai-bridge
        try {
            const res = await fetch(`${this.bridgeBaseUrl}/assets/save-obj`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, obj: objText }),
            });
            const data = await res.json();
            if (!data.ok) {
                console.warn(`[GPUAssetLoader] save-obj rejected for "${name}": ${data.error}`);
                return null;
            }
        } catch (e) {
            console.warn(`[GPUAssetLoader] save-obj request failed for "${name}": ${e.message}`);
            return null;
        }

        // Round 193 — update format cache so subsequent loads probe .obj
        // (otherwise the cached "obj: false" from boot would short-circuit
        // and we'd never see the new OBJ).
        if (this._listCache) {
            this._listCache[name] = Object.assign({ glb: false, obj: false, json: false, folder: false }, this._listCache[name] || {}, { obj: true });
        }
        if (this._knownAssets) this._knownAssets.add(name);

        // Evict cache so the next loadAsset() re-loads from disk.
        // v188 fix: capture oldMesh BEFORE deleting so we can pass it
        // to the swap listeners and free its GPU buffers cleanly.
        const oldMesh = this.cache.get(name);
        this.cache.delete(name);
        try {
            const mesh = await this.loadAsset(name);
            if (mesh && this._onMeshReplaced) {
                this._onMeshReplaced(name, mesh);
            }
            if (mesh && oldMesh) {
                for (const cb of this._meshSwapListeners) {
                    try { cb(name, oldMesh, mesh); }
                    catch (err) { console.warn("[GPUAssetLoader] OBJ-swap listener threw:", err); }
                }
                this._disposeMeshBuffers(oldMesh);
            }
            console.log(`[GPUAssetLoader] OBJ ready for "${name}" — future spawns use the generated mesh`);
            return mesh;
        } catch (e) {
            console.warn(`[GPUAssetLoader] post-save load failed for "${name}": ${e.message}`);
            return null;
        }
    }

    _defaultDescription(name, kindOrStyle, archetype) {
        // Strip "kaiju_" / "civ_" prefix; map archetype to body hint
        const stripped = name.replace(/^(kaiju|civ)_/, "");
        const hints = {
            humanoid: "a humanoid figure with arms, legs, and a head",
            beast:    "a four-legged beast with a low head",
            flyer:    "a winged creature with a narrow body and wide wings",
            floater:  "a floating bulb with hanging tendrils",
            generic:  "an angular geometric form with a chamfered top",
        };
        const body = hints[archetype] ?? "a low-poly creature";
        return `${stripped} (${kindOrStyle || archetype}): ${body}`;
    }

    async _loadGLB(name, url, opts) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        const buf = await res.arrayBuffer();
        // v762 — forward the source URL as baseUrl so the GLBParser can
        // resolve relative buffer/image URIs in multi-file .gltf assets
        // (the city pack's Quaternius GLTFs have separate .bin sidecars).
        // Without this, swapMesh silently fails for every city asset and
        // the demo looks empty even though entities are spawned.
        const baseUrl = (typeof location !== "undefined")
            ? new URL(url, location.href).href
            : url;
        return this._loadGLBFromBytes(name, buf, { ...(opts || {}), baseUrl });
    }

    // Round 180 — bytes-based loader. Extracted from _loadGLB so the
    // IndexedDB-restore path can re-inject saved Trellis GLBs without
    // a network fetch. Same parse + GPU upload path, just sourced
    // from an ArrayBuffer the caller already has.
    //
    // opts:
    //   normalize: { targetSize: number, anchor: "center"|"floor" }
    //       Optional bbox-fit transform applied to positions before
    //       GPU upload. anchor="floor" puts minY at y=0 (mesh stands
    //       on the ground); anchor="center" centers on origin.
    //       Used by swapMesh() for Trellis output normalization.
    //   baseUrl: string — forwarded to GLBParser for multi-file .gltf
    //       (v762).
    async _loadGLBFromBytes(name, buf, opts) {
        const parsed = await GLBParser.parse(buf, { baseUrl: opts?.baseUrl });

        // Round 19 — log rigged GLB detection. If skin + animations
        // are present, the mesh is rigged and stage 2 of the pipeline
        // (skinning shader) will animate it. For now, the data is
        // attached to the mesh object for later use.
        const isRigged = !!(parsed.skin && parsed.animations && parsed.weights && parsed.joints);
        if (isRigged) {
            const jointCount = parsed.skin.joints.length;
            const clipCount  = parsed.animations.length;
            const clipNames  = parsed.animations.map(c => c.name).slice(0, 3).join(", ");
            console.log(`[GLBParser] rigged "${name}": ${jointCount} joints, ${clipCount} clip(s) [${clipNames}${clipCount > 3 ? ", ..." : ""}]`);
        }

        const gl = this.gl;
        let positions = parsed.positions instanceof Float32Array
            ? parsed.positions
            : new Float32Array(parsed.positions);

        // Round 180 — optional bbox-fit normalization. Applied to
        // positions before they hit the GPU buffer. Used by swapMesh
        // for Trellis output (arbitrary coordinate space) so swapped
        // meshes reliably render at engine scale.
        // v764 — capture pre-normalize bbox dimensions either way so
        // cityPack can spot Quaternius .gltf parses that came back flat
        // (parser misses scene graph → returns just a footprint plane).
        let preNormBBox = null;
        if (opts?.normalize) {
            positions = this._normalizePositions(positions, opts.normalize);
            preNormBBox = positions._preNormalizeBBox || null;
        } else if (positions.length > 0) {
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i], y = positions[i+1], z = positions[i+2];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
            preNormBBox = { sx: maxX - minX, sy: maxY - minY, sz: maxZ - minZ };
        }

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        this._accountBufferBytes(name, positions.byteLength);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, parsed.indices, gl.STATIC_DRAW);
        this._accountBufferBytes(name, parsed.indices.byteLength);

        let nbo = null;
        if (parsed.normals && parsed.normals.length === positions.length) {
            const normals = parsed.normals instanceof Float32Array
                ? parsed.normals
                : new Float32Array(parsed.normals);
            nbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
            gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
            this._accountBufferBytes(name, normals.byteLength);
        }

        // UV buffer — only present when GLB has TEXCOORD_0
        let tbo = null;
        if (parsed.texCoords && parsed.texCoords.length === (positions.length / 3) * 2) {
            const uvs = parsed.texCoords instanceof Float32Array
                ? parsed.texCoords
                : new Float32Array(parsed.texCoords);
            tbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, tbo);
            gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
            this._accountBufferBytes(name, uvs.byteLength);
        }

        // Round 19 stage 2 — skinning attribute buffers. Joints are
        // uvec4 of node-indices, weights are vec4 of normalized blend
        // weights summing to 1.0. Only created for rigged meshes.
        let jbo = null, wbo = null;
        let jointsComponentType = null;   // gl.UNSIGNED_BYTE | gl.UNSIGNED_SHORT
        if (parsed.joints && parsed.weights) {
            jbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, jbo);
            gl.bufferData(gl.ARRAY_BUFFER, parsed.joints, gl.STATIC_DRAW);
            this._accountBufferBytes(name, parsed.joints.byteLength);
            jointsComponentType = parsed.joints instanceof Uint8Array  ? gl.UNSIGNED_BYTE
                                : parsed.joints instanceof Uint16Array ? gl.UNSIGNED_SHORT
                                : gl.UNSIGNED_SHORT;
            const weights = parsed.weights instanceof Float32Array
                ? parsed.weights
                : new Float32Array(parsed.weights);
            wbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, wbo);
            gl.bufferData(gl.ARRAY_BUFFER, weights, gl.STATIC_DRAW);
            this._accountBufferBytes(name, weights.byteLength);
        }

        // Round 118 — per-vertex material colors (baked from each GLB
        // primitive's baseColorFactor). The entity renderer already
        // has aVertexColor at attribute slot 5; uploading as cbo here
        // makes the renderer pick it up automatically. Each robot
        // part now shows in its own color (silver torso, gray accents,
        // dark joints, etc.) without per-primitive draw calls.
        let cbo = null;
        let hasColors = false;
        if (parsed.colors && parsed.colors.length === positions.length) {
            cbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
            let colors = parsed.colors instanceof Float32Array
                ? parsed.colors
                : new Float32Array(parsed.colors);
            // v1471 — optional per-load color multiply (gated by opts.tint). Used by
            // chess3d to recolor one GLB into white/black sides. No-op for every
            // other load (tint undefined). Only affects vertex-colored meshes.
            if (opts && opts.tint) {
                colors = colors.slice();
                const tn = opts.tint;
                for (let i = 0; i < colors.length; i += 3) { colors[i] *= tn[0]; colors[i + 1] *= tn[1]; colors[i + 2] *= tn[2]; }
            }
            gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
            hasColors = true;
        }

        // Texture — upload ImageBitmap to a GL texture
        let texture = null;
        if (parsed.texture) {
            texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                gl.RGBA, gl.UNSIGNED_BYTE, parsed.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        // Round 123 — per-primitive textures for multi-material meshes.
        // GLBParser returns texturesByMaterial: {matIdx → ImageBitmap}
        // and primitiveRanges: [{indexStart, indexCount, materialIdx}].
        // We upload each texture into its own GL texture and pass both
        // structures through to the renderer. EntityMeshRenderer's
        // instanced draw loop branches on whether more than one unique
        // texture exists; if so it walks primitiveRanges and rebinds
        // per range. Single-texture meshes fall through unchanged.
        const glTexturesByMaterial = {};
        if (parsed.texturesByMaterial) {
            for (const matIdxKey of Object.keys(parsed.texturesByMaterial)) {
                const img = parsed.texturesByMaterial[matIdxKey];
                if (!img) continue;
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                    gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.generateMipmap(gl.TEXTURE_2D);
                glTexturesByMaterial[matIdxKey] = tex;
            }
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        const primitiveRanges = parsed.primitiveRanges || null;
        const isMultiMaterial = !!(primitiveRanges &&
            primitiveRanges.length > 1 &&
            Object.keys(glTexturesByMaterial).length > 1);

        // Bounds
        let minX = +Infinity, minY = +Infinity, minZ = +Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i], y = positions[i + 1], z = positions[i + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        // v620 — precompute per-joint skin radii for rigged meshes so the
        // picker's pose-AABB can grow each joint by its actual maximum-reach
        // instead of a flat fraction of static bounds. Algorithm:
        //   1. Derive each joint's REST mesh-space position from its inverse-
        //      bind matrix: jointRest = -R^T * t, where (R | t) are the
        //      rotation/translation blocks of invBindMat (column-major mat4).
        //   2. For each vertex weighted to joint j with weight > 0.05, compute
        //      its distance from jointRest[j]. Track max per joint.
        // Result lives on mesh.skin.jointRadii (Float32Array length = n_joints)
        // and mesh.skin.jointRestPos (Float32Array length = 3*n_joints).
        // Wrapped in try/catch: if anything's wrong with the parsed skin data,
        // we just leave jointRadii absent and the picker falls back to
        // v619's flat-pad pose AABB.
        if (isRigged && parsed.skin?.joints?.length && parsed.skin.inverseBindMatrices && parsed.joints && parsed.weights) {
            try {
                const skin = parsed.skin;
                const nJoints = skin.joints.length;
                const jointRestPos = new Float32Array(nJoints * 3);
                for (let j = 0; j < nJoints; j++) {
                    const ibm = skin.inverseBindMatrices[j];
                    if (!ibm || ibm.length < 16) continue;
                    // (R | t) blocks, column-major mat4:
                    //   R col0 = (ibm[0], ibm[1], ibm[2])
                    //   R col1 = (ibm[4], ibm[5], ibm[6])
                    //   R col2 = (ibm[8], ibm[9], ibm[10])
                    //   t       = (ibm[12], ibm[13], ibm[14])
                    // jointRest = -R^T * t = -(R^T applied to t).
                    // Reading R as matrix rows (col-major-to-row):
                    //   R[0][.] = (ibm[0], ibm[4], ibm[8])
                    //   R[1][.] = (ibm[1], ibm[5], ibm[9])
                    //   R[2][.] = (ibm[2], ibm[6], ibm[10])
                    // R^T * t: row i of R^T = column i of R.
                    //   (R^T * t).x = ibm[0]*tx + ibm[1]*ty + ibm[2]*tz
                    //   (R^T * t).y = ibm[4]*tx + ibm[5]*ty + ibm[6]*tz
                    //   (R^T * t).z = ibm[8]*tx + ibm[9]*ty + ibm[10]*tz
                    const tx = ibm[12], ty = ibm[13], tz = ibm[14];
                    jointRestPos[j * 3]     = -(ibm[0] * tx + ibm[1] * ty + ibm[2]  * tz);
                    jointRestPos[j * 3 + 1] = -(ibm[4] * tx + ibm[5] * ty + ibm[6]  * tz);
                    jointRestPos[j * 3 + 2] = -(ibm[8] * tx + ibm[9] * ty + ibm[10] * tz);
                }

                const jointRadii = new Float32Array(nJoints);
                const joints = parsed.joints;     // per-vertex joint indices, Uint8Array or Uint16Array
                const weights = parsed.weights;   // per-vertex weights, Float32Array
                // v621 — derive stride from data instead of assuming 4. glTF spec
                // says 4 joints/weights per vertex, but autoSpineRig or future
                // formats may differ. Pick the smaller of (joints/nVerts) and
                // (weights/nVerts); if they disagree it's a malformed mesh and we
                // log + skip rather than mis-read.
                const nVerts = positions.length / 3;
                const strideJ = nVerts > 0 ? (joints.length  / nVerts) : 0;
                const strideW = nVerts > 0 ? (weights.length / nVerts) : 0;
                const stride = Math.min(strideJ, strideW) | 0;
                if (strideJ !== strideW) {
                    console.warn(`[GPUAssetLoader] "${name}" skin stride mismatch: joints=${strideJ} weights=${strideW}; using ${stride}`);
                }
                if (stride > 0 && joints.length >= nVerts * stride && weights.length >= nVerts * stride) {
                    for (let v = 0; v < nVerts; v++) {
                        const vx = positions[v * 3];
                        const vy = positions[v * 3 + 1];
                        const vz = positions[v * 3 + 2];
                        for (let w = 0; w < stride; w++) {
                            const idx = v * stride + w;
                            const weight = weights[idx];
                            if (weight < 0.05) continue;
                            const jointIdx = joints[idx];
                            if (jointIdx < 0 || jointIdx >= nJoints) continue;
                            const dx = vx - jointRestPos[jointIdx * 3];
                            const dy = vy - jointRestPos[jointIdx * 3 + 1];
                            const dz = vz - jointRestPos[jointIdx * 3 + 2];
                            const dist = Math.hypot(dx, dy, dz);
                            if (dist > jointRadii[jointIdx]) jointRadii[jointIdx] = dist;
                        }
                    }
                    parsed.skin.jointRestPos = jointRestPos;
                    parsed.skin.jointRadii = jointRadii;
                    let maxR = 0;
                    for (let j = 0; j < nJoints; j++) if (jointRadii[j] > maxR) maxR = jointRadii[j];
                    console.log(`[GPUAssetLoader] "${name}" skin radii: ${nJoints} joints, max=${maxR.toFixed(2)}u, used by picker pose-AABB`);
                }
            } catch (e) {
                console.warn(`[GPUAssetLoader] "${name}" skin radii precompute failed:`, e?.message);
            }
        }

        console.log(`[GPUAssetLoader] GLB "${name}" loaded: ${positions.length / 3} verts, ${parsed.indices.length} indices, texture=${texture ? "yes" : "no"}${isMultiMaterial ? `, multi-material (${primitiveRanges.length} primitives, ${Object.keys(glTexturesByMaterial).length} textures)` : ""}`);

        return {
            name,
            vbo, ibo, nbo,
            cbo,                          // round 118 — per-vertex color buffer or null
            tbo,                          // round 17 — UV buffer (or null)
            texture,                      // round 17 — GL texture (or null)
            hasNormals:  nbo !== null,
            hasColors,
            hasTexture:  texture !== null,
            hasTexCoords: tbo !== null,
            vertexCount: positions.length / 3,
            indexCount:  parsed.indices.length,
            bounds: { minX, minY, minZ, maxX, maxY, maxZ },
            // v764 — pre-normalize dimensions captured before bbox-fit. Used by
            // cityPack to detect Quaternius .gltf parses where the file's scene
            // graph yielded just a footprint plane (sy ≈ 0) and substitute an
            // obelisk fallback so the city is actually visible. Captured from
            // _normalizePositions when normalize ran, or computed fresh when
            // normalize was skipped (see _loadGLBFromBytes head).
            _preNormalizeBBox: preNormBBox,
            primitiveRanges,
            texturesByMaterial: glTexturesByMaterial,
            isMultiMaterial,
            skin:        parsed.skin,
            animations:  parsed.animations,
            nodes:       parsed.nodes,
            morphTargets:     parsed.morphTargets || null,        // v1391 — blendshape deltas
            morphTargetNames: parsed.morphTargetNames || null,
            morphWeights:     parsed.morphWeights || null,
            morphVertexCount: parsed.morphVertexCount || 0,
            // v670 — keep CPU-side typed arrays on rigged meshes so consumers
            // like rig.fromGLB / buildGLBLegRig can extract leg geometry
            // without re-fetching the GLB. Memory cost: a few KB per rigged
            // asset (RobotExpressive: 48 verts ≈ 1.7KB total). Only present
            // when the source was a real GLB (not for procedurally-built
            // rigs from registerSpineRig).
            positions,                       // Float32Array, vec3 per vertex
            indices:     parsed.indices,     // Uint32Array
            normals:     parsed.normals || null,
            joints:      parsed.joints,      // typed array (joints attribute)
            weights:     parsed.weights,     // Float32Array (weights attribute)
            // Round 19 backwards-compat aliases — kept so older code paths
            // that read jointsData/weightsData still work.
            jointsData:  parsed.joints,
            weightsData: parsed.weights,
            isRigged,
            jbo,                             // gl.UNSIGNED_BYTE/SHORT joint indices
            wbo,                             // gl.FLOAT weights
            jointsComponentType,             // gl.UNSIGNED_BYTE | gl.UNSIGNED_SHORT
        };
    }

    snapshot() {
        let loaded = 0, missing = 0;
        for (const v of this.cache.values()) {
            if (v) loaded++; else missing++;
        }
        return { loaded, missing, inflight: this.inflight.size };
    }

    // Round 43s - per-asset detail used by the asset gallery UI.
    // Returns one entry per known asset name (cached, inflight, or
    // registered via registerDescription). Each entry has:
    //   { name, status, source, description, vertexCount, loadedAt, mesh }
    // status: "loaded" | "missing" | "inflight"
    // source: "ollama" | "file" | "unknown"  (best-effort guess)
    detailedSnapshot() {
        const out = new Map();
        // Round 117 — bind these once, reused in each entry
        const objTexts = this._ollamaObjTexts;
        const modelName = this._ollamaModelName;
        // Walk the description registry (every asset someone registered)
        for (const [name, desc] of this._ollamaDescriptions.entries()) {
            out.set(name, {
                name, status: "missing", source: "unknown",
                description: desc, vertexCount: 0, loadedAt: 0, mesh: null,
                ollamaRequested: this._ollamaRequested.has(name),
                objText: objTexts.get(name) ?? null,
                modelName,
                priority: this._priorityNames.has(name),    // Round 195
                isRunning: this._currentlyRunning === name, // Round 198 — actively running on Ollama
                isQueued: this._pendingQueue.some(j => j.name === name), // Round 198 — queued, not started
            });
        }
        // Loaded / cached
        for (const [name, mesh] of this.cache.entries()) {
            const e = out.get(name) || {
                name, status: "missing", source: "unknown",
                description: this._ollamaDescriptions.get(name) ?? "",
                vertexCount: 0, loadedAt: 0, mesh: null,
                ollamaRequested: this._ollamaRequested.has(name),
                objText: objTexts.get(name) ?? null,
                modelName,
                priority: this._priorityNames.has(name),    // Round 195
                isRunning: this._currentlyRunning === name, // Round 198 — actively running on Ollama
                isQueued: this._pendingQueue.some(j => j.name === name), // Round 198 — queued, not started
            };
            if (mesh) {
                e.status      = "loaded";
                e.source      = this._ollamaRequested.has(name) ? "ollama" : "file";
                e.vertexCount = mesh.vertexCount ?? 0;
                e.loadedAt    = mesh._loadedAt ?? 0;
                e.mesh        = mesh;
            } else {
                e.status = "missing";
            }
            // Ensure objText/modelName populated for already-built entries
            if (!e.objText) e.objText = objTexts.get(name) ?? null;
            if (!e.modelName) e.modelName = modelName;
            out.set(name, e);
        }
        // In-flight
        for (const name of this.inflight.keys()) {
            const e = out.get(name) || {
                name, status: "inflight", source: "unknown",
                description: this._ollamaDescriptions.get(name) ?? "",
                vertexCount: 0, loadedAt: 0, mesh: null,
                ollamaRequested: this._ollamaRequested.has(name),
                objText: objTexts.get(name) ?? null,
                modelName,
                priority: this._priorityNames.has(name),    // Round 195
                isRunning: this._currentlyRunning === name, // Round 198 — actively running on Ollama
                isQueued: this._pendingQueue.some(j => j.name === name), // Round 198 — queued, not started
            };
            if (e.status === "missing") e.status = "inflight";
            out.set(name, e);
        }
        return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    // -----------------------------------------------------------------------
    // Round 178 — mesh hot-swap. Replaces the cached mesh for `name`
    // with a freshly-loaded GLB from `glbUrl`. Existing entities of
    // that kind will use the new mesh on the next render frame.
    //
    // Callers (the bench and roster): once the Trellis step succeeds
    // and the user has chosen an entity kind, call this method to
    // close the loop — the kaiju on screen now shows the AI-generated
    // mesh instead of the procedural one.
    //
    // GPU resource lifecycle: the OLD mesh's vbo/ibo/nbo/tbo are
    // deleted via disposeMesh() AFTER the renderer's swap listener
    // has had a chance to invalidate its VAO (which referenced those
    // buffers). Order matters — if we delete buffers before VAO
    // invalidation, the renderer holds a dangling reference and the
    // next draw is UB.
    //
    // v439 — fire mesh-swap listeners for an in-memory swap (e.g. when a
    // static asset is replaced by a rigged version), so the renderer drops
    // its cached VAO/instance buffers and rebuilds against the new (skinned)
    // mesh next frame.
    notifyMeshSwap(name, oldMesh, newMesh) {
        for (const cb of this._meshSwapListeners) {
            try { cb(name, oldMesh, newMesh); }
            catch (err) { console.warn("[GPUAssetLoader] swap listener threw:", err); }
        }
    }

    // Errors: if the fetch or parse fails, the cache stays with the
    // existing mesh (no regression). Returns the new mesh on success,
    // null on failure.
    async swapMesh(name, glbUrl, opts = {}) {
        if (!name || !glbUrl) return null;
        let newMesh;
        // Round 180 — normalize by default for Trellis output. Caller
        // can pass opts.normalize=false to skip (e.g. for a curated
        // GLB authored at the right scale). When normalize is on,
        // target size comes from targetSizeFor(kind) unless the
        // caller overrides via opts.targetSize.
        const normalize = opts.normalize === false ? false : {
            targetSize: opts.targetSize ?? this._defaultTargetSize(name),
            anchor:     opts.anchor ?? "floor",
        };
        try {
            // Force a fresh load by calling _loadGLB directly. We
            // intentionally bypass loadAsset() to avoid the cache /
            // inflight short-circuit. The normalize transform is
            // applied to positions before GPU upload.
            newMesh = await this._loadGLB(name, glbUrl, { normalize });
        } catch (e) {
            console.warn(`[GPUAssetLoader] swapMesh("${name}") failed:`, e.message);
            return null;
        }
        if (!newMesh) {
            console.warn(`[GPUAssetLoader] swapMesh("${name}"): _loadGLB returned null`);
            return null;
        }
        // Round 180 — persist the GLB bytes to IndexedDB so the swap
        // survives page reload. We persist BEFORE installing in cache
        // because installing fires renderer listeners and we don't
        // want to confuse callers waiting on the swap promise.
        // Note: opts.skipPersist is set by the boot-time restore
        // path itself (to avoid re-saving what we just loaded).
        if (!opts.skipPersist) {
            try {
                // Re-fetch the bytes — we already fetched them inside
                // _loadGLB but didn't keep a reference. Cheap because
                // ComfyUI's view endpoint serves with cache headers.
                const res = await fetch(glbUrl);
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    // Don't await — persistence shouldn't block the swap.
                    this._persistMeshBytes(name, buf, { normalize, sourceUrl: glbUrl })
                        .catch(err => console.warn(`[GPUAssetLoader] persist("${name}") failed:`, err.message));
                }
            } catch (e) {
                console.warn(`[GPUAssetLoader] persist re-fetch("${name}") failed:`, e.message);
            }
        }
        const oldMesh = this.cache.get(name);
        this.cache.set(name, newMesh);
        // Mark this name as known so the assets-list short-circuit
        // (loadAsset top) doesn't override the swap on a subsequent
        // call.
        if (this._knownAssets) this._knownAssets.add(name);
        // Drop any in-flight load that might race with this swap.
        this.inflight.delete(name);

        // Notify renderer-side listeners FIRST so VAO references to
        // the old buffers get cleared. Each listener gets the name
        // and the old mesh so it can do any per-asset cleanup.
        for (const cb of this._meshSwapListeners) {
            try { cb(name, oldMesh, newMesh); }
            catch (err) { console.warn("[GPUAssetLoader] swap listener threw:", err); }
        }
        // Now safe to free the old GPU buffers.
        if (oldMesh) this._disposeMeshBuffers(oldMesh);
        console.log(`[GPUAssetLoader] swapped "${name}" mesh — new: ${newMesh.vertexCount} verts, ${newMesh.indexCount} indices`);
        return newMesh;
    }

    // Register a callback fired whenever swapMesh() replaces a mesh.
    // Signature: (name, oldMesh, newMesh) => void
    onMeshSwap(cb) {
        if (typeof cb === "function") this._meshSwapListeners.push(cb);
    }

    // Delete a mesh's GL buffers — used by swapMesh after listeners
    // have had a chance to clean up VAOs referencing them. Tolerates
    // missing buffer fields (rigged meshes have different shapes).
    _disposeMeshBuffers(mesh) {
        if (!mesh) return;
        const gl = this.gl;
        for (const key of ["vbo", "ibo", "nbo", "tbo", "uvbo", "jointBuffer", "weightBuffer"]) {
            if (mesh[key]) { try { gl.deleteBuffer(mesh[key]); } catch {} }
        }
        // Textures from GLB are owned by the mesh
        if (mesh.texture) { try { gl.deleteTexture(mesh.texture); } catch {} }
        if (mesh.texturesByMaterial) {
            for (const t of Object.values(mesh.texturesByMaterial)) {
                try { gl.deleteTexture(t); } catch {}
            }
        }
    }

    // -----------------------------------------------------------------------
    // Round 180 — position normalization. Bbox-fit so swapped meshes
    // (Trellis output, arbitrary GLBs) render at a predictable engine
    // scale instead of fly-sized or building-sized.
    //
    // Strategy: find the bounding box; uniform-scale to fit `targetSize`
    // along the largest extent (preserves aspect ratio); translate so
    // either the floor (minY) or the center sits at the origin.
    //
    // "floor" anchor is the default for swap because engine entities
    // are typically positioned with their feet at y=spawn — putting
    // the bottom of the mesh at local y=0 means it stands on the
    // ground rather than half-buried or floating.
    _normalizePositions(positions, opts) {
        const targetSize = opts.targetSize ?? 2.5;
        const anchor     = opts.anchor ?? "floor";
        if (positions.length === 0) return positions;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i], y = positions[i+1], z = positions[i+2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;
        const maxExtent = Math.max(sx, sy, sz);
        if (maxExtent < 1e-6) return positions;  // degenerate
        const scale = targetSize / maxExtent;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const yRef = (anchor === "center") ? (minY + maxY) / 2 : minY;
        const out = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i += 3) {
            out[i]   = (positions[i]   - cx)   * scale;
            out[i+1] = (positions[i+1] - yRef) * scale;
            out[i+2] = (positions[i+2] - cz)   * scale;
        }
        console.log(`[GPUAssetLoader] normalized bbox: was [${sx.toFixed(2)},${sy.toFixed(2)},${sz.toFixed(2)}] → fitted to ${targetSize} (scale ${scale.toFixed(3)})`);
        // v764 — stash the pre-normalize dimensions so cityPack (and any
        // future workaround) can detect "broken" gltf parses where a
        // building's bbox came back flat (.gltf scene graph yielded only
        // a footprint plane instead of full building geometry).
        out._preNormalizeBBox = { sx, sy, sz };
        return out;
    }

    // Per-kind target size resolution. Imported lazily so the loader
    // doesn't have a hard dep on entityVisuals. Returns 2.5 (default)
    // if the module isn't importable.
    _defaultTargetSize(kind) {
        try {
            // Lazy import — the entityVisuals module is part of the
            // render layer, which the loader doesn't normally depend
            // on. Cached after first call.
            if (!this._targetSizeFn) {
                // Synchronous import only works at top level in ES
                // modules. Use a fallback table mirroring entityVisuals
                // for the common kaiju_* and civ_* kinds. Renderer
                // separately calls entityVisuals.targetSizeFor for
                // its own draws, so this fallback only matters at
                // boot before the module reference is wired.
                this._targetSizeFn = (k) => {
                    if (k === "kaiju_sky")   return 4.0;
                    if (k === "kaiju_hell" || k === "kaiju_space") return 3.5;
                    if (k === "kaiju_tech")  return 3.2;
                    if (k === "kaiju_cave" || k === "kaiju_water") return 3.0;
                    if (k === "kaiju_underground") return 2.8;
                    if (k === "civ_step_pyramid")  return 6.0;
                    if (k === "civ_tower")   return 5.5;
                    if (k === "civ_ring_wall" || k === "civ_spire_field") return 5.0;
                    if (k === "civ_plaza")   return 4.0;
                    if (k === "obelisk")     return 1.2;
                    return 2.5;
                };
            }
            return this._targetSizeFn(kind);
        } catch { return 2.5; }
    }

    // Allow main.js to inject the canonical targetSizeFor (from
    // entityVisuals) so the loader matches the renderer exactly.
    setTargetSizeFn(fn) {
        if (typeof fn === "function") this._targetSizeFn = fn;
    }

    // -----------------------------------------------------------------------
    // Round 180 — IndexedDB persistence of swapped meshes. Trellis
    // GLBs are too big for localStorage (1-5MB each, browser cap 5MB);
    // IndexedDB easily handles 80MB+ which is more than enough for
    // 16 kinds × 5MB.
    //
    // Schema: database "voxelengine_meshes", store "swapped",
    // keyed by name. Value: { name, bytes, sourceUrl, normalize, savedAt }.
    //
    // Persistence is fire-and-forget — never blocks the swap. The
    // restore step at boot, however, IS awaited (asynchronously)
    // before primeKnownAssets so the renderer's first frame sees
    // the swapped meshes and renders them without flicker.

    async _openDB() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open("voxelengine_meshes", 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("swapped")) {
                    db.createObjectStore("swapped", { keyPath: "name" });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
        return this._dbPromise;
    }

    async _persistMeshBytes(name, bytes, meta) {
        try {
            const db = await this._openDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction("swapped", "readwrite");
                tx.oncomplete = resolve;
                tx.onerror    = () => reject(tx.error);
                tx.objectStore("swapped").put({
                    name,
                    bytes,
                    sourceUrl: meta?.sourceUrl ?? null,
                    normalize: meta?.normalize ?? null,
                    savedAt:   new Date().toISOString(),
                });
            });
            console.log(`[GPUAssetLoader] persisted swap for "${name}" (${(bytes.byteLength/1024).toFixed(1)} KB)`);
        } catch (e) {
            console.warn(`[GPUAssetLoader] _persistMeshBytes("${name}") failed:`, e.message);
        }
    }

    // List all persisted swaps. Used at boot by restoreSwappedMeshes().
    async _listPersistedSwaps() {
        try {
            const db = await this._openDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction("swapped", "readonly");
                const req = tx.objectStore("swapped").getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror   = () => reject(req.error);
            });
        } catch (e) {
            console.warn("[GPUAssetLoader] _listPersistedSwaps failed:", e.message);
            return [];
        }
    }

    // Public: restore all persisted swap meshes into the cache. Call
    // once at boot, before primeKnownAssets, so the first render
    // frame sees the swapped meshes. Idempotent — safe to call from
    // late boot if needed.
    async restoreSwappedMeshes() {
        const records = await this._listPersistedSwaps();
        if (records.length === 0) {
            return { restored: 0 };
        }
        let ok = 0;
        for (const rec of records) {
            try {
                // v764 — forward the stored sourceUrl as baseUrl so cached
                // multi-file .gltf records can resolve their .bin sidecars
                // on restore (the persistence path stored sourceUrl since
                // round 180; we just weren't passing it through).
                const baseUrl = rec.sourceUrl
                    ? (typeof location !== "undefined" ? new URL(rec.sourceUrl, location.href).href : rec.sourceUrl)
                    : undefined;
                const mesh = await this._loadGLBFromBytes(rec.name, rec.bytes, {
                    normalize: rec.normalize ?? false,
                    baseUrl,
                });
                if (mesh) {
                    this.cache.set(rec.name, mesh);
                    if (this._knownAssets) this._knownAssets.add(rec.name);
                    ok++;
                }
            } catch (e) {
                console.warn(`[GPUAssetLoader] restore("${rec.name}") failed:`, e.message);
            }
        }
        console.log(`[GPUAssetLoader] restored ${ok}/${records.length} persisted swap mesh(es)`);
        return { restored: ok, total: records.length };
    }

    // Public: clear all persisted swaps. Useful for debugging or
    // letting the user reset to factory state.
    async clearPersistedSwaps() {
        try {
            const db = await this._openDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction("swapped", "readwrite");
                tx.oncomplete = resolve;
                tx.onerror    = () => reject(tx.error);
                tx.objectStore("swapped").clear();
            });
            console.log("[GPUAssetLoader] cleared all persisted swap meshes");
            return true;
        } catch (e) {
            console.warn("[GPUAssetLoader] clearPersistedSwaps failed:", e.message);
            return false;
        }
    }
}
