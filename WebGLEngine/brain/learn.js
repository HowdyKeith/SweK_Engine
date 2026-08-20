// learn.js -- online learning for the attack policy. SweK GPU Brain v4.
//
// Closes the loop the earlier honesty notes kept promising: the engine
// reports what each fired attack actually accomplished, and the policy's
// weights move toward reality. The attack policy is a single sigmoid
// layer, i.e. logistic regression -- so training is plain SGD:
//
//     p  = sigmoid(w . x)
//     w += lr * ((reward - p) * x  -  l2 * w)
//
// DELIBERATELY ON CPU: batched INFERENCE belongs on the GPU (that is
// mlp.js's job); a 13-parameter SGD step does not -- putting it on the
// GPU would be theater. If the policy ever grows real hidden layers,
// swap this file for a backprop kernel and nothing upstream changes.
//
// DATA: the brain remembers the feature row of every candidate it scored
// (not just its argmax picks), keyed "kaijuId:attackName". Whatever the
// engine actually fires -- brain pick, epsilon exploration, or the stock
// rotation fallback -- matches a remembered row, so even brainless
// fallback fire generates training data in the same feature space.
//
// REWARD (0..1): projectiles are labeled by their real impact event
// (civsHit/kaijuHit > 0 = hit, ground splash = 0). Beams are hitscan and
// AoE applies instantly in this engine, so both count as hits and are
// rewarded by damage (AoE additionally by the cluster feature captured
// at fire time). Honest consequence: the policy learns hit-probability-
// weighted damage -- expect it to discover that long-range projectiles
// whiff and beams don't. That IS the lesson.

const CLAMP = 6.0;

export class OnlineTrainer {
    constructor(opts = {}) {
        this.lr = opts.lr ?? 0.02;
        this.l2 = opts.l2 ?? 1e-4;
        this.minBuffer = opts.minBuffer ?? 24;
        this.batch = opts.batch ?? 16;
        this.bufferCap = opts.bufferCap ?? 512;
        this.rowTtlMs = opts.rowTtlMs ?? 15000;

        this.rows = new Map();     // "id:name" -> { x: number[], ts }
        this.buffer = [];          // { x, r }
        this.steps = 0;
        this.rewardSum = 0;
        this.rewardN = 0;
    }

    // Called each solve with every candidate row the brain scored.
    // v8 -- entries may carry a PROPENSITY p: the probability the system
    // would act on this row under the behavior policy (1.0 for a normal
    // policy decision, epsilon for an explore-flagged probe). Outcomes
    // matched to low-propensity rows get inverse-propensity weight so a
    // rare probe into the hold region counts for the full region it
    // represents -- the standard IPS correction for selection bias.
    rememberRows(entries) {                 // entries: [{ id, name, x, p? }]
        const now = Date.now();
        for (const e of entries) this.rows.set(e.id + ":" + e.name, { x: e.x, ts: now, p: e.p ?? 1.0 });
        if (this.rows.size > 4096) {
            for (const [k, v] of this.rows) if (now - v.ts > this.rowTtlMs) this.rows.delete(k);
        }
    }

    // Engine-reported outcomes: [{ id, name, hit, civsHit, kaijuHit }]
    ingest(outcomes, attackDamageOf) {
        if (!Array.isArray(outcomes)) return 0;
        const now = Date.now();
        let added = 0;
        for (const o of outcomes) {
            const row = this.rows.get(o.id + ":" + o.name);
            if (!row || now - row.ts > this.rowTtlMs) continue;
            const dmg = Math.min(1, (attackDamageOf(o.name) ?? 0.3) / 0.6);
            let r = 0;
            if (o.hit) {
                const extra = Math.max(0, (o.civsHit ?? 0) + (o.kaijuHit ?? 0) - 1);
                r = Math.min(1, dmg * (1 + 0.25 * extra));
            }
            // v8 -- clipped inverse-propensity weight. The clip (default 12)
            // trades a little bias for bounded variance: an unclipped 1/0.06
            // probe would dominate a minibatch 16:1 on its own.
            // v9 -- an outcome may carry its own propensity (attack picks:
            // provenance is only known at fire time); it overrides the
            // row-time propensity when present.
            const prop = (typeof o.p === "number") ? o.p : (row.p ?? 1.0);
            const w = Math.min(this.ipsCap ?? 12, 1 / Math.max(1e-3, prop));
            this.buffer.push({ x: row.x, r, w });
            if (this.buffer.length > this.bufferCap) this.buffer.shift();
            if (this._fresh) this._fresh.push({ x: row.x, r, w });   // v7 -- share queue
            this.rewardSum += r; this.rewardN++;
            added++;
        }
        return added;
    }

