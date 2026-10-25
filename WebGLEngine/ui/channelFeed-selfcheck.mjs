// WebGLEngine/ui/channelFeed-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node ui/channelFeed-selfcheck.mjs      (about 0.1 s: pure functions over fixtures)
//
// GATES ui/channelFeed.mjs -- a YouTube channel as data: the RSS feed's videos, the channel page's self-description, the GitHub repositories the videos name, the chapters, and the snapshot file channel.html renders.
//
// *** THE FIXTURES ARE SYNTHETIC, AND THAT IS THE LIMIT OF THIS GATE. *** They are built from YouTube's documented feed shape (feed > yt:channelId, title, entry > yt:videoId, published, media:group > media:description,
// media:thumbnail, media:community > media:starRating, media:statistics) and a channel page that carries a `var ytInitialData = {...}` blob. THIS SANDBOX CANNOT REACH YOUTUBE (the proxy refuses it and DNS fails), so no live feed
// has been parsed by this file. What it grades is that the parser does what it says on a feed of that shape, including the traps (entities, CDATA, braces inside JSON strings, look-alike GitHub URLs); whether YouTube has
// reshaped its pages since is what the first run of tools/ship/takeYoutubeChannel.mjs on a machine that can reach it will say, and it refuses an empty parse rather than writing one.
//
// *** THE FIRST LIVE RUN HAPPENED, 2026-10-25, ON THE USER'S MACHINE (this sandbox still cannot reach YouTube): `takeYoutubeChannel.mjs --handle TheNextNewThingAI --details` wrote data/channels/thenextnewthingai.json: 15 videos, every one with its
// duration and view count, 10 with chapters, 34 distinct GitHub repositories named, the channel's id, name, avatar and first-published date. TWO THINGS THE LIVE PAGES DID NOT GIVE, and the page shows neither rather than inventing them: the SUBSCRIBER
// COUNT (null: the channel page carried no subscriber text this parser could find) and each video's KEYWORDS (empty on all 15). Section 8 below holds that snapshot, and any other in the tree, to the format. ***
//
// SABOTAGES, RESULTS BY NAME (each against ui/channelFeed.mjs, this gate run, restored identical):
//   L1 the reserved GitHub owners (sponsors, settings, orgs, ...) no longer refused               -> 1 RED: the not-a-repository row
//   L2 chapters no longer required to start at 0:00                                                -> 1 RED: the chapter-rules row
//   L3 safeHref no longer requires https                                                           -> 1 RED: the safeHref row
//   L4 mergeSnapshots starts from an empty map (replaces rather than merges)                       -> 2 RED: the merge row and the field-survival row
//   L5 jsonAfter toggles on every quote and ignores the backslash (a brace inside a string counts) -> 1 RED: the channel-page row (it went UNSEEN the first time: the description's escaped quotes came in pairs, and an odd one with a brace after it was added)
//   L6 numeric entities not decoded                                                                -> 1 RED: the entity row
//   L7 an entry whose video id is the wrong shape is kept                                          -> 5 RED: the two-videos row, and every row downstream of a bad id (UNSEEN the first time: the fixture only had an EMPTY id)
//   L8 repoIndex keys on the case as written                                                       -> 1 RED: the index row (UNSEEN the first time: no fixture spelled a repo two ways)
//   L9 firstSeen taken from the newest reading, not the first                                      -> 1 RED: the field-survival row
//   L10 any host ending in github.com accepted (evilgithub.com)                                    -> 1 RED: the not-a-repository row
//   L11 a repo name under four characters refused (github.com/morluto/rea is real)                 -> 1 RED: the real-snapshot row (section 8: the file's repos no longer reproduce)
"use strict";
import * as C from "./channelFeed.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log("channelFeed-selfcheck -- a channel's videos and the repositories they name\n");

