// FILE: engine/NeuralRadianceCache.js
// VERSION: v1 — round 343
//
// A tiny Multi-Layer Perceptron (3 → 8 → 8 → 3) that runs entirely
// inside a WebGL2 fragment shader. The weights live in a 1D R32F data
// texture; the shader walks the texture with texelFetch and does the
// matrix multiplies (W·x + b) and ReLU activations directly on the GPU.
//
// Two halves:
//   1. JS side  — randomize, train (pure-JS SGD), upload to GPU
//   2. Shader   — getShaderGLSL() returns a GLSL function string the
//                 caller pastes into their own fragment shader
//
// Why no TensorFlow.js: this MLP has 131 weights total. Pulling in TF.js
// (~2MB) to train 131 floats is silly. The whole training loop in pure
// JS fits in ~50 lines and is faster for a network this small.
//
// Layer dims are configurable (e.g. (3, 16, 16, 3) for higher capacity)
// but stay parsimonious — the shader unrolls the inner loops, and large
// dims compile slowly.

const SH_DEFAULT_DIMS = [3, 8, 8, 3];

export class NeuralRadianceCache {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.dims = opts.dims || SH_DEFAULT_DIMS;
        this.activations = opts.activations || ["relu", "relu", "sigmoid"];
        this._buildWeights();
        this._initTexture();
        this.upload();
    }

    /** Total scalar count = Σ(w[i] * w[i+1] + w[i+1]) over layers */
    get weightCount() {
        let n = 0;
        for (let i = 0; i + 1 < this.dims.length; i++) {
            n += this.dims[i] * this.dims[i + 1] + this.dims[i + 1];
        }
        return n;
    }

    _buildWeights() {
        // Layers[i] = { W: Float32Array(out*in), b: Float32Array(out) }
        this.layers = [];
        for (let i = 0; i + 1 < this.dims.length; i++) {
            const inD = this.dims[i], outD = this.dims[i + 1];
            this.layers.push({
                W: new Float32Array(outD * inD),
                b: new Float32Array(outD),
                in: inD, out: outD,
            });
        }
        this.randomize();
    }

    /** Xavier-style init: W ~ N(0, sqrt(2 / fan_in)) */
    randomize(seed = null) {
        let s = seed ?? (Math.random() * 0x7fffffff) >>> 0;
        const rand = () => {
            // xorshift32 — deterministic when seeded
            s ^= s << 13; s >>>= 0;
            s ^= s >>> 17; s >>>= 0;
            s ^= s << 5;  s >>>= 0;
            return s / 0xffffffff;
        };
        const randn = () => {
            // Box-Muller. Two uniforms → one standard normal.
            const u1 = Math.max(1e-9, rand());
            const u2 = rand();
            return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        };
        for (const l of this.layers) {
            const scale = Math.sqrt(2.0 / l.in);
            for (let i = 0; i < l.W.length; i++) l.W[i] = randn() * scale;
            for (let i = 0; i < l.b.length; i++) l.b[i] = 0.0;
        }
    }

    /** CPU forward pass — handy for tests and small-scale verification. */
    evaluate(input) {
        if (input.length !== this.dims[0]) {
            throw new Error(`NRC.evaluate: input dim ${input.length} != ${this.dims[0]}`);
        }
        let x = new Float32Array(input);
        for (let li = 0; li < this.layers.length; li++) {
            const l = this.layers[li];
            const out = new Float32Array(l.out);
            for (let i = 0; i < l.out; i++) {
                let sum = l.b[i];
                for (let j = 0; j < l.in; j++) {
                    sum += l.W[i * l.in + j] * x[j];
                }
                out[i] = sum;
            }
            // Activation
            const act = this.activations[li];
            if (act === "relu") {
                for (let i = 0; i < out.length; i++) out[i] = Math.max(0, out[i]);
            } else if (act === "sigmoid") {
                for (let i = 0; i < out.length; i++) out[i] = 1 / (1 + Math.exp(-out[i]));
            } else if (act === "linear") {
                /* no-op */
            }
            x = out;
        }
        return x;
    }

    /**
     * Train the network with simple SGD on (x, y) pairs.
     * Loss: MSE. Backprop is hand-rolled for the layer chain.
     *
     * @param {Array<{x: number[], y: number[]}>} samples
     * @param {object} opts { epochs=100, lr=0.05, batch=null, log=true }
     * @returns {{ finalLoss: number, history: number[] }}
     */
    train(samples, opts = {}) {
        const epochs = opts.epochs ?? 100;
        const lr     = opts.lr     ?? 0.05;
        const history = [];
        for (let e = 0; e < epochs; e++) {
            let lossSum = 0;
            for (const s of samples) {
                // Forward, retaining activations
                const acts = [new Float32Array(s.x)];
                const preActs = [null];
                for (let li = 0; li < this.layers.length; li++) {
                    const l = this.layers[li];
                    const z = new Float32Array(l.out);
                    for (let i = 0; i < l.out; i++) {
                        let sum = l.b[i];
                        for (let j = 0; j < l.in; j++) {
                            sum += l.W[i * l.in + j] * acts[li][j];
                        }
                        z[i] = sum;
                    }
                    preActs.push(z);
                    const a = new Float32Array(l.out);
                    const act = this.activations[li];
                    if (act === "relu") {
                        for (let i = 0; i < l.out; i++) a[i] = Math.max(0, z[i]);
                    } else if (act === "sigmoid") {
                        for (let i = 0; i < l.out; i++) a[i] = 1 / (1 + Math.exp(-z[i]));
                    } else {
                        a.set(z);
                    }
                    acts.push(a);
                }
                // Loss: ½‖y - ŷ‖²
                const yhat = acts[acts.length - 1];
                const dy = new Float32Array(yhat.length);
                for (let i = 0; i < yhat.length; i++) {
                    const err = yhat[i] - s.y[i];
                    dy[i] = err;
                    lossSum += 0.5 * err * err;
                }
                // Backward
                let delta = dy;
                for (let li = this.layers.length - 1; li >= 0; li--) {
                    const l = this.layers[li];
                    const z = preActs[li + 1];
                    const aIn = acts[li];
                    // δ ← δ ⊙ act'(z)
                    const dAct = new Float32Array(l.out);
                    const act = this.activations[li];
                    if (act === "relu") {
                        for (let i = 0; i < l.out; i++) dAct[i] = delta[i] * (z[i] > 0 ? 1 : 0);
                    } else if (act === "sigmoid") {
                        for (let i = 0; i < l.out; i++) {
                            const sg = 1 / (1 + Math.exp(-z[i]));
                            dAct[i] = delta[i] * sg * (1 - sg);
                        }
                    } else {
                        dAct.set(delta);
                    }
                    // grad W = dAct · aInᵀ ; grad b = dAct
                    for (let i = 0; i < l.out; i++) {
                        l.b[i] -= lr * dAct[i];
                        for (let j = 0; j < l.in; j++) {
                            l.W[i * l.in + j] -= lr * dAct[i] * aIn[j];
                        }
                    }
                    // δ_prev = Wᵀ · dAct (for next layer back)
                    if (li > 0) {
                        const dPrev = new Float32Array(l.in);
                        for (let j = 0; j < l.in; j++) {
                            let s = 0;
                            for (let i = 0; i < l.out; i++) s += l.W[i * l.in + j] * dAct[i];
                            dPrev[j] = s;
                        }
                        delta = dPrev;
                    }
                }
            }
            const avg = lossSum / samples.length;
            history.push(avg);
            if (opts.log && (e === 0 || e === epochs - 1 || e % Math.max(1, Math.floor(epochs / 10)) === 0)) {
                console.log(`[NRC] epoch ${e + 1}/${epochs} loss=${avg.toFixed(6)}`);
            }
        }
        this.upload();
        return { finalLoss: history[history.length - 1], history };
    }

    /**
     * Returns the GLSL source for an inference function that the caller
     * can paste into their fragment shader. The function evaluates the
     * MLP at a given input vector and writes the output vector. Layer
     * loops are unrolled at the dim sizes baked at construction time.
     */
    getShaderGLSL(funcName = "nrcEvaluate", samplerName = "u_nrcWeights") {
        const lines = [];
        lines.push(`// Auto-generated by NeuralRadianceCache.getShaderGLSL — dims [${this.dims.join(", ")}]`);
        lines.push(`uniform highp sampler2D ${samplerName};`);
        lines.push(`float ${funcName}_w(int idx) { return texelFetch(${samplerName}, ivec2(idx, 0), 0).r; }`);
        const inDim = this.dims[0], outDim = this.dims[this.dims.length - 1];
        lines.push(``);
        lines.push(`void ${funcName}(in float input_v[${inDim}], out float output_v[${outDim}]) {`);
        // Intermediate arrays for each hidden layer
        for (let li = 1; li < this.dims.length; li++) {
            lines.push(`    float a${li}[${this.dims[li]}];`);
        }
        lines.push(`    int ptr = 0;`);

        for (let li = 0; li < this.layers.length; li++) {
            const l = this.layers[li];
            const prevName = li === 0 ? "input_v" : `a${li}`;
            const outName  = li === this.layers.length - 1 && false ? "output_v" : `a${li + 1}`;
            // Note: last layer writes to a${N} then we copy to output_v
            lines.push(``);
            lines.push(`    // Layer ${li + 1}: (${l.in}) -> (${l.out}) + ${this.activations[li]}`);
            for (let i = 0; i < l.out; i++) {
                let expr = `${funcName}_w(ptr + ${i * l.in + 0}) * ${prevName}[0]`;
                for (let j = 1; j < l.in; j++) {
                    expr += ` + ${funcName}_w(ptr + ${i * l.in + j}) * ${prevName}[${j}]`;
                }
                lines.push(`    ${outName}[${i}] = ${expr};`);
            }
            lines.push(`    ptr += ${l.W.length};`);
            // Add bias + activation
            const act = this.activations[li];
            for (let i = 0; i < l.out; i++) {
                if (act === "relu") {
                    lines.push(`    ${outName}[${i}] = max(0.0, ${outName}[${i}] + ${funcName}_w(ptr + ${i}));`);
                } else if (act === "sigmoid") {
                    lines.push(`    ${outName}[${i}] = 1.0 / (1.0 + exp(-(${outName}[${i}] + ${funcName}_w(ptr + ${i}))));`);
                } else {
                    lines.push(`    ${outName}[${i}] = ${outName}[${i}] + ${funcName}_w(ptr + ${i});`);
                }
            }
            lines.push(`    ptr += ${l.b.length};`);
        }
        // Copy final layer activations to output_v
        const finalLayerIdx = this.layers.length;
        for (let i = 0; i < outDim; i++) {
            lines.push(`    output_v[${i}] = a${finalLayerIdx}[${i}];`);
        }
        lines.push(`}`);
        return lines.join("\n");
    }

    _initTexture() {
        const gl = this.gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        // Allocate at the right size; populated by upload()
        const w = this.weightCount;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, 1, 0, gl.RED, gl.FLOAT, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /** Flatten all weights into a single Float32Array and upload to the R32F texture. */
    upload() {
        const gl = this.gl;
        const flat = new Float32Array(this.weightCount);
        let off = 0;
        for (const l of this.layers) {
            flat.set(l.W, off); off += l.W.length;
            flat.set(l.b, off); off += l.b.length;
        }
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.weightCount, 1, gl.RED, gl.FLOAT, flat);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this._lastFlat = flat;   // expose for tests / hot-update
    }

    /** Bind the weight texture to a given unit so shaders that sample u_nrcWeights see it. */
    bind(textureUnit = 0) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }

    dispose() {
        if (this.texture) this.gl.deleteTexture(this.texture);
        this.texture = null;
    }
}
