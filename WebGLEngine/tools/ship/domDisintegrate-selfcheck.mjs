// WebGLEngine/tools/ship/domDisintegrate-selfcheck.mjs -- v4199
//
// GATES ui/domDisintegrate.js.
//
// *** THE PORT IS THIRTY LINES BECAUSE TWO ROUNDS ALREADY DID THE WORK. *** ZachSaucier/Disintegrate (MIT)
// samples a DOM element into canvas particles via html2canvas. ui/domToTexture.js (v4120) already rasterises
// a live subtree through SVG <foreignObject> and its header names html2canvas as the alternative it REJECTED;
// ui/gestureVfx.js already owns a pure particle system with normalised positions. What was missing was the
// loop between them.
//
// *** AND THE COMPOSITION IS ASSERTED, NOT ASSUMED: *** section 3 runs the particles this module emits
// through gestureVfx's OWN stepper and checks the colour survives -- stepParticles spreads `...p`, so it
// carries a field it has never heard of. If that ever stops being true, a disintegration turns grey and
// nothing else would notice.
//
// Run: node tools/ship/domDisintegrate-selfcheck.mjs

import { sampleParticles, explainEmpty, DEFAULT_STRIDE } from "../../ui/domDisintegrate.js";
import { stepParticles, particleAlpha } from "../../ui/gestureVfx.js";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// A 40x20 buffer: a solid disc on a transparent field. Most of it is empty, which is the interesting part.
const W = 40, H = 20;
function disc() {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (Math.hypot(x - 20, y - 10) < 8) { data[i] = 220; data[i + 1] = 40; data[i + 2] = 60; data[i + 3] = 255; }
    }
    return { width: W, height: H, data };
}
let seed = 1;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// 1) SAMPLING SKIPS WHAT IS NOT THERE.
{
    seed = 1;
    const img = disc();
    const ps = sampleParticles(img, { stride: 2, rand });
    const grid = Math.ceil(W / 2) * Math.ceil(H / 2);
    ok(ps.length > 0 && ps.length < grid,
        `*** ${ps.length} particles from ${grid} grid points -- the transparent majority was SKIPPED ***`);
    ok(ps.every((p) => p.a > 8), "every particle came from a pixel above the alpha floor");
    ok(ps.every((p) => p.r === 220 && p.g === 40 && p.b === 60), "and carries that pixel's colour");
    // *** THE FAILURE THIS PREVENTS: a disintegrating RECTANGLE instead of a disintegrating SHAPE. ***
    const all = sampleParticles(img, { stride: 2, minAlpha: -1, rand });
    ok(all.length === grid,
        `with the alpha floor removed it emits all ${all.length} points -- a perfect bounding box of invisible ` +
        "particles that still cost a step every frame and still hold the frame dirty");
    ok(all.length > ps.length * 2, "which is more than twice the useful count on this shape alone");
}

// 2) THE OUTPUT IS gestureVfx'S SHAPE.
{
    seed = 1;
    const ps = sampleParticles(disc(), { stride: 3, rand });
    ok(ps.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1),
        "positions are NORMALISED 0..1, so a page can scale them to any canvas");
    for (const k of ["x", "y", "vx", "vy", "life", "age", "size", "kind"]) {
        ok(ps.every((p) => k in p), `every particle has ${k}, which gestureVfx's stepper reads`);
    }
    ok(ps.every((p) => p.age === 0 && p.life > 0), "born at age 0 with a positive life");
    const gv = codeOnly(read("ui/gestureVfx.js"));
    ok(new RegExp(`\\b${ps[0].kind}:`).test(gv),
        `*** the kind "${ps[0].kind}" is one gestureVfx's BURSTS table already defines, so its gravity applies ***`);
}

