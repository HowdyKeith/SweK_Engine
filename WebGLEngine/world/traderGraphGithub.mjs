// WebGLEngine/world/traderGraphGithub.mjs -- v4687
//
// *** THE GITHUB LAYER OF THE TRADER GRAPH, TAKEN WHERE GITHUB ANSWERS. ***
//
// world/traderGraph.mjs built the graph from git history because, from this sandbox, every GitHub API path
// is refused by the runner in front of it. tools/ship/traderGraph-selfcheck.mjs was written to go red the
// day an axis opened -- "GO AND USE IT" -- and on Keith's rig, which has no runner in front of GitHub, it did.
// Keith chose to take the invitation. This module is the taking.
//
// ---- WHAT IS FETCHED, AND WHAT IS DELIBERATELY NOT -----------------------------------------------------------
//
// Two REPOSITORY-level readings, for the repositories the graph already covers (REPOS) and no others:
//
//   /repos/{owner}/{name}               fork, and the upstream it was forked from (parent)
//   /repos/{owner}/{name}/contributors  the contributor list as GitHub counts it, KEYED BY LOGIN
//
// The login is the point. traderGraph.mjs keys a person two ways -- display name and a hash of the commit
// address -- and says in so many words that "NEITHER KEY IS CORRECT", because git identity is self-declared.
// GitHub maps commits to accounts, so a login is a third key and the first one that is not self-declared.
//
// NOT fetched: user profiles, followers, a contributor's other repositories, and user search. Those are the
// axes traderGraph.mjs already names as profiling rather than mapping ("searching users by location to
// decorate a visualisation is profiling strangers"), and following each trader out of the project to
// everything else they have touched is the "database of people" its header refuses to build. The graph stays
// the project's own relationship graph: these 35 repositories, and who crossed between them.
//
// NOTHING PERSONAL IS STORED beyond what GitHub publishes as a handle: per contributor, the login, the
// contribution count and the account type (User / Bot). No name, no address, no avatar URL.
//
// ---- WHERE IT RUNS ---------------------------------------------------------------------------------------------
//
// On a box where GitHub answers. `node world/traderGraphGithub.mjs --fetch --write` writes the record below;
// GITHUB_TOKEN is used if set (5,000 requests an hour) and otherwise the unauthenticated 60 an hour applies,
// which does not cover a full pass -- so a pass that meets the limit STOPS, writes what it has with the rest
// listed as `pending`, and the next run resumes from there. A partial record is never presented as a whole one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPOS, TRADERS, AXES, PROBE_AXIS, isAutomation } from "./traderGraph.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RECORD_REL = "world/trader-graph-github.json";
export const API = "https://api.github.com/";
/** One page is 100 contributors; a repository with more is read up to this many pages and marked truncated. */
export const MAX_PAGES = 5;

/** The record on disk, or null when no box that reaches GitHub has produced one yet. */
export function readLayer(root = ENG) {
    try { return JSON.parse(fs.readFileSync(path.join(root, RECORD_REL), "utf8")); } catch { return null; }
}

/**
 * Was this repository READ -- a final answer, not a gap? A 404, or a contributor list that came back (pages > 0),
 * or an explicit status GitHub gave instead of one. v4688: the first rig pass marked but0n/automaton complete with
 * no pages and no status, which this refuses, so a resume re-reads it.
 */
export function isRead(entry) {
    return !!(entry && entry.complete && (entry.status === 404 || entry.pages > 0 || typeof entry.contributorsStatus === "number"));
}

/** A contributor reduced to what is kept: [login, contributions, type]. Everything else GitHub returns is dropped. */
export function keep(c) { return [String(c.login), Number(c.contributions) || 0, c.type === "Bot" ? "Bot" : "User"]; }

const RATE_LIMITED = (res) => res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");

/**
 * Fetch the layer. `fetchImpl` is injectable so the gate drives every branch -- pagination, a fork, the rate
 * limit, a resume -- without a network. Returns the record; writes nothing.
 */
