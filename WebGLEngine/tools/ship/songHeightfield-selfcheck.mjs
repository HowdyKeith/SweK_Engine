#!/usr/bin/env node
// WebGLEngine/tools/ship/songHeightfield-selfcheck.mjs -- v4280
//
// GRADES world/songHeightfield.mjs -- a song read as a height grid, and the closed forms that make it
// checkable rather than merely pretty.
//
// *** THE WHOLE ARGUMENT FOR THIS ROUND IS THAT THE ANSWER CAN BE PREDICTED BEFORE IT IS LOOKED AT. ***
// A terrain generator can only be argued about on taste. The Fourier transform of a pure tone cannot: its
// bin is f * frameSize / sampleRate and its magnitude is A * frameSize / 2, both exactly, so every ridge
// below is compared against a number this file computes independently. That is physics/rebar.mjs's rule --
// predict the ellipse, do not admire the picture -- applied to sound.
"use strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stft, songHeightfield, binOfFrequency, frequencyOfBin, peakMagnitude, tone, sweep,
         centroidBin, windowFor, DEFAULTS } from "../../world/songHeightfield.mjs";
import { repoHeightfield } from "../../world/repoHeightfield.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);
const SR = 8000, N = 1024;
const peakOf = (f) => { let b = 1, v = -1; for (let k = 1; k < f.length; k++) if (f[k] > v) { v = f[k]; b = k; } return { bin: b, mag: v }; };

console.log("songHeightfield-selfcheck -- a song is already a heightfield\n");

console.log("1. *** THE CLOSED FORMS, PREDICTED AND THEN MEASURED ***");
{
    const f = stft(tone(250, 1.0, SR), { sampleRate: SR, frameSize: N, window: "rect" }).frames[0];
    const p = peakOf(f);
    ok("*** a bin-centred sine lands in EXACTLY the bin the formula names ***",
        p.bin === binOfFrequency(250, SR, N),
        `250 Hz at N=${N}, SR=${SR} -> bin ${p.bin}, formula says ${binOfFrequency(250, SR, N)}`);
    ok("*** and its magnitude is EXACTLY A * frameSize / 2, to the last bit ***",
        p.mag === peakMagnitude(1, N), `${p.mag} vs ${peakMagnitude(1, N)} -- exact equality, no tolerance`);
    ok("  with its neighbours at the float floor rather than at a leak",
        f[p.bin - 1] < 1e-10 && f[p.bin + 1] < 1e-10,
        `${f[p.bin - 1].toExponential(2)} and ${f[p.bin + 1].toExponential(2)} -- 14 orders below the peak`);

    const g = stft(tone(500, 1.0, SR), { sampleRate: SR, frameSize: N, window: "rect" }).frames[0];
    ok("*** an octave up is EXACTLY twice the bin -- an integer, needing no tolerance ***",
        peakOf(g).bin === 2 * p.bin, `500 Hz -> bin ${peakOf(g).bin} = 2 x ${p.bin}`);
    ok("  and the bin/frequency map is an exact round trip",
        [1, 7, 32, 100, 511].every((k) => binOfFrequency(frequencyOfBin(k, SR, N), SR, N) === k),
        "checked at five bins including the first and the last");
    // *** binOfFrequency IS CONTINUOUS, AND ONLY THIS CHECK SAYS SO. ***
    // Sabotage C wrapped it in Math.round and NOTHING went red: every frequency the rest of this file asks
    // about happens to sit on a whole bin, so a rounded formula answered identically everywhere. But the
    // header calls it the closed form, and section 3 leans on half-bin offsets existing at all -- a bin index
    // that cannot be fractional makes "half a bin off centre" unsayable. The sabotage found a real gap in the
    // gate rather than a real bug in the module, which is the outcome sabotage is for.
    ok("*** a frequency BETWEEN two bins gives a fractional bin, not a rounded one ***",
        binOfFrequency(frequencyOfBin(32.5, SR, N), SR, N) === 32.5 &&
        binOfFrequency(frequencyOfBin(7.25, SR, N), SR, N) === 7.25,
        "32.5 and 7.25 come back exactly, so the map is the continuous one the header claims");
}

