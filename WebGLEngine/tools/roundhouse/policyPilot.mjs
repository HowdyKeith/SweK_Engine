// tools/roundhouse/policyPilot.mjs
//
// v2890 -- THE FIRST ROUNDHOUSE PROPOSER WITH NO WORDS. The probe device's "pilot" mode grades a CONTROL VALUE:
// the hypothesis carries an angular momentum L, the sim releases the probe at the target radius with that L, and
// the measured eccentricity is the error (side = +1/-1 says which way the guess missed; a plunge is the loud
// version of -1). That is everything a policy needs and nothing a policy could talk its way around -- so this
// module puts POLICIES in the proposer seat that language models normally occupy.
//
// The seat's contract stays exactly what discovery-lab.html promised: "a model in the roundhouse, a script, or
// you -- the adjudicator does not care which." The adjudication NEVER moves: the brain proposes, the physics
// grades, and no policy sits on the verifier side of the loop (escalateRoute.mjs already wrote down why -- the
// adult in the room is not a bigger model, and it is not a trained one either).
//
// Three policies, one interface { act(obs) -> {L}, learn?(feedback), name }:
//
//   reflexPilotPolicy  -- no weights at all: bisection on the measured side, then secant on side*ecc. The spinal
//                         cord. It exists as the floor every learned policy must beat and as the fallback the
//                         bridge degrades to.
//   brainPilotPolicy   -- REAL WEIGHTS IN THE BRAIN'S OWN FORMAT: the layer spec of brain/mlp.js
//                         ({nIn,nOut,W,b,act}), evaluated with a CPU forward pass that mirrors the WGSL kernel
//                         (y = act(W*x + b), row-major), trained ONLINE by a seeded (1+1)-ES on the measured
//                         eccentricity. No gradients, no reflex hidden inside -- the only teacher is the sim's
//                         number, which is the point: the roundhouse loop IS the training loop, and crystallise/
//                         refuse verdicts are the free ground-truth labels. Weights that have not learned yet
//                         are REFUSED by the physics like any other wrong proposer.
//   brainBridgePolicy  -- the seam to the LIVE GPU Brain (the Deno process behind START_BRAIN.bat): POST the
//                         observation to {host}/ai/brain/pilot, use the returned action. fetchImpl is injectable
//                         (the ollamaCaller convention), and an unreachable brain DEGRADES to an injected
//                         fallback policy with degraded:true -- the engine's brain authority model verbatim:
//                         "kill it any time; the engine falls back to exactly its old behavior."
//
// policyCaller(policy, opts) adapts any of these to the roundhouse callModel seam: the proposer role runs
// policy.act and shapes {mode:"pilot", config:{L,...}, claim:{observable:"pilotEcc", max: eps}}; the evaluator
// role feeds the MEASURED outcome to policy.learn. Feedback flows one way -- measurement to policy -- never the
// reverse.

// ---- the brain's layer-spec, evaluated on CPU (mirrors brain/mlp.js WGSL: row-per-output, fused bias+act) ------
export function cpuForward(layers, x) {
    let v = Float32Array.from(x);
    for (const l of layers) {
        const y = new Float32Array(l.nOut);
        for (let o = 0; o < l.nOut; o++) {
            let s = l.b[o];
            const row = o * l.nIn;
            for (let i = 0; i < l.nIn; i++) s += l.W[row + i] * v[i];
            y[o] = l.act === "relu" ? Math.max(0, s) : l.act === "sigmoid" ? 1 / (1 + Math.exp(-s)) : s;
        }
        v = y;
    }
    return v;
}

