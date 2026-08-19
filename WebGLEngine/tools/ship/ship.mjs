// WebGLEngine/tools/ship/ship.mjs -- the whole ritual, one command, one exit code.
//
// WHY THIS EXISTS. v2509 shipped a zip that the gate had explicitly refused. The gate printed
// "1 FAILURE(S) -- DO NOT SHIP" and the zip went to the outputs folder anyway.
//
// The mechanism was a pipe: `node verify.mjs ... | tail -1`. A shell pipeline exits with the status of its LAST
// command, and tail always succeeds -- so a red gate became a green chain. Every ship for twenty-odd versions had
// that pipe in it. It only cost something the one time the gate had something to say.
//
// But the pipe is not the hole. THE HOLE IS THAT THE RITUAL WAS A CHAIN OF COMMANDS SOMEONE HAD TO ASSEMBLE
// CORRECTLY, FROM MEMORY, EVERY TIME. Bump, changelog, verify, rename, zip, verify the zip, round-trip, copy, trim.
// Nine steps, each with an exit code someone has to notice. That is not a gate; it is an exam you re-sit each round
// and pass by habit.
//
// And the reassurance was the real trap. verify_zip.py prints "SHIP GATE: GREEN" -- it calls itself the ship gate,
// while knowing NOTHING about verify.mjs. It checks the zip carries the right version and marker. It does. Two
// scripts, one name, and the eye lands on the reassuring one.
//
// So: one command. It refuses at the first failure and nothing downstream runs. There is no chain to assemble
// wrong and no second opinion to mistake for the first.
//
//   node tools/ship/ship.mjs --version v2510 --markers "a,b" [--dry-run]
//
// Exit 0 means the zip is in outputs and every gate agreed. Exit non-zero means it is not, and why.
"use strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, "..", "..");        // .../SweK_Engine_vNNNN/WebGLEngine
const PROJECT = path.resolve(ENGINE, "..");           // .../SweK_Engine_vNNNN
const WORK = path.resolve(PROJECT, "..");             // .../work
const OUTPUTS = "/mnt/user-data/outputs";

const argv = process.argv;
const arg = (name, def = null) => { const i = argv.indexOf(name); return i > 0 && argv[i + 1] ? argv[i + 1] : def; };
const version = arg("--version");
const markers = arg("--markers", "");
const dryRun = argv.includes("--dry-run");

if (!version || !/^v\d+$/.test(version)) {
    console.error("\nusage: node tools/ship/ship.mjs --version vNNNN --markers \"a,b\" [--dry-run]\n");
    process.exit(2);
}

let step = 0;
const say = (msg) => console.log("  " + msg);
// Every stage goes through here. There is no way to run a stage and forget to check it, because checking it IS
// running it. A stage that throws stops the ritual: nothing downstream gets a chance to print something green.
function stage(name, fn) {
    step++;
    process.stdout.write("[" + step + "] " + name + " ... ");
    try {
        const note = fn();
        console.log("ok" + (note ? "  " + note : ""));
    } catch (e) {
        console.log("FAILED");
        console.log("");
        console.log("  " + String((e && e.message) || e).split("\n").slice(0, 12).join("\n  "));
        console.log("");
        console.log("  RITUAL STOPPED at step " + step + ". Nothing was copied to outputs.");
        process.exit(1);
    }
}

// execFileSync THROWS on a non-zero exit, which is exactly what we want and exactly what a pipe would have hidden.
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", timeout: 900000, ...opts });

console.log("\nSweK ship ritual -- " + version + (dryRun ? "   (dry run: no zip, no outputs)" : ""));
console.log("");

