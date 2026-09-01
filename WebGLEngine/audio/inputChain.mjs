// FILE: audio/inputChain.mjs -- v4197
//
// AN AUDIO EFFECT CHAIN AS DATA: a list of node descriptors that a browser can build and a gate can read.
// Pure -- no AudioContext, no clock, no DOM -- so everything that DECIDES anything lives here and
// audio/inputChain.js only wires it up.
//
// Shape taken from cwilso/Audio-Input-Effects (MIT), which puts chorus and flanging on live microphone input.
// Written here rather than vendored, because the value to this tree is not the two effects.
//
// *** WHAT THIS TREE COULD AND COULD NOT DO, MEASURED BEFORE WRITING A LINE. *** It captures the microphone
// in four places -- ui/sttLayer.js, simulation/VoiceCommander.js, dictation.html and AudioLab.html -- and
// AudioLab can already synthesise with oscillators, biquads, a convolver, FM and AudioWorklets. But every
// one of those four does `src.connect(analyser)` and stops. The microphone has been LISTENED TO and never
// PROCESSED. This is the audio half of what v4188 did for the camera: an input the engine's own effects can
// actually be applied to.
//
// *** AND IT SETTLES A CLAIM v4190 MADE, WHICH WAS HALF WRONG. *** Assessing rexa-developer/tiks, this tree
// rejected the Web Audio node graph on the grounds that "a node graph plays and can never be hashed", and
// built audio/sfxModel.mjs to render PCM offline instead. The first half is right and the second is not: a
// graph PLAYING in real time is tied to a clock and a device and cannot be hashed, but the same graph
// RENDERED through an OfflineAudioContext is bit-deterministic. MEASURED, on a chain chosen to be hostile --
// an IIR biquad carrying state, a feedback delay loop, an LFO modulating delayTime through a fractional read
// head, and a waveshaper: three renders in one process and a fourth in a fresh process and a fresh browser
// all produced the SAME sha256. So a node graph can be gated after all, and the live microphone is simply
// the unreproducible input beside it -- exactly the arrangement media/afContainer.mjs (v4193) made for video.
"use strict";

/**
 * The node types a chain may use, and the parameters each accepts.
 *
 * A closed list on purpose: an unknown type in a chain is a typo that would otherwise surface as a silent
 * gap in the graph -- Web Audio does not complain about a node you never created, it just outputs nothing.
 */
export const NODE_TYPES = Object.freeze({
    gain:       Object.freeze(["gain"]),
    delay:      Object.freeze(["delayTime", "maxDelayTime"]),
    biquad:     Object.freeze(["type", "frequency", "Q", "gain", "detune"]),
    oscillator: Object.freeze(["type", "frequency", "detune"]),
    waveshaper: Object.freeze(["curve", "oversample"]),
    compressor: Object.freeze(["threshold", "knee", "ratio", "attack", "release"]),
    panner:     Object.freeze(["pan"]),
});

// *** ConvolverNode IS DELIBERATELY ABSENT, AND THE REASON IS THE ONE THIS FILE IS ABOUT. ***
// A reverb wants an impulse response, and the usual way to make one without shipping a file is decaying
// NOISE -- which means Math.random(), which means the render is different every time and the offline hash
// this whole module rests on stops meaning anything. A convolver could be added the moment it is fed a
// SEEDED impulse (audio/sfxModel.mjs already has that discipline) or a real recorded one. Adding it with
// Math.random would quietly cost the determinism measured in the header, so it is left out and said out loud.
// The rule this encodes: every type the validator ACCEPTS, audio/inputChain.js must be able to BUILD.

/** The two ids every chain has without declaring them: the source, and the destination. */
export const SOURCE = "in";
export const SINK = "out";

/**
 * *** A CONNECTION CAN TARGET A PARAMETER, NOT ONLY AN INPUT, AND THE DIFFERENCE IS THE WHOLE OF MODULATION.
 * *** `lfo -> delay` sums an audio signal into the delay's input. `lfo -> delay.delayTime` sweeps the delay
 * instead, which is what makes a chorus a chorus. They are one character apart in a data file and produce
 * completely different sound, so the two are parsed apart here rather than left to a builder to guess.
 */
export function parseTarget(t) {
    const dot = String(t).indexOf(".");
    return dot < 0 ? { node: String(t), param: null } : { node: t.slice(0, dot), param: t.slice(dot + 1) };
}

/**
 * Every node reachable from the source, following audio edges only.
 *
 * *** AN OSCILLATOR IS A SOURCE TOO, AND SO IS EVERYTHING BEHIND IT. *** The first draft of this seeded only
 * from the microphone and exempted oscillators themselves, which flagged the depth gain of every modulation
 * branch as unreachable -- chorus and flanger both failed their own validator. An LFO feeds a gain that sets
 * the depth before it ever reaches a parameter, so the exemption has to travel down the branch rather than
 * stop at its head. Seeded from the source AND from every oscillator.
 */
