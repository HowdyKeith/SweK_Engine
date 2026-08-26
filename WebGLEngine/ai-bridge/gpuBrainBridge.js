// ai-bridge/gpuBrainBridge.js -- v2064: the GPU Brain joins the SweK
// Engine's own bridge. This module is the ENTIRE brain-bridge surface,
// ported VERBATIM from the standalone GPUBrain bundle (v76) as one
// contiguous span (its lines 5486-6943) plus the gpuBrain mailbox
// state block -- no logic was rewritten in transit, so the 76 phases
// of behavior notes still describe exactly this code.
//
// Owned prefixes: /ai/brain/*  and  /ev  (the Escape Velocity page and
// its whole experiment stack ride inside the span).
//
// The engine's server.js delegates with ONE block (search "v2064"):
//   if (gpuBrainBridge.owns(req.url))
//       { gpuBrainBridge.handle(req, res, ctx); return; }
// ctx injects the five engine facilities the span leans on:
//   sendJson, SYS_LOG, sysLogPush, _ollamaBase, _ollamaModelName.
"use strict";
const fs = require("fs");

// v2964 -- THE ACTIVITY TAIL. The brain has always emitted plenty -- hellos, solves, narrations, snapshots --
// but nothing RETAINED a human-readable trace of it, so panel-brain.html could only show an animated SVG and
// the words "idle" or "solving". Everything the operator might actually want to read was computed and discarded.
//
// This is a bounded ring, the same shape the other bridges use for logTail. It records WHAT HAPPENED with a
// timestamp; it does not interpret, score, or summarise -- the panel decides how to display it and the reader
// decides what it means. Bounded because an unbounded log on a long-running hub is a memory leak with a nice name.
const _activity = [];
const ACTIVITY_KEEP = 300;
function note(kind, text, extra) {
    try {
        _activity.push({ at: Date.now(), kind, text: String(text).slice(0, 400), ...(extra || {}) });
        if (_activity.length > ACTIVITY_KEEP) _activity.splice(0, _activity.length - ACTIVITY_KEEP);
    } catch {}
}
const path = require("path");
const http = require("http");
const brainCensus = require("./brainCensus.js");   // v3664 -- the fleet head-count, kept pure so a gate can grade it

// PATCH-B1 -- GPU Brain relay cache. The browser POSTs coarse world
// snapshots here; the headless Deno brain polls them, solves a flow field
// on the GPU, and POSTs the field back; the browser picks the field up in
// the response of its next snapshot POST. The bridge is a dumb mailbox --
// no game logic lives here.
// v2071 -- FLEET SCOREBOARD: each identified brain's rolling solve
// speed, so the bridge can rank brains and RECOMMEND which role each is
// best suited to. { id -> { gpu, role, kinds, solveMsEwma, lastSeen,
// posts } }. Scoring is speed today (the signal we have); the routing
// it enables -- fast brains to fields/hard factions, slower to simple
// work -- is REPORTED, not yet auto-applied (see /ai/brain/fleet).
const fleet = new Map();
function fleetScore(f) {
    if (!f || !f.brainId) return;
    const now = Date.now();
    let e = fleet.get(f.brainId);
    if (!e) { e = { id: f.brainId, gpu: f.brainGpu || "?", role: f.brainRole || "all", kinds: f.brainKinds || null, solveMsEwma: null, lastSolveMs: null, posts: 0, firstSeen: now, startTime: f.startTime || now, retireFlag: false }; fleet.set(f.brainId, e); }
    e.role = f.brainRole || e.role; e.kinds = f.brainKinds ?? e.kinds; e.lastSeen = now; e.posts++;
    if (f.startTime && !e.startTime) e.startTime = f.startTime;   // v2088 -- for newest-wins sibling arbitration
    // v2073 -- Phase B: track the kind + priority of work this brain is
    // actually doing, so the scheduler can spot misallocations (a slow
    // brain stuck on high-priority FPS while a fast brain idles on nav).
    if (f.workMode) { e.workMode = f.workMode; e.workPriority = f.workPriority ?? 0; e.workNavOnly = !!f.workNavOnly; }
    if (f.schedOptIn != null) e.schedOptIn = !!f.schedOptIn;   // v2074 -- Phase C: brain consents to scheduling
    if (f.expBusy != null) e.expBusy = !!f.expBusy;            // v2074 -- brain is mid-experiment; do not reassign now
    if (f.learn) { e.learn = f.learn; e.learnAt = now; }       // v2255 -- retain training stats so /ai/brain/fleet can show the pool learning
    if (typeof f.solveMs === "number") {
        e.lastSolveMs = f.solveMs;
        // EWMA (alpha 0.15): a smooth speed estimate robust to one slow tick
        e.solveMsEwma = e.solveMsEwma == null ? f.solveMs : e.solveMsEwma * 0.85 + f.solveMs * 0.15;
    }
    // evict brains unheard-from for 60s (a machine left the fleet)
    for (const [k, v] of fleet) if (now - v.lastSeen > 60000) fleet.delete(k);
}

// v2074 -- PHASE C: the scheduler. Turns the misallocation flag into an
// ACTION: assign the fastest brain to the highest-priority work and push
// low-priority/nav work onto slower (incl. CPU) brains. Assignments are
// handed back on the field-POST response; a brain applies one only at a
// SAFE boundary (no A/B experiment mid-flight, reported via
// brainExpBusy). Opt-in per fleet: the bridge only emits assignments when
// a brain announces BRAIN_SCHED=1 (schedOptIn). Default = pure advice,
// exactly as before. A brain's current assignment is remembered so we do
// not thrash it every tick -- we only re-emit on a MEANINGFUL change and
// after a settle window.
const schedState = { assignments: new Map(), lastChangeAt: 0, SETTLE_MS: 8000 };
let _lastFieldRaw = null;   // v2074 -- raw body of the in-flight field POST, for the assignment response
function schedulerAssign() {
    const now = Date.now();
    const live = Array.from(fleet.values()).filter(e => now - e.lastSeen < 60000 && e.schedOptIn);
    if (live.length < 2) { schedState.assignments.clear(); return; }
    // rank by speed (fastest first); the CPU brains sort naturally to the
    // back by their slower solveMs, which is the point.
    const bySpeed = live.slice().sort((a, b) => (a.solveMsEwma ?? 1e9) - (b.solveMsEwma ?? 1e9));
    const maxPri = live.reduce((m, b) => Math.max(m, b.workPriority ?? 0), 0);
    // target: fastest -> fields (nav replans every tick, latency-critical),
    // and if there is high-priority POLICY work live, the fastest GPU brain
    // takes policy while a CPU/fields brain absorbs nav. CPU brains can only
    // ever be fields (they cannot run the GPU MLP), so they are pinned.
    const desired = new Map();
    let assignedPolicy = false;
    for (const b of bySpeed) {
        const isCpu = /^cpu/i.test(b.gpu || "") || b.workNavOnly && (b.solveMsEwma ?? 0) > 6 && /cpu/i.test(b.id);
        if (isCpu) { desired.set(b.id, "fields"); continue; }   // CPU pinned to fields
        if (!assignedPolicy && maxPri >= 2) { desired.set(b.id, "policy"); assignedPolicy = true; }  // fastest GPU -> hot policy
        else desired.set(b.id, "fields");
    }
    // only commit after a settle window, and never override a brain that is
    // busy in an experiment (it will apply when clear).
    let changed = false;
    for (const [id, role] of desired) if (schedState.assignments.get(id) !== role) changed = true;
    if (changed && now - schedState.lastChangeAt > schedState.SETTLE_MS) {
        schedState.assignments = desired;
        schedState.lastChangeAt = now;
    }
}
const gpuBrain = { snapshot: null, field: null, stats: { snapPosts: 0, fieldPosts: 0, snapGets: 0 },
    // PATCH-B1c -- shared experience ring for split policy brains
    experience: [], expSeq: 0 };
// PATCH-B1e -- the ring doubles as a cross-machine replay BACKUP: it
// persists across bridge restarts (lazy save, 60s cadence, only when
// dirty) and brains with BRAIN_SHARE=1 warm-start from it when their
// local replay files are missing. Uses the same fs the rest of the
// bridge uses; failure is soft (an empty ring is just a cold start).
const GPU_EXP_FILE = require("path").join(__dirname, "gpu_brain_experience.json");
try {
    const j = JSON.parse(require("fs").readFileSync(GPU_EXP_FILE, "utf-8"));
    if (Array.isArray(j.experience)) {
        gpuBrain.experience = j.experience; gpuBrain.expSeq = j.expSeq || j.experience.length;
        // v31 -- defensive load-time cap (found during the migration read:
        // the loader trusted the file's length; a future cap decrease would
        // have overflowed until the next POST). Top-level scope has no
        // ringKeep; a one-line splice with the same semantics.
        if (gpuBrain.experience.length > 2048) gpuBrain.experience.splice(0, gpuBrain.experience.length - 2048);
    }
    console.log(`[gpuBrain] experience ring restored: ${gpuBrain.experience.length} samples`);
    try { if (global.__swekBrainAnnounce) global.__swekBrainAnnounce(`experience restored: ${gpuBrain.experience.length} samples`); } catch {}   // -> engine toast + KPop (rate-limited)
} catch {}
let _gpuExpDirty = false;
setInterval(() => {
    if (!_gpuExpDirty) return;
    _gpuExpDirty = false;
    try { require("fs").writeFileSync(GPU_EXP_FILE, JSON.stringify({ experience: gpuBrain.experience, expSeq: gpuBrain.expSeq })); } catch {}
}, 60000).unref?.();

// v2088 -- sibling detection. Two brains are "siblings" when they run the same
// GPU + role: only one should be live (a second is almost always a leftover
// from a version update). Returns the NEWEST live sibling, skipping any already
// flagged to retire (a zombie that hasn't stepped down yet must not win
// arbitration or get re-flagged in place of the real current brain).
function _liveSibling(gpu, role, selfId) {
    const now = Date.now();
    let best = null;
    for (const e of fleet.values()) {
        if (e.id === selfId) continue;
        if (e.retireFlag) continue;                       // already stepping down -> not a contender
        if (now - (e.lastSeen || 0) > 60000) continue;    // stale -> not really live
        if ((e.gpu || "?") !== (gpu || "?") || (e.role || "all") !== (role || "all")) continue;
        if (!best || (e.startTime || 0) > (best.startTime || 0)) best = e;   // newest wins
    }
    return best;
}

// *** v4030 -- THE REGISTRY, AND WHY THIS BRIDGE MIGRATES ROUTE-AT-A-TIME RATHER THAN ALL AT ONCE. ***
//
// This file is ~1950 lines and owns the whole /ai/brain prefix plus /ev. Rewriting every route in one commit
// would be a diff nobody can review against a surface Keith's rig actually depends on. So: the registry holds
// the MIGRATED routes, handle() offers it the request FIRST, and anything unregistered falls through to the
// original hand-written chain untouched. owns() is deliberately NOT changed -- this bridge still claims the
// same namespace it always did, so server.js's dispatch is unaffected either way.
//
// MIGRATED SO FAR: GET + POST /ai/brain/experience. Two of the seven hand-clamped bodies in this file.
//
// The registry's registrations live at the FOOT of this file, after the handlers they call are defined.
const { createRegistry, checks } = require("./routeRegistry.js");
const registry = createRegistry("/ai/brain");

function owns(url) {
    const u = String(url || "").split("?")[0];
    return u === "/ev" || u.startsWith("/ai/brain");
}

/**
 * Keep a ring array at or under `cap`. Pure: closes over nothing, which is why it belongs at module scope.
 * With no plotFn it splices the oldest away; with one, it thins the older half (keeping anything plotFn
 * marks, plus every other entry) and preserves the newer half intact.
 *
 * v4030 -- hoisted out of handle(). Same body, byte for byte; only its scope changed.
 */
function ringKeep(arr, cap, plotFn) {
    if (arr.length <= cap) return arr;
    if (!plotFn) { arr.splice(0, arr.length - cap); return arr; }
    const half = Math.floor(arr.length / 2);
    const kept = [];
    for (let i = 0; i < half; i++) if (plotFn(arr[i], i, arr) || i % 2 === 0) kept.push(arr[i]);
    const tail = arr.slice(half);
    arr.length = 0;
    Array.prototype.push.apply(arr, kept);
    Array.prototype.push.apply(arr, tail);
    return arr;
}

