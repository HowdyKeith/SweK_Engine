// physics/viewLayout-selfcheck.mjs
//
// Run: node physics/viewLayout-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The multi-window model has to be exactly right underneath the rendering, so the gate proves it: promoting an inset
// swaps it with the primary and puts the old primary back where the inset was, losing nothing; a layout serialises to a
// string and back unchanged; validation rejects a layout that points at a scene or panel that does not exist. And the
// behind-the-scenes panels must read the real computation, not a decoration: the spectrum panel's peak lands on the
// vibrating chain's analytic mode frequency, and the zeta-line panel dips to near zero exactly at the first nontrivial
// zero near t = 14.13. The sabotage makes promote drop the old primary instead of demoting it to an inset, and the swap
// check fails, because a promote that loses a view is not a swap.
import { spectrumPanel, zetaLinePanel } from "./livePanel.js";
import { makeView, makeLayout, promote, validate, encodeLayout, decodeLayout } from "./viewLayout.js";
import { makeChain, modeFreq } from "./vibrations.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. PROMOTE: an inset swaps with the primary, nothing lost ------------------------------------------
{
    const L = makeLayout(makeView("orbit"), [makeView("vibrations"), makeView("figure-eight")]);
    const P = promote(L, 0);
    const ids = new Set([P.primary.id, ...P.insets.map((v) => v.id)]);
    ok("!! promoting an inset swaps it with the primary and keeps every view", P.primary.id === "vibrations" && P.insets[0].id === "orbit" && ids.size === 3,
       "promoting the first inset makes it primary and demotes the old primary into its slot -- the three views are all still present, just reordered.");
}

// ---- 2. SERIALISE: a layout round-trips through its string ----------------------------------------------
{
    const L = makeLayout(makeView("orbit", { params: { e: 0.5 }, yaw: 22, pitch: 62 }), [makeView("vibrations", { params: { mode: 3 } }), makeView("zeta-line", { kind: "panel" })]);
    const enc = encodeLayout(L), dec = decodeLayout(enc);
    ok("!! a multi-window layout serialises to a string and back unchanged", encodeLayout(dec) === enc && dec.primary.params.e === 0.5 && dec.insets.length === 2,
       "the layout encodes to \"" + enc.slice(0, 46) + "...\" and decodes to the same thing, params and all -- so an arrangement is shareable and save-able like a single scene.");
}

// ---- 3. VALIDATE: a layout pointing at a missing view is rejected ----------------------------------------
{
    const good = validate(makeLayout(makeView("orbit"), [makeView("spectrum", { kind: "panel" })]), ["orbit", "vibrations"]);
    const bad = validate(makeLayout(makeView("nonesuch"), []), ["orbit", "vibrations"]);
    ok("!! validation accepts real views and rejects missing ones", good.ok && !bad.ok && bad.bad === "nonesuch",
       "a layout of real scenes and panels validates, while one naming \"nonesuch\" is rejected as an unknown scene -- a layout can never point at a view that is not there.");
}

// ---- 4. SPECTRUM PANEL reads the physics: its peak is the mode frequency ---------------------------------
{
    const N = 8192, sub = 2, dtS = sub / 240, dw = 2 * Math.PI / (N * dtS);
    let worst = 0; for (const mode of [3, 5, 8]) { const sp = spectrumPanel({ mode, N, sub }); const fpeak = 2 * Math.PI * sp.peak / (N * dtS), fa = modeFreq(makeChain({ N: 12 }), mode); worst = Math.max(worst, Math.abs(fpeak - fa) / dw); }
    ok("!! the spectrum panel reads the physics -- its peak is the mode frequency", worst < 1.2,
       "for several modes the spectrum panel's peak lands on the analytic mode frequency to within " + worst.toFixed(2) + " of a bin -- the inset shows the real spectrum of the scene it sits beside.");
}

// ---- 5. ZETA-LINE PANEL reads the physics: it dips at the first zero -------------------------------------
{
    const zp = zetaLinePanel({ tMin: 8, tMax: 27, steps: 190 });
    const nearFirst = zp.dips.some((t) => Math.abs(t - 14.1347) < 0.2);
    ok("!! the zeta-line panel dips at the nontrivial zeros", nearFirst && zp.dips.length >= 3,
       "sampling |zeta(1/2+it)| along the line, the panel finds dips at " + zp.dips.map((t) => t.toFixed(1)).join(", ") + " -- the nontrivial zeros, drawn as a curve to walk.");
}

// ---- 6. DETERMINISTIC -----------------------------------------------------------------------------------
{
    const a = encodeLayout(promote(makeLayout(makeView("orbit"), [makeView("vibrations")]), 0));
    const b = encodeLayout(promote(makeLayout(makeView("orbit"), [makeView("vibrations")]), 0));
    ok("!! the layout operations are deterministic", a === b,
       "the same promote yields the same encoded layout -- the model is stable, so a shared arrangement opens the same everywhere.");
}

console.log(fails ? "\nviewLayout-selfcheck: " + fails + " FAILED" : "\nviewLayout-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
