// WebGLEngine/physics/labScenes.mjs -- v3587
// ---------------------------------------------------------------------------------------------------------------
// CAN THE ROUNDHOUSE WORK ON A LAB SCENE? THE DRILL-DOWN, PER SCENE, WITH THE REFUSALS NAMED.
//
// The question was: pick a preset on physics-lab.html and know whether you could hand it to the roundhouse.
// Three facts answer it, and the first two are measurements rather than opinions:
//
//   1. *** THERE IS NO SUCH BUTTON. *** physics-lab.html contains ZERO references to the roundhouse, to
//      proposers, or to any AI worker. Not hidden, not disabled -- ABSENT.
//   2. *** AND IT WOULD LIGHT UP NOTHING TODAY. *** Six proposers are registered, against schrodinger,
//      landau-zener, percolation, kuramoto and md-pbc. Twelve lab scenes. THE INTERSECTION IS ZERO, so a button
//      built this afternoon would be greyed out for all twelve.
//   3. And the tree ALREADY REFUSED THE PAGE, on record: knobRegistry's NOT_REGISTERED says of physics-lab
//      "an aggregate front door rather than a single measurement with knobs". THAT REFUSAL IS CORRECT AND IT IS
//      ABOUT THE PAGE. Each of its twelve SCENES is a single measurement with knobs, and NOT ONE HAS BEEN
//      ASSESSED -- the page-level "no" was read as a scene-level "no" and the question stopped being asked.
//
// ================================================================================================================
// WHAT THIS FILE IS AND, MORE IMPORTANTLY, WHAT IT IS NOT
// ================================================================================================================
//
// registerProposer REQUIRES AN ADJUDICATOR, and main.js records why that matters: "an invented adjudicator is A
// CONTROL THAT CANNOT FAIL -- it passes whatever it is handed, the ratchet grants tiers on its evidence, and the
// whole structure keeps working while meaning nothing." Of the first seven adjudicators written there, THREE
// PASSED EVERY CANDIDATE THEY WERE GIVEN and had to be withdrawn.
//
// *** SO THIS FILE REGISTERS NOTHING. *** It records, per scene, WHETHER AN INDEPENDENT KEY IS AVAILABLE and what
// it would be -- and every one of those is marked `assessed`, not `measured`, because I have not run them. An
// assessment that wore the word "measured" would be exactly the invented adjudicator one level up: a claim about
// whether a claim can be checked, itself unchecked.
//
// EIGHT OF THE TWELVE HAVE AN INDEPENDENT KEY AVAILABLE, four do not, and the reasons for the four are in
// NOT_REGISTERED's own shape. Eight is eight more than the zero the page currently offers.
//
// *** AND THE KNOB NAMES IN THE TABLE BELOW WERE WRONG IN NINE OF TWELVE ROWS ON THE FIRST PASS. *** The header
// said they were "read from the page, not invented", and I had typed them from the scene LABELS instead --
// "friction" where the page says mu, "temperature" where it says tempK, "eccentricity" where it says e. A claim
// about provenance is a claim like any other, and this one was false in the same paragraph that made it. They
// are now extracted from the params array and checked against it by the gate, so the next drift is caught rather
// than described.
"use strict";
import { pathToFileURL } from "node:url";

/** Marks how a row was arrived at. Nothing here is `measured`; see the header. */
export const PROVENANCE = { ASSESSED: "assessed", MEASURED: "measured", RECORDED: "recorded" };

/**
 * One row per scene on physics-lab.html. `knob` is the parameter the page already exposes -- read from the page,
 * not invented -- and `key` is what an adjudicator would have to check.
 *
 * `eligible` is a JUDGEMENT and says so. "candidate" means an independent key exists and somebody should write
 * the adjudicator; "refused" means the honest answer is no, with the reason attached in the same shape
 * NOT_REGISTERED uses.
 */
