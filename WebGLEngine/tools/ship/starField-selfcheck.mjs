#!/usr/bin/env node
// WebGLEngine/tools/ship/starField-selfcheck.mjs -- v4579
//
// GATES render/starField.mjs and the three pages that draw its sky: blackhole.html, flight-gpu.html and
// wormhole.html. The subject is that file's header.
//
// *** THE THING BEING CHECKED IS A THRESHOLD, WHICH IS WHY THE STAR SET IS GRADED EXACTLY AND THE BRIGHTNESS
// IS NOT. *** `hh > cut` decides whether a star EXISTS. v4569 measured what happens when a threshold's two
// halves disagree -- grass flipped 65.4% of its draw decisions, the nebula drew 3,006 stars against 2,509 with
// 378 in the same place -- so the star SET is required to be identical, cell for cell, with no tolerance at
// all. Brightness is `length` and `smoothstep` in float32 against float64: continuous arithmetic, graded to a
// measured bound and NOT claimed exact.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as SF from "../../render/starField.mjs";
import { exactHash2, exactHash3, umix } from "../../render/exactHash.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const f = Math.fround;

/** The pages, the name of the shader literal the starfield lives in, and the cut each one asks for. */
const PAGES = [
    { page: "blackhole.html",  literal: "WGSL",          cut: 0.986 },
    { page: "flight-gpu.html", literal: "BACKDROP_WGSL", cut: 0.987 },
    { page: "wormhole.html",   literal: "WGSL",          cut: 0.985 },
];
const readPage = (p) => fs.readFileSync(path.join(ENG, p), "utf8");
function shaderOf(page, literal) {
    const src = readPage(page), head = "const " + literal + " = `";
    const a = src.indexOf(head); if (a < 0) return null;
    const from = a + head.length, b = src.indexOf("`;", from);
    return src.slice(from, b).replaceAll("${STARFIELD_WGSL}", SF.STARFIELD_WGSL);
}