// 3) *** THE EXISTING STEPPER CARRIES A FIELD IT HAS NEVER HEARD OF. ***
{
    seed = 1;
    let list = sampleParticles(disc(), { stride: 3, rand });
    const n0 = list.length;
    for (let i = 0; i < 5; i++) list = stepParticles(list, 0.02);
    ok(list.length === n0, `all ${n0} particles survive 5 steps of 0.02s`);
    ok(list.every((p) => p.r === 220 && p.g === 40 && p.b === 60),
        "*** and every one still carries its colour -- stepParticles spreads ...p, so rgb rides through a " +
        "stepper written before this module existed ***");
    ok(list.every((p) => p.age > 0), "their age advanced, so the step did real work");
    ok(particleAlpha(list[0]) < 1 && particleAlpha(list[0]) > 0, `and gestureVfx's own fade applies (alpha ${particleAlpha(list[0]).toFixed(3)})`);
    // And they moved, which is the other half of "the stepper actually ran".
    seed = 1;
    const before = sampleParticles(disc(), { stride: 3, rand });
    ok(list.some((p, i) => p.x !== before[i].x || p.y !== before[i].y), "and they moved");
    // Long enough and they all die -- no immortal particles holding the frame open.
    let l2 = before; for (let i = 0; i < 200; i++) l2 = stepParticles(l2, 0.05);
    ok(l2.length === 0, "run long enough, every particle dies -- nothing leaks into a permanently dirty frame");
}

// 4) AN EMPTY RESULT EXPLAINS ITSELF.
{
    const blank = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
    ok(sampleParticles(blank, { rand }).length === 0, "a fully transparent image yields no particles");
    const why = explainEmpty(blank, {});
    ok(/<canvas>/.test(why) && /zero pixels/.test(why),
        `*** and says the likeliest cause: ${why.slice(0, 80)}... -- the nested-canvas limit domToTexture MEASURED ***`);
    ok(/rasterize\(\) returned null/.test(explainEmpty(null)), "a null image is a different cause, and says so");
    ok(explainEmpty({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, {}).includes("0x0"), "as is a zero-sized canvas");
    ok(sampleParticles(null).length === 0 && sampleParticles({}).length === 0, "and bad input yields [] rather than throwing");
}

// 5) DETERMINISM AND PURITY.
{
    seed = 1; const a = sampleParticles(disc(), { stride: 3, rand });
    seed = 1; const b = sampleParticles(disc(), { stride: 3, rand });
    ok(JSON.stringify(a) === JSON.stringify(b), "with an injected rand the sampling is deterministic, so this gate can assert on it");
    const src = read("ui/domDisintegrate.js");
    ok(!/html2canvas/.test(codeOnly(src)), "*** no html2canvas: the dependency Disintegrate needs was refused at v4120 ***");
    ok(/from "\.\/domToTexture\.js"/.test(noComments(src)), "it uses the rasteriser this tree already had");
    ok(/gestureVfx/.test(prose(src)), "and names the particle system it emits into, so nobody adds a sixth");
    ok(/nested <canvas>/.test(prose(src)), "and repeats the inherited limitation rather than leaving it two files away");
    // *** THE WIRING, BY STATEMENT AND CALL. *** v4197's lesson: asking whether a path appears anywhere is
    // satisfied by this module's own error strings.
    const m = noComments(read("main.js"));
    ok(/import\s*\{[^}]*\bdisintegrate\b[^}]*\}\s*from\s*["']\.\/ui\/domDisintegrate\.js["']/.test(m),
        "main.js imports disintegrate by statement");
    ok(/await\s+disintegrate\s*\(\s*target/.test(codeOnly(read("main.js"))), "*** and window.domFx calls it ***");
    ok(/out\.why/.test(codeOnly(read("main.js"))),
        "and surfaces the reason when the result is empty, rather than logging a silent nothing");
}

console.log(`domDisintegrate-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether a real element disintegrates prettily. What is checked is that
transparent pixels are skipped rather than emitted invisibly, that the output is gestureVfx's own particle
shape, that its stepper carries the colour through untouched, and that an empty result names its cause.`);
process.exit(fail ? 1 : 0);