export const SCENE_TRIAGE = [
    { scene: "balloon", knob: "inflation", instrument: "xpbd-compliance", eligible: "refused", provenance: PROVENANCE.MEASURED, responds: "identity",
      key: null,
      reason: "ATTEMPTED AND WITHDRAWN. V/Vrest came back 0.6000, 1.0000, 1.6000, 2.2000 for those exact " +
              "inflations -- and THAT IS THE PROBLEM, NOT THE PROOF. *** THE VOLUME CONSTRAINT'S JOB IS TO MAKE " +
              "THEM EQUAL, so the key IS the knob's setpoint. *** It hits the target to 6e-12 IN A SINGLE " +
              "SUBSTEP and to 6.7e-16 at compliance 5, ten thousand times looser than the scene uses: THE KEY " +
              "CANNOT SAY NO AT ANY SOLVER SETTING. A third flavour of control-that-cannot-fail, after orbit's " +
              "REAL-BUT-DEAF key: this one AGREES BY CONSTRUCTION." },
    { scene: "muscle", knob: "activation", instrument: "xpbd-compliance", eligible: "refused", provenance: PROVENANCE.ASSESSED, responds: "identity",
      key: null,
      reason: "INHERITS BALLOON'S OBJECTION and is marked ASSESSED rather than measured, because I ran balloon " +
              "and not this. It drives the same volume constraint through muscleVolumeSubstep, so the same " +
              "setpoint-is-the-key argument applies -- but that is an ARGUMENT, and this session has now had " +
              "one argued candidate (orbit) refuted by measurement. Withdrawn on the structural ground, and the " +
              "provenance says which kind of claim that is." },
    { scene: "flag", knob: "wind", eligible: "refused", provenance: PROVENANCE.ASSESSED, responds: "n/a",
      key: null, reason: "cloth in a sampled wind has no closed form at this scale; maxStrain is a diagnostic " +
           "rather than a key, and 'looks like a flag' is the visual comparison splat-lab was refused for" },
    { scene: "pile", knob: "mu", instrument: "contact-keys", eligible: "candidate", provenance: PROVENANCE.MEASURED, responds: "yes",
      key: "ANGLE OF REPOSE: tan(theta) = mu is exact, and v3570 already built exactly this adjudicator for " +
           "box3d in physics/mechanics/contactKeys.mjs -- including the finding that the DETECTOR must be " +
           "velocity and not displacement. MEASURED v3590: tan(theta_c) = 0.2104, 0.5112, 0.8127 at " +
           "mu = 0.2, 0.5, 0.8, using v3570's OWN adjudicator against the real box3d -- tracking mu " +
           "with the additive ~0.01 offset that round characterised. THE KEY MOVES WITH THE KNOB.",
      caution: "v3570 also measured an ADDITIVE offset of about 0.0097 in tan that refines to a nonzero limit; " +
               "an adjudicator that expected exact agreement would reject every correct answer " + "MEASURED v3589: tan(theta_c) = 0.2104, 0.5112, 0.8127 at mu = 0.2, 0.5, 0.8, using v3570's OWN adjudicator against the real box3d -- tracking mu with the additive ~0.01 offset that round already characterised." },
    { scene: "stretch", knob: "weft", eligible: "refused", provenance: PROVENANCE.ASSESSED, responds: "n/a",
      key: null, reason: "anisotropic cloth stiffness has no independent measurable on this page: the knob and " +
           "the observable are the same quantity, so an adjudicator would be grading the knob against itself" },
    { scene: "swirl", knob: "strength", eligible: "refused", provenance: PROVENANCE.ASSESSED, responds: "n/a",
      key: null, reason: "a sampled vector field advects particles correctly by construction; there is nothing " +
           "for a knob search to be right or wrong about" },
    // *** NULL, NOT A GUESS: physics/blobKelvin.js HAS NO INSTRUMENT ENTRY. *** I typed "blob-kelvin" from the
    // module name and the explicit-link check caught it within a minute -- which is the whole reason the link
    // stopped being a name match. A scene with no owning instrument says so.
    { scene: "diffusion", knob: "tempK", instrument: null, eligible: "refused", provenance: PROVENANCE.MEASURED, responds: "no",
      // v3598 -- ATTEMPTED, MEASURED, WITHDRAWN, and orbit at v3588 is the precedent. THE ROUND TRIP CANNOT
      // BE WRONG ABOUT THE TEMPERATURE: D cancels out of it. T sets D, D scales sigma, sigma scales a FIXED
      // random stream, the MSD scales with D exactly, and inverting returns D. That/T is ONE NUMBER FOR THE
      // WHOLE SLIDER -- 1.025346630 at 260, 300, 340 and 373 K, spread 4.44e-16 -- and a 16-seed ensemble
      // does not rescue it (mean/T identical to 2.22e-16). *** THIS IS NOT THE SMALL-SAMPLE PROBLEM THE
      // ROUND EXPECTED: the seed spread behaves perfectly well (2.34e-1 -> 2.69e-2 over 256x the samples)
      // and buys nothing, because the quantity it is the spread OF carries no temperature information at any
      // size. *** The caution below was RIGHT that the algebra is a control that cannot fail, and right that
      // the honest key must go through the trajectory -- and the trajectory turns out to be the same control
      // one step along. Proof and the antidote: physics/diffusionKnob.mjs REFUSED.
      reason: "ATTEMPTED AND WITHDRAWN (v3598), orbit's shape at v3588: D CANCELS OUT OF THE ROUND TRIP, so " +
              "That/T is ONE NUMBER FOR THE WHOLE SLIDER (1.025346630 at 260, 300, 340 and 373 K, spread " +
              "4.44e-16; a 16-seed ensemble agrees to 2.22e-16). The measurement cannot be wrong about the " +
              "temperature, which is a control that cannot fail. NOT a small-sample problem: the seed spread " +
              "falls 2.34e-1 -> 2.69e-2 over 256x the samples and buys nothing. Proof: physics/diffusionKnob.mjs",
      // THE KEY THAT WAS PROPOSED AND REFUTED, KEPT UNDER A NAME THAT CANNOT BE READ AS LIVE (v3202:
      // deleting it would lose the fact that the question was asked and settled).
      key: null,
      refutedKey: "Stokes-Einstein: the temperature knob sets D, and a temperature READ BACK FROM THE MEASURED WANDER " +
           "of the blob centres tracks it. warmthOfKelvin responds smoothly across 250-373 K (0.01340 to " +
           "0.01999), so the knob does move the physics.",
      caution: "*** THE OBVIOUS KEY IS ALGEBRA AND WOULD BE A CONTROL THAT CANNOT FAIL: *** composing " +
               "kelvinOfWarmth(warmthOfKelvin(T)) returns T to 5.7e-14, because they are a forward and an " +
               "inverse of the same formula. THE HONEST KEY MUST GO THROUGH THE TRAJECTORY -- recover D from " +
               "the MSD of the simulated walk and THEN invert -- which is a path the module does not expose and " +
               "the scene computes inline. An adjudicator written against the exposed pair would pass " +
               "everything." },
    { scene: "aquarium", knob: "tempK", eligible: "refused", provenance: PROVENANCE.ASSESSED, responds: "n/a",
      key: null, reason: "box3d collision plus a thermal drive is two subsystems at once, and a knob moving " +
           "both gives an adjudicator no way to attribute a change -- the same objection cosmic-web was " +
           "refused under" },
    { scene: "centrifuge", knob: "omega", instrument: "centrifuge", eligible: "candidate", provenance: PROVENANCE.MEASURED, responds: "yes",
      key: "sedimentation equilibrium in a rotating frame has a closed form: the concentration profile is " +
           "exponential in omega^2 r^2, so the knob enters the ANSWER analytically.",
      key2: "MEASURED v3590: radialSpeed at omega 1, 2, 4, 8, 16 gives ratios of EXACTLY 4.000, 4.000, 4.000, " +
            "4.000 per doubling -- omega^2, over a 16x sweep. The key moves with the knob and the exponent is " +
            "the one the physics predicts.",
      caution: "it needs long enough to reach equilibrium, and a run stopped early looks exactly like a wrong " +
               "omega" },
    { scene: "gyroscope", knob: "omega", instrument: "gyroscope", eligible: "candidate", provenance: PROVENANCE.MEASURED, responds: "yes",
      key: "PRECESSION RATE = m g r / (I omega), a closed form the scene's own parameters supply entirely. And " +
           "physics/gyroscope.js is already a gated instrument, so the adjudicator would have a second opinion " +
           "rather than only the scene's. " + "MEASURED v3589: rate x omega = 11.808, 11.938, 11.970, 11.977, 11.979 across omega 10 to 160 -- CONVERGING TO 12, WHICH IS EXACTLY THE APPLIED TORQUE. The rate falls as 1/omega over a 16x sweep, so the key moves with the knob and the constant it converges to is a quantity nobody fed it." },
    { scene: "orbit", knob: "e", instrument: "kepler", eligible: "refused", provenance: PROVENANCE.MEASURED, responds: "no",
      key: null,
      reason: "ATTEMPTED AND WITHDRAWN, and it was the one v3587 called the strongest. Angular momentum IS " +
              "conserved exactly -- AND AT EVERY ECCENTRICITY, because a symplectic integrator conserves it " +
              "regardless of orbit shape. MEASURED at the page's fixed dt = 0.002 over five periods: |dL|/L is " +
              "1.1e-15, 1.1e-14, 3.1e-15, 3.1e-15, 2.4e-14, 8.1e-15 across e = 0 to 0.7 -- FLAT, at machine " +
              "precision. An adjudicator on it would PASS EVERY CANDIDATE: a REAL key pointed at the WRONG " +
              "PARAMETER, which reaches control-that-cannot-fail from a new direction. Energy drift DOES " +
              "respond (2.2e-15 to 1.2e-6) but is O(dt^2) at fixed e, so a high eccentricity legitimately " +
              "drifts more and rejecting it would reject correct physics. THE PAGE EXPOSES A SCENE PARAMETER " +
              "WHERE A PROPOSER WANTS A SOLVER ONE: dt is hardcoded at 0.002 and is what a search should tune." },
    { scene: "vibrations", knob: "mode", instrument: "vibrations", eligible: "candidate", provenance: PROVENANCE.MEASURED, responds: "yes",
      key: "normal-mode frequencies of a discrete string are 2*sin(k*pi/2N) times a constant -- an exact " +
           "sequence, and the mode knob selects which one, so a wrong knob is a wrong FREQUENCY and not a " +
           "wrong-looking picture. " + "MEASURED v3589: frequency 0.2411, 0.4786, 0.7092, 1.3262, 1.9854 for modes 1, 2, 3, 6, 12 on a 12-mass chain -- monotone, spread 8.2x, and matching 2*sqrt(w02)*sin(j*pi/2(N+1)) exactly." },
];

