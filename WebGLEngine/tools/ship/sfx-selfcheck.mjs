// WebGLEngine/tools/ship/sfx-selfcheck.mjs -- v4190
//
// GATES audio/sfxModel.mjs, audio/sfxPlay.js and sfx.html -- sound effects as data.
//
// *** WHAT MAKES THIS GATEABLE AT ALL, WHICH IS THE POINT OF THE ROUND. *** Every sound in this engine was a
// live Web Audio node graph: world/ProceduralMusic.js and world/RoomAmbience.js call ctx.createOscillator()
// and wire nodes together. That plays and can never be tested -- no artefact, nothing to compare between
// runs, nothing a headless gate can hold. A parameter block that renders to SAMPLES has all three.
//
// *** AND THE CLICK IS THE DEFECT THIS FILE EXISTS FOR. *** A sound whose last sample is not zero yanks the
// speaker back to rest in one step, which is a broadband pop. It is the most common defect in generated audio
// and it is invisible in the parameter block -- every number looks reasonable and every playback clicks.
// Section 3 checks the last sample of every preset, and sabotaging that one line turns it red.
//
// Run: node tools/ship/sfx-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { renderSfx, renderPreset, envelopeAt, durationOf, waveAt, lowPassStep, rng, toPCM16,
         PRESETS, WAVES, DEFAULTS, TAU, DEFAULT_RATE } from "../../audio/sfxModel.mjs";
import { strictSin } from "../../tools/strictTrig.mjs";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const hash = (s) => crypto.createHash("sha256").update(Buffer.from(toPCM16(s).buffer)).digest("hex");
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// 1) *** THE SAME BLOCK GIVES THE SAME BYTES. *** The claim the whole design is for.
{
    for (const name of Object.keys(PRESETS)) {
        const a = renderPreset(name), b = renderPreset(name);
        ok(hash(a.samples) === hash(b.samples), `${name}: two renders are byte-identical (${hash(a.samples).slice(0, 16)})`);
    }
    const hashes = Object.keys(PRESETS).map((n) => hash(renderPreset(n).samples));
    ok(new Set(hashes).size === hashes.length, `and all ${hashes.length} presets sound DIFFERENT from each other`);

    // *** NO CLOCK AND NO Math.random ANYWHERE, or none of the above would hold. ***
    const modelC = codeOnly(read("audio/sfxModel.mjs"));
    ok(!/Math\.random/.test(modelC), "*** the model never calls Math.random -- noise is seeded or the sound is not reproducible ***");
    ok(!/Date\.now|performance\.now/.test(modelC), "and has no clock");
}

// 2) *** THE STRICT SINE, AND THE MEASUREMENT THAT JUSTIFIED IT. ***
{
    const modelC = codeOnly(read("audio/sfxModel.mjs"));
    ok(/strictSin/.test(modelC), "*** the sine waveform uses strictSin, not Math.sin ***");
    ok(!/Math\.sin\s*\(/.test(modelC), "and Math.sin appears nowhere in the renderer");
    ok(/from "\.\.\/tools\/strictTrig\.mjs"/.test(noComments(read("audio/sfxModel.mjs"))), "imported from the tree's own strict core rather than reimplemented");

    // the reason, re-measured here so the claim in the header cannot rot
    let worst = 0;
    for (let i = 0; i < 4000; i++) {
        const x = (i / 4000) * TAU * 440;
        worst = Math.max(worst, Math.abs(Math.sin(x) - strictSin(x)));
    }
    const step16 = 1 / 32768;
    ok(worst < step16, `*** the strict sine differs from Math.sin by ${worst.toExponential(2)}, far under one 16-bit step (${step16.toExponential(2)}) -- inaudible by construction ***`);
    ok(worst > 0, "and it is a genuinely different computation, not an alias for Math.sin");

    // and it is fast enough to be worth doing: a second of audio well inside real time
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < DEFAULT_RATE; i++) strictSin(i * 0.01);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    ok(ms < 200, `one second of sine at ${DEFAULT_RATE} Hz takes ${ms.toFixed(1)} ms -- an order of magnitude inside real time`);
}

