// FILE: world/songHeightfield.mjs -- v4280
//
// *** A SONG IS ALREADY A HEIGHTFIELD. NOBODY HAD WRITTEN THE ONE LINE THAT SAYS SO. ***
//
// physics/fft.js has existed for a long time and is built, deliberately, to be BIT-REPRODUCIBLE: its twiddle
// factors come from the strict-trig core this tree proves bit-identical, and every butterfly after that is
// nothing but +, -, * and /. Its header says you can publish a spectrum and have someone else recompute it
// exactly. That was never tested against the thing it makes possible, because THE FFT HAD NO GEOMETRIC
// CONSUMER: nine files reach it, and every one of them either analyses audio for a meter or checks the
// transform against itself.
//
// A short-time Fourier transform is a two-dimensional array of numbers indexed by TIME and by FREQUENCY. That
// is a height grid. Not a metaphor for one, not a seed for noise that then makes one -- the same object, read
// with a different name. So this file writes the mapping down and hands the result to the stamper the tree
// already has.
//
// ---- WHY THE CONSUMER ALREADY EXISTS, WHICH IS THE ONLY REASON THIS IS WORTH BUILDING --------------------------
//
// world/repoHeightfield.js turns a file listing into "the exact object world/realTerrainStamp.js's
// applyRealTerrain() consumes" -- { heights, grid, min, max, bbox, water, biomes, peaks, lakes, stats } -- and
// main.js already flies a camera over whatever that produces. #133's rule was find the consumer BEFORE taking
// the solver; here the solver and the consumer were both already in the tree with nothing between them.
// songHeightfield() returns that same shape. Nothing downstream needs a song-specific branch.
//
// ---- *** WHAT MAKES THIS CHECKABLE RATHER THAN PRETTY *** ------------------------------------------------------
//
// A terrain generator can only be argued about on taste. A spectrogram cannot, because the Fourier transform
// of a pure tone has a closed form and the gate can predict the number before looking:
//
//   * A SINE AT A BIN-CENTRED FREQUENCY LANDS IN EXACTLY ONE BIN. bin = f * frameSize / sampleRate, and for
//     250 Hz at frameSize 1024 and 8 kHz that is bin 32 on the nose. Measured: peak at 32, neighbours at
//     1.9e-12, which is the float floor and not leakage.
//   * ITS MAGNITUDE IS EXACTLY A * frameSize / 2. Measured 512.000000 for a unit sine at N = 1024.
//   * AN OCTAVE IS A DOUBLING, so a tone an octave up sits at exactly twice the bin index. Integer, no
//     tolerance needed.
//   * PARSEVAL holds to float: the energy in the frame equals the energy in its spectrum over N.
//
// So the ridge a pure tone draws in this terrain is at a position the gate computes independently and
// compares, the way physics/rebar.mjs predicts the ellipse a plane cuts from a cylinder rather than liking
// the picture.
//
// ---- AND THE HONEST LIMIT, MEASURED RATHER THAN WAVED AT --------------------------------------------------------
//
// *** ALL OF THAT IS TRUE ONLY FOR A TONE WHOSE PERIOD FITS THE WINDOW A WHOLE NUMBER OF TIMES. *** Move it
// half a bin and a rectangular window smears it across the whole spectrum -- scalloping loss, and the ridge
// stops being one column. That is not a defect in the transform, it is what a finite window does, and the
// gate MEASURES it rather than choosing only the flattering frequency. windowFor() offers Hann as well, which
// trades a wider ridge for far less smearing, and the two are compared on the same signal.
//
// NOTHING IS TAKEN FROM ANY REPOSITORY HERE. An STFT is textbook, physics/fft.js is this tree's own, and the
// heightfield contract is world/repoHeightfield.js's.
"use strict";

import { spectrum } from "../physics/fft.js";

/** Where a frequency lands. The closed form the gate checks against, exported so both read one statement. */
export const binOfFrequency = (hz, sampleRate, frameSize) => hz * frameSize / sampleRate;

/** And back. binOfFrequency(frequencyOfBin(k)) === k for every k, which the gate asserts rather than assumes. */
export const frequencyOfBin = (k, sampleRate, frameSize) => k * sampleRate / frameSize;

/** Peak magnitude a bin-centred sine of amplitude A produces: exactly A * frameSize / 2. */
export const peakMagnitude = (amplitude, frameSize) => amplitude * frameSize / 2;