export const bySceneId = () => new Map(SCENE_TRIAGE.map((r) => [r.scene, r]));
export const candidates = () => SCENE_TRIAGE.filter((r) => r.eligible === "candidate");
export const refused = () => SCENE_TRIAGE.filter((r) => r.eligible === "refused");

/** Join the triage against whatever the proposer registry actually holds. */
/**
 * *** THE LINK IS EXPLICIT NOW, AND IT WAS A GUESS. *** The first version matched the SCENE ID against the
 * proposer's instrument id and happened to work for gyroscope -- only because v3591 registered an instrument
 * with that exact name. It broke the moment pile-friction was pointed at `contact-keys`, WHICH IS WHERE ITS KEY
 * ACTUALLY LIVES (v3570 built the friction-cone adjudicator there, not in a scene). proposers.mjs already
 * carries this lesson at v3286: a stem match reported a false orphan, and A LINK THAT HAS TO BE GUESSED IS NOT
 * A LINK. Rows that own no instrument say so with null rather than matching by luck.
 */
/**
 * v3595 -- THE JOIN NOW CARRIES THE PROPOSER IDS, because the button needs to RUN something and a boolean
 * cannot be run. The page had `registered: true` and no way to say WHICH proposer, so it would have had to
 * re-derive the instrument match in JavaScript -- a second declaration of this resolution, which is the
 * defect this file's own header was written about (a link that has to be guessed is not a link).
 *
 * *** IT IS A LIST AND NOT A SINGLE ID, AND THAT IS NOT DEFENSIVENESS: md-pbc ALREADY HAS TWO (md-timestep
 * and md-box). *** Returning the first match would pick one on a caller's behalf and hide the other, so a
 * scene with two proposers shows two rows and the person decides. No lab scene has two today; the shape does.
 */
