// ai-bridge/scrapeRouter.mjs
//
// v3429 -- FOUR SCRAPE BACKENDS, FOUR FRONT DOORS, AND NOTHING CHOOSING BETWEEN THEM.
//
// The tree has scrapeBridge (warm Camoufox daemon: goto/content/evaluate/screenshot/click/fill),
// firecrawlBridge (cloud + API key -> markdown), crawl4aiBridge (local server on :11235 -> markdown) and
// ai-bridge/scrapers/*.py. scrape.html drives Camoufox only. Nothing picks a method for a given site, so every
// fetch either uses the heaviest tool available or whichever door the caller happened to open.
//
// caniscrape (ZA1815/caniscrape, MIT, Python) scores a domain 0-10 for scrape difficulty -- wafw00f wrapping
// plus rate-limit probing, JS-render diffing, CAPTCHA, TLS fingerprinting, honeypots, DataDome/PerimeterX and
// canvas fingerprinting. Reconnaissance only; it bypasses nothing and says so.
//
// *** WHAT MAKES THIS GRADEABLE, AND WHY IT IS NOT THE SAME AS THE ROUTING PROPOSALS REFUSED BEFORE. ***
// Frugon and world-model-optimizer both routed on a PREDICTED sufficiency signal -- a guess about whether a
// cheaper path would do, with nothing to check the guess against. Here the check is a fetch: pick a method from
// the score, run it, and the fetch either returned usable content or it did not. That is an answer key.
//
// AND THE LOAD-BEARING NEGATIVE IS THE POINT: a domain scored EASY where the cheap method fails, or scored HARD
// that plain fetch handles, is a real miss and the router must record it rather than silently escalating.
//
// *** WHAT THIS FILE CANNOT ESTABLISH, STATED PLAINLY. *** The environment this was written in has NO NETWORK.
// The routing LOGIC below is deterministic and fully gradeable offline -- monotonicity, coverage, availability
// handling, cache behaviour, refusal. Whether the MAPPING IS CORRECT -- whether a score of 3 really is handled
// by crawl4ai -- is exactly the thing that needs live fetches, and it is a rig run. Building the instrument and
// measuring it are different jobs, and only the first is done here.
//
// A DESIGN CONSTRAINT FROM CANISCRAPE'S OWN DOCS: 30-60 seconds per URL, several requests, and it may itself
// trigger rate limits. So it is a PER-DOMAIN PLANNING tool with a cache, never a per-fetch router. Calling it on
// every fetch would be both slow and abusive.

/**
 * The capability ladder, cheapest first. Each rung must be a strict superset of the one below in what it can
 * handle, or "escalate" is not a meaningful operation.
 */
export const METHODS = [
    { id: "fetch",     rung: 0, js: false, stealth: false, cost: "none",  local: true,
      why: "plain HTTP. No JS, no fingerprint management. Handles static HTML and public APIs" },
    { id: "crawl4ai",  rung: 1, js: true,  stealth: false, cost: "none",  local: true,
      why: "local server on :11235, renders JS, returns markdown. No key, no per-call cost" },
    { id: "camoufox",  rung: 2, js: true,  stealth: true,  cost: "none",  local: true,
      why: "warm stealth browser: real fingerprint, interaction, screenshots. Heaviest LOCAL option" },
    { id: "firecrawl", rung: 3, js: true,  stealth: false, cost: "key",   local: false,
      why: "cloud, needs an API key and bills per call. Top rung not because it is cleverer but because it is " +
           "someone else's infrastructure and their egress -- the last thing to try, and the only one that costs" },
];

export const methodById = (id) => METHODS.find((m) => m.id === id) || null;

/**
 * Score bands. The boundaries are a STARTING HYPOTHESIS, not a measurement -- caniscrape publishes a per-factor
 * table but not a mapping onto these four backends, because it does not know about them. Every boundary here is
 * a guess until a rig run moves it, and the gate says so rather than dressing them as findings.
 */
// *** THE RUNG ORDER AND THE BAND ORDER MUST AGREE, AND THEY DID NOT. ***
// The first version had firecrawl at rung 2 and camoufox at 3, while the bands sent harder sites (8-9) to
// firecrawl and easier ones (6-7) to camoufox. So the bands said firecrawl was the more capable and the rungs
// said camoufox was -- and "escalate upward" then walked score 9 DOWN to camoufox while calling it an
// escalation. Two orderings of the same four things, disagreeing, and the router quietly split the difference.
// The rungs now follow the bands, and a gate asserts they cannot diverge again.
export const BANDS = [
    { max: 2,  method: "fetch",     label: "trivial" },
    { max: 5,  method: "crawl4ai",  label: "needs JS" },
    { max: 7,  method: "camoufox",  label: "needs a real fingerprint" },
    { max: 9,  method: "firecrawl", label: "beyond local stealth" },
];