console.log("\n2. *** BIT-REPRODUCIBLE, CHECKED ACROSS SEPARATE PROCESSES ***");
{
    // physics/fft.js's header promises a spectrum you can publish and have somebody else recompute exactly.
    // Reading a value twice inside ONE process proves nothing about that -- it is the same memory. Two node
    // processes is the weakest test that is actually a test.
    const prog = "import {stft,tone} from " + JSON.stringify(path.join(ENG, "world/songHeightfield.mjs")) + ";" +
        "import crypto from 'node:crypto';" +
        "const S=stft(tone(250,1.0,8000),{sampleRate:8000,frameSize:1024,window:'rect'});" +
        "const b=Buffer.concat(S.frames.map(f=>Buffer.from(Float64Array.from(f).buffer)));" +
        "process.stdout.write(crypto.createHash('sha256').update(b).digest('hex'));";
    const run = () => execFileSync(process.execPath, ["--input-type=module", "-e", prog], { encoding: "utf8" });
    const a = run(), b = run();
    ok("*** the same song gives the same bits in a second, independent process ***", a === b,
        "sha256 " + a.slice(0, 16) + " both times");
    // *** THE FIRST DRAFT'S CONTROL HERE COULD NOT FAIL. *** It read `a !== run().slice(0, 0)`, comparing a
    // hash against the empty string, which is true for every possible input. An assertion that cannot fail is
    // decoration, and this tree has caught four of its own already. The real question is whether the hash
    // DISCRIMINATES -- a reproducible function of nothing is also perfectly reproducible.
    const other = execFileSync(process.execPath, ["--input-type=module", "-e",
        prog.replace("tone(250,1.0,8000)", "tone(500,1.0,8000)")], { encoding: "utf8" });
    ok("CONTROL: a DIFFERENT song hashes differently, so the hash is of the music", a !== other && other.length === 64,
        "250 Hz -> " + a.slice(0, 12) + ", 500 Hz -> " + other.slice(0, 12));
    report("this is what physics/fft.js was built for and what nothing had ever exercised: strict-trig " +
        "twiddles computed once, then only +, -, * and / over that table. The transform is exact.");

    // *** BUT THE SIGNAL IS NOT, AND SAYING SO IS THE DIFFERENCE BETWEEN A CLAIM AND A MEASUREMENT. ***
    const S = stft(tone(250, 2.0, SR), { sampleRate: SR, frameSize: N, window: "rect" });
    const ridge = S.frames.map((fr) => fr[32]);
    const spread = (Math.max(...ridge) - Math.min(...ridge)) / peakMagnitude(1, N);
    ok("*** the ridge is not perfectly flat, and the transform is not why ***", spread > 0 && spread < 1e-13,
        `${spread.toExponential(2)} relative across ${ridge.length} frames`);
    report("250 Hz at 8 kHz repeats every 32 samples and the hop is 512, so every frame holds the same cycle " +
        "-- yet the frames are not bit-identical. Math.sin(2*pi*250*i/8000) is evaluated at a LARGER i each " +
        "time, and its last bits differ. The FFT reproduces exactly what it is given; the generator is what " +
        "wobbles, by eight parts in a thousand trillion.");
}

console.log("\n3. *** THE WINDOW'S HONEST COST, MEASURED ON BOTH SIDES ***");
{
    const off = frequencyOfBin(32.5, SR, N);           // deliberately half a bin off centre
    const spill = (w) => {
        const f = stft(tone(off, 1.0, SR), { sampleRate: SR, frameSize: N, window: w }).frames[0];
        const p = peakOf(f);
        let tot = 0, far = 0;
        for (let k = 0; k < f.length; k++) { const e = f[k] * f[k]; tot += e; if (Math.abs(k - p.bin) > 4) far += e; }
        return { peak: p, far: far / tot };
    };
    const r = spill("rect"), h = spill("hann");
    ok("*** a tone half a bin off centre is NOT one column any more ***", r.far > 0.02,
        `${(r.far * 100).toFixed(2)}% of the energy lands further than 4 bins from the peak, under rect`);
    ok("  and it loses height as well as sharpness -- scalloping, in dB",
        Math.abs(20 * Math.log10(r.peak.mag / peakMagnitude(1, N)) + 3.86) < 0.1,
        `${(20 * Math.log10(r.peak.mag / peakMagnitude(1, N))).toFixed(3)} dB, against the -3.92 dB a ` +
        `rectangular window approaches as N grows`);
    ok("*** hann buys that back, and the number says by how much ***", h.far < r.far / 10,
        `${(h.far * 100).toFixed(2)}% against rect's ${(r.far * 100).toFixed(2)}%`);
    ok("CONTROL: an unknown window is refused rather than silently treated as rect",
        windowFor("gaussian") === null && windowFor("rect") !== null);
    report("rect is the DEFAULT here precisely because it makes section 1 exact, which is what a gate can " +
        "grade. It is the wrong choice for looking at a real song, and this section is the reason that is a " +
        "stated trade rather than an oversight.");
}

