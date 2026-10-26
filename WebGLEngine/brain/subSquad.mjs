// WebGLEngine/brain/subSquad.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SQUAD OF DEFENDING SUBMARINES THAT SPREAD OUT, SHARE WHAT THEY HEAR AND SEND OUT PROBES. The tacticians of brain/subTactics.mjs fight alone: each starts where it is put, sweeps its own heading and
// hears only with its own ears, so three defenders bunch on one spot and the OGRE (or an intruder) is found by whichever boat happens to be pointed at it. This layer WRAPS a tactician and does three things the
// level asked for, none of which changes the tactician itself:
//
//   SPREAD   every boat has a STATION on an arc about the headquarters across the threat axis (n boats, `spread` radians between neighbours, `radius` metres out) and its own DEPTH BAND (16 m + 8 m a boat, so
//            two boats are never at one depth), and while it hears nothing and has no fix it PATROLS it: it steers for a waypoint that sweeps +-0.3 x the spread about the station every 70 s (so two neighbours, which sweep in different phases, are never nearer than 0.4 of the spread), at 2 m/s. The axis is told to
//            the squad (an early warning of where the threat comes from: said plainly, it is not heard).
//   SHARE    a DATALINK, instant and perfect (said plainly). Every passive contact a boat or a probe hears is a BEARING from a known place; two bearings from two places at least 12 degrees apart cross at a FIX
//            (the least-squares crossing of the bearing lines, bearings younger than 6 s). A boat that hears nothing itself but has a fix is handed an ECHO at the fix (a bearing off its own nose, an elevation
//            0 and a range) -- the input the tactician's ATTACK state already knows how to use -- so the whole squad can close on, and fire at, what any one of them heard.
//   PROBES   a boat with probes left that has no fix and hears nothing, every 40 s, sends out a PROBE: a stationary hydrophone dropped 150 m ahead along its nose, at its depth, that listens for 120 s with a
//            quiet array (a probe has no flow noise: it hears what the ocean lets it, 20 dB of array gain) and reports every bearing to the datalink. Three probes to a boat that has them. A probe is the cheap
//            way to look where the boat is not: it hears an OGRE from ~2.3 km.
//
// WHAT IT IS NOT: the fix has no depth (an echo's elevation is 0); a probe is a point that never moves and is never attacked; the datalink never drops. Said plainly.
// Pure: no DOM, no Math.random, no clock.
"use strict";

export const SQUAD = Object.freeze({ radius: 160, spread: 0.55, sweepFrac: 0.3, sweepPeriod: 70, patrolSpeed: 2, depthBase: 16, depthStep: 8, fixWindow: 6, minAngle: 12 * Math.PI / 180, probeEvery: 40, probeAhead: 150, probeLife: 120, probesPerBoat: 3, probeDi: 20 });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The squad. `n` boats; options: { axis (the threat's bearing from the headquarters, the engine's heading: 0 = +x), hq: [x, y], radius, spread, probes: [boat indices that carry probes] }.
 * Returns { station(i, t), report(src, absBearing, t), fix(t), wrap(i, tactics), addProbe(p), liveProbes(t), config }.
 */
