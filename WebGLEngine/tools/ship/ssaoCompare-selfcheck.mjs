// WebGLEngine/tools/ship/ssaoCompare-selfcheck.mjs -- v3369
// *** THE PAGE EXISTS TO SUPPORT A DECISION AND MUST NOT MAKE ONE. *** Its facts are read off two shaders and
// are checkable; its refusal to rank is the part that would rot first, so that is gated too.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IMPLEMENTATIONS, FLAT_SURFACE_TEST, costRatio, REFUSES_TO_RANK } from "../../render/ssaoCompare.mjs";
import { noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const page = fs.readFileSync(path.join(ENG, "ssao-compare.html"), "utf8");
const bloom = fs.readFileSync(path.join(ENG, "render", "bloomPass.js"), "utf8");
const pass = fs.readFileSync(path.join(ENG, "render", "SSAOPass.js"), "utf8");

// *** EVERY STATED FACT IS RE-DERIVED FROM THE SHADER IT DESCRIBES. A comparison table nothing regenerates is
// a story, and this one exists to be acted on. ***
ok("!! *** SSAOPass really does take 16 samples, read from its own loop ***",
    /for \(int i = 0; i < 16; i\+\+\)/.test(pass) && IMPLEMENTATIONS.pass.samples === 16);
ok("!! *** bloomPass really is 8 samples on a disc, half-res, read from its own header ***",
    /8 rotated samples within a/.test(bloom) && /[Hh]alf-res/.test(bloom) &&
    IMPLEMENTATIONS.bloom.samples === 8 && IMPLEMENTATIONS.bloom.geometry === "disc");
ok("!! *** and SSAOPass reconstructs a NORMAL, which is what makes its samples a hemisphere ***",
    /normal/i.test(pass) && IMPLEMENTATIONS.pass.geometry === "hemisphere",
    "a disc samples in a plane regardless of which way the surface faces, so half its samples land BEHIND the " +
    "surface and a flat wall darkens itself. A normal-oriented hemisphere cannot. THIS IS A CORRECTNESS " +
    "DIFFERENCE, NOT A TASTE ONE");

ok("!! the status of each is stated, and they differ",
    /LIVE/.test(IMPLEMENTATIONS.bloom.status) && /ORPHAN/.test(IMPLEMENTATIONS.pass.status) &&
    /BloomPass/.test(fs.readFileSync(path.join(ENG, "main.js"), "utf8")),
    "main.js imports BloomPass; SSAOPass has zero referrers and no gate. The report called SSAOPass PROVEN, " +
    "and nothing tests it");

const c = costRatio();
say("relative fragment work: bloom " + c.a + ", pass " + c.b + " -> " + c.ratio + "x");
ok("!! the cost ratio is ARITHMETIC and the page says so",
    c.ratio === 8 && /arithmetic/i.test(page) && /not a benchmark/i.test(page),
    "samples times pixel count. Bandwidth, cache behaviour and the half-res upsample are not in it, and on a " +
    "real GPU the measured ratio may be nothing like 8. Presenting it as a benchmark would be the exact error " +
    "this session already made once with a single cold timing");

// *** THE REFUSAL, WHICH IS THE PART THAT WOULD ROT FIRST. ***
ok("!! *** the page REFUSES to rank them, and says why ***",
    /will not rank/i.test(page) && REFUSES_TO_RANK.length > 60 &&
    /judgement about how the engine should look/.test(REFUSES_TO_RANK),
    "the measurable axes favour bloom and the geometric argument favours pass. WEIGHING THEM IS A JUDGEMENT " +
    "ABOUT HOW THE ENGINE SHOULD LOOK -- Keith's, on a screen, not mine from a source file");

// The page RENDERS this string from the module rather than repeating it, so asserting the literal appears in
// the static HTML checked the wrong artefact -- the same "source vs what the page shows" confusion that has
// cost this session four sentence-pinned checks. Assert the module holds it AND the page renders it.
ok("!! ...and it names the ONE thing to look at first",
    /glancing angle/i.test(FLAT_SURFACE_TEST) &&
    /FLAT_SURFACE_TEST/.test(noComments(page)) && /getElementById\("flat"\)/.test(noComments(page)),
    "a large flat surface at a glancing angle either dims or does not, and that single observation separates " +
    "the two samplers without any taste being involved");

ok("!! it does not claim to have rendered anything",
    !/screenshot|rendered here|as shown/i.test(noComments(page)) && /only a rig can settle/i.test(page),
    "there is no GPU in this sandbox. A comparison page that looked like it had run both would be worse than " +
    "no page -- it would look like an answer");

console.log(failed ? "ssaoCompare-selfcheck: " + failed + " FAILED" : "ssaoCompare-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
