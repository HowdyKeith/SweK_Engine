// tools/roundhouse/promptCost.mjs -- v2849
//
// WHAT THE ROUNDHOUSE ACTUALLY SPENDS ON PROMPTS, and therefore whether compressing them is worth anything.
//
// MINED FROM awesome-llm-apps IN v2847 AND THEN REFUTED BY MEASUREMENT. That repo ships context-optimization
// templates claiming 50-90% token reductions -- TOON instead of JSON, context trimming, and so on. The claims
// are plausible and the technique is real. IT DOES NOT TRANSFER HERE, and the reason is worth keeping so nobody
// spends a round rediscovering it.
//
// MEASURED, across all nineteen devices:
//     proposer system prompt   ~165 tokens (the device name and its observable menu)
//     evaluator system prompt   ~74 tokens
//     user turn                 ~65 empty, ~146 with three rounds of history
//     ONE FULL ROUND           ~399 tokens
//
// A 50-90% CUT SAVES 200 TO 360 TOKENS PER ROUND. That is not a saving, it is a rounding error, and it is small
// because v2824 ALREADY compacted these payloads deliberately -- the user turn carries the question, the device,
// the observable list and the last three history entries, and nothing else.
//
// AND THE DECIDING POINT IS NOT THE SIZE, IT IS WHAT IS ACTUALLY BINDING. Even a full matrix -- nineteen devices
// (v3311: fullMatrixTokens() computes this now instead of the sentence below asserting it. The recorded scope
// reproduces exactly -- 912 calls, 363,888 tokens, matching the ~364k written here in v2849. TODAY'S registry of
// fifty devices gives 2,400 calls and 957,600 tokens, 2.63x the figure this paragraph still quotes, which is
// precisely the drift a prose calculation cannot notice and a function cannot miss.)
// times three runs times four rounds across four peers, about 364k tokens -- is limited by none of it:
//     GEMINI free tier   REQUESTS PER MINUTE, not tokens. v2829 paces remote peers at 6.5s per run for exactly
//                        this reason. Halving the prompt changes nothing about how often you may ask.
//     LOCAL OLLAMA       COMPUTE. A 399-token prompt is not what makes a 7B take seconds to answer.
//     A MATRIX RUN       WALL CLOCK. 228 runs at seconds each, and the sims are the seconds.
//
// Optimising tokens here would be optimising the one resource that is not scarce. THE SAME PROBLEM DOES BITE
// ELSEWHERE, THOUGH, AND SHARPLY: exploring 2,249 source files and 470,660 lines by grep is where the 99% token
// claims are real, which is what the code-graph tools on the rig page address. Right diagnosis, wrong patient.
//
// This module exists so the question is ANSWERABLE rather than arguable. Pure, no imports.

export const APPROX_TOKENS = (s) => Math.ceil(String(s || "").length / 4);
// chars/4 is a PROXY and is labelled one. There is no tokenizer here, and saying "tokens" without one would be
// a guess dressed as a measurement. It is good enough for a decision about orders of magnitude, which is all
// this needs to be.

