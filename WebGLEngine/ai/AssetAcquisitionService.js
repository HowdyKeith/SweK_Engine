// FILE: /ai/AssetAcquisitionService.js
// ---------------------------------------------------------------------------
// v469 — Shared asset-acquisition service.
//
// The Live Pipeline demo (LivePipelineDemo.js) proved the fallback ladder:
//   obj (floor) → texture → trellis → hitem3d
// where the OBJ is the guaranteed result and the 3D rungs upgrade it in place
// when they succeed. But that ladder only ran for the *demo's* hand-picked
// targets. Meanwhile the engine's own managers — KaijuManager, TreeSpawner,
// CivilizationManager — spawn entities by `kind` (kaiju_hell, tree_oak, …) and
// just expect a mesh to exist. For kinds that aren't on disk (/assets/list),
// GPUAssetLoader.loadAsset() negative-caches null and the entity renders
// nothing. That's why trees were invisible.
//
// This service is the missing front door: a single, deduplicated,
// concurrency-limited place that ANY caller (a manager, a demo, the loader's
// give-up hook) can ask "get me a mesh for this kind" — and it runs the SAME
// ladder, installing the OBJ first so the entity shows up immediately, then
// upgrading to a 3D mesh later if ComfyUI is reachable.
//
// Design notes:
//   - Dedup by kind: one acquisition per kind per session (inflight + done).
//   - Concurrency cap so 60 trees don't fire 60 simultaneous Ollama calls.
//   - The OBJ rung is local (Ollama) so it works with ComfyUI offline.
//   - 3D rungs (trellis/hitem3d) share a COOLDOWN: after a few failures the
//     service stops attempting 3D for a while (default 5 min) and serves
//     OBJ-only, then re-probes. Keeps it from hammering a dead ComfyUI while
//     still recovering automatically when the user brings it online.
//   - Reuses PipelineManager (retries/optional) + ComfyUIClient.runTrellis /
//     runHitem3d — the exact primitives the demo uses.
// ---------------------------------------------------------------------------

import { PipelineManager }       from "./PipelineManager.js";
import { OllamaClient }          from "./OllamaClient.js";
import { OllamaDiffuserClient }  from "./OllamaDiffuserClient.js";
import { ComfyUIClient }         from "./ComfyUIClient.js";
import { materialSetFromDataUrl } from "./MaterialSet.js";
import { materialSets }          from "./MaterialSetRegistry.js";
import { analyzeMesh, gradeQc }  from "../engine/meshQcAnalyzer.js";   // v1989 (item 7) — QC gate
import { failedOBJStore }        from "./FailedOBJStore.js";           // v1989 (item 5) — failed-prompt capture

export class AssetAcquisitionService {
    constructor(opts = {}) {
        this._ollama   = opts.ollama   || new OllamaClient();
        this._diffuser = opts.diffuser || new OllamaDiffuserClient();
        this._comfyui  = opts.comfyui  || new ComfyUIClient();

        this._inflight = new Map();   // kind -> Promise (in progress)
        this._done     = new Set();   // kinds acquired this session
        this._queue    = [];          // [{ kind, prompt, resolve }]
        this._active   = 0;
        this._maxConcurrent = Math.max(1, opts.maxConcurrent ?? 2);

        // v1989 (item 2) — per-rung breakers replace the shared 3D cooldown (kept thresholds).
        this._breakers       = {};
        this._max3dFails     = Math.max(1, opts.max3dFails ?? 4);
        this._cooldownMs     = opts.cooldownMs ?? 5 * 60 * 1000;
        // v1989 (item 5) — persistent per-kind ledger: which rung each kind reached ("obj"|"3d"),
        // so a later session upgrades instead of regenerating (or re-attempting a done 3D mesh).
        this._ledger = {};
        try { this._ledger = JSON.parse(localStorage.getItem("voxelengine.acquireLedger") || "{}") || {}; } catch {}
        // v1989 (item 8) — per-stage/per-model timing + success stats, persisted. Used to order
        // the 3D rungs by expected value and to surface model recommendations.
        this._stats = {};
        try { this._stats = JSON.parse(localStorage.getItem("voxelengine.pipelineStats") || "{}") || {}; } catch {}
        // v1989 (item 6) — peer ComfyUI bases discovered via the bridge (/comfy/peers), refreshed lazily.
        this._peerComfy = { at: 0, clients: [] };

        this.enabled = opts.enabled !== false;   // master switch
        // Which kinds the loader's give-up hook is allowed to auto-acquire.
        // Explicit request() calls bypass this — it only gates requestAuto().
        this._autoPattern = opts.autoPattern ||
            /^(kaiju|tree|creature|monster|alien|civ|beast|critter|npc|enemy|boss|hellspawn)[_-]/i;

        this.onStatus = opts.onStatus || null;    // optional UI callback

        // v641 — Kaggle rung pending map (slug -> kind). When the kaggle rung
        // submits a Hunyuan3D job it stores the slug here, persisted to
        // localStorage so a page reload doesn't lose track of inflight jobs.
        // The reconciler below catches completions, downloads the GLB, and
        // calls assetLoader.swapMesh — the asset upgrades in place.
        this._kagglePending = new Map();
        try {
            const raw = JSON.parse(localStorage.getItem("voxelengine.kagglePending") || "{}");
            for (const [slug, kind] of Object.entries(raw)) this._kagglePending.set(slug, kind);
            if (this._kagglePending.size) console.log(`[acquire] resuming ${this._kagglePending.size} pending Kaggle job(s) from localStorage`);
        } catch {}
        this._reconcileTimer = setInterval(() => this._reconcileKaggle(), 90_000);
        setTimeout(() => this._reconcileKaggle(), 8_000);
    }