// seeded RNG (mulberry32) -- a policy whose training run cannot be replayed is a rumour, not an experiment
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const gauss = (rnd) => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// ---- 1. the spinal cord ----------------------------------------------------------------------------------------
export function reflexPilotPolicy() {
    let lo = null, hi = null, last = null, prev = null;
    return {
        name: "reflex-bisect-secant",
        act({ rTarget }) {
            const rT = rTarget;
            if (lo === null) { lo = 0.55 * Math.sqrt(rT); hi = 2.6 * Math.sqrt(rT); }   // brackets circularL for any stable rT
            let L;
            if (prev && last && Math.abs(hi - lo) < 0.05 * Math.sqrt(rT) && last.signedEcc !== prev.signedEcc) {
                // secant on side*ecc once the bracket is tight -- superlinear finish
                L = last.L - last.signedEcc * (last.L - prev.L) / (last.signedEcc - prev.signedEcc);
                if (!(L > lo && L < hi)) L = 0.5 * (lo + hi);
            } else {
                L = 0.5 * (lo + hi);
            }
            return { L };
        },
        learn({ L, ecc, side, plunged }) {
            const s = plunged ? -1 : side;
            if (s < 0) lo = Math.max(lo ?? L, L); else if (s > 0) hi = Math.min(hi ?? L, L);
            prev = last;
            last = { L, signedEcc: (s || 1) * Math.max(ecc, 1e-15) };
        },
    };
}

// ---- 2. real weights, brain format, trained by the sim's number ------------------------------------------------
export function brainPilotPolicy({ seed = 1337, hidden = 8, sigma0 = 0.4 } = {}) {
    const rnd = mulberry32(seed);
    const mkLayer = (nIn, nOut, act) => ({
        nIn, nOut, act,
        W: Float32Array.from({ length: nOut * nIn }, () => gauss(rnd) * 0.5),
        b: new Float32Array(nOut),
    });
    // obs = [1, rT/20, sqrt(rT)/5]; output squashed into a physical L window scaled by sqrt(rT)
    const freshLayers = () => [mkLayer(3, hidden, "relu"), mkLayer(hidden, 1, "none")];
    let best = freshLayers();   // LINEAR head: a saturated sigmoid pins L to a window rail and deafens the ES to weight perturbations (observed at seed 42: stuck at ecc 0.995)
    let bestEcc = Infinity;
    let candidate = best, sigma = sigma0, lastWasCandidate = false, sinceImprove = 0;
    const clone = (ls) => ls.map((l) => ({ ...l, W: Float32Array.from(l.W), b: Float32Array.from(l.b) }));
    const perturb = (ls) => {
        const c = clone(ls);
        for (const l of c) {
            for (let i = 0; i < l.W.length; i++) l.W[i] += gauss(rnd) * sigma;
            for (let i = 0; i < l.b.length; i++) l.b[i] += gauss(rnd) * sigma;
        }
        return c;
    };
    const emitL = (ls, rT) => {
        const y = cpuForward(ls, [1, rT / 20, Math.sqrt(rT) / 5])[0];   // linear head, sensitivity everywhere
        const raw = (1.575 + 0.5 * y) * Math.sqrt(rT);                   // centred in the same window the reflex brackets
        return Math.min(2.6 * Math.sqrt(rT), Math.max(0.55 * Math.sqrt(rT), raw));
    };
    return {
        name: "brain-mlp-1+1es(seed " + seed + ")",
        layers: () => best,          // brain/mlp.js-ready: BatchedMLP(device, layers()) runs these same weights on GPU
        bestEcc: () => bestEcc,   // NOTE: shaded fitness (plunges score in (1,2]), not raw ecc, until the first bound orbit
        act({ rTarget }) {
            candidate = perturb(best);
            lastWasCandidate = true;
            return { L: emitL(candidate, rTarget) };
        },
        learn({ ecc, plunged, turns = 0 }) {
            if (!lastWasCandidate) return;
            lastWasCandidate = false;
            // FITNESS SHADING WITHOUT THE ANSWER KEY. All plunges scoring identically 1 is a flat plateau -- a
            // policy born in the plunge basin gets no gradient and (1+1)-ES freezes (observed: 60/60 plunges,
            // sigma collapsed). The sim already measures a plunge's SEVERITY: how many turns the probe survived.
            // fitness = 2 - survivedFrac for plunges (2 = instant, ->1 = barely), ecc (<1) for bound orbits --
            // so any bound orbit beats any plunge, and WITHIN the plunge basin longer survival climbs toward the
            // boundary. Pure measurement; the exact L is never consulted.
            const fitness = plunged ? 2 - Math.min(1, (turns || 0) / 6) : ecc;
            if (fitness < bestEcc) { best = candidate; bestEcc = fitness; sigma = Math.min(0.8, sigma * 1.3); sinceImprove = 0; }
            else {
                sigma = Math.max(0.02, sigma * 0.85);
                // STAGNATION RESTART. A single (1+1) chain can wedge in the near-plunge bound basin where the
                // ecc gradient is razor-thin (observed: seeds stuck at ecc ~0.996 for 60+ trials). After 12
                // unimproved trials, resample fresh random weights as the new search base -- the global best is
                // kept, so a restart can only help. Restarts are seeded like everything else: replayable luck.
                if (++sinceImprove >= 12) { candidate = freshLayers(); best = bestEcc < 1 ? best : candidate; sigma = sigma0; sinceImprove = 0;
                    if (bestEcc >= 1) bestEcc = Infinity;   // still in plunge/near-plunge land: let the fresh base compete from scratch
                }
            }
        },
    };
}