    // One SGD minibatch over W (Float32Array, mutated in place).
    // Returns true if a step was taken.
    step(W) {
        if (this.buffer.length < this.minBuffer) return false;
        for (let s = 0; s < this.batch; s++) {
            const { x, r, w } = this.buffer[(Math.random() * this.buffer.length) | 0];
            let z = 0;
            for (let i = 0; i < W.length; i++) z += W[i] * x[i];
            const p = 1 / (1 + Math.exp(-z));
            const g = this.lr * (w ?? 1) * (r - p);   // v8 -- IPS-weighted gradient
            for (let i = 0; i < W.length; i++) {
                W[i] += g * x[i] - this.lr * this.l2 * W[i];
                if (W[i] > CLAMP) W[i] = CLAMP;
                if (W[i] < -CLAMP) W[i] = -CLAMP;
            }
        }
        this.steps++;
        return true;
    }

    // v7 -- experience sharing: samples added locally since the last
    // drain (peers ingest them via ingestForeign; foreign samples are
    // NOT re-queued, so nothing echoes around the mailbox forever).
    drainNew() {
        if (!this._fresh) { this._fresh = []; return []; }
        const out = this._fresh;
        this._fresh = [];
        return out;
    }

    ingestForeign(samples, featLen) {
        let n = 0;
        for (const s of samples || []) {
            if (!Array.isArray(s.x) || s.x.length !== featLen) continue;
            if (typeof s.r !== "number") continue;
            this.buffer.push({ x: s.x, r: Math.max(0, Math.min(1, s.r)), w: Math.min(12, Math.max(1, s.w ?? 1)) });
            if (this.buffer.length > this.bufferCap) this.buffer.shift();
            n++;
        }
        return n;
    }

    stats() {
        return {
            steps: this.steps,
            buffer: this.buffer.length,
            avgReward: this.rewardN ? Math.round((this.rewardSum / this.rewardN) * 1000) / 1000 : null,
        };
    }
}

// ---- weight persistence (Deno) -------------------------------------------

export async function loadWeights(path, fallbackW) {
    try {
        const j = JSON.parse(await Deno.readTextFile(path));
        if (Array.isArray(j.W) && j.W.length === fallbackW.length) {
            console.log(`[learn] loaded trained weights (${j.steps ?? "?"} steps) from ${path}`);
            return { W: Float32Array.from(j.W), steps: j.steps ?? 0 };
        }
    } catch {}
    console.log("[learn] no trained weights found -- starting from the hand-set policy");
    return { W: Float32Array.from(fallbackW), steps: 0 };
}

export async function saveWeights(path, W, steps) {
    try {
        await Deno.writeTextFile(path, JSON.stringify({
            W: Array.from(W, v => Math.round(v * 10000) / 10000),
            steps, updatedAt: new Date().toISOString(),
        }, null, 2));
    } catch (e) { console.error("[learn] save failed:", e.message); }
}


// ============================================================
// v5 -- MLPTrainer: SGD with backprop for the 2-layer attack net
// (F -> H relu -> 1 sigmoid). Still CPU, still deliberate: one sample
// through a 13x16 net is ~450 multiply-adds; the GPU's job here is the
// BATCHED inference in mlp.js, not this.
//
//   out       = sigmoid(W2 . h + b2),  h = relu(W1 . x + b1)
//   dLoss/z2  = (p - r)                       (logistic loss gradient)
//   dW2       = dz2 * h ; db2 = dz2
//   dh        = W2 * dz2, gated by relu mask
//   dW1       = dh outer x ; db1 = dh
// ============================================================