    _saveKagglePending() {
        try {
            const obj = {};
            for (const [s, k] of this._kagglePending) obj[s] = k;
            localStorage.setItem("voxelengine.kagglePending", JSON.stringify(obj));
        } catch {}
    }

    // v641 — Kaggle rung reconciler. Every 90s (and at boot if there are
    // resumed pending jobs), poll /kaggle/jobs and look for slugs we've
    // submitted. On 'complete', download the output and swap the mesh in
    // place. On 'error', drop the pending entry — the local rungs already
    // ran (and presumably failed too), so the asset stays with whatever
    // it has and the user can retry manually.
    async _reconcileKaggle() {
        if (!this._kagglePending.size) return;
        try {
            const r = await fetch("/kaggle/jobs", { cache: "no-store" });
            if (!r.ok) return;
            const data = await r.json();
            const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
            for (const j of jobs) {
                if (!this._kagglePending.has(j.slug)) continue;
                const kind = this._kagglePending.get(j.slug);
                const phase = String(j.lastStatus || "").toLowerCase();
                if (phase === "complete") {
                    try {
                        const dr = await fetch("/kaggle/download", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ slug: j.slug }),
                        });
                        const dj = await dr.json();
                        // Pick the first GLB-ish file in the returned output list.
                        const files = Array.isArray(dj?.files) ? dj.files : [];
                        const glbFile = files.find(f => /\.glb$/i.test(String(f)));
                        if (glbFile) {
                            const url = "/GPU_Assets/" + String(glbFile).replace(/^\/+/, "");
                            try {
                                await assetLoader.swapMesh(kind, url);
                                console.log(`[acquire] Kaggle→${kind} mesh swapped from ${url} (slug=${j.slug})`);
                                try { if (typeof window !== "undefined" && window._kpAnnounceAssetLoaded) window._kpAnnounceAssetLoaded(kind + " (kaggle)"); } catch {}
                            } catch (e) {
                                console.warn(`[acquire] Kaggle swapMesh failed for ${kind}:`, e?.message);
                            }
                        } else {
                            console.warn(`[acquire] Kaggle job ${j.slug} complete but no GLB in output (got ${files.length} file(s)): ${files.join(", ")}`);
                        }
                    } catch (e) { console.warn(`[acquire] Kaggle download failed for ${kind}:`, e?.message); }
                    this._kagglePending.delete(j.slug);
                    this._saveKagglePending();
                } else if (phase === "error" || phase === "cancelled") {
                    console.warn(`[acquire] Kaggle job ${j.slug} ended with ${phase} — dropping pending for ${kind}`);
                    this._kagglePending.delete(j.slug);
                    this._saveKagglePending();
                }
            }
        } catch (e) { /* bridge unreachable — try again next tick */ }
    }

    // Does a usable mesh already exist for this kind?
    has(kind) {
        try {
            const c = window.assetLoader?.cache;
            return !!(c && c.has(kind) && c.get(kind));   // null in cache = negative, not "have"
        } catch { return false; }
    }

    // Auto path used by the loader's give-up hook: only proceeds for kinds
    // matching the auto-acquire pattern, so built-in/system kinds (obelisk,
    // wad_plate, stage_floor, …) are never AI-generated by accident.
    requestAuto(kind, opts = {}) {
        if (!kind || !this._autoPattern.test(kind)) return null;
        return this.request(kind, opts);
    }

    // Explicit request. Returns a promise that settles when the kind has at
    // least an OBJ (or was already present / couldn't be made). Safe to call
    // repeatedly and from many entities — it dedupes.
    // v1989 — opts.priority (higher runs first; e.g. distance-based or 10 for "on screen now"),
    // opts.isAlive (() => bool — checked between rungs; a despawned entity stops its job),
    // and the ledger: a kind recorded as "3d" is done; a kind recorded as "obj" whose mesh is
    // already present skips OBJ regeneration and runs the UPGRADE rungs only.
    request(kind, opts = {}) {
        if (!this.enabled)            return Promise.resolve({ kind, skipped: "service disabled" });
        if (!kind)                    return Promise.resolve({ kind, skipped: "no kind" });
        const led = this._ledgerGet(kind);
        if (led?.rung === "3d" && this.has(kind)) return Promise.resolve({ kind, already: true, rung: "3d" });
        if (this.has(kind) && !led)               return Promise.resolve({ kind, already: true });
        if (this._done.has(kind))                 return Promise.resolve({ kind, already: true });
        if (this._inflight.has(kind)) return this._inflight.get(kind);

        let resolveFn;
        const p = new Promise((resolve) => { resolveFn = resolve; });
        this._inflight.set(kind, p);
        const task = {
            kind,
            prompt: opts.prompt || this._defaultPrompt(kind),
            resolve: resolveFn,
            priority: +opts.priority || 0,
            isAlive: (typeof opts.isAlive === "function") ? opts.isAlive : null,
            upgradeOnly: !!(led?.rung === "obj" && this.has(kind)),   // mesh exists — only run texture+3D
            image: opts.image || null,                                 // v1989 (item 9) — image-first path
            cancelled: false,
            pm: null,
        };
        // priority insert (stable: equal priorities keep FIFO order)
        let at = this._queue.length;
        while (at > 0 && (this._queue[at - 1].priority || 0) < task.priority) at--;
        this._queue.splice(at, 0, task);
        this._emit();
        this._pump();
        return p;
    }

    // v1989 (item 4) — cancel a pending or running acquisition (e.g. the entity despawned).
    cancel(kind) {
        const qi = this._queue.findIndex(t => t.kind === kind);
        if (qi >= 0) {
            const [t] = this._queue.splice(qi, 1);
            this._inflight.delete(kind);
            t.resolve({ kind, cancelled: true });
            this._emit();
            return true;
        }
        for (const t of this._running || []) {
            if (t.kind === kind) { t.cancelled = true; try { t.pm && t.pm.cancel(`acq:${kind}`); } catch {} return true; }
        }
        return false;
    }
    // Bump a queued kind's priority (e.g. it just came on screen).
    prioritize(kind, priority = 10) {
        const qi = this._queue.findIndex(t => t.kind === kind);
        if (qi < 0) return false;
        const [t] = this._queue.splice(qi, 1);
        t.priority = priority;
        let at = this._queue.length;
        while (at > 0 && (this._queue[at - 1].priority || 0) < t.priority) at--;
        this._queue.splice(at, 0, t);
        return true;
    }

    _pump() {
        this._running = this._running || [];
        while (this._active < this._maxConcurrent && this._queue.length > 0) {
            const task = this._queue.shift();
            this._active++;
            this._running.push(task);
            this._runOne(task).finally(() => {
                this._active--;
                this._inflight.delete(task.kind);
                const ri = this._running.indexOf(task); if (ri >= 0) this._running.splice(ri, 1);
                this._emit();
                this._pump();
            });
        }
    }

    // v1989 (item 9) — image-first acquisition: skip OBJ+texture, run the 3D rungs directly from a
    // provided image (camera snapshot, uploaded photo). The mesh lands via the same swapMesh path.
    requestFromImage(kind, dataUrl, opts = {}) {
        if (!dataUrl) return Promise.resolve({ kind, skipped: "no image" });
        return this.request(kind, { ...opts, image: { dataUrl }, priority: opts.priority ?? 5 });
    }

    async _runOne(task) {
        const { kind, prompt, resolve } = task;
        const assetLoader = window.assetLoader;
        if (!assetLoader) { resolve({ kind, error: "no assetLoader" }); return; }
        if (task.cancelled) { resolve({ kind, cancelled: true }); return; }
        if (task.isAlive && !task.isAlive()) { resolve({ kind, cancelled: "entity gone" }); return; }

        const objModel = (typeof localStorage !== "undefined" && localStorage.getItem("voxelengine.ollamaObjModel")) || "joshuaokolo/C3Dv0:latest";
        const pm = new PipelineManager({ stages: this._buildStages(assetLoader, task) });
        task.pm = pm;
        pm.submit({ id: `acq:${kind}`, kind, input: { kind, prompt, task } });

        let job;
        try {
            [job] = await pm.run();
        } catch (e) {
            resolve({ kind, error: e?.message || String(e) });
            return;
        }
        this._done.add(kind);
        const mesh3d = !!(job.results?.trellis || job.results?.hitem3d);
        const gotObj = !!job.results?.obj || task.upgradeOnly || !!task.image;
        this._recordJobStats(job, objModel);                                   // v1989 (item 8)
        if (mesh3d) this._ledgerSet(kind, "3d"); else if (gotObj) this._ledgerSet(kind, "obj");   // v1989 (item 5)
        console.log(`[acquire] "${kind}" — ${gotObj ? (mesh3d ? "3D mesh installed" : "OBJ installed (3D pending)") : "FAILED (no OBJ)"}`);
        resolve({ kind, status: job.status, obj: gotObj, mesh3d });
    }

    // v1989 — legacy shims (status()/resume3D callers): "3D enabled" now means "any 3D rung enabled".
    _3dEnabled() { return this._rungEnabled("trellis") || this._rungEnabled("hitem3d") || this._rungEnabled("kaggle"); }

    // ---- v1989 (item 5) ledger ----
    _ledgerGet(kind) { return this._ledger[kind] || null; }
    _ledgerSet(kind, rung) {
        this._ledger[kind] = { rung, at: Date.now() };
        try { localStorage.setItem("voxelengine.acquireLedger", JSON.stringify(this._ledger)); } catch {}
    }
    // ---- v1989 (item 8) stats ----
    _statKey(stage, model) { return stage + (model ? ("|" + model) : ""); }
    _recordStat(stage, model, ok, ms) {
        const k = this._statKey(stage, model);
        const s = (this._stats[k] = this._stats[k] || { n: 0, ok: 0, totalMs: 0 });
        s.n++; if (ok) { s.ok++; s.totalMs += (ms || 0); }
        try { localStorage.setItem("voxelengine.pipelineStats", JSON.stringify(this._stats)); } catch {}
    }
    _recordJobStats(job, objModel) {
        try {
            for (const [stage, t] of Object.entries(job.timings || {})) {
                if (t?.ms == null) continue;
                this._recordStat(stage, stage === "obj" ? objModel : null, !job.errors?.[stage] && job.results?.[stage] != null, t.ms);
            }
        } catch {}
    }
    // Expected value of a 3D rung: successRate / avgSuccessMs (higher = try first). Unknown rungs
    // get a neutral prior so they still get tried.
    _rungScore(name) {
        const s = this._stats[this._statKey(name, null)];
        if (!s || s.n < 3) return 1e-4;                     // prior: neutral until we have data
        const rate = s.ok / s.n, avg = s.ok ? (s.totalMs / s.ok) : 20 * 60 * 1000;
        return rate <= 0 ? 1e-9 : rate / avg;
    }
    stats() { return JSON.parse(JSON.stringify(this._stats)); }

    // ---- v1989 (item 6) peer ComfyUI discovery — clients pointed at the bridge's /comfy/via proxy ----
    async _comfyClients() {
        const now = Date.now();
        if (now - this._peerComfy.at < 60_000) return [this._comfyui, ...this._peerComfy.clients];
        this._peerComfy.at = now;
        try {
            const r = await fetch("/comfy/peers", { cache: "no-store" });
            if (r.ok) {
                const j = await r.json();
                const hosts = Array.isArray(j?.peers) ? j.peers : [];
                const Ctor = this._comfyui.constructor;
                this._peerComfy.clients = hosts.map(h => {
                    const c = new Ctor({ baseUrl: "/comfy/via/" + encodeURIComponent(h.host) });
                    c._peerName = h.name || h.host;
                    return c;
                });
                if (hosts.length) console.log(`[acquire] ${hosts.length} peer ComfyUI instance(s) available: ${hosts.map(h => h.name || h.host).join(", ")}`);
            }
        } catch {}
        return [this._comfyui, ...this._peerComfy.clients];
    }
    // Probe local first, then peers; return the first reachable client (or null).
    async _reachableComfy() {
        for (const c of await this._comfyClients()) {
            try { if (await c.probe()) return c; } catch {}
        }
        return null;
    }

    _albedo(job) {
        const t = job.results?.texture;
        return (t && typeof t === "object" && t.albedo?.dataUrl) || (t && t.dataUrl) || null;
    }

    // v1989 (item 1) — OBJ→PNG fallback: when the diffuser is down and there's no albedo, render
    // the ALREADY-INSTALLED OBJ to a 512px snapshot and feed that to the 3D rungs instead. This
    // unblocks the whole "texture failed → no albedo → every 3D rung dies" cascade (Round 166's
    // parked TODO). Pure-2D software render (parse v/f, rotate, painter-sort, lambert-fill) — no
    // WebGL context needed, works in any tab.
    _objSnapshot(job) {
        try {
            const objText = job.results?.obj;
            if (typeof objText !== "string" || !objText) return null;
            if (job._objSnapshotCache) return job._objSnapshotCache;
            const V = [], F = [];
            for (const line of objText.split(/\r?\n/)) {
                if (line[0] === "v" && line[1] === " ") {
                    const p = line.slice(2).trim().split(/\s+/).map(Number);
                    if (p.length >= 3 && p.every(Number.isFinite)) V.push(p);
                } else if (line[0] === "f" && line[1] === " ") {
                    const idx = line.slice(2).trim().split(/\s+/).map(t => parseInt(t.split("/")[0], 10)).filter(Number.isFinite).map(i => (i > 0 ? i - 1 : V.length + i));
                    for (let k = 2; k < idx.length; k++) F.push([idx[0], idx[k - 1], idx[k]]);   // fan-triangulate
                }
            }
            if (!V.length || !F.length) return null;
            // normalize to unit box, rotate for a 3/4 view
            let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
            for (const v of V) for (let a = 0; a < 3; a++) { if (v[a] < mn[a]) mn[a] = v[a]; if (v[a] > mx[a]) mx[a] = v[a]; }
            const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
            const s = 2 / Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1e-6);
            const ry = Math.PI / 5, rx = -Math.PI / 10, cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
            const P = V.map(v => {
                let x = (v[0] - c[0]) * s, y = (v[1] - c[1]) * s, z = (v[2] - c[2]) * s;
                let x2 = x * cy + z * sy, z2 = -x * sy + z * cy;             // yaw
                let y2 = y * cx - z2 * sx, z3 = y * sx + z2 * cx;            // pitch
                return [x2, y2, z3];
            });
            const SZ = 512, cvs = (typeof document !== "undefined") ? document.createElement("canvas") : null;
            if (!cvs) return null;
            cvs.width = cvs.height = SZ;
            const g = cvs.getContext("2d");
            g.fillStyle = "#ffffff"; g.fillRect(0, 0, SZ, SZ);               // white bg — friendliest for image-to-3D bg removal
            const px = (p) => [SZ / 2 + p[0] * SZ * 0.42, SZ / 2 - p[1] * SZ * 0.42];
            const L = [0.45, 0.65, 0.61];                                     // light dir (normalized-ish)
            const tris = F.map(f => {
                const a = P[f[0]], b = P[f[1]], d = P[f[2]];
                if (!a || !b || !d) return null;
                const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
                let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
                const lam = Math.max(0.18, Math.abs(nx * L[0] + ny * L[1] + nz * L[2]));
                return { z: (a[2] + b[2] + d[2]) / 3, a: px(a), b: px(b), c: px(d), lam };
            }).filter(Boolean).sort((t1, t2) => t1.z - t2.z);                // painter's algorithm, back→front
            for (const t of tris) {
                const v = Math.round(70 + t.lam * 160);
                g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 12)})`;
                g.beginPath(); g.moveTo(t.a[0], t.a[1]); g.lineTo(t.b[0], t.b[1]); g.lineTo(t.c[0], t.c[1]); g.closePath(); g.fill();
            }
            const out = { dataUrl: cvs.toDataURL("image/png"), synthetic: true };
            job._objSnapshotCache = out;
            console.log(`[acquire] ${job.input.kind}: no diffuser albedo — using OBJ→PNG snapshot (${tris.length} tris) for the 3D rungs`);
            return out;
        } catch (e) { return null; }
    }
    // Albedo for the 3D rungs: real texture first, OBJ snapshot as the fallback.
    _albedoOrSnapshot(job) { return this._albedo(job) || this._objSnapshot(job); }

    // v1989 (item 2) — per-rung circuit breakers, replacing the single shared _3dFails counter
    // (four Trellis failures used to pause HiTem3D and Kaggle too). Failure classes matter:
    //   infra  (unreachable / timeout)    → counts toward the breaker;
    //   node   ("node not found")         → cached separately for 10 min (it won't appear
    //                                       mid-session; no point re-scanning object_info per job);
    //   job    (this prompt/image failed) → does NOT trip anything global.
    _brk(rung) { return (this._breakers[rung] = this._breakers[rung] || { fails: 0, until: 0, nodeMissingUntil: 0 }); }
    _rungEnabled(rung) {
        const b = this._brk(rung);
        if (b.until && Date.now() >= b.until) { b.until = 0; b.fails = 0; }   // cooldown elapsed — re-probe
        return !b.until;
    }
    _nodeMissing(rung, set) {
        const b = this._brk(rung);
        if (set) b.nodeMissingUntil = Date.now() + 10 * 60 * 1000;
        return b.nodeMissingUntil > Date.now();
    }
    _noteRungFail(rung, cls) {
        const b = this._brk(rung);
        if (cls === "node") { this._nodeMissing(rung, true); return; }
        if (cls !== "infra") return;                                          // per-prompt failures don't trip the breaker
        b.fails++;
        if (b.fails >= this._max3dFails && !b.until) {
            b.until = Date.now() + this._cooldownMs;
            console.warn(`[acquire] ${rung} paused ${Math.round(this._cooldownMs / 60000)}min after ${b.fails} infrastructure failures — other rungs unaffected.`);
            this._emit();
        }
    }
    _noteRungOk(rung) { const b = this._brk(rung); b.fails = 0; b.until = 0; }
    _classifyErr(e) {
        const m = String(e?.message || e || "").toLowerCase();
        if (/node not found/.test(m)) return "node";
        if (/unreachable|timeout|timed out|abort|network|fetch failed|econn/.test(m)) return "infra";
        return "job";
    }

    // v1989 (item 7) — minimal OBJ parse to typed arrays for the QC analyzer.
    _parseObjArrays(objText) {
        const pos = [], idx = [];
        for (const line of String(objText).split(/\r?\n/)) {
            if (line[0] === "v" && line[1] === " ") {
                const p = line.slice(2).trim().split(/\s+/).map(Number);
                if (p.length >= 3) pos.push(p[0] || 0, p[1] || 0, p[2] || 0);
            } else if (line[0] === "f" && line[1] === " ") {
                const f = line.slice(2).trim().split(/\s+/).map(t => parseInt(t.split("/")[0], 10)).filter(Number.isFinite).map(i => (i > 0 ? i - 1 : (pos.length / 3) + i));
                for (let k = 2; k < f.length; k++) idx.push(f[0], f[k - 1], f[k]);
            }
        }
        return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
    }

    // The ladder — same shape as LivePipelineDemo, minus the narrative rung
    // (managers want geometry, not flavor text). v1989: per-rung breakers, QC gate
    // inside the obj rung, upgrade-only / image-first task modes, OBJ-snapshot albedo
    // fallback, peer ComfyUI failover, and stats-ordered 3D rungs.
    _buildStages(assetLoader, task) {
        const self = this;
        const objModel       = (typeof localStorage !== "undefined" && localStorage.getItem("voxelengine.ollamaObjModel")) || "joshuaokolo/C3Dv0:latest";
        const idleTimeoutMs  = 90 * 1000;
        const totalTimeoutMs = 6 * 60 * 1000;
        // between-rung gate: cancellation + entity liveness
        const gate = () => {
            if (task?.cancelled) throw new Error("cancelled");
            if (task?.isAlive && !task.isAlive()) throw new Error("cancelled: entity gone");
        };

        const objStage = {
            name: "obj", concurrency: 1, retries: 2, timeoutMs: totalTimeoutMs + 30_000,   // the floor — local, works offline
            run: async (job) => {
                gate();
                const obj = await self._ollama.generateOBJ(job.input.prompt, {
                    model: objModel, idleTimeoutMs, timeoutMs: totalTimeoutMs,
                });
                if (!obj) throw new Error("no OBJ returned");
                // v1989 (item 7) — QC gate BEFORE install: reject degenerate/empty geometry so
                // garbage never lands in the scene, and each rejection consumes a retry attempt
                // (the retry re-rolls the generation). Rejected outputs are captured to
                // FailedOBJStore for parser/prompt forensics.
                try {
                    const { positions, indices } = self._parseObjArrays(obj);
                    const qc = await analyzeMesh(positions, indices);
                    const g = gradeQc(qc);
                    if (g.grade === "bad") {
                        try { failedOBJStore.capture({ source: "acquire-qc", model: objModel, prompt: job.input.prompt, rawText: obj.slice(0, 20000), reason: "QC: " + g.reasons.join(", ") }); } catch {}
                        throw new Error("QC rejected OBJ: " + g.reasons.join(", "));
                    }
                    job.qc = { grade: g.grade, reasons: g.reasons, triCount: qc.triCount };
                } catch (e) {
                    if (/QC rejected/.test(String(e?.message))) throw e;
                    // analyzer itself failed (worker unavailable etc.) — don't block install
                }
                const mesh = await assetLoader.installOBJText(job.input.kind, obj);
                if (!mesh) throw new Error("OBJ install failed");
                return obj;
            },
        };
        const textureStage = {
            name: "texture", concurrency: 1, optional: true, retries: 1, timeoutMs: 3 * 60 * 1000,
            run: async (job) => {
                gate();
                const res = await self._diffuser.generate(
                    self._texturePrompt(job.input.prompt, job.input.kind),
                    { width: 512, height: 512, steps: 20 }
                );
                if (!res.ok) throw new Error(res.error || "diffuser failed");
                let matSet;
                try {
                    matSet = await materialSetFromDataUrl(res.dataUrl, {
                        height: { contrast: 1.8, bias: 96, center: 128 },
                        normal: { strength: 2.5 },
                    });
                } catch { matSet = { dataUrl: res.dataUrl, partial: true }; }
                try { materialSets.register(job.input.kind, matSet); } catch {}
                return matSet;
            },
        };
        // shared body for the two ComfyUI rungs — differs only in node lookup + runner.
        const comfyRung = (name, findNode, runNode) => ({
            name, concurrency: 1, optional: true, timeoutMs: 21 * 60 * 1000,
            run: async (job) => {
                gate();
                if (typeof window !== "undefined" && window.aiModels && !window.aiModels.isEnabled(name)) throw new Error(`${name} disabled in AI Models settings — skipping`);
                if (job.results.trellis || job.results.hitem3d) return job.results.trellis || job.results.hitem3d;   // already upgraded
                if (!self._rungEnabled(name)) throw new Error(`${name} on cooldown — OBJ fallback`);
                if (self._nodeMissing(name)) throw new Error(`${name} node not found (cached) — will re-check in a few minutes`);
                try {
                    // v1989 (item 1) — real albedo first, OBJ→PNG snapshot fallback; image-first
                    // tasks (item 9) use the provided photo directly.
                    const albedo = (task?.image) || self._albedoOrSnapshot(job);
                    if (!albedo || !albedo.dataUrl) throw new Error(`no albedo for ${name} (texture failed AND no OBJ to snapshot)`);
                    // v1989 (item 6) — local ComfyUI first, then peer instances via the bridge proxy.
                    const client = await self._reachableComfy();
                    if (!client) throw new Error("ComfyUI unreachable (local + peers)");
                    const info = await findNode(client);
                    if (!info) { self._noteRungFail(name, "node"); throw new Error(`${name} node not found`); }
                    const glb = await runNode(client, albedo.dataUrl ? albedo : { dataUrl: albedo }, info);
                    if (!glb?.url) throw new Error(`${name} returned no GLB`);
                    try { await assetLoader.swapMesh(job.input.kind, glb.url); } catch (e) {
                        console.warn(`[acquire] ${name} swapMesh failed for ${job.input.kind}: ${e?.message}`);
                    }
                    self._noteRungOk(name);
                    if (client._peerName) console.log(`[acquire] ${job.input.kind}: 3D mesh generated on peer "${client._peerName}"`);
                    return glb;
                } catch (e) { self._noteRungFail(name, self._classifyErr(e)); throw e; }
            },
        });
        const trellisStage = comfyRung("trellis",
            (c) => c.findTrellisNode(),
            (c, albedo, info) => c.runTrellis(albedo.dataUrl || albedo, info, { timeoutMs: 20 * 60 * 1000 }));
        const hitemStage = comfyRung("hitem3d",
            (c) => c.findHitem3dNode(),
            (c, albedo, info) => c.runHitem3d(albedo.dataUrl || albedo, info, { timeoutMs: 20 * 60 * 1000 }));
        // v1989 (item 8) — order the two local 3D rungs by observed expected value
        // (successRate / avgMs); ties/no-data keep the historical trellis-first order.
        const threeD = (self._rungScore("hitem3d") > self._rungScore("trellis") * 1.15)
            ? [hitemStage, trellisStage] : [trellisStage, hitemStage];

        const stages = [];
        if (!task?.upgradeOnly && !task?.image) stages.push(objStage);         // image-first + upgrade skip the OBJ floor
        if (!task?.image) stages.push(textureStage);                            // a real photo IS the albedo
        stages.push(...threeD);
        stages.push(...this._kaggleStage(task));
        return stages;
    }

    _kaggleStage(task) {
        const self = this;
        return [
            // If neither local rung produced a mesh (disabled, no node, or
            // cooldown), and Kaggle is enabled + configured, submit a Hunyuan3D
            // job to Kaggle and return a 'pending' marker. The reconciler
            // (constructor) catches the completion and swaps the mesh in.
            // Concurrency 1 so we don't batch-submit a dozen jobs by accident.
            //
            // Round 166 (v661) — sharpened error messages. The kaggle column
            // is BLOCKED downstream by texture stage failure: it needs an
            // albedo (input image) for Hunyuan3D. When the user's local
            // OllamaDiffuser is down (port 9000 unreachable), texture fails,
            // no albedo exists, and kaggle throws too. The new error strings
            // surface that cascade through the pipeline HUD tooltip so the
            // user can see exactly which dependency broke. Eventual fix is
            // an OBJ-render-to-PNG fallback that bypasses texture stage —
            // that's a bigger lift, parked for a future round.
            {
                name: "kaggle", concurrency: 1, optional: true,
                run: async (job) => {
                    if (task?.cancelled || (task?.isAlive && !task.isAlive())) throw new Error("cancelled");
                    if (typeof window !== "undefined" && window.aiModels && !window.aiModels.isEnabled("kaggle")) {
                        throw new Error("Kaggle disabled in AI Models settings (SETTINGS → AI / Background → Kaggle Hunyuan3D)");
                    }
                    if (job.results.trellis || job.results.hitem3d) {
                        // Already have a 3D mesh from a local rung — Kaggle is
                        // the fallback, not a double-spend. Return the existing.
                        return job.results.trellis || job.results.hitem3d;
                    }
                    if (!self._rungEnabled("kaggle")) throw new Error("kaggle on cooldown");
                    // v1989 (items 1+9) — real albedo, else provided image, else OBJ→PNG snapshot.
                    // The Round 166 "blocked: texture stage failed" cascade is gone: as long as the
                    // OBJ floor exists, Kaggle always has an input image.
                    const albedo = (task?.image) || self._albedoOrSnapshot(job);
                    if (!albedo || !albedo.dataUrl) {
                        throw new Error("no albedo for Kaggle submit — texture failed AND no OBJ available to snapshot");
                    }
                    // Don't submit if we already have a pending Kaggle job for this kind.
                    for (const [, k] of self._kagglePending) {
                        if (k === job.input.kind) throw new Error(`already a pending Kaggle job for ${job.input.kind} — waiting on it`);
                    }
                    const b64 = String(albedo.dataUrl).replace(/^data:[^;]+;base64,/, "");
                    let sr;
                    try {
                        sr = await fetch("/kaggle/submit", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                template: "hunyuan3d",
                                params: { imageBase64: b64, removeBackground: true, withTexture: true, seed: 42 },
                            }),
                        });
                    } catch (netErr) {
                        throw new Error(`Kaggle bridge unreachable at /kaggle/submit (${netErr?.message || netErr}) — is the Node ai-bridge running?`);
                    }
                    let sj = null;
                    try { sj = await sr.json(); } catch {}
                    if (!sr.ok || !sj || sj.error || !sj.slug) {
                        const detail = sj?.error || sr.statusText || `HTTP ${sr.status}`;
                        // Common errors get specific guidance
                        let hint = "";
                        if (/credential|token|auth/i.test(detail)) hint = " (set KAGGLE_USERNAME + KAGGLE_KEY in the bridge env, or kaggle.json in ~/.kaggle/)";
                        else if (/python/i.test(detail))            hint = " (install Python + `pip install kaggle` so the bridge can spawn `python -m kaggle`)";
                        else if (/template/i.test(detail))          hint = " (check ai-bridge/kaggle_templates/ has hunyuan3d.js)";
                        throw new Error(`Kaggle submit failed: ${detail}${hint}`);
                    }
                    self._kagglePending.set(sj.slug, job.input.kind);
                    self._saveKagglePending();
                    console.log(`[acquire] Kaggle Hunyuan3D submitted for ${job.input.kind}: ${sj.slug} — reconciler will swap when complete (~15–45 min)`);
                    // Return a 'pending' marker — the rung succeeds immediately so
                    // the AAS pipeline can move on. The mesh upgrade lands later.
                    return { pending: true, slug: sj.slug, kind: job.input.kind };
                },
            },
        ];
    }

    _texturePrompt(prompt, kind) {
        return `${prompt}, ${kind.replace(/[_-]/g, " ")}, game asset albedo texture, PBR, neutral even lighting, no shadows`;
    }
    _defaultPrompt(kind) {
        return kind.replace(/[_-]/g, " ").trim();
    }

    _emit() { if (this.onStatus) { try { this.onStatus(this.status()); } catch {} } }

    status() {
        const brk = {};
        for (const r of ["trellis", "hitem3d", "kaggle"]) {
            const b = this._brk(r);
            brk[r] = { fails: b.fails, cooldownLeftMs: b.until ? Math.max(0, b.until - Date.now()) : 0, nodeMissing: this._nodeMissing(r) };
        }
        return {
            enabled:       this.enabled,
            inflight:      [...this._inflight.keys()],
            queued:        this._queue.length,
            active:        this._active,
            done:          this._done.size,
            threeDEnabled: this._3dEnabled(),
            breakers:      brk,                                    // v1989 — per-rung breaker state
            ledgerKinds:   Object.keys(this._ledger).length,       // v1989 — persisted rung ledger size
            peerComfy:     this._peerComfy.clients.length,         // v1989 — usable peer ComfyUI count
            // v641 — Kaggle pending: how many cloud jobs are out, waiting for results.
            kagglePending: this._kagglePending.size,
            kaggleWaiting: [...this._kagglePending.values()],   // list of kinds awaiting cloud mesh
        };
    }

    // Console helper: forget a kind so it can be re-acquired (e.g. after
    // installing ComfyUI, to force a 3D upgrade attempt).
    forget(kind) {
        this._done.delete(kind);
        delete this._ledger[kind];   // v1989 — also drop the persisted rung record
        try { localStorage.setItem("voxelengine.acquireLedger", JSON.stringify(this._ledger)); } catch {}
        try { window.assetLoader?.resetForRetry?.(kind); } catch {}
    }
    // Console helper: clear all 3D cooldowns immediately.
    resume3D() { this._breakers = {}; this._emit(); }
}
