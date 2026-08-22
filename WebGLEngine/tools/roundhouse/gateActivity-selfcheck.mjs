// WebGLEngine/tools/roundhouse/gateActivity-selfcheck.mjs -- v3444
//
// Run: node tools/roundhouse/gateActivity-selfcheck.mjs
//
// *** THE FAILURE THIS LAYER IS MOST AT RISK OF IS NOT A WRONG NUMBER, IT IS A CONFLATION. *** Four pairs, each
// of which this tree has already been bitten by once, and each of which a two-state field would silently merge:
//
//   never timed / fast          a gate with no entry is UNMEASURED, not quick. Drawing it small would claim a
//                               measurement nobody made.
//   a runtime   / a verdict     this file says how long, never whether it passed. A timeout is not a failure.
//   captured    / current       the timings name a RUN, not a moment, and the age is a VERSION DISTANCE.
//   reached     / imported      three routes reach a device and the import walk alone reads 37 of 67.
//
// Everything below is about keeping those apart.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGateActivity, gatesByDevice, timingState, ageInVersions, engineVersion, gather, ROUTES, TIMING_STATES, OUT } from "./gateActivity.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const input = await gather();
const A = buildGateActivity(input);

// ---- 1. THE AGE IS A VERSION DISTANCE, AND IT IS DERIVED FROM BOTH SIDES ------------------------------------
{
    say(`timings captured ${A.age.capturedAt}, tree ${A.age.now} -- ${A.age.versions} versions`);
    ok("!! *** the staleness is a VERSION DISTANCE, not a clock -- gate-timings.json has no timestamp in it ***",
       A.age.versions > 0 && A.age.capturedAt && A.age.now && !/\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(A.age)),
       `${A.age.capturedAt} -> ${A.age.now} = ${A.age.versions}. I EXPECTED A TIMESTAMP AND THERE IS NONE: \`captured\` is a SENTENCE naming a run. That turns out to be the better artefact -- a version distance is exact, has no timezone, is identical on every machine, and cannot silently become "3 seconds ago" when somebody re-saves the file. A WALL CLOCK WOULD HAVE MADE THIS LAYER A FACT ABOUT THE READER'S MACHINE.`);

    // *** THE OLDEST VERSION NAMED IS THE HONEST ONE. *** The real string names v3211 AND v3285, and taking the
    // newest would flatter the file by the width of whatever was topped up last.
    const two = ageInVersions("the v3211 run plus 13 gates added in the v3285 session", "v3300");
    ok("!! a `captured` naming several versions is aged from the OLDEST, because a file is only as fresh as its stalest row",
       two.capturedAt === "v3211" && two.versions === 89 && two.alsoNamed.includes("v3285"),
       `driven on a two-version string: capturedAt ${two.capturedAt}, versions ${two.versions}, also names ${two.alsoNamed.join(",")}. Taking v3285 would have reported 15 and called a 89-version-old file recent.`);

    const none = ageInVersions("no version in here at all", "v3444");
    ok("...and an unparseable provenance reads null, NEVER 0",
       none.versions === null && none.capturedAt === null,
       "UNKNOWN IS NOT ZERO (v2951). A 0 here would render as `captured at this very build` -- the most flattering possible reading of the least information.");

    ok("...and the engine version is READ from main.js rather than passed in",
       engineVersion('const ENGINE_VERSION = "v9999";   // x') === "v9999" && engineVersion() === A.age.now,
       `${A.age.now}. A caller that could state the version could state the age, and an age nobody derives is a memory.`);
}

