// WebGLEngine/ui/channelFeed.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// A YOUTUBE CHANNEL AS DATA: the videos, what the channel says about itself, and the GitHub repositories the videos name -- parsed from YouTube's PUBLIC pages (the channel's RSS feed, its page, a video's watch page), no API key.
// The template is https://www.youtube.com/@TheNextNewThingAI; the same file format will describe SweK Engine's own channel when it has videos. A SNAPSHOT is one JSON file ("swek-channel-v1", data/channels/<slug>.json) that
// tools/ship/takeYoutubeChannel.mjs writes where YouTube is reachable and channel.html renders; this module is what both share, so the page and the command cannot disagree about what a repo link or a chapter is.
//
// WHAT THE FEED GIVES AND DOES NOT: the RSS feed names the channel's 15 NEWEST videos, each with its full description, thumbnail, view count and star rating. It does not give duration or tags (the watch page does: parseWatchPage),
// nor the channel's subscriber count (the channel page does: parseChannelPage, best effort, because that page is a JSON blob YouTube reshapes). A snapshot is therefore MERGED, never replaced (mergeSnapshots): run the command
// again after each upload and the file grows past 15; a video once seen is kept.
//
// GITHUB LINKS ARE READ FROM THE TEXT (the description, and the channel's own links), never guessed: githubRepo() accepts owner/repo shapes (github.com/o/r, with .git, with a tree/blob/issues path, with a hash or query) and
// refuses everything that is not a repository (a bare owner, github.com/sponsors/x, /settings, /orgs, /features, ...). A bare owner is kept apart as an OWNER link: it is real information, but it is not a repo.
//
// Pure: no DOM, no network, no clock (callers pass `at`). Runs in node and in the page.
"use strict";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** XML/HTML entity decoding: the five named ones, plus decimal and hex numeric references; an unknown name is left as written. */
export function decodeEntities(s) {
    return String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
        if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
        const v = ENT[e.toLowerCase()]; return v === undefined ? m : v;
    });
}

const tag = (xml, name) => { const m = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i").exec(xml); return m ? decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "")) : null; };
const attr = (xml, name, a) => { const m = new RegExp("<" + name + "\\s[^>]*?\\b" + a + "=\"([^\"]*)\"", "i").exec(xml); return m ? decodeEntities(m[1]) : null; };
const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/** YouTube's channel RSS (https://www.youtube.com/feeds/videos.xml?channel_id=UC...) -> { channelId, title, url, published, videos: [...] }. Entries without a video id are dropped. */
export function parseFeed(xml) {
    const x = String(xml ?? ""), head = x.slice(0, Math.max(0, x.search(/<entry[\s>]/i) === -1 ? x.length : x.search(/<entry[\s>]/i)));
    const out = { channelId: tag(head, "yt:channelId"), title: tag(head, "title"), url: (/<link\s+rel="alternate"[^>]*?\bhref="([^"]*)"/i.exec(head) || [])[1] ? decodeEntities(/<link\s+rel="alternate"[^>]*?\bhref="([^"]*)"/i.exec(head)[1]) : null, published: tag(head, "published"), videos: [] };
    for (const m of x.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
        const e = m[0], id = tag(e, "yt:videoId");
        if (!id || !/^[\w-]{6,20}$/.test(id)) continue;
        out.videos.push({
            id, title: tag(e, "title") ?? "", published: tag(e, "published"), updated: tag(e, "updated"), description: tag(e, "media:description") ?? "",
            thumbnail: attr(e, "media:thumbnail", "url"), views: num(attr(e, "media:statistics", "views")), ratingCount: num(attr(e, "media:starRating", "count")), rating: num(attr(e, "media:starRating", "average")),
        });
    }
    return out;
}

/** The balanced JSON object that follows `marker` in `text` (a `var ytInitialData = {...};` blob), string- and escape-aware; null when absent or unbalanced. */
export function jsonAfter(text, marker) {
    const t = String(text ?? ""), i = t.indexOf(marker); if (i < 0) return null;
    const start = t.indexOf("{", i + marker.length); if (start < 0) return null;
    let depth = 0, str = false, esc = false;
    for (let k = start; k < t.length; k++) {
        const c = t[k];
        if (str) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') str = false; continue; }
        if (c === '"') str = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) { try { return JSON.parse(t.slice(start, k + 1)); } catch { return null; } }
    }
    return null;
}
/** The first value stored under `key` anywhere in a parsed JSON tree (depth first), or undefined. */
export function findKey(o, key, seen = new Set()) {
    if (!o || typeof o !== "object" || seen.has(o)) return undefined; seen.add(o);
    if (Object.prototype.hasOwnProperty.call(o, key)) return o[key];
    for (const v of Object.values(o)) { const r = findKey(v, key, seen); if (r !== undefined) return r; }
    return undefined;
}
const textOf = (n) => (n == null ? null : typeof n === "string" ? n : n.simpleText ?? (Array.isArray(n.runs) ? n.runs.map((r) => r.text).join("") : n.content ?? null));

