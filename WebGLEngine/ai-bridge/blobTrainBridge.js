// ai-bridge/blobTrainBridge.js -- train the blob policy from the browser, so nobody has to find a terminal.
//
// v2488 gave blobTrainer.mjs the CLI its own header had been advertising since the day it was written. That fixed
// the bug, and left a worse one: the answer to "how do I run it" was "open Terminal, work out where the engine
// lives, and type a path". On a Mac, from a phone, or from the couch, that is the same as not shipping it.
//
// This owns /brain/train and runs the trainer as a real child process -- the same command, with the same flags,
// producing the same disk file. Not a reimplementation: a reimplementation would drift from the CLI and only one
// of the two would be the thing the ship gate checks.
//
// Mounted BEFORE gpuBrainBridge, which owns the whole /ai/brain prefix. This deliberately uses /brain, not
// /ai/brain, so the two can never argue about who answers.
"use strict";
const { execFile } = require("child_process");
const path = require("path");

const ENGINE_ROOT = path.resolve(__dirname, "..");
const TRAINER = path.join(ENGINE_ROOT, "brain", "blobTrainer.mjs");

function owns(url) {
    const u = String(url || "").split("?")[0];
    return u === "/brain/train" || u === "/brain/policy" || u === "/brain/auto";
}

// The self-training loop. It runs in-process rather than as a child, because unlike the one-shot trainer it has
// STATE worth keeping between attempts -- the audit history and the regret. Only one may run at a time.
let auto = null;

function handle(req, res) {
    const u = String(req.url || "").split("?")[0];
    const send = (code, obj) => {
        res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(obj));
    };

    // what is on disk right now -- honest about "baked", which means nothing has ever been learned here
    if (u === "/brain/policy") {
        try {
            const store = require(path.join(ENGINE_ROOT, "brain", "blobPolicyStore.js"));
            const s = store.serve();
            return send(200, { ok: true, source: s.source, score: s.score, iters: s.iters, by: s.by, at: s.at, file: store.FILE });
        } catch (e) { return send(500, { ok: false, error: String(e.message).slice(0, 200) }); }
    }

    // /brain/auto -- train repeatedly, and report the ONE number that says whether it is still working.
    if (u === "/brain/auto") {
        if (req.method === "GET") {
            if (!auto) return send(200, { ok: true, running: false, attempts: 0 });
            return send(200, { ok: true, running: auto.running, attempts: auto.t.history.length,
                bestHeld: auto.t.bestHeld, bestAudit: auto.t.bestAudit, regret: auto.t.regret(),
                verdict: auto.t.verdict(), kept: auto.t.history.filter((h) => h.kept).length, offered: auto.offered });
        }
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
        req.on("end", async () => {
            let o = {};
            try { o = body ? JSON.parse(body) : {}; } catch {}
            if (o.stop) { if (auto) auto.running = false; return send(200, { ok: true, stopped: true }); }
            if (auto && auto.running) return send(409, { ok: false, error: "already running" });
            const attempts = Math.max(1, Math.min(400, Number(o.attempts) || 40));
            const iters = Math.max(20, Math.min(2000, Number(o.iters) || 220));
            const mod = await import("../brain/blobAutoTrain.mjs");
            const t = mod.createAutoTrainer({ iters });
            auto = { t, running: true, offered: null };
            send(202, { ok: true, started: true, attempts: attempts, note: "poll GET /brain/auto" });
            (async () => {
                for (let i = 1; i <= attempts && auto.running; i++) {
                    await auto.t.attempt(i);
                    await new Promise((r) => setImmediate(r));   // stay polite: this is a background chore, not a job
                }
                // Offer ONLY the held-out winner, because that is what the store judges on and pretending otherwise
                // would be inventing a second currency. The regret number is what says whether that was wise.
                if (auto.t.best) {
                    const store = require(path.join(ENGINE_ROOT, "brain", "blobPolicyStore.js"));
                    auto.offered = store.offer({ weights: auto.t.best, score: auto.t.bestHeld, iters: auto.t.history.length, by: "auto" });
                }
                auto.running = false;
            })().catch(() => { if (auto) auto.running = false; });
        });
        return;
    }

    if (req.method !== "POST") return send(405, { ok: false, error: "POST to train" });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on("end", () => {
        let opts = {};
        try { opts = body ? JSON.parse(body) : {}; } catch {}
        const iters = Math.max(10, Math.min(4000, Number(opts.iters) || 400));
        const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 12345;
        const save = opts.save === true;
        // the SAME command a person would type. If this drifts from the CLI, one of them is a lie.
        const args = [TRAINER, "--iters", String(iters), "--seed", String(seed)];
        if (save) args.push("--save");
        execFile(process.execPath, args, { timeout: 120000, cwd: ENGINE_ROOT }, (err, stdout, stderr) => {
            const out = String(stdout || "");
            if (err && !out) return send(500, { ok: false, error: String(err.message).slice(0, 300), stderr: String(stderr || "").slice(0, 300) });
            // parse what the CLI printed rather than recomputing it -- one source of truth
            const grab = (re) => { const m = out.match(re); return m ? Number(m[1]) : null; };
            send(200, {
                ok: true,
                command: "node brain/blobTrainer.mjs --iters " + iters + " --seed " + seed + (save ? " --save" : ""),
                trainScore: grab(/training score:\s+([\d.]+)/),
                heldOut: grab(/HELD-OUT score:\s+([\d.]+)/),
                accepted: /ACCEPTED/.test(out),
                refused: /REFUSED/.test(out),
                saved: save,
                serves: (out.match(/the store now serves:\s+(\w+)/) || [])[1] || null,
                raw: out.trim().split("\n").slice(-6),
            });
        });
    });
}
module.exports = { owns, handle, TRAINER };
