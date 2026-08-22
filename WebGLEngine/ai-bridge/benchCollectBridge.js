// FILE: ai-bridge/benchCollectBridge.js
//
// v2985 -- COLLECTING BENCHMARK SCORES ACROSS THE FLEET.
//
// v2984 built the score: a peer can be ASKED for one at GET /bench/score, and it answers with a time, the
// correctness residual from the SAME run, its arch and its engine version. What it could not do was ask the
// others. This is the fan-out.
//
// IT REUSES fingerprintBridge's fetchJson RATHER THAN WRITING A SECOND PEER CLIENT. That bridge has been talking
// to this fleet since v2900-something, with its own timeout and error shapes settled by contact with real
// machines. A second fetcher would drift from it silently -- this tree has paid for duplicate implementations of
// one job repeatedly, and the transport layer is the last place to repeat it.
//
// WHAT IT WILL NOT DO. Everything v2984 refuses, it still refuses -- and the refusals matter MORE here, because
// a fleet table looks authoritative in a way a single number does not:
//   a peer that returns a TIME but the wrong ANSWER is not ranked, even if it is fastest;
//   a fleet running two engine builds is INCOMPARABLE, and nothing is declared fastest;
//   an unreachable peer is FAILED, never zero.
// The ranking function is v2984's, unchanged and already gated. This file only gathers the rows.
"use strict";
const os = require("os");
const path = require("path");
const { fetchJson } = require("./fingerprintBridge.js");

// v3021 -- WAS "/bench", AND THAT MADE THIS ENTIRE BRIDGE UNREACHABLE FROM v2985 TO v3020.
//
// benchBridge.js also declares PREFIX = "/bench" and its owns() is GREEDY -- url.startsWith(PREFIX + "/") --
// so it claims everything under /bench/. It is dispatched at server.js:4271; this file is dispatched at 15481.
// FIRST MATCH WINS, so /bench/collect and /bench/score were answered by benchBridge and NEVER ARRIVED HERE.
//
// The gate passed the whole time because it called handle() DIRECTLY, never through the server's dispatch chain.
// A module tested in isolation while its real path is hijacked is the sharpest version of "gated but
// unreachable" this session has found -- the check was real, the route was not.
//
// /fleetbench is distinct and cannot be swallowed. Found because Keith asked which services have no minipanel.
const PREFIX = "/fleetbench";
function owns(url) {
    const p = String(url || "").split("?")[0];
    return p === PREFIX || p === PREFIX + "/collect" || p === PREFIX + "/score";
}

function engineVersion() {
    try {
        return (require("fs").readFileSync(path.join(__dirname, "..", "main.js"), "utf8")
            .match(/ENGINE_VERSION = "(v\d+)"/) || [])[1] || "unknown";
    } catch { return "unknown"; }
}

/** This box's own score, in the same row shape a peer returns, so self and peer are never handled differently. */
async function localRow() {
    const m = await import("../tools/bench/fleetBench.mjs");
    return { host: os.hostname(), url: "(this box)", arch: process.arch, platform: process.platform,
             engineVersion: engineVersion(), ok: true, score: m.score() };
}

/**
 * Ask every peer for a score, add our own, and rank with v2984's rules.
 * @param {string[]} urls peer base URLs
 */
async function collectScores(urls, { includeSelf = true, timeoutMs = 20000 } = {}) {
    const m = await import("../tools/bench/fleetBench.mjs");
    const rows = [];
    if (includeSelf) {
        try { rows.push(await localRow()); }
        catch (e) { rows.push({ host: os.hostname(), url: "(this box)", ok: false, error: String((e && e.message) || e) }); }
    }
    const peers = await Promise.all((urls || []).map(async (u) => {
        const base = String(u).replace(/\/+$/, "");
        // The workload takes seconds, so the timeout is generous -- a peer that is merely SLOW must read as slow
        // and not as unreachable, or the table would quietly drop exactly the machines it exists to show.
        const r = await fetchJson(base + "/fleetbench/score", timeoutMs);
        if (!r || r.ok === false) return { url: base, ok: false, error: (r && r.error) || "no response" };
        return { url: base, host: r.host || base, arch: r.arch, platform: r.platform,
                 engineVersion: r.engineVersion, ok: true, score: r.score };
    }));
    rows.push(...peers);
    const ranked = m.rank(rows);
    return {
        ok: true, collected: rows.length,
        reachable: rows.filter((x) => x.ok).length,
        ...ranked,
        workload: m.WORKLOAD.label,
        caveat: "Every ranked peer produced the exact Poiseuille profile from the same run that produced its time. A peer with a time but the wrong answer is listed as diverged, not ranked.",
    };
}

function readBody(req, limit = 32768) {
    return new Promise((resolve) => {
        let s = "";
        req.on("data", (c) => { s += c; if (s.length > limit) { s = s.slice(0, limit); req.destroy(); } });
        req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
        req.on("error", () => resolve({}));
    });
}

async function handle(req, res, { sendJson }) {
    const route = String(req.url).split("?")[0].slice(PREFIX.length) || "/";
    if (route === "/score") {
        try { return sendJson({ ok: true, ...(await localRow()) }); }
        catch (e) { return sendJson({ ok: false, error: String((e && e.message) || e) }, 500); }
    }
    if (route === "/collect") {
        if (req.method !== "POST") return sendJson({ ok: false, error: "method", message: "POST { urls: [...] } to /fleetbench/collect" }, 405);
        const b = await readBody(req);
        if (!Array.isArray(b.urls)) return sendJson({ ok: false, error: "urls", message: "body needs { urls: [...] }. Refusing to guess the fleet." }, 400);
        return sendJson(await collectScores(b.urls, { includeSelf: b.includeSelf !== false }));
    }
    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, collectScores, localRow, engineVersion };
