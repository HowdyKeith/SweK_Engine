// WebGLEngine/render/hitBurst-selfcheck.mjs — v3844
//
// A port is a claim that two pieces of code do the same thing, so the gate holds BOTH: cockpit.html's own hit()
// rule is written out here, literally, and swept against burstsFor over every shield/armour/damage combination
// that matters. If the port drifts, this is what says so -- not somebody's memory of what the 2D page did.
//
// The other half is the thing the port deliberately did NOT copy: cockpit decays its debris ONCE PER FRAME
// (`q.vx *= 0.94`), so its spray reaches further on a faster machine. The port integrates the decay analytically
// in time, and the check is that splitting a step into substeps lands on the same place to float precision.
//
// Run: node render/hitBurst-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { BURST_TIERS, makeBurstParams, burstsFor, spawnBurst, stepBurst, fadeOf, packPoints } from "./hitBurst.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const clone = (parts) => parts.map((q) => ({ ...q }));

// cockpit.html's hit(), transcribed. Its shields/hull are this tree's shield/armour, and its boom() calls become
// the tiers. This is the ANSWER KEY -- if it and burstsFor disagree, the port is wrong, not this.
function cockpitHit(shields, hull, dmg) {
    const out = [];
    const ab = Math.min(shields, dmg); shields -= ab; const rest = dmg - ab;
    if (rest > 0) hull -= rest;
    out.push(shields > 0 ? "shield" : "hull");     // boom(cyan, 6) : boom(red, 12)
    if (hull <= 0) out.push("kill");               // boom(amber, 40) ON TOP OF the one above
    return out;
}

// 1) THE PORTED RULE IS THE SOURCE'S RULE, swept rather than spot-checked.
{
    let agree = 0, tried = 0, firstBad = null;
    for (let sh = 0; sh <= 120; sh += 5) for (let ar = 5; ar <= 120; ar += 5) for (const dmg of [1, 7, 16, 26, 40, 130]) {
        const mine = burstsFor(sh, ar, dmg).join(","), theirs = cockpitHit(sh, ar, dmg).join(",");
        tried++; if (mine === theirs) agree++; else if (!firstBad) firstBad = `shield ${sh} armour ${ar} dmg ${dmg}: ${mine} vs ${theirs}`;
    }
    ok(agree === tried, `burstsFor matches cockpit.html's own hit() over all ${tried} shield/armour/damage combinations${firstBad ? " -- first disagreement " + firstBad : ""}`);
}

// 2) THE THREE CASES THE RULE EXISTS FOR, named one at a time.
{
    ok(burstsFor(50, 80, 16).join() === "shield", "a hit the shield absorbs throws the shield burst only");
    ok(burstsFor(10, 80, 16).join() === "hull", "the shot that EMPTIES the shield already throws hull debris (the tier reads the shield AFTER absorption)");
    ok(burstsFor(0, 10, 16).join() === "hull,kill", "a killing blow throws TWO bursts, hull then kill -- not one");
    ok(burstsFor(0, 10, 16)[0] === "hull", "and the kill burst comes second, on top of the hull one");
    ok(burstsFor(200, 80, 16).join() === "shield", "an over-shielded ship never shows hull debris");
    ok(burstsFor(0, 0.0001, 16).join() === "hull,kill", "armour reaching exactly zero counts as a kill");
}

// 3) THE COUNTS AND COLOURS ARE COCKPIT'S: 6 / 12 / 40.
{
    ok(BURST_TIERS.shield.count === 6 && BURST_TIERS.hull.count === 12 && BURST_TIERS.kill.count === 40,
        "tier counts are the source's 6 / 12 / 40");
    const parts = [];
    ok(spawnBurst(parts, [0, 0, 0], null, "shield", 1) === 6 && parts.length === 6, "spawnBurst emits exactly the tier's count");
    ok(spawnBurst(parts, [0, 0, 0], null, "nonsense", 1) === 0 && parts.length === 6, "an unknown tier emits nothing rather than guessing");
    ok(BURST_TIERS.shield.color[2] > BURST_TIERS.shield.color[0] && BURST_TIERS.hull.color[0] > BURST_TIERS.hull.color[2],
        "shield debris is blue-dominant and hull debris is red-dominant (cockpit's cyan and red)");
}