// 3) *** THE LAST SAMPLE IS ZERO. THE CLICK. ***
{
    for (const name of Object.keys(PRESETS)) {
        const r = renderPreset(name);
        ok(r.samples[r.samples.length - 1] === 0, `${name}: the last sample is EXACTLY zero, so it does not click`);
    }
    // the envelope really does reach zero on its own, rather than only the forced last sample hiding it
    const v = { attack: 0.01, sustain: 0.1, punch: 0.5, decay: 0.2, gain: 1 };
    ok(envelopeAt(durationOf({ volume: v }), v) === 0, "the envelope is zero at exactly its end");
    ok(envelopeAt(durationOf({ volume: v }) + 1, v) === 0, "and stays zero past it rather than going negative");
    ok(envelopeAt(-1, v) === 0, "and is zero before it starts");
    ok(near(envelopeAt(0, v), 0), "it rises from silence rather than starting at full volume, which is the same click at the front");
    ok(envelopeAt(0.011, v) > envelopeAt(0.1, v), "punch makes the start of the sustain louder than its end");
    ok(envelopeAt(0.005, v) > 0 && envelopeAt(0.005, v) < 1, "the attack is a ramp, not a step");
}

// 4) NOISE IS SEEDED.
{
    const a = renderSfx({ wave: "noise", seed: 5 }), b = renderSfx({ wave: "noise", seed: 5 });
    ok(hash(a.samples) === hash(b.samples), "*** the same seed gives the same noise -- otherwise 'the same spell sounds the same' is false ***");
    const c = renderSfx({ wave: "noise", seed: 6 });
    ok(hash(c.samples) !== hash(a.samples), "and a different seed gives different noise, so the seed is actually read");

    const r = rng(1), vals = [r(), r(), r(), r()];
    ok(vals.every((x) => x >= 0 && x < 1), "the generator stays in [0,1)");
    ok(new Set(vals).size === 4, "and does not repeat immediately");
    ok(rng(1)() === rng(1)(), "two generators from one seed agree");
    ok(rng(0)() === rng(0)(), "seed 0 is handled rather than producing a stuck sequence");
}

// 5) THE WAVEFORMS.
{
    const noRand = () => 0.5;
    for (const w of WAVES) {
        const vals = [];
        for (let i = 0; i < 64; i++) vals.push(waveAt(w, i / 64, 0.5, noRand));
        ok(vals.every((v) => v >= -1.0001 && v <= 1.0001), `${w} stays inside [-1, 1]`);
        ok(vals.every(Number.isFinite), `${w} produces no NaN or Infinity`);
    }
    ok(waveAt("square", 0.25, 0.5, noRand) === 1 && waveAt("square", 0.75, 0.5, noRand) === -1, "square is high then low");
    ok(waveAt("square", 0.3, 0.2, noRand) === -1, "*** and the duty cycle moves the switch point, so duty is a real control ***");
    ok(near(waveAt("saw", 0, 0.5, noRand), 1) && near(waveAt("saw", 1, 0.5, noRand), -1), "saw falls from 1 to -1 across the cycle");
    ok(near(waveAt("triangle", 0.5, 0.5, noRand), -1) && near(waveAt("triangle", 0, 0.5, noRand), 1), "triangle peaks at the ends and troughs in the middle");
    ok(near(waveAt("sine", 0.25, 0.5, noRand), 1, 1e-12), "sine peaks at a quarter cycle");
    ok(near(waveAt("sine", 0.5, 0.5, noRand), 0, 1e-12), "and crosses zero at the half");
    ok(waveAt("no-such-wave", 0.25, 0.5, noRand) === 1, "an unknown waveform falls back to square rather than silence nobody notices");

    // the filter must not be able to blow up
    let x = 0;
    for (let i = 0; i < 5000; i++) x = lowPassStep(x, i % 2 ? 1 : -1, 0.5);
    ok(Number.isFinite(x) && Math.abs(x) <= 1.0001, `*** the one-pole filter cannot run away (${x.toFixed(4)} after 5000 alternating steps) ***`);
    ok(near(lowPassStep(0, 1, 1), 1), "fully open, it passes the signal through");
    ok(Math.abs(lowPassStep(0, 1, 0.02)) < 0.1, "nearly closed, it barely moves");
    ok(Number.isFinite(lowPassStep(0, 1, 0)) && Number.isFinite(lowPassStep(0, 1, -5)), "and a zero or negative coefficient does not divide by zero");
}

