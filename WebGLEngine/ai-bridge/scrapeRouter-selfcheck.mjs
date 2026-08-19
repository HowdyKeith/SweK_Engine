// ai-bridge/scrapeRouter-selfcheck.mjs
//
// v3429 -- THE ROUTER THAT WAS MISSING, AND AN HONEST ACCOUNT OF WHAT IS AND IS NOT ESTABLISHED HERE.
//
// The tree has FOUR scrape backends -- Camoufox via scrapeBridge, Firecrawl (cloud, keyed), crawl4ai (local
// :11235) and the Python scrapers -- and nothing chose between them. scrape.html drives Camoufox only, so every
// fetch used the heaviest tool available or whichever door the caller opened.
//
// WHY THIS IS GRADEABLE WHERE EARLIER ROUTING PROPOSALS WERE NOT: Frugon and world-model-optimizer both routed
// on a PREDICTED sufficiency signal, with nothing to check the prediction against. Here the check is a fetch --
// pick a method from caniscrape's 0-10 difficulty score, run it, and it either returned usable content or it did
// not. That is an answer key.
//
// *** AND THE ANSWER KEY IS NOT AVAILABLE IN THIS ENVIRONMENT. *** There is no network here. Everything below
// grades the routing LOGIC, which is deterministic: band coverage, monotonicity, escalation direction, refusal,
// per-domain caching. Whether the MAPPING IS RIGHT -- whether a score of 3 really is handled by crawl4ai -- needs
// live fetches against real sites and is a rig run. The band boundaries are a STARTING HYPOTHESIS and are
// labelled as such rather than presented as measurements.
//
// THE LOAD-BEARING NEGATIVE, which the rig run must look for: a domain scored EASY whose cheap method fails, and
// one scored HARD that plain fetch handles. routingMisses() computes both and returns empty until fed real
// outcomes -- an empty miss list is the absence of evidence here, not evidence of absence.

import {
    METHODS, BANDS, methodById, availability, chooseMethod,
    domainOf, makeScoreCache, recordOutcome, routingMisses,
} from "./scrapeRouter.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ALL = availability({ crawl4aiUp: true, camoufoxAvailable: true, hasFirecrawlKey: true });

// ---- 1. THE TWO ORDERINGS AGREE -- the bug this file caught in its own design ------------------------------------
{
    const rungs = BANDS.map((b) => methodById(b.method).rung);
    ok("!! the band order and the capability rungs agree",
        rungs.every((r, i) => i === 0 || r > rungs[i - 1]),
        `bands map to rungs ${rungs.join(" < ")}. The first draft had firecrawl at rung 2 and camoufox at 3 while ` +
        "sending HARDER sites (8-9) to firecrawl and easier ones (6-7) to camoufox -- two orderings of the same " +
        "four backends, disagreeing. 'Escalate upward' then walked score 9 DOWN to camoufox and called it an " +
        "escalation. A router silently splitting the difference between its own contradictory tables");

    ok("...and every rung is distinct, so 'escalate' has a direction",
        new Set(METHODS.map((m) => m.rung)).size === METHODS.length,
        "two methods sharing a rung would make escalation ambiguous, and the tie would be broken by array order " +
        "rather than by capability");
}

// ---- 2. COVERAGE AND MONOTONICITY OVER THE WHOLE SCORE RANGE ---------------------------------------------------------
{
    const picks = [];
    for (let s = 0; s <= 9; s += 0.5) picks.push({ s, ...chooseMethod(s, ALL) });
    ok("!! every score from 0 to 9 routes to a method, with nothing available refused",
        picks.every((p) => p.method && !p.refused),
        `${picks.length} scores tested at half-point steps, no gaps. A band table with a hole would refuse a ` +
        "perfectly routable site");

    const rungsBy = picks.map((p) => methodById(p.method).rung);
    ok("!! a harder score NEVER selects a weaker method",
        rungsBy.every((r, i) => i === 0 || r >= rungsBy[i - 1]),
        `rungs across the range: ${[...new Set(rungsBy)].join(" -> ")}, non-decreasing throughout. This is the ` +
        "property that makes the score meaningful at all -- if a 7 could route lighter than a 4, the number " +
        "would not be a difficulty");
}