// 4) FRAME-RATE INDEPENDENCE -- the defect the port exists to fix. One step of dt must equal N steps of dt/N.
{
    const a = []; spawnBurst(a, [0, 0, 0], [3, 1, -2], "kill", 7);
    const b = clone(a), c = clone(a);
    stepBurst(a, 0.1);
    for (let i = 0; i < 10; i++) stepBurst(b, 0.01);
    for (let i = 0; i < 100; i++) stepBurst(c, 0.001);
    let worstB = 0, worstC = 0;
    for (let i = 0; i < a.length; i++) {
        worstB = Math.max(worstB, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y), Math.abs(a[i].z - b[i].z));
        worstC = Math.max(worstC, Math.abs(a[i].x - c[i].x), Math.abs(a[i].y - c[i].y), Math.abs(a[i].z - c[i].z));
    }
    ok(worstB < 1e-12, `one step of 0.1 s equals ten of 0.01 s (worst delta ${worstB.toExponential(2)})`);
    ok(worstC < 1e-12, `and a hundred of 0.001 s (worst delta ${worstC.toExponential(2)}) -- the spray does not travel further on a faster machine`);
    // the velocity decay is the same semigroup
    const v0 = Math.hypot(a[0].vx, a[0].vy, a[0].vz), v1 = Math.hypot(b[0].vx, b[0].vy, b[0].vz);
    ok(Math.abs(v0 - v1) < 1e-12, "the velocity decay composes across substeps too");
    // and drag actually slows it down
    const d = []; spawnBurst(d, [0, 0, 0], null, "hull", 3);
    const before = Math.hypot(d[0].vx, d[0].vy, d[0].vz); stepBurst(d, 0.25);
    ok(Math.hypot(d[0].vx, d[0].vy, d[0].vz) < before, "drag is real (debris slows down)");
    const nod = []; spawnBurst(nod, [0, 0, 0], null, "hull", 3);
    const sp0 = Math.hypot(nod[0].vx, nod[0].vy, nod[0].vz); stepBurst(nod, 0.25, { drag: 0 });
    ok(Math.abs(Math.hypot(nod[0].vx, nod[0].vy, nod[0].vz) - sp0) < 1e-12, "drag 0 coasts (the analytic form does not divide by zero)");
}

// 5) THE DIRECTIONS ARE ISOTROPIC. A burst must not favour a direction, and the specific failure worth catching is
//    the tempting one: normalising a cube of uniforms clusters the debris toward the cube's corners. Uniform on the
//    sphere puts exactly 10% of directions past |z| > 0.9; the cube-normalised sampler puts ~7% there.
{
    let mx = 0, my = 0, mz = 0, n = 0, polar = 0, unit = true, worstLen = 0;
    for (let s = 0; s < 400; s++) {
        const p = []; spawnBurst(p, [0, 0, 0], null, "kill", s * 31 + 1, { inherit: 0 });
        for (const q of p) {
            const L = Math.hypot(q.vx, q.vy, q.vz);
            mx += q.vx / L; my += q.vy / L; mz += q.vz / L; n++;
            if (Math.abs(q.vy / L) > 0.9) polar++;
        }
    }
    ok(Math.abs(mx / n) < 0.02 && Math.abs(my / n) < 0.02 && Math.abs(mz / n) < 0.02,
        `a burst has no favoured direction over ${n} particles (mean ${(mx / n).toFixed(4)}, ${(my / n).toFixed(4)}, ${(mz / n).toFixed(4)})`);
    ok(Math.abs(polar / n - 0.1) < 0.012, `and the polar fraction is the sphere's own 0.10 (measured ${(polar / n).toFixed(4)}) -- not a cube-normalised 0.07`);
}

// 6) SPEEDS, LIVES AND THE INHERITED VELOCITY.
{
    const T = BURST_TIERS.hull;
    let inBand = true;
    for (let s = 0; s < 60; s++) {
        const p = []; spawnBurst(p, [0, 0, 0], null, "hull", s, { inherit: 0 });
        for (const q of p) {
            const sp = Math.hypot(q.vx, q.vy, q.vz);
            if (sp < T.speed[0] - 1e-9 || sp > T.speed[1] + 1e-9) inBand = false;
            if (q.life < T.life[0] - 1e-9 || q.life > T.life[1] + 1e-9) inBand = false;
            if (q.life0 !== q.life) inBand = false;
        }
    }
    ok(inBand, "every particle's speed and lifetime start inside the tier's declared band");
    // inherit: the burst's MEAN velocity is the inherited share, because the spray itself averages to nothing.
    // Averaged over 200 bursts rather than one -- a single 40-particle burst's own scatter is ~speed/sqrt(40),
    // which is larger than the quantity being measured.
    const vel = [10, -4, 6];
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let s = 0; s < 200; s++) {
        const p = []; spawnBurst(p, [0, 0, 0], vel, "kill", s * 13 + 1, { inherit: 0.35 });
        for (const q of p) { sx += q.vx; sy += q.vy; sz += q.vz; n++; }
    }
    const drift = Math.max(Math.abs(sx / n - vel[0] * 0.35), Math.abs(sy / n - vel[1] * 0.35), Math.abs(sz / n - vel[2] * 0.35));
    ok(drift < 0.2, `debris carries the declared share of the victim's velocity, so it trails the ship instead of hanging in space (mean off by ${drift.toFixed(3)})`);
    const p0 = []; spawnBurst(p0, [0, 0, 0], vel, "kill", 5, { inherit: 0 });
    const q0 = []; spawnBurst(q0, [0, 0, 0], null, "kill", 5, { inherit: 0 });
    ok(JSON.stringify(p0) === JSON.stringify(q0), "inherit 0 reproduces cockpit's behaviour exactly (velocity ignored)");
    let origin = true;
    const at = []; spawnBurst(at, [4, -1, 2], vel, "hull", 6);
    for (const q of at) if (q.x !== 4 || q.y !== -1 || q.z !== 2) origin = false;
    ok(origin, "every particle starts at the hit point");
}

