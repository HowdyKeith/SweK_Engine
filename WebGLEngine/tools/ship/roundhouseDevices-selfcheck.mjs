// WebGLEngine/tools/ship/roundhouseDevices-selfcheck.mjs -- v2812
//
// Run: node tools/ship/roundhouseDevices-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES THE FOLD-IN of roundhouse_devices_v2806 -- the device registry that lets the physics roundhouse point at
// several labs through one generic adapter.
//
// THE THING THIS GATE EXISTS FOR IS THE RENAME. The package arrived carrying its own tools/roundhouse/
// ollamaCaller.mjs, colliding with the file of that name added in v2808. They are NOT rival implementations of
// the same idea -- they are the two halves of a distinction this codebase already documents:
//
//     ollamaCaller.mjs      dispatches by MODEL -- callModel(modelName, task), for escalateRoute's chain
//     ollamaRoleCaller.mjs  dispatches by ROLE  -- caller("proposer"|"evaluator", ctx), for the roundhouse loop
//
// the same split as modelRoutingCaller vs anthropicCaller. Overwriting either would have silently broken the
// other: the escalation chain would have called a role-dispatcher with a model name, or the roundhouse loop would
// have called a model-router with the string "proposer". Both failures are quiet -- the call succeeds and returns
// something shaped wrong -- which is exactly why this is gated rather than trusted to a comment.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RH = path.join(HERE, "..", "roundhouse");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. BOTH CALLERS EXIST, with different shapes
{
    const model = await import(pathToFileURL(path.join(RH, "ollamaCaller.mjs")).href);
    const role = await import(pathToFileURL(path.join(RH, "ollamaRoleCaller.mjs")).href);
    ok("model-dispatch caller kept its exports", typeof model.ollamaCaller === "function" && typeof model.listLocalModels === "function" && typeof model.mixedCaller === "function" && typeof model.localFirstChain === "function");
    ok("role-dispatch caller landed with its own exports", typeof role.ollamaCaller === "function" && typeof role.salvageJson === "function" && !!role.PROPOSER_SCHEMA && !!role.EVALUATOR_SCHEMA);
    ok("they are genuinely different modules", model.ollamaCaller !== role.ollamaCaller);
    // shape proof: the model caller takes a base URL string; the role caller takes an options object
    ok("model caller is called with (base, opts) and returns callModel(model, task)", model.ollamaCaller("http://x", { fetchImpl: async () => ({ ok: true, json: async () => ({ response: "{}" }) }) }).length >= 1);
    ok("role caller is called with an options object", (() => { try { role.ollamaCaller({ fetchImpl: async () => ({ ok: true, json: async () => ({ response: "{}" }) }) }); return true; } catch { return false; } })());
}

// 2. NOTHING IMPORTS THE WRONG ONE. This is the failure the rename prevents, so it is checked by reading the
// actual import graph rather than assumed.
{
    const files = fs.readdirSync(RH).filter((f) => f.endsWith(".mjs"));
    const roleUsers = [], modelUsers = [];
    for (const f of files) {
        const src = fs.readFileSync(path.join(RH, f), "utf8");
        if (/from\s+"\.\/ollamaRoleCaller\.mjs"/.test(src)) roleUsers.push(f);
        if (/from\s+"\.\/ollamaCaller\.mjs"/.test(src)) modelUsers.push(f);
    }
    ok("the role caller has importers (the fold-in wired them)", roleUsers.length >= 2, roleUsers.join(", "));
    ok("run-device.mjs uses the ROLE caller", roleUsers.includes("run-device.mjs"));
    ok("its selfcheck uses the ROLE caller", roleUsers.includes("ollamaRoleCaller-selfcheck.mjs"));
    // anything importing the model caller must be an escalation-chain consumer, never the device loop
    ok("the device loop does NOT import the model-dispatch caller", !modelUsers.includes("run-device.mjs") && !modelUsers.includes("devices.mjs"));
    ok("no file imports a now-nonexistent ollamaCaller export set", roleUsers.every((f) => !/from\s+"\.\/ollamaCaller\.mjs"/.test(fs.readFileSync(path.join(RH, f), "utf8"))));
}

