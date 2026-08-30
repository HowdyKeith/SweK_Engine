// FILE: audio/inputChain.js -- v4197
//
// The Web Audio half of audio/inputChain.mjs: turn a chain description into real nodes.
//
// Everything that DECIDES anything -- which chains are legal, what a feedback loop needs, which parameter a
// modulation edge targets -- lives in the model. This file wires nodes together and does not judge.
//
// *** THE SAME buildChain() SERVES THE LIVE MICROPHONE AND THE OFFLINE RENDER, AND THAT IS THE POINT. ***
// An AudioContext and an OfflineAudioContext expose the same factory methods, so one builder covers both.
// If the gate built its own copy of the graph, it would be checking a graph nobody ships.
"use strict";

import { PRESETS, SINK, SOURCE, parseTarget, validateChain, curveFor } from "./inputChain.mjs";

/** Create one node from its descriptor. Every type NODE_TYPES accepts must appear here. */
function makeNode(ctx, d) {
    const P = d.params || {};
    switch (d.type) {
        case "gain": {
            const n = ctx.createGain(); n.gain.value = P.gain ?? 1; return n;
        }
        case "delay": {
            const n = ctx.createDelay(P.maxDelayTime ?? 1);
            n.delayTime.value = P.delayTime ?? 0; return n;
        }
        case "biquad": {
            const n = ctx.createBiquadFilter();
            n.type = P.type ?? "lowpass";
            if (P.frequency !== undefined) n.frequency.value = P.frequency;
            if (P.Q !== undefined) n.Q.value = P.Q;
            if (P.gain !== undefined) n.gain.value = P.gain;
            if (P.detune !== undefined) n.detune.value = P.detune;
            return n;
        }
        case "oscillator": {
            const n = ctx.createOscillator();
            n.type = P.type ?? "sine";
            if (P.frequency !== undefined) n.frequency.value = P.frequency;
            if (P.detune !== undefined) n.detune.value = P.detune;
            return n;
        }
        case "waveshaper": {
            const n = ctx.createWaveShaper();
            n.curve = curveFor(P.curve ?? "tanh");
            // "4x" oversampling is not cosmetic on a distortion: clipping generates harmonics above Nyquist
            // and they fold back down as inharmonic aliasing, which sounds like grit rather than drive.
            n.oversample = P.oversample ?? "4x";
            return n;
        }
        case "compressor": {
            const n = ctx.createDynamicsCompressor();
            for (const k of ["threshold", "knee", "ratio", "attack", "release"]) {
                if (P[k] !== undefined) n[k].value = P[k];
            }
            return n;
        }
        case "panner": {
            const n = ctx.createStereoPanner(); n.pan.value = P.pan ?? 0; return n;
        }
        default:
            throw new Error(`inputChain: no builder for node type "${d.type}" -- the model accepts it and this file cannot make it`);
    }
}

/**
 * Build `chain` on `ctx`, reading from `src` and writing to `dest` (defaults to ctx.destination).
 *
 * @returns { nodes: Map<id,AudioNode>, start(when), stop() } -- oscillators need starting, and a caller that
 *          forgets gets a chorus with no sweep: the graph is correct, the modulation simply never runs.
 */
export function buildChain(ctx, chain, src, dest = ctx.destination) {
    const problems = validateChain(chain);
    if (problems.length) throw new Error("inputChain.buildChain: " + problems.join("; "));
    const nodes = new Map();
    for (const d of chain.nodes) nodes.set(d.id, makeNode(ctx, d));

    const resolve = (t) => {
        const { node: id, param } = parseTarget(t);
        if (id === SINK) return dest;
        const n = nodes.get(id);
        // *** CONNECTING TO A PARAMETER IS A DIFFERENT CALL, NOT A DIFFERENT ARGUMENT. ***
        return param ? n[param] : n;
    };
    for (const t of chain.from) src.connect(resolve(t));
    for (const d of chain.nodes) for (const t of d.to || []) nodes.get(d.id).connect(resolve(t));

    const oscs = chain.nodes.filter((d) => d.type === "oscillator").map((d) => nodes.get(d.id));
    return {
        nodes,
        start(when = 0) { for (const o of oscs) { try { o.start(when); } catch {} } },
        stop() { for (const o of oscs) { try { o.stop(); } catch {} } },
    };
}