// 7) DETERMINISM and SEED SENSITIVITY.
{
    const a = [], b = [], c = [];
    spawnBurst(a, [1, 2, 3], [0, 0, 0], "hull", 99);
    spawnBurst(b, [1, 2, 3], [0, 0, 0], "hull", 99);
    spawnBurst(c, [1, 2, 3], [0, 0, 0], "hull", 100);
    ok(JSON.stringify(a) === JSON.stringify(b), "the same hit throws the same debris (no Math.random)");
    ok(JSON.stringify(a) !== JSON.stringify(c), "a different hit throws different debris");
}

// 8) THE POOL RETIRES rather than growing, and it retires the OLDEST first.
{
    const P = makeBurstParams({ cap: 100 });
    const parts = [];
    for (let i = 0; i < 20; i++) spawnBurst(parts, [i, 0, 0], null, "kill", i, P);
    ok(parts.length === 100, `the pool never exceeds its cap (${parts.length} after 800 particles' worth of bursts)`);
    ok(parts[parts.length - 1].x === 19, "the newest burst survives the trim");
    ok(parts[0].x >= 17, "and it is the OLDEST particles that were dropped");
}

// 9) STEPPING retires the expired, keeps the living, and counts honestly.
{
    const parts = []; spawnBurst(parts, [0, 0, 0], null, "shield", 4);
    const born = parts.length;
    const live = stepBurst(parts, 0.01);
    ok(live === born && parts.length === born, "a short step kills nothing and returns the live count");
    let allFade = true;
    for (const q of parts) if (!(fadeOf(q) > 0 && fadeOf(q) <= 1)) allFade = false;
    ok(allFade, "fade stays in (0, 1] while a particle lives");
    const dead = stepBurst(parts, 5);
    ok(dead === 0 && parts.length === 0, "a long step retires everything and the array is emptied, not left with holes");
    // survivors keep their identity across a step that kills some of their burst
    const mixed = [];
    spawnBurst(mixed, [0, 0, 0], null, "shield", 1);
    mixed[0].life = 0.02; mixed[1].life = 9;
    const keptId = mixed[1];
    stepBurst(mixed, 0.05);
    ok(mixed.includes(keptId) && !mixed.some((q) => q.life <= 0), "retiring one particle does not disturb the survivors");
}

// 10) PACKING for the draw: bounded by the buffers, and the colour carries the fade.
{
    const parts = []; spawnBurst(parts, [1, 2, 3], null, "hull", 8);
    const pos = new Float32Array(parts.length * 3), col = new Float32Array(parts.length * 3);
    const n = packPoints(parts, pos, col);
    ok(n === parts.length, "packPoints writes every particle when the buffers fit");
    ok(pos[0] === 1 && pos[1] === 2 && pos[2] === 3, "positions are written in order");
    const small = new Float32Array(6);
    ok(packPoints(parts, small, small) === 2, "and it stops at the buffer's edge rather than running off it");
    const sz = new Float32Array(parts.length);
    ok(packPoints(parts, pos, col, sz) === parts.length && Math.abs(sz[0] - BURST_TIERS.hull.size) < 1e-6, "sizes are packed when asked for, at the tier's own size (Float32 rounding, so compared to 1e-6)");
    ok(packPoints(parts, pos, col, new Float32Array(3)) === 3, "and the sizes buffer bounds the count too");
    const fresh = col[0];
    parts[0].life = parts[0].life0 * 0.25; packPoints(parts, pos, col);
    ok(col[0] < fresh * 0.3 + 1e-6, "a fading particle packs a dimmer colour (the fade is premultiplied)");
}

if (fail) { console.error(`\nhitBurst-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`hitBurst-selfcheck: all ${pass} pass`);