function reachableFrom(chain, start) {
    const byId = new Map(chain.nodes.map((n) => [n.id, n]));
    const seeds = [start, ...chain.nodes.filter((n) => n.type === "oscillator").map((n) => n.id)];
    const seen = new Set(seeds);
    const stack = [...seeds];
    while (stack.length) {
        const id = stack.pop();
        const node = byId.get(id);
        const outs = id === SOURCE ? (chain.from || []) : (node ? node.to || [] : []);
        for (const t of outs) {
            const { node: nid, param } = parseTarget(t);
            if (param) continue;                       // a param edge carries control, not signal
            if (!seen.has(nid)) { seen.add(nid); stack.push(nid); }
        }
    }
    return seen;
}

/**
 * Audio-edge cycles in the graph, each returned as the list of node ids involved.
 *
 * Cycles are not errors here -- a feedback delay IS a cycle, and it is how an echo repeats. See
 * validateChain for the rule that decides which cycles are legal.
 */
export function cyclesOf(chain) {
    const byId = new Map(chain.nodes.map((n) => [n.id, n]));
    const found = [];
    const colour = new Map();                          // 0 unvisited, 1 on stack, 2 done
    const path = [];
    const walk = (id) => {
        colour.set(id, 1); path.push(id);
        const node = byId.get(id);
        for (const t of (node ? node.to || [] : [])) {
            const { node: nid, param } = parseTarget(t);
            if (param || !byId.has(nid)) continue;
            const c = colour.get(nid) || 0;
            if (c === 1) found.push(path.slice(path.indexOf(nid)));
            else if (c === 0) walk(nid);
        }
        path.pop(); colour.set(id, 2);
    };
    for (const n of chain.nodes) if (!(colour.get(n.id) || 0)) walk(n.id);
    return found;
}

/**
 * Everything wrong with a chain, as a list. Empty means a browser can build it.
 *
 * These are checked here rather than at build time because every one of them produces a graph that CONNECTS
 * without complaint and then does something quiet and wrong: Web Audio has no error for a node nothing
 * reaches, a destination nothing feeds, or a feedback loop with a gain of 1.
 */
export function validateChain(chain) {
    const p = [];
    if (!chain || typeof chain !== "object" || !Array.isArray(chain.nodes)) return ["chain has no nodes array"];
    if (!Array.isArray(chain.from) || !chain.from.length) p.push("nothing is connected to the source");
    const ids = new Set();
    for (const n of chain.nodes) {
        if (!n || typeof n.id !== "string" || !n.id) { p.push("a node has no id"); continue; }
        if (n.id === SOURCE || n.id === SINK) p.push(`"${n.id}" is reserved`);
        if (ids.has(n.id)) p.push(`duplicate node id "${n.id}"`);
        ids.add(n.id);
        if (!(n.type in NODE_TYPES)) { p.push(`node "${n.id}" has unknown type "${n.type}"`); continue; }
        for (const k of Object.keys(n.params || {})) {
            if (!NODE_TYPES[n.type].includes(k)) p.push(`node "${n.id}" (${n.type}) has no parameter "${k}"`);
        }
        if (!Array.isArray(n.to)) p.push(`node "${n.id}" has no connection list`);
    }
    const edges = [...(chain.from || []), ...chain.nodes.flatMap((n) => (Array.isArray(n.to) ? n.to : []))];
    for (const t of edges) {
        const { node: nid, param } = parseTarget(t);
        if (nid === SINK) { if (param) p.push(`"${t}" -- the destination has no parameters`); continue; }
        if (!ids.has(nid)) { p.push(`connection to unknown node "${nid}"`); continue; }
        const target = chain.nodes.find((n) => n.id === nid);
        if (param && target && target.type in NODE_TYPES && !NODE_TYPES[target.type].includes(param)) {
            p.push(`"${t}" -- ${target.type} has no parameter "${param}"`);
        }
    }
    // Reachability, both ways round. A node nothing reaches is dead weight; a chain that never reaches the
    // destination is silent, and silence is the one bug that looks exactly like a working mute.
    const live = reachableFrom(chain, SOURCE);
    if (!live.has(SINK)) p.push("no audio path from the source to the destination -- this chain is silent");
    for (const n of chain.nodes) {
        if (!live.has(n.id)) p.push(`node "${n.id}" is fed by nothing -- neither the source nor an oscillator reaches it`);
    }
    // *** THE RULE THAT MATTERS: A FEEDBACK LOOP MUST CONTAIN A DELAY. ***
    // Web Audio breaks a cycle by inserting one render quantum (128 samples) of latency, but only where a
    // DelayNode says how much. A loop with no delay is either silently dropped or runs away, and which one
    // depends on the implementation -- so a chain that relies on it is a chain that behaves differently on
    // someone else's machine. A loop that HAS a delay is an echo, which is a feature.
    for (const cyc of cyclesOf(chain)) {
        const nodes = cyc.map((id) => chain.nodes.find((n) => n.id === id)).filter(Boolean);
        if (!nodes.some((n) => n.type === "delay")) {
            p.push(`feedback loop ${cyc.join(" -> ")} contains no delay -- Web Audio cannot break it deterministically`);
        }
        // And a loop whose gains multiply to >= 1 grows without bound: a howl, not an echo.
        const g = nodes.filter((n) => n.type === "gain").reduce((a, n) => a * ((n.params || {}).gain ?? 1), 1);
        if (g >= 1) p.push(`feedback loop ${cyc.join(" -> ")} has round-trip gain ${g} -- at or above 1 it never decays`);
    }
    return p;
}

