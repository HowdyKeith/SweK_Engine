// tools/mutate/mutate.mjs -- which of these checks could actually fail?
//
// This engine has 95 selfchecks and 84 of them pass. That sounds like health, and v2493 is the reason it is not.
// The lockstep selfchecks passed 7/7 and 6/6 while cross-peer combat died at 2% packet loss, silently, for two
// hundred versions. They were sound. They were present. They tested LATENCY -- the one failure the input delay was
// specifically designed to absorb -- so they were testing the feature against itself, reporting success, and
// proving nothing. Nothing in "84 pass" distinguishes a check like that from a real one.
//
// The whole session has circled one law: A CONTROL THAT CANNOT FAIL IS DECORATION. A tolerance is only meaningful
// against the run that actually happens. A baseline taken from the code under test detects change, never
// wrongness. Every one of those is the same idea, and every time it was found by hand, by noticing.
//
// This is that idea, mechanised. Break the code on purpose -- flip a constant, drop a term, skip a step -- and see
// whether the check notices. If the check still passes, THE MUTATION SURVIVED, and the check does not cover that
// behaviour no matter how green it looks. A surviving mutation is not a bug in the code. It is a hole in the net,
// and it says so out loud without anyone needing a hunch.
//
// HOW IT IS SAFE, AND THE FIRST DESIGN WAS NOT.
//
// The first version mutated the real tree and restored it in a `finally`. That is safe against an exception and
// USELESS AGAINST A KILL -- and the very first run exceeded its time limit, was killed, and left `33/35` sitting in
// blobPhantom.js where `32/35` belongs. The gate went red for real, on real source, and the next run's control
// caught it and refused to produce verdicts. Which is the harness working exactly as designed, on itself, having
// been broken by itself.
//
// A finally block does not survive SIGKILL. So this now writes a STRANDED MARKER before touching anything: a file
// naming what was mutated and the bytes to put back. If a run is killed, the next one finds the marker, restores
// from it, and says so. The tree is never left broken by a process that did not get to finish -- which matters
// more than it sounds, because the failure mode is a mutated engine that LOOKS fine and ships.
//
// AND THE CONTROL IS NOT OPTIONAL, WHICH THIS FILE LEARNED ABOUT ITSELF BEFORE IT EVER RAN. The first version
// invoked the gate with a made-up version string, so the gate failed on the VERSION MARKER -- before any mutation.
// Every mutation would then have been reported CAUGHT, 10 out of 10, a perfect score, and every one of them a lie.
// A mutation harness that cannot report a survivor is precisely the decoration it exists to find. So: BEFORE any
// mutation, prove the gate is GREEN on the untouched tree. If it is not, every verdict below is garbage and this
// refuses to produce any.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {fileURLToPath, pathToFileURL} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MARKER = path.join(ROOT, "tools", "mutate", ".stranded.json");

// If a previous run was killed mid-mutation, put the file back before doing anything else.
function recoverStranded() {
    if (!fs.existsSync(MARKER)) return false;
    try {
        const s = JSON.parse(fs.readFileSync(MARKER, "utf8"));
        const full = path.join(ROOT, s.file);
        const now = fs.readFileSync(full, "utf8");
        if (now !== s.original) {
            fs.writeFileSync(full, s.original);
            console.log("[mutate] RECOVERED a stranded mutation in " + s.file + " (a previous run was killed before it could restore).");
        }
        fs.unlinkSync(MARKER);
        return true;
    } catch (e) {
        console.log("[mutate] a stranded marker exists but could not be applied: " + e.message);
        return false;
    }
}