function handle(req, res, ctx) {
    const { sendJson, SYS_LOG, sysLogPush, _ollamaBase, _ollamaModelName } = ctx;
    // THE REGISTRY GETS FIRST REFUSAL, and only for routes it actually registered -- its owns() is exact-match,
    // never a prefix wildcard, so an unmigrated /ai/brain/* route reaches the chain below exactly as before.
    if (registry.owns(req.url)) { registry.handle(req, res, ctx); return; }
    if (req.method === "POST" && req.url === "/ai/brain/hello") {
        note("hello", "a brain said hello");
        // v2088 -- sibling handshake. A brain says hello on boot BEFORE it
        // starts solving. If a live sibling (same GPU + role) already exists,
        // we apply NEWEST-WINS: the brain that started later keeps running
        // (it has the newer code after an update); the older one is flagged to
        // retire and will step down gracefully on its next field POST. The
        // newcomer is told whether it should proceed or bow out.
        let body = "";
        req.on("data", c => { body += c; if (body.length > 65536) body = body.slice(0, 65536); });
        req.on("end", () => {
            let d = {};
            try { d = JSON.parse(body || "{}"); } catch {}
            const gpu = d.brainGpu || "?", role = d.brainRole || "all";
            const selfId = d.brainId || "";
            const myStart = d.startTime || Date.now();
            // v2451 -- REGISTER ON HELLO, not only on solve. The fleet map was populated exclusively by fleetScore()
            // from the field-POST path, which meant a brain only existed once it had solved something. A brain that is
            // up, polling, and simply has no work (nobody opened a Brain demo, or the world is empty) never posted a
            // field, never entered the fleet, and so read as OFFLINE -- indistinguishable from not running at all.
            // Saying hello IS evidence of being alive. _liveSibling excludes selfId, so registering first cannot make
            // a brain arbitrate against itself.
            fleetScore({ brainId: selfId, brainGpu: gpu, brainRole: role, startTime: myStart });
            const sib = _liveSibling(gpu, role, selfId);
            if (!sib) { sendJson({ ok: true, proceed: true, sibling: null }); return; }
            const sibStart = sib.startTime || 0;
            if (myStart >= sibStart) {
                // newcomer is newer (or equal) -> it wins; retire the old sibling
                sib.retireFlag = true;
                sysLogPush && sysLogPush(`[brain] sibling arbitration: ${selfId.slice(0,24)} supersedes ${sib.id.slice(0,24)} (same ${gpu}|${role}); older flagged to retire`);
                sendJson({ ok: true, proceed: true, sibling: { id: sib.id, action: "retiring-old" } });
            } else {
                // an even-newer sibling is already live -> newcomer bows out
                sendJson({ ok: true, proceed: false, sibling: { id: sib.id, action: "already-newer" },
                           reason: "a newer brain for this GPU+role is already live" });
            }
        });
        return;
    }
    // v4030 -- POST and GET /ai/brain/experience MOVED to the registry (see registry.post/registry.get near the
    // foot of this file). They are dispatched by handle()'s registry branch BEFORE this chain is reached, so
    // deleting them from here is what makes the move real rather than leaving two copies of one route.
    // PATCH-B1d -- milestone narration: rewrites a template line as one
    // dramatic kaiju-documentary sentence via the local Ollama (same
    // _ollamaBase + timeout pattern as the mascot quips). Fails soft.
    if (req.method === "POST" && req.url === "/ai/brain/narrate") {
        note("narrate", "narration requested");
        let body = "";
        req.on("data", c => { body += c; if (body.length > 4096) body = body.slice(0, 4096); });
        req.on("end", async () => {
            let line = "";
            try { line = String(JSON.parse(body || "{}").line || "").slice(0, 300); } catch {}
            if (!line) { sendJson({ ok: false }); return; }
            try {
                const model = await _ollamaModelName();
                const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 4000);
                try {
                    const r = await fetch(_ollamaBase() + "/api/generate", {
                        method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ model, stream: false,
                            prompt: "Rewrite the following as ONE dramatic sentence of nature-documentary narration about giant monsters, max 22 words, output only the sentence: " + line,
                            options: { temperature: 0.85, num_predict: 60 } }),
                    });
                    const j = await r.json();
                    const text = (j && j.response || "").trim().replace(/^["']|["']$/g, "").split("\n")[0].slice(0, 240);
                    sendJson(text ? { ok: true, text } : { ok: false });
                } finally { clearTimeout(tm); }
            } catch { sendJson({ ok: false }); }
        });
        return;
    }
    // PATCH-B1 -- GPU Brain mailbox routes (see gpuBrain above).
    if (req.method === "POST" && req.url === "/ai/brain/snapshot") {
        let body = "";
        req.on("data", c => { body += c; if (body.length > 4 * 1024 * 1024) body = body.slice(0, 4 * 1024 * 1024); });
        req.on("end", () => {
            try { gpuBrain.snapshot = JSON.parse(body || "null"); gpuBrain.stats.snapPosts++; gpuBrain.stats.lastSnapAt = Date.now(); } catch {}   // v2069 -- stamp for /health freshness
            // hand the freshest field back on the same round trip
            sendJson({ ok: true, field: gpuBrain.field });
        });
        return;
    }
    if (req.method === "GET" && req.url === "/ai/brain/snapshot") {
        gpuBrain.stats.snapGets++;
        sendJson({ ok: true, snapshot: gpuBrain.snapshot });
        return;
    }
    if (req.method === "POST" && req.url === "/ai/brain/flowfield") {
        note("solve", "flow field solved");
        let body = "";
        req.on("data", c => { body += c; if (body.length > 4 * 1024 * 1024) body = body.slice(0, 4 * 1024 * 1024); });
        req.on("end", () => {
            _lastFieldRaw = body;   // v2074 -- Phase C: remember for the assignment lookup
            try {
                const f = JSON.parse(body || "null");
                // PATCH-B1b -- split-brain merge: a payload flagged partial
                // (BRAIN_ROLE=fields|policy) overlays only its non-null keys
                // onto the cached field, so a nav brain on one machine and a
                // policy brain on another compose one field for the browser.
                // Full payloads replace, exactly as before.
                if (f && f.partial && gpuBrain.field) {
                    // PATCH-B1f -- brain-vs-brain: per-KAIJU-ID merge for the
                    // policy maps. Two policy brains (disjoint BRAIN_KINDS
                    // factions) each publish decisions for THEIR kaiju; key-
                    // level overlay would have the second clobber the first.
                    // Map-valued keys merge entries; everything else overlays
                    // exactly as PATCH-B1b did.
                    const MERGE_BY_ID = new Set(["attack", "aggro", "packOrder", "civDef", "civTarget"]);
                    for (const k of Object.keys(f)) {
                        if (f[k] === null || f[k] === undefined) continue;
                        if (MERGE_BY_ID.has(k) && typeof f[k] === "object" && !Array.isArray(f[k])
                            && typeof gpuBrain.field[k] === "object" && gpuBrain.field[k] && !Array.isArray(gpuBrain.field[k])) {
                            Object.assign(gpuBrain.field[k], f[k]);
                        } else {
                            gpuBrain.field[k] = f[k];
                        }
                    }
                    gpuBrain.field.ts = f.ts || Date.now();
                    fleetScore(f);   // v2071 -- partial-payload brains score too
                } else if (f) {
                    gpuBrain.field = f;
                    gpuBrain.stats.fieldPosts = (gpuBrain.stats.fieldPosts || 0) + 1;
                    gpuBrain.stats.lastFieldAt = Date.now();   // v2069 -- the brain SOLVED: freshest "is it working" signal
                    fleetScore(f);   // v2071 -- rank this brain by speed
                }
                gpuBrain.stats.fieldPosts++;
                schedulerAssign();   // v2074 -- Phase C: recompute safe assignments
            } catch {}
            // v2074 -- Phase C: hand this brain its assignment (null unless it
            // opted in AND the scheduler chose a role for it). The brain
            // applies it only at a safe boundary. We read the poster's id
            // from the just-parsed payload if present.
            let assignRole = null;
            let retire = false;   // v2088 -- sibling arbitration: bridge tells a superseded brain to step down
            try {
                const bid = (JSON.parse(_lastFieldRaw || "null") || {}).brainId;
                if (bid && schedState.assignments.has(bid)) assignRole = schedState.assignments.get(bid);
                if (bid) { const e = fleet.get(bid); if (e && e.retireFlag) retire = true; }
            } catch {}
            sendJson({ ok: true, assignRole, retire });
        });
        return;
    }
    // v2069 -- GPU Brain HEALTH: a compact, honest status for server.html.
    // "Running" (Deno process alive) is only ONE of three distinct states,
    // and conflating them hides real failures. We report all three from
    // timestamps the mailbox already sees:
    //   fed     = the engine is POSTing snapshots (the world is talking)
    //   solving = the brain is POSTing fields back (it is actually working)
    //   up      = we have ever heard from it this session
    // plus staleness: a brain that solved 2 minutes ago but nothing since
    // is a DIFFERENT problem than one that never solved. state is the
    // worst-true of {offline, idle, stale, live}.
    // v2071 -- FLEET: the scoreboard + a routing recommendation. Speed
    // ranks brains; the recommendation maps the FASTEST to the most
    // latency-sensitive work (fields = navigation, replans every tick)
    // and lets slower brains take policy/simple factions. This is
    // ADVICE for now -- it prints the env-var assignment a human can
    // apply per machine -- not auto-routing, because silently moving a
    // brain mid-experiment would fork the very A/B tests upstream.
    if (req.method === "GET" && req.url === "/ai/brain/fleet") {
        const now = Date.now();
        const brains = Array.from(fleet.values())
            .filter(e => now - e.lastSeen < 60000)
            .map(e => ({ ...e, ageMs: now - e.lastSeen, staleSolve: e.solveMsEwma == null }))
            .sort((a, b) => (a.solveMsEwma ?? 1e9) - (b.solveMsEwma ?? 1e9));
        // v2073 -- Phase B recommendation now reasons about PRIORITY, not
        // just raw speed. The signal the scheduler will act on:
        //   - highest live priority across the fleet (what is at stake now)
        //   - MISALLOCATION: a slow brain carrying high-priority work while
        //     a faster brain does low-priority work -- the exact case
        //     Phase C's preemption will fix (swap their roles at a safe
        //     experiment boundary). We surface it as advice here.
        let rec = [];
        const maxPri = brains.reduce((m, b) => Math.max(m, b.workPriority ?? 0), 0);
        if (brains.length === 1) rec.push({ id: brains[0].id, suggest: "BRAIN_ROLE=all", why: "sole brain -- runs everything" });
        else if (brains.length >= 2) {
            rec.push({ id: brains[0].id, suggest: "BRAIN_ROLE=fields", why: `fastest (${brains[0].solveMsEwma?.toFixed(1)}ms) -> navigation, which replans every tick` });
            for (let i = 1; i < brains.length; i++)
                rec.push({ id: brains[i].id, suggest: "BRAIN_ROLE=policy", why: `${brains[i].solveMsEwma?.toFixed(1)}ms -> combat decisions, less latency-critical` });
        }
        // misallocation detector: the slowest brain doing the highest-priority work
        let misalloc = null;
        if (brains.length >= 2 && maxPri >= 2) {
            const hi = brains.filter(b => (b.workPriority ?? 0) >= 2).sort((a, b) => (b.solveMsEwma ?? 0) - (a.solveMsEwma ?? 0))[0];
            const fastestIdle = brains.filter(b => (b.workPriority ?? 0) < (hi?.workPriority ?? 0)).sort((a, b) => (a.solveMsEwma ?? 1e9) - (b.solveMsEwma ?? 1e9))[0];
            if (hi && fastestIdle && (hi.solveMsEwma ?? 0) > (fastestIdle.solveMsEwma ?? 0) * 1.5)
                misalloc = { slowOnHot: hi.id, slowMs: hi.solveMsEwma, fastOnCold: fastestIdle.id, fastMs: fastestIdle.solveMsEwma,
                             advice: "a faster brain is on lower-priority work -- Phase C would swap these at a safe boundary" };
        }
        sendJson({ ok: true, count: brains.length, brains, recommendation: rec,
            maxPriority: maxPri, misallocation: misalloc,
            scheduler: { active: Array.from(fleet.values()).some(e => e.schedOptIn),
                         assignments: Object.fromEntries(schedState.assignments),
                         settleMs: schedState.SETTLE_MS },
            note: "advice only -- apply via each machine's BRAIN_ROLE env var; auto-routing deliberately not enabled (would fork running A/B experiments). Phase B adds work mode/priority; Phase C is the scheduler that acts on it." });
        return;
    }
    // v2964: what the panel reads -- the activity tail plus the live health verdict, in one round trip.
    if (req.method === "GET" && req.url === "/ai/brain/console") {
        const tail = _activity.slice(-120);
        const newest = tail.length ? tail[tail.length - 1].at : null;
        // v3952 -- *** ONE CALL SITE OUT OF THIRTY-THREE HAD THE WRONG SIGNATURE, AND IT WAS A 500. ***
        // sendJson comes from ctx and is server.js's own: `(obj, code = 200) => { res.writeHead(code, ...);
        // res.end(JSON.stringify(obj)); }`. It takes the BODY first. This line passed `res` first, so `obj`
        // became the ServerResponse and `code` became the object -- writeHead got an object for a status code,
        // JSON.stringify got a circular structure, and either one throws into the outer catch as a 500.
        // Keith's render-qa reported `500 /ai/brain/console` three times on panel-brain; every OTHER sendJson in
        // this file already had it right, which is exactly why it survived: nothing about the line looks odd
        // until you know the signature, and thirty-two neighbours quietly disagree with it.
        return sendJson({
            ok: true,
            tail,
            newestAt: newest,
            // the AGE is reported so the panel can say "this is old" rather than showing a stale trace as if live
            ageMs: newest ? Date.now() - newest : null,
            kept: _activity.length, cap: ACTIVITY_KEEP,
        });
    }
    if (req.method === "GET" && req.url === "/ai/brain/health") {
        const now = Date.now();
        const s = gpuBrain.stats || {};
        const ageF = s.lastFieldAt ? now - s.lastFieldAt : null;   // since last SOLVE
        const ageS = s.lastSnapAt ? now - s.lastSnapAt : null;     // since last FEED
        const STALE_MS = 15000;   // fields flow at ~4Hz; 15s quiet = something stopped
        // v2145 -- a brain that said hello / heartbeat but hasn't solved yet is
        // ALIVE, not offline. Consult the fleet registry + the engine heartbeat so
        // "running but idle" doesn't alarm as "offline (is the window running?)".
        let liveBrains = 0, newestSeen = 0;
        try { for (const [, e] of fleet) { if (now - (e.lastSeen || 0) <= 60000) { liveBrains++; newestSeen = Math.max(newestSeen, e.lastSeen || 0); } } } catch {}
        const hbAge = gpuBrain.engineLastSeen ? now - gpuBrain.engineLastSeen : null;
        const registered = liveBrains > 0 || (hbAge != null && hbAge <= 60000);
        let state, detail;
        if (ageF == null && ageS == null) {
            if (registered) {
                state = "idle";
                detail = liveBrains > 0
                    ? liveBrains + " brain(s) registered and standing by -- no solves yet (fire up a GPU Brain test, or the world is empty)"
                    : "brain heartbeat is alive but no solves yet";
            } else {
                state = "offline";
                detail = "no brain traffic or heartbeat this session -- is the Deno window running?";
            }
        }
        else if (ageF == null)            { state = "idle";    detail = "engine is feeding snapshots but the brain has not solved yet (fire up a GPU Brain test, or the world is empty)"; }
        else if (ageF > STALE_MS)         { state = "stale";   detail = "last solve " + Math.round(ageF / 1000) + "s ago -- brain may have stopped or the world went quiet"; }
        else                              { state = "live";    detail = "solving in real time"; }
        sendJson({
            ok: true, state, detail,
            solving: ageF != null && ageF <= STALE_MS,
            fed: ageS != null && ageS <= STALE_MS,
            registeredBrains: liveBrains, heartbeatMsAgo: hbAge,
            // v3664 -- PER-BRAIN WORK, so server.html's SOLVING dial can stop reporting the HUB's own state.
            // `brainsBusy` is OBSERVED (posted a solve within brainCensus.BUSY_MS); `brainsDeclaredBusy` is the
            // brain's own expBusy flag, which is TRUE ONLY MID-EXPERIMENT and therefore answers a different
            // question; `brainsDisagree` counts the brains where the two answers differ, which is the number
            // that says whether the distinction matters on this fleet today.
            ...(() => { const c = brainCensus.census([...fleet.values()], now); return {
                brainsBusy: c.busy, brainsIdle: c.idle, brainsDeclaredBusy: c.declaredBusy,
                brainsDisagree: c.disagree, brainsOldestSilenceMs: c.oldestSilenceMs }; })(),
            lastSolveMsAgo: ageF, lastFeedMsAgo: ageS,
            snapPosts: s.snapPosts || 0, fieldPosts: s.fieldPosts || 0, snapGets: s.snapGets || 0,
            experience: (gpuBrain.experience || []).length, expSeq: gpuBrain.expSeq || 0,
            hasField: !!gpuBrain.field, hasSnapshot: !!gpuBrain.snapshot,
            // v2215 -- which field solver actually produced the last field (cpu / gpu watched /
            // auto probing / demoted). server.html surfaces this so you don't have to open a mind
            // page or read the terminal to see which backend is live. `truncated` reddens it.
            solverBackend: (gpuBrain.field && gpuBrain.field.solver && gpuBrain.field.solver.backend) || null,
            solverTruncated: !!(gpuBrain.field && gpuBrain.field.solver && gpuBrain.field.solver.truncated),
        });
        return;
    }
    if (req.method === "GET" && req.url === "/ai/brain/flowfield") { sendJson({ ok: true, field: gpuBrain.field }); return; }
    // v33 -- shared audit MERGE (the console and the export speak from
    // the same function): both files, sorted, source-tagged.
    function mergedAudit() {
        const fsM = require("fs"), pathM = require("path");
        const load = f => { try { return JSON.parse(fsM.readFileSync(pathM.join(__dirname, f), "utf-8")); } catch { return []; } };
        return load("../brain/gates_audit.json").map(a => ({ ...a, _src: "gate" }))
            .concat(load("rematch_audit.json").map(a => ({ ...a, _src: "duel" })))
            .sort((a, b) => a.ts - b.ts);
    }
    // v32 -- ONE audit writer (the ringKeep lesson applied to audits):
    // files stay separate (no migration risk), the SHAPE and the writer
    // unify -- {ts, from, action, ...detail}, ringKeep(500). Callers name
    // the file and the action; everything else is uniform.
    function appendAudit(fileName, req2, action, detail) {
        try {
            const fsA = require("fs"), pathA = require("path");
            const af = fileName.startsWith("../") ? pathA.join(__dirname, fileName) : pathA.join(__dirname, fileName);
            let audit = [];
            try { audit = JSON.parse(fsA.readFileSync(af, "utf-8")); } catch {}
            audit.push({ ts: Date.now(), from: (req2.socket && req2.socket.remoteAddress) || "unknown", action, ...detail });
            ringKeep(audit, 500);
            fsA.writeFileSync(af, JSON.stringify(audit));
        } catch {}
    }
    // v30 -- node twin of the brain's ringKeep (same contract, same
    // two modes; the runtimes cannot share a module, the policy they
    // share is this comment and the tests).
    // ringKeep MOVED TO MODULE SCOPE at v4030 -- see the declaration above handle(). It was declared HERE,
    // inside the request handler, and the original code carried a comment noting the call above it was legal
    // "because declaration hoisting". That was true and it was also a trap: the function was re-allocated on
    // EVERY REQUEST, and it was invisible to anything outside handle() -- which is exactly what broke when
    // /ai/brain/experience moved to a module-scope registry registration. THE GATE CAUGHT IT BY RUNNING THE
    // ROUTE, not by reading the diff: "ringKeep is not defined", on a migration that looked clean.
    // PATCH-B1g -- duel scoreboard history: the engine POSTs tallies every
    // 30s (PATCH-B2m); report.js reads the persisted file to chart the
    // kill curves. Same lazy-save pattern as the experience ring.
    if (req.method === "POST" && req.url === "/ai/brain/duel") {
        let body = "";
        req.on("data", c => { body += c; if (body.length > 65536) body = body.slice(0, 65536); });
        req.on("end", () => {
            try {
                const d = JSON.parse(body || "null");
                if (d && typeof d.killsA === "number") {
                    gpuBrain.engineLastSeen = Date.now();   // v34 -- engine-only route
                    gpuBrain.engineSeenVia = "duel routes";   // v35
                    gpuBrain.duel = gpuBrain.duel || [];
                    gpuBrain.duel.push({ ts: Date.now(), killsA: d.killsA, killsB: d.killsB,
                                         energyA: d.energyA ?? 0, energyB: d.energyB ?? 0,
                                         // v25 -- per-tally set counts drive chart segmentation
                                         ...(d.setsA != null ? { setsA: d.setsA, setsB: d.setsB ?? 0 } : {}) });
                    // v20 -- faction labels ride separately (latest wins)
                    if (d.nameA || d.nameB) gpuBrain.duelNames = { A: d.nameA || "A", B: d.nameB || "B" };
                    // v24 -- series score (latest wins)
                    if (d.setsA != null) gpuBrain.duelSets = { A: d.setsA, B: d.setsB ?? 0, target: d.setTarget ?? null };
                    if (d.champion) {
                        gpuBrain.duelChampion = d.champion;   // v25
                        // v26 -- PODIUM: a finished series is history worth
                        // keeping. Append once per champion (the frozen
                        // scoreboard sends no further tallies, so one
                        // champion-bearing POST is the series' last word).
                        try {
                            const fsP = require("fs"), pathP = require("path");
                            const sf = pathP.join(__dirname, "gpu_brain_series.json");
                            let hist = [];
                            try { hist = JSON.parse(fsP.readFileSync(sf, "utf-8")); } catch {}
                            hist.push({ ts: Date.now(), champion: d.champion,
                                        setsA: d.setsA ?? 0, setsB: d.setsB ?? 0,
                                        nameA: d.nameA || "A", nameB: d.nameB || "B",
                                        game: d.game || null });   // v43 -- podium filter key
                            ringKeep(hist, 200);   // v30
                            fsP.writeFileSync(sf, JSON.stringify(hist));
                            gpuBrain.series = hist;
                        } catch {}
                    }
                    // v29 -- wise-forgetting for the tally ring (the sweep-history
                    // pattern): when full, the older half thins to every 2nd
                    // entry, but PLOT entries survive -- lead changes (sign
                    // flips: keeping every flip entry preserves the entire
                    // sign SEQUENCE across kept entries, since signs only
                    // change at flips) and set boundaries (set counts are
                    // constant between steps, so dropping between-step
                    // entries loses nothing about the boundaries).
                    ringKeep(gpuBrain.duel, 2000, (e, i, D) => {   // v30 -- unified
                        if (i === 0) return true;
                        const pv = Math.sign(D[i - 1].killsA - D[i - 1].killsB);
                        const cu = Math.sign(e.killsA - e.killsB);
                        if (pv !== 0 && cu !== 0 && pv !== cu) return true;
                        return e.setsA != null && D[i - 1].setsA != null
                            && (e.setsA + e.setsB) > (D[i - 1].setsA + D[i - 1].setsB);
                    });
                    // v18 -- push the fresh tally to every WS client so the
                    // duel views redraw instantly (poll stays as fallback)
                    try {
                        const msg = JSON.stringify({ type: "gpu:duel", tally: gpuBrain.duel[gpuBrain.duel.length - 1] });
                        for (const client of wss.clients) {
                            if (client.readyState === 1) { try { client.send(msg); } catch {} }
                        }
                    } catch {}
                    try { require("fs").writeFileSync(require("path").join(__dirname, "gpu_brain_duel.json"),
                                                       JSON.stringify(gpuBrain.duel)); } catch {}
                }
            } catch {}
            sendJson({ ok: true });
        });
        return;
    }
    if (req.method === "GET" && req.url === "/ai/brain/duel") { {
        // v26 -- lazy-load the podium on first read after a restart
        if (!gpuBrain.series) { try { gpuBrain.series = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "gpu_brain_series.json"), "utf-8")); } catch { gpuBrain.series = []; } }
        sendJson({ ok: true, duel: gpuBrain.duel || [], names: gpuBrain.duelNames || null, sets: gpuBrain.duelSets || null, champion: gpuBrain.duelChampion || null, series: gpuBrain.series }); return; } }
    // PATCH-B1h -- full-page duel view: self-contained HTML, no assets,
    // auto-refreshing chart + lead-change log with timestamps. Linked
    // from the server.html panel (click-through).
    // v25 -- LIVE experiment console: the report is offline; this serves
    // the same ladder table from the same state files on demand. NODE
    // TWIN of report.js experimentConsole (different runtime, small
    // surface -- the duplication is deliberate and this comment is its
    // registration). Path assumption: brain/ is a sibling of ai-bridge/,
    // as shipped; unreadable files render "not started".
    // v26 -- CONSOLE ACTIONS. Design: the brain is a separate Deno
    // process; its env cannot be changed from here. The gates therefore
    // live in a FILE (../brain/gates.json) the brain re-reads lazily at
    // each decision point, with precedence ENV > FILE > DEFAULT -- an
    // explicit env var is the operator's hard setting and always wins;
    // the console is the soft setting. Whitelisted keys and values only.
    if (req.method === "POST" && req.url === "/ai/brain/gates") {
        let body = "";
        req.on("data", c => { body += c; if (body.length > 4096) body = body.slice(0, 4096); });
        req.on("end", () => {
            try {
                const d = JSON.parse(body || "null");
                const KEYS = new Set(["BRAIN_ATK_T_AUTO", "BRAIN_DIFF_AUTO", "BRAIN_TRADE_T_AUTO", "BRAIN_ESCORT_AUTO", "BRAIN_BIAS_MAG_AUTO"]);   // v41/v45/v49
                // v48 -- per-key value sets: COPRIMARY speaks off/on, not
                // suggest/adopt; the validator honors each key's own vals
                const KEY_VALS = { BRAIN_ESCORT_COPRIMARY: new Set(["off", "on"]),
                                   BRAIN_DIFF_COPRIMARY: new Set(["off", "on"]) };   // v49
                const VALS = new Set(["suggest", "adopt"]);
                // v38 -- numeric knob joins the whitelist: the quiet threshold
                // (150s was opinion, not physics). Integer seconds, 60..3600;
                // prev-recording, undo, redo, and audit all flow through
                // unchanged -- the replay machinery never cared what the
                // value MEANT, only that flips record what they displaced.
                // v47 -- float knob class joins int: same table, a kind field
                const NUM_KEYS = { BRAIN_HB_QUIET_S: { min: 60, max: 3600, kind: "int" },
                                   BRAIN_EV_BIAS_CONFED: { min: -0.5, max: 0.5, kind: "float" },
                                   BRAIN_EV_BIAS_PIRATE: { min: -0.5, max: 0.5, kind: "float" } };
                const numOk = (() => {
                    if (!d || !NUM_KEYS[d.key]) return false;
                    const n = Number(d.value), k = NUM_KEYS[d.key];
                    if (!Number.isFinite(n) || n < k.min || n > k.max) return false;
                    return k.kind === "int" ? Number.isInteger(n) : true;
                })();
                const enumOk = d && ((KEYS.has(d.key) && VALS.has(d.value)) || (KEY_VALS[d.key] && KEY_VALS[d.key].has(d.value)));
                if (enumOk || numOk) {
                    const fsG = require("fs"), pathG = require("path");
                    const gf = pathG.join(__dirname, "../brain/gates.json");
                    let g = {};
                    try { g = JSON.parse(fsG.readFileSync(gf, "utf-8")); } catch {}
                    const prev = g[d.key];   // v32 -- the undo needs yesterday
                    g[d.key] = d.value;
                    fsG.writeFileSync(gf, JSON.stringify(g));
                    // v27/v32 -- unified audit ("who" is a LAN address, stated)
                    appendAudit("../brain/gates_audit.json", req, "flip",
                                { key: d.key, value: d.value, prev: prev ?? null });
                    sendJson({ ok: true, gates: g });
                    return;
                }
            } catch {}
            sendJson({ ok: false, error: "key/value not in whitelist" });
        });
        return;
    }
    // v27 -- REMATCH: clears the bridge-side series (the podium already
    // archived it) and stamps rematchAt; the ENGINE polls that stamp on
    // its existing 30s cadence and resets its own frozen scoreboard --
    // the duel state lives browser-side where this process cannot reach.
    if (req.method === "POST" && req.url === "/ai/brain/duel/rematch") {
        // v28 -- NEW TERMS ride the stamp: optional setTarget/bestOf in the
        // body, sanitized to positive capped integers (an even bestOf is
        // legal -- ceil(N/2) still yields a deterministic first-to). The
        // engine applies them when it consumes the stamp. Plus the same
        // append-log audit pattern the gates got.
        let body28 = "";
        req.on("data", c => { body28 += c; if (body28.length > 4096) body28 = body28.slice(0, 4096); });
        req.on("end", () => {
            let terms = null;
            const rejected = {};   // v29 -- silent failure is a bug report nobody files
            try {
                const d = JSON.parse(body28 || "null");
                const st = Number(d?.setTarget), bo = Number(d?.bestOf);
                terms = {};
                if (d?.setTarget != null && d.setTarget !== "") {
                    if (Number.isInteger(st) && st > 0 && st <= 1000) terms.setTarget = st;
                    else rejected.setTarget = String(d.setTarget) + " (must be an integer 1..1000)";
                }
                if (d?.bestOf != null && d.bestOf !== "") {
                    if (Number.isInteger(bo) && bo > 0 && bo <= 99) terms.bestOf = bo;
                    else rejected.bestOf = String(d.bestOf) + " (must be an integer 1..99)";
                }
                if (!Object.keys(terms).length) terms = null;
            } catch {}
            gpuBrain.duel = [];
            gpuBrain.duelChampion = null;
            gpuBrain.duelSets = null;
            gpuBrain.duelRematchAt = Date.now();
            gpuBrain.duelRematchTerms = terms;
            gpuBrain.duelRematchAcked = 0;   // v31 -- fresh stamp, unconsumed
            appendAudit("rematch_audit.json", req, "rematch", { terms });   // v32 -- unified
            try {
                const msg = JSON.stringify({ type: "gpu:duel" });
                for (const client of wss.clients) if (client.readyState === 1) { try { client.send(msg); } catch {} }
            } catch {}
            sendJson({ ok: true, rematchAt: gpuBrain.duelRematchAt, terms,
                       rejected: Object.keys(rejected).length ? rejected : null });   // v29
        });
        return;
    }
    if (req.method === "GET" && req.url === "/ai/brain/duel/rematch") {
        // v33 -- MEASURE the poll cadence here: the engine is this route's
        // only client (views never call it), so inter-request gaps ARE the
        // poll cadence. Median of the last few resists a stray curl.
        // Single-poller assumption stated: two engines polling would halve
        // the apparent gap.
        gpuBrain.engineLastSeen = Date.now();   // v34 -- engine-only route
        gpuBrain.engineSeenVia = "duel routes";   // v35
        (gpuBrain.rematchPollTimes = gpuBrain.rematchPollTimes || []).push(Date.now());
        ringKeep(gpuBrain.rematchPollTimes, 6);
        sendJson({ ok: true, rematchAt: gpuBrain.duelRematchAt || 0, terms: gpuBrain.duelRematchTerms || null });
        return;
    }
    // v31 -- CANCEL, with the honest race window stated: a cancel wins only
    // while the stamp is unconsumed -- the engine polls every ~30s, and once
    // it arms, the reset lands within one tick (~1s). The ACK route lets
    // the console know which side of that window it is on.
    if (req.method === "POST" && req.url === "/ai/brain/duel/rematch/cancel") {
        const wasPending = !!(gpuBrain.duelRematchAt && !gpuBrain.duelRematchAcked);
        gpuBrain.duelRematchAt = 0;
        gpuBrain.duelRematchTerms = null;
        appendAudit("rematch_audit.json", req, "cancel", { wasPending });   // v32 -- unified
        sendJson({ ok: true, cancelled: wasPending });
        return;
    }
    if (req.method === "POST" && req.url === "/ai/brain/duel/rematch/ack") {
        gpuBrain.duelRematchAcked = Date.now();   // v31 -- the engine consumed the stamp
        gpuBrain.engineLastSeen = Date.now();     // v34
        gpuBrain.engineSeenVia = "duel routes";   // v35
        sendJson({ ok: true });
        return;
    }
    // v32 -- GATE UNDO: restore the value the last flip displaced. The
    // audit is the source of truth: the most recent "flip" entry for the
    // key carries prev (null = key was unset = default). The undo is
    // itself audited -- history only ever grows.
    // v33 -- AUDIT EXPORT: the merged list as JSON, for scripts. Same
    // merge the console renders -- one source of truth, two consumers.
    // v36 -- CSV for the DATA files (telemetry + sweep history): one
    // whitelisted route, auto columns = sorted union of keys across
    // entries (deterministic; sparse fields render empty). Same RFC-4180
    // esc as the audit export.
    // v37 -- GAP ALERT watcher: installed lazily on first request (the
    // handler has no top-level hook of its own); ??= keeps it single.
    // Every 30s: if the engine was heartbeating and has now been quiet
    // past 2.5 beats (150s), push ONE warn line -- the alert waits for
    // someone to look at nothing; the log goes to them.
    // v38 -- LINT: the v37 bug class ({line:} posts silently dropped by
    // the /sys/logs contract) must not return quietly. On first request,
    // grep the engine bundle for the pattern and say what was found --
    // one line either way, because a lint that runs silently cannot be
    // distinguished from a lint that never ran.
    // v39 -- LINT EXPANSION: a contract TABLE. Each cross-process
    // contract is one entry -- a regex for the wrong shape and a line
    // explaining what right looks like. New contracts join the table,
    // not the code. Checked: {line:} log posts (v37 class), heartbeat
    // POSTs carrying a body (the route ignores one -- a payload there
    // means someone thinks it does something), and duel tally posts
    // missing killsA (the route drops those silently too).
    gpuBrain._logLint ??= (() => {
        try {
            const fsL = require("fs"), pathL = require("path");
            const cand = ["../main.js", "main.js", "../public/main.js"].map(f => pathL.join(__dirname, f));
            const found = cand.find(f => { try { return fsL.statSync(f).isFile(); } catch { return false; } });
            if (!found) { sysLogPush("log", ["[lint] contracts: engine bundle not found beside the bridge; lint skipped"]); return true; }
            const src39 = fsL.readFileSync(found, "utf-8");
            const CONTRACTS = [
                { name: "log posts", rx: /JSON\.stringify\(\{\s*line:/g,
                  why: "/sys/logs wants {src, msg}; {line:} is dropped" },
                { name: "heartbeat shape", rx: /heartbeat"\s*,\s*\{\s*method:\s*"POST"\s*,\s*(headers|body)/g,
                  why: "the heartbeat route ignores bodies; a payload there is a misunderstanding waiting to grow" },
                { name: "duel tally fields", rx: /ai\/brain\/duel"[\s\S]{0,200}?JSON\.stringify\(\{(?![\s\S]{0,40}killsA)/g,
                  why: "duel POSTs without killsA are silently dropped by the route" },
            ];
            const bad = [];
            for (const c of CONTRACTS) {
                const hits = (src39.match(c.rx) || []).length;
                if (hits) bad.push(c.name + " x" + hits + " (" + c.why + ")");
            }
            if (bad.length) sysLogPush("warn", ["[lint] contract VIOLATIONS in " + pathL.basename(found) + ": " + bad.join("; ")]);
            else sysLogPush("log", ["[lint] " + CONTRACTS.length + " cross-process contracts clean in " + pathL.basename(found)]);
        } catch {}
        return true;
    })();
    gpuBrain._hbWatch ??= setInterval(() => {
        try {
            if (!gpuBrain.engineLastSeen || gpuBrain.engineSeenVia !== "heartbeat") return;
            const gap = Date.now() - gpuBrain.engineLastSeen;
            // v38 -- threshold from gates.json (ENV-free knob; the file is
            // tiny and this tick is 30s -- a fresh read is cheaper than a
            // cache bug). Falls back to 150s on absence or nonsense.
            let quietMs = 150000;
            try {
                const gk = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../brain/gates.json"), "utf-8"));
                const v38 = Number(gk.BRAIN_HB_QUIET_S);
                if (Number.isInteger(v38) && v38 >= 60 && v38 <= 3600) quietMs = v38 * 1000;
            } catch {}
            if (gap > quietMs && !gpuBrain.hbQuietAlerted) {
                gpuBrain.hbQuietAlerted = true;
                sysLogPush("warn", ["[brain] engine heartbeat QUIET for " + Math.round(gap / 1000) + "s (~" + Math.floor(gap / 60000) + " beats missed) -- engine gone or wedged mid-session"]);
            }
        } catch {}
    }, 30000);
    if (req.method === "GET" && req.url.startsWith("/ai/brain/export.csv")) {
        const FILES36 = {
            telemetry: "../brain/difficulty_telemetry.json",
            sweep_history: "../brain/t_sweep_history.json",
            duel: "gpu_brain_duel.json",       // v37 -- bridge-side
            series: "gpu_brain_series.json",   // v37
            audit: null,                       // v38 -- merged in code, not a path
            escort_ab: "../brain/escort_ab.json",   // v45 -- object shape, flattened below
            bias_mag_history: "../brain/bias_mag_history.json",   // v56 -- the ladder's diary, array shape, auto-columns
            verify_timing: "../tools/verify_timing.json",   // v68 -- the ritual's pulse; nested steps flattened below (the v45 precedent)
        };
        let name36 = null;
        try { name36 = new URL(req.url, "http://x").searchParams.get("file"); } catch {}
        if (!name36 || !(name36 in FILES36)) {   // v38 -- "in": audit's path is null by design
            sendJson({ ok: false, error: "file must be one of: " + Object.keys(FILES36).join(", ") });
            return;
        }
        let data36 = [];
        if (name36 === "audit") data36 = mergedAudit();   // v38 -- alias: one export surface
        else try { data36 = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, FILES36[name36]), "utf-8")); } catch {}
        // v45 -- escort_ab is {lo:[],hi:[]}: flatten with an arm column so
        // the auto-column path (which wants an array) gets one
        if (name36 === "escort_ab" && data36 && !Array.isArray(data36)) {
            data36 = (data36.lo || []).map(e => ({ arm: "lo", ...e }))
                .concat((data36.hi || []).map(e => ({ arm: "hi", ...e })));
        }
        // v68 -- verify_timing entries carry a NESTED steps object; a raw
        // export would print [object Object]. Flatten each step to its own
        // column (the v45 flatten precedent: reshape at the surface, never
        // in the file).
        if (name36 === "verify_timing" && Array.isArray(data36)) {
            data36 = data36.map(e => ({ ts: e.ts, green: e.green, ...(e.steps || {}) }));
        }
        if (!Array.isArray(data36)) data36 = [];
        let keys36 = [...new Set(data36.flatMap(e => Object.keys(e)))].sort();
        // v39 -- ?cols=ts,durS narrows the sheet: requested order kept,
        // unknown names dropped (a typo yields a thinner sheet, not an
        // error -- the header row shows you what survived)
        try {
            const colsQ = new URL(req.url, "http://x").searchParams.get("cols");
            if (colsQ) {
                const want = colsQ.split(",").map(s => s.trim()).filter(Boolean);
                const have = new Set(keys36);
                const picked = want.filter(k => have.has(k));
                if (picked.length) keys36 = picked;
            }
        } catch {}
        const esc36 = (v) => {
            const s = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
            return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const csv36 = keys36.join(",") + "\r\n" +
            data36.map(e => keys36.map(k => esc36(e[k])).join(",")).join("\r\n") + "\r\n";
        res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=" + name36 + ".csv" });
        res.end(csv36);
        return;
    }
    // v35 -- HEARTBEAT: the engine pings every 60s; staleness now reads
    // whenever the engine runs, not only mid-duel.
    if (req.method === "POST" && req.url === "/ai/brain/heartbeat") {
        // v37 -- GAP ALERT recovery side: a returning pulse after a logged
        // quiet period says how long it was gone and how many beats that
        // cost. The alert flag resets so the NEXT quiet period logs anew.
        if (gpuBrain.hbQuietAlerted && gpuBrain.engineLastSeen) {
            const goneS = Math.round((Date.now() - gpuBrain.engineLastSeen) / 1000);
            sysLogPush("log", ["[brain] engine heartbeat BACK after " + goneS + "s (~" + Math.max(1, Math.round(goneS / 60)) + " beats missed)"]);
        }
        gpuBrain.hbQuietAlerted = false;
        gpuBrain.engineLastSeen = Date.now();
        gpuBrain.engineSeenVia = "heartbeat";
        sendJson({ ok: true });
        return;
    }
    if (req.method === "GET" && req.url.startsWith("/ai/brain/audit.json")) {
        // v34 -- query filters: ?src=gate|duel, ?since=<ms-epoch>,
        // ?action=flip|undo|redo|rematch|cancel. Unknown params ignored;
        // bad "since" values filter nothing rather than erroring.
        let out = mergedAudit();
        let asCsv = false;
        try {
            const q = new URL(req.url, "http://x").searchParams;
            const src = q.get("src"), action = q.get("action"), since = Number(q.get("since"));
            if (src) out = out.filter(a => a._src === src);
            if (action) out = out.filter(a => a.action === action);
            if (Number.isFinite(since) && since > 0) out = out.filter(a => a.ts >= since);
            asCsv = q.get("format") === "csv";   // v35
        } catch {}
        if (asCsv) {
            // v35 -- CSV for spreadsheets (yes, the irony of exporting the
            // GPU brain's ledger INTO Excel is noted and savored). RFC-4180
            // quoting: any field with comma/quote/newline is quoted, inner
            // quotes doubled.
            const esc = (v) => {
                const s = v == null ? "" : String(v);
                return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const cols = ["ts", "iso", "src", "action", "from", "key", "value", "prev", "restored", "detail"];
            const rows35 = out.map(a => [a.ts, new Date(a.ts).toISOString(), a._src, a.action ?? "", a.from ?? "",
                                         a.key ?? "", a.value ?? "", a.prev ?? "", a.restored ?? "",
                                         a.terms ? JSON.stringify(a.terms) : (a.wasPending != null ? "wasPending=" + a.wasPending : "")]);
            const csv = cols.join(",") + "\r\n" + rows35.map(r => r.map(esc).join(",")).join("\r\n") + "\r\n";
            res.writeHead(200, { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=gpu_brain_audit.csv" });
            res.end(csv);
            return;
        }
        sendJson({ ok: true, audit: out });
        return;
    }
    // v34 -- shared replay: derive BOTH stacks from the audit. Editor
    // semantics: a fresh flip clears the redo stack (redoing across a
    // divergent history would apply a value from a timeline that no
    // longer exists).
    function replayGateStacks(audit, key) {
        const stack = [], redo = [];
        for (const a of audit) {
            if (a.key !== key) continue;
            if (a.action === "flip" && "prev" in a) { stack.push(a); redo.length = 0; }
            else if (a.action === "undo") { const p2 = stack.pop(); if (p2) redo.push(p2); }
            else if (a.action === "redo") { const r2 = redo.pop(); if (r2) stack.push(r2); }
        }
        return { stack, redo };
    }
    if (req.method === "POST" && req.url === "/ai/brain/gates/redo") {
        let bodyR = "";
        req.on("data", c => { bodyR += c; if (bodyR.length > 4096) bodyR = bodyR.slice(0, 4096); });
        req.on("end", () => {
            try {
                const d = JSON.parse(bodyR || "null");
                const KEYS = new Set(["BRAIN_ATK_T_AUTO", "BRAIN_DIFF_AUTO", "BRAIN_TRADE_T_AUTO", "BRAIN_ESCORT_AUTO", "BRAIN_ESCORT_COPRIMARY", "BRAIN_DIFF_COPRIMARY", "BRAIN_BIAS_MAG_AUTO"]);
                if (d && KEYS.has(d.key)) {
                    const fsR2 = require("fs"), pathR2 = require("path");
                    let audit = [];
                    try { audit = JSON.parse(fsR2.readFileSync(pathR2.join(__dirname, "../brain/gates_audit.json"), "utf-8")); } catch {}
                    const { redo } = replayGateStacks(audit, d.key);
                    if (!redo.length) { sendJson({ ok: false, error: "nothing to redo for " + d.key }); return; }
                    const top = redo[redo.length - 1];
                    const gf = pathR2.join(__dirname, "../brain/gates.json");
                    let g = {};
                    try { g = JSON.parse(fsR2.readFileSync(gf, "utf-8")); } catch {}
                    g[d.key] = top.value;
                    fsR2.writeFileSync(gf, JSON.stringify(g));
                    appendAudit("../brain/gates_audit.json", req, "redo", { key: d.key, value: top.value });
                    sendJson({ ok: true, reapplied: top.value, redoRemaining: redo.length - 1 });
                    return;
                }
            } catch {}
            sendJson({ ok: false, error: "key not in whitelist" });
        });
        return;
    }
    if (req.method === "POST" && req.url === "/ai/brain/gates/undo") {
        let body32 = "";
        req.on("data", c => { body32 += c; if (body32.length > 4096) body32 = body32.slice(0, 4096); });
        req.on("end", () => {
            try {
                const d = JSON.parse(body32 || "null");
                const KEYS = new Set(["BRAIN_ATK_T_AUTO", "BRAIN_DIFF_AUTO", "BRAIN_TRADE_T_AUTO", "BRAIN_ESCORT_AUTO", "BRAIN_ESCORT_COPRIMARY", "BRAIN_DIFF_COPRIMARY", "BRAIN_BIAS_MAG_AUTO"]);
                if (d && KEYS.has(d.key)) {
                    const fsU = require("fs"), pathU = require("path");
                    let audit = [];
                    try { audit = JSON.parse(fsU.readFileSync(pathU.join(__dirname, "../brain/gates_audit.json"), "utf-8")); } catch {}
                    // v33 -- UNDO DEPTH via stack replay (the cursor the
                    // last-flip search could not be): flips push, undos pop;
                    // the next undo restores the TOP's prev. Repeated undos
                    // therefore walk the whole flip history back, one honest
                    // step at a time, and the depth is derived from the audit
                    // itself -- no cursor state to desynchronize.
                    const { stack } = replayGateStacks(audit, d.key);   // v34 -- shared
                    if (!stack.length) { sendJson({ ok: false, error: "nothing left to undo for " + d.key + " (the whole flip history is already unwound)" }); return; }
                    const top = stack[stack.length - 1];
                    const gf = pathU.join(__dirname, "../brain/gates.json");
                    let g = {};
                    try { g = JSON.parse(fsU.readFileSync(gf, "utf-8")); } catch {}
                    if (top.prev == null) delete g[d.key]; else g[d.key] = top.prev;
                    fsU.writeFileSync(gf, JSON.stringify(g));
                    appendAudit("../brain/gates_audit.json", req, "undo",
                                { key: d.key, restored: top.prev ?? "(default)", depth: stack.length });
                    sendJson({ ok: true, restored: top.prev ?? null, remaining: stack.length - 1 });
                    return;
                }
            } catch {}
            sendJson({ ok: false, error: "key not in whitelist" });
        });
        return;
    }
    // v39 -- ESCAPE VELOCITY demo: a new CLIENT of the existing brain
    // mailbox, zero protocol changes. Ships POST the same snapshot shape
    // the engine does (roster of ev-<id> entries with attack specs), the
    // field rides back on the round-trip, and outcomes report through
    // the same map. Authority model unchanged since the VBA days: this
    // page owns positions and physics; the brain owns intents (weapon
    // pick via the served attack map, pursuit via aggro). Nav is a jump
    // GRAPH (BFS -- systems are a graph, not a grid; flow fields stay
    // where they are good, which is not here). Local-fallback AI (the
    // raycaster pattern) keeps ships flying when the brain is quiet.
    if (req.method === "GET" && req.url === "/ev") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!doctype html><html><head><meta charset="utf-8"><title>SweK EV</title>
<style>body{margin:0;background:#05070d;color:#cfd8e3;font:12px monospace;overflow:hidden}
#hud{position:fixed;top:8px;left:8px}#map{position:fixed;top:8px;right:8px;background:#0d1017cc;border:1px solid #2a3242;border-radius:4px;padding:6px}</style></head><body>
<canvas id="c"></canvas><div id="hud"></div><div id="map"></div>
<script>
"use strict";
const cv=document.getElementById("c"),g=cv.getContext("2d");
cv.width=innerWidth;cv.height=innerHeight;
// v51 -- sparkline hit-test state (mousemove covers desktop; a tap
// lands as one move on mobile)
let sparkHover=null;
cv.addEventListener("mousemove",e=>{const x=e.clientX-(cv.width-96),y=e.clientY;
 sparkHover=(x>=0&&x<6*14&&y>=8&&y<=32&&((x%14)<10))?Math.floor(x/14):null;});
// --- jump graph: 6 systems, edges are gates ---
const SYS=[{n:"Sol",e:[1,2]},{n:"Vega",e:[0,3]},{n:"Rigel",e:[0,3,4]},{n:"Altair",e:[1,2,5]},{n:"Deneb",e:[2,5]},{n:"Kruger",e:[3,4]}];
function bfsRoute(a,b){if(a===b)return[a];const prev={};prev[a]=a;const q=[a];
 while(q.length){const s=q.shift();for(const nb of SYS[s].e){if(prev[nb]==null){prev[nb]=s;if(nb===b){const r=[b];let c=b;while(c!==a){c=prev[c];r.unshift(c);}return r;}q.push(nb);}}}
 return null;}
// --- factions -> brain kinds ---
const FACT={confed:{col:"#5ad8ff",kind:"ev_confed"},pirate:{col:"#ff6a5a",kind:"ev_pirate"}};
// --- ships: EV physics (thrust + rotation + inertia) ---
function mkShip(id,fac,sys){return{id:"ev-"+id,fac,sys,x:(Math.random()-0.5)*1200,y:(Math.random()-0.5)*800,
 vx:0,vy:0,a:Math.random()*6.28,hp:100,cool:0,route:null,tgt:null,
 attacks:[{name:"blaster",interval:0.9},{name:"missile",interval:3.2}]};}
const ships=[];for(let i=0;i<5;i++)ships.push(mkShip("c"+i,"confed",i%3));
for(let i=0;i<5;i++)ships.push(mkShip("p"+i,"pirate",(i%3)+3));
const player={sys:0,x:0,y:0,vx:0,vy:0,a:0,hp:100,cool:0,shots:0,hits:0};
// v40 -- EV FACTION DUEL through the existing recipe: ?duel=1 arms it,
// ?setTarget=&bestOf= set the terms. Ship-vs-ship combat turns on (the
// factions fight each other, not just the player), deaths tally, and
// the SAME bridge routes the engine uses get the kills -- the v25
// endgame logic rides along (already walked there; small copy here
// because this page is its own client, the node-twin precedent).
const Q=new URLSearchParams(location.search);
const EV_DUEL=Q.get("duel")==="1";
// v48 -- BIAS A/B (?biasab=1 under a duel): a coin at each SET start
// arms the pirate thumb (+0.15 local aggro bias) or leaves it clean;
// the set's winner ships with its arm. Set = randomization unit.
const BIAS_AB=EV_DUEL&&Q.get("biasab")==="1";
let biasArm=BIAS_AB?(Math.random()<0.5?"on":"off"):null;
const biasSetQ=[];
const DUEL={setTarget:Math.max(1,parseInt(Q.get("setTarget"))||5),bestOf:Math.max(1,parseInt(Q.get("bestOf"))||3),
 deaths:{A:0,B:0},sets:{A:0,B:0},setStart:{A:0,B:0},champion:null,lastPost:0};
// v41 -- EV REMATCH consumption (PATCH-B2m5 pattern): a crowned page
// polls the stamp on the duel-post cadence, arms + announces, resets
// synchronously next tick, applies terms, acks.
let evRematchArmed=null,evChampWallT=0,evRematchPollAt=0;
function rematchPoll(now){if(!EV_DUEL||!DUEL.champion||now-evRematchPollAt<30000)return;evRematchPollAt=now;
 fetch("/ai/brain/duel/rematch").then(r=>r.json()).then(j=>{
  if(j&&j.rematchAt&&j.rematchAt>evChampWallT&&!evRematchArmed){evRematchArmed={terms:j.terms||null};
   fetch("/sys/logs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({src:"ev",msg:"rematch armed -- resetting next tick"})}).catch(()=>{});}
 }).catch(()=>{});}
function rematchConsume(){if(!evRematchArmed)return;const terms=evRematchArmed.terms;evRematchArmed=null;
 DUEL.champion=null;evChampWallT=0;DUEL.sets={A:0,B:0};DUEL.setStart={A:DUEL.deaths.B,B:DUEL.deaths.A};
 if(terms&&terms.setTarget>0)DUEL.setTarget=terms.setTarget;
 if(terms&&terms.bestOf>0)DUEL.bestOf=terms.bestOf;
 for(const s of ships)if(s.hp<=0)s.hp=100;   // fresh fleet for the new series
 fetch("/ai/brain/duel/rematch/ack",{method:"POST"}).catch(()=>{});
 fetch("/sys/logs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({src:"ev",msg:"REMATCH! New series begins"+(terms?" (new terms)":"")+"."})}).catch(()=>{});}
function duelTick(now){rematchPoll(now);rematchConsume();
 if(!EV_DUEL||DUEL.champion||now-DUEL.lastPost<15000)return;DUEL.lastPost=now;
 const kA=DUEL.deaths.B-DUEL.setStart.A,kB=DUEL.deaths.A-DUEL.setStart.B;
 if(kA>=DUEL.setTarget||kB>=DUEL.setTarget){const w=kA>=DUEL.setTarget&&kA>=kB?"A":"B";
  DUEL.sets[w]++;DUEL.setStart={A:DUEL.deaths.B,B:DUEL.deaths.A};
  if(BIAS_AB){biasSetQ.push({arm:biasArm,pirateWon:w==="B"});biasArm=Math.random()<0.5?"on":"off";}   // v48 -- ship the set, re-coin
  const need=Math.ceil(DUEL.bestOf/2);
  if(DUEL.sets[w]>=need){DUEL.champion=w==="A"?"Confederation":"Pirates";evChampWallT=Date.now();}}
 fetch("/ai/brain/duel",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({killsA:DUEL.deaths.B,killsB:DUEL.deaths.A,energyA:0,energyB:0,
   nameA:"Confederation",nameB:"Pirates",setsA:DUEL.sets.A,setsB:DUEL.sets.B,
   setTarget:DUEL.setTarget,champion:DUEL.champion,game:"ev"})}).catch(()=>{});}
// v40 -- FREIGHTERS: three neutral traders; each leg is a trading
// episode. Prices per system per good (static spreads + slow noise);
// the pick is softmax over expected margins at EV_TRADE_T; the episode
// reports {scores, pIdx, p, margin} through the snapshot for the
// brain's boldness sweep. Margins REALIZE at dock (prices moved in
// transit -- the gap between expected and realized is the point).
const GOODS=["food","metal","tech"];
const PRICE=SYS.map((_,i)=>GOODS.map((g,j)=>10+((i*7+j*13)%9)+Math.sin(i+j)*2));
// v41 -- brain-served boldness: the field carries tradeT when the
// brain has one; 0.5 is the local fallback, same doctrine as combat.
const EV_TRADE_T=()=>((field&&typeof field.tradeT==="number")?field.tradeT:0.5);
// v41 -- freighters gain BODIES: in-system position + hull, so
// pirates can take them. Cargo is the stake: a pirated leg reports
// margin = -buyAt (the purchase is sunk), so bold routes through
// pirate space PRICE their risk into the boldness sweep -- the
// economy and the combat aggro finally share a ledger.
const traders=[0,1,2].map(i=>({id:"ev-t"+i,sys:i*2,dest:null,good:null,expect:0,buyAt:0,p:0,scores:null,pIdx:0,t:0,
 x:(Math.random()-0.5)*800,y:(Math.random()-0.5)*600,hp:60}));
const tradeQ=[];
// v42 -- ESCORTS: piracy heat rises on each taken freighter and decays
// (half-life ~35s); past 1.5, confeds convert to escorts -- anchored to
// the nearest live freighter, weapons hot. Aggro-REACTIVE protection:
// the loop piracy opened (bold legs -> losses -> boldness repriced)
// gets a counterforce (losses -> escorts -> pirates contested), and
// neither side needed a script -- heat and aggro do the arguing.
// v47 -- PER-SYSTEM heat: six tripwires, not one. Escort BEHAVIOR is
// local (confeds sortie where the trouble is); the RANDOMIZED
// experiment stays keyed to MAX heat across systems -- changing the
// randomization unit mid-experiment would fork the data, so the
// episode unit holds and this comment is the receipt.
const sysHeat=[0,0,0,0,0,0];
const maxHeat=()=>Math.max.apply(null,sysHeat);
// v43 -- ESCORT STATS: exposure-minutes and piracy counts per arm
// (escorts out vs calm). OBSERVATIONAL, and the page says so in the
// data it ships: escorts exist BECAUSE piracy spiked, so the arms are
// not randomized -- the brain's report states the confounding rather
// than hiding it behind a rate ratio.
const escortStats={escortS:0,calmS:0,piratedEscort:0,piratedCalm:0};
// v43 -- the escort THRESHOLD is brain-served like aggro and tradeT
// v44 -- RANDOMIZED threshold test: at each heat-EPISODE start (heat
// crossing 0.5 upward), a coin assigns the arm -- served-0.3 (lo,
// escorts earlier) or served+0.3 (hi, later) -- BEFORE any outcomes
// exist, which is exactly what breaks the v43 confounding. The episode
// records its arm, duration, and piracies, and ships when heat decays
// back under 0.5. Episodes are the comparable unit.
let epArm=null,epJit=0,epStart=0,epPirated=0,epBySys=[0,0,0,0,0,0];
const escortEpQ=[];
// v48 -- per-system reads: the local tripwire when the brain serves the
// array, the scalar otherwise, 1.5 as the last fallback; the experiment
// jitter shifts ALL six uniformly (one coin, one contrast -- shifting
// only some systems would blur what the arm even means).
const ESCORT_TH=(si)=>{
 let base=1.5;
 if(field&&Array.isArray(field.escortThresholds)&&typeof field.escortThresholds[si]==="number")base=field.escortThresholds[si];
 else if(field&&typeof field.escortThreshold==="number")base=field.escortThreshold;
 return base+epJit;};
function tradeTick(dt){for(const tr of traders){
 if(tr.dest==null){
  const opts=[];SYS[tr.sys].e.forEach(d=>GOODS.forEach((g,gi)=>opts.push({d,gi,m:PRICE[d][gi]-PRICE[tr.sys][gi]})));
  const mx=Math.max(...opts.map(o=>o.m));
  const ex=opts.map(o=>Math.exp((o.m-mx)/EV_TRADE_T()));const Z=ex.reduce((a,b)=>a+b,0);
  let r=Math.random(),pi=0;for(let k=0;k<opts.length;k++){r-=ex[k]/Z;if(r<=0){pi=k;break;}}
  tr.dest=opts[pi].d;tr.good=opts[pi].gi;tr.expect=opts[pi].m;tr.buyAt=PRICE[tr.sys][opts[pi].gi];
  tr.p=ex[pi]/Z;tr.scores=opts.map(o=>o.m);tr.pIdx=pi;tr.t=2+Math.random()*2;}
 else{tr.t-=dt;
  // v41 -- in the player's system, the freighter is a body drifting
  // gateward; elsewhere it stays abstract (same clock either way)
  if(tr.sys===player.sys&&tr.hp>0){tr.x+=30*dt;tr.y*=0.999;}
  if(tr.hp<=0){ // pirated: the leg's episode reports the sunk purchase
   sysHeat[tr.sys]+=1.2;   // v42/v47 -- heat lands where the crime did
   if(sysHeat[tr.sys]>ESCORT_TH(tr.sys))escortStats.piratedEscort++;else escortStats.piratedCalm++;   // v43/v47/v48 -- fully local
   if(epArm!=null){epPirated++;epBySys[tr.sys]++;}   // v44/v51 -- episode- and system-attributed
   tradeQ.push({scores:tr.scores,pIdx:tr.pIdx,p:tr.p,margin:-tr.buyAt,pirated:true,sys:tr.sys});   // v48 -- died here
   tr.sys=(Math.random()*6)|0;tr.dest=null;tr.hp=60;tr.x=(Math.random()-0.5)*800;tr.y=(Math.random()-0.5)*600;
   fetch("/sys/logs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({src:"ev",msg:tr.id+" pirated -- cargo lost (margin -"+tr.buyAt.toFixed(1)+")"})}).catch(()=>{});
   continue;}
  if(tr.t<=0){
  const margin=PRICE[tr.dest][tr.good]-tr.buyAt;
  tradeQ.push({scores:tr.scores,pIdx:tr.pIdx,p:tr.p,margin,sys:tr.dest});   // v48 -- landed here
  tr.sys=tr.dest;tr.dest=null;}}}
 if(Math.random()<dt*0.5){const s=(Math.random()*6)|0,g=(Math.random()*3)|0;PRICE[s][g]=Math.max(4,PRICE[s][g]+(Math.random()-0.5)*1.5);}}
const shots=[];const keys={};
addEventListener("keydown",e=>keys[e.key]=1);addEventListener("keyup",e=>keys[e.key]=0);
// --- brain mailbox: same snapshot round-trip the engine uses ---
let field=null,lastSnap=0,outQ=[];
function snapshot(now){if(now-lastSnap<1000)return;lastSnap=now;
 const local=ships.filter(s=>s.sys===player.sys&&s.hp>0);
 const roster=local.map(s=>({id:s.id,kind:FACT[s.fac].kind,hp:s.hp/100,
  pos:[s.x,0,s.y],tspd:Math.hypot(s.vx,s.vy),
  dist:Math.hypot(s.x-player.x,s.y-player.y),
  attacks:s.attacks.map(a=>({name:a.name,interval:a.interval}))}));
 fetch("/ai/brain/snapshot",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({src:"ev",player:{pos:[player.x,0,player.y],hp:player.hp/100,acc:player.shots?player.hits/player.shots:null},roster,outcomes:outQ.splice(0),trades:tradeQ.splice(0),escortStats,escortEpisodes:escortEpQ.splice(0),biasSets:biasSetQ.splice(0)})})
  .then(r=>r.json()).then(j=>{if(j&&j.field)field=j.field;}).catch(()=>{});}
function brainPick(s){ // served attack map if present; local fallback otherwise
 const m=field&&field.attacks&&field.attacks[s.id];
 if(m&&m.name){for(const a of s.attacks)if(a.name===m.name)return a;}
 return s.attacks[0];}
function brainAggro(s){const a=field&&field.aggro&&(field.aggro[s.id]!=null?field.aggro[s.id]:field.aggro);
 let ag=typeof a==="number"?a:0.5;
 // v46 -- faction bias rides the field (the TEMPER_BIAS precedent);
 // applied at read time, clamped to keep aggro an honest probability
 const fb=field&&field.factionBias&&field.factionBias[FACT[s.fac].kind];
 if(typeof fb==="number")ag=Math.max(0,Math.min(1,ag+fb));
 // v48/v49 -- the experimental thumb, at the LADDER'S dose: the brain
 // serves biasABMag (found ?? current); 0.15 only as cold fallback
 if(biasArm==="on"&&s.fac==="pirate"){const m=(field&&typeof field.biasABMag==="number")?field.biasABMag:0.15;ag=Math.min(1,ag+m);}
 return ag;}
// --- sim ---
let last=performance.now();
function tick(now){const dt=Math.min(0.05,(now-last)/1000);last=now;
 // player controls: arrows thrust/rotate, space fire, j jump at >600u from center
 if(keys.ArrowLeft)player.a-=2.4*dt;if(keys.ArrowRight)player.a+=2.4*dt;
 if(keys.ArrowUp){player.vx+=Math.cos(player.a)*140*dt;player.vy+=Math.sin(player.a)*140*dt;}
 player.x+=player.vx*dt;player.y+=player.vy*dt;player.cool-=dt;
 if(keys[" "]&&player.cool<=0){player.cool=0.35;shots.push({x:player.x,y:player.y,vx:Math.cos(player.a)*420+player.vx,vy:Math.sin(player.a)*420+player.vy,ttl:1.4,from:"player",sys:player.sys});}
 if(keys.j&&Math.hypot(player.x,player.y)>600){const opts=SYS[player.sys].e;player.sys=opts[(Math.random()*opts.length)|0];player.x=-player.x*0.3;player.y=-player.y*0.3;keys.j=0;}
 // AI ships
 for(const s of ships){if(s.hp<=0)continue;
  if(s.sys!==player.sys){ // off-screen: graph travel via BFS toward the player's system
   if(!s.route||s.route[0]!==s.sys||s.route[s.route.length-1]!==player.sys)s.route=bfsRoute(s.sys,player.sys);
   if(s.route&&s.route.length>1&&Math.random()<0.15*dt*10)s.sys=s.route[1],s.route.shift();
   continue;}
  const ag=brainAggro(s);
  const dx=player.x-s.x,dy=player.y-s.y,d=Math.hypot(dx,dy)||1;
  const want=s.fac==="pirate"?(ag>0.35?1:-1):((ag>0.65||sysHeat[s.sys]>ESCORT_TH(s.sys))?1:0); // v42/v47/v48
  const ta=Math.atan2(dy*want,dx*want);let da=((ta-s.a+9.42)%6.28)-3.14;
  s.a+=Math.max(-2*dt,Math.min(2*dt,da));
  if(want!==0){s.vx+=Math.cos(s.a)*110*dt;s.vy+=Math.sin(s.a)*110*dt;}
  s.vx*=0.995;s.vy*=0.995;s.x+=s.vx*dt;s.y+=s.vy*dt;s.cool-=dt;
  // v40 -- under a duel, the nearest ENEMY SHIP outranks the player
  let fx=player.x,fy=player.y;
  if(EV_DUEL){let bd=1e9,bs=null;
   for(const o of ships){if(o.hp>0&&o.sys===s.sys&&o.fac!==s.fac){const od=Math.hypot(o.x-s.x,o.y-s.y);if(od<bd){bd=od;bs=o;}}}
   if(bs){fx=bs.x;fy=bs.y;}}
  // v41 -- hot pirates prefer a freighter in reach over anything else
  if(s.fac==="pirate"&&ag>0.5){let bd2=500,bt=null;
   for(const tr of traders){if(tr.hp>0&&tr.sys===s.sys&&tr.dest!=null){const td=Math.hypot(tr.x-s.x,tr.y-s.y);if(td<bd2){bd2=td;bt=tr;}}}
   if(bt){fx=bt.x;fy=bt.y;}}
  // v42 -- escort duty: under piracy heat, confeds anchor to freighters
  let escort=false;
  if(s.fac==="confed"&&sysHeat[s.sys]>ESCORT_TH(s.sys)){   // v47/v48 -- local heat, local tripwirelet bd3=1e9,bt3=null;
   for(const tr of traders){if(tr.hp>0&&tr.sys===s.sys&&tr.dest!=null){const td=Math.hypot(tr.x-s.x,tr.y-s.y);if(td<bd3){bd3=td;bt3=tr;}}}
   if(bt3){fx=bt3.x;fy=bt3.y;escort=true;}}
  const dd=Math.hypot(fx-s.x,fy-s.y)||1;
  if(want>0&&dd<380&&Math.abs(da)<0.5&&s.cool<=0){const w=brainPick(s);
   s.cool=w.interval*(1.55-0.9*ag); // aggro cadence, the rc formula
   const sp=w.name==="missile"?260:430;
   shots.push({x:s.x,y:s.y,vx:Math.cos(s.a)*sp+s.vx,vy:Math.sin(s.a)*sp+s.vy,ttl:w.name==="missile"?2.6:1.3,from:s.id,w:w.name,sys:s.sys});}}
 // shots + outcomes back to the brain
 for(let i=shots.length-1;i>=0;i--){const sh=shots[i];sh.ttl-=dt;sh.x+=sh.vx*dt;sh.y+=sh.vy*dt;
  let hit=false;
  if(sh.from==="player"){for(const s of ships){if(s.hp>0&&s.sys===sh.sys&&Math.hypot(s.x-sh.x,s.y-sh.y)<16){s.hp-=25;hit=true;
    if(s.hp<=0&&EV_DUEL)DUEL.deaths[s.fac==="confed"?"A":"B"]++;
    break;}}player.shots++;if(hit)player.hits++;}
  else{for(const s2 of ships){if(s2.hp>0&&s2.id!==sh.from&&s2.sys===sh.sys&&Math.hypot(s2.x-sh.x,s2.y-sh.y)<16){
    const shooter=ships.find(x=>x.id===sh.from);
    if(shooter&&s2.fac!==shooter.fac){s2.hp-=sh.w==="missile"?18:8;hit=true;
     if(s2.hp<=0&&EV_DUEL)DUEL.deaths[s2.fac==="confed"?"A":"B"]++;}
    break;}}
   // v41 -- freighters are soft targets
   if(!hit){for(const tr of traders){if(tr.hp>0&&tr.sys===sh.sys&&tr.dest!=null&&Math.hypot(tr.x-sh.x,tr.y-sh.y)<18){tr.hp-=sh.w==="missile"?24:10;hit=true;break;}}}}
  else if(sh.sys===player.sys&&Math.hypot(player.x-sh.x,player.y-sh.y)<14){player.hp-=sh.w==="missile"?18:8;hit=true;}
  if(hit||sh.ttl<=0){if(sh.from!=="player")outQ.push({id:sh.from,name:sh.w,hit:!!hit,p:1});shots.splice(i,1);}}
 for(let si=0;si<6;si++)sysHeat[si]*=Math.pow(0.5,dt/35);
 // v44 -- episode lifecycle: coin at ignition, ship at cooldown
 // (keyed to MAX heat -- the experiment's unit holds, see sysHeat note)
 if(epArm==null&&maxHeat()>0.5){epArm=Math.random()<0.5?"lo":"hi";epJit=epArm==="lo"?-0.3:0.3;epStart=now;epPirated=0;epBySys=[0,0,0,0,0,0];}
 else if(epArm!=null&&maxHeat()<=0.5){const durS=(now-epStart)/1000;
  if(durS>=10)escortEpQ.push({arm:epArm,durS:Math.round(durS),pirated:epPirated,bySys:epBySys});   // v51 -- bySys rides along
  epArm=null;epJit=0;}
 if(maxHeat()>ESCORT_TH(player.sys))escortStats.escortS+=dt;else escortStats.calmS+=dt;tradeTick(dt);duelTick(now);snapshot(now);draw();requestAnimationFrame(tick);}
function draw(){g.fillStyle="#05070d";g.fillRect(0,0,cv.width,cv.height);
 const ox=cv.width/2-player.x,oy=cv.height/2-player.y;
 g.strokeStyle="#1a2233";g.beginPath();g.arc(cv.width/2-player.x*0+ox+player.x,oy+player.y,600,0,6.28);g.stroke();
 for(const s of ships){if(s.hp<=0||s.sys!==player.sys)continue;
  g.save();g.translate(ox+s.x,oy+s.y);g.rotate(s.a);g.fillStyle=FACT[s.fac].col;
  g.beginPath();g.moveTo(10,0);g.lineTo(-7,6);g.lineTo(-7,-6);g.fill();g.restore();
  g.fillStyle="#333";g.fillRect(ox+s.x-12,oy+s.y-14,24,3);g.fillStyle="#9ecb5a";g.fillRect(ox+s.x-12,oy+s.y-14,24*s.hp/100,3);}
 g.save();g.translate(cv.width/2,cv.height/2);g.rotate(player.a);g.fillStyle="#ffd35a";
 g.beginPath();g.moveTo(12,0);g.lineTo(-8,7);g.lineTo(-8,-7);g.fill();g.restore();
 // v41 -- freighters render as boxy hulls
 for(const tr of traders){if(tr.hp<=0||tr.sys!==player.sys||tr.dest==null)continue;
  g.fillStyle="#9ecb5a";g.fillRect(ox+tr.x-8,oy+tr.y-5,16,10);
  g.fillStyle="#333";g.fillRect(ox+tr.x-10,oy+tr.y-11,20,3);g.fillStyle="#9ecb5a";g.fillRect(ox+tr.x-10,oy+tr.y-11,20*tr.hp/60,3);}
 g.fillStyle="#ffb454";for(const sh of shots)if(sh.sys===player.sys)g.fillRect(ox+sh.x-1.5,oy+sh.y-1.5,3,3);
 // v50/v51 -- HUD sparkline with HIT-TEST: hover (or tap) a bar and
 // it names itself -- system and served threshold -- because a chart
 // that cannot answer "which one is that" is decoration.
 if(field&&Array.isArray(field.escortThresholds)){
  for(let si=0;si<6;si++){const v=field.escortThresholds[si];if(typeof v!=="number")continue;
   const hgt=Math.max(2,Math.round((2.5-v)/1.7*12));
   g.fillStyle=v<1.2?"#ff6a5a":"#9ecb5a";g.fillRect(cv.width-96+si*14,26-hgt,10,hgt);
   if(si===player.sys){g.fillStyle="#fff";g.fillRect(cv.width-96+si*14,28,10,2);}}
  if(sparkHover!=null&&typeof field.escortThresholds[sparkHover]==="number"){
   g.fillStyle="#dfe6f3";g.font="11px monospace";g.textAlign="right";
   g.fillText(SYS[sparkHover].n+": th "+field.escortThresholds[sparkHover].toFixed(2),cv.width-8,44);
   g.textAlign="left";}}
 document.getElementById("hud").textContent="["+SYS[player.sys].n+"]  hp "+Math.max(0,player.hp|0)+"  |  arrows fly, space fire, j jump (past the ring)  |  brain: "+(field?"SERVED":"local fallback")+(EV_DUEL?("  |  DUEL sets "+DUEL.sets.A+"-"+DUEL.sets.B+(DUEL.champion?(" CHAMPION: "+DUEL.champion):"")):"")+(maxHeat()>ESCORT_TH(player.sys)?"  |  ESCORTS OUT (max heat "+maxHeat().toFixed(1)+", here "+sysHeat[player.sys].toFixed(1)+")":"");
 document.getElementById("map").textContent=SYS.map((s,i)=>(i===player.sys?"> ":"  ")+s.n+" ["+ships.filter(x=>x.sys===i&&x.hp>0).length+"]"+(sysHeat[i]>0.3?(" ~"+sysHeat[i].toFixed(1)):"")).join("\n");}
requestAnimationFrame(tick);
</script></body></html>`);
        return;
    }
    // v76 -- ONE-CLICK EVIDENCE BUNDLE: everything phase 76-77 needs,
    // zipped server-side with a ZERO-DEP store-only ZIP writer (proven
    // against unzip AND python zipfile before it came here; no npm
    // package enters server.js for this). Collects: brain/*.json,
    // tools/verify_timing.json + verify_config.json, the brain's
    // milestone lines out of SYS_LOG (the promoted birth line rides
    // there), the live console html via an internal self-fetch, and a
    // meta.txt naming what is present and what is not.
    if (req.method === "GET" && req.url === "/ai/brain/evidence.zip") {
        const crc32ev = (buf) => {
            let tb = crc32ev._t;
            if (!tb) { tb = crc32ev._t = new Uint32Array(256);
                for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } }
            let c = 0xFFFFFFFF;
            for (let i = 0; i < buf.length; i++) c = tb[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        };
        const buildZipEv = (entries) => {
            const chunks = [], central = []; let offset = 0;
            for (const { name, data } of entries) {
                const nameB = Buffer.from(name, "utf-8"); const crc = crc32ev(data);
                const lh = Buffer.alloc(30);
                lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
                lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
                lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
                lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
                chunks.push(lh, nameB, data);
                const ch = Buffer.alloc(46);
                ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
                ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
                ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
                ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
                central.push(Buffer.concat([ch, nameB]));
                offset += lh.length + nameB.length + data.length;
            }
            const cd = Buffer.concat(central); const eocd = Buffer.alloc(22);
            eocd.writeUInt32LE(0x06054b50, 0);
            eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
            eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
            return Buffer.concat([...chunks, cd, eocd]);
        };
        (async () => {
            const fsE = require("fs"), pathE = require("path"), httpE = require("http");
            const entries = [], missing = [];
            const addFile = (label, abs) => {
                try { entries.push({ name: label, data: fsE.readFileSync(abs) }); }
                catch { missing.push(label); }
            };
            try {
                for (const f of fsE.readdirSync(pathE.join(__dirname, "../brain")))
                    if (f.endsWith(".json")) addFile("brain/" + f, pathE.join(__dirname, "../brain", f));
            } catch { missing.push("brain/*.json (dir unreadable)"); }
            addFile("tools/verify_timing.json", pathE.join(__dirname, "../tools/verify_timing.json"));
            addFile("tools/verify_config.json", pathE.join(__dirname, "../tools/verify_config.json"));
            const brainLines = (typeof SYS_LOG !== "undefined" ? SYS_LOG : []).filter(l => String(l && l.msg || l).includes("[brain"));
            entries.push({ name: "milestones.txt", data: Buffer.from(brainLines.map(l => typeof l === "string" ? l : JSON.stringify(l)).join("\n") + "\n") });
            // the live console, via self-fetch on our own bound port
            const consoleHtml = await new Promise((resolve) => {
                const t = setTimeout(() => resolve(null), 5000);
                try {
                    httpE.get({ host: "127.0.0.1", port: req.socket.localPort, path: "/ai/brain/console" }, (r) => {
                        let d = ""; r.on("data", c => d += c); r.on("end", () => { clearTimeout(t); resolve(d); });
                    }).on("error", () => { clearTimeout(t); resolve(null); });
                } catch { clearTimeout(t); resolve(null); }
            });
            if (consoleHtml) entries.push({ name: "console.html", data: Buffer.from(consoleHtml) });
            else missing.push("console.html (self-fetch failed)");
            entries.push({ name: "meta.txt", data: Buffer.from(
                "evidence bundle " + new Date().toISOString() + "\n" +
                "files: " + entries.length + ", milestones lines: " + brainLines.length + "\n" +
                (missing.length ? "MISSING (named, not hidden): " + missing.join(", ") + "\n" : "nothing missing\n")) });
            const zip = buildZipEv(entries);
            res.writeHead(200, { "content-type": "application/zip",
                "content-disposition": "attachment; filename=evidence-" + new Date().toISOString().slice(0, 10) + ".zip" });
            res.end(zip);
        })().catch(() => { try { res.writeHead(500); res.end("bundle failed"); } catch {} });
        return;
    }
    // v57 -- the offline report, served: the console had no way to
    // reach it (audited: no route, no link -- the hook smoked out a
    // gap, not just a missing label). Static file, mtime honest.
    // v2070 -- THE MIND, LIVE: a visual interpretation of what the brain is
    // doing AS it does it. Reads the real solved field from the mailbox --
    // flow vectors (where enemies are pushed), the player-seek field, the
    // threat heat map, goals, and live learning stats -- and animates flow
    // particles riding the field so DIRECTION shows as motion, not just
    // arrows. Pure client-side canvas; polls /ai/brain/flowfield + /health.
    if (req.method === "GET" && (req.url === "/ai/brain/mind" || req.url === "/ai/brain/mind/view")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'" });
        res.end(`<!doctype html><meta charset="utf-8"><title>GPU Brain — the mind, live</title>
<style>
  html,body{margin:0;background:#0a0d12;color:#cfd8e3;font:12px ui-monospace,monospace;overflow:hidden}
  #wrap{position:fixed;inset:0}
  canvas{position:absolute;inset:0;width:100%;height:100%}
  #hud{position:fixed;top:10px;left:12px;z-index:5;background:rgba(16,20,28,.82);border:1px solid #263042;border-radius:10px;padding:10px 13px;max-width:340px;backdrop-filter:blur(4px)}
  #hud h1{margin:0 0 6px;font-size:13px;color:#8ab4ff;letter-spacing:.08em}
  .row{display:flex;justify-content:space-between;gap:14px;padding:1px 0}
  .k{color:#78849a}.v{color:#e8eef6}
  #state{font-weight:700}
  .legend{position:fixed;bottom:10px;left:12px;z-index:5;font-size:11px;color:#8a94a6;background:rgba(16,20,28,.7);border:1px solid #222c3a;border-radius:8px;padding:7px 10px}
  .legend b{color:#cfd8e3}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}
  #idle{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:#556;font-size:14px;text-align:center;z-index:4;pointer-events:none}
</style>
<div id="wrap">
  <canvas id="heat"></canvas>
  <canvas id="flow"></canvas>
  <canvas id="fx"></canvas>
</div>
<div id="hud">
  <h1>◈ GPU BRAIN — LIVE MIND</h1>
  <div class="row"><span class="k">state</span><span class="v" id="state">—</span></div>
  <div class="row"><span class="k">solve time</span><span class="v" id="solveMs">—</span></div>
  <div class="row"><span class="k">grid</span><span class="v" id="grid">—</span></div>
  <div class="row"><span class="k">kaiju decided</span><span class="v" id="kcount">—</span></div>
  <div class="row"><span class="k">goals</span><span class="v" id="goals">—</span></div>
  <div class="row"><span class="k">learn steps</span><span class="v" id="steps">—</span></div>
  <div class="row"><span class="k">avg reward</span><span class="v" id="reward">—</span></div>
</div>
<div class="legend">
  <span class="dot" style="background:#3a6ea5"></span><b>flow</b> — where enemies are told to move &nbsp;
  <span class="dot" style="background:#ff5a5a"></span><b>threat</b> — danger heat &nbsp;
  <span class="dot" style="background:#ffd35a"></span><b>goal</b> &nbsp;
  <span class="dot" style="background:#4ade80"></span><b>player-seek</b>
</div>
<div id="idle">waiting for the brain to solve…<br><span style="font-size:11px">(fire up a GPU Brain test — an empty world gives the brain nothing to think about)</span></div>
<script>
const heat=document.getElementById("heat"),flow=document.getElementById("flow"),fxc=document.getElementById("fx");
const hc=heat.getContext("2d"),fc=flow.getContext("2d"),xc=fxc.getContext("2d");
let W=0,H=0,DPR=Math.min(2,window.devicePixelRatio||1);
function resize(){W=innerWidth;H=innerHeight;for(const c of [heat,flow,fxc]){c.width=W*DPR;c.height=H*DPR;c.getContext("2d").setTransform(DPR,0,0,DPR,0,0);}}
addEventListener("resize",resize);resize();
let field=null, particles=[];
function idx(x,z,cols){return z*cols+x;}
// animated flow particles ride the field so motion shows direction over time
function seedParticles(cols,rows){particles=[];for(let i=0;i<520;i++)particles.push({x:Math.random()*cols,z:Math.random()*rows,life:Math.random()*60});}
function draw(){
  requestAnimationFrame(draw);
  if(!field||!field.fx){return;}
  const cols=field.w||field.cols, rows=field.h||field.rows;
  if(!cols||!rows)return;
  const cw=W/cols, ch=H/rows;
  // --- threat heat underlay (fades each frame for a glow trail) ---
  hc.globalCompositeOperation="source-over";hc.fillStyle="rgba(10,13,18,0.18)";hc.fillRect(0,0,W,H);
  if(field.threat){hc.globalCompositeOperation="lighter";
    for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){const t=field.threat[idx(x,z,cols)];
      if(t==null||t>=9990)continue;const d=Math.max(0,1-t/28);if(d<=0.02)continue;
      hc.fillStyle="rgba("+(255)+","+Math.round(90*(1-d))+",60,"+(0.10+0.42*d*d)+")";
      hc.fillRect(x*cw,z*ch,cw+1,ch+1);}}
  // --- flow particles (the moving mind: enemies pushed along fx/fz) ---
  fc.globalCompositeOperation="source-over";fc.fillStyle="rgba(10,13,18,0.14)";fc.fillRect(0,0,W,H);
  fc.globalCompositeOperation="lighter";
  for(const p of particles){
    const xi=Math.max(0,Math.min(cols-1,p.x|0)), zi=Math.max(0,Math.min(rows-1,p.z|0));
    const vx=field.fx[idx(xi,zi,cols)]||0, vz=field.fz[idx(xi,zi,cols)]||0;
    const px=p.x*cw, pz=p.z*ch;
    p.x+=vx*0.9;p.z+=vz*0.9;p.life--;
    if(p.life<0||p.x<0||p.z<0||p.x>=cols||p.z>=rows){p.x=Math.random()*cols;p.z=Math.random()*rows;p.life=40+Math.random()*40;continue;}
    const spd=Math.min(1,Math.hypot(vx,vz)*3);
    fc.strokeStyle="rgba("+(60+120*spd)+","+(120+80*spd)+",220,"+(0.15+0.5*spd)+")";
    fc.lineWidth=1+spd;fc.beginPath();fc.moveTo(px,pz);fc.lineTo(p.x*cw,p.z*ch);fc.stroke();
  }
  // --- static overlay: arrow grid (sparse) + player-seek + goals ---
  xc.clearRect(0,0,W,H);
  const step=Math.max(1,Math.round(cols/26));
  for(let z=0;z<rows;z+=step)for(let x=0;x<cols;x+=step){
    const vx=field.fx[idx(x,z,cols)]||0, vz=field.fz[idx(x,z,cols)]||0;const m=Math.hypot(vx,vz);
    if(m<0.02)continue;const cx=(x+0.5)*cw, cy=(z+0.5)*ch, s=Math.min(cw,ch)*0.42;
    const nx=vx/m, nz=vz/m;xc.strokeStyle="rgba(120,170,255,0.5)";xc.lineWidth=1.3;
    xc.beginPath();xc.moveTo(cx-nx*s,cy-nz*s);xc.lineTo(cx+nx*s,cy+nz*s);
    xc.lineTo(cx+nx*s-(nx*4+nz*3),cy+nz*s-(nz*4-nx*3));xc.stroke();
  }
  if(field.pfx&&field.pfz){for(let z=0;z<rows;z+=step)for(let x=0;x<cols;x+=step){
    const vx=field.pfx[idx(x,z,cols)]||0, vz=field.pfz[idx(x,z,cols)]||0;const m=Math.hypot(vx,vz);
    if(m<0.05)continue;const cx=(x+0.5)*cw, cy=(z+0.5)*ch, s=Math.min(cw,ch)*0.3;
    xc.strokeStyle="rgba(74,222,128,0.4)";xc.lineWidth=1;xc.beginPath();
    xc.moveTo(cx,cy);xc.lineTo(cx+vx/m*s,cy+vz/m*s);xc.stroke();}}
  if(field.goals){for(const g of field.goals){if(g==null)continue;
    const gx=((g.x-(field.ox||0))/(field.cell||1)+0.5)*cw, gz=((g.z-(field.oz||0))/(field.cell||1)+0.5)*ch;
    xc.fillStyle="rgba(255,211,90,0.9)";xc.beginPath();xc.arc(gx,gz,5,0,7);xc.fill();
    xc.strokeStyle="rgba(255,211,90,0.4)";xc.lineWidth=1;xc.beginPath();xc.arc(gx,gz,10+4*Math.sin(Date.now()/300),0,7);xc.stroke();}}
}
draw();
async function poll(){
  try{
    const j=await fetch("/ai/brain/flowfield",{cache:"no-store"}).then(r=>r.json());
    const h=await fetch("/ai/brain/health",{cache:"no-store"}).then(r=>r.json()).catch(()=>({}));
    if(j&&j.ok&&j.field&&j.field.fx){
      const wasEmpty=!field||!field.fx;field=j.field;
      const cols=field.w||field.cols,rows=field.h||field.rows;
      if(wasEmpty&&cols&&rows)seedParticles(cols,rows);
      document.getElementById("idle").style.display="none";
      document.getElementById("grid").textContent=cols+"×"+rows;
      document.getElementById("solveMs").textContent=(field.solveMs!=null?field.solveMs+" ms":"—");
      document.getElementById("kcount").textContent=field.attack?Object.keys(field.attack).length:0;
      document.getElementById("goals").textContent=field.goals?field.goals.length:0;
      if(field.learn&&field.learn.attack){document.getElementById("steps").textContent=field.learn.attack.steps??"—";
        document.getElementById("reward").textContent=(field.learn.attack.avgReward!=null?(+field.learn.attack.avgReward).toFixed(3):"—");}
    }else{document.getElementById("idle").style.display="flex";field=null;}
    const st=h.state||"—";const el=document.getElementById("state");el.textContent=st;
    el.style.color=st==="live"?"#4ade80":st==="idle"?"#ffd35a":st==="stale"?"#ff9f43":"#ff5a5a";
  }catch(e){document.getElementById("state").textContent="unreachable";document.getElementById("state").style.color="#ff5a5a";}
  setTimeout(poll,250);
}
poll();
</script>
`);
        return;
    }
    if (req.method === "GET" && req.url === "/ai/brain/report") {
        try {
            const fsR = require("fs"), pathR = require("path");
            const rp = pathR.join(__dirname, "../brain/snapshots/report.html");
            const body = fsR.readFileSync(rp);
            // v58 -- CSP: the report's banner and fold toggles are INLINE
            // scripts by design, so 'unsafe-inline' is required, not lax --
            // the win is default-src 'none': nothing external can load or
            // run, ever. One line, LAN-honest.
            res.writeHead(200, { "content-type": "text/html; charset=utf-8",
                "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:" });
            return res.end(body);
        } catch {
            res.writeHead(404, { "content-type": "text/plain" });
            return res.end("no report generated yet -- run brain/report.js");
        }
    }
    if (req.method === "GET" && req.url === "/ai/brain/console") {
        const readJ = (rel) => { try { return JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../brain", rel), "utf-8")); } catch { return null; } };
        // v36 -- EVIDENCE FRESHNESS per ladder: the state file's mtime IS
        // the moment its evidence last moved. Amber when the engine has
        // been alive (heartbeat) for 10+ minutes past the file's last
        // write -- the ladder is not just old, it is old WHILE data was
        // flowing, which is the suspicious kind of old.
        const mtOf = (rel) => { try { return require("fs").statSync(require("path").join(__dirname, "../brain", rel)).mtimeMs; } catch { return null; } };
        const asOf = (rel) => {
            const mt = mtOf(rel);
            if (mt == null) return "-";
            const stale = gpuBrain.engineLastSeen && (gpuBrain.engineLastSeen - mt) > 600000;
            const txt = new Date(mt).toLocaleTimeString();
            return stale ? `<span style="color:#ffb454">${txt} (stale while engine alive)</span>` : txt;
        };
        const rows = [];   // v46 -- entries carry a game group as element 5
        const G_ENGINE = "engine (kaiju / dungeon / raycaster)", G_EV = "escape velocity";
        const sweep = readJ("t_sweep_state.json");
        rows.push(["T (global)",
            sweep && sweep.adoptedT != null ? "ADOPTED T=" + sweep.adoptedT : "running default 0.35",
            sweep ? "streak " + (sweep.streak || 0) + " on T=" + (sweep.streakT ?? "-") : "no sweeps yet",
            sweep && sweep.adoptedT != null ? "monitoring" : "K agreeing sweeps + margin + BRAIN_ATK_T_AUTO=adopt",
            asOf("t_sweep_state.json"), G_ENGINE]);
        const dom = (sweep && sweep.dom) || {};
        for (const d of Object.keys(dom)) {
            rows.push(["T (" + d + ")",
                dom[d].adoptedT != null ? "ADOPTED T=" + dom[d].adoptedT : "follows global",
                "streak " + (dom[d].streak || 0) + " on T=" + (dom[d].streakT ?? "-"),
                dom[d].adoptedT != null ? "monitoring" : "domain streak + margin + gate",
                asOf("t_sweep_state.json"), d === "ev" ? G_EV : G_ENGINE]);
        }
        const fmtDab = (dab, file) => dab
            ? (dab.resolved
                ? (dab.resolved.mode === "promoted"
                    ? "RESOLVED: theta=" + Number(dab.resolved.theta ?? 0).toFixed(2) + " promoted" +
                      (dab.resolved.post ? " (drift watch: " + dab.resolved.post.length + " sessions, streak " + (dab.resolved.driftStreak || 0) + ")" : "")
                    : "RESOLVED: retired")
                : "running, theta=" + Number(dab.theta ?? 0).toFixed(2) + ", step=" + Number(dab.step ?? 0.05).toFixed(3))
            : "not started";
        const dab = readJ("difficulty_ab.json");
        rows.push(["Difficulty A/B (raycaster)", fmtDab(dab),
            (dab ? micro57("raycaster") + "sessions " + ((dab.arms && dab.arms.heuristic || []).length) + "H / " + ((dab.arms && dab.arms.learned || []).length) + "L, verdict streak " + (dab.verdictStreak || 0) : "-"),   // v57 -- micro twin
            dab && dab.resolved ? (dab.resolved.mode === "promoted" ? "drift re-opens via gate" : "delete file to rerun") : "K decisive verdicts + BRAIN_DIFF_AUTO=adopt",
            asOf("difficulty_ab.json"), G_ENGINE]);
        const dgn = readJ("difficulty_ab_dgn.json");
        // v57 -- micro endpoint twins (the v53 inline pattern on the v50
        // diary): tDur gold line, tHp cyan dashed, per dom, legacy
        // untagged rows lifted to raycaster (the v55 rule)
        const dab57 = readJ("diff_ab_history.json");
        const micro57 = (dom) => {
            if (!Array.isArray(dab57)) return "";
            const hist = dab57.filter(e => (e.dom ?? "raycaster") === dom);
            if (hist.length < 2) return "";
            const all = hist.flatMap(e => [e.tDur, e.tHp]).filter(v => v != null);
            const lo = Math.min(-2.5, ...all), span = Math.max(...all, 2.5) - lo || 1;
            const mx = i => 2 + i / (hist.length - 1) * 76, my = v => 14 - (v - lo) / span * 12;
            const line = (key, col, dash) => {
                const pts = hist.map((e, i) => e[key] == null ? null : mx(i).toFixed(1) + "," + my(e[key]).toFixed(1)).filter(Boolean);
                // v58 -- n rides the title: significance without n is
                // theater, even at 80px (the v19 line, third citation)
                const nKey = key === "tDur" ? "nDur" : "nHp";
                return pts.length > 1 ? "<polyline points='" + pts.join(" ") + "' fill='none' stroke='" + col + "' stroke-width='1'" + (dash ? " stroke-dasharray='3,2'" : "") + "><title>" + key + " latest " + hist[hist.length - 1][key] + " (n=" + (hist[hist.length - 1][nKey] ?? "?") + ")</title></polyline>" : "";
            };
            return "<svg width='80' height='16' style='vertical-align:middle'>" + line("tDur", "#ffd35a", false) + line("tHp", "#5ad8ff", true) + "</svg> ";
        };
        // v61 -- diary-only rows: doms the diary knows but the A/B
        // machinery does not (a woken fps, a future tank) get a row with
        // the micro twin and an HONEST state -- observed, not tested.
        // Filed under the engine band: every diary dom so far is an
        // engine game; revisit the filing when that stops being true.
        if (Array.isArray(dab57)) {
            const extra61 = [...new Set(dab57.map(e => e.dom ?? "raycaster"))].filter(d => d !== "raycaster" && d !== "dungeon").sort();
            for (const xd of extra61) {
                const nx = dab57.filter(e => (e.dom ?? "raycaster") === xd).length;
                rows.push(["Difficulty A/B (" + xd + ")", "diary-only (no A/B machinery for this dom)",
                    micro57(xd) + nx + " diary entries", "wire arms + verdict when this dom earns them",
                    asOf("diff_ab_history.json"), G_ENGINE]);
            }
        }
        rows.push(["Difficulty A/B (dungeon)", fmtDab(dgn),
            (dgn ? micro57("dungeon") + "sessions " + ((dgn.arms && dgn.arms.heuristic || []).length) + "H / " + ((dgn.arms && dgn.arms.learned || []).length) + "L" : "-"),   // v57 -- micro twin
            "same ladder as rc",
            asOf("difficulty_ab_dgn.json"), G_ENGINE]);
        const regH = readJ("regime_history.json");
        const lastZ = Array.isArray(regH) && regH.length ? regH[regH.length - 1] : null;
        rows.push(["Split vs shared",
            readJ("regime_stats.json") ? "collecting both regimes" : "not started",
            lastZ ? ["kaiju", "dungeon", "raycaster", "ev"].filter(d => lastZ[d] != null).map(d => d + " z=" + lastZ[d]).join(", ") : "-",
            "|z| > 1.96 per domain declares",
            asOf("regime_stats.json"), G_ENGINE]);
        // v46 -- trade ladder row (it never had one; the EV group earns it)
        const trs = readJ("trade_state.json");
        rows.push(["Trader boldness (T ladder)",
            trs && trs.adoptedT != null ? "ADOPTED T=" + trs.adoptedT + (trs.driftStreak ? " (drift streak " + trs.driftStreak + ")" : "") : "serving default 0.5",
            trs ? "streak " + (trs.streak || 0) + " on T=" + (trs.streakT ?? "-") : "no sweeps yet",
            trs && trs.adoptedT != null ? "drift re-opens via gate" : "3 agreeing sweeps + >2% + BRAIN_TRADE_T_AUTO=adopt",
            asOf("trade_state.json"), G_EV]);
        // v44 -- escort experiment row (the table's pattern)
        const eab = readJ("escort_ab.json");
        const epN = a => (eab && eab[a] && eab[a].length) || 0;
        const epRate = a => { if (!eab || !eab[a] || !eab[a].length) return null;
            let p = 0, s = 0; for (const e of eab[a]) { p += e.pirated; s += e.durS; }
            return s > 0 ? (p / (s / 60)) : null; };
        // v49 -- sparkline row: six local tripwires as six inline bars
        // (taller = LOWER threshold = hotter system -- the eye should
        // find trouble, not ceilings). Data: the th diary's last entry.
        const thh49 = readJ("escort_th_history.json");
        const last49 = Array.isArray(thh49) && thh49.length ? thh49[thh49.length - 1] : null;
        if (last49 && Array.isArray(last49.bySys)) {
            const spark = "<svg width='76' height='16' style='vertical-align:middle'>" + last49.bySys.map((v, i) => {
                const hgt = Math.max(2, Math.round((2.5 - v) / 1.7 * 14));
                return "<rect x='" + (i * 13) + "' y='" + (16 - hgt) + "' width='10' height='" + hgt + "' fill='" + (v < 1.2 ? "#ff6a5a" : "#9ecb5a") + "'><title>sys " + i + ": th=" + v + "</title></rect>";
            }).join("") + "</svg>";
            rows.push(["Per-system tripwires", "serving 6 local thresholds",
                spark + " <span style='color:#667'>" + Math.min(...last49.bySys) + ".." + Math.max(...last49.bySys) + "</span>",
                "local pf per system; <15 legs falls back global",
                asOf("escort_th_history.json"), G_EV]);
        }
        // v52 -- ladder-life row: the report has the biography; the live
        // row carries the state and the LAST event inline
        const bms = readJ("bias_mag_state.json");
        const bmh = readJ("bias_mag_history.json");
        if (bms) {
            const le = Array.isArray(bmh) && bmh.length ? bmh[bmh.length - 1] : null;
            const ago = le ? Math.round((Date.now() - le.ts) / 60000) : null;
            // v53 -- micro step-chart inline: the biography's silhouette
            // on the live row (the sparkline pattern reused: tiny SVG,
            // titles carry the detail)
            let micro53 = "";
            if (Array.isArray(bmh) && bmh.length >= 2) {
                const mags = bmh.map(e => e.mag);
                const mLo = Math.min(...mags) - 0.02, mSpan = Math.max(0.04, Math.max(...mags) + 0.02 - mLo);
                const mx = i => 2 + i / (bmh.length - 1) * 76, my = m => 14 - (m - mLo) / mSpan * 12;
                let d53 = "", pv = null;
                bmh.forEach((e, i) => { const x = mx(i).toFixed(1), y = my(e.mag).toFixed(1);
                    d53 += i === 0 ? "M " + x + " " + y : " L " + x + " " + pv + " L " + x + " " + y; pv = y; });
                const cc = { shrink: "#ffd35a", floor: "#9ecb5a", med: "#9ecb5a", reopen: "#ff6a5a" };
                micro53 = "<svg width='80' height='16' style='vertical-align:middle'><path d='" + d53 + "' fill='none' stroke='#8a94a6' stroke-width='1'/>" +
                    bmh.map((e, i) => "<circle cx='" + mx(i).toFixed(1) + "' cy='" + my(e.mag).toFixed(1) + "' r='2' fill='" + (cc[e.ev] || "#888") + "'><title>" + e.ev + "@" + e.mag + "</title></circle>").join("") + "</svg> ";
            }
            rows.push(["Bias dose ladder",
                // v59 -- streak GLYPH: three dots, filled as the probation
                // streak climbs (&#9679; filled / &#9675; empty). Words say
                // it; the glyph says it faster -- and at 3/3 it never
                // renders, because the ladder re-opened.
                bms.found != null ? "MED found: " + bms.found + " <span title='probation: quiet contrasts toward re-open (3 = re-open)'>" + "&#9679;".repeat(Math.min(3, bms.driftStreak || 0)) + "&#9675;".repeat(Math.max(0, 3 - (bms.driftStreak || 0))) + "</span>" : "titrating, mag=" + bms.mag,
                micro53 + (le ? le.ev + "@" + le.mag + " (" + (ago < 60 ? ago + "m" : Math.round(ago / 60) + "h") + " ago)" : "no events yet"),
                bms.found != null ? "3 quiet contrasts at 20+/arm re-open" : "WORKS shrinks; miss steps back = MED",
                asOf("bias_mag_state.json"), G_EV]);
        }
        // v53 -- live chi: the report owns the test; the row carries the
        // number when it exists, starred as exploratory
        let chi53 = "";
        if (eab) {
            const sum53 = a => { const s = [0, 0, 0, 0, 0, 0]; for (const e of (eab[a] || [])) if (Array.isArray(e.bySys)) e.bySys.forEach((c, i) => s[i] += c); return s; };
            const ls = sum53("lo"), hs = sum53("hi");
            const tL = ls.reduce((a, b) => a + b, 0), tH = hs.reduce((a, b) => a + b, 0);
            // v54 -- count margins CONFIRMED correct (see report.js: the
            // exposure worry was falsified -- this test is scale-
            // invariant; an exposure-weighted version was built, tested,
            // and reverted for changing the null)
            if (tL + tH >= 12) {
                let c2 = 0;
                for (let si = 0; si < 6; si++) {
                    const rt = ls[si] + hs[si], g2 = tL + tH;
                    const eL = rt * tL / g2, eH = rt * tH / g2;
                    if (eL > 0) c2 += (ls[si] - eL) ** 2 / eL;
                    if (eH > 0) c2 += (hs[si] - eH) ** 2 / eH;
                }
                chi53 = ", sys chi2=" + c2.toFixed(1) + (c2 > 11.07 ? "*" : "") + " (exploratory; report has the honest test)";
                // v54 -- the report's cached permutation p, stamped
                const pc = readJ("sys_perm_cache.json");
                if (pc && pc.p != null) {
                    // v55 -- staleness guard (the v36 amber pattern): a
                    // cached p under FRESH episodes should say so louder.
                    // Stale = the data file moved >10 min after the cache
                    // was computed; the count drift is quoted too.
                    let stale55 = "";
                    try {
                        const fsS = require("fs"), pathS = require("path");
                        const cMt = fsS.statSync(pathS.join(__dirname, "../brain/sys_perm_cache.json")).mtimeMs;
                        const dMt = fsS.statSync(pathS.join(__dirname, "../brain/escort_ab.json")).mtimeMs;
                        if (dMt - cMt > 10 * 60 * 1000) {
                            const nowEps = epN("lo") + epN("hi");
                            stale55 = " <span style='color:#ffb454'>STALE: episodes moved " + Math.round((dMt - cMt) / 60000) + "m after this p" + (pc.nEps != null && nowEps !== pc.nEps ? " (" + pc.nEps + " -> " + nowEps + " ep)" : "") + "; regenerate the report</span>";
                        }
                    } catch {}
                    chi53 += ", perm p=" + pc.p + " (as of " + asOf("sys_perm_cache.json") + ", n=" + pc.nEps + " ep)" + stale55;
                }
            }
        }
        rows.push(["Escort threshold (randomized)",
            eab ? "collecting episodes" : "not started",
            eab ? "lo " + epN("lo") + " ep" + (epRate("lo") != null ? " @" + epRate("lo").toFixed(2) + "/min" : "") +
                  ", hi " + epN("hi") + " ep" + (epRate("hi") != null ? " @" + epRate("hi").toFixed(2) + "/min" : "") + chi53 : "-",
            "20+ episodes per arm, then Welch on per-episode rates",
            asOf("escort_ab.json"), G_EV]);
        const sel = readJ("selection_stats.json");
        rows.push(["Sampled vs epsilon",
            sel ? "collecting both arms" : "not started",
            sel ? ["kaiju", "dungeon", "raycaster", "ev"].map(d => {
                const a = sel.sampled && sel.sampled[d], b = sel.epsilon && sel.epsilon[d];
                return (a && a.n && b && b.n) ? d + " " + a.n + "/" + b.n : null;
            }).filter(Boolean).join(", ") || "-" : "-",
            "30+ per arm per domain, then z",
            asOf("selection_stats.json"), G_ENGINE]);
        // v46/v47 -- grouped render with URL-param FOLD state: ?fold=ev,
        // ?fold=engine, or both comma-joined. localStorage-free by design
        // -- the fold travels in the link, survives the auto-refresh
        // (reload keeps the URL), and can be shared. Band headers are
        // links that toggle their own group.
        let folded = new Set();
        try { folded = new Set((new URL(req.url, "http://x").searchParams.get("fold") || "").split(",").filter(Boolean)); } catch {}
        const gKey = g => g === G_EV ? "ev" : "engine";
        const foldLink = (g) => {
            const k = gKey(g), next = new Set(folded);
            if (next.has(k)) next.delete(k); else next.add(k);
            const q = [...next].join(",");
            return "/ai/brain/console" + (q ? "?fold=" + q : "");
        };
        let tbl = "";
        for (const grp of [G_ENGINE, G_EV]) {
            const grows = rows.filter(r => r[5] === grp);
            if (!grows.length) continue;
            const isF = folded.has(gKey(grp));
            tbl += "<tr><td colspan='5' style='color:#ffd35a;background:#141821;font-weight:bold'>" +
                "<a href='" + foldLink(grp) + "' style='color:#ffd35a;text-decoration:none'>" + (isF ? "&#9656; " : "&#9662; ") + grp +
                (isF ? " (" + grows.length + " folded)" : "") + "</a></td></tr>";
            if (!isF) for (const r of grows) tbl += "<tr><td>" + r.slice(0, 5).join("</td><td>") + "</td></tr>";
        }
        // v38 -- DRIFT STRIPS, live: canvas twin of the report's v37 chart.
        // Same deterministic LCG jitter, same bands (baseline cyan, post
        // gold); renders per instance only while a promotion is on watch.
        const driftStrip38 = (file, label, id) => {
            let d38 = null;
            try { d38 = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../brain/" + file), "utf-8")); } catch { return ""; }
            const R = d38 && d38.resolved;
            if (!R || R.mode !== "promoted" || !Array.isArray(R.baselineArr) || !Array.isArray(R.post) || R.post.length < 3) return "";
            return "<h1>" + label + " drift watch <span style='font-size:11px;color:#667'>(cyan = baseline at promotion n=" + R.baselineArr.length +
                ", gold = post window n=" + R.post.length + ", streak " + (R.driftStreak || 0) + ")</span></h1>" +
                "<canvas id='" + id + "' width='640' height='120' style='background:#141821;border-radius:4px'></canvas>" +
                "<script>(function(){var B=" + JSON.stringify(R.baselineArr) + ",P=" + JSON.stringify(R.post.slice(-200)) + ";" +
                "var g=document.getElementById('" + id + "').getContext('2d'),W=640;" +
                "var all=B.concat(P),lo=Math.min.apply(null,all),hi=Math.max.apply(null,all),span=Math.max(1,hi-lo);" +
                "var seed=12345;function jit(){seed=(seed*1103515245+12345)%2147483648;return (seed/2147483648-0.5)*16;}" +
                "function xOf(v){return 10+(v-lo)/span*(W-20);}" +
                "function band(arr,cy,col){var m=0;arr.forEach(function(v){m+=v;});m/=arr.length;" +
                "arr.forEach(function(v){g.beginPath();g.arc(xOf(v),cy+jit(),2.5,0,7);g.fillStyle=col;g.globalAlpha=0.55;g.fill();});" +
                "g.globalAlpha=1;g.strokeStyle=col;g.lineWidth=2;g.beginPath();g.moveTo(xOf(m),cy-14);g.lineTo(xOf(m),cy+14);g.stroke();}" +
                "band(B,35,'#5ad8ff');band(P,85,'#ffd35a');" +
                // v39 -- hover tooltips, the era-canvas pattern: nearest dot
                // by x within the hovered band (cy decides which band)
                "var tip=document.createElement('div');tip.style.cssText='position:fixed;display:none;background:#1c2230;border:1px solid #2a3242;border-radius:4px;padding:5px 8px;font:11px monospace;color:#cfd8e3;pointer-events:none;z-index:9999';document.body.appendChild(tip);" +
                "var cv=document.getElementById('" + id + "');" +
                "cv.addEventListener('mousemove',function(ev){var r=cv.getBoundingClientRect();var mx=ev.clientX-r.left,my=ev.clientY-r.top;" +
                "var arr=my<60?B:P,label=my<60?'baseline':'post';var best=null,bd=1e9;" +
                "arr.forEach(function(v){var d=Math.abs(xOf(v)-mx);if(d<bd){bd=d;best=v;}});" +
                "if(best==null||bd>18){tip.style.display='none';return;}" +
                "tip.textContent=label+': '+best+'s';tip.style.display='block';tip.style.left=(ev.clientX+14)+'px';tip.style.top=(ev.clientY+10)+'px';});" +
                "cv.addEventListener('mouseleave',function(){tip.style.display='none';});})();</script>";
        };
        const driftStrips = driftStrip38("difficulty_ab.json", "Raycaster", "ds1") + driftStrip38("difficulty_ab_dgn.json", "Dungeon", "ds2");
        // v28 -- ERA CHART, live: the offline report's twin, canvas-drawn.
        // Server embeds the history as JSON; the client draws lines per T
        // plus gold adoption verticals -- same palette as the report.
        let eraHist = [];
        try { eraHist = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../brain/t_sweep_history.json"), "utf-8")); } catch {}
        const eraChart = eraHist.length < 2 ? "" :
            "<h1 id='era'>T-sweep over time <span style='font-size:11px;color:#667'>(gold = adoption; cyan 0.2, green 0.35, amber 0.5, purple 0.75, red 1.0)</span></h1>" +
            "<canvas id='era' width='640' height='170' style='background:#141821;border-radius:4px'></canvas>" +
            "<script>(function(){var H=" + JSON.stringify(eraHist.slice(-300)) + ";" +
            "var Ts=['T0.2','T0.35','T0.5','T0.75','T1'],cols={'T0.2':'#5ad8ff','T0.35':'#9ecb5a','T0.5':'#ffb454','T0.75':'#c58aff','T1':'#ff6a5a'};" +
            "var g=document.getElementById('era').getContext('2d'),W=640,Hh=170;" +
            "var all=[];H.forEach(function(r){Ts.forEach(function(k){if(r[k]!=null)all.push(r[k]);});});if(!all.length)return;" +
            "var lo=Math.min.apply(null,all),hi=Math.max.apply(null,all),span=Math.max(1e-6,hi-lo);" +
            "var yOf=function(v){return Hh-12-(v-lo)/span*(Hh-24);},px=function(i){return 8+i/(H.length-1)*(W-16);};" +
            "g.strokeStyle='#ffd35a';g.lineWidth=1.5;g.globalAlpha=0.9;" +
            "H.forEach(function(r,i){if(r.adopted){g.beginPath();g.moveTo(px(i),4);g.lineTo(px(i),Hh-4);g.stroke();}});" +
            "g.globalAlpha=1;g.lineWidth=1.4;" +
            "Ts.forEach(function(k){g.strokeStyle=cols[k];g.beginPath();var started=false;" +
            "H.forEach(function(r,i){if(r[k]==null)return;var y=yOf(r[k]);if(started)g.lineTo(px(i),y);else{g.moveTo(px(i),y);started=true;}});" +
            "if(started)g.stroke();});" +
            // v29 -- hover tooltips: nearest report by x, exact SNIPS per T
            "var tip=document.createElement('div');tip.style.cssText='position:fixed;display:none;background:#1c2230;border:1px solid #2a3242;border-radius:4px;padding:5px 8px;font:11px monospace;color:#cfd8e3;pointer-events:none;z-index:9999';document.body.appendChild(tip);" +
            "var cv=document.getElementById('era');" +
            "cv.addEventListener('mousemove',function(ev){var r=cv.getBoundingClientRect();var fx=(ev.clientX-r.left-8)/(W-16);var i=Math.max(0,Math.min(H.length-1,Math.round(fx*(H.length-1))));var e=H[i];" +
            "var s=new Date(e.ts).toLocaleString()+(e.adopted?' [ADOPTION]':'');Ts.forEach(function(k){if(e[k]!=null)s+='\\n'+k+' = '+e[k];});" +
            "tip.textContent=s;tip.style.whiteSpace='pre';tip.style.display='block';tip.style.left=(ev.clientX+14)+'px';tip.style.top=(ev.clientY+10)+'px';});" +
            "cv.addEventListener('mouseleave',function(){tip.style.display='none';});" +
            "})();</script>";
        // v26 -- gate controls: current file values + flip buttons.
        // The page cannot see the brain's ENV, so it says so.
        let gates = {};
        try { gates = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../brain/gates.json"), "utf-8")); } catch {}
        // v35 -- depth indicators: the replay knows both stack sizes;
        // the buttons say how far each direction can walk, and disable
        // at zero instead of failing politely after the click.
        const audit35 = (() => { try { return JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "../brain/gates_audit.json"), "utf-8")); } catch { return []; } })();
        const gateRow = (key) => {
            const { stack: us, redo: rs } = replayGateStacks(audit35, key);
            const gt = GATE_TYPES[key];
            const cur = gates[key] || gt.dflt;
            // v39 -- setter cell by TYPE
            let setter;
            if (gt.type === "int" || gt.type === "float") {   // v47 -- one input class, two parsers
                const step = gt.type === "float" ? " step='" + (gt.step || 0.1) + "'" : "";
                const parse = gt.type === "float" ? "parseFloat" : "parseInt";
                const hint = (gt.type === "float" ? "number " : "integer ") + gt.min + ".." + gt.max;
                setter = "<input id='in_" + key + "' type='number' min='" + gt.min + "' max='" + gt.max + "'" + step + " style='width:70px'> " +
                    "<button onclick=\"var v=" + parse + "(document.getElementById('in_" + key + "').value);setGateV('" + key + "',String(v),'" + hint + "');\">set</button>";
            } else {
                setter = gt.vals.map(v => "<button onclick=\"setGate('" + key + "','" + v + "')\">" + v + "</button>").join(" ");
            }
            return "<tr><td>" + key + "</td><td>" + cur + "</td><td>" +
                setter + " " +
                "<button " + (us.length ? "" : "disabled ") + "onclick=\"fetch('/ai/brain/gates/undo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:'" + key + "'})}).then(function(r){return r.json();}).then(function(j){alert(j.ok?('Restored: '+(j.restored==null?'(default)':j.restored)):j.error);location.reload();});\">undo x" + us.length + "</button> " +
                "<button " + (rs.length ? "" : "disabled ") + "onclick=\"fetch('/ai/brain/gates/redo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:'" + key + "'})}).then(function(r){return r.json();}).then(function(j){alert(j.ok?('Re-applied: '+j.reapplied):j.error);location.reload();});\">redo x" + rs.length + "</button></td></tr>";
        };
        // v32 -- ONE audit list: both files merged, sorted, kind-tagged.
        // Old-shape entries (pre-unification) render too -- an audit that
        // forgets its own past would be a poor audit.
        let auditTail = "";
        try {
            const merged = mergedAudit();   // v33 -- shared with the export
            const fmt = a => {
                const when = new Date(a.ts).toLocaleString(), who = a.from || "unknown";
                if (a._src === "gate") {
                    if (a.action === "undo") return `[gate] UNDO ${a.key} -> ${a.restored} (${who})`;
                    return `[gate] ${a.key} = ${a.value}${a.prev !== undefined ? " (was " + (a.prev ?? "default") + ")" : ""} (${who})`;
                }
                if (a.action === "cancel" || a.cancelled) return `[duel] CANCEL ${a.wasPending ? "in time" : "too late"} (${who})`;
                return `[duel] rematch${a.terms ? " " + JSON.stringify(a.terms) : ""} (${who})`;
            };
            auditTail = "<h1 id='audit'>Audit</h1><ol>" + merged.slice(-10).reverse().map(a =>
                "<li>" + new Date(a.ts).toLocaleString() + " -- " + fmt(a) + "</li>").join("") + "</ol>";
        } catch {}
        // v32 -- rematch entries now live in the merged Audit section
        const rematchAudit = "";
        // v31 -- pending indicator; v32 -- live COUNTDOWN: the stamp's age
        // ticks up client-side, and the poll cadence bounds consumption
        // ("within ~30s of arming" is an upper bound, not a promise --
        // the engine may see it on the very next tick).
        const rematchPending = !!(gpuBrain.duelRematchAt && !gpuBrain.duelRematchAcked);
        // v33 -- countdown bound from MEASURED cadence: median inter-poll
        // gap when we have 3+ samples; the hardcoded 30 only as cold-start
        const pt = gpuBrain.rematchPollTimes || [];
        let pollS = 30;
        if (pt.length >= 3) {
            const gaps = pt.slice(1).map((v, i) => (v - pt[i]) / 1000).sort((a, b) => a - b);
            pollS = Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)]));
        }
        const pendingUi = rematchPending
            ? "<p style='color:#ffd35a'>Rematch PENDING -- armed <span id='rmAge'></span> ago; the engine polls every ~" + pollS + "s (measured), so it consumes within <span id='rmEta'></span> " +
              "<button onclick=\"fetch('/ai/brain/duel/rematch/cancel',{method:'POST'}).then(function(r){return r.json();}).then(function(j){alert(j.cancelled?'Cancelled in time.':'Too late -- already consumed.');location.reload();});\">Cancel</button></p>" +
              "<script>(function(){var t0=" + gpuBrain.duelRematchAt + ";setInterval(function(){var age=Math.round((Date.now()-t0)/1000);" +
              "var el=document.getElementById('rmAge');if(el)el.textContent=age+'s';" +
              "var eta=Math.max(0," + pollS + "-age);var e2=document.getElementById('rmEta');if(e2)e2.textContent=(eta>0?('~'+eta+'s'):'any moment');},1000);})();</script>"
            : "";
        const rematchBtn = "<h1 id='series'>Series</h1>" + pendingUi +
            "setTarget <input id='rmSt' type='number' min='1' style='width:60px'> " +
            "bestOf <input id='rmBo' type='number' min='1' style='width:50px'> " +
            "<button onclick=\"if(confirm('Clear the frozen series and start a rematch?')){var b={};var st=parseInt(document.getElementById('rmSt').value);var bo=parseInt(document.getElementById('rmBo').value);if(st>0)b.setTarget=st;if(bo>0)b.bestOf=bo;fetch('/ai/brain/duel/rematch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json();}).then(function(j){var m='Rematch armed.';if(j&&j.terms)m+=' Kept: '+JSON.stringify(j.terms)+'.';if(j&&j.rejected)m+=' REJECTED: '+JSON.stringify(j.rejected);alert(m);location.reload();});}\">Rematch</button>" +
            "<p style='color:#667;font-size:11px'>Blank inputs keep the current terms. The podium already archived the finished series; the engine resets within ~30s.</p>" + rematchAudit;
        // v39 -- knob TYPES: the whitelist entry declares how a key
        // renders and validates. enum -> suggest/adopt buttons; int ->
        // number input with the entry's own bounds. New knobs are one
        // table line, not a special-cased row (the v38 hbRow retired
        // into the table it should always have been).
        const GATE_TYPES = {
            BRAIN_ATK_T_AUTO: { type: "enum", vals: ["suggest", "adopt"], dflt: "suggest (default)" },
            BRAIN_DIFF_AUTO: { type: "enum", vals: ["suggest", "adopt"], dflt: "suggest (default)" },
            BRAIN_HB_QUIET_S: { type: "int", min: 60, max: 3600, dflt: "150 (default)" },
            BRAIN_TRADE_T_AUTO: { type: "enum", vals: ["suggest", "adopt"], dflt: "suggest (default)" },   // v41
            BRAIN_ESCORT_AUTO: { type: "enum", vals: ["suggest", "adopt"], dflt: "suggest (default)" },   // v45
            BRAIN_EV_BIAS_CONFED: { type: "float", min: -0.5, max: 0.5, step: 0.05, dflt: "0 (default)" },   // v47
            BRAIN_EV_BIAS_PIRATE: { type: "float", min: -0.5, max: 0.5, step: 0.05, dflt: "0 (default)" },   // v47
            BRAIN_ESCORT_COPRIMARY: { type: "enum", vals: ["off", "on"], dflt: "off (default)" },   // v48
            BRAIN_DIFF_COPRIMARY: { type: "enum", vals: ["off", "on"], dflt: "off (default)" },   // v49
            BRAIN_BIAS_MAG_AUTO: { type: "enum", vals: ["suggest", "adopt"], dflt: "suggest (default)" },   // v49
        };
        const gatesTbl = rematchBtn + auditTail + "<h1 id='gates'>Gates</h1><p style='color:#667;font-size:11px'>File-level settings; an explicit env var on the brain process always wins and is not visible here.</p>" +
            "<table><tr><th>Gate</th><th>File value</th><th>Set</th></tr>" + Object.keys(GATE_TYPES).map(gateRow).join("") + "</table>" +
            "<script>function setGate(k,v){fetch('/ai/brain/gates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:k,value:v})}).then(function(){location.reload();});}" +
            "function setGateV(k,v,hint){fetch('/ai/brain/gates',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:k,value:v})}).then(function(r){return r.json();}).then(function(j){if(!j.ok)alert('Rejected: '+hint);location.reload();});}</script>";
        const page = `<!doctype html><html><head><meta charset="utf-8"><title>Experiment console</title>
<style>body{background:#0d1017;color:#cfd8e3;font:13px monospace;margin:24px}h1{color:#ffd35a;font-size:18px}
table{border-collapse:collapse}td,th{border:1px solid #2a3242;padding:6px 10px;text-align:left}th{color:#ffd35a}</style></head><body>
<h1 id="experiments">The experiment console <span style="font-size:11px;color:#667">(live; refreshes every 15s -- paused while you interact)</span></h1>
${(() => {
    // v57 -- report link WEARS ITS AGE: mtime read per console refresh,
    // amber past 30 min (the report's own banner threshold), honest
    // absence when no report exists yet.
    try {
        const fsA = require("fs"), pathA = require("path");
        const mt = fsA.statSync(pathA.join(__dirname, "../brain/snapshots/report.html")).mtimeMs;
        const m = Math.round((Date.now() - mt) / 60000);
        const ageTxt = m < 1 ? "just generated" : m < 60 ? m + " min old" : Math.round(m / 60) + "h old";
        const amber = m > 30;
        // v71 -- pulse strip: the last 5 ships beside the report link
        // (the v49 mini pattern). One bar per ship, height = total
        // seconds, red bar = red ship; title carries per-step splits.
        let strip71 = "";
        try {
            const ring = JSON.parse(fsA.readFileSync(pathA.join(__dirname, "../tools/verify_timing.json"), "utf-8")).slice(-5);
            if (ring.length >= 2) {
                const tot = r => Object.values(r.steps || {}).reduce((a, x) => a + x, 0);
                const top = Math.max(...ring.map(tot), 0.5);
                strip71 = " <a href='/ai/brain/report#pulse72' style='text-decoration:none'><svg width='" + (ring.length * 8 + 2) + "' height='14' style='vertical-align:middle'>" + ring.map((r, i) => {
                    const h = Math.max(2, tot(r) / top * 12);
                    return "<rect x='" + (i * 8 + 1) + "' y='" + (13 - h).toFixed(1) + "' width='6' height='" + h.toFixed(1) + "' fill='" + (r.green === false ? "#ff5a5a" : "#5ad8ff") + "'><title>total " + tot(r).toFixed(1) + "s: " + Object.entries(r.steps || {}).map(([k, v]) => k + " " + v + "s").join(", ") + "</title></rect>";   // v74 -- total leads the hover
                }).join("") + "</svg></a> <span style='color:#667' title='window streak: bars shown here only; the lint reports the ring-wide streak'>last " + ring.length + " ships, streak " + (() => { let g = 0; for (let i = ring.length - 1; i >= 0 && ring[i].green !== false; i--) g++; return g; })() + " green in window</span>";   // v72 click-through; v74 streak; v75 -- two streaks, two windows, named ONCE where the smaller one lives
            }
        } catch {}
        return `<p style="font-size:11px"><a href="/ai/brain/report" style="color:${amber ? "#ffb454" : "#5ad8ff"}">offline report</a> | <a href="/ai/brain/evidence.zip" style="color:#8aff5a">collect evidence bundle</a> <span style="color:${amber ? "#ffb454" : "#667"}">(${ageTxt}${amber ? " -- regenerate for live decisions" : ""})</span>${strip71}</p>`;
    } catch { return `<p style="font-size:11px;color:#667">no offline report generated yet (run brain/report.js) | <a href="/ai/brain/evidence.zip" style="color:#8aff5a">collect evidence bundle</a></p>`; }   // v77 -- the button must exist BEFORE the first report: fresh trees click it first
})()}
${(() => {
    // v34 -- STALENESS: "last seen" from the engine-only routes (duel
    // tallies, rematch poll/ack) -- so it only reads while a duel is
    // armed or crowned, and says so rather than claiming omniscience.
    if (!gpuBrain.engineLastSeen) return `<p style="color:#667;font-size:11px">engine not seen this bridge session (the 60s heartbeat starts with the engine)</p>`;
    const s = Math.round((Date.now() - gpuBrain.engineLastSeen) / 1000);
    const col = s > 90 ? "#ffb454" : "#9ecb5a";
    return `<p style="color:${col};font-size:11px">engine last seen ${s}s ago (via ${gpuBrain.engineSeenVia || "duel routes"})</p>`;
})()}<nav style="margin-bottom:10px"><a href="#experiments" style="color:#5ad8ff">experiments</a> &middot; <a href="#era" style="color:#5ad8ff">era chart</a> &middot; <a href="#series" style="color:#5ad8ff">series</a> &middot; <a href="#audit" style="color:#5ad8ff">audit</a> &middot; <a href="#gates" style="color:#5ad8ff">gates</a></nav>
<script>
// v30 -- the meta-refresh yanked tooltips mid-read. JS timer instead:
// reload every 15s, but only when the pointer has been still for 3s --
// hovering ANYTHING (tooltips, buttons, a form half-filled) holds the
// page. Interaction always beats freshness.
(function(){var lastMove=0;
document.addEventListener("mousemove",function(){lastMove=Date.now();});
document.addEventListener("keydown",function(){lastMove=Date.now();});
setInterval(function(){if(Date.now()-lastMove>3000)location.reload();},15000);})();
</script>
<table><tr><th>Experiment</th><th>State</th><th>Evidence</th><th>Next gate</th><th>Evidence as of</th></tr>` + tbl + `</table>` + driftStrips + eraChart + gatesTbl + `</body></html>`;
        // v59 -- console CSP: the report's v58 one-liner, same inline
        // carve-out -- the console runs MORE script than the report
        // (refresh loop, gate setters, undo/redo, canvases), all of it
        // inline by design. connect-src 'self' is the one extra door:
        // the gate buttons fetch back to this same bridge, nothing else.
        res.writeHead(200, { "Content-Type": "text/html",
            "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'" });
        res.end(page);
        return;
    }
    // owned prefix but no route matched (a typo'd /ai/brain/x): honest 404
    sendJson({ ok: false, error: "unknown gpu-brain route: " + req.url }, 404);
}

// v2077 -- expose fleet solve-speed to the cell-tracking cluster splitter.
// Returns { url-or-id -> solveMsEwma } for live brains. A box's brain
// speed is a usable FIRST-RUN proxy for its compute power; the cluster
// splitter refines it with measured cell-tracking throughput over runs.
function fleetSpeeds() {
    const now = Date.now();
    const out = {};
    for (const e of fleet.values()) {
        if (now - e.lastSeen > 60000) continue;
        if (e.solveMsEwma == null) continue;
        out[e.id] = e.solveMsEwma;
        if (e.gpu) out[e.gpu] = e.solveMsEwma;
    }
    return out;
}

// ---------------------------------------------------------------------------------------------------------
// v4030 REGISTRY REGISTRATIONS. Declared here, at the foot, because a registration references the handler it
// calls and this file defines its state (gpuBrain, ringKeep, _gpuExpDirty) above.
//
// *** BOTH ROUTES DECLARE checks.none, AND THAT IS A STATEMENT, NOT AN OVERSIGHT. *** Neither route checked
// trust before v4030 -- the experience ring is how a fleet of brains shares samples with each other, and
// gating it would break that. Migrating a route is not the moment to quietly widen or narrow who may call it,
// so the precondition recorded is the one that was already in force. The difference is that it is now
// DECLARED rather than merely absent: a reader sees checks.none and knows nobody forgot.
registry.post("/ai/brain/experience", {
    check: checks.none,
    maxBodyBytes: 1024 * 1024,        // was typed inline at the call site; now declared with the route it bounds
    schema: (d) => (d && Array.isArray(d.samples) && typeof d.from === "string")
        ? null : "expected {samples: array, from: string}",
    handler: (d, req, res, ctx) => {
        for (const s of d.samples.slice(0, 256)) {
            gpuBrain.experience.push({ seq: ++gpuBrain.expSeq, from: d.from, pol: String(s.pol || ""), x: s.x, r: s.r });
        }
        ringKeep(gpuBrain.experience, 2048);
        _gpuExpDirty = true;
        ctx.sendJson({ ok: true, seq: gpuBrain.expSeq });
    },
});

registry.get("/ai/brain/experience", {
    check: checks.none,
    handler: (params, req, res, ctx) => {
        const after = Number(params.get("after") || 0);
        const exclude = params.get("exclude") || "";
        const samples = gpuBrain.experience.filter((s) => s.seq > after && s.from !== exclude).slice(0, 512);
        ctx.sendJson({ ok: true, seq: gpuBrain.expSeq, samples });
    },
});

module.exports = { owns, handle, gpuBrain, fleetSpeeds };
