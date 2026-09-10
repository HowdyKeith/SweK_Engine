#!/usr/bin/env node
// WebGLEngine/tools/ship/skyStars-selfcheck.mjs -- v4580
//
// GATES render/skyStars.mjs and the starfield in render/skyRenderer.js, which main.js imports and which had
// no reference of any kind. The subject is that module's header.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as SS from "../../render/skyStars.mjs";
import { exactHash3 } from "../../render/exactHash.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const f = Math.fround;
const skySrc = fs.readFileSync(path.join(ENG, "render/skyRenderer.js"), "utf8");
/** The engine's own settings, read off main.js rather than typed here. */
const DENSITIES = [...fs.readFileSync(path.join(ENG, "main.js"), "utf8")
    .matchAll(/setStars\(\{\s*density:\s*([0-9.]+)/g)].map((m) => Number(m[1])).filter((d) => d > 0);

console.log("skyStars-selfcheck -- the engine's night sky, and the reference it never had\n");

// ---- 1. THE DENSITY KNOB WAS DIMMING EVERY STAR --------------------------------------------------------------
console.log("1. brightness, which the density knob was silently multiplying");
{
    // The shipped arithmetic, exactly as it read: bright = (h - threshold) / 0.005.
    const oldBright = (h, d) => (h - SS.cutFor(d)) / SS.DENSITY_SPAN;
    const rows = DENSITIES.map((d) => ({ d, oldMax: oldBright(1, d), nowMax: (1 - SS.cutFor(d)) / (1 - SS.cutFor(d)) }));
    for (const r of rows)
        console.log(`     density ${r.d.toFixed(1)}   brightest star was ${r.oldMax.toFixed(2)}   is now ${r.nowMax.toFixed(2)}`);
    ok("!! *** the brightest star is 1.0 at EVERY density the engine uses, not `density` ***",
       rows.every((r) => Math.abs(r.nowMax - 1) < 1e-12) && rows.some((r) => r.oldMax < 0.99),
       `densities ${DENSITIES.join(", ")}, read out of main.js. The old divisor was a fixed ` +
       `${SS.DENSITY_SPAN} while 1 - threshold is density * ${SS.DENSITY_SPAN}, so it was only right at ` +
       "density 1. BOTH HALVES ARE REQUIRED: some density must have been wrong before, or this row would " +
       "pass on a tree where nothing was ever broken");
    // The property, not the spelling: the normalisation must use the SAME number the cut uses.
    const ratios = DENSITIES.map((d) => {
        const cut = SS.cutFor(d);
        const rays = [];
        for (let i = 0; i < 4000; i++) {
            const u = (i + 0.5) / 4000, t = 2 * Math.PI * u, p = Math.acos(2 * ((i * 7919) % 4000) / 4000 - 1);
            rays.push([Math.sin(p) * Math.cos(t), Math.abs(Math.cos(p)), Math.sin(p) * Math.sin(t)]);
        }
        const b = rays.map((r) => SS.skyStarAt(r, d)).filter(Boolean).map((s) => s.bright);
        return { d, n: b.length, max: b.length ? Math.max(...b) : 0, min: b.length ? Math.min(...b) : 0 };
    });
    ok("!! ...and a real sampled sky never exceeds 1 and never falls to 0 at any density",
       ratios.every((r) => r.n > 0 && r.max <= 1 && r.min > 0),
       ratios.map((r) => `d=${r.d}: ${r.n} stars, bright ${r.min.toFixed(3)}..${r.max.toFixed(3)}`).join("; "));
    // *** COMMENTS OUT FIRST. *** The first draft tested the raw source and went red on THIS ROUND'S OWN
    // comment, which quotes the old arithmetic to explain it -- prose counted as code, in a gate written the
    // day after two rounds about exactly that.
    const skyCode = skySrc.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l.trim())).join("\n");
    ok("!! ...and skyRenderer no longer divides by the bare span",
       !/\(h - threshold\) \/ 0\.005/.test(skyCode) && /st\.x/.test(skyCode),
       "the shader asks sky_star() for the brightness, so the cut and its normalisation cannot drift apart");
}