console.log("\n4. *** THE RIDGE SURVIVES DOWNSAMPLING, AND THE FIRST DRAFT LOST IT ENTIRELY ***");
{
    const binCount = 512;
    const litColumns = (hz, g) => {
        const H = songHeightfield(tone(hz, 1.0, SR), { grid: g, sampleRate: SR, frameSize: N });
        const lit = []; for (let c = 0; c < g; c++) if (H.heights[c] > -80) lit.push(c);
        return lit;
    };
    ok("a tone on a round bin survives every resolution, in the column the formula names",
        [16, 32, 64, 128].every((g) => {
            const lit = litColumns(250, g);                       // 250 Hz -> bin 32
            return lit.length === 1 && lit[0] === Math.floor(32 * g / binCount); }),
        "grid 16 -> col 1, 32 -> 2, 64 -> 4, 128 -> 8, each equal to floor(32 * grid / 512)");

    // *** THIS SECOND TONE IS THE WHOLE CHECK, AND THE FIRST DRAFT DID NOT HAVE IT. ***
    // The draft asserted that a point sampler WOULD miss the tone -- by writing a point sampler in the gate
    // and running it. That grades an expression this file just wrote, not the module. Sabotage A proved it:
    // reverting songHeightfield to point-sampling left the gate ALL GREEN, because the sampler the module
    // actually used floors to c * 512 / grid and so lands on bin 32 exactly. The check was decorative and the
    // sabotage was the only thing that said so.
    //
    // Bin 33 is the fix: no floor-based point sampler at these resolutions ever visits it, and max-pooling
    // does, because pooling looks at a BAND rather than a point. So this asks the module a question whose
    // answer differs between the two implementations, which is what a check has to do.
    const offBin = frequencyOfBin(33, SR, N);
    ok("*** and so does a tone on a bin no point sampler would ever visit ***",
        [16, 32, 64, 128].every((g) => {
            const lit = litColumns(offBin, g);
            return lit.length === 1 && lit[0] === Math.floor(33 * g / binCount); }),
        `${offBin.toFixed(2)} Hz is bin 33; a sampler stepping floor(c * 512 / grid) visits 0, 32, 64, ... ` +
        `and never 33, so it would report the whole map silent`);
    report("a spectrogram cell is not the value at a point, it is what happened in that band over that " +
        "stretch, and the answer to that is the peak. Averaging is the other defensible choice and is worse: " +
        "it divides a one-bin spike by the width of the band, so a finer transform makes the tone fainter.");
}

console.log("\n5. *** THE CONTRACT IS THE ONE THE STAMPER ALREADY CONSUMES, COMPARED FIELD BY FIELD ***");
{
    const rh = repoHeightfield([{ path: "a/b.js", lines: 100 }, { path: "a/d.json", lines: 80 }], { grid: 16 });
    const sh = songHeightfield(tone(250, 1.0, SR), { grid: 16, sampleRate: SR, frameSize: N });
    const rk = Object.keys(rh).sort(), sk = Object.keys(sh).sort();
    ok("*** exactly the same keys as world/repoHeightfield.js ***", JSON.stringify(rk) === JSON.stringify(sk),
        rk.length + " keys: " + rk.join(" "));
    ok("  and the same types", rk.every((k) => typeof rh[k] === typeof sh[k]));
    ok("  and the same array-ness, which is where the first draft differed",
        rk.every((k) => Array.isArray(rh[k]) === Array.isArray(sh[k])));

    // *** THE FIELD THAT WOULD HAVE FAILED SILENTLY. ***
    const stamp = fs.readFileSync(path.join(ENG, "world/realTerrainStamp.js"), "utf8");
    ok("*** realTerrainStamp reads water.areas / water.ways, so a flat mask would paint nothing ***",
        /data\.water\.areas/.test(stamp) && /data\.water\.ways/.test(stamp),
        "the guard is truthy only on an object with those keys -- an array is silently falsy");
    ok("  and this module now emits that shape", !Array.isArray(sh.water) &&
        Array.isArray(sh.water.areas) && Array.isArray(sh.water.ways));
    ok("  with polygons in the unit-square bbox the stamper expects", sh.water.areas.length > 0 &&
        sh.water.areas.every((a) => a.poly.length === 4 &&
            a.poly.every(([lat, lon]) => lat >= 0 && lat <= 1 && lon >= 0 && lon <= 1)),
        sh.water.areas.length + " lakes, corners emitted as [1 - y, x] per repoHeightfield's convention");
    report("no consumer needed a song-specific branch. That is the test of whether this round built a thing " +
        "or a thing-shaped object, and it is why the round is worth doing at all: the solver and the " +
        "consumer were both already in the tree with nothing between them.");
}

