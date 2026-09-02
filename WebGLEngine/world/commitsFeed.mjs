// WebGLEngine/world/commitsFeed.mjs -- v4314 (Level 16)
//
// LEVEL 16: THE UNIVERSE REACTS TO GITHUB. A commit in a vendored repository is PRODUCTION at that repository's
// market: `tonsPerCommit` of source made and its base value minted, booked through the economy's own
// intervention ("commits"), so it is journaled, replayed and lockstepped like anything else a person does.
// Not accurate -- a commit is not a ton of anything -- and said so; what it is, is a live cause.
//
// The feed itself is a list of { repo, commits, date } records. Where they come from is the caller's business:
// the ai-bridge (ai-bridge/githubBridge.js) talks to api.github.com from Node with a token and does not yet
// expose a commits endpoint; a page can fetch a commits.json somebody or something dropped beside it; a gate
// hands over a fixture. This module turns any of those into interventions and knows which repo is which body.
"use strict";

/** The body (market) a repository name belongs to: the vendor directory is the last path segment, matched case-blind. */
export function marketForRepo(repo, markets) {
    const tail = String(repo || "").split("/").pop().toLowerCase().replace(/\.git$/, "");
    const m = markets.find((x) => String(x.name).toLowerCase() === tail) || markets.find((x) => tail.includes(String(x.name).toLowerCase()) && x.name.length > 2);
    return m || null;
}
/**
 * Feed records -> interventions on the economy. `since` (a sim tick) gates replays of the same feed: a record
 * carries `id` (repo + date) and the returned `seen` set is what to pass back next time so nothing is counted
 * twice. Returns { applied: [{ repo, market, commits }], skipped: [{ repo, why }], seen }.
 */
export function applyCommitsFeed(economy, records, { seen = new Set(), atTick = null } = {}) {
    const applied = [], skipped = [], nextSeen = new Set(seen);
    for (const r of records || []) {
        const id = `${r.repo}@${r.date || ""}#${r.sha || r.commits}`;
        if (nextSeen.has(id)) { skipped.push({ repo: r.repo, why: "already counted" }); continue; }
        const m = marketForRepo(r.repo, economy.markets);
        if (!m) { skipped.push({ repo: r.repo, why: "no body of that name in this orrery" }); nextSeen.add(id); continue; }
        const commits = Math.max(0, Math.round(r.commits || 0)); if (!commits) { skipped.push({ repo: r.repo, why: "no commits" }); nextSeen.add(id); continue; }
        economy.intervene("commits", { market: m.id, commits }, atTick == null ? economy.tick : atTick);
        applied.push({ repo: r.repo, market: m.name, commits }); nextSeen.add(id);
    }
    return { applied, skipped, seen: nextSeen };
}
/** A fixture: a week of commits across the orrery's bodies, deterministic, for the gate and the page's demo switch. */
export function fixtureFeed(markets, { days = 7, seed = 5 } = {}) {
    let s = (seed >>> 0) || 1; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = [];
    for (let d = 0; d < days; d++) for (const m of markets) if (rnd() < 0.35) out.push({ repo: "vendor/" + m.name, commits: 1 + Math.floor(rnd() * 5), date: `day+${d}` });
    return out;
}
