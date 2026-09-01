// WebGLEngine/tools/ship/inputChain-selfcheck.mjs -- v4197
//
// GATES audio/inputChain.mjs, audio/inputChain.js and ui/stagger.mjs.
//
// *** THE GAP, MEASURED BEFORE ANY CODE WAS WRITTEN. *** This tree opens the microphone in four files --
// ui/sttLayer.js, simulation/VoiceCommander.js, dictation.html and AudioLab.html -- and every one of them
// does `src.connect(analyser)` and stops. AudioLab can synthesise with oscillators, biquads, a convolver, FM
// and AudioWorklets; the microphone has been LISTENED TO and never PROCESSED. This is v4188's camera work
// with a different input.
//
// *** AND IT OVERTURNS HALF OF A CLAIM THIS TREE MADE AT v4190. *** Assessing rexa-developer/tiks, the round
// rejected the Web Audio node graph because "a node graph plays and can never be hashed". A graph playing in
// real time, tied to a clock and a device -- correct. The same graph rendered through an OfflineAudioContext
// -- not correct: measured bit-identical across three renders in one process and a fourth in a fresh process
// and a fresh browser, on a chain chosen to be hostile (IIR biquad state, a feedback delay loop, an LFO
// modulating delayTime through a fractional read head, a waveshaper). Section 6 is that measurement, and it
// is why a node graph is gateable at all.
//
// *** WHAT SECTION 6 ASSERTS IS DERIVED FROM THE CHAIN DATA, NOT TYPED IN. *** The delay lag each preset must
// show is read out of its own delayTime and its own modulation depth; a preset with no delay node gets no lag
// assertion, because filter ringing produces peaks that look exactly like echoes and an assertion that
// counted them would pass on nonsense. Found by measuring: `fuzz` reported "1 echo at lag 196" and has no
// delay in it at all.
//
// Run: node tools/ship/inputChain-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { PRESETS, PRESET_NAMES, NODE_TYPES, SOURCE, SINK, validateChain, cyclesOf,
         parseTarget, describeChain, curveFor } from "../../audio/inputChain.mjs";
import { staggerDelay, staggerDelays, staggerSpan, validateStagger, originIndex, ORIGINS } from "../../ui/stagger.mjs";
import { delaysFor, totalDuration } from "../../ui/odometerModel.mjs";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// 1) THE PRESETS ARE VALID, AND THE MODEL IS DATA.
{
    ok(PRESET_NAMES.length >= 5, `${PRESET_NAMES.length} chains ship as data`);
    for (const n of PRESET_NAMES) {
        const p = validateChain(PRESETS[n]);
        ok(p.length === 0, `${n} is a valid chain${p.length ? ": " + p.join("; ") : ""}`);
        ok(typeof PRESETS[n].title === "string" && PRESETS[n].title.includes("--"),
            `${n} says what it is, not just what it is called`);
        ok(JSON.parse(JSON.stringify(PRESETS[n])) !== null, `${n} is serialisable -- it is data, not closures`);
    }
    ok(Object.isFrozen(PRESETS) && Object.isFrozen(NODE_TYPES),
        "the tables are frozen, so one caller cannot retune an effect for everyone");
    // chorus and flanger are the same graph with different numbers -- the argument for data over code.
    const c = PRESETS.chorus, f = PRESETS.flanger;
    ok(c.nodes.some((n) => n.type === "delay") && f.nodes.some((n) => n.type === "delay"),
        "chorus and flanger are both a delay swept by an LFO");
    const cd = c.nodes.find((n) => n.type === "delay").params.delayTime;
    const fd = f.nodes.find((n) => n.type === "delay").params.delayTime;
    ok(cd > fd * 5, `and differ by their delay length alone: chorus ${cd}s vs flanger ${fd}s`);
    ok(cyclesOf(f).length === 1 && cyclesOf(c).length === 0,
        "*** and by ONE EDGE: the flanger feeds back, the chorus does not ***");
}

