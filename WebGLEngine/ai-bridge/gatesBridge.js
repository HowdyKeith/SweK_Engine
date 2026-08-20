// FILE: ai-bridge/gatesBridge.js
//
// v2806 - front door for the verification suite. tools/ship/selfchecks.mjs runs ~90 gates in one 100-second
// blocking batch and prints a wall of text; gates.html drives them ONE AT A TIME through this bridge so the page
// can show live progress, per-gate pass/fail, and each gate's own output on demand.
//
// DISCOVERY MIRRORS THE SUITE EXACTLY -- same walk, same ignore list, same /selfcheck.*\.mjs$/ pattern -- and the
// suite's ALREADY_GATED and SKIP entries are PARSED OUT OF ITS SOURCE rather than copied here, so the two cannot
// drift. If the page showed a different set of gates than the ship gate runs, it would be worse than no page.
//
// SECURITY: /gates/run takes a NAME, and the name must appear in the discovered list. Nothing else is executable
// through this bridge -- no traversal, no absolute paths, no arbitrary .mjs. The selfcheck asserts that.

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
let _live = 0, _lastGateAt = 0;

const ENGINE = path.join(__dirname, "..");
const SUITE = path.join(ENGINE, "tools", "ship", "selfchecks.mjs");
const PREFIX = "/gates";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

// same rules as tools/ship/selfchecks.mjs walk()
function walk(dir, out = []) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return out; }
    for (const f of entries) {
        if (f === "node_modules" || f === ".git" || f === "vendor" || f === ".venv") continue;
        const p = path.join(dir, f);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, out);
        else if (/selfcheck.*\.mjs$/.test(f)) out.push(path.relative(ENGINE, p).split(path.sep).join("/"));
    }
    return out;
}