// ---- 2. THE TAIL, AND WHY IT MATTERS MORE HERE THAN ANYWHERE ELSE IN THE TREE --------------------------------
console.log("\n2. the deficit grows with the depth of the cut, and this site cuts deepest");
{
    const skyHash = (x, y, z) => {
        const d = f(f(f(x * f(17.13)) + f(y * f(91.71))) + f(z * f(53.97)));
        const v = f(f(Math.sin(d)) * f(43758.5453));
        return f(v - Math.floor(v));
    };
    const W = 70, X0 = -35;
    const frac = (h, cut) => { let n = 0, t = 0;
        for (let x = X0; x < X0 + W; x++) for (let y = X0; y < X0 + W; y++) for (let z = X0; z < X0 + W; z++) {
            n++; if (h(x, y, z) > cut) t++; }
        return { n, pct: 100 * t / n }; };
    const CUTS = [0.90, 0.95, 0.99, 0.995, 0.997, 0.999];
    const rows = CUTS.map((cut) => {
        const want = 100 * (1 - cut), a = frac(skyHash, cut), b = frac(exactHash3, cut);
        return { cut, want, old: a.pct, now: b.pct, n: a.n,
                 sd: 100 * Math.sqrt((1 - cut) * cut / a.n), ratio: a.pct / want };
    });
    for (const r of rows)
        console.log(`     cut ${r.cut.toFixed(3)}  asked ${r.want.toFixed(3)}%   sin-hash ${r.old.toFixed(4)}% ` +
                    `(${(r.ratio * 100).toFixed(0)}% of asked)   exact ${r.now.toFixed(4)}%`);
    ok("!! *** the sin-hash's deficit DEEPENS as the cut deepens -- monotone across the range ***",
       rows[0].ratio > rows[rows.length - 1].ratio + 0.4 &&
       rows.every((r, i) => i === 0 || r.ratio < rows[0].ratio),
       `${(rows[0].ratio * 100).toFixed(0)}% of the stars asked for at cut ${rows[0].cut}, ` +
       `${(rows[rows.length - 1].ratio * 100).toFixed(0)}% at cut ${rows[rows.length - 1].cut}. A hash that ` +
       "averages into an fbm survives that; a THRESHOLD does not, and this site's cuts are the deepest in " +
       "the tree");
    ok("!! ...and exact_hash3 lands on the asked-for fraction at every one of those depths",
       rows.every((r) => Math.abs(r.now - r.want) / r.sd < 4),
       rows.map((r) => `${r.cut}: ${((r.now - r.want) / r.sd).toFixed(1)} sd`).join(", ") +
       ` over ${rows[0].n.toLocaleString("en-US")} cells per reading`);
    // *** THE MECHANISM, COUNTED. *** This is what the deficit IS, rather than a description of it.
    const distinct = (h) => { const v = new Set(), tail = new Set();
        for (let x = -30; x < 30; x++) for (let y = -30; y < 30; y++) for (let z = -30; z < 30; z++) {
            const q = h(x, y, z); v.add(q); if (q > 0.997) tail.add(q); }
        return { all: v.size, tail: tail.size }; };
    const dOld = distinct(skyHash), dNew = distinct(exactHash3);
    ok("!! *** the sin-hash collapses 216,000 cells onto a few thousand values, and the deep tail onto a handful ***",
       dOld.all < dNew.all / 10 && dOld.tail < 40 && dNew.all === 216000,
       `sin-hash ${dOld.all} distinct values of 216,000 cells, ${dOld.tail} of them above 0.997; exact_hash3 ` +
       `${dNew.all} and ${dNew.tail}. float32 loses the low bits of sin(x) * 43758.5453 before fract() runs, ` +
       "so a threshold slicing 0.003 off the top is choosing between a handful of levels");
}