/** A channel page's HTML -> what it says about itself, best effort: { channelId, name, description, handle, subscribers (the page's own words), avatar, canonical }. Any field may be null: the page is a JSON blob YouTube reshapes. */
export function parseChannelPage(html) {
    const h = String(html ?? ""), data = jsonAfter(h, "ytInitialData") || jsonAfter(h, "ytInitialData =");
    const meta = data ? findKey(data, "channelMetadataRenderer") : null;
    const canonical = (/<link rel="canonical" href="([^"]+)"/i.exec(h) || [])[1] || null;
    const idFromUrl = (canonical && /\/channel\/(UC[\w-]{20,})/.exec(canonical)) || /"(?:externalId|channelId)":"(UC[\w-]{20,})"/.exec(h) || /<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{20,})"/i.exec(h);
    let subscribers = null;
    if (data) {
        const sub = findKey(data, "subscriberCountText"); subscribers = textOf(sub);
        if (!subscribers) { const rows = findKey(data, "contentMetadataViewModel"); const s = JSON.stringify(rows || {}); const m = /"content":"([^"]*subscribers?)"/i.exec(s); if (m) subscribers = m[1]; }
    }
    const thumbs = meta && meta.avatar && meta.avatar.thumbnails;
    return {
        channelId: (meta && meta.externalId) || (idFromUrl && idFromUrl[1]) || null,
        name: (meta && meta.title) || decodeEntities((/<meta property="og:title" content="([^"]*)"/i.exec(h) || [])[1] || "") || null,
        description: (meta && meta.description) || decodeEntities((/<meta property="og:description" content="([^"]*)"/i.exec(h) || [])[1] || "") || null,
        handle: meta && meta.vanityChannelUrl ? String(meta.vanityChannelUrl).replace(/^.*\/(@[^/]+)$/, "$1") : null,
        subscribers, avatar: thumbs && thumbs.length ? thumbs[thumbs.length - 1].url : null, canonical,
    };
}

/** A video's watch page -> { lengthSeconds, keywords, category, isLive }, best effort (the player response JSON). */
export function parseWatchPage(html) {
    const h = String(html ?? ""), pr = jsonAfter(h, "ytInitialPlayerResponse"), d = pr ? findKey(pr, "videoDetails") : null;
    const micro = pr ? findKey(pr, "microformat") : null, cat = micro ? findKey(micro, "category") : null;
    const len = d && num(d.lengthSeconds) != null ? num(d.lengthSeconds) : (() => { const m = /"lengthSeconds":"(\d+)"/.exec(h); return m ? Number(m[1]) : null; })();
    return { lengthSeconds: len, keywords: d && Array.isArray(d.keywords) ? d.keywords.slice(0, 40) : [], category: typeof cat === "string" ? cat : null, isLive: !!(d && d.isLiveContent) };
}

/** Every http(s) URL in a text, in order, trailing punctuation and brackets trimmed, duplicates removed. */
export function extractLinks(text) {
    const seen = new Set(), out = [];
    for (const m of String(text ?? "").matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
        let u = m[0]; while (/[.,;:!?)\]}>'"*]$/.test(u)) u = u.slice(0, -1);
        if (u.length > 8 && !seen.has(u)) { seen.add(u); out.push(u); }
    }
    return out;
}