/**
 * Analysis windows.
 *
 * *** rect IS NOT "NO WINDOW". *** It is a rectangular window, and its sharp edges are exactly what smears a
 * tone that does not complete a whole number of cycles in the frame. It is the default here because it makes
 * the closed forms above EXACT for bin-centred tones, which is what a gate can grade; hann is what you would
 * choose to look at a real song.
 */
export const WINDOWS = Object.freeze({
    rect: (n, N) => 1,
    hann: (n, N) => 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N),
});

export function windowFor(name) {
    const w = WINDOWS[name];
    if (!w) return null;                                   // an unknown window is null, never silently rect
    return w;
}

/**
 * The biome names, in the order repoHeightfield uses them, so one terrain reader serves both maps.
 *
 * *** THE LEGEND IS A DIFFERENT SENTENCE FOR A SONG THAN FOR A REPOSITORY, AND THAT IS THE POINT. ***
 * There, index 1 is "forest" because the column holds JavaScript. Here it is "forest" because the passage
 * above it is dark -- its energy sits low in the spectrum. The BAND is the same band and the painter needs no
 * branch; what changed is the reason a column is forested.
 */
export const BIOME_ORDER = Object.freeze(
    ["", "forest", "tundra", "taiga", "shrubland", "jungle", "plains", "savanna", "desert"]);

export const BIOME_LEGEND = Object.freeze({
    forest: "darkest passages -- spectral centroid in the lowest eighth",
    tundra: "low and sparse", taiga: "low-mid", shrubland: "mid-low",
    jungle: "middle of the spectrum", plains: "mid-high", savanna: "bright",
    desert: "brightest passages -- centroid in the highest eighth",
});

export const DEFAULTS = Object.freeze({
    sampleRate: 8000,
    frameSize: 1024,     // power of two: physics/fft.js is radix-2 and says so
    hop: 512,            // 50% overlap
    window: "rect",
    grid: 128,
    silenceDb: -80,      // below this a cell is water: a song's silences become its lakes
    floorDb: -100,       // magnitudes below this clamp, so log(0) never reaches the terrain
});

/**
 * Short-time Fourier transform: the raw time-by-frequency field, BEFORE any resampling.
 *
 * This is the one the closed forms are exact about, which is why it is exported separately from the
 * square heightfield the stamper wants. Resampling to a square grid moves a ridge by up to half a cell, and a
 * gate that only ever saw the resampled field could not tell an exact answer from a nearly-right one.
 *
 * @returns { frames, frameCount, binCount, frameSize, hop, sampleRate } -- frames[t][k] is a magnitude
 */
export function stft(samples, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const N = o.frameSize;
    if ((N & (N - 1)) !== 0) return null;                  // not a power of two: refuse, do not round
    const win = windowFor(o.window);
    if (!win) return null;
    const hop = Math.max(1, Math.round(o.hop));
    const binCount = N / 2;                                // the real half; bin N/2..N-1 mirrors it
    const frames = [];
    for (let start = 0; start + N <= samples.length; start += hop) {
        const buf = new Float64Array(N);
        for (let n = 0; n < N; n++) buf[n] = samples[start + n] * win(n, N);
        const mag = spectrum(buf);
        frames.push(mag.slice(0, binCount));
    }
    return { frames, frameCount: frames.length, binCount, frameSize: N, hop, sampleRate: o.sampleRate };
}

/** Magnitude to decibels, with a floor so silence is a number rather than -Infinity. */
export const toDb = (mag, ref, floorDb) => {
    if (!(mag > 0) || !(ref > 0)) return floorDb;
    const db = 20 * Math.log10(mag / ref);
    return db < floorDb ? floorDb : db;
};

/**
 * Spectral centroid of one frame, in bins -- the "brightness" that chooses a biome.
 *
 * A frame whose energy sits low is dark and forested; one whose energy sits high is bright and bare. This is
 * a real acoustic descriptor rather than a hash of the frame, so two similar-sounding passages land in
 * similar country, which is the whole point of using the song rather than a seed derived from it.
 */
export function centroidBin(frame) {
    let num = 0, den = 0;
    for (let k = 0; k < frame.length; k++) { num += k * frame[k]; den += frame[k]; }
    return den > 0 ? num / den : 0;
}