stage("the version markers agree", () => {
    const main = fs.readFileSync(path.join(ENGINE, "main.js"), "utf8");
    const brain = fs.readFileSync(path.join(ENGINE, "brain", "brain.js"), "utf8");
    const mv = (main.match(/ENGINE_VERSION\s*=\s*"(v\d+)"/) || [])[1];
    const bv = (brain.match(/BRAIN_BUILD\s*=\s*"(v\d+)"/) || [])[1];
    if (mv !== version) throw new Error("main.js says ENGINE_VERSION = " + mv + ", you asked for " + version);
    if (bv !== version) throw new Error("brain.js says BRAIN_BUILD = " + bv + ", main.js says " + mv + " -- they must match");
    return mv + " in both";
});

stage("no changelog backups left behind", () => {
    const strays = ["BACKLOG.md.bak", "TODO.md.bak"].filter((f) => fs.existsSync(path.join(PROJECT, f)));
    if (strays.length) throw new Error("delete these first: " + strays.join(", "));
    return "clean";
});

// v3081 -- THE HOLE THAT LET v3041..v3080 SHIP WITH NO RECORD.
//
// The stage above checks for leftover .bak files. That verifies the changelog tool was CLEANED UP AFTER, not
// that it was ever RUN. verify.mjs gets closer -- it asserts BACKLOG.md and TODO.md are NON-EMPTY, the
// emoji-blanking guard -- but non-empty is satisfied by a two-megabyte file whose newest entry is forty
// versions old. So nothing anywhere asserted that an entry existed FOR THE VERSION BEING SHIPPED.
//
// Forty rounds of real work shipped through a fully green gate while BACKLOG.md and TODO.md both stopped at
// v3040. The code all landed; only the reasoning went unwritten. changelog.mjs was a MANUAL command run
// adjacent to the ritual, so it survived exactly as long as someone's habit did.
//
// "A CHECK NOT IN THE GATE IS NOT BEING RUN." This is that law collecting on itself, in the very tool whose
// stated purpose is to do the ritual correctly, from memory, every time.
stage("the changelog names this version", () => {
    const missing = [];
    for (const f of ["BACKLOG.md", "TODO.md"]) {
        let text = "";
        try { text = fs.readFileSync(path.join(PROJECT, f), "utf8"); }
        catch (e) { throw new Error(f + " is unreadable at " + PROJECT + " -- " + (e && e.message)); }
        // BACKLOG headings are "## vNNNN -- ...", TODO lines are "- vNNNN: ...". Match the version as a whole
        // token either way, anchored to line start, so a passing MENTION of the version inside some other
        // round's prose cannot satisfy this.
        const re = new RegExp("^(## |- )" + version + "\\b", "m");
        if (!re.test(text)) missing.push(f);
    }
    if (missing.length) {
        throw new Error(
            "no entry for " + version + " in " + missing.join(" or ") + ". Run changelog.mjs BEFORE shipping:\n" +
            "    node tools/ship/changelog.mjs --backlog <file> [--todo <file>]\n" +
            "NON-EMPTY IS NOT THE SAME AS CURRENT -- this exact gap is how v3041..v3080 shipped green with the " +
            "record frozen at v3040.");
    }
    return version + " present in BACKLOG.md and TODO.md";
});

// THE GATE. Unpiped, and its exit code is the whole point -- this is the step v2509 skipped.
stage("verify.mjs (the actual gate)", () => {
    let out;
    try {
        out = run(process.execPath, ["tools/ship/verify.mjs", "--version", version, ...(markers ? ["--markers", markers] : [])], { cwd: ENGINE });
    } catch (e) {
        const text = String((e && e.stdout) || "");
        const fails = text.split("\n").filter((l) => /\[verify\] FAIL/.test(l));
        throw new Error("the gate said NO:\n" + (fails.join("\n") || text.slice(-600)));
    }
    const m = out.match(/\[verify\] ALL GREEN/);
    // Belt and braces: exit 0 AND the words. If verify.mjs ever exits 0 without printing its verdict, that is a bug
    // in the gate, and a ritual that trusts a silent success is how this went wrong in the first place.
    if (!m) throw new Error("verify.mjs exited 0 but did not say ALL GREEN -- refusing to trust a silent pass");
    return "ALL GREEN";
});