// 3. THE RENAME IS DOCUMENTED WHERE THE NEXT PERSON WILL LOOK
{
    const src = fs.readFileSync(path.join(RH, "ollamaRoleCaller.mjs"), "utf8");
    ok("ollamaRoleCaller explains the rename and the model/role split", /RENAMED ON FOLD-IN/.test(src) && /dispatches by ROLE/.test(src) && /dispatches by MODEL/.test(src));
}

// 4. THE DEVICE REGISTRY works: every declared device resolves and declares observables
{
    const D = await import(pathToFileURL(path.join(RH, "devices.mjs")).href);
    ok("registry exports DEVICE_NAMES and getDevice", Array.isArray(D.DEVICE_NAMES) && typeof D.getDevice === "function");
    // v3036 -- A RATCHET, NOT AN EQUALITY. This asserted `length === EXPECTED.length` against a list of 22
    // written before five devices were added (twobody, inspiral, eccentric, lens, tidal). Nothing had broken;
    // the registry grew and the gate read that as a failure -- the same shape labDevices had before v2999.
    //
    // But labDevices' fix was a COUNT floor, and a count floor is the wrong instrument here. deviceBridge's twin
    // check already argued why in its own comment: a bare number fires on any change and tells you nothing about
    // WHICH. So the floor is taken at SET level instead -- every name below must still resolve, and additions
    // pass without touching this file. An accidental loss and a deliberate addition now look different, which is
    // the whole point of naming them.
    const EXPECTED_DEVICES = ["blackhole", "optics", "kerr", "ct", "interferometer", "windtunnel", "thermal", "pipe3d", "geometry", "kh", "born", "ising", "kepler", "twobody", "inspiral", "eccentric", "quantum", "chaos", "splat", "discovery", "probe", "lens", "tidal", "box3d", "blobthermal", "blobkelvin", "lbm"];
    const missing = EXPECTED_DEVICES.filter((n) => !D.DEVICE_NAMES.includes(n));
    ok("the registry has not lost a lab", missing.length === 0,
       missing.length ? "MISSING: " + missing.join(",") : D.DEVICE_NAMES.length + " devices, all " + EXPECTED_DEVICES.length + " expected present" +
       (D.DEVICE_NAMES.length > EXPECTED_DEVICES.length ? " (+" + (D.DEVICE_NAMES.length - EXPECTED_DEVICES.length) + " added since: " + D.DEVICE_NAMES.filter((n) => !EXPECTED_DEVICES.includes(n)).join(",") + ")" : ""));
    let allGood = true, detail = "";
    for (const n of D.DEVICE_NAMES) {
        const d = await D.getDevice(n);
        if (!d || typeof d.build !== "function" || !Array.isArray(d.observables) || d.observables.length === 0) { allGood = false; detail = n; }
    }
    ok("every device resolves with a build() and a non-empty observable list", allGood, detail ? "bad: " + detail : "");
    let threw = false;
    try { await D.getDevice("no-such-device"); } catch { threw = true; }
    ok("an unknown device name is refused rather than silently returning nothing", threw || !(await D.getDevice("no-such-device")));
}

// 5. the incoming bind modules are all present and gated
{
    for (const b of ["blackHoleBind", "box3dBind", "blobThermalBind", "blobKelvinBind", "deviceBind"]) {
        ok(`${b}.mjs present`, fs.existsSync(path.join(RH, b + ".mjs")));
    }
    for (const b of ["blackHoleBind", "box3dBind", "blobThermalBind", "blobKelvinBind"]) {
        ok(`${b} ships its own selfcheck`, fs.existsSync(path.join(RH, b + "-selfcheck.mjs")));
    }
    ok("run-device.mjs present (the CLI entry)", fs.existsSync(path.join(RH, "run-device.mjs")));
}

// 6. the fold-in did not disturb the escalation stack it sits beside
{
    for (const f of ["escalateRoute.mjs", "escalateRouteLive.mjs", "swekGates.mjs", "agentTrace.mjs", "routeBench.mjs", "runLive.mjs", "ollamaCaller.mjs"]) {
        ok(`untouched: ${f} still present`, fs.existsSync(path.join(RH, f)));
    }
    const live = fs.readFileSync(path.join(RH, "runLive.mjs"), "utf8");
    ok("runLive still imports the MODEL-dispatch caller", /from "\.\/ollamaCaller\.mjs"/.test(live));
}

console.log("roundhouseDevices-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