export const MEASURED = Object.freeze({
    proposerSystemMeanTokens: 165,
    evaluatorSystemTokens: 74,
    userTurnEmptyTokens: 65,
    userTurnWithHistoryTokens: 146,
    perRoundTokens: 399,
    devicesMeasured: 19,   // THE SCOPE OF THE v2849 MEASUREMENT, frozen. Every figure above was taken across
                           // nineteen devices and that will never change, because it is a record of what happened.
    // v3901 -- was 107; hands, the gesture layer, arriving with the barehands round. THE SHIP GATE
    // CAUGHT THIS, which is what it is for: fullMatrixTokens() MULTIPLIES by this number, so a stale
    // count does not merely mislabel a page -- it produces a wrong figure that looks measured.
    devices: 129,  // v4026 -- was 125; knobliveness, renderbounce, reconquality, manifoldcensus and strokemorph -- five of the doorless six, the sixth (knobRegistry) REFUSED rather than built because it is registry/meta code, not a physics measurement. The round's own knob census is the interesting part: a DECLARED knob that moves nothing is worse than an undeclared one, because being in the register makes the invented instruction look answered. Its probe was WRONG TWICE and both readings were actionable -- per DEVICE instead of per MODE it called eight of quantum's eleven knobs dead, and honest-config-only it called inspiral.plantedPower dead, which would have named a HEALTHY PLANT a defect. Lab-wide 14 -> 11 -> TWO still knobs after a 1e-6x..1e6x ladder including the sign, and hands.span left that list by being FIXED: v3852's translation negative can now fire. // v4025 -- was 123; structurefactor and powder, the crystal-diffraction pair. Their bind round also fixed a REAL BROWSER DEFECT the existing door could never have found: physics/crystal/structureFactor.mjs and powder.mjs each opened with a static `import { pathToFileURL } from "node:url"` wanted ONLY by the CLI guard at the bottom, so a browser could not resolve the specifier and the whole module failed to load with every export in it. instrument-bench.html was already a door for both and runs reportLines() IN NODE through the bridge -- the one environment where the defect cannot fire. A DOOR THAT WORKS BY PROXY HIDES A FRONT DOOR NAILED SHUT. // v4023 -- was 114; NINE at once from Keith's patch round, and the number is not the story: the THERMAL FAMILY (blackbody, debye, sackurTetrode, fermi, paramagnet, chemicalPotential, bec) is the first cluster where the devices grade EACH OTHER -- debye's low-T slope IS blackbody's radiation integral, sackurTetrode is the classical limit bec and fermi collapse onto -- so no reference value is typed in any bind. Plus xenon (the iodine pit, whose plant a RUNNING reactor cannot see because equilibrium xenon is bit-identical -- only a scram separates them) and fragmentRotation (the rotated box, where the planted spectrum is a perfectly admissible body, just not this one). // v4009 -- was 113; blobvitals, the aquarium's own gauges (real/home/together/himself) graded against the four historical deaths that shipped them (v2595 dismantled, v2596 dissolved, v2597 dropped, v2597 vanished) -- the first device curriculum.mjs proposed rather than a person naming a subject. // v3995 -- was 112; cartpole, the first device whose subject is a CONTROLLER: the plant passes every self-consistent check it can run and drops the pole. // v3994 -- was 111; lotkavolterra, predator-prey: the plant is the standard textbook refinement of this very model, and the time-average theorem cannot see it. // v3991 -- was 110; laneemden, stellar structure: the plant is a dimensionality slip that still makes stars. // v3990 -- was 109; bell, the CHSH inequality: both bounds proven by search, and a plant that still violates. // v3984 -- was 108; kinetics, point reactor kinetics: the inhour equation against RK4, and the scram floor. // v3805 -- was 106; nbench, BVH vs grid. // v3804 -- was 105; mpm3d, the 3D transfer. // v3803 -- was 104; mpmcouple, two-material contact. // v3802 -- was 103; mpmrefine, self-convergence. // v3800 -- was 102; mpmpile, pile width vs friction. // v3799 -- was 101; mpmdrucker, the Drucker-Prager surface. // v3798 -- was 100; mpmmomentum, the frictionless floor. // v3797 -- was 99; mpmcolumn, the collapsing column. // v3794 -- was 98; mpmstep, the MPM step loop. // v3793 -- was 97; mpmforce, the MPM force scatter. // v3792 -- was 96; mpmplastic, the MPM return mapping. // v3791 -- was 95; mpmstress, the MPM neo-Hookean stress. // v3790 -- was 94; mpmgrid, the MPM grid impulse identity. // v3789 -- was 93; mpmtransfer, the MPM APIC transfer. // v3783 -- was 92; stability, SPH energy direction. // v3782 -- was 91; voxelize, mesh volume convergence. // v3781 -- was 90; entropy, Shannon source coding. // v3774 -- was 89; cfl, the SPH acoustic boundary. // v3773 -- was 88; thermostat, the Berendsen relaxation law. // v3769 -- was 87; fft, absolute DFT amplitudes. // v3768 -- was 86; adjoint, the exact Radon adjoint identity. // v3731 -- was 85; induction, THE MODULE STATES ITS INTEGRAL LAWS IN PROSE AND IMPLEMENTS ONLY THE POINTWISE END -- so the keys are the integrals it never computes: circulation depends on the ENCLOSED AREA and not on where the loop sits (1.7e-13 including a loop centred at (3,-2)), and the Coulomb flux is the same through every radius (spread EXACTLY 0). The operator the file ships to check its work cannot tell its two fields apart.   // v3730 -- was 84; kerrladder, THE MODULE WAS HANDED ITS FORMULAS SO THE KEY HAS TO BE WHAT EMERGES FROM THEM -- the photon orbit where L diverges (worst 1.24e-14 against a trigonometric closed form sharing no operation with the algebra) and the ISCO where E bottoms out (sqrt(8/9) to ONE ULP at a = 0). The extremal limit is APPROACHED, never evaluated. A key evaluated only where its parameter is zero is blind to every term that parameter multiplies.   // v3729 -- was 83; flip3d, THE TWO LATERAL AXES ARE INTERCHANGEABLE AND NOTHING TELLS THE CODE THAT -- a dam break run along x and the same particles run along z are BIT-IDENTICAL (exactly zero, over 4000 particles and 300 steps), and the hydrostatic column ported from flip2d is BLIND to a dropped z divergence term that moves isotropy to 2.5e-1. A symmetric error moves the magnitude; an asymmetric one moves the axes.   // v3728 -- was 82; freesurface, COMMUNICATING VESSELS -- two unequal columns over one floor must find ONE level, and the gap is a DIFFERENCE so the settled packing constant cancels, which is the thing volumeHeight cannot do. The claim is FALSE on its own fixture until the fluid settles (envelope 1.8421 at 1800 steps, 0.0526 at 3000), and the ENVELOPE is the observable because a slosh passes through level twice a period.   // v3724 -- was 81; multigridgpu, THE GATHER RESTRICTION IS THE EXACT TRANSPOSE OF THE GATHER PROLONGATION -- machine precision on every real level pair, and NOT structural the way the scatter reference is, because a gather is adjoint only if its window covers every fine cell whose stencil reaches the coarse cell. The window is bracketed BOTH WAYS: narrower breaks it, wider is identical to the last bit. THE WGSL STAYS UNGRADED and wgslGraded says so as data.   // v3723 -- was 80; multigrid3d, THE WORK DOES NOT SCALE WITH THE PROBLEM -- 8x the cells for 1.4x the iterations, plus a REFUSAL: an all-Neumann system with a non-zero-mean RHS is singular and the residual stalls rather than falling.   // v3718 -- was 79; flip2d, the FLIP/PIC solver's HYDROSTATIC limit -- p = rho g d recovered from the PROJECTION, which is never handed rho: gravity enters as a velocity increment. The free-fall and divergence keys were REJECTED as mirrors first.   // v3621 -- was 78; crystallize, the Avrami exponent -- geometry sets it, and THE SEED SPREAD WAS MEASURED BEFORE THE CLAIM because ising.L is this lab standing example of a beautiful convergence that is noise.   // v3620 -- was 77; vaporize, gasification -- mass, volume, density: pick two, and ONE number decides every penalty. It is EXACTLY 1 at the critical point, so the trap is distance from critical rather than the voxel scheme.   // v3619 -- was 76; freeze, solidification -- NOT a mirror of melt: heat crosses the LIQUID to reach a melting front and the SOLID to reach a freezing one, so ice/water freezes ~2x as fast as it melts.   // v3618 -- was 75; melt, the Stefan melting front graded against its closed form -- THE FIRST DEVICE IN THIS LAB THAT CARRIES A CONSERVATION IDENTITY, since conservationReach has only ever been a name scan.   // v3563 -- was 74; freerotation, torque-free rigid body rotation (Euler + intermediate axis).   // v3522 -- was 73; bonefield, the capsule distance field of a soft-body skeleton.   // v3519 -- was 72; csg, exact signed-distance primitives and set algebra.   // v3501 -- was 71; astroparticle, opening the neutrino/cosmology field with the oscillation mode.   // v3496 -- was 70; sdfmarch, the implicit-field ray marcher.   // v3487 -- was 69; refscan, the reference region scan. BUMPED BECAUSE THE COUNT MULTIPLIES THE COST MODEL rather than decorating it.   // v3460 -- was 68; xpbd, from Keith's v3464 weave patch. Its devices.mjs was a CLEAN SUPERSET
                   // this time (67 -> 68 registered, nothing dropped) -- the first of four such patches that did not
                   // drop one of mine, which is why the name-by-name diff runs every time regardless.
                   // v3430 was 66 -> 67 (poisson). v3425 was 65 -> 66 (invariants). v3423 was 64 -> 65 (centrifuge). v3422 was 63 -> 64 (whitedwarf). v3391 was 59 -> 63 (nuclear, seismic, acoustics, em). fullMatrixTokens() multiplies by this,
                   // which is exactly why the gate catches a stale value: the number is LOAD-BEARING rather than decorative.
                           // one above until v3311. See the note below.
    note: "measured v2849 across every registered device with the chars/4 proxy",
});

