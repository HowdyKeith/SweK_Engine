// WebGLEngine/render/subTournamentView.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT sub-tournament.html SHOWS OF brain/subTournament.mjs, AS PURE FUNCTIONS: the roster the page offers (built from the JSON the repository ships), the head-to-head matrix as rows of cells, and a duel's REPLAY (the optional `trace` of brain/subDuel.mjs)
// drawn on a 2D canvas as a plan view with the two boats' hit points, the torpedoes running and the sonar's reach left out (the replay is what happened, not what the sonar saw). A gate holds all of it without a browser; the page only wires the buttons.
"use strict";
import * as T from "../brain/subTournament.mjs";

const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * The sides the page offers, from the parsed JSON files: { weights (pilotSubWeightsWip.json), theta (subTacticsThetaWip.json), ping (subTacticsThetaSearchPingWip.json), league (subTacticsLeagueWip.json) }, each optional. The default tactician with the
 * autopilot is always there; every other side is there only if the file it needs is. Returns [{ id, label, note, side (a subTournament.makeSide) }] in a fixed order, the ones that need a file last.
 */
export function roster(files = {}) {
    const out = [{ id: "hand", label: "hand tactician + PD autopilot", note: "the default doctrine (THETA_DEFAULT) flown by the hand autopilot: the baseline", side: T.makeSide("hand", { label: "hand tactician + PD autopilot" }) }];
    const w = files.weights && Array.isArray(files.weights.weights) ? files.weights.weights : null, th = files.theta && files.theta.theta, sp = files.ping && files.ping.theta, lg = files.league;
    if (w) out.push({ id: "hand+net", label: "hand tactician + the fruit fly network", note: "the default doctrine, flown by the 963-weight Giant Fiber network", side: T.makeSide("hand+net", { weights: w, label: "hand tactician + the fruit fly network" }) });
    if (th) out.push({ id: "champ", label: "tuned tactician + PD autopilot", note: "the (1+1)-ES champion of the eleven doctrine numbers against the four scripted drones", side: T.makeSide("champ", { theta: th, label: "tuned tactician + PD autopilot" }) });
    if (th && w) out.push({ id: "champ+net", label: "tuned tactician + the fruit fly network", note: "the same doctrine with the network pilot", side: T.makeSide("champ+net", { theta: th, weights: w, label: "tuned tactician + the fruit fly network" }) });
    if (sp) out.push({ id: "ping", label: "search-ping tactician", note: "the champion with a twelfth number: when to ping while searching", side: T.makeSide("ping", { theta: sp, label: "search-ping tactician" }) });
    for (const [key, name] of [["league7001", "league A (found a counter-doctrine)"], ["league7000", "league B (did not)"]]) {
        const L = lg && lg[key];
        if (L && Array.isArray(L.thetas) && L.thetas.length) { const g = L.thetas.length - 1; out.push({ id: key, label: `${name}, generation ${g}`, note: "a self-play league's last generation (tools/selfPlaySubTactics.mjs): trained against the default and the three before it, in both seats", side: T.makeSide(key, { theta: L.thetas[g], label: `${name}, generation ${g}` }) }); }
    }
    return out;
}

/**
 * The matrix of a round robin as rows of cells, in rating order (best first): { order, rows: [{ id, cells: [{ id (the column), text ("5-1-0", "" on the diagonal), edge, z, tone ("win" | "loss" | "even" | "self") }] }] }. A cell is X's record
 * against Y from X's side (the flip of a pair that was flown the other way round). `tone` is "win" when X's edge is at least DECISIVE (0.05: half a net hit) AND at least MIN_Z paired standard errors, "loss" when it is as strongly negative, "even" otherwise (a tiny edge with a tinier standard error is a precise zero, not a lead).
 */
export function matrixModel(result) {
    const get = (x, y) => { const s = result.pairs[`${x}|${y}`]; if (s) return s.summary; const q = result.pairs[`${y}|${x}`]; return q ? T.flipSummary(q.summary) : null; };
    const fit = T.ratings(result, { summaryOf: get }), order = T.rankOf(fit, result.ids);
    const rows = order.map((x) => ({ id: x, rating: fit.rating[x], cells: order.map((y) => {
        if (x === y) return { id: y, text: "", edge: 0, z: 0, tone: "self" };
        const s = get(x, y); if (!s) return { id: y, text: "?", edge: 0, z: 0, tone: "even" };
        return { id: y, text: `${s.winsX}-${s.draws}-${s.winsY}`, edge: s.edge, z: s.z, tone: s.edge >= T.DECISIVE && s.z >= T.MIN_Z ? "win" : s.edge <= -T.DECISIVE && -s.z >= T.MIN_Z ? "loss" : "even" };
    }) }));
    return { order, fit, rows };
}

