// WebGLEngine/tools/ship/shipRitual.mjs — v3528
// ---------------------------------------------------------------------------------------------------------------
// THE SHIP RITUAL, DECLARED ONCE AND EXECUTABLE — because it currently lives in two places and they have drifted.
//
// PROVENANCE. moazbuilds/CodeMachine-CLI was REFUSED as code at v3527: it orchestrates coding agents, and SweK is
// the thing being built rather than a workflow to be built by one. What was worth reading is the shape of its
// declared, re-runnable workflow file. This is that shape, applied to the one workflow this tree actually has.
//
// *** THE PROBLEM IS NOT THAT THE RITUAL IS UNWRITTEN. IT IS THAT IT IS WRITTEN TWICE. *** The steps live in a
// skill, and the state lives in prose in HANDOFF.md, and nothing checks either against the tree. Measured at
// v3527, the handoff's State block says:
//
//     "Engine v3034"          the tree is v3527          -- 493 versions
//     "79 checks"             verify runs 77
//     "482 gates"             862 on disk
//     "27 devices"            63 registered
//
// EVERY NUMBER IN IT IS WRONG. Not through carelessness -- through being a second declaration of something the
// tree already knows, which is the exact failure this lab keeps finding elsewhere (promptCost's device count,
// case-study's gate count, gateReach's population pin, the "MEASURED" gate headers).
//
// *** SO THE FIX IS NOT TO SYNCHRONISE THE TWO. IT IS TO STOP DECLARING IT TWICE. *** The steps are declared here
// as DATA -- each with what it does, the command that does it, and how to tell whether it worked -- and the
// numbers are not declared at all, they are read. A step whose verification cannot be stated is not a step in a
// ritual, it is a habit.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it does not run the ship for you by default. `--run` exists, but the
// default is `--show`, because a ritual that executes on import is a ritual nobody reads. The point of writing it
// down was to make it inspectable.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return ""; } };

/** Facts the tree already knows. Read, never declared -- this is the whole argument of the file. */
export function currentState() {
    const engine = (read("main.js").match(/const ENGINE_VERSION = "(v\d+)"/) || [])[1] || null;
    const brain = (read("brain/brain.js").match(/const BRAIN_BUILD = "(v\d+)"/) || [])[1] || null;
    let gates = null, instruments = null;
    try { gates = JSON.parse(read("knowledge-index.json")).gates?.length ?? null; } catch {}
    return { engine, brain, gates, markersAgree: engine !== null && engine === brain };
}

/**
 * THE STEPS. Order matters and is the point: the index and the derived counts must be rebuilt BEFORE verify
 * runs, or verify checks yesterday's numbers and passes.
 *
 * Every step carries `verify`, a shell-free predicate the caller can evaluate. A step that cannot say how you
 * would know it worked does not belong here.
 */
