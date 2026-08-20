// tools/mutate/sweep.mjs -- run the machine-generated mutations and report what nothing noticed.
//
// This uses physicsSuite directly rather than the whole ship gate: ~15s a run instead of ~45s, which is the
// difference between a sweep you can actually run and one you admire in the changelog.
//
// READ THE SURVIVORS WITH JUDGEMENT. The scanner cannot tell PHYSICS from PLUMBING. A surviving mutation on a
// grid resolution or a default particle count is not a hole -- those are free parameters and the answer is
// supposed to be independent of them. A surviving mutation on the speed of light IS a hole. The tool finds the
// candidates; the reading is the work.
//
// AND ONE PERTURBATION SIZE IS NOT ENOUGH, WHICH THIS TOOL LEARNED BY LYING TO ME (v2497).
//
// At a flat 3% it reported three survivors in fbp.js AND ALL THREE WERE ARTEFACTS OF MY OWN STEP SIZE. The worst
// was the pixel centre: `x = -1 + (2*(px + 0.5))/n`. Changing 0.5 by 3% shifts the sampling grid by ONE AND A HALF
// PERCENT OF ONE PIXEL -- invisible, and its survival says nothing about the gate. The REAL bug at that line has a
// name, off-by-half, so I made THAT mutation instead (0.5 -> 0.0, pixel centre to pixel corner) and the gate caught
// it instantly: the blobulator reconstruction went from 0.110% to 12.308%.
//
// The asymmetry is structural. 3% of a SCALE constant (c, 315, 32/35) moves the answer 3%. 3% of an OFFSET moves
// it by 3% OF THE OFFSET, which is a rounding error. So this now ESCALATES: try a small change, and if the gate
// shrugs, try one big enough that no honest check could miss it. Only a constant that survives BOTH is reported as
// a hole. A tool that cries wolf gets ignored, which is worse than not having it.
//
// AND THE PINNED RATIO TURNS OUT TO BE A FINGERPRINT OF WHAT A FILE *IS* (v2498), which was not the plan:
//
//     physics/sph/kernels.js        9/9    pure law -- every constant, including the exponents in pow(h,9)
//     simulation/tomo/diffraction.js 3/3   pure law (after v2497 plugged the diffraction limit)
//     simulation/tomo/fbp.js        8/9    law, plus one buffer length that SHOULD survive
//     simulation/tomo/blobPhantom.js ~14/27  HALF LAW, HALF FIXTURE
//     simulation/em/fdtd1d.js        3/7    law plus free parameters -- AND ONE REAL HOLE (the speed of light)
//
// blobPhantom is the interesting one. Every single survivor there is a default argument, an RNG mixing constant,
// or a blob placement/size term -- the machinery that GENERATES THE TEST DATA. Its physics (32/35, the 3.5
// exponent, the Radon integral) is pinned. Move the blobs and the shadow of a blob somewhere else is still exactly
// right, so the data constants SHOULD survive, and they do. THE SWEEP SEPARATED LAW FROM FIXTURE WITHOUT BEING
// TOLD WHICH WAS WHICH, and the ratio is a measurement rather than an opinion about the file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mutationsFor } from "./scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const MARKER = path.join(HERE, ".sweep-stranded.json");

function recover() {
    if (!fs.existsSync(MARKER)) return;
    try {
        const s = JSON.parse(fs.readFileSync(MARKER, "utf8"));
        fs.writeFileSync(path.join(ROOT, s.file), s.original);
        fs.unlinkSync(MARKER);
        console.log("[sweep] RECOVERED a stranded mutation in " + s.file);
    } catch {}
}

function suiteIsGreen() {
    try {
        const out = execFileSync(process.execPath, ["--input-type=module", "-e",
            'import { runSuite } from "./tools/ship/physicsSuite.mjs"; const r = runSuite(); console.log(r.rows.every(x=>x.pass) ? "SUITE_GREEN" : "SUITE_RED");'],
            { cwd: ROOT, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
        return /SUITE_GREEN/.test(out);
    } catch { return false; }
}

const file = process.argv[2];
if (!file) { console.log("usage: node tools/mutate/sweep.mjs <file> [--frac 0.03]"); process.exit(1); }
// Escalating ladder: a typo-sized error, then one nothing sensible could miss.
const FRACS = [0.03, 0.5];
recover();

const rel = path.relative(ROOT, path.resolve(file));
const full = path.join(ROOT, rel);
const original = fs.readFileSync(full, "utf8");
const byFrac = FRACS.map((fr) => ({ fr, muts: mutationsFor(full, { frac: fr }) }));

// THE CONTROL. If the suite is red before anything is touched, every verdict below is noise.
process.stdout.write("[sweep] control: is the suite green untouched? ");
if (!suiteIsGreen()) { console.log("NO -- refusing to produce verdicts."); process.exit(2); }
console.log("yes.\n");
// Each constant costs a physicsSuite run (~15s), and a survivor costs two. 27 constants is seven minutes, which
// is longer than a single command gets. --slice a,b runs a window, which is also how it gets used in anger: you do
// not re-sweep a whole file to recheck the one hole you just plugged.
const sl = process.argv.includes("--slice") ? process.argv[process.argv.indexOf("--slice") + 1].split(",").map(Number) : null;
if (sl) for (const b of byFrac) b.muts = b.muts.slice(sl[0], sl[1]);
const total = byFrac[0].muts.length;
console.log("[sweep] " + rel + ": " + total + " constants, escalating " + FRACS.map((f) => (f*100) + "%").join(" then ") + " -- a constant is only");
console.log("        reported as a hole if it survives a change no honest check could miss.\n");

const tryOne = (m) => {
    try {
        fs.writeFileSync(MARKER, JSON.stringify({ file: rel, original }));
        fs.writeFileSync(full, m.mutated);
        return suiteIsGreen();
    } finally {
        fs.writeFileSync(full, original);
        if (fs.readFileSync(full, "utf8") !== original) throw new Error("RESTORE FAILED for " + rel);
        try { fs.unlinkSync(MARKER); } catch {}
    }
};

const holes = [];
for (let i = 0; i < total; i++) {
    const small = byFrac[0].muts[i];
    if (!tryOne(small)) { console.log("   caught at " + (FRACS[0]*100) + "%    line " + String(small.line).padStart(4) + "  " + small.was + " -> " + small.now); continue; }
    // it shrugged at a typo. Try one it cannot honestly ignore.
    const big = byFrac[1].muts[i];
    if (!tryOne(big)) { console.log("   caught at " + (FRACS[1]*100) + "%   line " + String(big.line).padStart(4) + "  " + big.was + " -> " + big.now + "   (the small change was below its noise floor -- fine)"); continue; }
    holes.push(big);
    console.log("   SURVIVED BOTH  line " + String(big.line).padStart(4) + "  " + small.was + " -> " + big.now + "   " + big.context);
}
console.log("\n[sweep] " + (total - holes.length) + "/" + total + " constants are pinned by physicsSuite.");
if (holes.length) {
    console.log("\n   THESE SURVIVED A " + (FRACS[1]*100) + "% CHANGE. Read with judgement -- a FREE PARAMETER should survive");
    console.log("   (the answer must not depend on it); a PHYSICAL CONSTANT surviving is a hole:");
    for (const h of holes) console.log("      line " + String(h.line).padStart(4) + "  " + h.was + " -> " + h.now + "\n         " + h.context);
}