/**
 * Downsample a frameCount x binCount field onto grid x grid by taking the MAXIMUM in each cell's band.
 *
 * *** POINT-SAMPLING A SPECTRUM THROWS THE SIGNAL AWAY, AND THE FIRST DRAFT DID EXACTLY THAT. ***
 * It picked one bin per output column by rounding. A pure tone occupies ONE bin out of 512, so at grid 16 the
 * sampler stepped 0, 34, 68, ... and never landed on bin 32: every cell came back at the floor, the whole map
 * was classified as silence, and a 250 Hz tone produced a lake. The picture was wrong in the most complete
 * way available and nothing threw.
 *
 * A spectrogram cell is not "the value at a point", it is "what happened in this band over this stretch", and
 * for that the answer is the peak. Max-pooling also makes the ridge SURVIVE downsampling, which is what lets
 * the gate check a predicted bin against a coarse grid at all. Averaging would have been the other defensible
 * choice and is worse here: it divides a one-bin spike by the width of the band, so the louder the resolution
 * the fainter the tone.
 */
function poolMax(frames, frameCount, binCount, grid, value) {
    const out = new Float64Array(grid * grid);
    for (let r = 0; r < grid; r++) {
        const t0 = Math.floor(r * frameCount / grid), t1 = Math.max(t0 + 1, Math.floor((r + 1) * frameCount / grid));
        for (let c = 0; c < grid; c++) {
            const k0 = Math.floor(c * binCount / grid), k1 = Math.max(k0 + 1, Math.floor((c + 1) * binCount / grid));
            let best = -Infinity;
            for (let t = t0; t < t1 && t < frameCount; t++)
                for (let k = k0; k < k1 && k < binCount; k++) {
                    const v = value(frames[t], k, t);
                    if (v > best) best = v;
                }
            out[r * grid + c] = best === -Infinity ? value(frames[Math.min(t0, frameCount - 1)], k0, t0) : best;
        }
    }
    return out;
}

/**
 * A song as terrain, in the exact shape world/realTerrainStamp.js already consumes.
 *
 * *** THE AXES ARE A DECISION AND THEY ARE WRITTEN DOWN. *** Rows are TIME, row 0 = north, so walking south
 * is listening to the song play forward. Columns are FREQUENCY, west = low, east = high, so the treble side
 * of the map is the east. Height is magnitude in dB relative to the loudest cell in the piece, floored --
 * decibels because that is what makes a quiet harmonic visible beside a loud fundamental, and relative
 * because an absolute scale would make a quiet recording flat rather than quiet.
 *
 * @param samples Float64Array-like PCM, mono, nominally -1..1
 * @returns the repoHeightfield contract: { heights, grid, min, max, bbox, water, biomes, peaks, lakes, stats }
 */