console.log("\n6. SILENCE, AND A SWEEP THAT HAS TO BE A DIAGONAL");
{
    const q = songHeightfield(new Float64Array(SR * 2), { grid: 32, sampleRate: SR, frameSize: N });
    ok("*** silence is entirely water ***", q.stats.waterCells === 32 * 32,
        `${q.stats.waterCells} of ${32 * 32} cells -- a song with nothing in it is a lake`);

    const S = stft(sweep(200, 2000, 2.0, SR), { sampleRate: SR, frameSize: N, window: "hann" });
    const bins = S.frames.map((f) => peakOf(f).bin);
    let rising = 0; for (let i = 1; i < bins.length; i++) if (bins[i] >= bins[i - 1]) rising++;
    ok("*** a rising sweep draws a monotonically rising ridge ***", rising === bins.length - 1,
        `${rising} of ${bins.length - 1} steps rise -- ${bins[0]} to ${bins[bins.length - 1]}`);
    // *** AND ITS FIRST BIN IS THE FREQUENCY AT THE FRAME'S CENTRE, NOT AT ITS START. ***
    const centre = 200 + (2000 - 200) * (N / 2 / SR) / 2.0;
    ok("  and the first frame sits at the instantaneous frequency of its MIDPOINT",
        Math.abs(bins[0] - binOfFrequency(centre, SR, N)) <= 1,
        `bin ${bins[0]} vs ${binOfFrequency(centre, SR, N).toFixed(2)} for ${centre.toFixed(1)} Hz; ` +
        `the frame STARTS at 200 Hz (bin ${binOfFrequency(200, SR, N).toFixed(1)}), which it is not`);
    report("that off-by-seven-bins is the sort of thing that would have been called close enough. It is not " +
        "an error at all -- a frame spans 128 ms and the sweep climbs 115 Hz inside it, so the bin belongs to " +
        "the midpoint by construction. Predicting the wrong one is how a check passes for the wrong reason.");

    ok("centroidBin rises with brightness", centroidBin(stft(tone(2000, 0.5, SR), { sampleRate: SR, frameSize: N }).frames[0]) >
        centroidBin(stft(tone(200, 0.5, SR), { sampleRate: SR, frameSize: N }).frames[0]),
        "which is what selects the biome band, so a bright passage is different country from a dark one");
}

