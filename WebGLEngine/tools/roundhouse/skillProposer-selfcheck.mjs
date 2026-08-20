// WebGLEngine/tools/roundhouse/skillProposer-selfcheck.mjs -- v3415
// ---------------------------------------------------------------------------------------------------------------
// GATING A MODEL PATH WITH NO MODEL, by putting the fixture at the NETWORK and nowhere else.
//
// Every layer above the socket is the shipping one: the real ollamaRoleCaller builds the real request, the real
// deviceCritic grades the answer, the real skillTrial runs both arms, and the real skillbook derives the state.
// Only `fetch` is scripted -- which ollamaRoleCaller already takes as `fetchImpl`, for exactly this. That is the
// v3058 move (record the renderer rather than acquire a GPU) pointed at a different absent dependency: the
// questions worth asking here are about WHAT IS SENT and WHAT IS DONE WITH THE REPLY, and neither needs a model.
//
// WHAT A RIG RUN STILL OWES, STATED SO IT CANNOT BE READ OFF THIS FILE: whether a real local model actually
// varies its claims, and whether a hint lowers its malformed rate. This gate proves the path carries a hint and
// refuses a fiction; it cannot prove a number nobody has measured.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { ollamaCaller } from "./ollamaRoleCaller.mjs";
import { makeModelAttempt, sampling, degenerateArms, stableKey, REFUSALS, PROPOSER_KINDS } from "./skillProposer.mjs";
import { trial } from "./skillTrial.mjs";
import { makeStrategy } from "./skillbook.mjs";
import * as D from "./devices.mjs";

let failed = 0;
function check(ok, label, detail = "") {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}
function note(s) { console.log("  ----  " + s); }

const HINT = "Name an observable from the menu the critic gave you.";
const DEVICE = "kerr";

// A scripted model. `plan(i, body)` returns the JSON string the model would have produced for call i.
function scriptedFetch(plan, sink) {
    let i = 0;
    return async (url, init) => {
        const body = JSON.parse(init.body);
        if (sink) sink.push(body);
        const content = plan(i++, body);
        if (content instanceof Error) throw content;
        return { ok: true, json: async () => ({ message: { content } }) };
    };
}
const claimJson = (obs, extra = {}) => JSON.stringify({ mode: "m", claim: { observable: obs, max: 1, ...extra } });

function hintedBody(b) {
    // The hint travels in the USER message, because ollamaRoleCaller JSON-stringifies the payload into it.
    return String(b.messages[1].content).includes(HINT);
}