// ---- 2. *** THREE ROUTES, AND THE OBVIOUS ONE IS A SUBSET THAT LOOKS LIKE A CORPUS *** -----------------------
{
    const { byDevice, sweeps } = gatesByDevice(input.deviceModules, input.gateFiles);
    const devs = Object.keys(input.deviceModules);
    const impOnly = devs.filter((d) => byDevice[d].import.size && !byDevice[d].name.size);
    const namOnly = devs.filter((d) => !byDevice[d].import.size && byDevice[d].name.size);
    const both = devs.filter((d) => byDevice[d].import.size && byDevice[d].name.size);
    say(`import ${A.byRoute.import}, name ${A.byRoute.name}, both ${both.length}, import-only ${impOnly.length}, name-only ${namOnly.length}, sweep gates ${sweeps.length}`);

    ok("!! *** EACH OF THE TWO DIRECT ROUTES FINDS DEVICES THE OTHER MISSES -- neither is the corpus ***",
       impOnly.length > 0 && namOnly.length > 0,
       `${impOnly.length} reached only by an import, ${namOnly.length} ONLY BY NAME. *** SO THE IMPORT WALK ALONE -- the instrument this tree reaches for, and the one deviceInstrumentMap uses -- WOULD HAVE DECLARED ${devs.length - A.byRoute.import} DEVICES UNGATED WHEN THEY ARE NOT. v3418 made exactly this mistake once with pagesImportingPhysics resolving one hop. ***`);

    // ROUTE 2 IS A QUOTED LITERAL AND NEVER A SUBSTRING. v3330: `lbm-fluid` missing the device `lbm` cost that
    // round its whole finding, and the same match run loosely fails the other way -- a file that only mentions a
    // LONGER name would satisfy a shorter device. Driven on a synthetic source rather than argued.
    const tmp = path.join(ENG, "tools", "roundhouse", "__routeProbe-selfcheck.mjs");
    fs.writeFileSync(tmp, 'const a = getDevice("lbm-fluid"); const b = "lbmSomethingElse";\n');
    try {
        const probe = gatesByDevice(input.deviceModules, [...input.gateFiles, tmp]);
        const hitShort = probe.byDevice.lbm ? probe.byDevice.lbm.name.has("tools/roundhouse/__routeProbe-selfcheck.mjs") : false;
        ok("!! *** a file naming `lbm-fluid` does NOT satisfy the device `lbm` -- the match is a quoted literal ***",
           hitShort === false,
           `a synthetic gate calling getDevice("lbm-fluid") is planted and the short name does not match it. A BARE SUBSTRING WOULD HAVE, and v3330's warning is about that exact pair running the other way. The probe file is deleted again below, so the tree is left unmodified.`);
    } finally { fs.unlinkSync(tmp); }
    ok("...and the probe file is gone again", !fs.existsSync(tmp), "a gate that leaves a gate behind would grow the population it measures.");

    ok("!! the SWEEP route is counted apart and never added into a device's own gates",
       A.nodes.every((n) => n.gates.every((g) => !sweeps.includes(g) || byDevice[n.id].import.has(g) || byDevice[n.id].name.has(g))),
       `${sweeps.length} gates walk DEVICE_NAMES. A GATE THAT WALKS EVERY DEVICE IS NOT THE SAME CLAIM AS A GATE WRITTEN FOR ONE, and folding them in would give every device a full house and make this layer a field with no information in it.`);
    ok("REPORTED: the devices no gate names specifically", true,
       `${A.namedByNeither.join(", ") || "(none)"} -- reached by a sweep and by nothing written for them. NOT FAILED: whether a device deserves a gate of its own is a judgement and it is Keith's, and this file's job is to make the question visible rather than to answer it.`);
}