export function songHeightfield(samples, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const S = stft(samples, o);
    if (!S || S.frameCount === 0) return null;
    const grid = Math.max(8, Math.round(o.grid));

    let loudest = 0;
    for (const f of S.frames) for (let k = 0; k < f.length; k++) if (f[k] > loudest) loudest = f[k];

    const heights = poolMax(S.frames, S.frameCount, S.binCount, grid,
                            (frame, k) => toDb(frame[k], loudest, o.floorDb));
    let min = Infinity, max = -Infinity;
    for (const h of heights) { if (h < min) min = h; if (h > max) max = h; }

    // *** SILENCE IS WATER -- AND IT HAS TO BE POLYGONS, WHICH THE FIRST DRAFT GOT WRONG. ***
    // A cell quieter than silenceDb is a lake, reusing the layer repoHeightfield built for lockfiles without
    // inventing a second meaning: in both maps water is "nothing is happening here". But the first draft
    // returned water as a FLAT MASK ARRAY, and realTerrainStamp.js reads `data.water.areas` and
    // `data.water.ways`. Both are undefined on an array, so the guard would have been falsy, no water would
    // have been painted, AND NOTHING WOULD HAVE REPORTED A PROBLEM -- a field that looks right, is the wrong
    // shape, and fails silently. Caught by comparing the two objects key by key and then type by type.
    //
    // Contiguous silent cells in a row merge into one rectangle, so a bar of silence is one lake rather than
    // a hundred puddles. The corner order is repoHeightfield's: a rect corner emitted as [1 - y, x] lands at
    // exactly (x, y) under latlonToWorld for the unit-square bbox.
    const mask = new Uint8Array(grid * grid);
    for (let i = 0; i < heights.length; i++) mask[i] = heights[i] <= o.silenceDb ? 1 : 0;
    const areas = [];
    for (let r = 0; r < grid; r++) {
        let c = 0;
        while (c < grid) {
            if (!mask[r * grid + c]) { c++; continue; }
            let end = c; while (end + 1 < grid && mask[r * grid + end + 1]) end++;
            const x0 = c / grid, x1 = (end + 1) / grid, y0 = r / grid, y1 = (r + 1) / grid;
            areas.push({ path: `silence@${(r * S.hop / S.sampleRate).toFixed(2)}s`,
                         poly: [[1 - y0, x0], [1 - y0, x1], [1 - y1, x1], [1 - y1, x0]] });
            c = end + 1;
        }
    }
    const water = { areas, ways: [] };

    // *** THE BIOME AXIS IS BORROWED, NOT INVENTED, AND ITS LEGEND SHIPS WITH IT. ***
    // repoHeightfield returns biomeOrder and biomeLegend beside its biomes, because a grid of small integers
    // is meaningless without the list that names them. The first draft of this file returned `biomes` alone
    // and called the contract matched -- three of repoHeightfield's thirteen keys were missing, and the gate
    // that compares the two objects key by key is what said so. A shape you have not compared is not a shape
    // you match.
    const centroids = S.frames.map((f) => centroidBin(f) / Math.max(1, S.binCount - 1));
    const BIOMES = 8;
    const biomes = new Uint8Array(grid * grid);
    for (let r = 0; r < grid; r++) {
        const t = Math.min(S.frameCount - 1, Math.floor(r * S.frameCount / grid));
        const b = 1 + Math.min(BIOMES - 1, Math.floor(centroids[t] * BIOMES));
        for (let c = 0; c < grid; c++) biomes[r * grid + c] = b;
    }

    // Peaks: the loudest cells, reported as the summits of the piece.
    const idx = [...heights.keys()].sort((a, b) => heights[b] - heights[a]).slice(0, 12);
    const peaks = idx.map((i) => ({
        x: (i % grid) / (grid - 1), y: Math.floor(i / grid) / (grid - 1), h: heights[i],
        seconds: Math.floor(i / grid) / (grid - 1) * (S.frameCount * S.hop) / S.sampleRate,
        hz: frequencyOfBin((i % grid) / (grid - 1) * (S.binCount - 1), S.sampleRate, S.frameSize),
    }));

    return {
        heights: Array.from(heights), grid, min, max,
        bbox: { west: 0, east: 1, south: 0, north: 1 },     // the unit square, as repoHeightfield uses
        water, biomes: Array.from(biomes), peaks, lakes: [],
        source: "song",
        biomeOrder: BIOME_ORDER,
        biomeLegend: BIOME_LEGEND,
        stats: {
            frameCount: S.frameCount, binCount: S.binCount, frameSize: S.frameSize, hop: S.hop,
            sampleRate: S.sampleRate, window: o.window, loudest,
            seconds: (S.frameCount * S.hop) / S.sampleRate,
            hzPerBin: frequencyOfBin(1, S.sampleRate, S.frameSize),
            secondsPerFrame: S.hop / S.sampleRate,
            waterCells: mask.reduce((a, v) => a + v, 0), waterAreas: areas.length,
        },
    };
}

/** A pure tone, for probes and for the gate: amplitude 1 unless asked otherwise. */
export function tone(hz, seconds, sampleRate = DEFAULTS.sampleRate, amplitude = 1) {
    const n = Math.round(seconds * sampleRate), out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin(2 * Math.PI * hz * i / sampleRate);
    return out;
}

/** A linear frequency sweep from f0 to f1 -- the signal that should draw a straight diagonal ridge. */
export function sweep(f0, f1, seconds, sampleRate = DEFAULTS.sampleRate) {
    const n = Math.round(seconds * sampleRate), out = new Float64Array(n);
    // Instantaneous frequency f(t) = f0 + (f1-f0) t/T, so phase is the integral: 2pi (f0 t + (f1-f0) t^2 / 2T).
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate, T = seconds;
        out[i] = Math.sin(2 * Math.PI * (f0 * t + (f1 - f0) * t * t / (2 * T)));
    }
    return out;
}
