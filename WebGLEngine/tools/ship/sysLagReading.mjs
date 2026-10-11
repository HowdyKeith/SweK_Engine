// WebGLEngine/tools/ship/sysLagReading.mjs -- v4833 (the library; the command is tools/ship/takeLagReading.mjs)
//
// THE ONE READING THE LAG QUESTION HAS BEEN WAITING FOR, TAKEN WITH ONE COMMAND. tools/ship/nextRounds.mjs' `sys-lag-reading` has said since v3317 that the steady ~22% periodic cost on Keith's rig is unowned
// and that "only a reading tells us which callback owns it". The reading is four GETs against the running engine after a few minutes of uptime; this tool waits for the uptime, takes all four, saves them
// whole, and prints the part worth pasting back:
//
//     node tools\ship\takeLagReading.mjs [port]            default port 8787; waits for 300 s of engine uptime
//     node tools\ship\takeLagReading.mjs 8787 --min-uptime-s 600 --out C:\temp\lag.json
//
//   GET /health        uptimeSec -- so "a few minutes" is checked, not assumed
//   GET /sys/lag       the event loop's blocked intervals: cumulative blocked ms, the worst, and the 25 worst events as (atMs since boot, lagMs). NOT the callbacks.
//   GET /sys/blame     THE CALLBACKS: every setInterval callback that took 250 ms or more in a tick, NAMED BY ITS REGISTRATION SITE (file:line captured when it was registered), worst first, with its period.
//   GET /sys/slow      the routes that took 250 ms or more to answer.
//   GET /sys/lagblame  the profiler's frames, if it was armed (empty otherwise -- that is normal).
//
// *** v4832 CORRECTION TO THE BACKLOG ENTRY: it said `GET /sys/lag` "names each blocking callback by its registration site". It does not -- /sys/lag carries durations only; the registration-site table is /sys/blame
// (ai-bridge/server.js, _blameReport). A reading of /sys/lag alone would have answered how much and when, and never who. ***
//
// WHAT THE ANALYSIS CAN AND CANNOT SAY. /sys/lag returns the 25 WORST of at most 200 recorded events, so the period guess below is from the worst events, not every event, and `truncated` says when the 200 ran
// out. The duty cycle is blockedMsTotal over uptime and undercounts once truncated. Nothing here names a callback by inference: the owner is whatever /sys/blame lists, and an empty list is a finding too (it
// means no setInterval callback ran 250 ms in one tick -- the cost is in something that is not an interval).
"use strict";
import os from "node:os";

export const ENDPOINTS = Object.freeze({ health: "/health", lag: "/sys/lag", blame: "/sys/blame", slow: "/sys/slow", lagblame: "/sys/lagblame" });
export const DEFAULT_PORT = 8787, DEFAULT_MIN_UPTIME_S = 300;

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Turn the four responses into what is worth reading. Pure. Any response may be null (an endpoint that did not answer): the analysis says so rather than inventing a number.
 * Returns { uptimeSec, blockedMsTotal, worstMs, dutyCycle, truncated, events, period, owners, slowRoutes, said }.
 */
export function analyse({ health = null, lag = null, blame = null, slow = null } = {}) {
    const uptimeSec = health && Number.isFinite(health.uptimeSec) ? health.uptimeSec : null;
    const events = lag && Array.isArray(lag.events) ? lag.events.filter((e) => Number.isFinite(e.atMs) && Number.isFinite(e.lagMs)).sort((a, b) => a.atMs - b.atMs) : [];
    const blockedMsTotal = lag && Number.isFinite(lag.blockedMsTotal) ? lag.blockedMsTotal : null;
    const dutyCycle = blockedMsTotal != null && uptimeSec ? blockedMsTotal / (uptimeSec * 1000) : null;
    // the spacing between the worst events: if the cost is periodic, the gaps cluster; the share of gaps within 15% of the median is how tightly
    const gaps = events.slice(1).map((e, i) => e.atMs - events[i].atMs), med = median(gaps);
    const near = med ? gaps.filter((g) => Math.abs(g - med) <= 0.15 * med).length : 0;
    const period = gaps.length >= 3 ? { medianGapMs: Math.round(med), withinFifteenPct: near, of: gaps.length, periodic: near / gaps.length >= 0.6 } : null;
    const owners = blame && Array.isArray(blame.timers) ? blame.timers.map((t) => ({ where: t.where, worstMs: t.worstMs, slowTicks: t.slowTicks, everyMs: t.everyMs })) : null;
    const slowRoutes = slow && Array.isArray(slow.routes) ? slow.routes.map((r) => ({ route: r.route, worstMs: r.worstMs, slowHits: r.slowHits })) : null;
    const said = [];
    if (uptimeSec == null) said.push("/health did not answer: the uptime is unknown, so the duty cycle is not computed");
    if (!lag) said.push("/sys/lag did not answer");
    if (lag && lag.truncated) said.push("the lag log hit its 200-event cap: the blocked total and the period are from the first 200 events only");
    if (owners && owners.length === 0) said.push("/sys/blame is EMPTY: no setInterval callback took 250 ms in a single tick -- whatever blocks the loop is not an interval callback (look at /sys/slow and the profiler)");
    if (!blame) said.push("/sys/blame did not answer");
    return { uptimeSec, blockedMsTotal, worstMs: lag && Number.isFinite(lag.worstMs) ? lag.worstMs : null, dutyCycle, truncated: !!(lag && lag.truncated), events, period, owners, slowRoutes, said };
}