// 6) EVERY SAMPLE IS A REAL NUMBER, AND NOTHING SILENTLY NORMALISES.
{
    for (const name of Object.keys(PRESETS)) {
        const r = renderPreset(name);
        let bad = 0, over = 0;
        for (let i = 0; i < r.samples.length; i++) {
            if (!Number.isFinite(r.samples[i])) bad++;
            if (Math.abs(r.samples[i]) > 1) over++;
        }
        ok(bad === 0, `${name}: no NaN or Infinity in ${r.samples.length} samples`);
        ok(over === 0, `${name}: nothing outside [-1, 1]`);
        ok(r.peak > 0.02, `${name}: it is actually audible (peak ${r.peak.toFixed(3)}), not a buffer of near-silence`);
        ok(r.clipped === 0, `${name}: does not clip (${r.clipped} clipped samples)`);
    }
    // a hot block must REPORT clipping rather than quietly normalising it away
    const hot = renderSfx({ wave: "square", volume: { attack: 0, sustain: 0.05, punch: 3, decay: 0.05, gain: 1 } });
    ok(hot.clipped > 0, "*** a block loud enough to clip REPORTS it -- a renderer that silently normalises hides a broken preset ***");
    ok(hot.peak <= 1.0001, "and the samples are still bounded, so the clip is a limit and not a wrap");
}

// 7) DEGENERATE BLOCKS ANSWER RATHER THAN THROWING.
{
    const empty = renderSfx({ volume: { attack: 0, sustain: 0, decay: 0 } });
    ok(empty.samples.length === 0 && empty.seconds === 0, "a zero-length envelope gives an empty buffer, not an infinite one");
    ok(empty.peak === 0 && empty.clipped === 0, "and reports nothing rather than NaN");
    ok(renderSfx({}).samples.length > 0, "an empty block falls back to the defaults and makes a sound");
    ok(Number.isFinite(renderSfx({ frequency: { start: 0, slide: -9999 } }).peak), "a frequency driven negative is floored rather than producing NaN");
    ok(renderSfx({ frequency: { start: 0, slide: -9999, min: 20 } }).samples.every(Number.isFinite), "and every sample stays finite");
    ok(durationOf({}) > 0 && durationOf({ volume: { attack: 0, sustain: 0, decay: 0 } }) === 0, "durationOf agrees with the envelope");

    let threw = false;
    try { renderPreset("no-such-preset"); } catch { threw = true; }
    ok(threw, "*** an unknown preset THROWS rather than playing silence, which is the failure nobody notices ***");
}

// 8) SAMPLE RATE INDEPENDENCE: a preset must sound like itself at any rate.
{
    const a = renderSfx(Object.assign({}, PRESETS.coin, { sampleRate: 44100 }));
    const b = renderSfx(Object.assign({}, PRESETS.coin, { sampleRate: 22050 }));
    ok(near(a.seconds, b.seconds, 1e-3), `*** the same block lasts the same time at 44100 and 22050 Hz (${a.seconds.toFixed(3)} vs ${b.seconds.toFixed(3)}) ***`);
    ok(Math.abs(a.samples.length / 2 - b.samples.length) < 4, "and holds about half as many samples, as it should");
    ok(Math.abs(a.peak - b.peak) < 0.15, "with a comparable peak");

    // *** AND THE PITCH MUST MATCH, WHICH IS THE PART THE FIRST VERSION OF THIS SECTION NEVER CHECKED. ***
    // Duration and sample count are rate-dependent by arithmetic and prove nothing about the SOUND. Changing
    // the slide from per-second to per-sample left every check above green: the seconds still matched, the
    // counts still halved, and the peak is set by the envelope rather than the frequency. Zero crossings count
    // the total phase advanced, so they catch it -- measured, 462 against 462 correct, and 3948 against 2164
    // once the slide is per-sample.
    const zc = (x) => { let n = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return n; };
    const za = zc(a.samples), zb = zc(b.samples);
    ok(zb > 20, `fixture: the half-rate render has enough crossings to compare (${zb})`);
    ok(Math.abs(za / zb - 1) < 0.02,
        `*** and the same PITCH: ${za} zero crossings at 44100 against ${zb} at 22050, ratio ${(za / zb).toFixed(3)} -- the slide is per SECOND, not per sample ***`);
}