// ---- 3. THREE TIMING STATES, AND `never-timed` IS NOT `fast` -------------------------------------------------
{
    for (const s of TIMING_STATES) say(`${s.padEnd(12)} ${A.counts[s]}`);
    ok("!! *** every one of the three states is REACHED, so none of them is a category that cannot happen ***",
       A.counts.timed > 0 && A.counts.partly > 0 && A.counts["never-timed"] > 0,
       `${A.counts.timed} / ${A.counts.partly} / ${A.counts["never-timed"]}. *** THE PARTLY STATE IS THE ONE A TWO-WAY FLAG WOULD LOSE: a device whose gates are half measured is neither timed nor untimed, and rounding it either way is a confident wrong answer about ${A.counts.partly} devices. *** A CHECK THAT HAS NEVER BEEN SEEN TO FIRE MIGHT NOT FIRE (v3142), which is why the empty-category question is asked at all.`);
    ok("!! *** a never-timed device carries ms === null, NEVER 0 -- unmeasured is not quick ***",
       A.nodes.filter((n) => n.state === "never-timed").every((n) => n.ms === null) &&
       A.nodes.filter((n) => n.state === "timed").every((n) => typeof n.ms === "number" && n.ms >= 0),
       "a zero here would render as the fastest star on the map, which is the most flattering possible reading of no data at all.");
    ok("...and `no-gate` is its own state rather than being folded into never-timed",
       A.counts["no-gate"] + A.counts.timed + A.counts.partly + A.counts["never-timed"] === A.nodes.length,
       `${A.counts["no-gate"]} device(s) have no gate of their own AT ALL, which is a different fact from having gates nobody has timed. The four states PARTITION the device set with no remainder.`);

    // Driven directly, because the states above are whatever the tree happens to hold today.
    const timed = new Map([["a.mjs", 10], ["b.mjs", 20]]);
    const mk = (imp, nam) => ({ import: new Set(imp), name: new Set(nam), sweep: new Set(["sweep.mjs"]) });
    ok("...each state reached on a fixture rather than only observed in the tree",
       timingState(mk(["a.mjs"], ["b.mjs"]), timed).state === "timed" &&
       timingState(mk(["a.mjs"], ["z.mjs"]), timed).state === "partly" &&
       timingState(mk(["y.mjs"], ["z.mjs"]), timed).state === "never-timed" &&
       timingState(mk([], []), timed).state === "no-gate",
       "and the sweep in every fixture is ignored, which is what keeps `no-gate` reachable at all.");
}

// ---- 4. THE GATE POPULATION AND THE TIMING FILE, COMPARED IN BOTH DIRECTIONS --------------------------------
{
    ok("!! 206-ish gates have never been timed, and that is REPORTED rather than failed",
       A.gates.timed + A.gates.neverTimed === A.gates.total && A.gates.neverTimed > 0,
       `${A.gates.total} gates: ${A.gates.timed} timed, ${A.gates.neverTimed} never. A FULL SUITE RUN ON THE RIG IS WHAT MOVES THIS NUMBER, and failing on it here would fail a sandbox for not being a rig.`);
    ok("...and a timing row for a gate no longer in the tree is caught, not ignored",
       Array.isArray(A.gates.orphanTimings) && A.gates.orphanTimings.length === 0,
       `${A.gates.orphanTimings.length} orphan row(s). A STALE SUPPRESSION IS AN ACTIVE BLIND SPOT (v3202) and a stale TIMING is the same shape: it would keep a deleted gate looking measured forever. THE COMPARISON RUNS BOTH WAYS -- which is the check the tree's most-repeated defect exists for.`);
    ok("...and gateFiles() is the ONE definition of the population here too",
       fs.readFileSync(path.join(ENG, "tools", "roundhouse", "gateActivity.mjs"), "utf8").includes("st.gateFiles()"),
       "imported from staleness.mjs rather than re-walked -- v3041's three definitions of `a gate exists here`, and v3442 found a fourth in gateAxioms.");
}