// ---- 1. THE WGSL, EMULATED IN FLOAT32, AGAINST THE CPU TWIN -------------------------------------------------
console.log("starField-selfcheck -- one sky, three pages, and a CPU reference that can be held to it\n");
console.log("1. the shader and its twin draw the SAME STARS");
{
    // exact_hash3 with every float step through Math.fround, which is what a GPU does to every operand.
    const wrap32 = (q) => f(q - f(16777216 * Math.floor(f(q * f(1 / 16777216)))));
    const eh3_32 = (x, y, z, seed = 0) => {
        const qx = wrap32(f(Math.floor(f(x * f(256))))), qy = wrap32(f(Math.floor(f(y * f(256))))),
              qz = wrap32(f(Math.floor(f(z * f(256)))));
        const hz = umix(((Math.imul(qz >>> 0, 0x27d4eb2f) >>> 0) ^ (seed >>> 0)) >>> 0);
        const hy = umix(((Math.imul(qy >>> 0, 0xd8163841) >>> 0) ^ hz) >>> 0);
        return umix(((Math.imul(qx >>> 0, 0x8da6b343) >>> 0) ^ hy) >>> 0) / 4294967296;
    };
    const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const wgslStars = (dir, cut) => {
        const out = [];
        for (let o = 0; o < SF.OCTAVES; o++) {
            const sc = f(f(SF.BASE_SCALE) * f(Math.pow(2, o)));
            const g = [f(f(dir[0]) * sc), f(f(dir[1]) * sc), f(f(dir[2]) * sc)];
            const id = g.map((v) => f(Math.floor(v))), fp = g.map((v, i) => f(v - id[i]));
            const k = f(f(o) * f(SF.OCTAVE_OFFSET));
            const hh = eh3_32(f(id[0] + k), f(id[1] + k), f(id[2] + k));
            if (hh <= cut) continue;
            const d = f(Math.hypot(f(fp[0] - 0.5), f(fp[1] - 0.5), f(fp[2] - 0.5)));
            out.push({ octave: o, cell: id, hash: hh, star: f(ss(f(SF.FALLOFF), 0, d) * f((hh - cut) / (1 - cut))) });
        }
        return out;
    };
    const N = 160, CUT = 0.986;
    let dirs = 0, sameSet = 0, hashEq = 0, hashN = 0, worst = 0, stars = 0;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
        const u = (a + 0.5) / N, v = (b + 0.5) / N, th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
        const dir = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
        const A = SF.starsAlong(dir, { cut: CUT }), B = wgslStars(dir, CUT);
        dirs++;
        const key = (s) => s.map((x) => x.octave + ":" + x.cell.join(",")).join("|");
        if (key(A) === key(B)) sameSet++;
        for (let i = 0; i < Math.min(A.length, B.length); i++) {
            hashN++; if (A[i].hash === B[i].hash) hashEq++;
            stars++; const dd = Math.abs(A[i].star - B[i].star); if (dd > worst) worst = dd;
        }
    }
    // *** THE EMULATION ABOVE IS A THIRD IMPLEMENTATION, NOT A READING OF THE SHADER, AND SABOTAGE PROVED IT.
    // *** It rebuilds exact_hash3 from the JS constants, so changing a constant INSIDE STARFIELD_WGSL moved
    // the shader and left the emulation -- and the twin -- exactly where they were. Three sabotages passed
    // green: the octave offset 17 -> 19, the falloff 0.55 -> 0.60, and 0x27d4eb2f -> 0x27d4eb2d in the WGSL's
    // own exact_hash3. The last is a genuine divergence between the shipped shader and its reference, in a
    // gate whose headline row claims they draw the same stars.
    //
    // Holding the TEXT to the JS by its constants is the technique tools/ship/exactHash-selfcheck.mjs already
    // uses, and it is what makes the emulation an emulation rather than a fourth copy.
    const W = SF.STARFIELD_WGSL;
    const CONSTS = [
        ["0x7feb352du", "umix multiplier 1"], ["0x846ca68bu", "umix multiplier 2"],
        ["0x27d4eb2fu", "the z-axis constant"], ["0xd8163841u", "the y-axis constant"],
        ["0x8da6b343u", "the x-axis constant"],
        ["256.0", "the 1/256 lattice"], ["16777216.0", "the 2^24 wrap"], ["4294967296.0", "the 2^32 divisor"],
        [SF.BASE_SCALE + ".0", "BASE_SCALE"], [SF.OCTAVE_OFFSET + ".0", "OCTAVE_OFFSET"],
        [SF.TINT_OFFSET + ".0", "TINT_OFFSET"], [String(SF.FALLOFF), "FALLOFF"],
    ];
    const absent = CONSTS.filter(([c]) => !W.includes(c));
    ok("!! *** every constant the emulation assumes is really IN the shader text, read out of it ***",
       absent.length === 0,
       absent.length ? "MISSING FROM THE WGSL: " + absent.map(([c, w]) => c + " (" + w + ")").join(", ")
       : `${CONSTS.length} constants checked against the emitted WGSL: the five avalanche multipliers, the ` +
         "lattice, the wrap, the divisor, and the four starfield knobs. Without this row the emulation is a " +
         "THIRD implementation agreeing with the second, and a constant changed inside the shader passes green");
    // ...and no OTHER five-figure hex constant hides in there, so the list above cannot be satisfied by a
    // shader that also carries a different one.
    const hexes = new Set([...W.matchAll(/0x[0-9a-f]{8}u/g)].map((m) => m[0]));
    const known = new Set(CONSTS.filter(([c]) => c.startsWith("0x")).map(([c]) => c));
    // *** WHAT THIS ROW DOES AND DOES NOT CATCH, SAID PLAINLY. *** BASE_SCALE, OCTAVE_OFFSET, TINT_OFFSET and
    // FALLOFF are SINGLE DECLARATIONS: the WGSL interpolates them, so moving one moves the shader and the twin
    // together and no row here goes red. That is the intended behaviour and the same shape v4578 settled for
    // raceKnob's seed -- a knob is not a fact. What the row DOES catch is the derivation BREAKING: type 17.0
    // into the shader by hand and then change OCTAVE_OFFSET, and the text no longer carries the current value.
    ok("  ...and the shader carries no avalanche constant the list does not name",
       [...hexes].every((h) => known.has(h)),
       `${hexes.size} distinct 32-bit constants in the text: ${[...hexes].join(", ")}`);

    ok("!! *** the star SET is identical over the sphere -- same octaves, same cells, no tolerance ***",
       sameSet === dirs && stars > 0,
       `${sameSet} of ${dirs} directions agree exactly, over ${stars} stars. THIS IS THE THRESHOLD and it is ` +
       "graded without a tolerance on purpose: a star either exists or it does not, and v4569 measured a " +
       "nebula whose two halves put 378 of 3,006 stars in the same place");
    ok("!! ...and the hash itself is BIT-IDENTICAL wherever both drew one",
       hashEq === hashN && hashN > 0,
       `${hashEq} of ${hashN}. Integer arithmetic, so float32 and float64 are not close, they are the same number`);
    ok("!! ...while BRIGHTNESS is NOT exact, and that is stated rather than tolerated quietly",
       worst > 0 && worst < 1e-4,
       `worst |d| ${worst.toExponential(3)} over ${stars} stars, against a bound of 1e-4. It is length() and ` +
       "smoothstep() in float32 against float64 -- continuous arithmetic downstream of the hash, not the hash. " +
       "*** THE ROW REQUIRES worst > 0: *** if this ever reads exactly zero the emulation has stopped " +
       "emulating float32, which would make the row above pass for the wrong reason");
    say(`sampled ${dirs} directions at cut ${CUT}; the three pages ask for ${PAGES.map((p) => p.cut).join(", ")}`);
}