const g = (id, gain, to) => ({ id, type: "gain", params: { gain }, to });

/**
 * The shipped chains. Chorus and flanger are the two cwilso's repo demonstrates, and the pair is the point:
 * they are the SAME GRAPH with different numbers, which is exactly why an effect chain wants to be data.
 *
 *   chorus   long delay (~25 ms), slow gentle sweep, NO feedback  -> several voices slightly apart
 *   flanger  short delay (~3 ms), sweep through the comb, FEEDBACK -> the jet-plane sweep
 *
 * Reading them side by side is the argument for this file. As code they would be two functions that look
 * unrelated; as data the difference is four numbers and one edge.
 */
export const PRESETS = Object.freeze({
    chorus: {
        title: "chorus -- one voice becomes several",
        from: ["dry", "wet"],
        nodes: [
            g("dry", 0.7, [SINK]),
            { id: "wet", type: "delay", params: { delayTime: 0.025, maxDelayTime: 0.2 }, to: ["wetGain"] },
            g("wetGain", 0.5, [SINK]),
            { id: "lfo", type: "oscillator", params: { type: "sine", frequency: 0.6 }, to: ["lfoDepth"] },
            g("lfoDepth", 0.004, ["wet.delayTime"]),
        ],
    },
    flanger: {
        title: "flanger -- a comb filter swept through itself",
        from: ["dry", "wet"],
        nodes: [
            g("dry", 0.7, [SINK]),
            { id: "wet", type: "delay", params: { delayTime: 0.003, maxDelayTime: 0.05 }, to: ["wetGain", "fb"] },
            g("wetGain", 0.7, [SINK]),
            g("fb", 0.6, ["wet"]),                     // the feedback edge -- and it passes through `wet`
            { id: "lfo", type: "oscillator", params: { type: "sine", frequency: 0.25 }, to: ["lfoDepth"] },
            g("lfoDepth", 0.002, ["wet.delayTime"]),
        ],
    },
    echo: {
        title: "echo -- a delay that feeds itself",
        from: ["dry", "d"],
        nodes: [
            g("dry", 0.8, [SINK]),
            { id: "d", type: "delay", params: { delayTime: 0.25, maxDelayTime: 1.0 }, to: ["wetGain", "fb"] },
            g("wetGain", 0.5, [SINK]),
            g("fb", 0.4, ["d"]),
        ],
    },
    telephone: {
        title: "telephone -- the band a phone line actually passes",
        from: ["hp"],
        nodes: [
            { id: "hp", type: "biquad", params: { type: "highpass", frequency: 300, Q: 0.7 }, to: ["lp"] },
            { id: "lp", type: "biquad", params: { type: "lowpass", frequency: 3400, Q: 0.7 }, to: ["out_g"] },
            g("out_g", 1.4, [SINK]),
        ],
    },
    fuzz: {
        title: "fuzz -- clip it, then take the harshness back off",
        from: ["drive"],
        nodes: [
            g("drive", 8, ["shape"]),
            { id: "shape", type: "waveshaper", params: { curve: "tanh", oversample: "4x" }, to: ["tone"] },
            { id: "tone", type: "biquad", params: { type: "lowpass", frequency: 2600, Q: 0.7 }, to: ["lvl"] },
            g("lvl", 0.35, [SINK]),
        ],
    },
});

export const PRESET_NAMES = Object.freeze(Object.keys(PRESETS));

/** A readable summary of a chain, for a page or a console. */
export function describeChain(chain) {
    const cyc = cyclesOf(chain);
    const mod = chain.nodes.flatMap((n) => (n.to || []).filter((t) => parseTarget(t).param));
    return `${chain.nodes.length} nodes, ${mod.length} modulation edge(s), ${cyc.length} feedback loop(s)` +
           (cyc.length ? ` (${cyc.map((c) => c.join("->")).join("; ")})` : "");
}

/** The waveshaper curves a chain may name, built here so the browser and a gate agree on the samples. */
export function curveFor(name, n = 1024) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        out[i] = name === "tanh" ? Math.tanh(x * 3)
               : name === "hard" ? Math.max(-1, Math.min(1, x * 3))
               : x;
    }
    return out;
}