// Each mutation names a real behaviour and breaks it in a way a competent gate MUST notice. The `expect` field is
// which check should scream. If nothing screams, that behaviour is unguarded.
// v2884 -- (already exported at the foot of this file; the note below is why a gate now reads it.)
//
// A MUTATION TABLE ROTS, AND A ROTTED ENTRY IS A FALSE PASS. If a find-string no longer appears in its target
// file -- a refactor, a rename, a reformat -- the mutation applies NOTHING, the gate stays green, and this
// harness reports CAUGHT. That is a control that cannot fail, appearing inside the tool built to find controls
// that cannot fail. It happened: "the spiky kernel's constant is off by 1/15" looked for Math.pow(h, 6) after
// kernels.js was refactored to a _p6(h) helper, and had been silently mutating nothing since.
const MUTATIONS = [
    { name: "poly6's normalising constant is wrong by one part in 315",
      file: "physics/sph/kernels.js", find: "315 / (64 * Math.PI", replace: "314 / (64 * Math.PI",
      breaks: "SPH mass conservation -- the kernel would no longer integrate to 1" },
    { name: "the spiky kernel's constant is off by 1/15",
      file: "physics/sph/kernels.js", find: "15 / (Math.PI * _p6(h))", replace: "14 / (Math.PI * _p6(h))",
      breaks: "SPH pressure -- the kernel would not integrate to 1" },
    { name: "SPH pressure loses its density symmetry (momentum invented)",
      file: "physics/sph/sph.js", find: "(a.p/(a.rho*a.rho) + b.p/(b.rho*b.rho))", replace: "(a.p/(a.rho*a.rho) + b.p/(a.rho*a.rho))",
      // v2886 CORRECTION. v2884 declared this ambiguity and got the direction BACKWARDS: it claimed the first
      // occurrence was the brute-force loop and therefore the one the gates exercise. IT IS THE GRID LOOP, and
      // the gates do NOT exercise it -- they use ~200 particles against a GRID_CROSSOVER of 1000. So the
      // mutation patched dead code, the gate stayed green, and it has been reported SURVIVED since v2494.
      // MEASURED: mutate the first occurrence and the weight check does not move at all (0.155519, identical to
      // six decimals). Mutate the second and it FAILS at 0.861836 against a 0.25 tolerance. The gate v2494 built
      // works perfectly; the mutation was never reaching it. Now replaceAll patches both paths.
      occurrences: 2, covers: "both pressure loops (grid and brute-force) since v2886 -- replaceAll",
      breaks: "momentum conservation -- the exact bug v2484 caught by hand" },
    { name: "the metaball shadow constant 32/35 becomes 33/35",
      file: "simulation/tomo/blobPhantom.js", find: "32 / 35", replace: "33 / 35",
      breaks: "the closed-form X-ray shadow" },
    { name: "the fluid's shadow amplitude drops its 315/64pi",
      file: "physics/sph/sph.js", find: "o.mass * 315 / (64 * Math.PI * Math.pow(o.h, 3))", replace: "o.mass * 316 / (64 * Math.PI * Math.pow(o.h, 3))",
      breaks: "the fluid selfie -- shadow vs the field it is drawn from" },
    { name: "FDTD's electric update loses its 1/eps",
      file: "simulation/em/fdtd1d.js", find: "cE[i] = S / epsR[i]", replace: "cE[i] = S",
      breaks: "Fresnel -- every material would behave like vacuum" },
    { name: "the Ewald arc forgets it is an arc (flat = the slice theorem)",
      file: "simulation/tomo/diffraction.js", find: "par: -(k - Math.sqrt(k * k - w * w))", replace: "par: 0",
      breaks: "diffraction -- ray tomography would look exactly right at every wavelength" },
    { name: "lockstep stops resending inputs (v2493's fatal bug, restored)",
      file: "physics/box3dLockstepNet.js", find: "const redundancy = opts.redundancy != null ? opts.redundancy : 4;", replace: "const redundancy = 0;",
      breaks: "cross-peer play on a lossy wire -- the bug that hid for 200 versions" },
    { name: "lockstep accepts inputs for ticks it already stepped",
      file: "physics/box3dLockstep.js", find: "if (t < tick) { staleDropped++; return false; }", replace: "if (false) { staleDropped++; return false; }",
      breaks: "the input-buffer leak" },
    { name: "the policy store accepts a worse policy",
      file: "brain/blobPolicyStore.js", find: "if (cur && cur.score >= sub.score)", replace: "if (false)",
      breaks: "the ratchet -- training would become a random walk" },
];

function runCheck(cmd, args, timeout = 200000) {
    try {
        const out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
        return { ok: true, out };
    } catch (e) {
        return { ok: false, out: String(e.stdout || "") + String(e.stderr || "") };
    }
}

