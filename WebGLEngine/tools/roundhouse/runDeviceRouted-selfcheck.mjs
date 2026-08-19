// tools/roundhouse/runDeviceRouted-selfcheck.mjs
//
// Run: node tools/roundhouse/runDeviceRouted-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2889 -- the front door meets the alchemist stack. withCritic existed since v2850 and the outcome taxonomy since
// v2827, but run-device.mjs still offered only bare callers -- the CLI could not exercise the very machinery built
// to make weak local models usable, and nothing could measure critic-gain without writing code. Three additions,
// each held here: --critic (wrap any caller with the deterministic critic), --chain cheap,strong (tiered
// escalation through the WHOLE loop, first crystallising tier wins, exhaustion is stated not hidden), and
// --critic-bench N (the v2850 prediction as a command: malformed falls, refused must not).

import { runDevice, runRoutedDevice, criticBench, makeSloppyMock, parseArgs } from "./run-device.mjs";
import { getDevice } from "./devices.mjs";
import { roundhouseDevice } from "./deviceBind.mjs";
import { withCritic } from "./deviceCritic.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the flags parse ------------------------------------------------------------------------------------------
{
    const o = parseArgs(["blackhole", "mock", "--critic", "--chain", "qwen2.5:3b,qwen2.5:7b", "--critic-bench", "8"]);
    ok("--critic, --chain and --critic-bench parse", o.critic === true && o.chain.length === 2 && o.criticBench === 8,
        JSON.stringify({ critic: o.critic, chain: o.chain, bench: o.criticBench }));
}

// ---- 2. the sloppy mock is sloppy in exactly the three mechanical ways ------------------------------------------
{
    const m = makeSloppyMock("blobkelvin");
    const a = await m("proposer", {});
    const b = await m("proposer", {});
    const c = await m("proposer", {});
    ok("!! the sloppy mock cycles misspelled / target-without-tol / no-comparator",
        !["boilingKelvin"].includes(a.claim.observable) && b.claim.tol === undefined && b.claim.target !== undefined &&
        c.claim.target === undefined && c.claim.max === undefined && c.claim.min === undefined,
        "each is a MECHANICAL failure -- the class the deterministic critic exists to fix");
    const revised = await m("proposer", { critiques: ["the menu"] });
    ok("...and revises to the demo claim when handed a critique", revised.claim.observable === "boilingKelvin");
}

// ---- 3. --critic turns malformed into crystallised WITHOUT touching refusal -------------------------------------
{
    const dev = await getDevice("blobkelvin");
    const bare = await roundhouseDevice({ callModel: makeSloppyMock("blobkelvin"), device: dev, question: "q", maxRounds: 2 });
    ok("bare sloppy proposer never crystallises (malformed all the way down)", bare.crystallized === false);
    const wrapped = await roundhouseDevice({ callModel: withCritic(makeSloppyMock("blobkelvin"), dev), device: dev, question: "q", maxRounds: 2 });
    ok("!! the same proposer crystallises once the critic hands back the observable menu", wrapped.crystallized === true,
        "measured " + wrapped.verdict.measured.toFixed(4) + " -- mechanics repaired, physics unchanged");
    // and a WRONG claim stays wrong through the critic -- it repairs shape, never truth
    const wrong = async (role, p) => role === "proposer" ? { mode: "calibration", claim: { observable: "boilingKelvin", target: 500, tol: 1 } } : { reading: "w" };
    const still = await roundhouseDevice({ callModel: withCritic(wrong, dev), device: dev, question: "q", maxRounds: 2 });
    ok("!! a well-formed WRONG claim still refuses under the critic -- a critic cannot make a wrong claim true",
        still.crystallized === false);
}

// ---- 4. tiered escalation: cheapest verified tier wins; exhaustion is stated ------------------------------------
{
    const weak = async (role) => role === "proposer" ? { mode: "calibration", claim: { observable: "boilingKelvin", target: 500, tol: 1 } } : { reading: "w" };
    const strong = async (role) => role === "proposer" ? { mode: "calibration", claim: { observable: "boilingKelvin", target: 373.15, tol: 1e-6 } } : { reading: "s" };
    const out = await runRoutedDevice(
        { deviceName: "blobkelvin", chain: ["weak", "strong"], rounds: 2, question: "q", makeTierCaller: (m) => (m === "weak" ? weak : strong) },
        () => {});
    ok("!! the weak tier's wrong claim is refused by the PHYSICS and the chain escalates",
        out.attempts[0].crystallized === false && out.attempts[1].crystallized === true && out.crystallized === true,
        JSON.stringify(out.attempts));
    const exhausted = await runRoutedDevice(
        { deviceName: "blobkelvin", chain: ["weak", "weak2"], rounds: 2, question: "q", makeTierCaller: () => weak },
        () => {});
    ok("!! a chain nobody survives says escalationExhausted rather than pretending",
        exhausted.crystallized === false && exhausted.escalationExhausted === true,
        "the answer is unverified and the result SAYS so -- same contract as escalateRoute.mjs");
}

// ---- 5. the critic bench measures the v2850 prediction -----------------------------------------------------------
{
    const { bare, critic } = await criticBench({ deviceName: "blobkelvin", criticBench: 4, question: "q" }, () => {});
    ok("!! MALFORMED falls under the critic (the prediction's first half)", critic.malformed < bare.malformed,
        bare.malformed + " -> " + critic.malformed);
    ok("!! REFUSED does not rise (the prediction's second half -- truth stays with the physics)",
        critic.refused <= bare.refused, bare.refused + " -> " + critic.refused);
    ok("...and the surrendered malformed runs became crystallised, not errors",
        critic.crystallised >= bare.crystallised && critic.simError === 0 && critic.callerError === 0);
}

// ---- 6. plain runDevice with --critic still honours the base caller for non-proposer roles ----------------------
{
    const lines = [];
    const out = await runDevice(parseArgs(["blackhole", "mock", "--critic"]), (s) => lines.push(s));
    ok("--critic on the plain path crystallises the demo and announces the armed critic",
        out.crystallized === true && lines.some((l) => l.includes("critic armed")));
}

console.log();
if (fails) { console.log("runDeviceRouted-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("runDeviceRouted-selfcheck: all checks pass");