console.log("1. ENTITIES AND THE FEED");
ok("entities decode: the five named, decimal and hex references, and an unknown name is left as written", C.decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41;&#66; &bogus; &#0;") === "a & b <c> \"d\" 'e' AB &bogus; &#0;");
const D1 = "Building the thing.\nCode: https://github.com/SweK/SweK_Engine, and https://github.com/openai/whisper.git.\n\n0:00 Intro\n1:30 The demo\n12:05 Wrap up\nSee https://example.com/page?a=1&b=2";
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCtestchannelid0000000"/>
 <id>yt:channel:testchannelid0000000</id><yt:channelId>UCtestchannelid0000000</yt:channelId>
 <title>The Test &amp; Channel</title><link rel="alternate" href="https://www.youtube.com/channel/UCtestchannelid0000000"/>
 <author><name>The Test &amp; Channel</name></author><published>2023-02-01T10:00:00+00:00</published>
 <entry><id>yt:video:aaaaaaaaaaa</id><yt:videoId>aaaaaaaaaaa</yt:videoId><title>First &quot;one&quot;</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=aaaaaaaaaaa"/><published>2024-03-01T12:00:00+00:00</published><updated>2024-03-02T12:00:00+00:00</updated>
  <media:group><media:title>First</media:title><media:thumbnail url="https://i2.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg" width="480" height="360"/>
   <media:description>${D1.replace(/&/g, "&amp;")}</media:description>
   <media:community><media:starRating count="42" average="4.90" min="1" max="5"/><media:statistics views="12345"/></media:community></media:group></entry>
 <entry><id>yt:video:bbbbbbbbbbb</id><yt:videoId>bbbbbbbbbbb</yt:videoId><title><![CDATA[Second <b> & more]]></title>
  <published>2024-05-01T12:00:00+00:00</published><updated>2024-05-01T12:00:00+00:00</updated>
  <media:group><media:thumbnail url="https://i2.ytimg.com/vi/bbbbbbbbbbb/hqdefault.jpg"/><media:description>no links here</media:description>
   <media:community><media:statistics views="7"/></media:community></media:group></entry>
 <entry><id>yt:video:</id><yt:videoId></yt:videoId><title>no id</title></entry>
 <entry><id>yt:video:x</id><yt:videoId>bad id!</yt:videoId><title>a malformed id</title></entry>
</feed>`;
const F = C.parseFeed(feed);
ok("the channel header: id, title (entity decoded), alternate link, first-published", F.channelId === "UCtestchannelid0000000" && F.title === "The Test & Channel" && F.url === "https://www.youtube.com/channel/UCtestchannelid0000000" && F.published === "2023-02-01T10:00:00+00:00", JSON.stringify([F.channelId, F.title]));
ok("!! two videos, and the entry with no video id and the one with a malformed id are dropped (a feed row that is not a video is not a video)", F.videos.length === 2 && F.videos[0].id === "aaaaaaaaaaa" && F.videos[1].id === "bbbbbbbbbbb");
const v1 = F.videos[0], v2 = F.videos[1];
ok("a video: title decoded, published, thumbnail, views and star rating as numbers, the FULL description with its newlines", v1.title === 'First "one"' && v1.published === "2024-03-01T12:00:00+00:00" && v1.thumbnail === "https://i2.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg" && v1.views === 12345 && v1.ratingCount === 42 && v1.rating === 4.9 && v1.description.split("\n").length === 7);
ok("a CDATA title keeps its angle brackets as text, and a video with no star rating has none rather than zero", v2.title === "Second <b> & more" && v2.views === 7 && v2.ratingCount === null && v2.rating === null);
ok("a feed that is not a feed parses to nothing and does not throw", C.parseFeed("<html>nope</html>").videos.length === 0 && C.parseFeed(null).videos.length === 0 && C.parseFeed("").channelId === null);

console.log("\n2. GITHUB LINKS: REPOS, OWNERS, AND WHAT IS NEITHER");
const g = (u) => C.githubRepo(u);
ok("!! a repository in each of its common shapes is the same repository: plain, www, .git, a tree and a blob path, an issue, a hash, a query, a trailing slash", [
    "https://github.com/SweK/SweK_Engine", "https://www.github.com/SweK/SweK_Engine", "https://github.com/SweK/SweK_Engine.git", "https://github.com/SweK/SweK_Engine/tree/main/docs",
    "https://github.com/SweK/SweK_Engine/blob/main/README.md#intro", "https://github.com/SweK/SweK_Engine/issues/12", "https://github.com/SweK/SweK_Engine?tab=readme-ov-file", "https://github.com/SweK/SweK_Engine/", "http://github.com/SweK/SweK_Engine"].every((u) => { const r = g(u); return r && r.kind === "repo" && r.owner === "SweK" && r.repo === "SweK_Engine" && r.url === "https://github.com/SweK/SweK_Engine"; }));
const o = g("https://github.com/openai");
ok("a bare owner is an OWNER link, kept apart from repos", o && o.kind === "owner" && o.owner === "openai" && o.url === "https://github.com/openai");
ok("!! what is not a repository is refused: sponsors, settings, orgs, features, topics, a look-alike host, another scheme, no path, an invalid name", ["https://github.com/sponsors/someone", "https://github.com/settings/profile", "https://github.com/orgs/x/people", "https://github.com/features/copilot", "https://github.com/topics/webgpu",
    "https://github.com.evil.example/a/b", "https://evilgithub.com/a/b", "https://notgithub.com/a/b", "ftp://github.com/a/b", "https://github.com/", "https://github.com", "https://github.com/-bad/repo", "https://github.com/a/b c", "javascript:alert(1)", "not a url", ""].every((u) => g(u) === null));
ok("links come out of text in order, trailing punctuation and brackets trimmed, duplicates once", eq(C.extractLinks("see (https://a.com/x), https://b.com/y. And https://a.com/x again; <https://c.com/z>!"), ["https://a.com/x", "https://b.com/y", "https://c.com/z"]));

console.log("\n3. CHAPTERS");
ok("!! chapters need three or more, starting at 0:00: this description's three are read, with m:ss and h:mm:ss", eq(C.chapters(D1), [{ t: 0, label: "Intro" }, { t: 90, label: "The demo" }, { t: 725, label: "Wrap up" }]) && eq(C.chapters("0:00 a\n59:59 b\n1:00:00 c\n1:02:03 - d"), [{ t: 0, label: "a" }, { t: 3599, label: "b" }, { t: 3600, label: "c" }, { t: 3723, label: "d" }]));
ok("two timestamps are not chapters; neither is a list that does not start at 0:00; a bullet and a dash are tolerated; 1:75 is not a time", eq(C.chapters("0:00 a\n1:00 b"), []) && eq(C.chapters("0:10 a\n1:00 b\n2:00 c"), []) && eq(C.chapters("- 0:00 a\n* 0:30 b\n• 1:00 c").map((c) => c.t), [0, 30, 60]) && eq(C.chapters("0:00 a\n1:75 b\n2:00 c\n3:00 d").map((c) => c.t), [0, 120, 180]));
ok("time reads back: 0 is 0:00, 725 is 12:05, 3723 is 1:02:03; counts are compact (999, 1.2K, 12K, 1.5M) and an absent count stays absent", C.clock(0) === "0:00" && C.clock(725) === "12:05" && C.clock(3723) === "1:02:03" && C.compactCount(999) === "999" && C.compactCount(1234) === "1.2K" && C.compactCount(12345) === "12K" && C.compactCount(1500000) === "1.5M" && C.compactCount(null) === null);

console.log("\n4. A VIDEO'S REPOSITORIES, AND THE INDEX OVER THEM");
const A1 = C.analyseVideo(v1), A2 = C.analyseVideo(v2);
ok("!! a description's two repos are found (the .git one trimmed to the repo), in order of first mention, and the other link is kept apart", eq(A1.repos.map((r) => r.owner + "/" + r.repo), ["SweK/SweK_Engine", "openai/whisper"]) && eq(A1.links, ["https://example.com/page?a=1&b=2"]) && A1.owners.length === 0);
ok("a repo named twice with different case or shape is ONE repo, and an owner link does not become a repo", C.analyseVideo({ description: "https://github.com/A/B https://github.com/a/b/tree/x https://GitHub.com/a/B.git https://github.com/zed" }).repos.length === 1 && C.analyseVideo({ description: "https://github.com/zed" }).owners.length === 1 && C.analyseVideo({ description: "https://github.com/zed" }).repos.length === 0);
const V = [A1, A2, C.analyseVideo({ id: "ccccccccccc", title: "Third", published: "2024-06-01T00:00:00+00:00", description: "again https://github.com/sWeK/SWEK_ENGINE/issues/1" })];
const R = C.repoIndex(V);
ok("!! the index names each repo with the videos that name it, most-mentioned first: SweK_Engine in two videos (one of them spelling it sWeK/SWEK_ENGINE, and the first mention's spelling is kept), whisper in one", R.length === 2 && R[0].repo === "SweK_Engine" && R[0].owner === "SweK" && R[0].count === 2 && eq(R[0].videos.map((v) => v.id), ["aaaaaaaaaaa", "ccccccccccc"]) && R[1].repo === "whisper" && R[1].count === 1 && R[0].last === "2024-06-01T00:00:00+00:00" && R[0].first === "2024-03-01T12:00:00+00:00");

console.log("\n5. THE SNAPSHOT: BUILT, VALIDATED, MERGED");
const S1 = C.snapshotFrom({ handle: "@TheTest", feed: F, page: { name: "The Test Channel", description: "About.", subscribers: "1.2K subscribers" }, details: { aaaaaaaaaaa: { lengthSeconds: 725, keywords: ["ai", "webgpu"], category: "Science & Technology" } }, extraLinks: ["https://github.com/SweK", "https://example.com"], at: "2026-10-25T00:00:00Z" });
ok("a snapshot: the format tag, the handle, the page's name over the feed's, newest video first, the watch-page details on the video they belong to, the channel links with their GitHub reading", S1.format === "swek-channel-v1" && S1.handle === "@TheTest" && S1.channel.name === "The Test Channel" && S1.channel.id === "UCtestchannelid0000000" && S1.channel.subscribers === "1.2K subscribers" && S1.videos[0].id === "bbbbbbbbbbb" && S1.videos[1].lengthSeconds === 725 && eq(S1.videos[1].keywords, ["ai", "webgpu"]) && S1.channel.links[0].github.kind === "owner" && S1.channel.links[1].github === null && S1.videos[1].url === "https://www.youtube.com/watch?v=aaaaaaaaaaa");
ok("!! a sound snapshot validates clean, and each defect is named: the wrong format, a video twice, a bad id, no title, no videos list", eq(C.validateSnapshot(S1), []) && C.validateSnapshot({ ...S1, format: "x" })[0].startsWith("format") && C.validateSnapshot({ ...S1, videos: [S1.videos[0], S1.videos[0]] }).some((m) => /twice/.test(m)) && C.validateSnapshot({ ...S1, videos: [{ id: "!", title: "t" }] }).some((m) => /valid id/.test(m)) && C.validateSnapshot({ ...S1, videos: [{ id: "aaaaaaaaaaa" }] }).some((m) => /title/.test(m)) && C.validateSnapshot({ ...S1, videos: null }).some((m) => /videos list/.test(m)) && C.validateSnapshot(null).length === 1);
const feed2 = C.parseFeed(feed.replace('<media:statistics views="12345"/>', '<media:statistics views="20000"/>').replace("</feed>", `<entry><yt:videoId>ddddddddddd</yt:videoId><title>Newest</title><published>2024-09-01T00:00:00+00:00</published><media:group><media:description>https://github.com/new/thing</media:description></media:group></entry></feed>`));
const S2 = C.snapshotFrom({ handle: "@TheTest", feed: { ...feed2, videos: feed2.videos.filter((v) => v.id !== "bbbbbbbbbbb") }, page: null, at: "2026-11-01T00:00:00Z" });
const M = C.mergeSnapshots(S1, S2);
ok("!! MERGING keeps a video the new feed no longer lists (bbbbbbbbbbb fell off the 15 newest), adds the new one, refreshes a count, and orders newest first", eq(M.videos.map((v) => v.id), ["ddddddddddd", "bbbbbbbbbbb", "aaaaaaaaaaa"]) && M.videos.find((v) => v.id === "aaaaaaaaaaa").views === 20000);
ok("a field the new reading lacks does not erase the old: the watch-page duration and keywords survive a run without details, the channel's name and subscriber count survive a run with no channel page, and firstSeen is the FIRST reading's (the old video keeps 2026-10-25, the new one has 2026-11-01)", M.videos.find((v) => v.id === "aaaaaaaaaaa").lengthSeconds === 725 && eq(M.videos.find((v) => v.id === "aaaaaaaaaaa").keywords, ["ai", "webgpu"]) && M.channel.name === "The Test Channel" && M.channel.subscribers === "1.2K subscribers" && M.videos.find((v) => v.id === "aaaaaaaaaaa").firstSeen === "2026-10-25T00:00:00Z" && M.videos.find((v) => v.id === "ddddddddddd").firstSeen === "2026-11-01T00:00:00Z" && eq(C.validateSnapshot(M), []) && C.mergeSnapshots(null, S2) === S2 && C.mergeSnapshots({ format: "x" }, S2) === S2);
ok("merging a snapshot into itself changes nothing a reader can see (same ids, same order, same repos)", (() => { const T = C.mergeSnapshots(S1, S1); return eq(T.videos.map((v) => v.id), S1.videos.map((v) => v.id)) && eq(C.repoIndex(T.videos).map((r) => r.repo + r.count), C.repoIndex(S1.videos).map((r) => r.repo + r.count)); })());

ok("findKey finds the first value stored under a key anywhere in a parsed tree (depth first), undefined when absent, and does not loop on a cycle; FORMAT is the tag the files carry", C.findKey({ a: [{ b: { k: 1 } }, { k: 2 }] }, "k") === 1 && C.findKey({ a: 1 }, "k") === undefined && (() => { const o = { x: {} }; o.x.self = o; return C.findKey(o, "k") === undefined; })() && C.FORMAT === "swek-channel-v1");
console.log("\n6. THE CHANNEL PAGE AND THE WATCH PAGE (SYNTHETIC BLOBS, BRACES AND ESCAPES INSIDE THEIR STRINGS)");
const blob = { header: { pageHeaderRenderer: { content: { x: { subscriberCountText: { simpleText: "14K subscribers" } } } } }, metadata: { channelMetadataRenderer: { title: "Next {Thing} \"AI\"", description: "Videos about } AI { and \\ more \"quoted} tail", externalId: "UCtestchannelid0000000", vanityChannelUrl: "http://www.youtube.com/@TheTest", avatar: { thumbnails: [{ url: "https://yt3.ggpht.com/small" }, { url: "https://yt3.ggpht.com/large" }] } } } };
const page = `<html><head><link rel="canonical" href="https://www.youtube.com/channel/UCtestchannelid0000000"><meta property="og:title" content="Fallback &amp; name"></head><body><script>var ytInitialData = ${JSON.stringify(blob)};</script><script>var other = {"a":1};</script></body></html>`;
const P = C.parseChannelPage(page);
ok("!! the channel page: name and description survive braces, quotes and a backslash inside their strings; id, handle, subscribers in the page's words, and the LARGEST avatar", P.name === 'Next {Thing} "AI"' && P.description === "Videos about } AI { and \\ more \"quoted} tail" && P.channelId === "UCtestchannelid0000000" && P.handle === "@TheTest" && P.subscribers === "14K subscribers" && P.avatar === "https://yt3.ggpht.com/large", JSON.stringify(P).slice(0, 160));
const P2 = C.parseChannelPage('<html><link rel="canonical" href="https://www.youtube.com/channel/UCtestchannelid0000000"><meta property="og:title" content="Fallback &amp; name"></html>');
ok("with no data blob the page still gives its canonical id and its og:title, and the rest is null (never invented)", P2.channelId === "UCtestchannelid0000000" && P2.name === "Fallback & name" && P2.subscribers === null && P2.avatar === null && C.parseChannelPage("").name === null && C.jsonAfter("var x = {unbalanced", "var x") === null);
const W = C.parseWatchPage(`<script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { lengthSeconds: "725", keywords: ["a", "b"], isLiveContent: false }, microformat: { playerMicroformatRenderer: { category: "Education" } } })};</script>`);
ok("a watch page: duration in seconds, keywords, category; and a page with only the bare field still gives the duration", W.lengthSeconds === 725 && eq(W.keywords, ["a", "b"]) && W.category === "Education" && W.isLive === false && C.parseWatchPage('x"lengthSeconds":"61"x').lengthSeconds === 61 && C.parseWatchPage("").lengthSeconds === null);

console.log("\n7. WHICH LINKS THE PAGE MAY OPEN");
ok("!! safeHref allows https to YouTube, GitHub and their image hosts and nothing else: javascript:, data:, http, a look-alike host, a subdomain trick and a non-URL are all null", ["https://www.youtube.com/watch?v=x", "https://youtu.be/x", "https://github.com/a/b", "https://i.ytimg.com/vi/x/hq.jpg", "https://yt3.ggpht.com/a"].every((u) => C.safeHref(u) === new URL(u).href) && ["javascript:alert(1)", "data:text/html,x", "http://www.youtube.com/x", "https://youtube.com.evil.example/x", "https://evil.example/youtube.com", "https://github.com@evil.example/x", "//youtube.com/x", "nonsense", null, undefined].every((u) => C.safeHref(u) === null));

console.log("\n8. ANY REAL SNAPSHOT IN THE TREE (data/channels/*.json), HELD TO THE FORMAT -- no counts, since a re-run grows the file");
{
    const fs = await import("node:fs"), path = await import("node:path"), { fileURLToPath } = await import("node:url");
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "channels"), files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json") : [];
    const idx = fs.existsSync(path.join(dir, "index.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")) : { channels: [] };
    ok("the channel index lists exactly the snapshot files that exist, each with a file name that is a plain .json in the folder", eq(idx.channels.map((c) => c.file).sort(), files.slice().sort()) && idx.channels.every((c) => /^[\w-]+\.json$/.test(c.file)), files.join(", ") || "(no snapshots yet)");
    for (const f of files) {
        const snap = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), bad = C.validateSnapshot(snap), repos = C.repoIndex(snap.videos);
        ok("!! " + f + " is a sound swek-channel-v1 snapshot: it validates clean, every video has a title, a published date and a https youtube.com URL, every repo it names is a repo githubRepo accepts, and re-analysing a video's description reproduces its repos and chapters (the file and the parser agree)",
            bad.length === 0 && snap.videos.every((v) => v.title && !Number.isNaN(Date.parse(v.published)) && C.safeHref(v.url) === v.url) && repos.every((r) => { const g = C.githubRepo(r.url); return g && g.kind === "repo"; }) &&
            snap.videos.every((v) => { const a = C.analyseVideo(v); return eq(a.repos, v.repos) && eq(a.chapters, v.chapters); }), bad.join("; ") + " (" + snap.videos.length + " videos, " + repos.length + " repos)");
    }
}

console.log(`\nchannelFeed-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here: a LIVE YouTube feed, channel page or watch page (this sandbox cannot reach YouTube) -- tools/ship/takeYoutubeChannel.mjs refuses an empty parse, and its first run on a machine that can reach it is the check.");
process.exit(fails === 0 ? 0 : 1);