export class MLPTrainer extends OnlineTrainer {
    constructor(layers, opts = {}) {
        super(opts);
        this.L1 = layers[0];           // { nIn, nOut, W, b }
        this.L2 = layers[1];
        this._h = new Float32Array(this.L1.nOut);
        this._mask = new Uint8Array(this.L1.nOut);
    }

    // One minibatch of backprop over the live layer arrays (mutated in
    // place; caller hot-swaps them to the GPU afterwards).
    step() {
        if (this.buffer.length < this.minBuffer) return false;
        const { L1, L2 } = this;
        const F = L1.nIn, H = L1.nOut;
        const lr = this.lr, l2 = this.l2;
        for (let s = 0; s < this.batch; s++) {
            const { x, r, w } = this.buffer[(Math.random() * this.buffer.length) | 0];
            const ipsW = w ?? 1;                       // v8 -- IPS weight
            // forward
            for (let o = 0; o < H; o++) {
                let z = L1.b[o];
                const off = o * F;
                for (let i = 0; i < F; i++) z += L1.W[off + i] * x[i];
                this._mask[o] = z > 0 ? 1 : 0;
                this._h[o] = z > 0 ? z : 0;
            }
            let z2 = L2.b[0];
            for (let o = 0; o < H; o++) z2 += L2.W[o] * this._h[o];
            const p = 1 / (1 + Math.exp(-z2));
            // backward
            const dz2 = ipsW * (p - r);                // v8 -- IPS-weighted
            for (let o = 0; o < H; o++) {
                const dh = this._mask[o] ? L2.W[o] * dz2 : 0;
                L2.W[o] -= lr * (dz2 * this._h[o] + l2 * L2.W[o]);
                if (L2.W[o] > CLAMP) L2.W[o] = CLAMP;
                if (L2.W[o] < -CLAMP) L2.W[o] = -CLAMP;
                if (dh !== 0) {
                    const off = o * F;
                    for (let i = 0; i < F; i++) {
                        L1.W[off + i] -= lr * (dh * x[i] + l2 * L1.W[off + i]);
                        if (L1.W[off + i] > CLAMP) L1.W[off + i] = CLAMP;
                        if (L1.W[off + i] < -CLAMP) L1.W[off + i] = -CLAMP;
                    }
                    L1.b[o] -= lr * dh;
                }
            }
            L2.b[0] -= lr * dz2;
        }
        this.steps++;
        return true;
    }
}

