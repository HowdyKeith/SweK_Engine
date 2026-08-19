// brain/policyCache.mjs -- caches POLICY and TACTICS "chunks" the same way flowfieldCache caches fields. Continuous
// state is quantized into buckets so near-identical situations hit the same cached action; the first time a bucket is
// seen the policy/tactics fn runs and the result is cached ("play this chunk if you can"), and after that it is
// instant. Pure ESM (no node builtins) so it is bun-compile-clean in the pilot tree; pass opts.store for persistence.
import { BrainCache, key } from "./brainCache.mjs";

function stateKey(state, q) { const b = (v) => Math.round((+v || 0) / q); const arr = Array.isArray(state) ? state : Object.keys(state).sort().map(k => state[k]); return arr.map(b).join(","); }
function makeCachedPolicy(policyFn, opts = {}) {
    const cache = opts.cache || new BrainCache({ max: opts.max || 512, store: opts.store || null });
    const q = opts.quant || 0.1, tag = opts.tag || "policy";
    return { decide(state) { const k = key(tag, stateKey(state, q)); return cache.playIfYouCan(k, () => policyFn(state)).data; }, cache, stats() { return cache.stats(); } };
}
export { makeCachedPolicy, stateKey };