export async function fetchLayer({ repos = REPOS.map((r) => r.repo), fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN || null,
                                   prior = null, now = () => new Date().toISOString(), log = () => {} } = {}) {
    const headers = { accept: "application/vnd.github+json", "user-agent": "SweK-traderGraph" };
    if (token) headers.authorization = "Bearer " + token;
    const out = { at: now(), via: token ? "GitHub REST, authenticated" : "GitHub REST, unauthenticated",
                  repos: { ...((prior && prior.repos) || {}) }, pending: [], limited: false };
    const get = async (p) => {
        let res;
        try { res = await fetchImpl(API + p, { headers }); }
        catch (e) { return { status: "network: " + String((e && (e.cause && e.cause.code)) || (e && e.message) || e).slice(0, 60) }; }   // unreachable: not a reading
        if (RATE_LIMITED(res)) return { limited: true };
        if (res.status === 204) return { status: 204, body: [] };           // "no content": an empty list, and json() would throw
        if (!res.ok) return { status: res.status };
        return { status: res.status, body: await res.json() };
    };
    for (const repo of repos) {
        if (out.limited) { out.pending.push(repo); continue; }
        if (isRead(out.repos[repo])) continue;   // resumed: already read in full
        const meta = await get("repos/" + repo);
        if (meta.limited) { out.limited = true; out.pending.push(repo); continue; }
        // A 404 is an answer (the repository is gone) and is recorded as one. Any other refusal -- a runner in front
        // of GitHub answers 403 to every path, which is the whole premise of traderGraph.mjs -- is NOT a reading,
        // so the repository stays pending rather than being written down as read.
        if (!meta.body) {
            if (meta.status === 404) out.repos[repo] = { complete: true, status: 404 };
            else out.pending.push(repo);
            log(`${repo}: HTTP ${meta.status}`); continue;
        }
        const contributors = [];
        let pages = 0, truncated = false, limited = false, contributorsStatus;
        for (let page = 1; page <= MAX_PAGES; page++) {
            const r = await get(`repos/${repo}/contributors?per_page=100&page=${page}`);
            if (r.limited) { limited = true; break; }
            // *** v4688 -- A CONTRIBUTOR LIST GITHUB WOULD NOT GIVE IS NOT AN EMPTY ONE. *** Refusals (403 "too large to list"),
            // 204 and server errors are told apart here, and a refusal keeps its status beside an empty list.
            // *** CORRECTED AT v4689: THE CASE THAT PROMPTED THIS WAS NOT ONE OF THEM. *** v4688's note said but0n/automaton's
            // 0 contributors against 166 commits was a gap recorded as a fact. The record says pages: 1 -- GitHub ANSWERED,
            // with an empty list (a 200, not a refusal). The likely reading: the endpoint lists only commit authors linked
            // to an account, and none in this fork's history is -- likely, not shown, since `anon=1` would be the check and
            // it lists names and addresses, which this module does not store. The handling stays because the other cases
            // are real; the attribution was wrong.
            if (!r.body) { contributorsStatus = r.status; break; }
            pages++;
            for (const c of r.body) contributors.push(keep(c));
            if (r.body.length < 100) break;
            if (page === MAX_PAGES) truncated = true;
        }
        if (limited) { out.limited = true; out.pending.push(repo); continue; }
        if (pages === 0 && (typeof contributorsStatus !== "number" || contributorsStatus >= 500)) { out.pending.push(repo); log(`${repo}: contributors ${contributorsStatus} -- pending`); continue; }
        out.repos[repo] = {
            complete: true, fork: !!meta.body.fork,
            parent: meta.body.parent ? String(meta.body.parent.full_name) : null,
            contributors, pages, truncated, ...(pages === 0 ? { contributorsStatus } : {}),
        };
        log(`${repo}: fork ${!!meta.body.fork}${meta.body.parent ? " of " + meta.body.parent.full_name : ""}, ${contributors.length} contributor(s)`);
    }
    return out;
}

/**
 * Is an OPEN probe path accounted for? Its axis is DECLINED with a reason, or USED -- usedBy set and this layer
 * holding that repository, read in full. traderGraph-selfcheck's invitation row asserts every open path is.
 */
