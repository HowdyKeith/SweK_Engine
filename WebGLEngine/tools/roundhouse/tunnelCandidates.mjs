// tools/roundhouse/tunnelCandidates.mjs
//
// v2956 -- A LIST OF WAYS IN, NOT ONE ADDRESS.
//
// Cloudflare quick tunnels are ephemeral and unreliable in a specific, awkward way, observed in practice on this
// hub: a fresh URL often does not work immediately, some never work at all, some stop working after a while --
// and some start working again later, including ones already tried and written off. Whole batches can come back
// at once.
//
// THAT LAST OBSERVATION IS THE DESIGN CONSTRAINT, and it inverts the obvious approach. If liveness were
// monotonic -- once dead, always dead -- pruning failures would be correct and a single current URL would be
// enough. It is not monotonic. So:
//
//   A FAILED PROBE IS EVIDENCE ABOUT A MOMENT, NOT A PROPERTY OF THE URL.
//
// Pruning on failure therefore destroys information: it discards a candidate that the very next hour might be
// the only one working. This registry NEVER hard-deletes on failure. It DEMOTES -- keeps the URL, records when
// it last succeeded and last failed, and orders candidates so the most recently successful is tried first. A URL
// that has failed a hundred times still gets tried after the ones with a recent success, which costs one timeout
// and occasionally saves the connection entirely.
//
// The remote peer takes the whole ordered list, not one address, and walks it until something answers -- the
// same shape as DNS multiple A records or ICE candidate gathering, for the same reason: the endpoint that works
// is not knowable in advance from this side.

export const CANDIDATES_KIND = "swek-tunnel-candidates";

const now = () => new Date().toISOString();

export function emptyCandidates() { return { kind: CANDIDATES_KIND, version: 1, urls: {} }; }

/** Normalise so http://h/ and http://h are one candidate rather than two. */
export function normUrl(u) {
    const t = String(u || "").trim().replace(/\/+$/, "");
    if (!t) return null;
    try { const p = new URL(t); if (p.protocol !== "http:" && p.protocol !== "https:") return null; return p.origin; }
    catch { return null; }
}

/** Register a URL as a candidate. Idempotent; re-adding an existing one does not reset its history. */
export function addCandidate(reg, url, { label = null, at = null } = {}) {
    const out = reg && reg.urls ? { ...reg, urls: { ...reg.urls } } : emptyCandidates();
    const u = normUrl(url);
    if (!u) return out;
    if (!out.urls[u]) {
        out.urls[u] = { url: u, label, firstSeen: at || now(), lastSuccess: null, lastFailure: null, successes: 0, failures: 0, retired: false };
    } else if (label && !out.urls[u].label) {
        out.urls[u] = { ...out.urls[u], label };
    }
    return out;
}

/**
 * Record an attempt. `ok` true on a successful reach.
 *
 * NOTE THE ASYMMETRY, and it is deliberate: a success clears nothing but updates lastSuccess, while a failure
 * NEVER removes the candidate and never sets a permanent flag. The only way a URL leaves the working set is if
 * an operator explicitly retires it -- an act, recorded as such, not an inference the code made from one bad
 * afternoon.
 */
export function recordAttempt(reg, url, ok, { at = null } = {}) {
    const out = reg && reg.urls ? { ...reg, urls: { ...reg.urls } } : emptyCandidates();
    const u = normUrl(url);
    if (!u) return out;
    const c = out.urls[u] || { url: u, label: null, firstSeen: at || now(), lastSuccess: null, lastFailure: null, successes: 0, failures: 0, retired: false };
    out.urls[u] = ok
        ? { ...c, lastSuccess: at || now(), successes: c.successes + 1 }
        : { ...c, lastFailure: at || now(), failures: c.failures + 1 };
    return out;
}

/** Explicitly retire a URL. The ONLY way one leaves the try-list, and it is an operator decision, not a guess. */
export function retire(reg, url, retired = true) {
    const out = reg && reg.urls ? { ...reg, urls: { ...reg.urls } } : emptyCandidates();
    const u = normUrl(url);
    if (u && out.urls[u]) out.urls[u] = { ...out.urls[u], retired: !!retired };
    return out;
}

