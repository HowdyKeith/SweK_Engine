// WebGLEngine/sim/populationGPU.js -- v3119
//
// THE GPU HALF: PING-PONG STATE, TILE REDUCTION, ASYNCHRONOUS READBACK.
//
// v3118 planned this and did not build it. This builds it, under the same discipline v3116 used for the face
// worker: the parts that cannot be executed here are kept THIN and carry no decisions, and everything that
// decides anything is either pure (sim/populationReduce.js, sim/populationField.js) or borrowed from something
// already tested (face/detectPump.js).
//
// *** THE FORMAT IS NOT NEGOTIABLE, AND THIS IS THE ROUND'S FINDING. *** The alpha channel packs kind*2+alive,
// so LIVENESS IS THE LOW BIT of an integer stored in a float. In RGBA32F that is exact. IN RGBA16F IT IS NOT:
// half-float represents integers exactly only to 2048, so a packed value of 2049 (kind 1024, alive) rounds to
// 2048 -- EVEN -- and the agent reads DEAD. Measured: kind 1023 survives, kind 1024 does not, and above that
// EVERY LIVE AGENT SILENTLY DISAPPEARS. The symptom is a population that vanishes, not an error, and RGBA16F is
// exactly what someone reaches for when they want to halve the bandwidth. So this refuses the format outright
// rather than trusting a comment.
//
// AND THE READBACK IS ASYNCHRONOUS OR IT IS POINTLESS. A synchronous gl.readPixels drains the pipeline and
// stalls the main thread -- the poller lesson for the fourth time, and the whole reason v3118 measured the
// reduction. The sequence is: reduce on the GPU, readPixels INTO A PIXEL_PACK_BUFFER (which returns
// immediately), plant a fence, and collect on a later frame when the fence reports done. At most one is in
// flight, and a fence that never resolves reads as UNKNOWN -- both decisions belong to detectPump, which
// already makes them for the face tracker.

import { createPump } from "../face/detectPump.js";
import { fieldPlan, tilePlan, planSpawns, intentsOrUnknown } from "./populationField.js";
import { reduceShaderSource } from "./populationReduce.js";
import { updateShaderSource } from "./populationUpdate.js";

/** Formats whose integers are exact enough for the low-bit liveness trick. See the header. */
export const SAFE_FORMATS = ["RGBA32F"];
export const HALF_FLOAT_EXACT_INT_LIMIT = 2048;   // measured: kind 1023 survives, 1024 does not