/** The frame of a trace at a replay clock t (seconds): the last frame at or before it (frames are 5 a second), or the first before the start and the last after the end. A trace of nothing is null. */
export function frameAt(trace, t, dt = 1 / 30) {
    if (!trace || !trace.length) return null;
    const tick = Math.max(0, num(t)) / dt; let lo = 0, hi = trace.length - 1;
    if (tick >= trace[hi].tick) return trace[hi];
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (trace[mid].tick <= tick) lo = mid; else hi = mid - 1; }
    return trace[lo];
}

/** The plan-view bounds of a whole trace, padded: { x0, x1, y0, y1 } with the boats' and torpedoes' extent and at least 200 m each way. */
export function boundsOf(trace, pad = 60) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of trace || []) for (const p of [...f.boats, ...f.torps]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    if (!Number.isFinite(x0)) return { x0: -100, x1: 100, y0: -100, y1: 100 };
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = Math.max(100, (x1 - x0) / 2 + pad), hy = Math.max(100, (y1 - y0) / 2 + pad);
    return { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy };
}

/** Where a tank point (x, y) falls in a w x h canvas for these bounds (equal scale both ways, centred; the engine's +y is the vessel's left, so it is drawn UP the screen like the aquarium's plan, y flipped). */
export function toScreen(b, x, y, w, h) {
    const k = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0)), ox = (w - k * (b.x1 - b.x0)) / 2, oy = (h - k * (b.y1 - b.y0)) / 2;
    return [ox + k * (x - b.x0), h - oy - k * (y - b.y0)];
}

/** Draw one frame of a replay: the plan of the boats (their noses along their headings), the torpedoes, a hit-point bar and a depth label for each boat. `colours` is [A, B]. Returns { boats, torps }. */
export function drawReplay(g, w, h, frame, bounds, { colours = ["#59d1ff", "#f6a623"], names = ["A", "B"] } = {}) {
    g.fillStyle = "#050a12"; g.fillRect(0, 0, w, h);
    if (!frame) { g.fillStyle = "#7c93b8"; g.font = "14px monospace"; g.fillText("pick two sides and a geometry, then watch", 16, 28); return { boats: 0, torps: 0 }; }
    const L = Math.max(8, Math.min(w, h) * 0.03); let boats = 0, torps = 0;
    for (const q of frame.torps) { const [px, py] = toScreen(bounds, q.x, q.y, w, h); g.fillStyle = q.owner === 1 ? colours[0] : colours[1]; g.beginPath(); g.arc(px, py, 3, 0, Math.PI * 2); g.fill(); torps++; }
    frame.boats.forEach((b, i) => {
        const [px, py] = toScreen(bounds, b.x, b.y, w, h), hx = Math.cos(b.heading), hy = -Math.sin(b.heading);
        g.globalAlpha = b.alive ? 1 : 0.3; g.strokeStyle = colours[i]; g.fillStyle = colours[i]; g.lineWidth = 4;
        g.beginPath(); g.moveTo(px - hx * L, py - hy * L); g.lineTo(px + hx * L, py + hy * L); g.stroke(); g.beginPath(); g.arc(px + hx * L, py + hy * L, 3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; boats++;
        const bx = 12 + i * (w - 24 - (w * 0.4)), by = 12;
        g.fillStyle = "#1c2c44"; g.fillRect(bx, by, w * 0.4, 10); g.fillStyle = colours[i]; g.fillRect(bx, by, w * 0.4 * Math.max(0, Math.min(1, b.hp / 100)), 10);
        g.fillStyle = "#dbe7ff"; g.font = "12px monospace"; g.fillText(`${names[i]}  ${Math.round(b.hp)} hp  ${Math.round(b.depth)} m  ${b.ammo} torp`, bx, by + 24);
    });
    return { boats, torps };
}
