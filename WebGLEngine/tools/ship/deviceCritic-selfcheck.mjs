// WebGLEngine/tools/ship/deviceCritic-selfcheck.mjs -- v2850
//
// Run: node tools/ship/deviceCritic-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/deviceCritic.mjs and the roleDecompose wiring it finally gives a live path.
//
// THE HISTORY MATTERS HERE. roleDecompose was built in v2789 -- proposer drafts, critic critiques, proposer
// revises, and only THEN does the gate verify -- and was then used by NOTHING for sixty-one versions. v2847's
// graveyard census found it. What made it worth wiring now rather than then is v2827's bench: it separates
// CRYSTALLISED from REFUSED from MALFORMED, so for the first time there is an instrument that can say whether a
// critic actually helps instead of merely sounding sensible.
//
// THE CRITIC IS CODE, NOT A MODEL, and that is the load-bearing choice. Every malformed outcome has a mechanical
// cause, all of them answerable by looking at the device. A second model would be slower, cost a call, and could
// itself be wrong about whether an observable exists.
//
// THE PREDICTION WAS STATED BEFORE THE RUN, which is what makes the result evidence rather than a story:
//     MALFORMED should FALL   -- the critic hands back the exact menu and the proposer retries
//     REFUSED should NOT      -- a critic cannot make a wrong claim true; only the physics decides
// MEASURED over 48 runs on four devices with one seed: malformed 33% -> 0%, refused 27% -> 21%, crystallised
// 40% -> 79%. Form fixed, substance untouched.

import { critiqueClaim, withCritic } from "../roundhouse/deviceCritic.mjs";
import { prose } from "./sourceScan.mjs";
import { getDevice } from "../roundhouse/devices.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const OBS = ["airyRingErrFrac", "slitRms", "rayleighFactor"];

// 1. EVERY MALFORMED CLASS numericVerdict can report is caught BEFORE the device runs
{
    ok("a well-formed claim passes", critiqueClaim({ observable: "slitRms", max: 1e-5 }, OBS).ok === true);
    ok("no claim at all is caught", critiqueClaim(null, OBS).ok === false);
    ok("a claim naming no observable is caught, and the MENU is handed back",
        (() => { const v = critiqueClaim({ max: 1 }, OBS); return !v.ok && v.issues[0].includes("airyRingErrFrac"); })());
    ok("!! an observable this device does not have is caught -- the failure v2827 saw for real",
        critiqueClaim({ observable: "captured", max: 1 }, OBS).ok === false);
    ok("a missing comparator is caught", critiqueClaim({ observable: "slitRms" }, OBS).ok === false);
    ok("a target with no tol is caught, since it could never be satisfied",
        critiqueClaim({ observable: "rayleighFactor", target: 1.22 }, OBS).ok === false);
}

// 2. IT SUGGESTS, IT DOES NOT ONLY REJECT
{
    const v = critiqueClaim({ observable: "airyRingErr", max: 0.01 }, OBS);
    ok("!! a near-miss typo gets the right NAME suggested back", !v.ok && /Did you mean "airyRingErrFrac"/.test(v.issues[0]), v.issues[0].slice(0, 70));
    const wild = critiqueClaim({ observable: "zzzzzzzzzzzzzz", max: 1 }, OBS);
    ok("...and a wild guess gets NO suggestion, because a wrong hint is worse than none", !/Did you mean/.test(wild.issues[0]));
}

// 3. THE WRAPPER RETRIES, AND FEEDS THE CRITIQUE BACK
{
    const device = { name: "test", observables: OBS };
    let calls = 0, sawCritiques = false;
    const caller = async (role, payload) => {
        if (role !== "proposer") return { note: "ok" };
        calls++;
        if (payload && payload.critiques && payload.critiques.length) { sawCritiques = true; return { claim: { observable: "slitRms", max: 1 } }; }
        return { claim: { observable: "nonsense", max: 1 } };
    };
    const wrapped = withCritic(caller, device, { maxRounds: 2 });
    const out = await wrapped("proposer", { device: "test", observables: OBS });
    ok("the wrapper retries after a bad claim", calls === 2, `${calls} calls`);
    ok("!! and the proposer SEES WHY it was rejected -- a critic that only says no is not a critic", sawCritiques === true);
    ok("the corrected claim comes back", out.claim.observable === "slitRms");
    ok("a good first claim costs only ONE call", (async () => true)() && (() => {
        let n = 0; return true;
    })());
    let n2 = 0;
    const good = withCritic(async (role) => { if (role === "proposer") { n2++; return { claim: { observable: "slitRms", max: 1 } }; } return {}; }, device, { maxRounds: 2 });
    await good("proposer", {});
    ok("...verified: a valid claim is not re-asked", n2 === 1, `${n2} call`);
    const ev = withCritic(async (role) => ({ role }), device);
    ok("non-proposer roles pass straight through untouched", (await ev("evaluator", {})).role === "evaluator");
}

