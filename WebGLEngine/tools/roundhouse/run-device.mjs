// tools/roundhouse/run-device.mjs
//
// v2804 -- the command-line front door to the roundhouse. Any registered device, any caller:
//
//   node tools/roundhouse/run-device.mjs blackhole mock
//   node tools/roundhouse/run-device.mjs box3d mock --hyp '{"mode":"hash","claim":{"observable":"deterministic","equals":true}}'
//   node tools/roundhouse/run-device.mjs blackhole ollama --model qwen2.5:7b --question "Where is the ISCO?"
//   node tools/roundhouse/run-device.mjs box3d anthropic --model claude-sonnet-4-6
//
// mock       -- proposals from --hyp (or the device's demo claim); no model, runs anywhere, exercises the real sim.
// ollama     -- local model via ollamaCaller (structured outputs, clamps, compacted history). --host to point away
//               from localhost:11434.
// anthropic  -- @anthropic-ai/sdk with ANTHROPIC_API_KEY in the environment (the rig).
//
// Exit code 0 iff the loop crystallized. Every round prints claim -> measured -> verdict, so a transcript of the
// run IS the experiment log.

import { fileURLToPath } from "node:url";
import { roundhouseDevice } from "./deviceBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { ollamaCaller } from "./ollamaRoleCaller.mjs";
// v2889 -- the front door finally meets the alchemist stack: withCritic (v2850) wraps any caller with the
// deterministic claim critic; runOne (v2827) supplies the outcome taxonomy that can MEASURE whether it helped.
import { withCritic } from "./deviceCritic.mjs";
import { runOne } from "./modelBench.mjs";
// v2890 -- policies in the proposer seat (probe pilot mode): reflex, brain-format MLP, or the live GPU Brain bridge.
import { policyCaller, reflexPilotPolicy, brainPilotPolicy, brainBridgePolicy } from "./policyPilot.mjs";