/** Which methods are usable right now. firecrawl without a key is not a choice, it is a failure waiting. */
export function availability({ hasFirecrawlKey = false, crawl4aiUp = false, camoufoxAvailable = true } = {}) {
    return {
        fetch: true,
        crawl4ai: !!crawl4aiUp,
        firecrawl: !!hasFirecrawlKey,
        camoufox: !!camoufoxAvailable,
    };
}

/**
 * Choose a method for a difficulty score.
 *
 * REFUSES rather than guesses in two cases: a score of 10 (caniscrape's own "do not" band) and a score that is
 * absent or not a number. A router that silently picked the heaviest tool for an unknown site would be making a
 * decision it has no basis for and hiding it.
 *
 * ESCALATES when the chosen method is unavailable -- upward only, never down, because a lower rung is by
 * definition less capable and choosing it would be choosing a known failure.
 */
export function chooseMethod(score, avail = availability({}), opts = {}) {
    if (typeof score !== "number" || Number.isNaN(score)) {
        return { method: null, refused: true, reason: "no difficulty score: nothing to route on" };
    }
    if (score < 0 || score > 10) {
        return { method: null, refused: true, reason: `score ${score} is outside caniscrape's 0-10 range` };
    }
    if (score >= 10) {
        return { method: null, refused: true, reason: "score 10: caniscrape's own do-not band. Refusing rather than escalating" };
    }

    const band = BANDS.find((b) => score <= b.max);
    const wanted = band ? band.method : "camoufox";
    const wantedRung = methodById(wanted).rung;

    if (avail[wanted]) return { method: wanted, refused: false, escalated: false, band: band && band.label, wanted };

    // escalate UPWARD only: find the cheapest available method at or above the wanted rung
    const up = METHODS.filter((m) => m.rung >= wantedRung && avail[m.id]).sort((a, b) => a.rung - b.rung)[0];
    if (up) {
        return { method: up.id, refused: false, escalated: true, wanted, band: band && band.label,
                 reason: `${wanted} unavailable; escalated to ${up.id}` };
    }
    return { method: null, refused: true, wanted, band: band && band.label,
             reason: `${wanted} unavailable and nothing at or above its rung is either` };
}

// ---- PER-DOMAIN CACHE -------------------------------------------------------------------------------------------
//
// caniscrape costs 30-60s per URL and may trip rate limits, so a score is cached against the DOMAIN, not the URL.
// Two pages on the same host share a WAF, a CDN and a fingerprinting vendor; scoring both is paying twice for
// one answer.

export const domainOf = (url) => {
    try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
};

export function makeScoreCache({ ttlMs = 7 * 24 * 3600 * 1000, now = () => Date.now() } = {}) {
    const store = new Map();
    return {
        get(url) {
            const d = domainOf(url);
            if (!d) return null;
            const hit = store.get(d);
            if (!hit) return null;
            if (now() - hit.at > ttlMs) { store.delete(d); return null; }
            return hit;
        },
        put(url, score, meta = {}) {
            const d = domainOf(url);
            if (!d) return null;
            const rec = { domain: d, score, at: now(), ...meta };
            store.set(d, rec);
            return rec;
        },
        size: () => store.size,
        domains: () => [...store.keys()],
    };
}

/**
 * A recorded outcome: what the router chose and whether the fetch actually worked.
 * THIS is the answer key, and it can only be filled in with a network. A miss in either direction -- an easy
 * score whose cheap method failed, or a hard score that plain fetch would have handled -- is the finding.
 */
export function recordOutcome(log, { url, score, chosen, succeeded, fellBackTo = null }) {
    const rec = { url, domain: domainOf(url), score, chosen, succeeded, fellBackTo, at: Date.now() };
    log.push(rec);
    return rec;
}

/** Misses in both directions, computed from recorded outcomes. Empty until a rig run supplies them. */
export function routingMisses(log) {
    const tooOptimistic = log.filter((r) => !r.succeeded && r.fellBackTo);   // scored easy, cheap method failed
    const tooPessimistic = log.filter((r) => r.succeeded && r.chosen !== "fetch" && r.plainFetchWouldWork === true);
    return {
        tooOptimistic, tooPessimistic,
        total: log.length,
        missRate: log.length ? (tooOptimistic.length + tooPessimistic.length) / log.length : null,
    };
}