export function createSquad(n, { axis = 0, hq = [0, 0], radius = SQUAD.radius, spread = SQUAD.spread, probes = [] } = {}) {
    if (!(n >= 1)) throw new Error("subSquad.createSquad: at least one boat");
    const reports = [], live = [], carry = new Set(probes);
    // axis is a heading (0 = +x, y flips): a boat at angle a about the headquarters stands at hq + radius (cos a, -sin a) with a = axis + the boat's offset
    const offset = (i) => (i - (n - 1) / 2) * spread;
    /** The station of boat i at time t (s): { x, y, depth, heading (toward the waypoint is the caller's) }; the waypoint sweeps about the station. */
    function station(i, t) {
        const a = axis + offset(i) + SQUAD.sweepFrac * spread * Math.sin(2 * Math.PI * t / SQUAD.sweepPeriod + i * 1.7);
        return { x: hq[0] + radius * Math.cos(a), y: hq[1] - radius * Math.sin(a), depth: SQUAD.depthBase + SQUAD.depthStep * i };
    }
    /** A passive bearing: `src` is { id, x, y } (a boat or a probe), absBearing the ABSOLUTE heading that points at what was heard. */
    function report(src, absBearing, t) {
        const k = reports.findIndex((r) => r.id === src.id);
        const r = { id: src.id, x: src.x, y: src.y, a: absBearing, t };
        if (k >= 0) reports[k] = r; else reports.push(r);
    }
    /** The fix at time t: { x, y, sources, spanDeg } from the freshest bearing of each source inside the window, or null. Two bearings that are nearly parallel (under 12 degrees apart) cross nowhere useful and give null. */
    function fix(t) {
        const rs = reports.filter((r) => t - r.t <= SQUAD.fixWindow && t - r.t >= 0);
        if (rs.length < 2) return null;
        let widest = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const d = Math.abs(wrap(rs[i].a - rs[j].a)); widest = Math.max(widest, Math.min(d, Math.PI - d)); }
        if (widest < SQUAD.minAngle) return null;
        // minimise the sum of squared perpendicular distances to the lines p + s u, u = (cos a, -sin a): (sum (I - u u^T)) x = sum (I - u u^T) p
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        for (const r of rs) { const ux = Math.cos(r.a), uy = -Math.sin(r.a), m11 = 1 - ux * ux, m12 = -ux * uy, m22 = 1 - uy * uy; a11 += m11; a12 += m12; a22 += m22; b1 += m11 * r.x + m12 * r.y; b2 += m12 * r.x + m22 * r.y; }
        const det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-9) return null;
        return { x: (a22 * b1 - a12 * b2) / det, y: (a11 * b2 - a12 * b1) / det, sources: rs.length, spanDeg: widest * 180 / Math.PI };
    }
    const addProbe = (p) => { live.push({ ...p }); return live.length; };
    const liveProbes = (t) => live.filter((p) => t >= p.t0 && t <= p.t0 + SQUAD.probeLife);
    let lastProbe = new Array(n).fill(-1e9);

    /**
     * Wrap a tactician for boat `i`: returns decide(obs) -> cmd. `obs.self.x/y/heading/probes` are read (probes: how many the boat has left, supplied by the arena when it has any). Adds `cmd.probe = true` when the
     * boat should send one out. The squad's reports are made by the ARENA (it holds the sonar): this wrapper only reads the fix.
     */
    function wrapTactics(i, tactics) {
        return function decide(obs) {
            const s = obs.self, t = obs.t, f = fix(t), own = obs.contacts.some((c) => c.kind === "boat");
            let o = obs;
            if (f && !own) { const dx = f.x - s.x, dy = f.y - s.y, abs = Math.atan2(-dy, dx); o = { ...obs, echoes: [...obs.echoes, { bearing: wrap(abs - s.heading), elevation: 0, range: Math.hypot(dx, dy), datalink: true }] }; }
            const cmd = { ...(tactics(o) || {}) };
            if (!own && !f) {
                const st = station(i, t), dx = st.x - s.x, dy = st.y - s.y;
                cmd.heading = Math.atan2(-dy, dx); cmd.depth = st.depth; cmd.speed = SQUAD.patrolSpeed; cmd.fire = false; cmd.ping = false;
                if (carry.has(i) && (s.probes ?? 0) > 0 && t - lastProbe[i] >= SQUAD.probeEvery) { cmd.probe = true; lastProbe[i] = t; }
            }
            return cmd;
        };
    }
    return { station, report, fix, wrap: wrapTactics, addProbe, liveProbes, offset, config: Object.freeze({ n, axis, hq, radius, spread, probes: [...carry] }) };
}
