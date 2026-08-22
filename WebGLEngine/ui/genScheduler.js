// ui/genScheduler.js — v948
// Drains the bridge-held generation queue (gen-queue.json) one job at a time.
//
// ONLY the PC engine runs this. It is imported solely by main.js (the engine
// bundle), so phone/TV pages — which add jobs through asset-library.html — are
// never drainers. That makes the engine the SINGLE worker, so a job is never
// processed twice even with several browser tabs open (the /gen/claim route is
// atomic: it marks the next job "running" and refuses to hand out a second
// while one is in flight).
//
// For voxel jobs the worker calls window.ai.generate(prompt). The v800 wrap on
// generate() auto-ingests every successful result into the Universal Asset
// Library WITHOUT spawning it into the scene — exactly what a background batch
// wants (no creatures teleporting in front of the camera). We deliberately do
// NOT call window.ai.asset(), which would place each result on the stage.

let _busy = false;
let _timer = null;

async function runJob(job) {
    const type = (job && job.type) || "voxel";
    if (type === "voxel") {
        if (!window.ai || typeof window.ai.generate !== "function") return { ok: false, error: "engine gen not ready" };
        const r = await window.ai.generate(job.prompt);     // auto-ingests to library; no spawn
        if (r && r.ok) return { ok: true, resultId: r.name || null };
        return { ok: false, error: (r && r.error) || "gen failed" };
    }
    // mesh / image generation is bridge-driven (/asset-pipeline/*, /diffuser/*)
    // and would be better claimed by a bridge-side worker; the engine worker
    // intentionally does not drive those in v1.
    return { ok: false, error: "type '" + type + "' not handled by the engine worker" };
}

async function tick() {
    if (_busy) return;
    if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1870 — hold while Settings is open
    // Not the engine (no gen path), or gen not wired up yet → stay idle. This is
    // why the same module can be imported anywhere safely: without window.ai it
    // simply never claims a job.
    if (!window.ai || typeof window.ai.generate !== "function") return;
    _busy = true;
    try {
        const claim = await fetch("/gen/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kinds: ["voxel"] }),   // v950 — engine owns the voxel lane; image/mesh go to the bridge worker
        }).then(r => r.json()).catch(() => null);
        const job = claim && claim.job;
        if (!job) return;
        let out;
        try { out = await runJob(job); }
        catch (e) { out = { ok: false, error: (e && e.message) || String(e) }; }
        await fetch("/gen/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: job.id, ok: !!out.ok, error: out.error || null, resultId: out.resultId || null }),
        }).catch(() => {});
        try {
            if (out.ok) window.toast && window.toast("⏳ Queue · built '" + (out.resultId || job.prompt) + "'");
            else console.warn("[genScheduler] job failed:", job.prompt, "→", out.error);
        } catch {}
    } finally {
        _busy = false;
    }
}

export function startGenScheduler(intervalMs = 3000) {
    if (_timer) return;
    _timer = setInterval(tick, intervalMs);
    console.log("[genScheduler] engine worker draining /gen/queue every " + intervalMs + "ms");
}
export function stopGenScheduler() { if (_timer) { clearInterval(_timer); _timer = null; } }

window.genScheduler = { start: startGenScheduler, stop: stopGenScheduler, tick };

// Self-start (side-effect import, like taskerInbound). tick() guards on
// window.ai.generate, so it no-ops harmlessly until the engine's AI is ready.
startGenScheduler();
