// WebGLEngine/ai-bridge/rigRunner.js — v2559
//
// ONE CLICK, IT RUNS, YOU SEE THE RESULT.
//
// Keith: "You made a page with all the tests I am supposed to click on, like 30 of them... It sounded like you did
// a lot of prep so it would be 1 click tests and result shown."
//
// I LOOKED FOR THAT PAGE AND IT DOES NOT EXIST. predictions.html has 28 claims (which is the ~30 he remembers) but
// ZERO buttons -- it shows what I MEASURED, not what he can RUN. physics-verified.html computes live but has no
// buttons either. Nothing in the tree or the last four transcripts is a click-to-run checklist. My honest read is
// that the page was described and never built.
//
// So this is the back end for the real one. It does exactly two things:
//
//   GET  /rig/list          -> what can be run, and what each one unblocks
//   POST /rig/run           -> spawn ONE selfcheck, stream back its real stdout and its REAL EXIT CODE
//
// THE EXIT CODE IS THE POINT. v2544's incident was a ship gate bypassed because piping through `tail` ate the
// exit status, and the whole ship ritual got folded into one command as a result. A page that showed green text
// scraped out of stdout would be the same bug wearing a stylesheet: A CONTROL THAT CANNOT FAIL IS DECORATION.
// So the verdict here comes from the process's exit code and NOTHING ELSE. The text is for reading; the code is
// the answer.
"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ENGINE = path.join(__dirname, "..");

/**
 * Everything runnable, discovered from disk rather than listed by hand.
 * A hand-written list would drift the moment someone adds a selfcheck, and the drift would look like a shorter
 * page rather than an error -- which is the failure mode this engine keeps finding in other people's code.
 */
function discover() {
    const out = [];
    const walk = (dir, depth) => {
        if (depth > 2) return;
        let ents = [];
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p, depth + 1);
            else if (e.name.endsWith("-selfcheck.mjs")) {
                const rel = path.relative(ENGINE, p);
                out.push({ id: rel, name: e.name.replace("-selfcheck.mjs", ""), rel });
            }
        }
    };
    walk(ENGINE, 0);
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * THE THINGS ONLY KEITH CAN DO. These are NOT selfchecks -- they are the pile that has been accumulating in
 * changelogs where nobody can click them. Each says what it unblocks, because "rebuild the wasm" without
 * "it blocks five things" is a chore, and with it is a decision.
 */