const RESERVED_OWNERS = new Set(["sponsors", "settings", "orgs", "features", "about", "pricing", "marketplace", "topics", "collections", "trending", "explore", "login", "join", "notifications", "pulls", "issues", "search", "enterprise", "customer-stories", "readme", "security", "apps", "new", "site", "contact", "premium-support", "events", "resources", "solutions", "team", "organizations", "codespaces", "copilot", "models"]);
const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_])?$|^[A-Za-z0-9]$/;
/** A github.com URL -> { kind: "repo", owner, repo, url } or { kind: "owner", owner, url }, or null when it is not a GitHub page about a person, an organisation or a repository. www. is accepted; a .git suffix and a sub-path are dropped. */
export function githubRepo(url) {
    let u; try { u = new URL(String(url)); } catch { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length || RESERVED_OWNERS.has(parts[0].toLowerCase()) || !NAME.test(parts[0])) return null;
    if (parts.length === 1) return { kind: "owner", owner: parts[0], url: "https://github.com/" + parts[0] };
    const repo = parts[1].replace(/\.git$/i, "");
    if (!NAME.test(repo)) return null;
    return { kind: "repo", owner: parts[0], repo, url: "https://github.com/" + parts[0] + "/" + repo };
}

const stamp = (t, h, m, s) => (h ? h * 3600 : 0) + m * 60 + s;
/** The chapters a description lists: lines that begin with a timestamp (m:ss or h:mm:ss) and a label. YouTube's own rule applies: the first is at 0:00 and there are at least three, else none. */
export function chapters(text) {
    const out = [];
    for (const line of String(text ?? "").split(/\r?\n/)) {
        const m = /^\s*(?:[-*•]\s*)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:)\]]*\s*(.+?)\s*$/.exec(line);
        if (!m || Number(m[3]) > 59 || (m[1] !== undefined && Number(m[2]) > 59)) continue;
        out.push({ t: stamp(0, m[1] === undefined ? 0 : Number(m[1]), Number(m[2]), Number(m[3])), label: m[4] });
    }
    return out.length >= 3 && out[0].t === 0 ? out : [];
}
/** Seconds -> "m:ss" or "h:mm:ss". */
export function clock(sec) { const s = Math.max(0, Math.floor(Number(sec) || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(r).padStart(2, "0"); }
/** 1234 -> "1.2K", 1500000 -> "1.5M", 999 -> "999"; null stays null. */
export function compactCount(n) { if (n == null || !Number.isFinite(Number(n))) return null; const v = Number(n); if (v < 1000) return String(v); const f = (x, u) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10) + u; return v < 1e6 ? f(v / 1e3, "K") : v < 1e9 ? f(v / 1e6, "M") : f(v / 1e9, "B"); }

/** A video with what its text says worked out: { ...v, repos: [{owner, repo, url}], owners: [{owner, url}], links: [other urls], chapters }. Repos are de-duplicated case-insensitively, in order of first mention. */
export function analyseVideo(v, extraText = "") {
    const urls = extractLinks((v.description || "") + "\n" + extraText), repos = [], owners = [], links = [], seen = new Set();
    for (const u of urls) {
        const g = githubRepo(u);
        if (g && g.kind === "repo") { const k = (g.owner + "/" + g.repo).toLowerCase(); if (!seen.has(k)) { seen.add(k); repos.push({ owner: g.owner, repo: g.repo, url: g.url }); } }
        else if (g) { const k = g.owner.toLowerCase(); if (!seen.has("o:" + k)) { seen.add("o:" + k); owners.push({ owner: g.owner, url: g.url }); } }
        else links.push(u);
    }
    return { ...v, repos, owners, links, chapters: chapters(v.description) };
}

/** The repositories a set of analysed videos name, each with the videos that name it: [{ owner, repo, url, count, videos: [{id, title, published}], first, last }], most-mentioned first, then most recent mention. */
export function repoIndex(videos) {
    const by = new Map();
    for (const v of videos) for (const r of v.repos || []) {
        const k = (r.owner + "/" + r.repo).toLowerCase(), e = by.get(k) || { owner: r.owner, repo: r.repo, url: r.url, count: 0, videos: [], first: null, last: null };
        e.count++; e.videos.push({ id: v.id, title: v.title, published: v.published });
        if (v.published && (!e.first || v.published < e.first)) e.first = v.published; if (v.published && (!e.last || v.published > e.last)) e.last = v.published;
        by.set(k, e);
    }
    return [...by.values()].sort((a, b) => b.count - a.count || String(b.last).localeCompare(String(a.last)) || (a.owner + a.repo).localeCompare(b.owner + b.repo));
}

export const FORMAT = "swek-channel-v1";
/**
 * One snapshot file. `feed` is parseFeed's result, `page` parseChannelPage's (or null), `details` a { videoId: parseWatchPage result } map (or {}), `extraLinks` the channel's own links. Every video is analysed.
 * `at` is the fetch time, passed in (this module has no clock). The channel's own name and id come from the feed when the page gave none.
 */
export function snapshotFrom({ handle, feed, page = null, details = {}, extraLinks = [], at }) {
    const videos = (feed.videos || []).map((v) => { const d = details[v.id] || {}; return analyseVideo({ ...v, lengthSeconds: d.lengthSeconds ?? null, keywords: d.keywords || [], category: d.category ?? null, url: "https://www.youtube.com/watch?v=" + v.id, firstSeen: at || null }); });
    const p = page || {};
    return {
        format: FORMAT, handle: handle || p.handle || null, fetchedAt: at || null,
        channel: { id: feed.channelId || p.channelId || null, name: p.name || feed.title || null, nameFrom: p.name ? "page" : "feed", description: p.description ?? null, subscribers: p.subscribers ?? null, avatar: p.avatar ?? null, url: feed.url || (feed.channelId ? "https://www.youtube.com/channel/" + feed.channelId : null), since: feed.published || null, links: extraLinks.map((u) => ({ url: u, github: githubRepo(u) })) },
        videos: videos.sort((a, b) => String(b.published).localeCompare(String(a.published))),
    };
}
/** Fold a new snapshot into an old one: a video seen before is kept (and refreshed by the new reading, with `firstSeen` carried), a new one is added; channel fields the new reading lacks are kept. Newest first. */
export function mergeSnapshots(prev, next) {
    if (!prev || prev.format !== FORMAT) return next;
    const by = new Map((prev.videos || []).map((v) => [v.id, v]));
    // a field the new reading did not provide (null, or the empty keyword list a run without --details leaves) does not erase what an earlier reading found; every other field is the new reading's
    const provided = (k, x) => !(x === null || x === undefined || (k === "keywords" && Array.isArray(x) && !x.length));
    for (const v of next.videos || []) { const old = by.get(v.id); by.set(v.id, { ...(old || {}), ...Object.fromEntries(Object.entries(v).filter(([k, x]) => provided(k, x))), firstSeen: (old && old.firstSeen) || next.fetchedAt || null }); }
    const keep = (a, b) => (b !== null && b !== undefined ? b : a);
    const c = {}; for (const k of new Set([...Object.keys(prev.channel || {}), ...Object.keys(next.channel || {})])) c[k] = keep((prev.channel || {})[k], (next.channel || {})[k]);
    // the feed's title is a stopgap name: a reading with no channel page must not replace the name an earlier reading took from the page itself
    if ((next.channel || {}).nameFrom === "feed" && (prev.channel || {}).nameFrom === "page") { c.name = prev.channel.name; c.nameFrom = "page"; }
    return { ...prev, ...next, channel: c, videos: [...by.values()].sort((a, b) => String(b.published).localeCompare(String(a.published))) };
}

/** What is wrong with a snapshot, as a list of strings (empty = sound). The page refuses an unsound one and says why. */
export function validateSnapshot(s) {
    const bad = [];
    if (!s || typeof s !== "object") return ["not an object"];
    if (s.format !== FORMAT) bad.push("format is " + JSON.stringify(s.format) + ", not " + FORMAT);
    if (!s.channel || typeof s.channel !== "object") bad.push("no channel");
    if (!Array.isArray(s.videos)) bad.push("no videos list"); else {
        const ids = new Set();
        s.videos.forEach((v, i) => { if (!v || !/^[\w-]{6,20}$/.test(v.id || "")) bad.push("video " + i + " has no valid id"); else if (ids.has(v.id)) bad.push("video " + v.id + " twice"); else ids.add(v.id); if (v && typeof v.title !== "string") bad.push("video " + i + " has no title"); });
    }
    return bad;
}

/** An href the page may put on a link: https only, to YouTube, GitHub or YouTube's image host; anything else (javascript:, data:, a look-alike host) is refused with null. */
export function safeHref(u) {
    let x; try { x = new URL(String(u)); } catch { return null; }
    if (x.protocol !== "https:") return null;
    const h = x.hostname.toLowerCase();
    return h === "youtube.com" || h === "www.youtube.com" || h === "m.youtube.com" || h === "youtu.be" || h === "github.com" || h === "www.github.com" || h === "i.ytimg.com" || h === "i1.ytimg.com" || h === "i2.ytimg.com" || h === "i3.ytimg.com" || h === "yt3.ggpht.com" || h === "gist.github.com" ? x.href : null;
}