// 2) EVERY RULE validateChain ENFORCES MUST BE ABLE TO GO RED, or section 1 is decoration.
{
    const bad = (chain, re, why) => {
        const p = validateChain(chain);
        ok(p.some((x) => re.test(x)), why + (p.length ? " -- got: " + p.join("; ") : " -- got NO complaint"));
    };
    bad({ from: ["a"], nodes: [{ id: "a", type: "gain", params: { gain: 0.5 }, to: ["b", SINK] },
                               { id: "b", type: "gain", params: { gain: 0.9 }, to: ["a"] }] },
        /contains no delay/, "*** a feedback loop with no delay is refused -- Web Audio cannot break it deterministically ***");
    bad({ from: ["d"], nodes: [{ id: "d", type: "delay", params: { delayTime: 0.2 }, to: ["fb", SINK] },
                               { id: "fb", type: "gain", params: { gain: 1.1 }, to: ["d"] }] },
        /never decays/, "a loop whose round-trip gain reaches 1 is refused -- that is a howl, not an echo");
    bad({ from: ["a"], nodes: [{ id: "a", type: "gain", params: { gain: 1 }, to: [] }] },
        /silent/, "a chain with no path to the destination is refused -- silence looks exactly like a working mute");
    bad({ from: ["a"], nodes: [{ id: "a", type: "wobbulator", params: {}, to: [SINK] }] },
        /unknown type/, "an unknown node type is refused BY NAME");
    bad({ from: ["a"], nodes: [{ id: "a", type: "gain", params: { gian: 1 }, to: [SINK] }] },
        /no parameter "gian"/, "a misspelled parameter is refused -- Web Audio would ignore it in silence");
    bad({ from: ["a"], nodes: [{ id: "a", type: "gain", params: {}, to: ["nowhere"] }] },
        /unknown node "nowhere"/, "a dangling connection is refused");
    bad({ from: ["a"], nodes: [{ id: "a", type: "gain", params: {}, to: [SINK] },
                               { id: "b", type: "gain", params: {}, to: [SINK] }] },
        /fed by nothing/, "a node nothing reaches is refused");
    bad({ from: [], nodes: [{ id: "a", type: "gain", params: {}, to: [SINK] }] },
        /nothing is connected to the source/, "a chain the input never enters is refused");
    bad({ from: ["a"], nodes: [{ id: "a", type: "gain", params: {}, to: ["a.frequency"] }] },
        /has no parameter "frequency"/, "modulating a parameter the node does not have is refused");
    // And the control: the LFO branch of a real preset is NOT flagged, which is the bug this rule first had.
    ok(validateChain(PRESETS.chorus).length === 0,
        "*** control: an LFO's depth gain is NOT called unreachable -- the first draft of that rule failed every " +
        "modulated preset, because an oscillator is a source and so is everything behind it ***");
}

// 3) EVERY TYPE THE VALIDATOR ACCEPTS, THE BUILDER CAN BUILD.
{
    const builder = read("audio/inputChain.js");
    const missing = Object.keys(NODE_TYPES).filter((t) => !new RegExp(`case "${t}":`).test(builder));
    ok(missing.length === 0,
        `every one of the ${Object.keys(NODE_TYPES).length} accepted types has a builder case${missing.length ? " -- missing: " + missing.join(", ") : ""}`);
    ok(!("convolver" in NODE_TYPES),
        "*** ConvolverNode is deliberately absent: a noise impulse response needs Math.random, which would cost " +
        "the offline determinism this whole module rests on ***");
    ok(/seeded|Math\.random/.test(prose(read("audio/inputChain.mjs"))), "and the model says why, rather than just omitting it");
    ok(curveFor("tanh").length === 1024 && Math.abs(curveFor("tanh")[0] + Math.tanh(3)) < 1e-6,
        "the waveshaper curve is built in the MODEL, so a gate and the browser shape identically");
}

