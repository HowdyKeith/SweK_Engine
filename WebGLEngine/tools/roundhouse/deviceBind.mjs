// tools/roundhouse/deviceBind.mjs
//
// v2803 -- the roundhouse, generalized to ANY lab device. roundhouse.mjs stays exactly as it is (the LBM rig keeps
// working untouched); this module adds the seam that lets other physics devices plug into the same
// propose -> build(real sim) -> crystallize(physics) -> evaluate loop.
//
// A DEVICE is two functions and a claim vocabulary:
//   { name,                        -- for reports (the conformance lesson: say WHICH world was judged)
//     observables,                 -- the measurable names the proposer may claim about (goes into its prompt)
//     build(hyp, base) -> obs,     -- run the REAL simulation; return measured numbers. Never a model. May be async.
//     defaults(hyp) -> hyp }       -- optional: clamp/fill a sloppy hypothesis so it still builds (local-model aid)
//
// Crystallization is shared: numericVerdict() understands a small generic claim schema so new devices register
// observables instead of growing a switch statement:
//   { observable, equals }                     -- boolean/exact match
//   { observable, target, tol }                -- |measured - target| <= tol
//   { observable, max } / { observable, min }  -- threshold
//   { observable, withinBracket }              -- obs must carry <observable>Bracket, width <= withinBracket
// The verdict never sees the evaluator's opinion -- same anti-echo-chamber contract as roundhouse.mjs.

// ---- generic crystallization check on the MEASURED observable ----------------------------------------------------
import { stepProgress } from "./stepProgress.mjs";
import { checkKnobs, checkMode } from "./knobGate.mjs";
import { soundnessAt } from "./soundness.mjs";   // v3130 -- the operating point may be somewhere the instrument does not work   // v3129 -- the register is DERIVED from device.defaults()

export function numericVerdict(claim, obs) {
    if (!claim || !claim.observable) return { done: false, reason: "no-measurable-claim" };
    if (obs && obs.error) return { done: false, reason: obs.error };
    const name = claim.observable;
    const measured = obs ? obs[name] : undefined;

    if ("equals" in claim) {
        if (measured === undefined) return { done: false, reason: "observable-missing: " + name };
        return { done: measured === claim.equals, measured, claimed: claim.equals };
    }
    if ("target" in claim) {
        if (typeof measured !== "number" || !Number.isFinite(measured))
            return { done: false, reason: "observable-not-numeric: " + name, measured };
        const d = Math.abs(measured - claim.target);
        return { done: d <= (claim.tol ?? 0), measured, target: claim.target, delta: d };
    }
    if ("max" in claim) {
        if (typeof measured !== "number") return { done: false, reason: "observable-not-numeric: " + name };
        return { done: measured <= claim.max, measured, max: claim.max };
    }
    if ("min" in claim) {
        if (typeof measured !== "number") return { done: false, reason: "observable-not-numeric: " + name };
        return { done: measured >= claim.min, measured, min: claim.min };
    }
    if ("withinBracket" in claim) {
        const br = obs ? obs[name + "Bracket"] : null;
        const width = Array.isArray(br) ? Math.abs(br[1] - br[0]) : Infinity;
        return { done: width <= claim.withinBracket, measured, bracketWidth: width };
    }
    return { done: false, reason: "no-comparator-in-claim" };
}

// ---- THE GENERIC LOOP. Identical shape to roundhouse(); only the device is injected. -----------------------------
// v2812b -- onRound is an OPTIONAL seam added on fold-in so a caller can watch the loop crystallise round by
// round instead of only seeing the transcript afterwards. It is awaited, so a slow observer cannot interleave
// with the next round, and it is wrapped: an observer that throws must not kill an experiment that is otherwise
// running fine. Nothing else changed -- omit it and the function behaves exactly as before.
/**
 * v3034 -- THE REPLAY CACHE IS WIRED. actionCache.mjs was written at v3014 (Stagehand's idea: the model
 * discovers the answer once, then it is replay) and NEVER CALLED BY ANYTHING. The graveyard census caught it,
 * and it was the FIFTH module this session I shipped that nobody could reach.
 *
 * The safety rule is unchanged and is why this is not a memo table: a cached claim is RE-MEASURED against the
 * real device by the SAME verifier a fresh run uses. A hit is a genuine pass that cost no inference. A miss
 * falls through to the model and SAYS SO. There is no path where a stale entry is believed.
 *
 * Opt-in via `cache`, because a caller that has not thought about staleness should not get caching by accident.
 */