// The gate, as a single yes/no. A mutation must turn this red. The version is read from the engine itself so the
// gate never fails for the boring reason of a version string I invented.
function engineVersion() {
    const m = fs.readFileSync(path.join(ROOT, "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
    if (!m) throw new Error("cannot read ENGINE_VERSION from main.js");
    return m[1];
}
function gateIsGreen(version) {
    const r = runCheck("verify", ["tools/ship/verify.mjs", "--version", version]);
    return r.ok && /ALL GREEN/.test(r.out);
}

async function main() {
    recoverStranded();
    const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
    // A full gate run is ~40s, so ten mutations is over six minutes. --slice a,b runs a window of them, which is
    // also how this gets used in anger: you do not re-run the whole set to check one hole you just plugged.
    const sl = process.argv.includes("--slice") ? process.argv[process.argv.indexOf("--slice") + 1].split(",").map(Number) : null;
    let list = only ? MUTATIONS.filter((m) => m.name.includes(only)) : MUTATIONS;
    if (sl) list = list.slice(sl[0], sl[1]);
    // A filter that selects nothing and then reports "0/0 caught" is a pass that means nothing -- the same shape as
    // every other decoration this session has found. Say so instead.
    if (list.length === 0) {
        console.log("[mutate] --only " + JSON.stringify(only) + " matched NO mutations. Refusing to report a score on an empty set.");
        console.log("         available:");
        for (const m of MUTATIONS) console.log("           " + m.name);
        process.exit(2);
    }
    const version = engineVersion();

    // THE CONTROL, and it is load-bearing: if the gate is already red, every "CAUGHT" below is a lie.
    process.stdout.write("[mutate] control: is the gate green on the untouched tree? ");
    if (!gateIsGreen(version)) {
        console.log("NO.\n");
        console.log("   The gate is already failing at " + version + ". Every mutation would be reported CAUGHT and every");
        console.log("   one would be meaningless. Refusing to produce verdicts. Fix the gate, then run this.");
        process.exit(2);
    }
    console.log("yes (" + version + ").\n");
    console.log("[mutate] breaking the code on purpose, " + list.length + " ways, to see which breaks the gate notices.\n");
    const results = [];
    for (const m of list) {
        const full = path.join(ROOT, m.file);
        const original = fs.readFileSync(full, "utf8");
        if (!original.includes(m.find)) {
            results.push({ ...m, state: "STALE", detail: "the text to mutate is not in the file any more" });
            console.log("   STALE     " + m.name);
            continue;
        }
        let caught = false, detail = "";
        try {
            // the marker goes down FIRST, so a kill at any point after this is recoverable by the next run
            fs.writeFileSync(MARKER, JSON.stringify({ file: m.file, original, name: m.name }));
            // v2886 -- replaceAll, not replace. String.replace with a string pattern patches ONE occurrence, and that
            // cost this project a phantom survivor for ~390 versions: the SPH density-symmetry mutation landed on the
            // GRID pressure loop while every SPH gate runs the BRUTE-FORCE one (200 particles, crossover 1000). It
            // mutated a path nothing executes, the gate stayed green, and it was reported SURVIVED -- a hole in the
            // MUTATION, read for years as a hole in the gate. A mutation should break the BEHAVIOUR, not whichever
            // implementation of it happens to appear first.
            fs.writeFileSync(full, original.replaceAll(m.find, m.replace));
            const green = gateIsGreen(version);
            caught = !green;
            detail = green ? "the gate stayed GREEN" : "the gate went red, as it must";
        } finally {
            fs.writeFileSync(full, original);
            // paranoia, and cheap: prove the file really is back before dropping the safety net
            if (fs.readFileSync(full, "utf8") !== original) throw new Error("RESTORE FAILED for " + m.file + " -- the tree is now mutated. Fix by hand.");
            try { fs.unlinkSync(MARKER); } catch {}
        }
        results.push({ ...m, state: caught ? "CAUGHT" : "SURVIVED", detail });
        console.log("   " + (caught ? "CAUGHT   " : "SURVIVED ") + m.name);
        if (!caught) console.log("             -> nothing noticed. Unguarded: " + m.breaks);
    }
    const survived = results.filter((r) => r.state === "SURVIVED");
    const stale = results.filter((r) => r.state === "STALE");
    console.log("\n[mutate] " + results.filter((r) => r.state === "CAUGHT").length + "/" + results.length + " caught" +
                (survived.length ? ", " + survived.length + " SURVIVED" : "") + (stale.length ? ", " + stale.length + " stale" : ""));
    if (survived.length) {
        console.log("\n   A SURVIVING MUTATION IS NOT A BUG IN THE CODE. It is a hole in the net:");
        for (const s of survived) console.log("      " + s.name + "\n         unguarded: " + s.breaks);
    }
    return results;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const r = await main();
    process.exit(r.some((x) => x.state === "SURVIVED") ? 1 : 0);
}
export { MUTATIONS, main };