// 4) STAGGER REPRODUCES THE THREE CALL SITES IT REPLACES.
{
    ok(String(staggerDelays(5, { step: 90 })) === String([0, 90, 180, 270, 360]),
        "brainTrail's `drawStaggerMs * _drawn++` -- index x step from the first");
    ok(String(staggerDelays(6, { step: 28 })) === String([0, 28, 56, 84, 112, 140]),
        "peerRadar's `i * 28`");
    ok(String(staggerDelays(4, { step: 60, from: "last", start: 120 })) === String([300, 240, 180, 120]),
        "odometerModel's `(n - 1 - i) * stagger + base` -- from the LAST, which is what makes it an odometer");
    // *** THE EVEN-COUNT CENTRE. ***
    ok(originIndex(6, "center") === 2.5, "the centre of 6 items is 2.5, and is kept fractional");
    const c6 = staggerDelays(6, { step: 50, from: "center" });
    ok(c6[2] === c6[3] && c6[1] === c6[4] && c6[0] === c6[5],
        `*** so an even count stays symmetric: ${c6.join(", ")} -- rounding the origin would split the middle pair ***`);
    ok(staggerSpan(5, { step: 90 }, 300) === 660, "span counts the last delay plus one duration: 4*90 + 300");
    ok(staggerDelays(1, { step: 90, ease: "easeOutCubic" })[0] === 0, "an ease on a single item does nothing, correctly");
    for (const p of [validateStagger(5, { from: "middle" }), validateStagger(5, { step: -3 }), validateStagger(5, { ease: "nope" })]) {
        ok(p.length > 0, "validateStagger rejects: " + p.join("; "));
    }
    ok(validateStagger(5, { step: 90, from: "center", ease: "easeOutCubic" }).length === 0, "and accepts a good one");
    ok(ORIGINS.length === 3, `${ORIGINS.length} named origins: ${ORIGINS.join(", ")}`);
    ok(!/grid|axis/.test(codeOnly(read("ui/stagger.mjs"))),
        "grid and axis staggering are NOT implemented -- nothing in this tree needs them, and unused generality is upkeep");
}

// 5) THE odometerModel REFACTOR CHANGED NOTHING, ASSERTED RATHER THAN CLAIMED.
{
    // Recorded from the loop this replaced, before the change.
    const RECORDED = [
        { n: 1, o: {}, d: [100], t: 3100 },
        { n: 4, o: {}, d: [400, 300, 200, 100], t: 3400 },
        { n: 6, o: { letterAnimationDelay: 45 }, d: [325, 280, 235, 190, 145, 100], t: 3325 },
        { n: 3, o: { animationDelay: 20, letterAnimationDelay: 70 }, d: [160, 90, 20], t: 3160 },
        { n: 0, o: {}, d: [], t: 3100 },
        { n: 8, o: { duration: 500 }, d: [800, 700, 600, 500, 400, 300, 200, 100], t: 1300 },
    ];
    for (const r of RECORDED) {
        ok(String(delaysFor(r.n, r.o)) === String(r.d), `delaysFor(${r.n}) is unchanged: [${r.d}]`);
        ok(totalDuration(r.n, r.o) === r.t, `totalDuration(${r.n}) is unchanged: ${r.t}`);
    }
    ok(/from "\.\/stagger\.mjs"/.test(noComments(read("ui/odometerModel.mjs"))),
        "and it really does go through the shared module rather than keeping its own loop");
    ok(!/digitCount - 1 - i/.test(codeOnly(read("ui/odometerModel.mjs"))),
        "*** the old arithmetic is GONE, not left beside the new call -- two copies is what this round removes ***");
}