/**
 * The ordered list a peer should try. Most recently SUCCEEDED first, then never-tried, then most recently
 * failed last -- because a URL nobody has tried is a better bet than one that failed a minute ago, and a URL
 * that failed an hour ago is a better bet than one that failed a minute ago.
 *
 * Retired URLs are excluded. Everything else is included, however bad its record: the cost of trying a stale
 * candidate is one timeout, and the cost of having pruned the only working one is total.
 */
export function orderedCandidates(reg, { includeRetired = false } = {}) {
    const all = Object.values((reg && reg.urls) || {});
    const live = includeRetired ? all : all.filter((c) => !c.retired);
    const score = (c) => {
        if (c.lastSuccess) return { tier: 0, t: -new Date(c.lastSuccess).getTime() };   // succeeded: newest first
        if (!c.lastFailure) return { tier: 1, t: 0 };                                    // never tried
        return { tier: 2, t: new Date(c.lastFailure).getTime() };                        // failed: oldest failure first
    };
    return live.sort((a, b) => {
        const sa = score(a), sb = score(b);
        return sa.tier !== sb.tier ? sa.tier - sb.tier : sa.t - sb.t;
    }).map((c) => c.url);
}

/** Human summary; deliberately reports counts and times, never a live/dead verdict. */
export function candidateLines(reg) {
    const all = Object.values((reg && reg.urls) || {});
    if (!all.length) return ["  no tunnel candidates registered"];
    const out = [`  ${all.length} candidate(s), ${all.filter((c) => c.retired).length} retired -- try order:`];
    for (const u of orderedCandidates(reg)) {
        const c = reg.urls[u];
        const last = c.lastSuccess ? "ok " + c.lastSuccess.slice(0, 16) : (c.lastFailure ? "fail " + c.lastFailure.slice(0, 16) : "untried");
        out.push(`    ${u.padEnd(46)} ${String(c.successes).padStart(3)}ok/${String(c.failures).padStart(3)}fail  ${last}`);
    }
    return out;
}

// ---- v2966: RECONCILING WITH ai-bridge/tunnelRegistry.js ------------------------------------------------------------
//
// A DUPLICATE THIS ROUND FOUND, AND IT WAS MINE. tunnelRegistry.js already existed and already answered this
// exact question -- its aliveUrls() is commented "tunnel URLs usable as PEER targets (gossip / introduce /
// update)" and feeds the peer list in server.js. v2956 built this module without checking, so the tree carried
// two stores answering one question with OPPOSITE policies: the registry deletes a learned URL after three
// strikes, this one never deletes anything.
//
// It would have been easy to argue they serve different purposes. They do not -- the comment and the consumer
// both say otherwise, and pretending otherwise would be the rationalisation this lab exists to refuse.
//
// THE RESOLUTION, and it follows the field evidence rather than either implementation. The observed behaviour is
// that quick tunnels recover, sometimes in batches, including ones already written off. Under that behaviour a
// three-strike DELETE destroys information: the URL is gone, so when it comes back nobody tries it. Demotion
// loses nothing and costs one timeout. So:
//
//   - the registry keeps doing its job unchanged (it is load-bearing: ensureLiveTunnel and the peer list use it);
//   - this module INGESTS from it, so every URL the hub ever learned becomes a durable candidate;
//   - a URL the registry later prunes SURVIVES here, demoted, and is still offered to peers last.
//
// One flow, not two truths: the registry answers "what is live now", this answers "what has ever been worth
// trying", and the second is a superset of the first by construction.

/**
 * Fold the hub's tunnel registry into the candidate list. `registryUrls` is whatever
 * tunnelRegistry.aliveUrls() returned; nothing already known is disturbed, and nothing is removed.
 */
export function ingestRegistry(reg, registryUrls, { at = null, label = "from tunnelRegistry" } = {}) {
    let out = reg && reg.urls ? reg : emptyCandidates();
    for (const u of registryUrls || []) out = addCandidate(out, u, { label, at });
    return out;
}

/**
 * URLs this module knows that the registry has dropped. Not an error -- it is the point. These are the
 * candidates a peer should still try last, and the count is worth surfacing so the divergence is visible rather
 * than quietly accumulating.
 */
export function survivingPruned(reg, registryUrls) {
    const live = new Set((registryUrls || []).map(normUrl).filter(Boolean));
    return Object.values((reg && reg.urls) || {})
        .filter((c) => !c.retired && !live.has(c.url))
        .map((c) => c.url);
}