// v3311 -- *** THE NUMBER THAT MULTIPLIES NOW ACTUALLY MULTIPLIES. ***
//
// Two defects sat here together and each hid the other.
//
//   (1) MEASURED IS A RECORD, AND ONE OF ITS FIELDS WAS BEING EDITED. The header says "MEASURED, across all
//       nineteen devices" and every token figure comes from that v2849 run. But `devices` was hand-updated to
//       track the registry -- 19, then 27, then 34, then 47, then 50 -- so a frozen record of a past measurement
//       silently contained a live count, and contradicted its own header. The two quantities are now separate:
//       devicesMeasured is what the measurement covered and never moves; devices is today's registry.
//
//   (2) THE CLAIM "THE COST MODEL MULTIPLIES BY THIS" WAS FALSE, and it had been repeated in the constant's own
//       comment and in staleness.mjs's justification for watching it. NOTHING multiplied by it. The
//       multiplication existed only in a SENTENCE -- "nineteen devices times three runs times four rounds across
//       four peers, about 364k tokens" -- and a sentence does not recompute. With 50 devices that example was
//       wrong by a factor of 2.6 and nothing could notice, because the arithmetic was prose.
//
// So the sentence became a function. Now the claim is true, the staleness check is protecting something real,
// and the header's 364k is reproduced from the recorded scope rather than asserted beside it.
export function fullMatrixTokens({ devices, runs = 3, rounds = 4, peers = 4, perRoundTokens = MEASURED.perRoundTokens } = {}) {
    if (!Number.isFinite(devices)) throw new Error("fullMatrixTokens: devices must be supplied -- the whole point is that it is not baked in");
    const calls = devices * runs * rounds * peers;
    return { devices, runs, rounds, peers, calls, tokens: calls * perRoundTokens };
}

