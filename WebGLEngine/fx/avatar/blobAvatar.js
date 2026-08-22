// fx/avatar/blobAvatar.js -- Avataro / Avatarina: a blobulator kept as an avatar. The body is a handful of metaballs
// (core, head, two arms, a foot) that the blobulator's Marching Cubes renders as one oddly-normal blob. Reactions --
// dance, rotate head, high-five, wave, nod, bounce -- are pure functions of a reaction's local progress that DISPLACE
// the metaballs, and multiple active reactions BLEND cumulatively (metaballs merge by nature, so stacked reactions make
// emergent shapes, not a fixed animation set). Idle, it breathes. The persona is Avataro / Avatarina / both -- either or
// both -- a palette + bias, nothing more. The reaction/metaball state is pure and verified; the render is the blobulator.
"use strict";

const REACTIONS = {
    dance:      { dur: 4.0, fn: (b, u, t) => { const s = Math.sin(t * 6) * 0.3 * Math.sin(u * Math.PI); b[0].p[0] += s; b[1].p[0] += s * 1.3; b[4].p[0] -= s * 0.5; b[1].p[1] += Math.abs(Math.sin(t * 12)) * 0.15; } },
    rotateHead: { dur: 2.0, fn: (b, u) => { const a = u * Math.PI * 2; b[1].p[0] += Math.sin(a) * 0.35; b[1].p[2] += Math.cos(a) * 0.35; } },
    highFive:   { dur: 1.2, fn: (b, u) => { const r = Math.sin(u * Math.PI); b[3].p[0] += r * 0.8; b[3].p[1] += r * 1.1; b[3].r += r * 0.1; } },
    wave:       { dur: 2.0, fn: (b, u, t) => { const r = Math.sin(u * Math.PI); b[3].p[1] += r * 0.9; b[3].p[0] += Math.sin(t * 10) * r * 0.3; } },
    nod:        { dur: 1.0, fn: (b, u) => { b[1].p[1] -= Math.sin(u * Math.PI * 2) * 0.22; } },
    bounce:     { dur: 1.5, fn: (b, u) => { const k = Math.abs(Math.sin(u * Math.PI * 3)); for (const x of b) x.p[1] += k * 0.2; b[4].r += (1 - k) * 0.15; } }
};

function makeAvatar(opts = {}) {
    const base = [
        { id: "core", p: [0, 0.0, 0], r: 0.9 },
        { id: "head", p: [0, 1.0, 0], r: 0.5 },
        { id: "armL", p: [-0.7, 0.2, 0], r: 0.35 },
        { id: "armR", p: [0.7, 0.2, 0], r: 0.35 },
        { id: "foot", p: [0, -0.9, 0], r: 0.6 }
    ];
    const active = [];
    let persona = opts.persona || "both";               // "avataro" | "avatarina" | "both"
    const now = opts._now || (() => Date.now() / 1000);
    function react(name, o = {}) { const def = REACTIONS[name]; if (!def) return false; active.push({ name, t: 0, dur: o.dur || def.dur, fn: def.fn }); return true; }
    function step(dt) {
        for (const a of active) a.t += dt;
        for (let i = active.length - 1; i >= 0; i--) if (active[i].t >= active[i].dur) active.splice(i, 1);
        const t = now();
        const b = base.map(x => ({ id: x.id, p: x.p.slice(), r: x.r }));
        b[0].r += Math.sin(t * 1.5) * 0.04;             // idle breathing
        for (const a of active) a.fn(b, a.t / a.dur, t);  // blend every active reaction
        return b;
    }
    function personaTint() { return persona === "avataro" ? [0.42, 0.62, 1.0] : persona === "avatarina" ? [1.0, 0.5, 0.72] : [0.72, 0.56, 0.95]; }
    return { base, react, step, personaTint, get persona() { return persona; }, set persona(p) { persona = p; }, get active() { return active; }, reactions: Object.keys(REACTIONS) };
}
export { makeAvatar, REACTIONS };
if (typeof module !== "undefined" && module.exports) module.exports = { makeAvatar, REACTIONS };