const RIG_ONLY = [
    {
        id: "wasm", title: "Rebuild box3d.wasm",
        why: "BLOCKS FIVE THINGS: the cross-arch flesh test (v2546), the paramecium's real 3D home (v2552/57), the conformance run against real box3d (v2553), the up-axis question done properly, and the brain-vs-mold race (v2557).",
        how: "The sandbox cannot: emsdk's repo answers but storage.googleapis.com returns 403. On Galaxina it should just build.",
        link: "/box3d-info.html",
    },
    {
        id: "gpupush", title: "Push blobulator-gpu.html into swek-blobulator",
        why: "IT IS A LIVE 404. v2555 fixed the link to be relative, but the target was never exported -- the repo holds LICENSE, MarchingCubes.js, README.md, canvasRecorder.js, index.html, test. The WebGPU button on your public page goes nowhere until you push.",
        how: "Copy blobulator-gpu.html (and any deps it imports) into the repo root and push.",
        link: "/blobulator.html",
    },
    {
        id: "ci", title: "A GitHub Actions release matrix (steal Vizza's)",
        why: "THE HIGHEST-VALUE ITEM ON THIS PAGE. Velfi/Vizza ships six platform artifacts per release from CI -- including aarch64.dmg AND x64.dmg, which is exactly your Intel-Mac / M-series split. 26 releases. You hand-carry a zip to a house in another town.",
        how: "Her .github/workflows is public. Tauri-specific, but the matrix shape is the part worth stealing.",
        link: "",
    },
    {
        id: "brainrace", title: "Race the CONTEXTUAL brain vs the mold",
        why: "v2557's kill condition. UCB1 lost 14.8 to 575.5 in 3D -- but it is CONTEXT-FREE, and the finding was that the bandit's MEMORY is its handicap, not its senses. brain.js has a policy MLP that takes state. If context closes the gap, the legal cheat is real. If it still loses, I am wrong.",
        how: "Deno-only, so it will not import here. freeSpaceWorld (v2557) is the arena; the policy interface is v2547's four functions, unchanged.",
        link: "/brain-bench.html",
    },
    {
        id: "crossarch", title: "Connect your mother's arm64 Mac, then diff the FLESH hash",
        why: "The only real test of v2546's IEEE-754 work. Same hash = bit-identical across architectures. Differs AND spacing differs = the known Math.cbrt hole. Spacing matches and it still differs = a real bug worth finding.",
        how: "Add by tailnet IP and READ THE COLOUR (v2545): green = linked and it answered, amber = saved but NOT answering. Then `node tools/crossarch-flesh.mjs` on both.",
        link: "/server.html",
    },
    {
        id: "trace", title: "BRAIN_TRACE=1 on two peers, diff by TICK",
        why: "v2549 put an engine-side tick on every trace record specifically so two machines' traces can be lined up. Nothing has ever done it.",
        how: "Set BRAIN_TRACE=1, play, then compare session-<pid>.jsonl by tick.",
        link: "/brain-replay.html",
    },
    {
        id: "budget", title: "node tools/frame-budget.mjs on Galaxina",
        why: "This box measured SPH 81% / isosurface 6% on ONE CPU. THE SHAPE ON YOUR GPU MACHINE IS THE ONE THAT MATTERS -- and if the isosurface ever exceeds 40% there, the gate fails and Wald's paper becomes worth reading again.",
        how: "Just run it.",
        link: "/flesh.html",
    },
    {
        id: "settle", title: "node tools/shedding-settle.mjs  (several minutes, then walk away)",
        why: "THE FOURTH ATTEMPT AT f_drag = 2 f_lift, and the first one where the previous attempt told us what to change. v2843 tested my own hypothesis -- that the wake probe sat too close -- with a rake of six probes and REFUTED it: disagreement did not fall with distance, and the probes disagreed with EACH OTHER (Strouhal 0.079 to 0.194 along one wake). What DID track everything was warmup: 14000 steps gave 4.16% Reynolds drift and 15.65% disagreement; 12000 gave 14.81% and 48.44%. Monotone, across every observable at once. So this changes ONE thing and settles for 40000.",
        how: "Just run it. It prints the SETTLING CURVE as it goes -- when Re stops moving, the flow has arrived. If Re settles and the probes STILL disagree, settling was not the answer either, and that is worth knowing rather than trying a sixth thing.",
        link: "/wind-tunnel.html",
    },
    {
        id: "wasmstats", title: "cd tools/render-qa && node render-qa.mjs --only wasm-gen-stats",
        why: "The wasm terrain SPEEDUP is still unmeasured, and it was the entire point of that patch. This used to be a nine-step ritual ending in a clipboard paste; v2837 made it one command -- a scripted 20-second flight with three teleports, then world.wasmGenStats(), streamer.stats(), core count and the world seed straight into report.json.",
        how: "Needs the bridge running. IT CANNOT TELL YOU HOW IT FELT -- hitches on fast flight are half the hand-SIMD decision, and a scripted flight has no opinion about smoothness. Say whether it stuttered.",
        link: "/rig.html",
    },
    {
        id: "modelbench", title: "Point models.html at the fleet and let the matrix run",
        why: "THE QUESTION THE WHOLE ROUNDHOUSE WAS BUILT TO ASK: which model is right often enough to sit at the cheap end of the escalation chain -- and when it fails, is that because it cannot think or because it cannot type. The report keeps refused and malformed in SEPARATE columns for exactly that reason; they have opposite fixes.",
        how: "One model per peer so nothing swaps: the 1070 takes an 8B, a 16GB Mac a 14B, CPU boxes phi4-mini, and a remote Gemini peer costs no hardware at all. Latency is per (model, peer) and is NOT comparable across peers; the win rates ARE.",
        link: "/models.html",
    },
    {
        id: "seam", title: "SETTLED -- the RLE seam question is answered",
        why: "KEPT HERE AS A CLOSED ITEM rather than deleted, because it was open from v2794 and the answer came from your rig. Render QA ran all four world variants: nonBlackFrac 0.6906 / 0.6913 / 0.6910 / 0.6906 and uniqueColors 232 on every one. The RLE mesher draws the SAME WORLD as greedy. The v2794 worry about greedy over-emitting 20 faces at a chunk boundary does not reach the picture.",
        how: "Nothing to do. Re-run `node render-qa.mjs --only world-default,world-rle,world-biomes,world-rle-biomes` if the mesher ever changes.",
        link: "/rle-mesh-demo.html",
    },
    {
        id: "codegraph", title: "Try code-review-graph on this repo (pip install, one command)",
        why: "2,249 source files and 470,660 lines. EVERY ROUND I SPEND TURNS GREPPING TO FIND THINGS, and more than once this session I answered from a filename instead of opening the file -- rig.html, which I called a character rig without reading it. A structural index is aimed at exactly that. TWO of the four repos reviewed are the same idea (tree-sitter -> code graph -> MCP); this is the one to try first because it is `pip install` rather than a Go+CGO build, and because it publishes HONEST benchmarks -- failed eval runs excluded from aggregates instead of inflating them, and a realistic grep-and-read agent as the baseline.",
        how: "pip install code-review-graph && code-review-graph install && code-review-graph build. Then judge it the way this engine judges everything: does it answer a structural question about the roundhouse or the fluid lab CORRECTLY, not just quickly. It admits false positives on large dependency graphs -- so the test is whether its answers are right, not whether they are short.",
        link: "/rig.html",
    },
    {
        id: "dfg", title: "BLOCKED -- dfg-benchmark's answer key is LOST SOURCE, so this is not a run yet",
        why: "*** DO NOT SCHEDULE THE LONG RUN: IT DIES IN ONE SECOND. *** simulation/lbm/dfgBenchmark.mjs -- the DFG case definitions, latticeFor() and runPlan() this tool grades against -- IS IN NO COMMIT OF THIS REPOSITORY (git begins at v3842; the tool is v2846), so it was lost when the project moved into git. WHY IT IS STILL WORTH RECOVERING: every other instrument in the lab is graded against somebody else's truth -- Onsager, Yang, Michalke, Hagen-Poiseuille, Feigenbaum, ln 2. THE WIND TUNNEL IS THE EXCEPTION: its answer key is the momentum-balance identity, DERIVED FROM THE SAME SOLVER IT CHECKS. That is self-consistency, not correctness -- a solver with a systematically wrong viscosity would satisfy it perfectly. The DFG benchmark of Schaefer and Turek (1996) is the standard laminar-cylinder case that seventeen groups computed independently, and v2835's driven inlet is what finally made it expressible here.",
        how: "RECOVER THE KEY FIRST: it survives only in a pre-v3842 zip, if anywhere -- search old EngineProject_vNNN builds for simulation/lbm/dfgBenchmark.mjs. Failing that, re-derive the 2D-1/2D-2 case data from the published paper. ONLY THEN is it a rig job, and then for transit time rather than difficulty: at Umean 0.02 through a 440-cell channel one pass takes 22,000 steps, and a steady case needs several before the wake stops growing. The sandbox ran 20,000 and got a drag coefficient swinging between -1.39 and 7.36 -- under-settled, exactly as the arithmetic predicts. AND READ THE REFERENCE VALUES OUT OF THE PAPER YOURSELF: they are deliberately NOT hardcoded, because v2809 wrote a gate against recalled Fresnel table values and two were wrong in the fifth decimal -- the code was right and the oracle was not.",
        link: "/wind-tunnel.html",
    },
    {
        id: "eyes", title: "LOOK at things nobody has looked at",
        why: "Three artifacts have been shipped, gated, and never seen by a human: the v2538 hybrid skin (968 tris -- does it LOOK right?), the v2543 uncertainty map (has anyone SEEN it?), and v2531's wallpaper.html under Lively. A gate proves a number. It does not prove a picture.",
        how: "Open them.",
        link: "/flesh.html",
    },
];