// What a claimed reduction would actually buy, so the answer is arithmetic rather than opinion.
export function savingsFrom(reductionFraction, { rounds = 1 } = {}) {
    const perRound = MEASURED.perRoundTokens * reductionFraction;
    return { reductionFraction, perRoundTokens: Math.round(perRound), totalTokens: Math.round(perRound * rounds), rounds };
}

// The honest question: is the prompt the binding constraint for this tier? It never is here, and the reason
// differs per tier -- which is why a single "reduce tokens" answer was never going to fit.
export const BINDING_CONSTRAINT = Object.freeze({
    gemini: { constraint: "requests per minute", tokensBinding: false, why: "a free tier limits how OFTEN you ask, not how much you say; v2829 paces remote peers at 6.5s per run" },
    ollama: { constraint: "compute", tokensBinding: false, why: "a 399-token prompt is not what makes a 7B model take seconds" },
    claude: { constraint: "billing", tokensBinding: true, why: "the one tier where tokens are money -- but 399 per round is already small" },
    matrix: { constraint: "wall clock", tokensBinding: false, why: "228 runs at seconds each, and the physics sims are the seconds" },
});

export function isPromptTheBottleneck(tier) {
    const b = BINDING_CONSTRAINT[tier];
    if (!b) return { known: false, tier };
    return { known: true, tier, ...b };
}

// Measure a live payload, so a future change that bloats the prompt is visible rather than assumed away.
export function costOfCall({ system = "", user = "" }) {
    const s = APPROX_TOKENS(system), u = APPROX_TOKENS(user);
    return { systemTokens: s, userTokens: u, totalTokens: s + u, proxy: "chars/4" };
}