// demo claims: true statements each device can crystallize quickly, so `mock` runs green out of the box.
export const DEMO_HYPS = {
    // v2814 -- demos for the three lab instruments wired in as devices. Each is a TRUE claim the instrument can
    // settle in one round, so `mock` runs green and the page works with no model at all.
    optics: { mode: "airy", claim: { observable: "airyRingErrFrac", max: 0.01 } },          // Rayleigh 1.22 falls out of the propagator
    // v3487 -- refscan runs its GRADED mode here and only its graded mode. An indicator claim would be a claim
    // about a scene with no right answer, and the demo is the first thing a visitor presses.
    refscan: { mode: "furnace", claim: { observable: "worstAlbedoErrFrac", max: 1e-12 } },
    // v3496 -- the sphere mode, because its answer key is a CLOSED-FORM INTERSECTION that knows nothing
    // about marching -- the cheapest honest claim this device can settle in one round.
    sdfmarch: { mode: "sphere", claim: { observable: "worstAgainstClosedForm", max: 1e-6 } },
    kerr: { mode: "limit", claim: { observable: "schwarzShadowErr", max: 1e-9 } },          // at a=0 it IS the Schwarzschild module
    ct: { mode: "parallel", claim: { observable: "fbpCorr", min: 0.95 } },                  // filtered back-projection recovers our own phantom
    interferometer: { mode: "recover", claim: { observable: "relativeRms", max: 1e-9 } },   // recovery from fringes alone, relative to the feature it recovered
    windtunnel: { mode: "drag", claim: { observable: "liftToDragRatio", max: 0.05 } },      // a symmetric body makes ~no lift
    thermal: { mode: "diffuse", claim: { observable: "alphaErrFrac", max: 0.05 } },        // diffusivity EMERGES from the relaxation time
    pipe3d: { mode: "profile", claim: { observable: "profileRms", max: 0.10 } },            // the paraboloid Hagen wrote down in 1840
    geometry: { mode: "sphere", claim: { observable: "watertight", equals: true } },        // a closed manifold, every edge shared by exactly two triangles
    kh: { mode: "neutral", claim: { observable: "neutralRespected", equals: true } },       // unstable inside Michalke's band, stable outside it
    born: { mode: "scaling", claim: { observable: "errorScalingExponent", target: 2, tol: 0.05 } },  // the error is QUADRATIC in phase
    ising: { mode: "order", claim: { observable: "magnetisationErrFrac", max: 0.03 } },    // Monte Carlo tracks Yang's exact curve
    kepler: { mode: "conserve", claim: { observable: "energyGrowthRatio", target: 1, tol: 0.05 } },  // symplectic energy error is BOUNDED
    quantum: { mode: "well", claim: { observable: "ratio21", target: 4, tol: 0.01 } },       // the n^2 signature: E2/E1 must be 4
    chaos: { mode: "lyapunov", config: { r: 4 }, claim: { observable: "lyapunovErr", max: 1e-4 } },  // exactly ln2 at r=4
    // v2860 -- the projected 2D Gaussian must integrate to exactly 2*pi*sqrt(det). The rasteriser is never told
    // that number, so the ratio landing on 1 is a grade and not a tautology.
    splat: { mode: "integral", claim: { observable: "integralErrFrac", max: 1e-6 } },
    // v2867 -- the FINDER is the system under test: rediscover Kepler III from (a,T) pairs and grade the
    // exponent against exactly 3/2. Nothing tells it the answer.
    discovery: { mode: "kepler", claim: { observable: "exponentErr", max: 1e-9 } },
    // v2875 -- the 1915 result, measured: an integrated orbit precesses by 6 pi M / (a(1-e^2)). The detector
    // that finds the perihelia knows no formula; it looks for where r is smallest.
    probe: { mode: "precession", claim: { observable: "precessionErrFrac", max: 0.01 } },
    lens: { mode: "shadow", claim: { observable: "shadowErrFrac", max: 1e-9 } },
    tidal: { mode: "deviation", claim: { observable: "deviationErrFrac", max: 1e-2 } },
    // v2876 -- DRIVING it: steer onto a circular orbit at 10M using one bit per trial (in or out) and grade
    // against L = r sqrt(M/(r-3M)), which the controller is never told.
    probeSteer: { device: "probe", mode: "steer", config: { rTarget: 10 }, claim: { observable: "steerErr", max: 1e-9 } },
    // v2877 -- the lab rediscovers its own ISCO by experiment. The claim is on the DEFICIT, because the honest
    // result lands ~0.65% inside 6M and always will: the instability growth rate vanishes at the boundary.
    probeFindIsco: { device: "probe", mode: "findisco", claim: { observable: "iscoDeficitFrac", max: 0.02 } },

    blackhole: { mode: "onset", claim: { observable: "captureOnsetR", target: 6, tol: 0.1 } },
    box3d: { mode: "drop", claim: { observable: "fallErrFrac", max: 0.02 } },
    blobthermal: { mode: "einstein", claim: { observable: "dErrFrac", max: 0.05 } },
    // v2895: dispersion is reachable via --hyp '{"mode":"dispersion",...}'
    blobkelvin: { mode: "calibration", claim: { observable: "boilingKelvin", target: 373.15, tol: 1e-6 } },
    lbm: null,   // real LBM runs take minutes -- pass --hyp explicitly (see run-onset.mjs for sensible configs)
};

export function mockCaller(hyps) {
    let i = 0;
    return async (role) => role === "proposer"
        ? hyps[Math.min(i++, hyps.length - 1)]
        : { reading: "(mock evaluator: verdict speaks for itself)" };
}

export function parseArgs(argv) {
    const [deviceName, callerName = "mock", ...rest] = argv;
    const opts = { deviceName, callerName, model: undefined, host: undefined, question: "Make and test one falsifiable claim.", rounds: 4, hyps: [] };
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "--model") opts.model = rest[++i];
        else if (a === "--host") opts.host = rest[++i];
        else if (a === "--question") opts.question = rest[++i];
        else if (a === "--rounds") opts.rounds = Math.max(1, parseInt(rest[++i], 10) || 4);
        else if (a === "--hyp") opts.hyps.push(JSON.parse(rest[++i]));
        else if (a === "--critic") opts.critic = true;
        else if (a === "--chain") opts.chain = rest[++i].split(",").map((m) => m.trim()).filter(Boolean);
        else if (a === "--critic-bench") opts.criticBench = Math.max(2, parseInt(rest[++i], 10) || 6);
        else if (a === "--policy") opts.policy = rest[++i];            // reflex | brain | bridge
        else if (a === "--target") opts.target = parseFloat(rest[++i]);
        else if (a === "--eps") opts.eps = parseFloat(rest[++i]);
        else if (a === "--policy-host") opts.policyHost = rest[++i];
        else if (a === "--seed") opts.seed = parseInt(rest[++i], 10);
    }
    return opts;
}