/**
 * Render `samples` through a chain and hand back the result. No clock, no device, no microphone.
 *
 * *** THIS IS THE FUNCTION THAT MAKES A NODE GRAPH TESTABLE. *** v4190 concluded a node graph "plays and can
 * never be hashed" and it is only half true: what cannot be hashed is a graph tied to a real clock. An
 * OfflineAudioContext renders as fast as it can and, measured, bit-identically across processes -- so the
 * chain a page plays live is the chain a gate can hash.
 */
export async function renderOffline(chain, samples, sampleRate = 48000, opts = {}) {
    if (typeof OfflineAudioContext === "undefined") throw new Error("inputChain: no OfflineAudioContext in this environment");
    const n = samples.length;
    const ctx = new OfflineAudioContext(opts.channels ?? 1, n, sampleRate);
    const buf = ctx.createBuffer(1, n, sampleRate);
    buf.getChannelData(0).set(samples);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const built = buildChain(ctx, chain, src, ctx.destination);
    src.start(); built.start(0);
    const out = await ctx.startRendering();
    return out.getChannelData(0);
}

/**
 * The live half: microphone in, chain out, speakers.
 *
 * *** IT DOES NOT CONNECT TO THE SPEAKERS BY DEFAULT, AND THAT IS DELIBERATE. *** A microphone routed to the
 * output of the same machine is a feedback loop through the room, and the room has no gain limit. `monitor`
 * has to be asked for.
 */
export class MicChain {
    constructor(ctx) {
        this.ctx = ctx;
        this.stream = null;
        this.source = null;
        this.built = null;
        this.chainName = null;
        this.output = ctx.createGain();          // the chain's tap, for an analyser or a recorder
        this.bypass = false;
    }

    /** Ask for the microphone. Separate from setChain so a chain can be swapped without re-prompting. */
    async open(constraints = { audio: true }) {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.source = this.ctx.createMediaStreamSource(this.stream);
        return this.stream;
    }

    /** Swap the effect chain. Tearing the old one down first -- an orphaned graph keeps running and summing. */
    setChain(nameOrChain) {
        if (!this.source) throw new Error("MicChain: open() the microphone first");
        this.teardown();
        const chain = typeof nameOrChain === "string" ? PRESETS[nameOrChain] : nameOrChain;
        if (!chain) throw new Error(`MicChain: no preset named "${nameOrChain}"`);
        this.chainName = typeof nameOrChain === "string" ? nameOrChain : (chain.title || "custom");
        this.built = buildChain(this.ctx, chain, this.source, this.output);
        this.built.start(0);
        return this.built;
    }

    /** Straight through, no effect -- the control every effect needs to be judged against. */
    setBypass(on) {
        this.bypass = !!on;
        if (!this.source) return;
        this.teardown();
        if (this.bypass) this.source.connect(this.output);
        else if (this.chainName && PRESETS[this.chainName]) this.setChain(this.chainName);
    }

    /** Route the processed signal to the speakers. Off by default -- see the class comment. */
    monitor(on) {
        try { on ? this.output.connect(this.ctx.destination) : this.output.disconnect(this.ctx.destination); } catch {}
    }

    teardown() {
        try { if (this.built) this.built.stop(); } catch {}
        try { if (this.source) this.source.disconnect(); } catch {}
        this.built = null;
    }

    /** Release the microphone. A track left live keeps the recording indicator on. */
    close() {
        this.teardown();
        try { this.stream?.getTracks().forEach((t) => t.stop()); } catch {}
        this.stream = null; this.source = null;
    }
}

export { PRESETS, validateChain };