function runOne(rel, cb) {
    const file = path.join(ENGINE, rel);
    if (!rel.endsWith("-selfcheck.mjs") || !fs.existsSync(file) || rel.includes("..")) {
        return cb({ ok: false, code: -1, out: "no such selfcheck: " + rel });
    }
    // *** v3919 -- THIS RUNNER HAD ITS OWN BUDGET, AND gatesBridge's OWN COMMENT SAYS THAT CANNOT HAPPEN. ***
    //
    // v3212 wrote, in gatesBridge.js: "THE BUDGET IS NOT THE PAGE'S BUSINESS. It comes from
    // tools/ship/gateBudget.mjs -- the same table selfchecks.mjs uses -- so a gate cannot be given one budget by
    // the button and another by the ship. TWO DECLARATIONS ABOUT ONE THING IS THIS TREE'S MOST REPEATED DEFECT;
    // there is one table." IT FIXED THE BUTTON AND THE SHIP. THIS IS A THIRD RUNNER AND NOBODY NOTICED IT.
    //
    // The flat 180000 below was ABOVE the general default (139.9s), so ordinary gates were fine and nothing
    // looked wrong -- but it is BELOW twenty of the thirty-five MEASURED budgets, so those twenty COULD NEVER
    // PASS ON rig.html no matter what they did. levelClaim is budgeted 2116s and was killed at 180.
    // assumptionMap reads "TIMEOUT (180s budget)" while the table beside it says 568s.
    //
    // The budget now comes from the one table. The table is ESM and this runner is callback-style, so it is
    // loaded once and memoised; the SOURCE of the number travels with the result so the page can show where it
    // came from rather than asserting the wiring in a sentence.
    loadBudgets().then(({ gb, hs }) => spawnOne(rel, file, gb, hs, cb));
}