// Pull the suite's own exclusion lists out of its source so this bridge cannot disagree with the ship gate.
function suiteExclusions() {
    let src = "";
    try { src = fs.readFileSync(SUITE, "utf8"); } catch { return { alreadyGated: [], skip: [], parsed: false }; }
    const block = (name) => {
        const i = src.indexOf(name);
        if (i < 0) return "";
        const end = src.indexOf("]);", i);
        return end < 0 ? "" : src.slice(i, end);
    };
    const paths = (s) => [...s.matchAll(/"([^"]+selfcheck[^"]*\.mjs)"/g)].map((m) => m[1]);
    const alreadyGated = paths(block("const ALREADY_GATED"));
    const skipBlock = block("const SKIP");
    const skip = paths(skipBlock);
    // reason text follows each path inside the SKIP map
    const reasons = {};
    for (const m of skipBlock.matchAll(/\["([^"]+\.mjs)",\s*\n?\s*"([\s\S]*?)"\]/g)) reasons[m[1]] = m[2].replace(/"\s*\+\s*\n?\s*"/g, "").trim();
    return { alreadyGated, skip, reasons, parsed: alreadyGated.length > 0 || skip.length > 0 };
}

function listGates() {
    const ex = suiteExclusions();
    const self = "tools/ship/selfchecks.mjs";
    const all = walk(ENGINE).sort();
    const runnable = all.filter((f) => f !== self && !ex.alreadyGated.includes(f) && !ex.skip.includes(f));
    return {
        runnable,
        alreadyGated: ex.alreadyGated,
        skipped: ex.skip.map((f) => ({ file: f, reason: (ex.reasons && ex.reasons[f]) || "excluded by the suite" })),
        parsedExclusions: ex.parsed,
        total: all.length,
    };
}

// v3233 -- `extraArgs` added for the tools front door. A gate never passes any; an ARTEFACT tool passes the flag
// that makes it write, and THAT FLAG COMES FROM tools/ship/reportingTools.mjs RATHER THAN FROM A QUERY STRING --
// a spawner that took arguments from a caller would be an arbitrary command runner wearing a tool's name, which
// is the refusal this file already makes about filenames, one argument further out. Defaulting to [] keeps every
// existing caller byte-identical.
function runGate(rel, timeoutMs, extraArgs) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        // v3075 -- COUNT THE LIVE GATE so the updater can see a suite in progress. gates.html runs the suite ONE
        // AT A TIME, so between two gates there is no child and a naive "is a child alive" check would report
        // idle in exactly the gap the updater is most likely to land in. _lastGateAt is what closes that gap.
        _live++; _lastGateAt = Date.now();
        execFile(process.execPath, [path.join(ENGINE, rel), ...(Array.isArray(extraArgs) ? extraArgs : [])], { cwd: ENGINE, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
            (err, stdout, stderr) => {
            _live = Math.max(0, _live - 1); _lastGateAt = Date.now();
                const ms = Date.now() - t0;
                const timedOut = !!(err && (err.killed || err.signal === "SIGTERM"));
                resolve({
                    file: rel,
                    pass: !err,
                    timedOut,
                    exitCode: err && typeof err.code === "number" ? err.code : (err ? 1 : 0),
                    ms,
                    // v3212 -- THE BUDGET TRAVELS WITH THE RESULT. "TIMED OUT" without the budget leaves a
                    // reader unable to judge whether it was close (windTunnel missed by 3s) or nowhere near.
                    budgetMs: timeoutMs,
                    output: (String(stdout || "") + String(stderr || "")).trim().slice(-20000),
                });
            });
    });
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";

    if (route === "/list" || route === "/") {
        const l = listGates();
        return sendJson({ ok: true, ...l });
    }

    if (route === "/run") {
        const name = url.searchParams.get("name") || "";
        const { runnable } = listGates();
        // ONLY a discovered gate may run. Not a path, not a pattern -- an exact member of the list.
        if (!runnable.includes(name)) {
            return sendJson({ ok: false, error: "not-a-gate", message: "Refused: only a discovered selfcheck can be run.", name }, 400);
        }
        // v3212 -- *** THE PAGE COULD NOT ASK FOR ENOUGH TIME, AND THAT MADE THE BUTTON UNABLE TO FINISH THE
        // SUITE. *** gates.html sends no timeout at all, so every gate ran at the 60s default; and this line
        // CLAMPED ANY REQUEST TO 120s, so no value the page was capable of sending would have let
        // thermalScaling (232s), labExport (241s), pipeFlowKey (250s), labDevices (254s) or rayleighOnset (280s)
        // finish. THE FRONT DOOR EXISTED AND STRUCTURALLY COULD NOT EXPRESS THE BUDGET THE SUITE NEEDS.
        //
        // THE BUDGET IS NOT THE PAGE'S BUSINESS. It comes from tools/ship/gateBudget.mjs -- the same table
        // selfchecks.mjs uses -- so a gate cannot be given one budget by the button and another by the ship.
        // TWO DECLARATIONS ABOUT ONE THING IS THIS TREE'S MOST REPEATED DEFECT; there is one table.
        const { budgetFor, maxBudgetMs } = await import("../tools/ship/gateBudget.mjs");
        const asked = parseInt(url.searchParams.get("timeout") || "0", 10);
        // *** THE 900s I TYPED HERE LAST ROUND WAS FALSE WITHIN ONE ROUND. *** It was justified as "above the
        // largest budget the table can currently produce (560s)", and then khMichalke measured 573s, whose
        // budget is 1146s. A NUMBER THAT WAS TRUE WHEN WRITTEN AND IS CHECKED BY NOTHING is the exact defect
        // these rounds are about, committed in the sentence describing it. maxBudgetMs() computes it from the
        // table with room to grow, and the gate asserts the RELATIONSHIP instead of the number.
        const timeout = asked ? Math.max(5000, Math.min(maxBudgetMs(), asked)) : budgetFor(name);
        const r = await runGate(name, timeout);
        return sendJson({ ok: true, ...r });
    }

    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

// A suite is "running" while a gate is live OR one finished within the last few seconds -- the pause between
// two serial gates is not the end of the run, and that pause is exactly where an updater would land.
function running() { return _live > 0 || (Date.now() - _lastGateAt) < 8000; }

// v3220 -- runGate IS EXPORTED so the tools front door can SPAWN THROUGH IT rather than writing a second
// spawner. It already carries everything a second one would have had to rediscover: the live-gate counter the
// updater consults (v3075), the timedOut flag kept apart from a failure (v3076), the budget travelling with the
// result (v3212), and a bounded stdout. A SECOND SPAWNER WOULD DRIFT FROM ALL FOUR SILENTLY -- this tree has
// paid for duplicate implementations of one job repeatedly, and process spawning is the last place to repeat it.
module.exports = { owns, handle, listGates, running, runGate, PREFIX };