// 9) THE PLAYER AND THE PAGE.
{
    const playC = codeOnly(read("audio/sfxPlay.js")), playS = noComments(read("audio/sfxPlay.js"));
    ok(/from "\.\/sfxModel\.mjs"/.test(playS), "the player uses the model rather than a second copy of the synthesis");
    ok(!/Math\.sin|createOscillator/.test(playC), "*** and does no synthesis of its own -- one owner for what a sound IS ***");
    ok(/resume\(\)/.test(playC), "*** it resumes the context -- a suspended AudioContext accepts every call and plays nothing ***");
    ok(/state === "suspended"/.test(playS), "and checks the state rather than resuming blindly once at startup");
    ok(/cache/.test(playC) && /this\.cache\.set/.test(playC), "renders are cached, so a sound played often is synthesised once");
    ok(/JSON\.stringify\(over\)/.test(playC), "*** and an overridden sound gets its own cache key -- otherwise it would serve the preset's buffer ***");
    ok(/close\(\)/.test(playC), "dispose() closes the context rather than leaving the audio device held");

    const page = noComments(read("sfx.html"));
    ok(/from "\.\/audio\/sfxModel\.mjs"/.test(page) && /from "\.\/audio\/sfxPlay\.js"/.test(page), "the page uses both real modules");
    ok(/crypto\.subtle\.digest/.test(page), "*** and hashes the rendered PCM in the browser, so the determinism claim is visible where a reader is ***");
    ok(/toPCM16/.test(page), "over the same 16-bit conversion this gate hashes");

    ok(/click/i.test(prose(read("audio/sfxModel.mjs"))), "the model explains the click in prose");
    ok(/strict/i.test(prose(read("audio/sfxModel.mjs"))) && /10\.18|4\.48/.test(read("audio/sfxModel.mjs")),
        "and carries the measured numbers that chose the strict sine, rather than asserting it was worth it");
}

// 10) THE PRESETS ARE DATA.
{
    ok(Object.keys(PRESETS).length >= 6, `${Object.keys(PRESETS).length} presets ship`);
    for (const [name, p] of Object.entries(PRESETS)) {
        ok(typeof p === "object" && !Array.isArray(p), `${name} is a plain object -- a table entry, not a function`);
        ok(WAVES.includes(p.wave), `${name} names a real waveform ("${p.wave}")`);
        ok(Number.isInteger(p.seed), `${name} pins a seed, so its noise is reproducible`);
    }
    ok(Object.isFrozen(PRESETS), "the table is frozen, so a caller cannot mutate a preset and change everyone's sound");
    ok(Object.isFrozen(WAVES) && Object.isFrozen(DEFAULTS), "and so are the waveform list and the defaults");
    const seeds = Object.values(PRESETS).map((p) => p.seed);
    ok(new Set(seeds).size === seeds.length, "every preset has its OWN seed, so two noise presets are not the same noise");
}

console.log(`sfx-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether these sounds are GOOD. What is checked is that a block always renders
the same bytes, that the strict sine costs less than one 16-bit step, that nothing clips or clicks,
and that an unknown preset throws instead of playing the silence nobody notices.`);
process.exit(fail ? 1 : 0);