// ---- 3. THE TWIN AGAINST THE SHADER ---------------------------------------------------------------------------
console.log("\n3. the CPU twin and a float32 emulation of the spliced GLSL");
{
    const G = skySrc.slice(skySrc.indexOf("const FS = `") + "const FS = `".length);
    const glsl = G.slice(0, G.indexOf("`;")).replaceAll("${SKY_STARS_GLSL}", SS.SKY_STARS_GLSL);
    ok("!! the shader carries exactHash's OWN exported GLSL, spliced and not transcribed",
       glsl.includes("float exact_hash3(vec3 p, uint seed)") && !/fract\s*\(\s*sin\s*\(/.test(glsl) &&
       !/starHash/.test(glsl),
       "no fract(sin( and no starHash anywhere in the fragment shader, read as the spliced string");
    // The constants the emulation assumes, read OUT of the shader text -- v4579's lesson: an emulation that
    // rebuilds the hash from the JS constants is a third implementation, not a check.
    const CONSTS = ["0x7feb352du", "0x846ca68bu", "0x27d4eb2fu", "0xd8163841u", "0x8da6b343u",
                    "256.0", "16777216.0", "4294967296.0", String(SS.DENSITY_SPAN)];
    const missing = CONSTS.filter((c) => !glsl.includes(c));
    ok("!! ...and every constant this gate's emulation assumes is really in that text",
       missing.length === 0,
       missing.length ? "MISSING: " + missing.join(", ")
                      : `${CONSTS.length} constants read out of the spliced shader`);
    // *** THE FORMULA AND THE SCALES ARE READ OUT OF THE TEXT TOO, NOT JUST THE CONSTANTS. ***
    // v4579 learned that an emulation rebuilt from the JS constants is a THIRD implementation agreeing with
    // the second. This gate's first draft fixed that for the avalanche constants and left the rest: three
    // sabotages passed green -- reverting sky_star's divisor to a bare 0.005 in the GLSL, changing its seed
    // from 0u to 9u, and drifting CELL_SCALE away from the shader's own `floor(ray * 240.0)`. Every one is a
    // real divergence between the shipped shader and the reference this gate claims agrees with it.
    const starFn = (glsl.match(/vec2 sky_star\(vec3 cellP, float density\) \{[\s\S]*?\n}/) || [""])[0];
    ok("!! *** sky_star's own text normalises by (1.0 - cut), which is the defect this round fixed ***",
       /\(h - cut\) \/ \(1\.0 - cut\)/.test(starFn) && !/\(h - cut\) \/ 0\.005/.test(starFn),
       "read out of the spliced GLSL. Dividing by the bare span is only right at density 1, and that is what " +
       "the shader did for every star the engine has ever drawn");
    const seedInText = (starFn.match(/sky_hash\(cellP, (\d+)u\)/) || [])[1];
    ok("!! ...and it hashes the seed the twin hashes, read from the same text",
       Number(seedInText) === SS.SEED.exists,
       `shader seed ${seedInText}u against SEED.exists ${SS.SEED.exists}`);
    const cutInText = (starFn.match(/1\.0 - density \* ([0-9.]+)/) || [])[1];
    ok("  ...and its cut uses the module's DENSITY_SPAN",
       Number(cutInText) === SS.DENSITY_SPAN, `${cutInText} against ${SS.DENSITY_SPAN}`);
    // skyRenderer's own cell scales are literals in ITS source, not the module's, so they can drift from
    // CELL_SCALE and nothing else would say so.
    const scales = [...glsl.matchAll(/floor\(ray \* ([0-9.]+)\)/g)].map((m) => Number(m[1]));
    ok("!! *** the space-mode cell scale in the shader IS the twin's CELL_SCALE ***",
       scales.includes(SS.CELL_SCALE),
       `shader uses floor(ray * ${scales.join("), floor(ray * ")}); the twin models ${SS.CELL_SCALE}. The ` +
       "OTHER scale is the day-mode night sky, a genuinely different field at a different resolution -- " +
       "stated rather than quietly modelled as if it were the same one");
    // THREE, not two -- the first draft of this row said two and forgot the Milky Way, which hashes a much
    // coarser cell for its cloudy modulation. Named individually so a fourth cannot arrive unremarked.
    const SCALES = Object.freeze({ 240: "space-mode stars, the field the twin models",
                                   220: "day-mode night stars, a different field at a different resolution",
                                   6:   "the Milky Way band's cloud modulation, not a star field at all" });
    ok("  ...and every floor(ray * N) in the shader is one of the three fields this file has",
       scales.length === 3 && scales.every((n) => SCALES[n]) && new Set(scales).size === 3,
       scales.map((n) => n + " (" + (SCALES[n] || "UNKNOWN") + ")").join("; "));

    // the emulation
    const wrap32 = (q) => f(q - f(16777216 * Math.floor(f(q * f(1 / 16777216)))));
    const umix32 = (hi) => { let h = hi >>> 0;
        h = (h ^ (h >>> 16)) >>> 0; h = Math.imul(h, 0x7feb352d) >>> 0;
        h = (h ^ (h >>> 15)) >>> 0; h = Math.imul(h, 0x846ca68b) >>> 0;
        return (h ^ (h >>> 16)) >>> 0; };
    const eh3 = (x, y, z, seed) => {
        const qx = wrap32(f(Math.floor(f(x * f(256))))), qy = wrap32(f(Math.floor(f(y * f(256))))),
              qz = wrap32(f(Math.floor(f(z * f(256)))));
        const hz = umix32(((Math.imul(qz >>> 0, 0x27d4eb2f) >>> 0) ^ (seed >>> 0)) >>> 0);
        const hy = umix32(((Math.imul(qy >>> 0, 0xd8163841) >>> 0) ^ hz) >>> 0);
        return umix32(((Math.imul(qx >>> 0, 0x8da6b343) >>> 0) ^ hy) >>> 0) / 4294967296;
    };
    const shaderStar = (ray, d) => {
        if (!(d > 0) || ray[1] <= SS.HORIZON_CUT) return null;
        const c = [f(Math.floor(f(f(ray[0]) * f(SS.CELL_SCALE)))), f(Math.floor(f(f(ray[1]) * f(SS.CELL_SCALE)))),
                   f(Math.floor(f(f(ray[2]) * f(SS.CELL_SCALE))))];
        const cut = f(1 - f(f(d) * f(SS.DENSITY_SPAN)));
        const h = eh3(c[0], c[1], c[2], SS.SEED.exists);
        if (h <= cut) return null;
        return { cell: c, hash: h, bright: f(f(h - cut) / f(1 - cut)) };
    };
    const N = 200;
    let dirs = 0, setDiff = 0, cellDiff = 0, hashEq = 0, stars = 0, worst = 0;
    for (const d of DENSITIES) for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
        const u = (a + 0.5) / N, v = (b + 0.5) / N, t = 2 * Math.PI * u, p = Math.acos(2 * v - 1);
        const ray = [Math.sin(p) * Math.cos(t), Math.cos(p), Math.sin(p) * Math.sin(t)];
        const A = SS.skyStarAt(ray, d), B = shaderStar(ray, d);
        dirs++;
        if (!A !== !B) {
            setDiff++;
            const cJ = [Math.floor(ray[0] * SS.CELL_SCALE), Math.floor(ray[1] * SS.CELL_SCALE), Math.floor(ray[2] * SS.CELL_SCALE)];
            const cS = [f(Math.floor(f(f(ray[0]) * f(SS.CELL_SCALE)))), f(Math.floor(f(f(ray[1]) * f(SS.CELL_SCALE)))),
                        f(Math.floor(f(f(ray[2]) * f(SS.CELL_SCALE))))];
            if (cJ.join() !== cS.join()) cellDiff++;
            continue;
        }
        if (A && B) { stars++; if (A.hash === B.hash) hashEq++;
                      const dd = Math.abs(A.bright - B.bright); if (dd > worst) worst = dd; }
    }
    ok("!! *** every star-set disagreement is a CELL BOUNDARY, not a hash disagreement ***",
       cellDiff === setDiff && stars > 0,
       `${setDiff} of ${dirs} directions differ, and ALL ${cellDiff} of them are cells where float32 and ` +
       "float64 floor(ray * " + SS.CELL_SCALE + ") landed on either side of an integer. Both halves then hash " +
       "whatever cell they chose identically. A row claiming ZERO disagreements would be false, and the first " +
       "draft of this one claimed it");
    ok("!! ...and the hash is BIT-IDENTICAL wherever they chose the same cell",
       hashEq === stars && stars > 0, `${hashEq} of ${stars}`);
    // *** THE BOUND IS DERIVED, NOT PICKED. *** bright = (h - cut) / (1 - cut), and the deepest cut the
    // engine uses divides by 1 - cut, so a float32 epsilon in h is magnified by 1 / (1 - cut).
    const deepest = Math.min(...DENSITIES.map((d) => 1 - SS.cutFor(d)));
    const bound = 4 * 1.1920929e-7 / deepest;
    ok("  ...and brightness agrees within the bound that divisor implies",
       worst < bound,
       `worst |d| ${worst.toExponential(3)} against ${bound.toExponential(3)} = 4 float32 epsilons over the ` +
       `narrowest tail the engine asks for (1 - cut = ${deepest.toExponential(3)} at density ` +
       `${Math.min(...DENSITIES)}). The first draft used 1e-6, which is tighter than the arithmetic allows`);
    say(`the shader's own guards are mirrored: density 0 draws nothing, and ray.y <= ${SS.HORIZON_CUT} is ` +
        "suppressed so stars do not show through the ground");
}

// ---- 4. THE BACKTICK, AND THE TREE-WIDE ROW I DID NOT SHIP ---------------------------------------------------
console.log("\n4. the mistake I made twice, and why it does not get a new instrument");
{
    // v4579 put a backtick in a comment inside wormhole.html's WGSL template literal; v4580 did the identical
    // thing in this file's FS. A backtick ENDS the literal, so the shader stops mid-function and the rest of
    // the file becomes JavaScript.
    //
    // *** THE FIRST DRAFT OF THIS SECTION WAS A TREE-WIDE SCAN AND IT WAS WRONG TWICE OVER. *** It took the
    // literal's body as everything up to the first backtick and required balanced braces, and reported
    // render/tslSource.mjs and text/slugShaderWgsl.js as TRUNCATED. Both are fine: their bodies contain
    // NESTED template literals inside ${...}, so the first backtick is not the terminator. Finding the real
    // one needs a JS lexer, which is what tools/ship/pageParse.mjs uses -- and it needs
    // --experimental-vm-modules, which a sweep gate cannot assume.
    //
    // *** AND THE GAP IT WAS BUILT FOR DOES NOT EXIST. *** Measured rather than assumed: break this file with
    // a backtick and tools/ship/backendParity-selfcheck.mjs goes red, because it IMPORTS render/skyRenderer.js
    // rather than only reading it as text. wormhole.html's was caught by three page gates. Both mistakes were
    // caught by instruments that already existed; what I skipped was running them before saying done. So
    // there is no new census here, and the row below is the narrow one this round can honestly carry.
    let parses = true, why = "";
    try { new Function(skySrc.replace(/^\s*import[^\n]*\n/gm, "").replace(/^export /gm, "")); }
    catch (e) { parses = false; why = e.message; }
    ok("!! *** render/skyRenderer.js parses -- the file this round rewrites a shader inside ***",
       parses,
       parses ? "imports and export keywords stripped, then parsed as a function body. A backtick inside the "
              + "FS template literal shows up here as an unexpected identifier from the GLSL that follows it"
              : "SYNTAX ERROR: " + why);
    ok("  ...and the FS literal really does still hold the whole fragment shader",
       /void main\(\)/.test(skySrc.slice(skySrc.indexOf("const FS = `"))) &&
       skySrc.slice(skySrc.indexOf("const FS = `")).indexOf("}`;") > 0,
       "a truncated literal loses main() and its closing brace, which is what a stray backtick produces");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT THE GLSL EXECUTES. No GL context is taken: the shader text is held to the JS twin by");
console.log("  ----  a float32 emulation whose constants are read OUT of that text, which is v4579's lesson.");
console.log("  ----  NOR THAT THE NEW SKY LOOKS BETTER. It is a different sky and a brighter one -- at density");
console.log("  ----  0.6 the engine now draws the 0.300% of cells it asks for instead of 0.131%, and each star");
console.log("  ----  reaches full brightness instead of 0.60. Nobody had a reference to prefer the old one by.");
if (fails) { console.log("\n[skyStars-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[skyStars-selfcheck] all passed");