// 6) *** THE CHAINS, ACTUALLY RENDERED *** -- an OfflineAudioContext in a headless browser.
{
    const require_ = createRequire(import.meta.url);
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        note("SKIPPED -- " + skip);
        note("*** A SKIP, NOT A PASS. Sections 1-5 read the chain; only this one renders it, and rendering is " +
             "the entire argument that a node graph can be gated.");
    } else {
        note("chromium via " + pwFrom);
        const srv = http.createServer((rq, rs) => {
            const u = decodeURIComponent(rq.url.split("?")[0]);
            if (u === "/a.html") {
                rs.writeHead(200, { "Content-Type": "text/html" });
                return rs.end('<script type="module">import * as m from "/audio/inputChain.js";' +
                              ' window.__c = m; window.__ready = true;</script>');
            }
            const f = path.join(ENG, u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end("nf"); }
            rs.writeHead(200, { "Content-Type": /\.m?js$/.test(f) ? "text/javascript" : "text/plain" });
            rs.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const port = srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
        const pg = await (await b.newContext()).newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.goto("http://127.0.0.1:" + port + "/a.html", { waitUntil: "load" });
        await pg.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });

        const R = await pg.evaluate(async (names) => {
            const SR = 48000, N = SR / 2;
            const imp = new Float32Array(N); imp[1000] = 1;
            const two = new Float32Array(N);
            for (let i = 0; i < N; i++) two[i] = 0.4 * Math.sin(2 * Math.PI * 1000 * i / SR) + 0.4 * Math.sin(2 * Math.PI * 9000 * i / SR);
            const silence = new Float32Array(N);
            const goertzel = (buf, f) => { const w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w); let s1 = 0, s2 = 0;
                for (let i = 0; i < buf.length; i++) { const s0 = buf[i] + c * s1 - s2; s2 = s1; s1 = s0; }
                return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / buf.length; };
            const out = {};
            for (const n of names) {
                const ch = window.__c.PRESETS[n];
                const a = await window.__c.renderOffline(ch, imp, SR);
                const a2 = await window.__c.renderOffline(ch, imp, SR);
                const t = await window.__c.renderOffline(ch, two, SR);
                const s = await window.__c.renderOffline(ch, silence, SR);
                const peaks = [];
                for (let i = 1001; i < N - 1; i++) {
                    if (Math.abs(a[i]) > 0.02 && Math.abs(a[i]) >= Math.abs(a[i - 1]) && Math.abs(a[i]) > Math.abs(a[i + 1])) peaks.push(i - 1000);
                }
                out[n] = { deterministic: a.every((v, i) => v === a2[i]),
                           peak: Math.max(...Array.from(a).map(Math.abs)),
                           silenceEnergy: s.reduce((x, v) => x + v * v, 0),
                           inBand: goertzel(t, 1000), outBand: goertzel(t, 9000),
                           firstLag: peaks.length ? peaks[0] : null, nPeaks: peaks.length };
            }
            return out;
        }, PRESET_NAMES);
        ok(errs.length === 0, "the page built and rendered every chain with no script error" + (errs.length ? ": " + errs.join(" | ") : ""));

        for (const n of PRESET_NAMES) {
            const r = R[n];
            // A) DETERMINISM -- the claim the whole module rests on.
            ok(r.deterministic, `${n}: two offline renders are bit-identical`);
            // B) SILENCE IN, SILENCE OUT. A chain that makes energy from nothing is a runaway loop.
            ok(r.silenceEnergy === 0, `${n}: silence in gives EXACTLY silence out (energy ${r.silenceEnergy}) -- no self-oscillation`);
            // C) NO CLIPPING at the shipped gain staging.
            ok(r.peak <= 1.0, `${n}: peak ${r.peak.toFixed(4)} does not clip`);
            // D) THE DELAY LAG, WHERE AND ONLY WHERE THE DATA SAYS THERE IS A DELAY.
            const ch = PRESETS[n];
            const d = ch.nodes.find((x) => x.type === "delay");
            if (d) {
                let depth = 0;
                for (const nd of ch.nodes) for (const t of nd.to || []) {
                    const q = parseTarget(t);
                    if (q.node === d.id && q.param === "delayTime") depth = (nd.params || {}).gain ?? 0;
                }
                const base = d.params.delayTime * 48000, dep = depth * 48000;
                ok(r.firstLag !== null && r.firstLag >= base - dep - 2 && r.firstLag <= base + dep + 2,
                    `${n}: the echo arrives at ${r.firstLag} samples, inside [${(base - dep).toFixed(0)}, ${(base + dep).toFixed(0)}] ` +
                    `derived from its own delayTime ${d.params.delayTime}s and modulation depth ${depth}s`);
            } else {
                note(`${n}: no delay node, so no lag is asserted -- its peaks are filter ringing, and counting ` +
                     `them as echoes is how this check first passed on nonsense`);
            }
        }
        // E) THE FILTERS ACTUALLY FILTER, and the delay does NOT.
        ok(R.telephone.inBand / R.telephone.outBand > 5,
            `telephone passes 1kHz and stops 9kHz: ${R.telephone.inBand.toFixed(4)} vs ${R.telephone.outBand.toFixed(4)}`);
        ok(R.fuzz.inBand / R.fuzz.outBand > 5,
            `fuzz's tone control does the same: ${R.fuzz.inBand.toFixed(4)} vs ${R.fuzz.outBand.toFixed(4)}`);
        ok(Math.abs(R.echo.inBand - R.echo.outBand) < 0.01,
            `*** control: echo treats both tones alike (${R.echo.inBand.toFixed(4)} vs ${R.echo.outBand.toFixed(4)}) -- ` +
            `a delay is frequency-neutral, so the two checks above are measuring filtering and not just "an effect happened" ***`);
        ok(R.flanger.nPeaks > R.chorus.nPeaks,
            `and the flanger repeats where the chorus does not: ${R.flanger.nPeaks} peaks vs ${R.chorus.nPeaks} -- the one feedback edge`);
        await b.close(); srv.close();
    }
}