export function accountedFor(probePath, layer, axes = AXES, probeAxis = PROBE_AXIS) {
    const ax = axes.find((a) => a.axis === probeAxis[probePath]);
    if (!ax) return false;
    if (ax.declined) return true;
    const repo = (probePath.match(/^repos\/([^/]+\/[^/]+)/) || [])[1];
    return !!(ax.usedBy && layer && repo && layer.repos && isRead(layer.repos[repo]));
}

/** Forks and the upstream each was taken from -- the trade routes git history cannot see. */
export function forkParents(layer) {
    return Object.entries((layer && layer.repos) || {}).filter(([, r]) => r.fork && r.parent).map(([repo, r]) => ({ repo, parent: r.parent }));
}

/**
 * The API's fork flag against traderGraph.mjs's history-derived answer (ownerShare 0 means "the owner wrote
 * none of it", which the header argues is the same question). They are NOT the same question, and where they
 * disagree is the finding: a repository can be a fork the owner then worked in, or an original the owner has
 * not committed to under a matching identity.
 */
export function forkAgreement(layer) {
    const agree = [], disagree = [];
    for (const r of REPOS) {
        const g = layer && layer.repos && layer.repos[r.repo];
        if (!g || g.fork === undefined) continue;
        const byHistory = r.ownerShare === 0;
        (g.fork === byHistory ? agree : disagree).push({ repo: r.repo, api: g.fork, history: byHistory, ownerShare: r.ownerShare });
    }
    return { agree, disagree };
}

/** Traders keyed by LOGIN: accounts (not bots) with commits in more than one of the graphed repositories. */
export function loginTraders(layer) {
    const by = new Map();
    for (const [repo, r] of Object.entries((layer && layer.repos) || {})) {
        for (const [login, , type] of r.contributors || []) {
            if (type === "Bot" || isAutomation(login, "")) continue;
            if (!by.has(login)) by.set(login, new Set());
            by.get(login).add(repo);
        }
    }
    return [...by].filter(([, s]) => s.size > 1).map(([login, s]) => ({ login, repos: [...s].sort() }))
        .sort((a, b) => b.repos.length - a.repos.length || a.login.localeCompare(b.login));
}

/** How the three keys compare: crossings by display name and by address hash (from TRADERS) against by login. */
export function keyComparison(layer) {
    const byLogin = loginTraders(layer);
    return { byEmailHash: TRADERS.length, byLogin: byLogin.length, logins: byLogin };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    if (!process.argv.includes("--fetch")) {
        const L = readLayer();
        console.log(L ? `[traderGraphGithub] record at ${RECORD_REL}: ${Object.keys(L.repos).length} repo(s), ${L.pending.length} pending, taken ${L.at} (${L.via})`
                      : `[traderGraphGithub] no record yet -- run with --fetch --write on a box that reaches GitHub`);
        process.exit(0);
    }
    const prior = readLayer();
    const L = await fetchLayer({ prior, log: (m) => console.log("  " + m) });
    const fp = forkParents(L), fa = forkAgreement(L), k = keyComparison(L);
    console.log(`[traderGraphGithub] ${Object.keys(L.repos).length} of ${REPOS.length} repo(s) read (${L.via}); ` +
        `${L.pending.length} pending${L.limited ? " -- RATE LIMITED, re-run later (or set GITHUB_TOKEN) to resume" : ""}`);
    console.log(`[traderGraphGithub] ${fp.length} fork(s) with a named upstream; fork flag agrees with history on ${fa.agree.length}, disagrees on ${fa.disagree.length}`);
    console.log(`[traderGraphGithub] traders crossing repositories: ${k.byEmailHash} by address hash, ${k.byLogin} by login`);
    if (process.argv.includes("--write")) {
        fs.writeFileSync(path.join(ENG, RECORD_REL), JSON.stringify(L, null, 1) + "\n");
        console.log(`[traderGraphGithub] wrote ${RECORD_REL}`);
    } else console.log("[traderGraphGithub] nothing written; pass --write to record this pass");
}
