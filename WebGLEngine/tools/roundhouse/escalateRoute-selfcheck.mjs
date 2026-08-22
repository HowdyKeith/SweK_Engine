// tools/roundhouse/escalateRoute-selfcheck.mjs
//
// Run: node tools/roundhouse/escalateRoute-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves the cheap->verify->escalate router routes on the VERIFIER, not on hope. Mock models and a mock verifier
// drive it headless -- no API key, the same injectable seam roundhouse uses. The load-bearing line is
// `if (pass)` after `verify(...)`: SABOTAGE is to accept the cheap model without consulting the verifier
// (`const pass = true`), and check "escalates when the cheap model fails the verifier" then FAILS -- because a
// router that never escalates is just the cheap model with extra steps.

import { escalateRoute, savingsVsStrongest } from "./escalateRoute.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// three mock models, cheap -> strong, each with a cost; the mock returns a tagged output per model
const CHAIN = [{ name: "cheap", cost: 1 }, { name: "mid", cost: 4 }, { name: "strong", cost: 20 }];
const callModel = async (name, task) => ({ by: name, task: task.id });

// a verifier that only accepts output from models at or above `bar` -- stands in for a SweK gate that the cheap
// model's answer fails and a stronger one passes
const verifierThatNeeds = (bar) => {
    const rank = { cheap: 0, mid: 1, strong: 2 };
    return async (output) => rank[output.by] >= rank[bar];
};

// 1. the cheapest model is enough -> no escalation, cheapest cost
let r = await escalateRoute({ task: { id: "t1" }, chain: CHAIN, callModel, verify: verifierThatNeeds("cheap") });
ok("!! the cheapest model that passes the verifier is the one chosen", r.chosen === "cheap" && r.verified && r.escalations === 0,
   `chosen=${r.chosen} verified=${r.verified} escalations=${r.escalations}, cost=${r.totalCost}`);

// 2. the cheap model fails the verifier -> ESCALATE until one passes (this is the check the sabotage kills)
r = await escalateRoute({ task: { id: "t2" }, chain: CHAIN, callModel, verify: verifierThatNeeds("strong") });
ok("!! it ESCALATES when the cheap model fails the verifier", r.chosen === "strong" && r.verified && r.escalations === 2,
   `chosen=${r.chosen} verified=${r.verified} escalations=${r.escalations} -- climbed cheap->mid->strong`);
ok("...and it stops at the FIRST passer, not the strongest by default", r.attempts.length === 3 && r.attempts[0].model === "cheap",
   `walked ${r.attempts.map((a) => a.model).join("->")}`);

// mid is enough -> stops at mid, does not waste the strong call
r = await escalateRoute({ task: { id: "t3" }, chain: CHAIN, callModel, verify: verifierThatNeeds("mid") });
ok("...and it does NOT overpay -- stops at mid when mid passes", r.chosen === "mid" && r.escalations === 1 && r.totalCost === 5,
   `chosen=${r.chosen} cost=${r.totalCost} (cheap 1 + mid 4)`);

// 3. NOBODY passes -> return the strongest, flagged unverified, not a silent lie
const verifyImpossible = async () => false;
r = await escalateRoute({ task: { id: "t4" }, chain: CHAIN, callModel, verify: verifyImpossible });
ok("!! when NOBODY passes, the answer is returned FLAGGED unverified, not trusted", r.verified === false && r.escalationExhausted === true && r.chosen === "strong",
   `verified=${r.verified} exhausted=${r.escalationExhausted} chosen=${r.chosen}`);

// 4. the money question -- routing saved real cost vs always calling the strongest
r = await escalateRoute({ task: { id: "t5" }, chain: CHAIN, callModel, verify: verifierThatNeeds("cheap") });
const s = savingsVsStrongest(r, CHAIN);
ok("...and routing saved cost vs always calling the strongest", s.spent === 1 && s.ifAlwaysStrongest === 20 && s.saved === 19,
   `spent ${s.spent}, strongest-always ${s.ifAlwaysStrongest}, saved ${s.saved}`);