export function joinRegistered(listProposers) {
    const byInst = new Map();
    for (const p of listProposers || [])
        if (p.instrument) byInst.set(p.instrument, [...(byInst.get(p.instrument) || []), p.id]);
    return SCENE_TRIAGE.map((r) => {
        const proposerIds = (r.instrument && byInst.get(r.instrument)) || [];
        return { ...r, proposerIds, registered: proposerIds.length > 0 };
    });
}

export const MEASURED_V3587 = {
    thereIsNoButton:
        "*** physics-lab.html CONTAINS ZERO REFERENCES TO THE ROUNDHOUSE, TO PROPOSERS, OR TO ANY AI WORKER. *** " +
        "Not hidden, not disabled -- ABSENT. And a button built today would be greyed out for all twelve scenes, " +
        "because six proposers are registered against schrodinger, landau-zener, percolation, kuramoto and " +
        "md-pbc, and THE INTERSECTION WITH THE LAB SCENES IS ZERO.",
    thePageWasRefusedAndTheScenesWereNot:
        "knobRegistry's NOT_REGISTERED already says of physics-lab: 'an aggregate front door rather than a " +
        "single measurement with knobs'. *** THAT REFUSAL IS CORRECT AND IT IS ABOUT THE PAGE. *** Each of its " +
        "twelve SCENES is a single measurement with knobs, and NOT ONE HAD BEEN ASSESSED -- the page-level no " +
        "was read as a scene-level no and the question stopped being asked.",
    nothingIsRegisteredHere:
        "registerProposer REQUIRES AN ADJUDICATOR, and main.js records what happens without one: 'an invented " +
        "adjudicator is A CONTROL THAT CANNOT FAIL', and three of the first seven written there PASSED EVERY " +
        "CANDIDATE and were withdrawn. *** SO THIS FILE REGISTERS NOTHING AND MARKS EVERY ROW `assessed`, NOT " +
        "`measured`. *** An assessment wearing the word measured would be the invented adjudicator one level " +
        "up: a claim about whether a claim can be checked, itself unchecked.",
    eightHaveAKeySittingThere:
        "Eight candidates, four refused with reasons in NOT_REGISTERED's own shape. ORBIT IS THE STRONGEST: " +
        "angular momentum is conserved EXACTLY in a central force, an exact invariant rather than a toleranced " +
        "fit. gyroscope has a closed-form precession rate AND an already-gated instrument to give a second " +
        "opinion; vibrations has an exact frequency sequence; pile's angle of repose adjudicator was ALREADY " +
        "BUILT at v3570 for box3d, including the finding that the detector must be velocity and not displacement.",
};