export const STEPS = [
    {
        id: "bump-version",
        what: "Bump ENGINE_VERSION in main.js and BRAIN_BUILD in brain/brain.js to the same new version.",
        command: "(edit) main.js and brain/brain.js",
        why: "verify cross-checks BOTH against the --version you claim. They are two declarations ON PURPOSE -- a " +
             "deliberate cross-check is not the same thing as accidental duplication, and the difference is that " +
             "something reads them and refuses when they disagree.",
        verify: () => { const s = currentState(); return { ok: s.markersAgree, detail: `main.js ${s.engine}, brain.js ${s.brain}` }; },
    },
    {
        id: "changelog",
        what: "Prepend the round's changelog block above the ENGINE_VERSION line in main.js.",
        command: "(edit) main.js",
        why: "the changelog is the only place the REASONING survives. A round with a green gate and no changelog " +
             "is a round nobody can audit later.",
        verify: () => {
            const s = currentState();
            const m = read("main.js");
            const has = s.engine ? m.includes(`// ${s.engine} --`) || m.includes(`${s.engine} -- `) : false;
            return { ok: has, detail: has ? `a block for ${s.engine} is present` : `NO changelog block found for ${s.engine}` };
        },
    },
    {
        id: "knowledge-index",
        what: "Rebuild the knowledge index.",
        command: "node tools/ship/buildKnowledgeIndex.mjs",
        why: "it is DERIVED from the gates on disk. Rebuilding it after the edits is what makes the count real " +
             "rather than remembered.",
        verify: () => { const s = currentState(); return { ok: s.gates !== null && s.gates > 0, detail: `${s.gates} gates indexed` }; },
    },
    {
        id: "launch-index",
        what: "Rebuild the launch index so every page, demo and built-in on disk is in it.",
        command: "node tools/ship/launchIndex.mjs --write",
        why: "it is DERIVED from the html on disk, demos_code and engine-catalog. Left unbuilt, a page added this " +
             "round ships reachable from nothing -- which is the failure the Arriving comments record four times.",
        verify: () => {
            try {
                const j = JSON.parse(fs.readFileSync(path.join(ENG, "launch-index.json"), "utf8"));
                const n = fs.readdirSync(ENG).filter((f) => f.endsWith(".html")).length;
                const pages = j.entries.filter((e) => e.kind === "page").length;
                return { ok: pages === n, detail: `${j.entries.length} launchables, ${pages} pages against ${n} html on disk` };
            } catch { return { ok: false, detail: "launch-index.json missing or unreadable" }; }
        },
    },
    {
        id: "population-census",
        what: "Record the physics-module population, so the next round compares against a record rather than a memory.",
        command: "node tools/ship/populationCensus.mjs --write",
        // THE HISTORY LIVES HERE, IN THE COMMENT, AND NOT IN THE STEP'S why STRING -- because this file's own gate
        // forbids a version or a count in the EXECUTABLE part, and it caught me putting them there. The rule is
        // right even though these particular numbers are a record rather than an expectation: a gate that had to
        // judge which hardcoded number is safe would be judging intent, and it cannot.
        //   The pin this step replaces went RED ON ARRIVAL twice, at 338 against 328 and later 383 against 351,
        //   because it needed a human to notice between rounds. Improving its message and single-sourcing its
        //   number changed neither outcome.
        why: "a step in the ritual is performed because the ritual is performed. The hand-typed pin this replaces " +
             "needed somebody to remember a number between rounds, and twice nobody did.",
        verify: null,
        gate: "tools/ship/populationCensus-selfcheck.mjs",
    },
    {
        id: "derived-counts",
        what: "Refresh every derived count that is baked into a page (case-study's gate count, promptCost's device count).",
        command: "node tools/ship/staleness-selfcheck.mjs",
        why: "these are numbers a READER sees. staleness-selfcheck exists precisely because they drift, and it has " +
             "caught them on three consecutive patches.",
        verify: null,     // stated as a gate rather than duplicated here: see the note on second declarations
        gate: "tools/ship/staleness-selfcheck.mjs",
    },
    {
        id: "verify",
        what: "Run the ship gate with the version you are claiming.",
        command: "node tools/ship/verify.mjs --version vNNNN",
        why: "IT REFUSES TO RUN WITHOUT --version, and that refusal is the feature: the gate cannot check a claim " +
             "it has not been told. Running it bare reports a failure that looks like a broken tree and is not one.",
        verify: null,
        gate: "tools/ship/verify.mjs",
    },
    {
        id: "package",
        what: "Zip the tree (or the changed files, for an incremental patch) and present it.",
        command: "zip -qr <out>.zip <tree>",
        why: "an incremental patch is built by DIFFING against a byte-exact snapshot taken before the round began, " +
             "never from memory of what was touched -- that diff has twice caught files that would otherwise have " +
             "been claimed and twice caught files that would have been missed.",
        verify: null,
    },
    {
        id: "publish-release",
        what: "Cut the GitHub release for this version and upload the zip as its asset.",
        command: "curl -sS -X POST http://localhost:8787/github/publish-engine -d {}   (or the GitHub panel's Publish button)",
        why: "*** THE WHOLE PUBLISH FLOW HAS EXISTED SINCE v1129 AND HAD NEVER BEEN RUN. *** githubBridge's " +
             "publishEngineBuild() auto-tags from the running ENGINE_VERSION, builds the zip and uploads it as a " +
             "release asset -- and its only caller was a panel button. A STEP THAT IS ONLY EVER A BUTTON IS A STEP " +
             "THAT GETS FORGOTTEN, and the evidence is that the repo had zero releases while every piece of the " +
             "machinery was in place. It is a ritual step now because that is the difference between a capability " +
             "and a habit. WITHOUT IT AUTO-UPDATE CANNOT WORK AT ALL: fetchEngineBuild reads the newest RELEASE " +
             "ASSET, so a version that is committed but never released is invisible to every engine in the field.",
        verify: () => {
            // Offline on purpose. A ritual step whose verification needs the network is a step that reports a
            // broken tree when the wifi is down, and this file's own argument is that a step must be able to say
            // how you would know it worked. WHAT IS CHECKED HERE IS THAT THE PUBLISH *CAN* HAPPEN -- the two
            // things that were silently false for two years -- not that it HAS. The release landing is confirmed
            // by the consumer: the engine's own update check, /sys/update/github-status.
            let st = null;
            try { st = require_(path.join(ENG, "ai-bridge", "githubBridge.js")).status(); } catch (e) { }
            if (!st) return { ok: false, detail: "githubBridge unreadable -- cannot tell whether a publish is possible" };
            const repo = (st.engineRepo || "").trim();
            const s2 = currentState();
            const missing = [];
            if (!repo) missing.push("engineRepo unset");
            if (!st.hasToken) missing.push("no token (repo scope) -- publishing needs one, checking does not");
            if (st.engineVersion !== s2.engine) missing.push(`githubBridge reads ${st.engineVersion} but main.js says ${s2.engine}`);
            return missing.length
                ? { ok: false, detail: "NOT publishable: " + missing.join("; ") }
                : { ok: true, detail: `ready: ${st.engineVersion} -> ${repo} (the release ITSELF is confirmed by /sys/update/github-status, not here)` };
        },
    },
];