console.log("\n7. *** WIRED, NOT SHELVED -- WHICH THIS TREE HAS GOT WRONG AS RECENTLY AS FOUR ROUNDS AGO ***");
{
    // physics/render/roughDiffuse.mjs shipped at v4275 with a measured energy compensation and, five rounds
    // later, still has exactly two files reaching it: itself and its gate. A module whose only caller is the
    // thing that grades it is a module the engine does not have. So this section reads main.js.
    const MAIN = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok("*** main.js exposes window.songTerrain ***", /window\.songTerrain\s*=\s*\{/.test(MAIN));
    ok("  and it imports THIS module rather than reimplementing the transform",
        /await import\("\.\/world\/songHeightfield\.mjs"\)/.test(MAIN));
    ok("*** and hands the field to the SAME stamper repoTerrain uses ***",
        /await import\("\.\/world\/realTerrainStamp\.js"\)/.test(MAIN) &&
        /applyRealTerrain\(world, field,/.test(MAIN.slice(MAIN.indexOf("window.songTerrain"))),
        "no song-specific branch anywhere downstream -- that is what matching the contract bought");
    ok("  and reuses the existing fly-in rather than a second camera path",
        /window\.realTerrain\.flyIn/.test(MAIN.slice(MAIN.indexOf("window.songTerrain"))));
    ok("  it decodes real audio through the browser's own decoder when given a url",
        /decodeAudioData/.test(MAIN.slice(MAIN.indexOf("window.songTerrain"))),
        "whatever the browser can play, this can walk");
    ok("  and does something sensible with no arguments at all",
        /S\.sweep\(200, 2000, 4, sampleRate\)/.test(MAIN),
        "a rising sweep, the way repoTerrain.load() with no dir walks this engine's own tree");
    // A refusal, not a silent empty map, when the clip is shorter than one frame.
    ok("CONTROL: a clip shorter than one frame produces null rather than an empty terrain",
        songHeightfield(new Float64Array(100), { sampleRate: SR, frameSize: N }) === null,
        "100 samples against a 1024-sample frame -- and main.js turns that null into a thrown reason");
    ok("  and main.js really does throw on it rather than stamping nothing",
        /songTerrain: too short/.test(MAIN));
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read,
// world/songHeightfield.mjs restored md5-identical (2bea05e1701c). MEASURED, not predicted.
//
//   A  max-pooling reverted to point-sampling -- the defect that turned a 250 Hz tone into a lake covering
//      every cell of the map.
//      -> *** FIRST RUN: exit=0, ZERO RED. *** The gate passed while the module was broken, and the reason is
//      worth more than the sabotage. Section 4 had asserted that a point sampler WOULD miss the tone by
//      writing a point sampler INSIDE THE GATE and running that. It graded an expression this file had just
//      written, not the module -- and the sampler the module actually used floors to c * 512 / grid, which
//      lands on bin 32 exactly. Two different point samplers, one decorative check, and only the sabotage
//      said so. Rewritten to ask the MODULE about a tone on bin 33, which no floor-based sampler visits at
//      any of these resolutions. -> exit=1, 1 FAIL, and now it is a fact about the code.
//
//   B  `water` reverted to a flat mask array, the shape realTerrainStamp.js silently ignores.
//      -> exit=1, 2 FAIL: the array-ness comparison against repoHeightfield, and the explicit shape check.
//      This is the sabotage closest to a real mistake -- the field is present, plausible, full of correct
//      values, and would have painted nothing while reporting nothing.
//
//   C  binOfFrequency wrapped in Math.round.
//      -> *** FIRST RUN: exit=0, ZERO RED, and again the gate was at fault. *** Every frequency the file
//      asked about sat on a whole bin, so a rounded formula answered identically everywhere; the header calls
//      it a continuous closed form and nothing tested that. Section 1 now round-trips 32.5 and 7.25.
//      -> exit=1, 1 FAIL. A sabotage that finds a hole in the GATE rather than a bug in the module is the
//      outcome sabotage is for, and this round produced two of them out of four.
//
//   D  window.songTerrain deleted from main.js, leaving the module and its gate intact.
//      -> exit=1, 7 FAIL, all in section 7. Everything about the transform still works perfectly and the
//      engine simply cannot reach it -- which is the state physics/render/roughDiffuse.mjs has been in since
//      v4275, with a measured energy compensation and no caller but its own gate. Seven reds for one deletion
//      is proportionate: being unreachable is not a small defect in a feature.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER ANY OF THIS LOOKS LIKE ANYTHING. Nothing renders the heightfield -- the " +
    "contract is compared field by field against the object realTerrainStamp.js consumes, and the stamper is " +
    "never called, so a terrain that is legible as DATA and unreadable as LANDSCAPE would pass every check " +
    "above. Also unchecked: any real song. Every signal here is synthesised, because a synthesised one has a " +
    "closed form and a recording does not; what a piece of music actually looks like as country is a question " +
    "this file cannot ask. And unchecked across MACHINES: section 2 proves two processes on this box agree, " +
    "which is the weakest test that is still a test -- physics/fft.js's promise is cross-platform and only a " +
    "second platform can settle it.");
process.exit(fails ? 1 : 0);