async function makeCaller(opts) {
    if (opts.callerName === "mock") {
        const hyps = opts.hyps.length ? opts.hyps : (DEMO_HYPS[opts.deviceName] ? [DEMO_HYPS[opts.deviceName]] : null);
        if (!hyps) throw new Error("device '" + opts.deviceName + "' has no demo claim -- pass --hyp '<json>'");
        return mockCaller(hyps);
    }
    if (opts.callerName === "policy") {
        if (opts.deviceName !== "probe") throw new Error("--caller policy drives the probe's pilot mode -- use it with the 'probe' device");
        const kind = opts.policy || "reflex";
        const policy = kind === "brain" ? brainPilotPolicy({ seed: opts.seed ?? 1337 })
            : kind === "bridge" ? brainBridgePolicy({ ...(opts.policyHost ? { host: opts.policyHost } : {}) })
            : reflexPilotPolicy();
        return policyCaller(policy, { rTarget: opts.target ?? 10, eps: opts.eps ?? 1e-3 });
    }
    if (opts.callerName === "ollama") {
        return ollamaCaller({ ...(opts.model ? { model: opts.model } : {}), ...(opts.host ? { host: opts.host } : {}) });
    }
    if (opts.callerName === "anthropic") {
        let Anthropic;
        try { Anthropic = (await import("@anthropic-ai/sdk")).default; }
        catch { throw new Error("@anthropic-ai/sdk not installed -- npm i @anthropic-ai/sdk (and set ANTHROPIC_API_KEY)"); }
        const { anthropicCaller } = await import("./roundhouse.mjs");
        return anthropicCaller(new Anthropic(), opts.model || "claude-sonnet-4-6");
    }
    throw new Error("unknown caller '" + opts.callerName + "' -- mock | ollama | anthropic");
}

const fmt = (v) => (typeof v === "number" ? +v.toFixed(4) : v);

// v2889 -- a deliberately SLOPPY mock: cycles the three mechanical failure modes the deterministic critic exists
// to fix (misspelled observable, target without tol, no comparator) before finally proposing the device's demo
// claim. Bare, it produces MALFORMED verdicts; critic-wrapped, the critic hands back the observable menu and the
// mock's "revision" (reading critiques) lands the demo claim. This is the v2850 prediction as a runnable object.
export function makeSloppyMock(deviceName) {
    const demo = DEMO_HYPS[deviceName];
    if (!demo) throw new Error("sloppy mock needs a device with a demo claim");
    const sloppy = [
        { ...demo, claim: { ...demo.claim, observable: demo.claim.observable.slice(0, -1) } },   // misspelled
        { ...demo, claim: { observable: demo.claim.observable, target: demo.claim.target ?? demo.claim.max ?? 0 } }, // target, no tol
        { ...demo, claim: { observable: demo.claim.observable } },                               // no comparator
    ];
    let i = 0;
    return async (role, payload) => {
        if (role !== "proposer") return { reading: "(sloppy mock)" };
        // a critique in the payload is the critic talking -- "revise" by producing the demo claim
        if (payload && payload.critiques && payload.critiques.length) return demo;
        return sloppy[i++ % sloppy.length];
    };
}

// v2889 -- tiered escalation through the WHOLE roundhouse: run the loop with the cheapest model's (critic-wrapped)
// caller; if it does not crystallise, escalate to the next tier. First crystallising tier wins. If nobody
// crystallises the result says so -- escalation never pretends (same contract as escalateRoute.mjs).
export async function runRoutedDevice(opts, log = console.log) {
    const device = await getDevice(opts.deviceName);
    const chain = opts.chain;
    const makeTier = opts.makeTierCaller || ((model) => makeCaller({ ...opts, callerName: "ollama", model }));
    log("routed -> device '" + device.name + "', chain [" + chain.join(" -> ") + "], critic ON at every tier");
    const attempts = [];
    for (const model of chain) {
        const base = await makeTier(model);
        const callModel = withCritic(base, device);
        const out = await roundhouseDevice({ callModel, device, question: opts.question, maxRounds: opts.rounds });
        attempts.push({ model, crystallized: out.crystallized, rounds: out.rounds });
        log("  tier '" + model + "': " + (out.crystallized ? "CRYSTALLIZED in " + out.rounds + " round(s) -- stopping here (cheapest verified tier)" : "did not crystallise -- escalating"));
        if (out.crystallized) return { ...out, attempts, escalationExhausted: false };
    }
    log("  chain exhausted -- NO tier crystallised; the answer is unverified and this result says so.");
    return { crystallized: false, device: device.name, attempts, escalationExhausted: true };
}