// *** v4004 -- WHAT IS RUNNING, AND HOW FAR IN. ***
//
// Keith: "can rig.html for each step show how much time is expected? whether the hash is already matched? what
// step each rig step is on, unless that would slow down a test."
//
// THE LAST CLAUSE IS THE DESIGN CONSTRAINT AND IT IS SATISFIED BY CONSTRUCTION. spawnOne ALREADY receives the
// child's stdout incrementally and concatenates it into `out` -- that work happens whether anybody looks or
// not. This registry hands out a VIEW of that same buffer. The child is never signalled, never paused, and
// never asked anything; a poll reads a string this process was already holding. The measurement is in
// tools/ship/rigProgress-selfcheck.mjs rather than in this sentence.
const LIVE = new Map();   // rel -> { t0, out, done }

// gate-timings.json is the OBSERVED record every full suite run writes. Read once and memoised: this is the
// "how long does it usually take" half, and it is a different question from the budget.
let OBSERVED_MS = null;
function observedMs(rel) {
    if (OBSERVED_MS === null) {
        try { OBSERVED_MS = JSON.parse(fs.readFileSync(path.join(ENGINE, "tools", "ship", "gate-timings.json"), "utf8")).timings || {}; }
        catch { OBSERVED_MS = {}; }
    }
    return OBSERVED_MS[String(rel).replace(/\\/g, "/")] ?? null;
}

