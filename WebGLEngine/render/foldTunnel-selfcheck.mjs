// WebGLEngine/render/foldTunnel-selfcheck.mjs — v3836
//
// A jump is mostly a shader, but the things that make it feel right or wrong are arithmetic: does the scroll wrap
// with no seam (a break at the wrap reads as a stutter every loop), does the pattern actually move with time, does
// the jump begin and end at rest instead of snapping on, does the fold spine run forward and bend. All pinned
// here; the LOOK -- colours, streak density, speed -- is Keith's.
//
// Run: node render/foldTunnel-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { scroll, ringPattern, jumpEnvelope, jumpDuration, foldSpine } from "./foldTunnel.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// 1) SCROLL WRAPS SEAMLESSLY -- advancing `along` by a whole period lands on the same phase, and phase stays in
//    [0,1). This is the endless-loop property; a break here is a visible stutter every cycle.
{
    let seamless = true, inRange = true;
    for (const a of [0, 0.3, 0.77, 2.4]) for (const t of [0, 0.5, 1.3]) {
        const p0 = scroll(a, t, 1.5, 0.25), p1 = scroll(a + 0.25, t, 1.5, 0.25);
        if (!near(p0, p1, 1e-9)) seamless = false;
        if (p0 < 0 || p0 >= 1) inRange = false;
    }
    ok(seamless, "scrolling wraps with no seam (a+period lands on the same phase)");
    ok(inRange, "scroll phase stays in [0,1)");
}

// 2) SCROLL ADVANCES with time (the pattern moves).
{
    const a = scroll(0.2, 0.0, 1, 1), b = scroll(0.2, 0.1, 1, 1);
    ok(!near(a, b), "the scroll phase changes as time advances");
}

// 3) RING PATTERN IS PERIODIC -- bright at the wrap (phase 0 == 1), dark between, bounded [0,1].
{
    ok(near(ringPattern(0), ringPattern(1)), "ring pattern matches at phase 0 and 1 (periodic -> no seam)");
    ok(ringPattern(0.5) < ringPattern(0), "the ring is dark between bright edges");
    let bounded = true; for (let k = 0; k <= 20; k++) { const v = ringPattern(k / 20); if (v < 0 || v > 1) bounded = false; }
    ok(bounded, "ring pattern stays in [0,1]");
}

// 4) END-TO-END SEAM -- the scrolled pattern is identical at along=0 and along=period for every time.
{
    let ok2 = true;
    for (const t of [0, 0.2, 0.9, 1.7]) if (!near(ringPattern(scroll(0, t, 1.2, 0.5)), ringPattern(scroll(0.5, t, 1.2, 0.5)), 1e-9)) ok2 = false;
    ok(ok2, "the tube pattern has no seam at the wrap, at any time");
}

// 5) JUMP ENVELOPE lifecycle: starts and ends at rest, holds at 1, eases both ways, stays in [0,1].
{
    const o = { inDur: 0.6, holdDur: 1.2, outDur: 0.7 }, total = jumpDuration(o);
    ok(near(total, 2.5), "jumpDuration sums the phases");
    ok(jumpEnvelope(0, o) === 0 && near(jumpEnvelope(total, o), 0), "the jump begins and ends at rest");
    ok(near(jumpEnvelope(0.6 + 0.6, o), 1), "the envelope holds at full during the hold phase");
    // eased ramp up (monotone increasing) over the in phase
    let up = true, pv = -1; for (let k = 0; k <= 10; k++) { const v = jumpEnvelope((0.6 * k) / 10, o); if (v < pv - 1e-9) up = false; pv = v; }
    ok(up, "the ramp-in is monotone increasing");
    // eased ramp down over the out phase
    let down = true; pv = 2; for (let k = 0; k <= 10; k++) { const v = jumpEnvelope(1.8 + (0.7 * k) / 10, o); if (v > pv + 1e-9) down = false; pv = v; }
    ok(down, "the ramp-out is monotone decreasing");
    let bounded = true; for (let k = 0; k <= 40; k++) { const v = jumpEnvelope((total * k) / 40, o); if (v < 0 || v > 1) bounded = false; }
    ok(bounded, "the envelope stays in [0,1]");
}

// 6) FOLD SPINE runs forward and bends, starting at the origin.
{
    const N = 20, L = 400, B = 60, s = foldSpine(N, L, B);
    ok(s.length === N && near(s[0][0], 0) && near(s[0][1], 0) && near(s[0][2], 0), "the spine starts at the origin");
    let fwd = true; for (let i = 1; i < N; i++) if (s[i][2] <= s[i - 1][2]) fwd = false;
    ok(fwd, "the spine advances forward (+z) monotonically");
    ok(near(s[N - 1][2], L), "the spine reaches its length");
    let maxX = 0; for (const p of s) maxX = Math.max(maxX, Math.abs(p[0]));
    ok(Math.abs(maxX - B) < B * 0.05, "the lateral bend peaks near the requested amount");
}

// 7) DETERMINISM.
{
    const a = foldSpine(12, 300, 40), b = foldSpine(12, 300, 40);
    let same = true; for (let i = 0; i < 12; i++) for (let k = 0; k < 3; k++) if (a[i][k] !== b[i][k]) same = false;
    ok(same, "foldSpine is deterministic");
}

console.log(`foldTunnel-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
