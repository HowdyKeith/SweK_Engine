// WebGLEngine/render/seaOgreView.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT sea-ogre.html SHOWS OF brain/seaOgre.mjs, AS PURE FUNCTIONS: the bounds of a whole replay, one frame drawn as a plan view (the headquarters with its breach ring and the cannon's reach, the OGRE as a 40 m hull with
// its four hit zones lit by what is left of them, the defenders, the escorts, the torpedoes by who fired them, the hull and headquarters bars) and the one-line verdict. A gate holds all of it without a browser. TOP VIEW
// ONLY: there is no first-person view in this level and none is wired for it (the level adds no seat for a human).
"use strict";
import * as G from "../brain/seaOgre.mjs";
import { frameAt, toScreen } from "./subTournamentView.mjs";

export { frameAt, toScreen };
export const COLOURS = Object.freeze(["#59d1ff", "#f6a623", "#5fe08a", "#c792ff"]);
export const OGRE_COLOUR = "#ff7a7a", ESCORT_COLOUR = "#ff9f6e", HQ_COLOUR = "#dbe7ff";
const num = (v) => (Number.isFinite(v) ? v : 0);

/** The plan bounds of a whole trace, padded: the boats, torpedoes, escorts, the OGRE and the headquarters at the origin, never under 200 m each way. */
export function boundsOf(trace, pad = 60) {
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0, any = false;
    for (const f of trace || []) for (const p of [...f.boats, ...f.torps, ...f.escorts, f.ogre]) { any = true; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    if (!any) return { x0: -100, x1: 100, y0: -100, y1: 100 };
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = Math.max(100, (x1 - x0) / 2 + pad), hy = Math.max(100, (y1 - y0) / 2 + pad);
    return { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy };
}

/** The colour of a zone for what is left of it: green whole, amber hurt (under half), red nearly gone (under a fifth), grey dead. */
export function zoneColour(hp, max) {
    if (!(hp > 0)) return "#3a4658";
    const f = hp / max; return f < 0.2 ? "#ff5a5a" : f < 0.5 ? "#f6a623" : "#5fe08a";
}

/** The one-line verdict of a fight result, for the page. */
export function verdictLine(r, names = []) {
    const how = { defended: "DEFENDED -- the OGRE is sunk", breached: "BREACHED -- the headquarters fell", holdout: "HOLDOUT -- the clock ran out" }[r.outcome] || r.outcome;
    const lost = r.fates.map((f, i) => (f === "afloat" ? null : `${names[i] || "d" + (i + 1)} ${f}`)).filter(Boolean);
    const gone = G.ZONES.filter((z) => r.zones[z.name] <= 0).map((z) => z.name);
    return `${how} in ${(r.ticks / 30).toFixed(0)} s; hull ${Math.round(r.hull)}/${G.OGRE.hull}, headquarters ${Math.round(r.hq)}/${G.HQ_HP}; zones destroyed: ${gone.length ? gone.join(", ") : "none"}; ${lost.length ? "lost: " + lost.join(", ") : "no boat lost"}; escorts launched ${r.escorts}; score ${r.score.toFixed(2)}`;
}

/** Draw one frame. Returns { boats, torps, escorts, zones } counts of what was drawn. */
export function drawLevel(g, w, h, frame, bounds, { names = [], colours = COLOURS } = {}) {
    g.fillStyle = "#050a12"; g.fillRect(0, 0, w, h);
    if (!frame) { g.fillStyle = "#7c93b8"; g.font = "14px monospace"; g.fillText("pick the defenders and a seed, then watch", 16, 28); return { boats: 0, torps: 0, escorts: 0, zones: 0 }; }
    const k = Math.min(w / (bounds.x1 - bounds.x0), h / (bounds.y1 - bounds.y0)), [hx0, hy0] = toScreen(bounds, 0, 0, w, h);
    g.strokeStyle = "#1c2c44"; g.lineWidth = 1; g.setLineDash([5, 5]); g.beginPath(); g.arc(hx0, hy0, G.OGRE.cannonRange * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.strokeStyle = "#ff7a7a"; g.beginPath(); g.arc(hx0, hy0, G.OGRE.breachRange * k, 0, Math.PI * 2); g.stroke();
    g.fillStyle = HQ_COLOUR; g.fillRect(hx0 - 5, hy0 - 5, 10, 10);
    let torps = 0, escorts = 0, zones = 0, boats = 0;
    for (const q of frame.torps) { const [px, py] = toScreen(bounds, q.x, q.y, w, h); g.fillStyle = q.owner === G.OGRE.id ? OGRE_COLOUR : colours[(q.owner - 1) % colours.length]; g.beginPath(); g.arc(px, py, 3, 0, Math.PI * 2); g.fill(); torps++; }
    for (const e of frame.escorts) { const [px, py] = toScreen(bounds, e.x, e.y, w, h); g.fillStyle = ESCORT_COLOUR; g.fillRect(px - 3, py - 3, 6, 6); escorts++; }
    const o = frame.ogre, [ox, oy] = toScreen(bounds, o.x, o.y, w, h), hx = Math.cos(o.heading), hy = -Math.sin(o.heading), half = G.OGRE.length / 2 * k;
    g.globalAlpha = o.hull > 0 ? (o.surfaced ? 1 : 0.65) : 0.25; g.strokeStyle = OGRE_COLOUR; g.lineWidth = Math.max(4, 8 * k * 4); g.beginPath(); g.moveTo(ox - hx * half, oy - hy * half); g.lineTo(ox + hx * half, oy + hy * half); g.stroke(); g.globalAlpha = 1;
    for (const z of G.ZONES) { const px = ox + hx * z.at * k, py = oy + hy * z.at * k; g.fillStyle = zoneColour(o.zones[z.name], z.hp); g.beginPath(); g.arc(px, py, Math.max(3, 3.5 * k * 2), 0, Math.PI * 2); g.fill(); zones++; }
    frame.boats.forEach((b, i) => {
        const [px, py] = toScreen(bounds, b.x, b.y, w, h), bx = Math.cos(b.heading), by = -Math.sin(b.heading), L = Math.max(8, Math.min(w, h) * 0.025), c = colours[i % colours.length];
        g.globalAlpha = b.alive ? 1 : 0.3; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 4; g.beginPath(); g.moveTo(px - bx * L, py - by * L); g.lineTo(px + bx * L, py + by * L); g.stroke(); g.beginPath(); g.arc(px + bx * L, py + by * L, 3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; boats++;
    });
    // the bars: the OGRE's hull on the left, the headquarters on the right, the defenders' hit points under them
    const bw = w * 0.36;
    g.fillStyle = "#1c2c44"; g.fillRect(12, 12, bw, 10); g.fillStyle = OGRE_COLOUR; g.fillRect(12, 12, bw * Math.max(0, Math.min(1, num(o.hull) / G.OGRE.hull)), 10);
    g.fillStyle = "#dbe7ff"; g.font = "12px monospace"; g.fillText(`OGRE hull ${Math.round(o.hull)}  phase ${o.phase}  ${o.surfaced ? "SURFACED" : "submerged"}  ${o.depth.toFixed(0)} m`, 12, 36);
    g.fillStyle = "#1c2c44"; g.fillRect(w - 12 - bw, 12, bw, 10); g.fillStyle = HQ_COLOUR; g.fillRect(w - 12 - bw, 12, bw * Math.max(0, Math.min(1, num(frame.hq) / G.HQ_HP)), 10);
    g.fillStyle = "#dbe7ff"; g.fillText(`headquarters ${Math.round(frame.hq)}`, w - 12 - bw, 36);
    frame.boats.forEach((b, i) => { g.fillStyle = colours[i % colours.length]; g.fillText(`${names[i] || "d" + (i + 1)} ${Math.round(b.hp)} hp ${b.ammo}t`, 12 + i * Math.min(190, (w - 24) / frame.boats.length), h - 10); });
    return { boats, torps, escorts, zones };
}
