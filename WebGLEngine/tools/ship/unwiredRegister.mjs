// WebGLEngine/tools/ship/unwiredRegister.mjs
//
// v3223 -- FINISHED, GATED, AND CONNECTED TO NOTHING: THE FOUR THAT ARE LEFT, EACH WITH ITS DISPOSITION.
//
// graveyard-selfcheck reports modules that export functions nobody calls, and says the right thing about them:
// WIRE IT, OR DELETE IT. The count was TWELVE. Giving five analysis tools a main block and a page (v3219-v3220)
// took eight of them off the list, because a tool you can run is a tool with a caller.
//
// *** THE REMAINING FOUR ARE NOT "NOBODY GOT TO THEM". EACH IS A FINISHED CAPABILITY WITH A GATE PROVING IT
// WORKS, AND EACH HAS A REASON IT IS NOT WIRED THAT SOMEBODY ALREADY ESTABLISHED. *** That reason was living in
// the module's own selfcheck header, where the ratchet could not see it -- so the gate counted four solved
// questions as four open ones, every run, and a number that never moves stops being read.
//
// SO THE RATCHET CHANGES SHAPE, NOT HEIGHT. It counted ORPHANED UTILITIES; it now counts UNEXPLAINED ones, and
// this file is what makes the difference. The bar for an entry is a real blocker or a real decision -- not
// "not got to yet", which is the sentence this register exists to make impossible to hide behind.
//
// *** THE COUNT IS NOT THE POINT AND MOVING IT IS NOT THE GOAL. *** An entry here is a debt with a name on it.
// Deleting a finished, gated capability to make a number fall would be the worst possible reading of this file,
// and wiring one without the rig that can judge the result would be the second worst.

