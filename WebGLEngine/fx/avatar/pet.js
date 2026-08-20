// fx/avatar/pet.js -- the second blob: Avataro's pet. It roams on its own, comes in, MERGES into the host, then parts
// and re-forms as its normal self. The merge isn't faked -- with metaballs, two fields simply sum, so when the pet gets
// close enough the summed field between the two bodies crosses the isosurface and Marching Cubes renders ONE creature;
// pull apart and the field dips back under the threshold and they resolve into two again. Nothing is created or
// destroyed in the merge: the pet keeps its own metaball offsets the whole time, which is exactly why it can merge out
// as its normal form. Pure + verified (the merge is checked as real field math, not a distance flag).
"use strict";

// The canonical SweK metaball field: sum of r^2 / (d^2 + eps). Marching Cubes surfaces this at `iso`.
function metaField(balls, x, y, z) {
    let s = 0;
    for (const b of balls) { const dx = x - b.p[0], dy = y - b.p[1], dz = z - b.p[2]; const c = (b.r * b.r) / (dx * dx + dy * dy + dz * dz + 0.02); s += b.neg ? -c : c; }
    return s;   // v2427 -- a ball flagged neg SUBTRACTS, carving a hollow out of the surface. That's how the narrator gets a mouth.
}
function centroid(balls) { let c = [0, 0, 0]; for (const b of balls) { c[0] += b.p[0]; c[1] += b.p[1]; c[2] += b.p[2]; } const n = balls.length || 1; return [c[0] / n, c[1] / n, c[2] / n]; }
// Are two bodies ONE surface? Walk the segment between their centroids and take the MINIMUM field: if the field never
// dips below iso, the isosurface is continuous from one to the other and Marching Cubes renders a single creature; if it
// dips, there's a real gap and you get two. (Sampling only the midpoint is wrong for uneven pairs -- a big host's own
// surface can swallow the midpoint while a visible gap still exists nearer the small one. The minimum is the honest test.)
function mergeState(A, B, iso = 1.0, samples = 32) {
    const ca = centroid(A), cb = centroid(B), all = A.concat(B);
    let min = Infinity, minAt = 0.5;
    for (let i = 1; i < samples; i++) { const u = i / samples;
        const f = metaField(all, ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u);
        if (f < min) { min = f; minAt = u; } }
    return { merged: min >= iso, field: min, minAt, gap: Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) };
}

// The pet's OWN reactions -- its anatomy is body/head/tail, so it wags and perks where Avataro dances and high-fives.
// Same pure shape as the avatar's: (balls, progress, time) -> displacement, and they blend cumulatively.
const PET_REACTIONS = {
    wag:    { dur: 1.6, fn: (b, u, t) => { const s = Math.sin(t * 14) * 0.22 * Math.sin(u * Math.PI); b[2].p[2] += s; b[2].p[1] += Math.abs(s) * 0.3; } },
    perk:   { dur: 1.2, fn: (b, u) => { const r = Math.sin(u * Math.PI); b[1].p[1] += r * 0.30; b[1].r += r * 0.05; } },
    hop:    { dur: 0.9, fn: (b, u) => { const k = Math.abs(Math.sin(u * Math.PI * 2)); for (const x of b) x.p[1] += k * 0.34; } },
    spin:   { dur: 1.4, fn: (b, u) => { const a = u * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a);
              for (const i of [1, 2]) { const dx = b[i].p[0] - b[0].p[0], dz = b[i].p[2] - b[0].p[2]; b[i].p[0] = b[0].p[0] + dx * c - dz * s2; b[i].p[2] = b[0].p[2] + dx * s2 + dz * c; } } },
    nuzzle: { dur: 1.1, fn: (b, u) => { const r = Math.sin(u * Math.PI); b[1].p[0] += r * 0.26; b[0].r += r * 0.04; } }
};

function makePet(opts = {}) {
    const rng = opts.rng || Math.random;
    const base = [{ id: "pbody", o: [0, 0, 0], r: 0.42 }, { id: "phead", o: [0.30, 0.26, 0], r: 0.24 }, { id: "ptail", o: [-0.34, -0.10, 0], r: 0.18 }];
    const p = (opts.p || [2.1, 0.3, 0]).slice();
    let state = "roam", t = 0, ang = rng() * 6.283, bob = 0;
    const active = [];   // its own reactions, blended like the avatar's
    const clock = opts._now || (() => Date.now() / 1000);
    const roamTime = opts.roamTime || 5, bondTime = opts.bondTime || 2.6, orbitR = opts.orbitR || 2.75;   // beyond the MEASURED iso join (~2.48) -> the pet roams as its own creature
    function balls() {
        const out = base.map(b => ({ id: b.id, p: [p[0] + b.o[0], p[1] + b.o[1] + bob, p[2] + b.o[2]], r: b.r }));
        const now = clock();
        for (const a of active) a.fn(out, a.t / a.dur, now);   // active reactions displace it, cumulatively
        return out;
    }
    function react(name, o = {}) { const def = PET_REACTIONS[name]; if (!def) return false; active.push({ name, t: 0, dur: o.dur || def.dur, fn: def.fn }); return true; }
    function step(dt, host) {
        t += dt; bob = Math.sin(t * 2.2) * 0.05;
        for (const a of active) a.t += dt;
        for (let i = active.length - 1; i >= 0; i--) if (active[i].t >= active[i].dur) active.splice(i, 1);
        const d = [host[0] - p[0], host[1] - p[1], host[2] - p[2]], dist = Math.hypot(d[0], d[1], d[2]) || 1e-6;
        const dir = [d[0] / dist, d[1] / dist, d[2] / dist];
        if (state === "roam") { ang += dt * 0.7; const tx = host[0] + Math.cos(ang) * orbitR, ty = host[1] + 0.25 * Math.sin(t * 1.3), tz = host[2] + Math.sin(ang) * orbitR;
            p[0] += (tx - p[0]) * Math.min(1, dt * 1.6); p[1] += (ty - p[1]) * Math.min(1, dt * 1.6); p[2] += (tz - p[2]) * Math.min(1, dt * 1.6);
            if (t > roamTime) { state = "approach"; t = 0; } }
        else if (state === "approach") { for (let k = 0; k < 3; k++) p[k] += dir[k] * dt * 1.2; if (dist < 0.55) { state = "merged"; t = 0; } }
        else if (state === "merged") { for (let k = 0; k < 3; k++) p[k] += (host[k] - p[k]) * Math.min(1, dt * 2.2); if (t > bondTime) { state = "part"; t = 0; } }
        else if (state === "part") { for (let k = 0; k < 3; k++) p[k] -= dir[k] * dt * 1.4; if (dist > 2.7) { state = "roam"; t = 0; ang = Math.atan2(p[2] - host[2], p[0] - host[0]); } }
        return { balls: balls(), state, dist };
    }
    // .react/.active/.reactions make the pet drivable by the SAME makeAvatarDriver as Avataro -- it just has its own moves.
    return { step, balls, base, react, get active() { return active; }, reactions: Object.keys(PET_REACTIONS), get p() { return p; }, get state() { return state; }, set state(s) { state = s; t = 0; } };
}
export { makePet, metaField, mergeState, centroid, PET_REACTIONS };