// v2512 -- DOES THE C ACTUALLY COMPILE? v2508 shipped a box3d_shim.c with FIFTEEN redefinition errors, and it
// stayed broken through v2509 and v2511 because nothing here had ever tried to compile a C file -- and I had never
// checked whether anything could. gcc was in /usr/bin the whole time. Keith's emcc found it in 45 seconds.
//
// It runs BEFORE the selfchecks because it takes one second and they take a hundred. Fail fast on the cheap check.
stage("the box3d shim is valid C", () => {
    let out;
    try {
        out = run(process.execPath, ["tools/ship/shimCompiles.mjs"], { cwd: ENGINE });
    } catch (e) {
        throw new Error(String((e && e.stdout) || e.message).trim());
    }
    if (/SKIPPED/.test(out)) return "SKIPPED -- " + out.split("--")[1].trim().split("\n")[0] + "  (NOT a pass)";
    const m = out.match(/valid C \((\d+) swk_/);
    return m ? m[1] + " swk_ functions compile" : "ok";
});

// v2511 -- EVERY SELFCHECK IN THE TREE. 89 files named *selfcheck*.mjs exist; FOUR were gated. The other 85 ran
// when somebody remembered, i.e. after something had already gone wrong. Each was written on purpose by someone
// who had just been bitten, and then quietly stopped being run.
//
// It gets its OWN STAGE rather than living inside verify.mjs, and that is not tidiness. Nested inside verify --
// which by then has run every physics suite and parsed 2.5 MB of page script -- the RL checks that train small
// neural nets took 3x longer and timed out, at 30s AND at 60s, while passing standalone. A fresh process has a
// clean heap. The alternative was raising the budget until red turned green, which is not a fix.
stage("every selfcheck in the tree (~100s)", () => {
    let out;
    try {
        out = run(process.execPath, ["tools/ship/selfchecks.mjs"], { cwd: ENGINE });
    } catch (e) {
        const text = String((e && e.stdout) || "");
        const fails = text.split("\n").filter((l) => /FAIL {2}|TIMED OUT/.test(l));
        throw new Error("selfchecks said NO:\n" + (fails.slice(0, 8).join("\n") || text.slice(-500)));
    }
    const m = out.match(/selfchecks: (\d+)\/(\d+) pass in ([\d.]+)s/);
    if (!m || m[1] !== m[2]) throw new Error("selfchecks exited 0 without a clean verdict:\n" + out.slice(-300));
    return m[1] + "/" + m[2] + " in " + m[3] + "s";
});

if (dryRun) {
    console.log("");
    console.log("  DRY RUN: the gates pass. Re-run without --dry-run to zip and publish.");
    console.log("");
    process.exit(0);
}

const expectedDir = "SweK_Engine_" + version;
const zipPath = path.join("/home/claude/out", expectedDir + ".zip");

stage("the project folder is named for this version", () => {
    const current = path.basename(PROJECT);
    if (current === expectedDir) return "already " + expectedDir;
    const target = path.join(WORK, expectedDir);
    if (fs.existsSync(target)) throw new Error(target + " already exists -- remove it or ship a different version");
    fs.renameSync(PROJECT, target);
    return current + " -> " + expectedDir;
});

// Everything below runs against the RENAMED path, which this process cannot see through its own constants.
// Re-derive rather than reuse: PROJECT was resolved before the rename and is now a path that does not exist.
const PROJECT_NOW = path.join(WORK, expectedDir);

stage("zip", () => {
    fs.mkdirSync("/home/claude/out", { recursive: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    const excludes = ["*/node_modules/*", "*/.git/*", "*.bak", "*/__pycache__/*", "*/.DS_Store", "*/.venv/*",
                      "*/.stranded.json", "*/.sweep-stranded.json"];
    run("zip", ["-rq", zipPath, expectedDir, ...excludes.flatMap((e) => ["-x", e])], { cwd: WORK });
    const mb = (fs.statSync(zipPath).size / 1048576).toFixed(1);
    return mb + " MB";
});

stage("verify_zip.py (the zip carries what it claims)", () => {
    // NOTE: this script prints "SHIP GATE: GREEN". It is NOT the ship gate -- it checks the zip's contents and
    // knows nothing about verify.mjs. That name is why a red gate read as green in v2509. It runs here as one step
    // among several, which is the only honest place for it.
    const out = run("python3", ["/mnt/skills/user/ship-ritual/scripts/verify_zip.py",
        "--zip", zipPath, "--version", version,
        "--version-file", expectedDir + "/WebGLEngine/main.js",
        "--marker", (markers.split(",")[0] || version).trim(),
        "--project-prefix", "SweK_Engine"]);
    if (!/GREEN/.test(out)) throw new Error(out.slice(-400));
    return "contents match " + version;
});

stage("round-trip: the zip unpacks to exactly what we zipped", () => {
    const rt = "/tmp/rt-" + version;
    fs.rmSync(rt, { recursive: true, force: true });
    fs.mkdirSync(rt, { recursive: true });
    run("unzip", ["-q", zipPath], { cwd: rt });
    try {
        run("diff", ["-r", "--exclude=node_modules", path.join(rt, expectedDir), PROJECT_NOW]);
    } catch (e) {
        throw new Error("the unpacked zip differs from the tree:\n" + String((e && e.stdout) || "").slice(0, 500));
    } finally {
        fs.rmSync(rt, { recursive: true, force: true });
    }
    return "byte-identical";
});

stage("publish to outputs, and trim the previous zip", () => {
    fs.copyFileSync(zipPath, path.join(OUTPUTS, expectedDir + ".zip"));
    // ONE zip per turn. An outputs folder with three versions in it is three chances to hand someone the wrong one.
    // v2601 -- KEEP THE PREVIOUS ZIP. KEITH CAUGHT THIS: "i got 2599, but you were working on 2600."
    //
    // The old rule was ONE ZIP PER TURN, and its reasoning was sound: an outputs folder with three versions in
    // it is three chances to hand him the wrong one. THE COST WAS INVISIBLE UNTIL HE NAMED IT. v2599 was
    // presented to him with a link; a later v2600 ship ran; ITS TRIM DELETED v2599 WHILE THAT LINK WAS STILL
    // THE ONE ON HIS SCREEN. He got the file in time. THE LINK DID NOT SURVIVE THE NEXT TURN.
    //
    // A LINK I GAVE YOU IS A PROMISE, AND THE TRIM WAS BREAKING IT ON MY BEHALF, SILENTLY, ONE TURN LATER.
    //
    // So: keep the CURRENT and the PREVIOUS. That is a rule I can actually keep -- A LINK I GAVE YOU SURVIVES
    // AT LEAST UNTIL I GIVE YOU THE NEXT ONE -- and it still refuses to let a third stale version pile up.
    const KEEP = 2;
    const mine = fs.readdirSync(OUTPUTS)
        .filter((f) => /^SweK_Engine_v(\d+)\.zip$/.test(f))
        .sort((a, b) => Number(b.match(/v(\d+)/)[1]) - Number(a.match(/v(\d+)/)[1]));   // newest first, NUMERICALLY
    let removed = 0;
    for (const f of mine.slice(KEEP)) { fs.unlinkSync(path.join(OUTPUTS, f)); removed++; }
    const kept = mine.slice(0, KEEP).filter((f) => f !== expectedDir + ".zip");
    return "published" + (kept.length ? ", kept " + kept.join(" ") + " so its link still works" : "") + (removed ? ", removed " + removed + " older" : "");
});

console.log("");
console.log("  SHIPPED: " + path.join(OUTPUTS, expectedDir + ".zip"));
console.log("  Every gate ran and every gate agreed. present_files it.");
console.log("");