// NAMED *_REGISTRATION DELIBERATELY, AND NOT TO SATISFY A REGEX. graveyard classifies a module as an ANALYSIS
// RECORD -- a legitimate gate-only file rather than debt -- when it exports MEASURED*, *REGISTRATION, *OUTCOMES
// or *_Vnn. That vocabulary already exists for files whose consumer is correctly the gate, which is precisely
// what this is: it records a decision and is read by the ratchet that enforces it. Calling it a registration is
// using the tree's own word for the thing it is, not dressing it up as one.
export const UNWIRED_REGISTRATION = new Map([
    // *** fluid/multigridGPU.js CAME OFF THIS LIST AT v3224 AND ITS ENTRY WAS DELETED, NOT EDITED -- WHICH IS
    // WHAT THE HEADER ABOVE TOLD THE NEXT PERSON TO DO. *** multigrid.html imports GpuMultigrid and shadowSolve
    // to bench them, so the module has a consumer and is no longer an orphaned utility. THE FLUID WIRING
    // DECISION IS STILL OPEN; what changed is that it is no longer BLOCKED ON A MISSING NUMBER. The reasoning
    // did not evaporate with the entry -- it moved to the instrument that resolves it, which is a better home
    // for it than a register of things nobody calls.
    // *** render/ssimWindowed.mjs CAME OFF THIS LIST AT v3693 AND ITS ENTRY WAS DELETED, NOT EDITED -- which is
    // what this file's header tells the next person to do, and the gate caught me the moment it stopped being
    // true. ssim-compare.html imports it, so it has a consumer and is no longer an orphaned utility.
    // *** THE BLOCKER DID NOT EVAPORATE, IT MOVED, AND IT IS NARROWER NOW: the entry said the hold-up was A
    // VERDICT CHANGE, and a PAGE changes no verdict -- it shows the map and picks no threshold. What is still
    // open is whether backendVisualDiff or render-qa should GRADE on the worst window, which would re-fail
    // renders that pass today. That decision lives in the open list, beside the page that makes it visible,
    // which is a better home for it than a register of things nobody calls.
    // v4031 -- TWO ENTRIES ADDED, AND THE FIRST ONE IS A CORRECTION OF MY OWN v4027 SHIP.
    //
    // *** brain/rl/attribution.mjs WAS SHIPPED UNWIRED AT v4027 AND I DID NOT NOTICE FOR FOUR VERSIONS. ***
    // Worse, when v4031 went looking, a grep for "attribution.mjs" returned hits in brain/brain.js AND main.js
    // and I read that as "it is wired". IT IS NOT: every one of those hits is a CHANGELOG COMMENT I wrote about
    // the module. The only real import in the tree is its own selfcheck's. That is this register's own header
    // warning -- "written from the import graph and the file's name rather than from RUNNING THE THING" --
    // reproduced exactly, by the person who had just read the warning.
    ["brain/rl/attribution.mjs", {
        what: "Integrated Gradients (Sundararajan/Taly/Yan ICML 2017) over a trained policy: which input feature moved the action, with COMPLETENESS (attributions sum to F(x)-F(baseline)) as the identity its gate holds -- 4.00x/doubling convergence measured, saliency's saturated-tanh failure measured at 8.2e-8 vs IG's 0.9999",
        blocker: "*** IT NEEDS A CALLER THAT WANTS AN EXPLANATION, AND NOTHING IN THE LIVE PATH ASKS FOR ONE. *** The gated capability is real and complete; what is missing is a decision point. brain.js's solve loop publishes counters and fields, not per-decision diagnostics, and dockPolicy/memoryPolicy are called by evaluate() which scores EPISODES rather than inspecting single steps. Wiring it means choosing WHERE an explanation is surfaced -- a bridge route, a panel, or a training-time log -- and that is a product decision about who reads it, not a mechanical import.",
        needs: "ONE NAMED CONSUMER AND ITS BASELINE. IG is defined relative to a BASELINE and the answer changes with it (attribution.mjs's baselineNote says so); a zero vector is the default and is not obviously the right zero for a docking observation whose features have different natural rest values. So the consumer has to state what 'no input' means for its own observation before the numbers mean anything. surprise.mjs (v4031) is built to be that consumer's trigger -- explainIfSurprising() spends IG only where prediction error says the state is worth explaining -- but it is blocked on its own missing piece, below.",
    }],
    ["brain/rl/surprise.mjs", {
        what: "prediction-error-as-anomaly-flag, lifted as an IDEA from lucas-maes/le-wm: calibrate a threshold from the empirical quantile of in-distribution residuals, then flag transitions the forward model did not predict. MEASURED: a 0.99-quantile threshold gives a 1.10% held-out false-positive rate, detection rises monotonically 0.9% -> 100% with the size of a physics change, and gating IG on it saves 93.9% of gradient evaluations",
        blocker: "*** THERE IS NO FORWARD MODEL IN THIS TREE, AND THAT IS VERIFIED RATHER THAN ASSUMED. *** surprise needs predictFn(observation, action) -> next observation. A grep across brain/ for predictNext, nextState, forwardModel and dynamicsModel returns NOTHING; the brain trains POLICIES (action selection), not dynamics. The envs' step() is the TRUE dynamics rather than a learned model, and a model that IS the system is never surprised by it -- surprise against its own env is identically zero and detects nothing. So the missing piece is a trained next-state predictor, which is a round of work, not a wiring line.",
        needs: "A TRAINED FORWARD MODEL, OR A SECOND SOURCE OF TRANSITIONS TO COMPARE THE SIMULATOR AGAINST. The second is the cheaper and arguably more useful one: with env.step() as predictFn and REAL transitions from elsewhere (rig telemetry, a modified sim, a recorded episode from a different build) as the actual, surprise measures 'the physics stopped behaving the way this simulator expects' -- which is a question this tree already cares about and does not currently have an instrument for. Either path gives the module a caller; neither is a line of glue.",
    }],
    ["brain/policyCache.mjs", {
        what: "generalises the proven brain/flowfieldCache.mjs -- which IS live, used by esPilot.mjs -- from flow fields to policy and tactics decisions",
        blocker: "*** IT IS LOSSY BY CONSTRUCTION AND ITS OWN GATE SAYS SO: it quantises continuous state into buckets, so a hit returns the answer computed for a NEARBY state rather than the one asked about. *** Whether that trade is acceptable is a judgement about the decisions being cached, not about the cache.",
        needs: "A DECISION ABOUT WHICH POLICY CALL IS THE FIRST, AND WHAT `quant` SUITS ITS STATE SPACE. *** v3447 READ THE MODULE AND HALF THIS ENTRY WAS WRONG: it said wiring it everywhere would approve the trade for every caller at once, and NOTHING FORCES GLOBAL ADOPTION -- makeCachedPolicy WRAPS ONE policyFn AND TAKES ITS OWN `quant` (default 0.1), so the trade is opt-in PER CALL SITE by construction. The blocker was reasoning about a shape the thirteen lines of code do not have. *** AND THE REAL DIFFERENCE FROM ITS PROVEN SIBLING IS NOT IN THE BLOCKER AT ALL, WHICH IS THE BETTER FINDING: A FLOW FIELD IS A FIELD AND A POLICY IS A DECISION. Bucketing a field returns a NEARBY FIELD, and smoothness is what makes that defensible -- flowfieldCache is live on exactly that argument. Bucketing a decision that has a BOUNDARY in it returns THE WRONG ACTION, not a nearby one, and the error does not shrink with the bucket size, it just moves. SO THE FIRST CALL SITE SHOULD BE ONE WHOSE OUTPUT IS CONTINUOUS OR WHOSE BOUNDARIES ARE KNOWN, and that is a judgement about the decision rather than about the cache.",
    }],
    ["simulation/RagdollDismember.js", {
        what: "round 307: per-bone damage accumulation and limb severance for active ragdolls, gated on the property that severing a bone severs EXACTLY its subtree",
        blocker: "*** v3232 CORRECTS THIS ENTRY TWICE OVER. I WROTE 'no gameplay path asks for dismemberment... there is nothing to connect it TO'. BOTH HALVES ARE FALSE. *** RagdollIntegration.js has severed limbs since ROUND 306, is live (main.js, ProjectileManager, WeaponSystem, Ragdoll), defaults goreEnabled=true -- and imports this module ZERO times. TWO IMPLEMENTATIONS OF LIMB SEVERANCE, and the crude one is the live one: round 306 throws a RANDOM limb on the KILLING BLOW only; round 307 accumulates damage PER BONE so the limb you actually hit is the one that comes off. THE GOOD ONE IS DEAD AND THE CRUDE ONE IS LIVE -- the greedyMesh finding in a different subsystem. I checked what IMPORTED it and never asked what DID WHAT IT DOES; those are different questions and only the first is mechanical. *** AND v3236 CORRECTED IT AGAIN, WHICH IS THE THIRD READING OF THIS SUBSYSTEM AND THE ONE THAT STUCK: main.js CALLS ragdollIntegration.setEnabled(false) AT STARTUP -- an UNEXPLAINED OVERRIDE of a constructor that sets _enabled = true -- so ROUND 306 IS NOT LIVE EITHER. It is REACHABLE, and until v3236 the only thing in the tree that could switch it on was a line typed into a browser console. THE HONEST STATEMENT IS THAT BOTH ARE DEAD AND ONE HAS A CONSOLE. Four separate readings of this subsystem called round 306 live, INCLUDING THE SENTENCE DIRECTLY ABOVE THIS ONE, and v3447 repeated it to Keith from a stale note two hundred and ten versions after the correction shipped. READ THE TREE, NOT THE RECORD. *** v3236 LEFT THE DEFAULT ALONE ON PURPOSE and shipped a front-door toggle instead: flipping it would be a behaviour change on a system whose reason for being off nobody can produce. WHEN THE REASON IS FOUND, WRITE IT AT THAT LINE; IF THERE IS NONE, DELETE THE LINE RATHER THAN LEAVING A DEFAULT NOBODY CHOSE.",
        needs: "*** NOT A GAMEPLAY DECISION -- A DEMONSTRATION. *** Keith: 'Ragdoll and box3d and dismember are all part of the box3d simulator we have in swek, and really box3d is part of physics lab so there is crossover. NOT THEATRE, BUT DEMONSTRATION. Everything is already constructed and already proved working.' The property is already proved headlessly (severing a bone severs EXACTLY its subtree); what is missing is a canvas where a person can hit a bone and WATCH that be true, which is what this tree does for every other proved property. Note that ragdoll.html runs box3dLoader on a single canvas and never touches ragdollManager, so the Box3D rigged character and the kaiju ragdoll are TWO DIFFERENT RAGDOLLS -- putting the demonstration on that canvas is a second piece of work, not the same one.",
    }],
    // *** tools/ship/corpus.mjs CAME OFF THIS LIST AT v3233 AND ITS ENTRY WAS DELETED, NOT EDITED -- the header
    // above told the next person to do exactly that, and it is the SECOND time this session the antidote has
    // fired on its own round (multigridGPU was the first). reportingTools.mjs names it and toolsBridge runs it,
    // so it has a consumer and is no longer an orphaned utility.
    //
    // AND THE ENTRY WAS WRONG WHEN IT WAS WRITTEN. It said the v3219 main-block treatment "was not applied"; the
    // tool already had a main block, with a DRY-RUN DEFAULT that is more careful than the one I was about to
    // write. THREE OF THE FOUR ENTRIES IN THIS REGISTER HAVE NOW BEEN WRONG ON INSPECTION, and all three were
    // written from the import graph and the file's name rather than from RUNNING THE THING. Whatever remains
    // here should be read with that in mind.
]);

/** True when a module's absence of callers has been examined and written down. */
export function isExplained(rel) { return UNWIRED_REGISTRATION.has(String(rel).replace(/\\/g, "/")); }