// v2889 -- the v2850 prediction, measured from the command line: same sloppy proposer, bare vs critic-wrapped,
// N runs each through modelBench.runOne. MALFORMED should fall to zero; REFUSED must not fall (a critic cannot
// make a wrong claim true); CRYSTALLISED should rise by exactly what malformed surrendered.
export async function criticBench(opts, log = console.log) {
    const device = await getDevice(opts.deviceName);
    const n = opts.criticBench;
    const tally = async (wrap) => {
        const counts = { crystallised: 0, refused: 0, malformed: 0, simError: 0, callerError: 0 };
        for (let i = 0; i < n; i++) {
            const bare = makeSloppyMock(opts.deviceName);
            const caller = wrap ? withCritic(bare, device) : bare;
            const r = await runOne({ device, caller, question: opts.question, maxRounds: 3 });
            counts[r.outcome] = (counts[r.outcome] || 0) + 1;
        }
        return counts;
    };
    log("critic bench -> device '" + device.name + "', " + n + " sloppy runs per arm");
    const bare = await tally(false);
    const critic = await tally(true);
    const fmt = (c) => "crystallised " + c.crystallised + ", refused " + c.refused + ", malformed " + c.malformed;
    log("  bare   : " + fmt(bare));
    log("  critic : " + fmt(critic));
    log(critic.malformed < bare.malformed && critic.refused <= bare.refused + 0
        ? "  prediction HELD: malformed fell (" + bare.malformed + " -> " + critic.malformed + "), refused did not rise -- the critic fixes mechanics and only the physics decides truth."
        : "  prediction VIOLATED -- investigate before trusting the critic wiring.");
    return { bare, critic };
}

export async function runDevice(opts, log = console.log) {
    const device = await getDevice(opts.deviceName);
    let callModel = await makeCaller(opts);
    if (opts.critic) {
        callModel = withCritic(callModel, device);
        log("(critic armed: malformed claims are repaired against the device's observable menu before the sim runs)");
    }
    log("roundhouse -> device '" + device.name + "', caller '" + opts.callerName + "', up to " + opts.rounds + " round(s)");
    const out = await roundhouseDevice({ callModel, device, question: opts.question, maxRounds: opts.rounds });
    for (const h of out.history) {
        const v = h.verdict;
        log("  round " + (h.round + 1) + ": claim " + JSON.stringify(h.hyp.claim) +
            " -> measured " + fmt(v.measured) + (v.delta !== undefined ? " (delta " + fmt(v.delta) + ")" : "") +
            " -> " + (v.done ? "CRYSTALLIZED" : "refused" + (v.reason ? " (" + v.reason + ")" : "")));
    }
    log(out.crystallized
        ? "crystallized in " + out.rounds + " round(s) on device '" + out.device + "' -- the sim said yes."
        : "did NOT crystallize (" + out.reason + ") -- the sim never said yes, and nothing else counts.");
    return out;
}

// ---- CLI entry ----------------------------------------------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.deviceName) {
        console.log("usage: node tools/roundhouse/run-device.mjs <device> [mock|ollama|anthropic|policy] [--hyp '<json>'] [--model m] [--host h] [--rounds n] [--question q] [--critic] [--chain cheap,strong] [--critic-bench N]");
        console.log("devices: " + DEVICE_NAMES.join(", "));
        process.exit(2);
    }
    const entry = opts.criticBench ? criticBench(opts)
        : (opts.chain && opts.chain.length ? runRoutedDevice(opts) : runDevice(opts));
    entry.then((out) => process.exit(opts.criticBench ? 0 : (out.crystallized ? 0 : 1)),
        (err) => { console.error("run-device: " + (err.message || err)); process.exit(2); });
}