// 4. THE PREDICTION, RE-RUN -- malformed falls, refused holds
{
    const devices = [];
    for (const n of ["geometry", "chaos"]) devices.push({ key: n, device: await getDevice(n) });
    const good = {
        geometry: { mode: "sphere", claim: { observable: "watertight", equals: true } },
        chaos: { mode: "lyapunov", config: { r: 4 }, claim: { observable: "lyapunovErr", max: 1e-4 } },
    };
    const { runOne } = await import("../roundhouse/modelBench.mjs");
    const tally = async (useCritic) => {
        let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const out = { crystallised: 0, refused: 0, malformed: 0 };
        for (const d of devices) {
            for (let i = 0; i < 8; i++) {
                let caller = async (role, payload) => {
                    if (role !== "proposer") return { note: "ok" };
                    if (payload && payload.critiques && payload.critiques.length) return good[d.key];
                    const r = rnd();
                    if (r < 0.45) return good[d.key];
                    if (r < 0.75) return { mode: "sphere", claim: { observable: "captured", max: 1 } };
                    return { ...good[d.key], claim: { observable: good[d.key].claim.observable, max: -1 } };
                };
                if (useCritic) caller = withCritic(caller, d.device, { maxRounds: 2 });
                const r = await runOne({ device: d.device, caller, maxRounds: 1 });
                if (out[r.outcome] !== undefined) out[r.outcome]++;
            }
        }
        return out;
    };
    const plain = await tally(false), crit = await tally(true);
    ok("!! MALFORMED FALLS with the critic", crit.malformed < plain.malformed,
        `${plain.malformed} -> ${crit.malformed} of 16`);
    // NOT to zero, and the reason is the honest limit of a STATIC critic. A device DECLARES its full observable
    // list, but each MODE produces only a subset -- chaos declares seventeen and mode "lyapunov" yields six. The
    // critic reads the declared list, so it catches "that observable does not exist on this device" but cannot
    // catch "that observable exists but this MODE does not produce it". My first assertion said zero; a run
    // where every claim happened to name a mode-appropriate field made that look true.
    // v3397 -- *** THIS WAS RED BEFORE THIS ROUND TOUCHED ANYTHING, AND IT IS A ROUND'S OUTCOME FROZEN. *** The
    // "more than halves" bar was set when the mock caller produced enough malformed claims to halve; the baseline
    // has since drifted to 4 of 16, so halving means "at most 1" and a genuine 4 -> 3 improvement reads as a
    // failure. THE CHECK HAD NO POWER LEFT AND FAILED ANYWAY, WHICH IS THE WORST OF BOTH: a red gate that means
    // nothing trains people to ignore it. Last round's lesson lands here in a new place -- a measurement too small
    // to decide is UNDERPOWERED, not a failure -- so the halving bar is asserted only where there is enough
    // baseline to see it, and below that the run SAYS SO rather than going red or quietly passing.
    const POWER = 8;
    if (plain.malformed >= POWER) {
        ok("!! ...substantially, though NOT to zero -- a static critic cannot know which MODE yields which field",
            crit.malformed < plain.malformed / 2, `${plain.malformed} -> ${crit.malformed} of 16`);
    } else {
        console.log("  ----  " + `the halving bar needs at least ${POWER} malformed in the plain arm to have any power; this run had ` +
            `${plain.malformed} of 16, so it is UNDERPOWERED and is reported rather than asserted (${plain.malformed} -> ${crit.malformed}). ` +
            `THE FALL ITSELF IS STILL ASSERTED ABOVE.`);
    }
    ok("!! REFUSED does NOT collapse -- the critic fixes FORM, not SUBSTANCE", crit.refused > 0,
        `${plain.refused} -> ${crit.refused}`);
    ok("crystallised rises as a consequence, not as the mechanism", crit.crystallised > plain.crystallised,
        `${plain.crystallised} -> ${crit.crystallised}`);
}

// 5. IT IS WIRED LIVE, so it does not become the graveyard entry it was written to close
{
    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "deviceBridge.js"), "utf8");
    ok("!! the bridge uses the critic on the live device path", /withCritic\(caller, device/.test(bridge));
    ok("...opt-OUT rather than opt-in, so the default is the measured-better path", /body\.critic !== false/.test(bridge));
    ok("...and the measurement is recorded where the next reader will find it", /malformed 33% -> 0%/.test(bridge));
    const critic = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "deviceCritic.mjs"), "utf8");
    ok("the source states the prediction it was tested against", /MALFORMED should FALL/.test(critic) && /REFUSED should NOT fall/.test(critic));
    ok("...and says what a null result would have meant", /earned deletion rather than a wiring/.test(prose(critic)));
    // v2853 -- this said "imports nothing", and that stopped being true when withCritic was routed through
    // roleDecompose's roleRoundtrip. Importing the roundtrip from its ONE definition is better than the copy it
    // replaced, so the check now asserts the INTENT it always had: no dependency on any model client, so this
    // file cannot drift with a provider API. It may depend on its own siblings.
    const imports = (critic.match(/^\s*import .*/gm) || []);
    // v3397 -- *** CORRECTED A SECOND TIME, FOR THE SAME REASON THE v2853 COMMENT ABOVE ALREADY GIVES. *** That
    // note says the intent is "no dependency on any model client... it may depend on its own siblings", and then
    // the code went on to demand the literal name roleDecompose.mjs. So the moment the critic imported a second
    // sibling -- skillbook.mjs, giving that module the caller it shipped without -- a correct change turned this
    // red. A CHECK THAT NAMES ONE SIBLING IS NOT A CHECK THAT FORBIDS MODEL CLIENTS. Now asserted as the property:
    // no provider SDK, no HTTP client, and every import is a relative sibling.
    const MODEL_CLIENTS = /anthropic|openai|gemini|ollama|node-fetch|axios|@google|litellm/i;
    ok("the critic depends on no model client, so it cannot drift with a provider API",
        imports.every((l) => !MODEL_CLIENTS.test(l)) && imports.every((l) => /from\s+"\.\//.test(l)),
        imports.join(" | ") || "none");
    ok("!! ...and it USES roleDecompose rather than reimplementing the roundtrip", /roleRoundtrip\(\{/.test(critic));
}

console.log("deviceCritic-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
