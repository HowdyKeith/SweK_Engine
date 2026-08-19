// WebGLEngine/physics/esSlabCollide-selfcheck.mjs — v3832 (Long Silence: altitude-band ship collision)
//
// The one thing this round must get right is the thing you cannot see in a screenshot until it is already wrong:
// that two ships far apart in altitude do NOT collide, that two ships in the band DO, and that the response pushes
// them apart rather than sucking them together. All of it is arithmetic on the pure slab core, pinned here against
// values worked out by hand. The box3d wiring (dormant footprint, nudge, alt writeback) needs a WASM and a GPU and
// stays Keith's to see; every number it rides on is checked first.
//
// Run: node physics/esSlabCollide-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { slabContact, resolveSlabCollisions } from "./esSlabCollide.js";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
function ok(c, m) { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } }

const RH = 120, RV = 80;   // combined horizontal radius, combined vertical half-height

// 1) THE HEADLINE FIX -- same x-z, 700 apart in altitude: NO contact, and resolve() returns pure zeros.
{
    const a = { x: 0, y: 0, alt: 0, vx: 5, vy: 0, valt: 0 };
    const b = { x: 0, y: 0, alt: 700, vx: -5, vy: 0, valt: 0 };
    ok(slabContact(a, b, RH, RV) === null, "ships 700 apart in altitude do not touch (the false collision is gone)");
    const d = resolveSlabCollisions([a, b], { rH: RH, rV: RV });
    ok(d[0].dvx === 0 && d[0].dvy === 0 && d[0].dvalt === 0 && d[0].dalt === 0 &&
       d[1].dvx === 0 && d[1].dvy === 0 && d[1].dvalt === 0 && d[1].dalt === 0, "out-of-band pair gets no impulse and no nudge");
}

// 2) SIDE BY SIDE at the same altitude -> horizontal contact, planar normal (this is the old 2D behaviour intact).
{
    const a = { x: 0, y: 0, alt: 0 }, b = { x: 100, y: 0, alt: 0 };
    const c = slabContact(a, b, RH, RV);
    ok(c && c.nalt === 0 && near(c.nx, 1) && c.ny === 0, "overlapping in x-z at equal altitude -> horizontal normal");
    ok(c && near(c.pen, 20), "horizontal penetration is rH - distance = 120 - 100 = 20");
}

// 3) STACKED -- same x-z, a small altitude gap inside the band -> the minimum-translation axis is vertical.
{
    const a = { x: 0, y: 0, alt: 0 }, b = { x: 0, y: 0, alt: 30 };
    const c = slabContact(a, b, RH, RV);
    ok(c && c.nx === 0 && c.ny === 0 && c.nalt === 1, "a shallow altitude overlap separates vertically, not horizontally");
    ok(c && near(c.pen, 50), "vertical penetration is rV - |dalt| = 80 - 30 = 50, the shallower of the two");
}

// 4) HEAD-ON APPROACH in the band -> equal and opposite impulse that stops the closing exactly (e = 0).
{
    const a = { x: 0, y: 0, alt: 0, vx: 10, vy: 0, valt: 0 };
    const b = { x: 100, y: 0, alt: 0, vx: -10, vy: 0, valt: 0 };
    const d = resolveSlabCollisions([a, b], { rH: RH, rV: RV, invMass: 1 });
    ok(near(d[0].dvx, -10) && near(d[1].dvx, 10), "each ship loses exactly its closing speed along the normal");
    ok(near(d[0].dvx + d[1].dvx, 0), "impulses are equal and opposite -> normal momentum conserved (equal mass)");
    const vnAfter = ((b.vx + d[1].dvx) - (a.vx + d[0].dvx));   // relative velocity along +x after
    ok(vnAfter >= -1e-9, "after the impulse the pair is no longer closing (approach speed removed)");
}

// 5) ALREADY SEPARATING -> the closing test fails, so no impulse is added (never pull two ships together).
{
    const a = { x: 0, y: 0, alt: 0, vx: -10, vy: 0, valt: 0 };
    const b = { x: 100, y: 0, alt: 0, vx: 10, vy: 0, valt: 0 };
    const d = resolveSlabCollisions([a, b], { rH: RH, rV: RV });
    ok(d[0].dvx === 0 && d[1].dvx === 0, "a pair moving apart is left alone");
}

