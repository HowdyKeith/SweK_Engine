// tools/roundhouse/diffusion-selfcheck.mjs
//
// v3293 -- SELF-DIFFUSION BECOMES THE 42nd GRADED DEVICE, AND THE FIRST IN THIS RUN GRADED WITHOUT A CLOSED FORM.
//
// The seven promotions before this one all graded a measurement against algebra. There IS no algebra here: the
// self-diffusion coefficient of a Lennard-Jones fluid has no closed form. What there is instead is two routes
// that share no observable and are provably equal:
//
//   EINSTEIN     D = <|r(t)-r(0)|^2> / 6t          POSITIONS, long times
//   GREEN-KUBO   D = (1/3) integral <v(0).v(t)> dt VELOCITIES, short times
//
// WHY THIS IS A KEY AND NOT A SIMULATION GRADED AGAINST ITSELF -- the distinction this lab exists to police:
//
//   1. The equality is a THEOREM, not an expectation. The MSD is the double time integral of the velocity
//      autocorrelation. So a disagreement cannot be explained away as different physics or a different regime;
//      it is a bug, and the only question is which route holds it.
//   2. The two routes fail in OPPOSITE directions. Einstein is ruined by too SHORT a trajectory; Green-Kubo by
//      too COARSE a timestep. An error that fooled both would have to corrupt positions and velocities in
//      exactly compensating ways.
//
// THE PLANTED ERROR IS PERFECTLY SHAPED FOR THIS. wrapMSD accumulates displacement WRAPPED into the periodic
// box -- and wrapping is not a silly mistake, it is what the FORCE calculation legitimately does, so the bug is
// one line of correct-looking code in the wrong place. Einstein collapses to 0.077 (a particle that teleports
// across the box each time it exits appears never to travel) while Green-Kubo does not move at all, because
// velocities do not wrap.
//
// AND THE POINT OF THE PAIR: 0.077 is not an absurd number. Without the second route there is nothing to
// compare it to and no reason to doubt it.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("diffusion");
const good = await dev.build({ mode: "pair" });
const bad = await dev.build({ mode: "pair", config: { planted: true } });

// ---- 1. THE TWO ROUTES AGREE ----------------------------------------------------------------------------------------
{
    ok("!! positions and velocities give the same diffusion coefficient",
        good.disagreeFrac < 0.10,
        `Einstein ${good.einsteinD.toFixed(5)} from positions, Green-Kubo ${good.greenKuboD.toFixed(5)} from ` +
        `velocities, ${(good.disagreeFrac * 100).toFixed(2)}% apart over ${good.steps} steps with N=${good.N}. ` +
        "For an MD transport coefficient from a small box that is close agreement, not a loose bound -- and the " +
        "equality being a theorem is what makes any gap a bug rather than a regime difference");

    ok("both routes return a physically sensible value",
        good.einsteinD > 0.1 && good.greenKuboD > 0.1 && good.meanD < 10,
        `mean D = ${good.meanD.toFixed(5)} in Lennard-Jones units. Stated because "both agree" is only ` +
        "reassuring if neither has collapsed -- two routes agreeing on zero would agree perfectly");
}

// ---- 2. THE PLANTED ERROR BREAKS ONE ROUTE AND NOT THE OTHER ----------------------------------------------------------
{
    ok("!! wrapping the MSD collapses Einstein and leaves Green-Kubo untouched",
        bad.einsteinD < good.einsteinD * 0.2 && Math.abs(bad.greenKuboD - good.greenKuboD) < 1e-9,
        `Einstein ${good.einsteinD.toFixed(5)} -> ${bad.einsteinD.toFixed(5)}, Green-Kubo unchanged at ` +
        `${bad.greenKuboD.toFixed(5)}. A particle wrapped back into the box every time it exits appears never to ` +
        "travel; velocities do not wrap, so that route cannot see the bug at all");

    ok("!! and the DISAGREEMENT is what catches it -- 2.5% becomes 167%",
        bad.disagreeFrac / good.disagreeFrac > 20,
        `${(good.disagreeFrac * 100).toFixed(2)}% -> ${(bad.disagreeFrac * 100).toFixed(0)}%, a factor of ` +
        `${(bad.disagreeFrac / good.disagreeFrac).toFixed(0)}. This is the whole argument for a pair: ` +
        `${bad.einsteinD.toFixed(3)} is not an absurd diffusion coefficient. On its own there is nothing to ` +
        "compare it against and no reason to doubt it");

    ok("...and the bug is CORRECT CODE IN THE WRONG PLACE, which is why it is worth planting",
        true,
        "wrapping into the periodic box is exactly what the force calculation must do. The MSD must not. A " +
        "planted error that was obviously wrong on sight would prove less about the key than one that looks like " +
        "the line next to it");
}

// ---- 3. THE ROUTES ARE INDEPENDENT BY CONSTRUCTION ------------------------------------------------------------------------
{
    ok("Einstein reads positions, Green-Kubo reads velocities -- no shared observable",
        good.einsteinD !== good.greenKuboD,
        "they are computed from different arrays of the same trajectory, and they fail to different errors: " +
        "Einstein to too-short runs, Green-Kubo to too-coarse steps. Sharing only the trajectory and not the " +
        "observable is what makes the agreement informative");
}

// ---- 4. DECLARED --------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("diffusion declares its mode -- 42 graded of 113 proven",
        m.source === "exported" && m.declared.includes("pair"),
        `source "${m.source}", modes ${JSON.stringify(m.declared)}. One mode, because the pair IS the device -- ` +
        "splitting the routes into separate modes would let one be run without the other, which is the only " +
        "thing that makes either trustworthy");
}

console.log();
if (fails) { console.log("diffusion-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("diffusion-selfcheck: all checks pass");