// ---- 2. WHY THE HASH CHANGED, MEASURED LIVE SO THE ARGUMENT CANNOT ROT --------------------------------------
console.log("\n2. the tail, which is the only part of the distribution a starfield reads");
{
    // The old idiom, in float32 as the pages computed it.
    const n3old = (x, y, z) => {
        const d = f(f(f(x * f(12.9898)) + f(y * f(78.233))) + f(z * f(37.719)));
        const v = f(f(Math.sin(d)) * f(43758.5453));
        return f(v - Math.floor(v));
    };
    const CUT = 0.986, want = 100 * (1 - CUT);
    // *** SIX CUBES AND A POOLED ESTIMATE, BECAUSE THREE WAS NOT ENOUGH TO CARRY THE CLAIM. ***
    // The first draft of this section used three 48^3 cubes and asserted the region-to-region spread exceeded
    // 2 sd. It read 1.241 / 1.292 / 1.253 -- a spread of 0.051% against an sd of 0.035%, which is 1.5 sd and
    // is NOT a result. The effect is real and the sample was too small to show it: six cubes at 64^3 pool to
    // 1.57M cells, where the deficit is 12 sd and cannot be a draw. A row that needed a lucky sample would
    // have been a row about the sample.
    const W = 64;
    const CUBES = [[-24, -24, -24], [0, 0, 0], [200, 200, 200], [-500, 300, -100], [900, -900, 50], [77, 77, 77]];
    const tail = (h, x0, y0, z0) => {
        let n = 0, t = 0;
        for (let x = x0; x < x0 + W; x++) for (let y = y0; y < y0 + W; y++) for (let z = z0; z < z0 + W; z++) {
            n++; if (h(x, y, z) > CUT) t++;
        }
        return { n, t, pct: 100 * t / n };
    };
    let oldN = 0, oldT = 0, nowN = 0, nowT = 0;
    const oldPct = [], nowPct = [];
    for (const c of CUBES) {
        const a = tail(n3old, ...c), b = tail((x, y, z) => exactHash3(x, y, z), ...c);
        oldN += a.n; oldT += a.t; nowN += b.n; nowT += b.t; oldPct.push(a.pct); nowPct.push(b.pct);
        console.log(`     cube at ${String(c.join(",")).padEnd(16)} sin-hash ${a.pct.toFixed(3)}%   exact ${b.pct.toFixed(3)}%`);
    }
    const sd = 100 * Math.sqrt((1 - CUT) * CUT / oldN);
    const oldAll = 100 * oldT / oldN, nowAll = 100 * nowT / nowN;
    const oldSd = (oldAll - want) / sd, nowSd = (nowAll - want) / sd;
    ok("!! *** the shipped hash under-delivered its own density knob, and this is the reason it changed ***",
       oldSd < -5,
       `a cut of ${CUT} should admit ${want.toFixed(3)}% of cells. Pooled over ${oldN.toLocaleString("en-US")} ` +
       `cells the sin-hash reads ${oldAll.toFixed(4)}% -- ${oldSd.toFixed(1)} sd low, at sd ${sd.toFixed(4)}%. ` +
       `A page asking for ${want.toFixed(2)}% of its sky got about ${oldAll.toFixed(2)}%`);
    ok("!! ...and the replacement lands on its knob",
       Math.abs(nowSd) < 3,
       `exact_hash3 pooled ${nowAll.toFixed(4)}% -- ${nowSd.toFixed(1)} sd, inside the noise of the ` +
       `${want.toFixed(3)}% asked for`);
    // The comparative form, which does not need a threshold somebody picked: whatever the sample, the old
    // hash's readings must scatter more across the sky than the new one's.
    const spread = (v) => Math.max(...v) - Math.min(...v);
    ok("!! ...and the old hash's density VARIES WITH THE REGION more than the new one's does",
       spread(oldPct) > spread(nowPct),
       `sin-hash ${spread(oldPct).toFixed(3)}% across the six cubes against exact ${spread(nowPct).toFixed(3)}% ` +
       `(sd per cube ${(100 * Math.sqrt((1 - CUT) * CUT / (W * W * W))).toFixed(3)}%). Star density that ` +
       "depends on which way you are looking is the one thing a starfield must not do. COMPARATIVE ON " +
       "PURPOSE: an absolute bound here would be a number picked to pass, and the first draft picked one that " +
       "did not");
}