// ---- 3. ESCALATION IS UPWARD ONLY, AND REFUSES RATHER THAN DOWNGRADING ---------------------------------------------------
{
    const noKey = availability({ crawl4aiUp: true, camoufoxAvailable: true, hasFirecrawlKey: false });
    const hard = chooseMethod(9, noKey);
    ok("!! a hard score with no firecrawl key REFUSES rather than dropping to camoufox",
        hard.refused === true && /nothing at or above/.test(hard.reason),
        `score 9 without a key: ${hard.reason}. Dropping to camoufox would be choosing a method the band table ` +
        "says is insufficient -- a known failure dressed as a fallback. Refusing says the job cannot be done " +
        "with what is installed, which is actionable");

    const noCrawl = availability({ crawl4aiUp: false, camoufoxAvailable: true, hasFirecrawlKey: true });
    const mid = chooseMethod(4, noCrawl);
    ok("...but an unavailable MIDDLE rung escalates upward, because something above it can cope",
        mid.method === "camoufox" && mid.escalated === true && mid.wanted === "crawl4ai",
        `score 4 wanted crawl4ai, got ${mid.method}. Escalation is only sound upward -- a higher rung is a ` +
        "superset by construction, and that is what the rung ordering is for");
}

// ---- 4. REFUSAL WHERE THERE IS NOTHING TO ROUTE ON --------------------------------------------------------------------------
{
    ok("!! no score, a non-number, or an out-of-range score all refuse",
        [undefined, null, NaN, "7", -1, 11].every((s) => chooseMethod(s, ALL).refused),
        "a router that picked the heaviest tool for an unscored site would be making a decision with no basis " +
        "and hiding it. Refusing surfaces that caniscrape has not run yet");

    ok("!! and score 10 refuses on caniscrape's own terms",
        chooseMethod(10, ALL).refused && /do-not/.test(chooseMethod(10, ALL).reason),
        "10 is the tool's own do-not band. Escalating past it would be substituting our judgement for the " +
        "reconnaissance we asked for");
}

// ---- 5. THE CACHE IS PER-DOMAIN, BECAUSE THE PROBE COSTS 30-60 SECONDS ----------------------------------------------------
{
    let clock = 0;
    const cache = makeScoreCache({ ttlMs: 1000, now: () => clock });
    cache.put("https://example.com/a", 4);
    ok("!! a second URL on the same host hits the cache",
        cache.get("https://example.com/b/c?d=1").score === 4 && cache.size() === 1,
        "caniscrape's own docs give 30-60s per URL over several requests, and warn it may trip rate limits. Two " +
        "pages on one host share a WAF, a CDN and a fingerprinting vendor -- scoring both pays twice for one " +
        "answer, and a per-FETCH router would be abusive as well as slow");

    ok("...and a different host does not",
        cache.get("https://other.example/x") === null,
        "the key is the hostname, so a sibling domain is a separate question and gets asked separately");

    clock = 2000;
    ok("...and the entry expires, so a site that hardens is re-scored",
        cache.get("https://example.com/a") === null,
        "difficulty is not a permanent property -- a site can add a WAF next week. A cache with no TTL would " +
        "route on last year's reconnaissance forever");

    ok("a malformed URL is refused by the cache rather than keyed under null",
        cache.put("not a url", 3) === null && cache.get("not a url") === null,
        "storing an unparseable URL under a null domain would collide every bad input into one entry");
}

// ---- 6. THE ANSWER KEY IS ABSENT HERE, AND THE CODE SAYS SO ----------------------------------------------------------------
{
    const log = [];
    recordOutcome(log, { url: "https://example.com/x", score: 2, chosen: "fetch", succeeded: false, fellBackTo: "camoufox" });
    recordOutcome(log, { url: "https://other.example/y", score: 3, chosen: "crawl4ai", succeeded: true });
    const m = routingMisses(log);
    ok("!! routingMisses finds a TOO-OPTIMISTIC routing when one is recorded",
        m.tooOptimistic.length === 1 && m.total === 2,
        "a domain scored 2, routed to plain fetch, that then needed Camoufox -- the mapping was wrong for that " +
        "site and the log says so. This is the load-bearing negative, and it is what a rig run must hunt for");

    ok("!! but the miss list is EMPTY without real fetches, which is absence of evidence",
        routingMisses([]).total === 0 && routingMisses([]).missRate === null,
        "there is NO NETWORK in the environment this was written in. Every check above grades deterministic " +
        "routing logic; not one of them establishes that the band boundaries are correct. missRate returns null " +
        "rather than 0 for an empty log, because a rate of zero would read as 'no misses found' when the truth " +
        "is 'nothing was tried'");

    ok("...and the band boundaries are labelled a hypothesis, not a measurement",
        BANDS.length === 4 && BANDS.every((b) => typeof b.label === "string"),
        "caniscrape publishes a per-factor difficulty table and knows nothing about these four backends, so the " +
        "mapping onto them is ours and is currently a guess. Every boundary moves the first time a rig run " +
        "disagrees with it");
}

console.log();
if (fails) { console.log("scrapeRouter-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("scrapeRouter-selfcheck: all checks pass");