/**
 * v3595 -- *** THE REPORT'S OWN HEADLINE WENT STALE THE MOMENT THE ROUND SUCCEEDED. *** It printed
 * "registered today 0" and "NOTHING HERE IS REGISTERED" as LITERAL TEXT, true at v3587 and false from v3591
 * on, in the front door whose entire subject is claims about the registry. A number nothing derives is a
 * memory, and this one was a memory about the thing sitting one import away.
 *
 * `listed` is INJECTED rather than imported, and that is not fastidiousness: this module is the triage and
 * knobRegistry is what registers, so importing it here would make the file that describes the registry depend
 * on the registry it describes. The main block below supplies it; a caller that supplies nothing gets a line
 * saying THE REGISTRY WAS NOT CONSULTED, which is a different fact from "nothing is registered" and the two
 * were exactly what this round had to pull apart.
 */
export function reportLines(listed = null) {
    const L = [];
    const joined = listed ? joinRegistered(listed) : null;
    const reg = joined ? joined.filter((r) => r.registered) : null;
    L.push("[labScenes] can the roundhouse work on a lab scene? per scene, with the refusals named");
    L.push("");
    L.push("  scenes " + SCENE_TRIAGE.length + "   candidates " + candidates().length +
           "   refused " + refused().length + "   registered " +
           (reg ? reg.length + (reg.length ? " (" + reg.map((r) => r.scene + " -> " +
                                                                  r.proposerIds.join("+")).join(", ") + ")" : "")
                : "-- REGISTRY NOT CONSULTED"));
    const meas = SCENE_TRIAGE.filter((r) => r.provenance === PROVENANCE.MEASURED);
    const withdrawn = meas.filter((r) => r.responds === "no");
    // *** DERIVED, INCLUDING THE GRAMMAR. *** The first version hard-coded "1 is measured ... and running it is
    // what WITHDREW it", which read as nonsense the moment four rows were measured and only one was withdrawn.
    // A sentence that describes the data has to be built from the data, singular and plural included.
    // *** DERIVED, INCLUDING WHETHER THE HEADLINE IS STILL TRUE. *** "This file registers nothing" is a fact
    // about THIS FILE and stays true forever; "nothing is registered" was a fact about the REGISTRY and stopped
    // being one at v3591. They had been one sentence.
    L.push("  *** THIS FILE REGISTERS NOTHING (registerProposer is not called here)" +
           (reg ? "; " + reg.length + " of these scenes " + (reg.length === 1 ? "is" : "are") +
                  " registered elsewhere." : ".") + " " +
           (SCENE_TRIAGE.length - meas.length) + " rows are `assessed`" +
           (meas.length ? " and " + meas.length + (meas.length === 1 ? " is" : " are") + " `measured` (" +
                          meas.map((r) => r.scene).join(", ") + ")." : ".") +
           (withdrawn.length ? " Running " + withdrawn.map((r) => r.scene).join(", ") + " is what WITHDREW " +
                               (withdrawn.length === 1 ? "it." : "them.") : "") +
           " Candidates on reasoning alone: " +
           SCENE_TRIAGE.filter((r) => r.eligible === "candidate" && r.provenance === PROVENANCE.ASSESSED).length +
           ". ***");
    L.push("");
    for (const r of SCENE_TRIAGE)
        L.push("  " + (r.eligible === "candidate" ? "CAND " : "ref  ") + r.scene.padEnd(12) +
               (r.knob || "-").padEnd(15) + (r.key || r.reason || "").slice(0, 70));
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    // The front door consults the live registry, so the printed count is a reading rather than a memory.
    let listed = null;
    try {
        const P = await import("./proposers.mjs");
        const K = await import("./knobRegistry.mjs");
        P.resetRegistry(); K.registerAll();
        listed = P.listProposers();
    } catch { /* no registry is not an error here: the report says it was not consulted */ }
    for (const l of reportLines(listed)) console.log(l);
    process.exit(0);
}