// 5. a router with no verifier is refused -- routing without a verifier is guessing
let threw = false;
try { await escalateRoute({ task: { id: "t6" }, chain: CHAIN, callModel, verify: null }); } catch { threw = true; }
ok("!! routing WITHOUT a verifier is refused, not silently allowed", threw,
   "a route with no verifier is just the cheap model with extra steps -- the module throws rather than pretend");

// 6. sabotage recognition: a verifier that always says yes collapses escalation to the cheap model always
const verifyAlwaysYes = async () => true;
r = await escalateRoute({ task: { id: "t7" }, chain: CHAIN, callModel, verify: verifyAlwaysYes });
ok("...and it PROVES the verifier is load-bearing: a yes-to-everything verifier never escalates", r.chosen === "cheap" && r.escalations === 0,
   "if verify always passes, cheap always wins -- which is exactly what breaks if the `if (pass)` check is removed");


// ---- v3108: THE CONFIDENCE PRIOR, AND THE ASYMMETRY THAT KEEPS IT A PRIOR ------------------------------------
// cactus-hybrid's on-device models score their own answers for cloud handoff. That is inference, not
// verification -- the same thing frugon does, and the reason this router exists. So confidence is allowed to
// escalate and never to accept. These four checks are the whole argument, and the third is the one that must
// never go green by accident.
{
    const chain = [{ name: "tiny", cost: 1 }, { name: "mid", cost: 5 }, { name: "big", cost: 20 }];
    const rig = (goodFrom) => {
        let calls = 0;
        return {
            calls: () => calls,
            callModel: async (n) => ({ from: n }),
            verify: async (o) => { calls++; return chain.findIndex((m) => m.name === o.from) >= goodFrom; },
        };
    };

    let g = rig(1);
    let r = await escalateRoute({ task: "t", chain, callModel: g.callModel, verify: g.verify });
    ok("no confidenceOf leaves the router exactly as it was", r.chosen === "mid" && r.verified && g.calls() === 2,
       "the prior is opt-in: absent it, every model is called and checked in cost order as before");

    g = rig(1);
    r = await escalateRoute({ task: "t", chain, callModel: g.callModel, verify: g.verify,
        confidenceOf: async (o) => (o.from === "tiny" ? 0.1 : 0.9), skipVerifyBelow: 0.5 });
    ok("!! a LOW self-report skips the gate and escalates early",
       r.chosen === "mid" && g.calls() === 1 && r.attempts[0].skippedVerify === true,
       "tiny doubted itself, so the gate was never run on it -- one verify cycle saved, and in this tree a " +
       "verify cycle is a real SweK gate rather than a cheap comparison. Being wrong about this costs money and " +
       "never correctness, which is why it is the direction that is allowed");

    g = rig(2);
    r = await escalateRoute({ task: "t", chain, callModel: g.callModel, verify: g.verify,
        confidenceOf: async () => 1.0, skipVerifyBelow: 0.5 });
    ok("!! SABOTAGE: a model reporting confidence 1.0 on a WRONG answer is still rejected",
       r.chosen === "big" && r.verified === true && g.calls() === 3,
       "tiny and mid both claimed perfect confidence and both failed the gate, and the router escalated past " +
       "them anyway. THIS IS THE PROPERTY: there is no branch in which a high score reaches verified:true " +
       "without verify() having said so. If someone later adds 'confident enough, skip the check', this check " +
       "goes red -- and that addition is exactly the frugon mistake with a local model attached");

    g = rig(9);
    r = await escalateRoute({ task: "t", chain, callModel: g.callModel, verify: g.verify,
        confidenceOf: async () => 0.0, skipVerifyBelow: 0.5 });
    ok("...and the LAST model is never skipped, however low its confidence",
       g.calls() === 1 && r.escalationExhausted === true && r.verified === false,
       "skipping is only worth doing when something stronger remains. At the end of the chain the useful move " +
       "is to actually check the answer, and then say verified:false honestly rather than quietly");
}

console.log(fails ? "\nescalateRoute-selfcheck: " + fails + " FAILED" : "\nescalateRoute-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