// v5 persistence: multi-layer format with v4 back-compat -- an old
// single-layer weights file distills into the deep net's h0/h1 pathway,
// so previously-learned linear knowledge carries forward.
export async function loadDeepWeights(path, buildDeep) {
    try {
        const j = JSON.parse(await Deno.readTextFile(path));
        if (Array.isArray(j.layers)) {
            const layers = buildDeep(null);
            // v8 -- feature-set migration: an old file whose L1 rows are 2
            // columns short of the current layout gets each hidden row
            // remapped [w0..w11, bias] -> [w0..w11, 0, 0, bias] (the bias
            // column moved to the end; the new threat features start at
            // zero, so the migrated net is BIT-EQUIVALENT to the old one
            // until training moves the new columns).
            {
                const nInNew = layers[0].nIn, H = layers[0].nOut;
                const oldRow = j.layers[0].W.length / H;
                // v15 -- generalized: ANY shorter row (13->16, 15->16, ...)
                if (oldRow >= 13 && oldRow < nInNew && j.layers[0].W.length % H === 0) {
                    const Wnew = new Array(H * nInNew).fill(0);
                    for (let o = 0; o < H; o++) {
                        for (let i = 0; i < oldRow - 1; i++) Wnew[o * nInNew + i] = j.layers[0].W[o * oldRow + i];
                        Wnew[o * nInNew + (nInNew - 1)] = j.layers[0].W[o * oldRow + (oldRow - 1)];  // bias column
                    }
                    j.layers[0].W = Wnew;
                    console.log(`[learn] migrated attack weights ${oldRow} -> ${nInNew} features (bias relocated, threat columns zeroed)`);
                }
            }
            if (j.layers.length === layers.length &&
                j.layers.every((l, i) => l.W.length === layers[i].W.length)) {
                j.layers.forEach((l, i) => {
                    layers[i].W = Float32Array.from(l.W);
                    layers[i].b = Float32Array.from(l.b);
                });
                console.log(`[learn] loaded deep weights (${j.steps ?? "?"} steps) from ${path}`);
                return { layers, steps: j.steps ?? 0 };
            }
        }
        if (Array.isArray(j.W)) {      // v4 single-layer file -> distill
            console.log(`[learn] distilling v4 linear weights (${j.steps ?? "?"} steps) into the deep net`);
            return { layers: buildDeep(Float32Array.from(j.W)), steps: j.steps ?? 0 };
        }
    } catch {}
    console.log("[learn] no trained weights found -- deep net distilled from the hand policy");
    return { layers: buildDeep(null), steps: 0 };
}

export async function saveDeepWeights(path, layers, steps) {
    try {
        await Deno.writeTextFile(path, JSON.stringify({
            layers: layers.map(l => ({
                W: Array.from(l.W, v => Math.round(v * 10000) / 10000),
                b: Array.from(l.b, v => Math.round(v * 10000) / 10000),
            })),
            steps, updatedAt: new Date().toISOString(),
        }));
    } catch (e) { console.error("[learn] deep save failed:", e.message); }
}


// ============================================================
// v6 -- replay buffer persistence. Brave windows and civ-bolt outcomes
// are RARE events (tens per evening, not thousands); losing the buffer
// on every brain restart threw away exactly the data that is hardest to
// collect. Buffers are tiny (<= 512 samples x <= 16 floats), so this is
// one small JSON per trainer.
// ============================================================

export function serializeReplay(trainer) {
    return {
        buffer: trainer.buffer.map(s => ({ x: Array.from(s.x, v => Math.round(v * 10000) / 10000), r: s.r, w: s.w ?? 1 })),
        steps: trainer.steps,
        rewardSum: Math.round(trainer.rewardSum * 1000) / 1000,
        rewardN: trainer.rewardN,
    };
}

export function restoreReplay(trainer, j, featLen) {
    if (!j || !Array.isArray(j.buffer)) return 0;
    let n = 0;
    for (const s of j.buffer) {
        if (!Array.isArray(s.x) || s.x.length !== featLen) continue;
        trainer.buffer.push({ x: s.x, r: s.r, w: Math.min(12, Math.max(1, s.w ?? 1)) });   // v8 back-compat: old replays load at weight 1
        if (trainer.buffer.length > trainer.bufferCap) trainer.buffer.shift();
        n++;
    }
    trainer.rewardSum += j.rewardSum ?? 0;
    trainer.rewardN += j.rewardN ?? 0;
    return n;
}

export async function saveReplays(path, trainers) {   // trainers: {name: {trainer, featLen}}
    try {
        const out = {};
        for (const [name, v] of Object.entries(trainers)) out[name] = serializeReplay(v.trainer);
        await Deno.writeTextFile(path, JSON.stringify(out));
    } catch (e) { console.error("[learn] replay save failed:", e.message); }
}

export async function loadReplays(path, trainers) {
    try {
        const j = JSON.parse(await Deno.readTextFile(path));
        const counts = [];
        for (const [name, v] of Object.entries(trainers)) {
            counts.push(name + "=" + restoreReplay(v.trainer, j[name], v.featLen));
        }
        console.log("[learn] replay restored:", counts.join(" "));
    } catch { console.log("[learn] no replay file -- starting with empty buffers"); }
}
