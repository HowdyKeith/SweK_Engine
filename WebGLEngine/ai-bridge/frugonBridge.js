// WebGLEngine/ai-bridge/frugonBridge.js -- v3039. Front door for the call log at /frugon.
//
// SIGNATURE NOTE, found by BOOTING the server rather than reading it: this server injects sendJson already
// bound to the response -- sendJson(payload, status). My first draft called sendJson( status, payload),
// which is the shape most frameworks use, and every /frugon request returned an EMPTY REPLY because nothing was
// ever written. node --check passed it; the import graph passed it; only a real request found it. That is the
// mirror of this session's other lesson: reading beats running for crashes a sandbox cannot execute, and
// running beats reading for contracts a signature cannot express.
//
// IT DRIVES frugon, IT DOES NOT PARSE IT. frugon analyze prints a box-drawing TUI. A scraper for that would be
// a second, undeclared dependency on someone else's output formatting, and it would break silently on their
// next release while still returning a confident number. So the raw report is handed to the HUMAN, and the
// per-model COSTS are typed in rather than scraped. Ugly, honest, and it cannot drift.
//
// The tally and the ranking are ours and need no prices to compute, so those are live regardless.
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const ENG = path.join(__dirname, "..");

function owns(url) { return String(url || "").split("?")[0].startsWith("/frugon"); }

function which() {                                  // frugon, or uvx frugon, or neither -- ask, do not assume
    return new Promise((res) => {
        const tryOne = (cmd, args) => new Promise((r) => {
            let done = false;
            const p = spawn(cmd, args, { shell: process.platform === "win32" });
            const t = setTimeout(() => { done = true; try { p.kill(); } catch {} r(false); }, 8000);
            p.on("error", () => { if (!done) { clearTimeout(t); r(false); } });
            p.on("close", (c) => { if (!done) { clearTimeout(t); r(c === 0); } });
        });
        tryOne("frugon", ["--version"]).then((a) => a ? res({ cmd: "frugon", args: [] })
            : tryOne("uvx", ["frugon", "--version"]).then((b) => res(b ? { cmd: "uvx", args: ["frugon"] } : null)));
    });
}

async function handle(req, res, { sendJson }) {
    const u = new URL(req.url, "http://x");
    const sp = u.pathname;
    const rt = await import("../tools/roundhouse/routeTable.mjs");
    const cl = await import("../tools/roundhouse/callLog.mjs");
    const rows = cl.read(ENG);

    // v3040 -- THE TOGGLE, AND THE HONEST THING IT REFUSES TO CLAIM.
    // ENABLED() reads process.env on EVERY call rather than at module load, so flipping it here takes effect on
    // the very next logged call with no restart. Node also copies process.env into any child it spawns, so a
    // roundhouse THIS SERVER starts afterwards inherits it.
    //
    // WHAT IT CANNOT DO, AND MUST NOT PRETEND: a roundhouse you started from your own terminal has its own
    // environment and will never see this. A toggle that reported "capture: on" while the process doing the work
    // never got the variable would be worse than the console `set` -- the console at least fails honestly. So the
    // status below reports SCOPE, not a boolean.
    if (sp === "/frugon/capture") {
        const want = u.searchParams.get("on");
        if (want !== "0" && want !== "1") return sendJson({ ok: false, error: "pass on=1 or on=0" }, 400);
        if (want === "1") process.env.SWEK_CALL_LOG = "1"; else delete process.env.SWEK_CALL_LOG;
        return sendJson({
            ok: true, enabled: cl.ENABLED(),
            scope: "this server process and any child it spawns from now on",
            caveat: "a roundhouse launched from a separate terminal has its own environment and is UNAFFECTED -- use `set SWEK_CALL_LOG=1` in that terminal before starting it",
        });
    }

    if (sp === "/frugon/status") {
        const found = await which();
        return sendJson({
            ok: true, installed: !!found, runner: found ? [found.cmd, ...found.args].join(" ") : null,
            // REFUSE WITH THE FIX, not with an empty report a page would render as "no savings found".
            install: found ? null : "pipx install frugon   (or: uvx frugon ...)  -- MIT, local, no account, zero network calls in analyze mode",
            logPath: cl.logPath(ENG), rows: rows.length, unpriceable: cl.unpriceable(rows),
            capture: cl.ENABLED() ? "on" : "OFF -- set SWEK_CALL_LOG=1 before a roundhouse run or nothing is recorded",
            // SCOPE, not a boolean. The server knowing the flag says nothing about a roundhouse started elsewhere.
            captureScope: cl.ENABLED() ? "this server process and children it spawns -- NOT a roundhouse started from another terminal" : "nothing is being captured anywhere",
            captureProvenance: process.env.SWEK_CALL_LOG === "1" ? "set in this process (env at boot, or the /frugon/capture toggle)" : null,
            models: rt.tally(rows).map((t) => t.model),
        });
    }

    if (sp === "/frugon/table") {
        const t = rt.tally(rows);
        return sendJson({ ok: true, rows: rows.length, minSamples: rt.MIN_SAMPLES, tally: t });
    }

    if (sp === "/frugon/rank") {
        let costs = {};
        try { costs = JSON.parse(u.searchParams.get("costs") || "{}"); } catch { return sendJson({ ok: false, error: "costs must be JSON, e.g. {\"claude-haiku-4-5\":0.0012}" }, 400); }
        const r = rt.rank(rt.tally(rows), Object.keys(costs).length ? costs : null);
        return sendJson({ ok: true, ...r, chain: rt.chain(r), cost: rt.chainCost(r.ranked) });
    }

    if (sp === "/frugon/analyze") {
        const found = await which();
        if (!found) return sendJson({ ok: false, error: "frugon is not installed here", install: "pipx install frugon" }, 424);
        if (!rows.length) return sendJson({ ok: false, error: "the call log is empty -- run the roundhouse with SWEK_CALL_LOG=1 first. Analysing nothing would return a report about nothing.", logPath: cl.logPath(ENG) }, 424);
        const args = [...found.args, "analyze", cl.logPath(ENG)];
        const p = spawn(found.cmd, args, { shell: process.platform === "win32" });
        let out = "", err = "";
        p.stdout.on("data", (d) => { out += d; if (out.length > 400000) p.kill(); });
        p.stderr.on("data", (d) => { err += d; });
        const t = setTimeout(() => { try { p.kill(); } catch {} }, 120000);          // clamp: a typo cannot pin the server
        p.on("close", (code) => { clearTimeout(t); sendJson({ ok: code === 0, code, cmd: [found.cmd, ...args].join(" "), report: out || err }); });
        return;
    }
    return sendJson({ ok: false, error: "unknown /frugon route" }, 404);
}
module.exports = { owns, handle };