// ---- 5. A RUNTIME IS NOT A VERDICT, AND THIS LAYER MUST NOT MERGE INTO LAYER 1 -------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "gateActivity.mjs"), "utf8");
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    // *** MY FIRST VERSION OF THIS CHECK COUNTED ITS OWN WARNING AS THE THING IT WARNS ABOUT. *** It hunted the
    // word "verdict" through noComments(), which KEEPS STRING LITERALS -- and this layer's own `note` field says
    // "A RUNTIME IS NOT A VERDICT". So the sentence explaining the rule was read as a violation of it. FIFTH
    // INSTANCE of that shape in this tree, and the standing fix is the one applied here: ASSERT AN ABSENT
    // MECHANISM RATHER THAN AN ABSENT MENTION. What matters is that no NODE carries a pass/fail field, which is
    // a fact about the data and cannot be satisfied or broken by prose.
    const verdictish = ["ok", "pass", "passed", "fail", "failed", "verdict", "green", "red", "status"];
    const leaked = A.nodes.flatMap((n) => Object.keys(n)).filter((k) => verdictish.includes(k.toLowerCase()));
    ok("!! *** this layer reports a DURATION and never a pass/fail -- a timeout is not a failure ***",
       leaked.length === 0 && A.nodes.every((n) => n.ms === null || typeof n.ms === "number"),
       `no node carries any of ${verdictish.join("/")} -- ${leaked.length} leaked. gate-timings.json holds milliseconds and nothing else, so a verdict here would have to be INVENTED. v3076: three of eight "failures" in one rig run were TIMEOUTS, and conflating them sends you hunting a bug that is not there.`);
    const g1 = fs.existsSync(path.join(ENG, "lab-galaxy.json"));
    ok("...and it is a SEPARATE artefact from layer 1 rather than a field added to it",
       !noComments.includes("lab-galaxy.json"),
       `layer 1 ${g1 ? "is on disk" : "is not emitted yet"} and this file never opens it. *** A STAR BRIGHT BECAUSE ITS GATE RAN AND A STAR BRIGHT BECAUSE ITS VALUE DRIFTED ARE OPPOSITE NEWS, and one artefact carrying both invites exactly the merge this round exists to prevent. ***`);
}

// ---- 6. THE FRONT DOOR ---------------------------------------------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "cosmic-map.html"), "utf8");
    const nc = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    ok("!! cosmic-map.html fetches gate-activity.json as its OWN channel",
       /fetch\(\s*["'`]\.\/gate-activity\.json/.test(nc),
       "a tool with no page is unfinished, and layer 2 has to be visible beside layer 1 without being mixed into it.");
    ok("...and the page shows the AGE, because this layer goes stale where layer 1 cannot",
       /versions stale|age\.versions/.test(nc),
       "layer 1 has no clock and can never be stale; this one is 232 versions behind a rig run. A PAGE THAT SHOWED THE NUMBER WITHOUT THE AGE WOULD BE v3070's REMEMBERED RESULT PRESENTED AS A CURRENT MEASUREMENT.");
    ok("...and NEVER TIMED renders distinctly rather than as a small fast star",
       /never-timed/.test(nc),
       "v3048's rule: a page nobody has tested and a page that passed are not the same claim, and a two-state list cannot tell them apart.");
    ok("...and an absent artefact is named rather than drawn empty",
       /gateErr|not here yet/.test(nc),
       "the tool is dry-run by default, so absence is the ordinary state on a fresh tree and is a different fact from a broken page.");
}

// ---- 7. THE EMITTED ARTEFACT ---------------------------------------------------------------------------------
{
    const dest = path.join(ENG, OUT);
    if (!fs.existsSync(dest)) ok("REPORTED: no gate-activity.json on disk yet -- dry run by default", true, "run with --write.");
    else {
        const j = JSON.parse(fs.readFileSync(dest, "utf8"));
        ok("the emitted artefact reparses and carries its own age", Array.isArray(j.nodes) && j.age && typeof j.age.versions === "number",
           `${j.nodes.length} nodes, ${j.age.versions} versions stale. The page reads the age FROM THE FILE rather than recomputing it, so it cannot disagree with the tool that wrote it.`);
    }
}

console.log(fails ? "\ngateActivity-selfcheck: " + fails + " FAILED" : "\ngateActivity-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