/** The block to paste back: short, and every number in it is one the reading carries. */
export function summaryLines(a, { host = os.hostname(), port = DEFAULT_PORT } = {}) {
    const out = [`[sysLagReading] ${host}:${port}  uptime ${a.uptimeSec == null ? "?" : a.uptimeSec + " s"}`];
    out.push(`  blocked ${a.blockedMsTotal == null ? "?" : (a.blockedMsTotal / 1000).toFixed(1) + " s"} in total` +
        (a.dutyCycle == null ? "" : ` = ${(a.dutyCycle * 100).toFixed(1)}% of uptime`) + `, worst single block ${a.worstMs == null ? "?" : a.worstMs + " ms"}`);
    if (a.period) out.push(`  the worst events are ${a.period.periodic ? "PERIODIC" : "not clearly periodic"}: median gap ${(a.period.medianGapMs / 1000).toFixed(1)} s, ${a.period.withinFifteenPct} of ${a.period.of} gaps within 15% of it`);
    if (a.owners && a.owners.length) {
        out.push("  callbacks that took 250 ms+ in one tick, by REGISTRATION SITE, worst first:");
        for (const t of a.owners.slice(0, 8)) out.push(`    ${String(t.worstMs).padStart(6)} ms worst, ${String(t.slowTicks).padStart(4)} slow tick(s), every ${t.everyMs} ms   ${t.where}`);
    }
    if (a.slowRoutes && a.slowRoutes.length) {
        out.push("  routes that took 250 ms+ to answer:");
        for (const r of a.slowRoutes.slice(0, 5)) out.push(`    ${String(r.worstMs).padStart(6)} ms worst, ${String(r.slowHits).padStart(4)} slow hit(s)   ${r.route}`);
    }
    for (const s of a.said) out.push("  NOTE: " + s);
    return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(base, route, fetchImpl) {
    try { const r = await fetchImpl(base + route, { cache: "no-store" }); return await r.json(); } catch { return null; }
}

/**
 * Wait for the engine and for `minUptimeS` of its uptime, then take the reading. `fetchImpl`, `sleepImpl` and `log` are injectable so the gate can drive it against a stand-in server in milliseconds.
 * Returns { reading: {at, port, health, lag, blame, slow, lagblame}, analysis } or { error }.
 */
export async function takeReading({ port = DEFAULT_PORT, minUptimeS = DEFAULT_MIN_UPTIME_S, deadlineMs = 15 * 60 * 1000, fetchImpl = fetch, sleepImpl = sleep, now = () => Date.now(), log = () => {}, pollMs = 3000 } = {}) {
    const base = "http://127.0.0.1:" + port, t0 = now();
    let health = null, said = 0;
    while (now() - t0 < deadlineMs) {
        health = await getJson(base, ENDPOINTS.health, fetchImpl);
        if (health && Number.isFinite(health.uptimeSec)) {
            if (health.uptimeSec >= minUptimeS) break;
            if (now() - said > 15000) { log(`  engine is up ${health.uptimeSec} s; waiting for ${minUptimeS} s ...`); said = now(); }
        } else if (now() - said > 15000) { log(`  waiting for the engine on ${base} ...`); said = now(); }
        await sleepImpl(pollMs);
    }
    if (!health || !Number.isFinite(health.uptimeSec) || health.uptimeSec < minUptimeS)
        return { error: health && Number.isFinite(health.uptimeSec) ? `the engine reached only ${health.uptimeSec} s of uptime inside the wait` : `no engine answered on ${base}/health inside the wait` };
    const [lag, blame, slow, lagblame] = await Promise.all([ENDPOINTS.lag, ENDPOINTS.blame, ENDPOINTS.slow, ENDPOINTS.lagblame].map((r) => getJson(base, r, fetchImpl)));
    const reading = { format: "swek-lag-reading-v1", at: new Date(now()).toISOString(), host: os.hostname(), port, health, lag, blame, slow, lagblame };
    return { reading, analysis: analyse({ health, lag, blame, slow }) };
}
