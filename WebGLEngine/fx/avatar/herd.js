// fx/avatar/herd.js -- a herd of them. The driver turned out to be generic (it runs Avataro and it runs the pet), so
// nothing stops a whole society: N creatures, each with its OWN mind, mood and moves, roaming around the host, keeping
// their distance, and -- because metaballs merge by summing -- occasionally bonding with EACH OTHER, not just the host.
// The nice consequence: how many creatures you SEE is not N, it's the number of connected components of the merge
// graph. Two bond, you see one. They part, you see two again. That's emergent, and it's exactly countable, so it's
// verifiable: clusters() reports what the eye would report. Pure + verified.
"use strict";
import { makePet, mergeState } from "./pet.js";
import { makeAvatarDriver } from "./avatarBrain.js";

function makeHerd(opts = {}) {
    const n = opts.n || 5, rng = opts.rng || Math.random, now = opts._now || (() => Date.now() / 1000);
    const sep = opts.separation == null ? 1.15 : opts.separation;
    const members = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, R = (opts.orbitR || 2.75) + (rng() - 0.5) * 0.8;
        const pet = makePet({ rng, _now: now, p: [Math.cos(a) * R, (rng() - 0.5) * 0.8, Math.sin(a) * R], orbitR: R, roamTime: 3 + rng() * 6, bondTime: 1.6 + rng() * 2.2 });
        members.push({ id: "m" + i, pet, driver: makeAvatarDriver(pet, { rng, _now: now, mood: rng() }), last: null });
    }
    // keep them from stacking: nudge apart any pair that's crowding, unless one is deliberately bonding with the host
    function _separate() {
        for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
            const A = members[i], B = members[j];
            if (A.pet.state === "merged" || B.pet.state === "merged") continue;
            const a = A.pet.p, b = B.pet.p, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
            const d = Math.hypot(dx, dy, dz) || 1e-6;
            if (d < sep) { const k = (sep - d) * 0.5 / d; a[0] -= dx * k; a[1] -= dy * k; a[2] -= dz * k; b[0] += dx * k; b[1] += dy * k; b[2] += dz * k; }
        }
    }
    function step(dt, host) {
        for (const m of members) { const c = m.driver.step(dt); if (c) m.last = c; m.pet.step(dt, host); }
        _separate();
        return members.map(m => ({ id: m.id, balls: m.pet.balls(), state: m.pet.state, mood: m.driver.mood, last: m.last }));
    }
    function allBalls() { let out = []; for (const m of members) out = out.concat(m.pet.balls()); return out; }
    // How many creatures does the eye actually see? Union bodies whose surfaces have joined -> count the components.
    function clusters(hostBalls, iso = 1.0) {
        const bodies = members.map(m => m.pet.balls()); if (hostBalls) bodies.unshift(hostBalls);
        const parent = bodies.map((_, i) => i);
        const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) if (mergeState(bodies[i], bodies[j], iso).merged) union(i, j);
        const roots = new Set(); for (let i = 0; i < bodies.length; i++) roots.add(find(i));
        return { visible: roots.size, bodies: bodies.length };
    }
    return { members, step, allBalls, clusters, get n() { return members.length; } };
}
export { makeHerd };