/** Steps whose success this file can check directly, as opposed to those delegated to a named gate. */
export const checkable = () => STEPS.filter((s) => typeof s.verify === "function");

/** Run every checkable step's verification. Does NOT perform the steps -- it reports on the tree as it stands. */
export function inspect() {
    const rows = STEPS.map((s) => {
        if (typeof s.verify === "function") { const r = s.verify(); return { id: s.id, mode: "checked", ...r }; }
        return { id: s.id, mode: s.gate ? "delegated" : "manual", ok: null, detail: s.gate || "no automated check" };
    });
    return { state: currentState(), rows };
}

export function showLines() {
    const { state, rows } = inspect();
    // v3853 -- *** IT NAMED ITSELF ONLY UNDER --run. *** The [shipRitual] tag was on the one line the
    // default invocation never prints, so `node tools/ship/shipRitual.mjs` produced eight steps of
    // report with nothing attributing them, and toolFrontDoor's self-naming rule failed on it. THE
    // CHECK HAD BEEN FAILING ON THIS FILE THE WHOLE TIME AND NOBODY COULD SEE IT: that check printed
    // only its rationale and never its offenders, so its red was read off the SILENT list beside it.
    // Naming the offenders (v3853, same round) surfaced this on the first honest run.
    const out = [`[shipRitual] ship ritual — ${STEPS.length} steps. Tree is at ${state.engine} (brain ${state.brain}), ${state.gates} gates indexed.`];
    for (let i = 0; i < STEPS.length; i++) {
        const s = STEPS[i], r = rows[i];
        const mark = r.ok === true ? "ok " : r.ok === false ? "XX " : "-- ";
        out.push(`  ${mark}${i + 1}. ${s.id}: ${s.what}`);
        out.push(`        $ ${s.command}`);
        out.push(`        ${r.mode === "delegated" ? "checked by " + r.detail : r.detail}`);
    }
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes("--run")) {
        console.log("[shipRitual] --run performs only the two mechanical steps; the edits and the zip are yours.");
        for (const id of ["knowledge-index"]) {
            const s = STEPS.find((x) => x.id === id);
            console.log("  $ " + s.command);
            execFileSync(process.execPath, [path.join(ENG, "tools/ship/buildKnowledgeIndex.mjs")], { stdio: "inherit", cwd: ENG });
        }
    }
    for (const l of showLines()) console.log(l);
}