// 7) PURITY AND WIRING.
{
    const model = codeOnly(read("audio/inputChain.mjs"));
    ok(!/\bdocument\b|\bwindow\b|AudioContext|Math\.random|Date\.now/.test(model),
        "the model has no DOM, no AudioContext, no clock and no randomness -- a gate and a browser read the same rules");
    ok(/from "\.\/inputChain\.mjs"/.test(noComments(read("audio/inputChain.js"))),
        "the browser half uses the model rather than a second copy of the rules");
    ok(!/contains no delay|round-trip gain/.test(codeOnly(read("audio/inputChain.js"))),
        "*** and decides nothing itself -- one owner for what makes a chain legal ***");
    ok(/OfflineAudioContext/.test(codeOnly(read("audio/inputChain.js"))), "renderOffline is what the gate above actually calls");
    ok(/monitor/.test(codeOnly(read("audio/inputChain.js"))) && /destination/.test(codeOnly(read("audio/inputChain.js"))),
        "MicChain can reach the speakers, but only when asked -- a mic wired to its own output is a room-sized feedback loop");
    // *** THIS CHECK WAS DECORATION AND SABOTAGE SAID SO. *** It asked whether the string "inputChain.js"
    // occurred anywhere in AudioLab.html. Removing the import entirely left it GREEN, because this file's own
    // error message -- `throw new Error("audio/inputChain.js did not load")` -- is a string literal, and
    // noComments() keeps strings. The rule the tree already has for this: noComments for anything quoted,
    // codeOnly for code shapes; an import is a code SHAPE whose payload happens to be quoted, so it needs the
    // whole statement matched, not the path spotted.
    const lab = noComments(read("AudioLab.html"));
    ok(/import\s*\{[^}]*\bMicChain\b[^}]*\}\s*from\s*["']\/audio\/inputChain\.js["']/.test(lab),
        "*** AudioLab.html IMPORTS the chain by statement, so the microphone finally reaches an effect ***");
    ok(/new\s+IC\.MicChain\s*\(/.test(lab), "...and constructs one");
    ok(/micChain\.setChain\s*\(/.test(lab), "...and sets a chain on it, rather than merely naming the class");
    ok(/micChain\.output\.connect\s*\(\s*micAnalyser\s*\)/.test(lab),
        "*** and the analyser watches the CHAIN'S OUTPUT, not the raw mic -- which is the whole change ***");
    ok(/analysed|listened|processed/i.test(prose(read("audio/inputChain.mjs"))), "the model records the gap it was written to close");
    ok(/hash|deterministic/i.test(prose(read("audio/inputChain.mjs"))), "and the v4190 claim it half overturns");
}

console.log(`inputChain-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether these effects sound GOOD, and whether a given Chromium's biquad
matches another's. What is checked is that a chain is data a gate can read, that every structural rule can go
red, that the same builder serves the live microphone and the offline render, that an offline render is
bit-deterministic, and that each preset does the thing its own data says it does.`);
process.exit(fail ? 1 : 0);