/** The last line that looks like a gate's own section header, which is what "what step is it on" means here. */
function progressOf(rel) {
    const r = LIVE.get(rel);
    if (!r) return { running: false };
    const lines = r.out.split("\n").filter((l) => l.trim());
    // Gates in this tree print numbered sections ("3. THE RECEIPT IS STILL THERE") and PASS/FAIL rows. The
    // SECTION is the useful one -- a row scrolls past, a section says which third of the gate you are in.
    let section = null;
    for (const l of lines) if (/^\s*\d+[.)]\s+\S/.test(l)) section = l.trim();
    const checks = lines.filter((l) => /^\s*(PASS|FAIL|ok|not ok)\b/.test(l.trim())).length;
    return { running: !r.done, ms: Date.now() - r.t0, section, checks, lastLine: lines[lines.length - 1] || null,
             bytes: r.out.length };
}

/** sha256 of the gate FILE. See hostScale.passState for what this does and does not mean. */
function fileHash(file) {
    try { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16); }
    catch { return null; }
}

let BUDGETS = null;
function loadBudgets() {
    if (!BUDGETS) BUDGETS = Promise.all([
        import("../tools/ship/gateBudget.mjs").catch(() => null),
        import("../tools/ship/hostScale.mjs").catch(() => null),
    ]).then(([gb, hs]) => ({ gb, hs }));
    return BUDGETS;
}

function spawnOne(rel, file, gb, hs, cb) {
    // A FAILED IMPORT MUST NOT SILENTLY REINVENT A NUMBER. If the table cannot be read the budget is reported as
    // coming from nowhere, which is a visible defect, rather than falling back to a constant that looks fine.
    let budgetMs = 180000, budgetSource = "fallback: gateBudget.mjs could not be loaded";
    try {
        if (gb && typeof gb.budgetFor === "function") {
            budgetMs = gb.budgetFor(rel);
            budgetSource = typeof gb.budgetReason === "function" ? gb.budgetReason(rel) : "tools/ship/gateBudget.mjs";
        }
    } catch { /* keep the fallback and say so */ }
    // v3923 -- and the table is ONE BOX'S STOPWATCH, so this box scales it by what it has actually done. The
    // scale starts at 1 with no local runs and only ever GROWS a budget; see tools/ship/hostScale.mjs.
    try {
        if (hs && typeof hs.scaled === "function") {
            const sc = hs.scaled(budgetMs);
            if (sc.scale > 1) budgetSource += "  |  host x" + sc.scale.toFixed(2) + " (" + sc.why + ")";
            else budgetSource += "  |  host x1.00 (" + sc.why + ")";
            budgetMs = sc.ms;
        }
    } catch { /* an unreadable local file must never stop a gate running */ }
    let out = "";
    const t0 = Date.now();
    const p = spawn(process.execPath, [file], { cwd: ENGINE, env: { ...process.env } });
    // The SAME buffer the result is built from -- not a copy, and not a second stream off the child. A poll
    // reads this object; the child is untouched.
    const live = { t0, out: "", done: false };
    LIVE.set(rel, live);
    const grab = (d) => { out += d.toString(); if (out.length > 200000) out = out.slice(-200000); live.out = out; };
    p.stdout.on("data", grab);
    p.stderr.on("data", grab);
    // v3076 -- A TIMEOUT IS NOT A FAILURE, and reporting them identically is what makes a suite untrustworthy.
    //
    // Keith's run showed three gates as "FAIL null 180.0s". null is the exit code of a process that was KILLED --
    // it never returned a verdict at all. Reading that as a failure is a confident wrong answer about work that
    // was never finished, and it sits in the report next to genuine failures with nothing to tell them apart.
    // Three of eight "failures" in that run were this.
    //
    // The distinction matters in both directions: a real failure needs fixing, a timeout needs either a longer
    // budget or a smaller fixture, and treating the second as the first sends you looking for a bug that is not
    // there. gatesBridge already carried a timedOut flag; this runner threw the information away.
    let timedOut = false;
    const kill = setTimeout(() => { timedOut = true; try { p.kill("SIGKILL"); } catch {} }, budgetMs);
    p.on("close", (code) => {
        clearTimeout(kill);
        // THE EXIT CODE IS THE VERDICT. Not a regex over stdout. v2544 shipped past a gate because a pipe ate the
        // exit status, and scraping "all checks pass" out of text would rebuild that bug in a browser.
        //
        // ...but a killed process HAS no verdict, and `code === 0` being false is not evidence of anything. A
        // timed-out gate is reported as such, with the budget it exceeded, so the reader knows what to do next.
        const took = Date.now() - t0;
        // Record what this box actually did, so the next budget is measured rather than assumed. A killed run is
        // recorded as a LOWER BOUND -- without it a badly-mismatched box that times out on everything would
        // never produce a completed run to learn from, which is exactly the box that needs the scale.
        live.done = true;
        try { if (hs && typeof hs.recordRun === "function") hs.recordRun(rel, took, code === 0 && !timedOut, undefined, fileHash(file)); } catch {}
        cb({ ok: code === 0, code, timedOut, timeoutMs: budgetMs, budgetSource, out, ms: took });
    });
    p.on("error", (e) => { clearTimeout(kill); live.done = true; cb({ ok: false, code: -1, out: String(e && e.message) }); });
}