// ---- 3. the live GPU Brain over the bridge ---------------------------------------------------------------------
export function brainBridgePolicy({ host = "http://127.0.0.1:8787", fetchImpl = null, fallback = null, timeoutMs = 1500 } = {}) {
    const doFetch = fetchImpl || fetch;
    const backup = fallback || reflexPilotPolicy();
    let degraded = false;
    return {
        name: "gpu-brain-bridge(" + host + ")",
        isDegraded: () => degraded,
        async act(obs) {
            if (degraded) return backup.act(obs);
            try {
                const ctl = new AbortController();
                const t = setTimeout(() => ctl.abort(), timeoutMs);
                const res = await doFetch(host + "/ai/brain/pilot", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ obs }), signal: ctl.signal,
                });
                clearTimeout(t);
                if (!res.ok) throw new Error("brain http " + res.status);
                const data = await res.json();
                if (!data || typeof data.L !== "number" || !Number.isFinite(data.L)) throw new Error("brain returned no L");
                return { L: data.L };
            } catch (err) {
                degraded = true;   // the authority model: kill the brain any time; fall back to the old behaviour
                console.warn("[brainBridge] unreachable -- degrading to " + backup.name + ". (" + (err.message || err) + ")");
                return backup.act(obs);
            }
        },
        async learn(feedback) {
            if (degraded) { backup.learn && backup.learn(feedback); return; }
            try { await doFetch(host + "/ai/brain/pilot/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(feedback) }); }
            catch { /* feedback is best-effort; the next act() will discover a dead brain */ }
        },
    };
}

// ---- the adapter: any policy into the roundhouse proposer seat -------------------------------------------------
export function policyCaller(policy, { rTarget = 10, eps = 1e-3, turns = 6, onTrial = null } = {}) {
    const trials = [];
    return async (role, payload) => {
        if (role === "proposer") {
            const action = await policy.act({ rTarget, trials });
            return {
                mode: "pilot",
                config: { L: action.L, rTarget, turns },
                claim: { observable: "pilotEcc", max: eps },
            };
        }
        // evaluator: the ONLY information flowing back to the policy is what the sim measured
        const o = (payload && payload.observable) || {};
        const fb = { L: o.pilotL, ecc: o.pilotEcc, side: o.pilotSide, plunged: o.pilotPlunged, turns: o.pilotTurns, reward: -(o.pilotEcc ?? 1) };
        trials.push(fb);
        if (policy.learn) await policy.learn(fb);
        if (onTrial) { try { onTrial(fb); } catch { /* observers must not break the loop */ } }
        return { reading: "policy '" + policy.name + "' told: ecc " + (o.pilotEcc != null ? o.pilotEcc.toExponential(2) : "?") + ", side " + o.pilotSide };
    };
}