async function main() {
    console.log("[skillProposer-selfcheck] the proposer's real path -- fixture at the network, nothing above it\n");

    const device = await D.getDevice(DEVICE);
    const obs = device.observables || [];
    check(obs.length > 3, "the fixture device declares a real observable menu", `${DEVICE}: ${obs.length} observables`);
    const strategy = makeStrategy({ id: "gate-" + DEVICE, trigger: "observable-unknown", hint: HINT });
    const questions = Array.from({ length: 24 }, (_, i) => ({ device: DEVICE, i }));

    // ---- 1. THE HINT REACHES THE REQUEST, AND ONLY IN THE TREATED ARM -----------------------------------------
    // If it did not, the two arms would be identical and every trial would return a clean null forever. That is
    // the "system whose checks pass because it does nothing" shape, and it is invisible from the verdict.
    {
        const bodies = [];
        // A model that varies: it names a real observable when hinted and an invented one when not, and the
        // invented name CHANGES per call, so neither arm is degenerate.
        const fetchImpl = scriptedFetch((i, b) => hintedBody(b) ? claimJson(obs[i % obs.length]) : claimJson("notAnObservable" + i), bodies);
        const caller = ollamaCaller({ fetchImpl, model: "gate-model" });
        const { attempt, log } = makeModelAttempt({ device, deviceName: DEVICE, caller });
        const res = await trial({ strategy, questions, attempt });

        const withHint = bodies.filter(hintedBody).length, without = bodies.length - withHint;
        check(withHint === questions.length && without === questions.length,
              "!! *** the hint text reaches the model's request body in the treated arm and NOWHERE ELSE ***",
              `${bodies.length} calls: ${without} without the hint, ${withHint} with it. A DROPPED HINT WOULD MAKE BOTH ARMS IDENTICAL AND EVERY TRIAL A TIDY NULL`);
        check(res.ok && res.evidence.before > res.evidence.after,
              "a real effect run through the whole shipping stack comes back as a drop",
              `before ${res.evidence.before.toFixed(3)} -> after ${res.evidence.after.toFixed(3)}, state ${res.state}`);
        check(log.length === questions.length * 2, "the ledger records every call, both arms", `${log.length} rows`);
        const s = sampling(log);
        check(degenerateArms(s).length === 0, "a model that varies is NOT flagged degenerate -- the rule discriminates",
              `control ${s.control.distinct}/${s.control.n} distinct, treated ${s.treated.distinct}/${s.treated.n}`);
    }

    // ---- 2. THE SABOTAGE: A CALLER THAT DROPS THE HINT ----------------------------------------------------------
    // Same model, same questions; only the transport forgets the hints. The trial must stop finding an effect.
    {
        const fetchImpl = scriptedFetch((i, b) => hintedBody(b) ? claimJson(obs[i % obs.length]) : claimJson("notAnObservable" + i));
        const real = ollamaCaller({ fetchImpl, model: "gate-model" });
        const deaf = async (role, payload) => real(role, { ...payload, hints: undefined });
        const { attempt } = makeModelAttempt({ device, deviceName: DEVICE, caller: deaf });
        const res = await trial({ strategy, questions, attempt });
        check(res.ok && Math.abs(res.drop) < 1e-9,
              "!! *** with the hint dropped in transit the SAME fixture reports NO effect ***",
              `drop ${res.drop.toFixed(4)}, state ${res.state} -- which is why check 1 asserts the body and not the verdict`);
    }

    // ---- 3. THE DEGENERATE ARM: A TEMPERATURE-ZERO MODEL --------------------------------------------------------
    // The dangerous direction is not the null. A control that is malformed every time beside a treated arm that
    // is well-formed every time gives a large z off ONE observation per arm, and the word PROVEN.
    {
        const fetchImpl = scriptedFetch((i, b) => hintedBody(b) ? claimJson(obs[0]) : claimJson("notAnObservable"));
        const caller = ollamaCaller({ fetchImpl, model: "gate-model" });
        const { attempt, log } = makeModelAttempt({ device, deviceName: DEVICE, caller });
        const res = await trial({ strategy, questions, attempt });
        const s = sampling(log);
        const bad = degenerateArms(s);
        note(`the constant model: before ${res.evidence.before.toFixed(3)} after ${res.evidence.after.toFixed(3)}, state ${res.state}`);
        check(res.state === "PROVEN",
              "!! *** the fiction is INVISIBLE FROM THE VERDICT: a constant model reads PROVEN ***",
              `z is computed over ${questions.length} copies of one observation per arm`);
        check(bad.length === 2 && bad.includes("control") && bad.includes("treated"),
              "!! *** and BOTH arms are named degenerate, which is what refuses it ***",
              `control ${s.control.distinct}/${s.control.n}, treated ${s.treated.distinct}/${s.treated.n}`);
    }

    // ---- 4. THE SAME CHECK CATCHES AN UNPARSEABLE MODEL, WHICH IS A DIFFERENT FAILURE ----------------------------
    // ollamaRoleCaller's last resort is a FIXED claim, to keep the roundhouse loop alive. Correct there; here it
    // would make a model that never answered look like a tidy null result.
    {
        const fetchImpl = scriptedFetch(() => "I am a large language model and I cannot do that.");
        const caller = ollamaCaller({ fetchImpl, model: "gate-model" });
        const { attempt, log } = makeModelAttempt({ device, deviceName: DEVICE, caller });
        const res = await trial({ strategy, questions, attempt });
        const s = sampling(log);
        check(res.ok && Math.abs(res.drop) < 1e-9 && degenerateArms(s).length === 2,
              "!! *** an unparseable model produces a TIDY NULL, and the same distinctness rule refuses it ***",
              `drop ${res.drop.toFixed(4)}, state ${res.state}, distinct ${s.control.distinct}/${s.control.n} -- the fallback claim is a constant`);
    }

    // ---- 5. AN UNREACHABLE HOST IS A REFUSAL, NOT A RESULT --------------------------------------------------------
    {
        const fetchImpl = scriptedFetch(() => new Error("ECONNREFUSED 127.0.0.1:11434"));
        const caller = ollamaCaller({ fetchImpl, model: "gate-model" });
        const { attempt } = makeModelAttempt({ device, deviceName: DEVICE, caller });
        let caught = null;
        try { await trial({ strategy, questions, attempt }); } catch (e) { caught = e; }
        check(caught && caught.refusal === REFUSALS.CALLER_FAILED,
              "an unreachable model throws a NAMED refusal rather than returning a rate",
              caught ? caught.message.slice(0, 90) : "no throw");
    }

    // ---- 6. THE WALL-CLOCK BUDGET ---------------------------------------------------------------------------------
    // 2n model calls at seconds each is how a URL bar hangs a server. v3398 clamped n for that reason; a model
    // path needs the clock too, because the cost per call is no longer microseconds.
    {
        let t = 0;
        const fetchImpl = scriptedFetch((i) => claimJson(obs[i % obs.length]));
        const caller = ollamaCaller({ fetchImpl, model: "gate-model" });
        const { attempt } = makeModelAttempt({ device, deviceName: DEVICE, caller, deadlineMs: 50, now: () => (t += 10) });
        let caught = null;
        try { await trial({ strategy, questions, attempt }); } catch (e) { caught = e; }
        check(caught && caught.refusal === REFUSALS.BUDGET,
              "a trial that outruns its wall-clock budget is refused with the call count, not truncated",
              caught ? caught.message.slice(0, 90) : "no throw");
    }

    // ---- 7. THE CRITIC IS THE SHIPPING ONE, AND THE KEY IS ORDER-INSENSITIVE ---------------------------------------
    {
        const fetchImpl = scriptedFetch((i) => i % 2 ? claimJson(obs[0]) : JSON.stringify({ claim: { observable: obs[0] } }));
        const caller = ollamaCaller({ fetchImpl, model: "gate-model" });
        const { attempt } = makeModelAttempt({ device, deviceName: DEVICE, caller });
        const v = await attempt({ i: 0 }, []);            // no comparator
        const w = await attempt({ i: 1 }, []);            // observable + max
        check(v.issues.some((s) => /comparator/i.test(s)) && w.ok,
              "a claim with no comparator is malformed and one with a real observable is not -- deviceCritic, unmodified",
              `${v.issues.length} issue(s) then ${w.issues.length}`);
        check(stableKey({ a: 1, b: 2 }) === stableKey({ b: 2, a: 1 }) && stableKey({ a: 1 }) !== stableKey({ a: 2 }),
              "two spellings of one claim count as ONE distinct answer, two different claims as two");
    }

    // ---- 8. THE SHIPPED DEFAULT IS NOT THE DEGENERATE SETTING ------------------------------------------------------
    // Measured off the request the shipping caller builds, not read from its header: the proposer role goes out
    // above temperature 0, so the refusal above is a GUARD against a reproducibility setting rather than a wall
    // in front of the normal path.
    {
        const bodies = [];
        const fetchImpl = scriptedFetch((i) => claimJson(obs[0]), bodies);
        await ollamaCaller({ fetchImpl })("proposer", { device: DEVICE, observables: obs, question: { i: 0 } });
        await ollamaCaller({ fetchImpl })("evaluator", { device: DEVICE, observables: obs });
        check(bodies[0].options.temperature > 0 && bodies[1].options.temperature === 0,
              "!! *** the shipping proposer already runs above temperature 0; the evaluator runs at 0 ***",
              `proposer ${bodies[0].options.temperature}, evaluator ${bodies[1].options.temperature} -- so a degenerate arm means somebody pinned it, and that is worth refusing rather than defaulting`);
        check(PROPOSER_KINDS.includes("mock") && PROPOSER_KINDS.includes("ollama"),
              "the mock is KEPT beside the model, not replaced -- it is the only proposer whose effect size is known");
    }

    console.log(failed ? `\n[skillProposer-selfcheck] ${failed} FAILED` : "\n[skillProposer-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[skillProposer-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