const QUAD_VS = `#version 300 es
void main() {
    // Fullscreen triangle from gl_VertexID -- no attribute buffers, nothing to bind, nothing to leak.
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function compile(gl, type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        // NAME THE SHADER AND KEEP THE LOG. A compile failure reported as "population unavailable" sends
        // somebody to the driver; the log line sends them to the line.
        const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh);
        throw new Error(label + " failed to compile: " + log);
    }
    return sh;
}
function link(gl, vsSrc, fsSrc, label) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc, label + " vs"));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + " fs"));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(label + " failed to link: " + gl.getProgramInfoLog(p));
    return p;
}

/**
 * @param gl        a WebGL2 rendering context
 * @param opts      { side, tile, format, targetPerTile, updateShader }
 * @returns         { step, poll, health, stats, dispose, plans }
 */
export function createPopulationGPU(gl, opts = {}) {
    if (!gl || typeof gl.createTransformFeedback !== "function") {
        // WebGL1 has no float render targets, no texelFetch and no PBOs. Refusing by NAME beats failing later
        // in a way that looks like a driver problem.
        throw new Error("population field needs WebGL2; this context is not one");
    }
    const format = opts.format || "RGBA32F";
    if (!SAFE_FORMATS.includes(format)) {
        throw new Error(
            "population field refuses " + format + ": liveness is the LOW BIT of a packed integer, and half-float " +
            "represents integers exactly only to " + HALF_FLOAT_EXACT_INT_LIMIT + " -- kind 1024 packs to 2049, " +
            "rounds to 2048, and reads DEAD. Every agent above that kind would silently vanish.");
    }
    if (!gl.getExtension("EXT_color_buffer_float")) {
        throw new Error("population field needs EXT_color_buffer_float to render to RGBA32F");
    }

    const field = fieldPlan({ side: opts.side || 1024 });
    const tiles = tilePlan(field, { tile: opts.tile || 32 });
    const pump = createPump({ targetHz: opts.targetHz || 10, silenceMs: opts.silenceMs || 2000 });

    const mkTex = (w, h) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
        // NEAREST and CLAMP: texelFetch ignores filtering, but a texture left on the default LINEAR is a
        // texture that will be sampled wrongly the first time somebody adds a sampler2D read to the update.
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
                              [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) {
            gl.texParameteri(gl.TEXTURE_2D, k, v);
        }
        return t;
    };
    const mkFbo = (tex) => {
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error("population framebuffer incomplete: 0x" + st.toString(16));
        return f;
    };

    // PING-PONG: read from one, write to the other, then SWAP. Writing into the texture being read is
    // undefined in GL and produces results that look almost right, which is the worst kind of wrong.
    let src = { tex: mkTex(field.side, field.side) }, dst = { tex: mkTex(field.side, field.side) };
    src.fbo = mkFbo(src.tex); dst.fbo = mkFbo(dst.tex);

    const redTex = mkTex(tiles.tilesPerSide, tiles.tilesPerSide);
    const redFbo = mkFbo(redTex);

    const updateProg = link(gl, QUAD_VS, opts.updateShader || DEFAULT_UPDATE, "population update");
    const reduceProg = link(gl, QUAD_VS, reduceShaderSource(tiles.tile), "population reduce");

    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, tiles.bytes, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    let fence = null, latest = null, disposed = false;

    function draw(prog, fbo, w, h, texUnit0) {
        gl.useProgram(prog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texUnit0);
        gl.uniform1i(gl.getUniformLocation(prog, "uField"), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return {
        plans: { field, tiles },

        /**
         * v3122 -- PUT AGENTS IN. THERE WAS NO WAY TO DO THIS AND THAT IS WHY EVERYTHING PASSED.
         *
         * texStorage2D allocates ZERO-FILLED storage, a zero alpha unpacks to {kind:0, alive:false}, and
         * nothing in v3119-v3121 could ever write a live agent. The field was PERMANENTLY EMPTY -- and every
         * invariant held, because conservation, kind-preservation, bounded motion and determinism are all
         * trivially true of nothing at all. A system whose checks pass because it does nothing is the quietest
         * failure in this whole project.
         */
        seed(rgba) {
            if (!(rgba instanceof Float32Array) || rgba.length !== field.slots * 4) {
                throw new RangeError("seed expects Float32Array of " + (field.slots * 4) + " (side " + field.side +
                    ", RGBA), got " + (rgba ? rgba.length : "null"));
            }
            gl.bindTexture(gl.TEXTURE_2D, src.tex);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.side, field.side, gl.RGBA, gl.FLOAT, rgba);
            gl.bindTexture(gl.TEXTURE_2D, null);
        },

        /**
         * v3122 -- THE FULL FIELD, SYNCHRONOUSLY, FOR VERIFICATION ONLY.
         *
         * This is the readback v3118 spent a round arguing against -- and the argument was about doing it PER
         * FRAME. Once, to compare the device against the reference, it is exactly the right tool: 16 MB and a
         * stall are nothing if they buy the answer to "does the shader compute what the JS says it does".
         * NAMED so it cannot be mistaken for the fast path, and never called by step().
         */
        readFullForVerification() {
            const out = new Float32Array(field.slots * 4);
            gl.bindFramebuffer(gl.FRAMEBUFFER, src.fbo);
            gl.readPixels(0, 0, field.side, field.side, gl.RGBA, gl.FLOAT, out);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return out;
        },

        /** Advance the simulation one step and, if the pump allows, START a readback. Never blocks. */
        step(now = performance.now()) {
            if (disposed) return;
            gl.useProgram(updateProg);
            // v3121 -- the rule is time-dependent, so the uniforms have to actually arrive. A shader whose
            // uTime never changes produces a perfectly steady flow that looks deliberate.
            gl.uniform1f(gl.getUniformLocation(updateProg, "uTime"), now * 0.001);
            gl.uniform1f(gl.getUniformLocation(updateProg, "uDt"), 1);
            draw(updateProg, dst.fbo, field.side, field.side, src.tex);
            const t = src; src = dst; dst = t;                        // SWAP -- see the ping-pong note above

            if (!pump.shouldSend(now)) return;                        // one in flight, dropped not queued
            try {
                gl.useProgram(reduceProg);
                gl.uniform1i(gl.getUniformLocation(reduceProg, "uSide"), field.side);
                draw(reduceProg, redFbo, tiles.tilesPerSide, tiles.tilesPerSide, src.tex);
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
                // INTO the buffer -- the offset form returns immediately instead of stalling for pixels.
                gl.readPixels(0, 0, tiles.tilesPerSide, tiles.tilesPerSide, gl.RGBA, gl.FLOAT, 0);
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            } catch (e) {
                pump.onSendFailed();                                   // clear the slot or the pump wedges
                throw e;
            }
        },

        /** Collect a finished readback, or return null. NEVER waits: a zero timeout, checked next frame. */
        poll(now = performance.now()) {
            if (disposed || !fence) return null;
            if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) return null;
            gl.deleteSync(fence); fence = null;
            const raw = new Float32Array(tiles.tiles * 4);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, raw);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
            // v3123 -- R is the live count, G is a FREE SLOT INDEX (-1 when the tile is full). Both come from
            // the same pass; taking only R was throwing away the half that makes spawning possible.
            const counts = new Float32Array(tiles.tiles), free = new Float32Array(tiles.tiles);
            for (let i = 0; i < tiles.tiles; i++) { counts[i] = raw[i * 4]; free[i] = raw[i * 4 + 1]; }
            pump.onResult(now); latest = { counts, free };
            return latest;
        },

        /**
         * v3123 -- WRITE NEW AGENTS INTO NAMED SLOTS. This is the half that makes the field a system rather
         * than a state: spawnIntents has produced intents since v3118 and NOTHING CONSUMED THEM.
         *
         * ONE TEXEL PER CALL, and the budget is why. A full-field upload to place a handful of agents would
         * push 16 MB to place 64 texels; a shader pass would need another program and another target. Small
         * uploads are the right tool AND they are unbounded if nobody bounds them, so the caller's budget is
         * enforced here rather than trusted.
         */
        /**
         * v3149 -- THE LOOP NOBODY HAD WRITTEN. Every piece existed: the reduction lands tile counts and a free
         * slot, spawnIntents turns counts into demand, planSpawns picks slots, writeAgents uploads texels. THE
         * SEQUENCE HAD NO CALLER, so the population could be read and could be written and never grew.
         *
         * IT RETURNS THE SHORTFALL, not just what it did. A world growing eight times slower than its policy
         * intends looks exactly like a world whose policy is working, and "delivered 4" must not read as "4
         * were wanted" -- the same law as a stalled readback that must report UNKNOWN rather than zero.
         *
         * AND IT REFUSES TO ACT ON A PUMP THAT HAS NOT SPOKEN. intentsOrUnknown already separates IDLE from
         * SILENT; spawning on either would invent population from a pipeline that never answered.
         */
        growPopulation(makeAgent, opts = {}) {
            const health = pump.health();
            const decision = intentsOrUnknown(health, latest && latest.counts, tiles, opts);
            if (!decision.ok) return { ok: false, why: decision.why, state: decision.state, delivered: 0 };
            const freeSlots = latest && latest.free;
            if (!freeSlots) return { ok: false, why: "the readback carried no free-slot channel", state: "no-free", delivered: 0 };
            const plan = planSpawns(decision.intents, freeSlots, tiles, makeAgent, opts);
            this.writeAgents(plan.writes);
            return { ok: true, state: decision.state, ...plan };
        },

        writeAgents(writes) {
            if (!Array.isArray(writes)) throw new TypeError("writeAgents expects an array");
            gl.bindTexture(gl.TEXTURE_2D, src.tex);
            const one = new Float32Array(4);
            for (const w of writes) {
                if (!Number.isInteger(w.slot) || w.slot < 0 || w.slot >= field.slots) {
                    // A SLOT OUTSIDE THE FIELD IS A PLANNING BUG, and silently clamping it would put an agent
                    // somewhere nobody asked for and lose the evidence.
                    throw new RangeError("slot " + w.slot + " outside field of " + field.slots);
                }
                one[0] = w.x; one[1] = w.y; one[2] = w.z; one[3] = w.packed;
                gl.texSubImage2D(gl.TEXTURE_2D, 0, w.slot % field.side, Math.floor(w.slot / field.side), 1, 1, gl.RGBA, gl.FLOAT, one);
            }
            gl.bindTexture(gl.TEXTURE_2D, null);
            return writes.length;
        },

        /** idle / alive / silent -- borrowed whole, because a fence and a worker reply are the same problem. */
        /**
         * v3150 -- THE TEXTURE THE RENDERER SAMPLES. Returns the READ side of the ping-pong, never the write
         * side: sampling a texture while it is bound as a draw target is UNDEFINED in GL and LOOKS ALMOST
         * RIGHT, which is the same trap v3119 gated in the update pass. Exposed as a getter rather than the
         * object because a caller holding a stale reference across a swap would sample last frame's field and
         * see a world one step behind -- a lag that reads as a physics choice.
         */
        currentTexture() { return src.tex; },

        health(now = performance.now()) { return pump.health(now); },
        stats() { return pump.stats(); },
        latest() { return latest; },

        dispose() {
            disposed = true;
            try { if (fence) gl.deleteSync(fence); } catch {}
            for (const t of [src.tex, dst.tex, redTex]) { try { gl.deleteTexture(t); } catch {} }
            for (const f of [src.fbo, dst.fbo, redFbo]) { try { gl.deleteFramebuffer(f); } catch {} }
            try { gl.deleteBuffer(pbo); } catch {}
            for (const p of [updateProg, reduceProg]) { try { gl.deleteProgram(p); } catch {} }
        },
    };
}

// v3121 -- THE DEFAULT IS NOW A REAL RULE. It was a copy-forward, which cannot be wrong because it claims
// nothing; this one moves agents along a flow field sampled AT THEIR POSITION and kills the ones that leave the
// world. sim/populationUpdate.js carries a JS reference of the same tick that a gate checks it against.
export const DEFAULT_UPDATE = updateShaderSource({});

/** The old copy-forward, kept for isolating a plumbing failure from a rule failure. */
export const COPY_FORWARD = `#version 300 es
precision highp float;
uniform sampler2D uField;
out vec4 fragColor;
void main() { fragColor = texelFetch(uField, ivec2(gl_FragCoord.xy), 0); }`;
