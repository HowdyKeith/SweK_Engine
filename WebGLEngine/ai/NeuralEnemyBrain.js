// ai/NeuralEnemyBrain.js
//
// Port of VBA NeuralEnemyBrain.cls (BIOLOGICAL v2.61 / 2026-04-15).
//
// Feed-forward neural network: 8 inputs → 12 hidden → 3 outputs.
// Each enemy in the population owns one of these — its "genome".
// Outputs are (steerX, steerZ, speedMod) which the EnemyInstance
// applies to its velocity each frame.
//
// Key divergence from VBA original:
//
//   * Activation: VBA used Math.Sgn() (bipolar -1/0/+1) for speed in
//     VBA's interpreter. JS can afford Math.tanh() which gives
//     smoother gradients and lets random weights produce nuanced
//     behavior instead of essentially binary outputs. Set
//     USE_SIGN_ACTIVATION=true below to faithfully match VBA.
//
//   * Inputs: VBA had 4 of 8 inputs hardcoded as 0.5/0.6 placeholders.
//     The JS-side EnemyInstance fills all 8 with real signals
//     (distance to player, neighbor density, health, velocity, etc).
//     This is the "JS port actually wires up what the VBA designer
//     intended but didn't finish."
//
// The network is small (8×12 + 12×3 = 132 weights). Each enemy in a
// population of ~12 carries ~150 floats of brain state. Cheap.

const INPUT_COUNT  = 8;
const HIDDEN_COUNT = 12;
const OUTPUT_COUNT = 3;

const USE_SIGN_ACTIVATION = false;   // true = exact VBA parity

// Tanh kept inline as a small monotonic helper. Math.tanh is fine
// performance-wise on modern engines; using the builtin.
function activate(x) {
    return USE_SIGN_ACTIVATION ? Math.sign(x) : Math.tanh(x);
}

export class NeuralEnemyBrain {
    constructor() {
        // Flat-array weight storage so JIT keeps it in float-typed
        // memory. Indexed as (i * outDim + j) for input-hidden and
        // hidden-output matrices.
        this.w_ih = new Float32Array(INPUT_COUNT * HIDDEN_COUNT);
        this.w_ho = new Float32Array(HIDDEN_COUNT * OUTPUT_COUNT);
        this.b_h  = new Float32Array(HIDDEN_COUNT);
        this.b_o  = new Float32Array(OUTPUT_COUNT);
        this._hidden = new Float32Array(HIDDEN_COUNT);   // reused scratch buffer
        this._out    = new Float32Array(OUTPUT_COUNT);
        this.generation = 0;       // populated by EvolutionManager on reproduction
        this.parentId   = null;
        this.mutationCount = 0;
        this.randomize();
    }

    // Uniform [-1, +1] weights, smaller biases — same scheme as VBA.
    randomize() {
        for (let i = 0; i < this.w_ih.length; i++) this.w_ih[i] = (Math.random() - 0.5) * 2;
        for (let i = 0; i < this.w_ho.length; i++) this.w_ho[i] = (Math.random() - 0.5) * 2;
        for (let i = 0; i < this.b_h.length;  i++) this.b_h[i]  = (Math.random() - 0.5) * 0.5;
        for (let i = 0; i < this.b_o.length;  i++) this.b_o[i]  = (Math.random() - 0.5) * 0.5;
    }

    // Forward pass. inputs is a length-8 Float32Array or plain array.
    // Returns the internal _out buffer (length 3); caller should copy
    // values out if they need to persist past the next think() call.
    think(inputs) {
        const hidden = this._hidden;
        const out    = this._out;

        // Hidden layer: hidden[j] = b_h[j] + sum_i inputs[i] * w_ih[i*H+j]
        for (let j = 0; j < HIDDEN_COUNT; j++) {
            let s = this.b_h[j];
            for (let i = 0; i < INPUT_COUNT; i++) {
                s += inputs[i] * this.w_ih[i * HIDDEN_COUNT + j];
            }
            hidden[j] = activate(s);
        }
        // Output: linear (no activation), so steerX/steerZ can be
        // large enough to push velocity. EnemyInstance caps the
        // resulting velocity, so unbounded outputs are fine.
        for (let j = 0; j < OUTPUT_COUNT; j++) {
            let s = this.b_o[j];
            for (let i = 0; i < HIDDEN_COUNT; i++) {
                s += hidden[i] * this.w_ho[i * OUTPUT_COUNT + j];
            }
            out[j] = s;
        }
        return out;
    }

    // VBA Mutate scheme: rate% chance to enter mutation loop, 30%
    // chance per weight to nudge by (Rnd - 0.5) * 0.8. JS port uses
    // the same constants so the evolution dynamics match.
    mutate(mutationRate = 0.25) {
        if (Math.random() >= mutationRate) return;
        let nudges = 0;
        for (let i = 0; i < this.w_ih.length; i++) {
            if (Math.random() < 0.3) {
                this.w_ih[i] += (Math.random() - 0.5) * 0.8;
                nudges++;
            }
        }
        // Also occasionally mutate hidden→output and biases. VBA only
        // mutated input→hidden; allowing output weights to drift gives
        // selection more leverage. Cheap extension.
        for (let i = 0; i < this.w_ho.length; i++) {
            if (Math.random() < 0.15) {
                this.w_ho[i] += (Math.random() - 0.5) * 0.6;
                nudges++;
            }
        }
        for (let i = 0; i < this.b_h.length; i++) {
            if (Math.random() < 0.10) {
                this.b_h[i] += (Math.random() - 0.5) * 0.4;
                nudges++;
            }
        }
        this.mutationCount += nudges;
    }

    // Deep copy used for "child inherits parent's genome".
    clone() {
        const child = new NeuralEnemyBrain();
        child.w_ih.set(this.w_ih);
        child.w_ho.set(this.w_ho);
        child.b_h.set(this.b_h);
        child.b_o.set(this.b_o);
        child.generation = this.generation;
        child.parentId   = this.parentId;
        child.mutationCount = 0;
        return child;
    }

    // Serialize the genome to a string. Useful for saving the best
    // brain across sessions — the user can paste this back into
    // NeuralEnemyBrain.fromString() to reload.
    toString() {
        return JSON.stringify({
            v: 1,
            gen: this.generation,
            w_ih: Array.from(this.w_ih),
            w_ho: Array.from(this.w_ho),
            b_h:  Array.from(this.b_h),
            b_o:  Array.from(this.b_o),
        });
    }

    static fromString(s) {
        const data = JSON.parse(s);
        const b = new NeuralEnemyBrain();
        b.w_ih.set(data.w_ih);
        b.w_ho.set(data.w_ho);
        b.b_h.set(data.b_h);
        b.b_o.set(data.b_o);
        b.generation = data.gen | 0;
        return b;
    }
}

export const BRAIN_INPUT_COUNT  = INPUT_COUNT;
export const BRAIN_HIDDEN_COUNT = HIDDEN_COUNT;
export const BRAIN_OUTPUT_COUNT = OUTPUT_COUNT;