export async function roundhouseDevice({ callModel, device, question, maxRounds = 6, base = {}, onRound = null, cache = null }) {
    if (cache && cache.entry) {
        const { tryReplay, REPLAY } = await import("./actionCache.mjs");
        const rp = await tryReplay(cache.entry, async (claim) => device.build({ ...base, ...(claim.args || {}) }), numericVerdict);
        if (rp.verdict === REPLAY.HIT) {
            return { crystallized: true, device: device.name, rounds: 0, claim: rp.claim, verdict: rp.roundhouseVerdict,
                     observable: rp.observable, history: [], replayed: true, why: rp.why };
        }
        // REJECTED / MISS / UNUSABLE all fall through to the model, and the reason travels so a reader can see
        // whether the cache was stale or simply absent -- those are different facts with different fixes.
        base = { ...base, _cacheOutcome: rp.verdict, _cacheWhy: rp.why || null };
    }

    const history = [];
    for (let round = 0; round < maxRounds; round++) {
        let hyp = await callModel("proposer", { question, device: device.name, observables: device.observables, history });
        // v3129 -- REFUSE AN UNDECLARED KNOB BEFORE CLAMPING. MEASURED: defaults() keeps a knob the device
        // never declared, the sim never reads it, and NOTHING RAISES -- so a model that invents a knob gets a
        // clean run and a number, AND ATTRIBUTES THAT NUMBER TO A CHANGE THAT NEVER HAPPENED. Dropping it
        // silently is no better; the fault is that the agent is never told its instruction did nothing.
        // v3144 -- THE MODE BEFORE THE KNOBS. An undeclared mode means the device ran DIFFERENT PHYSICS under
        // the requested name, which makes every knob question downstream meaningless -- there is no point
        // asking whether `b` was declared for an experiment that never ran.
        const modeCheck = checkMode(device, hyp && hyp.mode);
        if (!modeCheck.ok) return { done: false, reason: "undeclared-mode", detail: modeCheck.why, ran: modeCheck.declared };
        const knobCheck = checkKnobs(device, hyp);
        if (!knobCheck.ok) return { done: false, reason: "undeclared-knob", detail: knobCheck.why, unknown: knobCheck.unknown };
        if (device.defaults) hyp = device.defaults(hyp);                         // clamp sloppy proposals (local models)
        // v3130 -- EVALUATED AFTER THE CLAMP, ON PURPOSE. defaults() fills the config the simulation will
        // actually receive, and the assumptions are predicates over THAT -- checking the raw proposal would
        // judge an operating point the device is not going to run. Three verdicts, and UNDECLARED IS NOT SOUND.
        const sound = soundnessAt(device.registryName || device.name, hyp && hyp.mode, (hyp && hyp.config) || {});
        const observable = await device.build(hyp, base);                        // run the REAL sim (may be async -- wasm devices instantiate on first build)
        const verdict = numericVerdict(hyp.claim, observable);                   // PHYSICS decides the exit
        const critique = await callModel("evaluator", { hyp, observable, verdict });
        // v3130 -- THE SOUNDNESS TRAVELS WITH THE ROUND, not only with the final answer. A run that
        // crystallises at an UNSOUND operating point crystallised on a number the instrument does not stand
        // behind, and reading that off the last round alone would hide the ones before it.
        history.push({ round, hyp, observable, verdict, critique, sound });
        if (onRound) { try { await onRound({ round, hyp, observable, verdict, critique, done: !!verdict.done }); } catch { /* an observer must never break the experiment */ } }
        if (verdict.done) {
            // v3007 -- the STEP trajectory, not only the landing. "crystallized in 4 rounds" is the same
            // sentence whether every escalation improved the answer or three of them made it worse.
            // *** CRYSTALLIZED IS NOT THE SAME AS TRUSTWORTHY. *** The four criteria can pass at a point where
            // the instrument's own declared conditions do not hold -- v3101's third verdict exactly -- so the
            // result carries the soundness rather than burying it in history.
            return { crystallized: true, device: device.name, rounds: round + 1, claim: hyp.claim, verdict, observable, history,
                     sound, soundAtPoint: sound.verdict, progress: stepProgress(history) };
        }
    }
    return { crystallized: false, device: device.name, reason: "maxRounds-without-crystallizing", rounds: maxRounds, history,
             progress: stepProgress(history) };
}

// ---- history compaction for small-context local models -----------------------------------------------------------
// Keep only the last `keep` rounds and only the NUMBERS (claim, measured verdict fields) -- the prose critique is the
// first thing to cut when num_ctx is tight; the numeric trail is what steers a proposer.
export function compactHistory(history, keep = 3) {
    return history.slice(-keep).map((h) => ({
        round: h.round,
        claim: h.hyp && h.hyp.claim,
        params: h.hyp && (h.hyp.config || { g: h.hyp.g, r0: h.hyp.r0 }),
        verdict: h.verdict && { done: h.verdict.done, measured: h.verdict.measured, delta: h.verdict.delta, reason: h.verdict.reason },
    }));
}