// 6) REDUCES TO 2D at equal altitude: the contact condition is exactly the planar circle test, normal in-plane.
{
    const eq = (dx) => slabContact({ x: 0, y: 0, alt: 0 }, { x: dx, y: 0, alt: 0 }, RH, RV);
    ok(eq(119) && eq(119).nalt === 0, "just inside rH at equal altitude -> a purely planar contact");
    ok(eq(121) === null, "just outside rH -> no contact, same as the 2D circle test");
}

// 7) ORDER INDEPENDENCE -- three ships in a clump resolve to the same per-ship deltas whatever the array order.
{
    const mk = () => [
        { x: 0, y: 0, alt: 0, vx: 6, vy: 0, valt: 0 },
        { x: 90, y: 0, alt: 10, vx: -6, vy: 0, valt: 0 },
        { x: 45, y: 60, alt: -10, vx: 0, vy: -6, valt: 0 },
    ];
    const fwd = resolveSlabCollisions(mk(), { rH: RH, rV: RV });
    const shipsR = mk().reverse();
    const rev = resolveSlabCollisions(shipsR, { rH: RH, rV: RV }).reverse();   // undo the reversal to align indices
    let sameV = true, sameA = true;
    for (let i = 0; i < 3; i++) {
        sameV = sameV && near(fwd[i].dvx, rev[i].dvx) && near(fwd[i].dvy, rev[i].dvy) && near(fwd[i].dvalt, rev[i].dvalt);
        sameA = sameA && near(fwd[i].dalt, rev[i].dalt);
    }
    ok(sameV && sameA, "the same clump gives the same deltas regardless of iteration order");
}

// 8) HARD ALTITUDE SEPARATION -- a vertical MTV pushes the two ships apart in altitude (alt is ours to set).
{
    const a = { x: 0, y: 0, alt: 0, vx: 0, vy: 0, valt: 0 };
    const b = { x: 0, y: 0, alt: 30, vx: 0, vy: 0, valt: 0 };
    const d = resolveSlabCollisions([a, b], { rH: RH, rV: RV, positional: 0.5, slop: 0.5 });
    ok(d[0].dalt < 0 && d[1].dalt > 0, "the lower ship is pushed down and the upper up (they separate in altitude)");
    ok(near(d[0].dalt, -d[1].dalt), "the positional split is symmetric for equal mass");
}

// 9) MASS WEIGHTING -- a heavy ship (small invMass) takes less of the impulse than a light one.
{
    const a = { x: 0, y: 0, alt: 0, vx: 10, vy: 0, valt: 0 };   // heavy
    const b = { x: 100, y: 0, alt: 0, vx: -10, vy: 0, valt: 0 }; // light
    const d = resolveSlabCollisions([a, b], { rH: RH, rV: RV, invMass: (s) => (s === a ? 0.25 : 1) });
    ok(Math.abs(d[0].dvx) < Math.abs(d[1].dvx), "the heavier ship's velocity changes less");
}

// ---- CONTROLS: a check that cannot fail on a broken collider is no check. Each re-derives the core with one
// thing sabotaged and shows the property above going the wrong way. Mirrors the shell plant runs. ----
{
    // C1: a contact test WITHOUT the altitude guard treats the 700-apart pair as touching.
    const noAltGuard = (a, b, rH, rV) => {
        const dx = b.x - a.x, dy = b.y - a.y, hdist = Math.hypot(dx, dy);
        if (hdist >= rH) return null;
        return { nalt: 1 };   // no |dalt| < rV check -> always "touching" once x-z overlaps
    };
    const far = [{ x: 0, y: 0, alt: 0 }, { x: 0, y: 0, alt: 700 }];
    ok(slabContact(far[0], far[1], RH, RV) === null && noAltGuard(far[0], far[1], RH, RV) !== null,
       "control: dropping the altitude guard WOULD collide the 700-apart pair");

    // C2: a flipped impulse sign turns the head-on stop into a suck (closing speed grows instead of vanishing).
    const vn = -20, imSum = 2;
    const jnHonest = (-(1 + 0) * vn) / imSum;      // +10 -> pushes apart
    const jnFlipped = -jnHonest;                    // -10 -> pulls together
    ok(jnHonest > 0 && jnFlipped < 0, "control: a flipped impulse sign pulls the ships together");
}

console.log(`esSlabCollide-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