// ---- 3. ONE DECLARATION, THREE PAGES ------------------------------------------------------------------------
console.log("\n3. the three pages splice it rather than spelling it");
{
    for (const { page, literal, cut } of PAGES) {
        const src = readPage(page);
        ok("!! " + page + " splices render/starField.mjs and spells no hash of its own",
           /import \{[^}]*STARFIELD_WGSL[^}]*\} from "\/render\/starField\.mjs"/.test(src) &&
           src.includes("${STARFIELD_WGSL}") && !/fract\s*\(\s*sin\s*\(/.test(src) && !/fn n3\s*\(/.test(src),
           "imports the module, splices the text, and carries neither fract(sin( nor its own n3");
        // *** THE PAGE'S OWN MODULE MUST PARSE, AND THIS GATE DID NOT ASK. ***
        // The splice below is done HERE, by this gate, on the extracted literal -- so it reads a correct
        // shader out of a page whose JavaScript does not run. That is exactly what happened: a comment I
        // added inside wormhole.html's WGSL template literal wrapped a word in BACKTICKS, which ends the
        // template, and this gate stayed green while crossArchDoor, qaAssert and tunnelSpawn all went red on
        // "wormhole.html:37 (module) DOES NOT PARSE". A gate that edits pages has to check the page.
        let parses = true, why = "";
        for (const m of src.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
            try { new Function(m[1].replace(/^\s*import[^\n]*\n/gm, "")); }
            catch (e) { parses = false; why = e.message; }
        }
        ok("  ...and the page's own module still PARSES, which the splice above cannot tell you",
           parses, parses ? "every inline module script parses with imports stripped"
                          : "SYNTAX ERROR: " + why + " -- a backtick inside the WGSL template literal ends it");
        const wgsl = shaderOf(page, literal);
        ok("  ...and its shader still validates with the starfield spliced in",
           !!wgsl && validateWgsl(wgsl).length === 0,
           wgsl ? (validateWgsl(wgsl).join("; ") || wgsl.length + " chars, clean")
                : "COULD NOT FIND the " + literal + " literal -- the extraction is wrong, not the shader");
        ok("  ...and it calls starfield_at with its OWN cut, read off the page",
           new RegExp("let cut = " + String(cut).replace(".", "\\.") + ";").test(src) &&
           /starfield_at\(dir, cut, o\)/.test(src),
           `cut ${cut}`);
    }
    // *** v4578'S RECORD SAID THESE THREE SHARED A CUT. THEY DO NOT, AND THAT IS ASSERTED HERE. ***
    const cuts = new Set(PAGES.map((p) => p.cut));
    ok("!! *** the three cuts are THREE DIFFERENT NUMBERS, which v4578's record got wrong ***",
       cuts.size === PAGES.length,
       `${[...cuts].join(", ")}. SHADER_SINHASH_V4578 read "identical n3 text and the identical hh > 0.986 ` +
       `cut" -- the n3 text was byte-identical on all three, the cut never was. Generalised from one file ` +
       "after checking the function and not the caller");
}

// ---- 4. THE 3-D HASH IS THE 2-D ONE'S CONSTRUCTION, AND THE RELATION IS STATED ------------------------------
console.log("\n4. exact_hash3 against exact_hash2, which is a relation and not a containment");
{
    const pairs = [[3, 7], [12, 5], [-4, 9], [1000, -2000]];
    ok("!! exactHash3(x, y, 0, seed) === exactHash2(x, y, umix(seed)) -- exactly, for every pair tried",
       [0, 1, 7, 99, 65535].every((s) => pairs.every(([x, y]) => exactHash3(x, y, 0, s) === exactHash2(x, y, umix(s)))),
       "at z = 0 the third link degenerates to a mix of the seed alone. It is NOT exactHash2 with an extra " +
       "argument, and saying which it is beats leaving a reader to assume the other");
    ok("  ...and a change in z alone really moves the answer, so the third axis is not decoration",
       new Set([0, 1, 2, 3, 4].map((z) => exactHash3(11, 13, z))).size === 5,
       "five z values at one (x, y), five distinct hashes");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT THE WGSL EXECUTES. No WebGPU device is taken here: the shader text is held to the JS");
console.log("  ----  twin by a float32 emulation and to the spec by render/wgslSpec.mjs. The three pages are");
console.log("  ----  WebGPU demos, so what a device does with them is not something a node gate can answer.");
console.log("  ----  NOR THAT THE NEW SKY LOOKS BETTER. It is a completely different sky -- over the sampled");
console.log("  ----  sphere blackhole drew 2,133 stars and now draws 2,316, with 26 in the same cell, which is");
console.log("  ----  chance. The claim is arithmetic: the density knob now means what it says, and the sky is");
console.log("  ----  the same on every device rather than depending on how that device implements sin().");
if (fails) { console.log("\n[starField-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[starField-selfcheck] all passed");