function handle(req, res) {
    const url = req.url.split("?")[0];
    if (req.method === "GET" && url === "/rig/list") {
        // v4004 -- THE EXPECTATION TRAVELS WITH THE LIST, AND COSTS A TEST NOTHING: it is read once here,
        // before anything is spawned, out of tables that already exist. `expectedMs` is what this gate HAS
        // TAKEN (gate-timings.json, host-scaled); `budgetMs` is when it gets killed. Those are different
        // numbers and the page shows both, because "usually 47s, killed at 182s" tells you what a run at 90s
        // means and either number alone does not.
        loadBudgets().then(({ gb, hs }) => {
            const checks = discover().map((c) => {
                const file = path.join(ENGINE, c.rel);
                let budgetMs = null, expectedMs = null;
                try { if (gb && gb.budgetFor) budgetMs = gb.budgetFor(c.rel); } catch {}
                try { if (gb && gb.OBSERVED) expectedMs = gb.OBSERVED[c.rel.replace(/\\/g, "/")] ?? null; } catch {}
                if (expectedMs == null) { try { expectedMs = observedMs(c.rel); } catch {} }
                try { if (hs && hs.scaled) { if (budgetMs != null) budgetMs = hs.scaled(budgetMs).ms;
                                             if (expectedMs != null) expectedMs = hs.scaled(expectedMs).ms; } } catch {}
                let pass = { state: "unknown", passAt: null };
                try { if (hs && hs.passState) pass = hs.passState(c.rel, fileHash(file)); } catch {}
                return { ...c, budgetMs, expectedMs, passState: pass.state, passAt: pass.passAt };
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ checks, rigOnly: RIG_ONLY }));
        }).catch(() => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ checks: discover(), rigOnly: RIG_ONLY }));
        });
        return true;
    }
    // v4004 -- WHAT STEP IS IT ON. Reads the buffer this process is already filling; the child is not touched.
    if (req.method === "GET" && url === "/rig/progress") {
        const rel = decodeURIComponent((req.url.split("?")[1] || "").replace(/^rel=/, ""));
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(progressOf(rel)));
        return true;
    }
    if (req.method === "POST" && url === "/rig/run") {
        let body = "";
        req.on("data", (d) => { body += d; if (body.length > 4096) req.destroy(); });
        req.on("end", () => {
            let rel = "";
            try { rel = JSON.parse(body || "{}").rel || ""; } catch {}
            runOne(rel, (r) => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(r));
            });
        });
        return true;
    }
    return false;
}

module.exports = { handle, discover, runOne, RIG_ONLY };
