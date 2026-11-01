// WebGLEngine/tools/ship/channelPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/channelPage-selfcheck.mjs      (a real browser; no WebGPU needed; about 6 s)
//
// GATES channel.html -- a YouTube channel as a page: the channel header, the video grid with its search, sort and repo filter, the chapters and description each video opens, the player that replaces a thumbnail, and the
// index of GitHub repositories the videos name. The page renders a SNAPSHOT (data/channels/<slug>.json); this gate serves its own, built with ui/channelFeed.mjs, from a server that answers /data/channels/* itself, so no
// real snapshot in the tree (or the want of one) changes a row.
//
// THE FIXTURE IS HOSTILE ON PURPOSE: one title is `<img src=x onerror=...>`, one description holds a javascript: URL and a look-alike host (https://github.com.evil.example/x/y), because the page's rule is that everything from a
// snapshot is TEXT and every link passes safeHref. A page that used innerHTML would run the onerror; one that trusted a URL would link the javascript:.
//
// SABOTAGES, RESULTS BY NAME (each against channel.html, this gate run, restored identical):
//   P1 text set through innerHTML                                  -> 3 RED: the header row, the hostile-title row and the two-channels row (the name carries markup)
//   P2 links not passed through safeHref                           -> 1 RED: the hostile-links row (the javascript: and look-alike links come out)
//   P3 search reads titles only                                    -> 1 RED: the search row
//   P4 'most viewed' ascending                                     -> 1 RED: the sorting row
//   P5 the 'only videos naming a repo' filter ignored              -> 1 RED: the sorting-and-filtering row
//   P6 chapter links without &t=                                   -> 1 RED: the chapters row
//   P7 the ?src path check removed                                 -> 1 RED: the refusal row
//   P8 the repos tab in reverse order                              -> 1 RED: the repos row
//   P9 the embed taken from youtube.com, not youtube-nocookie.com  -> 1 RED: the player row
//   P10 the default channel the last in the index, not the first   -> 1 RED: the two-channels row
// THE FIRST RUN WENT 2 RED FOR REASONS IN THE PAGE AND THE GATE, NOT THE FIXTURE: the page's element builder flattened its children one level, so a view that returned a list holding a list rendered "[object HTMLDivElement]" (the repos tab was empty: flat(Infinity) now), and the gate's own expected view total was 124K where 124,965 rounds to 125K.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { LAUNCH_ARGS, SECURE_HOST, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { snapshotFrom, parseFeed } from "../../ui/channelFeed.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
console.log("channelPage-selfcheck -- a channel's videos, and the repos they name\n");

// ---- the fixture: five videos, built from feed text so the page is graded on what the parser makes of a feed
const entry = (id, pub, title, views, desc, extra = "") => `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><published>${pub}</published><media:group><media:thumbnail url="https://i.ytimg.com/vi/${id}/hqdefault.jpg"/><media:description>${desc}</media:description><media:community>${extra}<media:statistics views="${views}"/></media:community></media:group></entry>`;
const feedXml = `<feed xmlns:yt="y" xmlns:media="m" xmlns="a"><yt:channelId>UCfixturechannelid00000</yt:channelId><title>Fixture Channel</title><link rel="alternate" href="https://www.youtube.com/channel/UCfixturechannelid00000"/><published>2023-01-01T00:00:00+00:00</published>
${entry("vidAAAAAAA1", "2024-01-10T00:00:00+00:00", "Oldest: whisper demo", 900, "Code https://github.com/openai/whisper and https://github.com/SweK/SweK_Engine\\n0:00 Start\\n1:30 Middle\\n3:00 End".replace(/\\n/g, "&#10;"))}
${entry("vidBBBBBBB2", "2024-03-10T00:00:00+00:00", "Middle &lt;img src=x onerror=&quot;window.__xss=1&quot;&gt; markup", 120000, "Try javascript:alert(1) or https://github.com.evil.example/x/y and https://github.com/SweK/SweK_Engine/tree/main", "<media:starRating count=\"2500\" average=\"4.80\" min=\"1\" max=\"5\"/>")}
${entry("vidCCCCCCC3", "2024-05-10T00:00:00+00:00", "No repos in this one", 50, "Just talking. https://example.com/not-github")}
${entry("vidDDDDDDD4", "2024-07-10T00:00:00+00:00", "Newest: the other repo", 4000, "Source: https://github.com/other/thing.git")}
${entry("vidEEEEEEE5", "2024-06-10T00:00:00+00:00", "Fifth, one owner link only", 15, "Follow https://github.com/someorg for more")}</feed>`;
const snap = snapshotFrom({ handle: "@TheFixture", feed: parseFeed(feedXml), page: { name: "Fixture <b>Channel</b>", description: "Channel about https://github.com/SweK and more.", subscribers: "14K subscribers", avatar: null }, details: { vidAAAAAAA1: { lengthSeconds: 245, keywords: ["ai", "demo"] } }, extraLinks: ["https://github.com/SweK", "https://example.com"], at: "2026-10-25T00:00:00Z" });
const snap2 = { ...snap, handle: "@Second", channel: { ...snap.channel, name: "Second Channel" } };
let mode = "none";
const json = (res, o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
const skipWhy = webgpuSkipReason(require_);
if (skipWhy) { console.log("  ----  browser half SKIPPED -- " + skipWhy); console.log("  ----  *** THAT IS A SKIP AND NOT A PASS: nothing here rendered the page"); }
else {
    const server = http.createServer((q, s) => {
        const u = decodeURIComponent(q.url.split("?")[0]);
        if (u === "/__fixture/channel.json") return json(s, snap);
        if (u === "/__fixture/unsound.json") return json(s, { ...snap, format: "nope" });
        if (u === "/data/channels/index.json") return mode === "two" ? json(s, { format: "swek-channel-index-v1", channels: [{ slug: "first", file: "first.json", name: "Fixture Channel" }, { slug: "second", file: "second.json", name: "Second Channel" }] }) : json(s, {}, 404);
        if (u === "/data/channels/first.json") return json(s, snap);
        if (u === "/data/channels/second.json") return json(s, snap2);
        const f = path.join(ENG, u);
        if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(s); } else { s.writeHead(404); s.end(); }
    });
    await new Promise((r) => server.listen(0, SECURE_HOST, r));
    const pw = resolvePlaywright(require_), browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
    const base = `http://${SECURE_HOST}:${server.address().port}`;
    try {
        const open = async (url, wait = "#name, #err") => { const p = await browser.newPage({ viewport: { width: 1100, height: 900 } }), errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200))); await p.goto(base + url); await p.waitForSelector(wait, { timeout: 15000 }); return { p, errs }; };
        const { p, errs } = await open("/channel.html?src=/__fixture/channel.json");
        const H = await p.evaluate(() => ({ name: document.getElementById("name").textContent, head: document.querySelector("header.ch").textContent, cards: [...document.querySelectorAll("article.card")].map((c) => c.dataset.id), count: document.getElementById("count").textContent, title: document.title }));
        ok("!! the header: the channel's name shown as TEXT (its <b> tags are visible characters, not bold), the handle, the subscriber count in the page's words, five videos, a view total (125K, the 124,965 rounded) and the repo count", H.name === "Fixture <b>Channel</b>" && /@TheFixture/.test(H.head) && /14K\s*subscribers/.test(H.head) && /5\s*videos/.test(H.head) && /125K\s*views/.test(H.head) && /3\s*GitHub repos/.test(H.head), H.head.replace(/\s+/g, " ").slice(0, 150));
        ok("five video cards, newest first (the feed's own order was not date order: the page sorts)", eq(H.cards, ["vidDDDDDDD4", "vidEEEEEEE5", "vidCCCCCCC3", "vidBBBBBBB2", "vidAAAAAAA1"]) && H.count === "5 of 5 videos", H.cards.join(","));
        const X = await p.evaluate(() => ({ xss: window.__xss === undefined, imgInTitle: document.querySelectorAll("article h3 img").length, title: document.querySelector('article[data-id="vidBBBBBBB2"] h3').textContent, js: document.querySelectorAll('a[href^="javascript"]').length, lookalike: [...document.querySelectorAll("a")].filter((a) => /evil\.example/.test(a.href)).length, hrefs: [...document.querySelectorAll("a")].map((a) => a.href).filter((h) => !/^https:\/\/(www\.)?(youtube|github)\.com\//.test(h) && !/^https:\/\/i\.ytimg\.com/.test(h)) }));
        ok("!! A HOSTILE TITLE AND HOSTILE LINKS ARE ONLY TEXT: the <img onerror> title shows its markup as characters and runs nothing, no javascript: link and no look-alike GitHub host was made into a link, and every link on the page goes to YouTube or GitHub", X.xss && X.imgInTitle === 0 && /<img src=x onerror=/.test(X.title) && X.js === 0 && X.lookalike === 0 && X.hrefs.length === 0, JSON.stringify(X.hrefs.slice(0, 3)));
        const C = await p.evaluate(() => { const c = document.querySelector('article[data-id="vidBBBBBBB2"]'); return { chips: [...c.querySelectorAll("a.chip")].map((a) => [a.textContent, a.href, a.target, a.rel]), meta: c.querySelector(".meta").textContent }; });
        ok("a video's repo chips: SweK/SweK_Engine (the .../tree/main URL reduced to the repo) as a GitHub link that opens in a new tab with noopener; the look-alike host is not a chip; the views and the star rating are shown", C.chips.length === 1 && C.chips[0][0] === "SweK/SweK_Engine" && C.chips[0][1] === "https://github.com/SweK/SweK_Engine" && C.chips[0][2] === "_blank" && /noopener/.test(C.chips[0][3]) && /120K views/.test(C.meta) && /4\.8/.test(C.meta), JSON.stringify(C));
        const A = await p.evaluate(() => { const c = document.querySelector('article[data-id="vidAAAAAAA1"]'); c.querySelector("details").open = true; return { dur: c.querySelector(".dur") && c.querySelector(".dur").textContent, chap: [...c.querySelectorAll("ol.chap li")].map((li) => [li.textContent, li.querySelector("a").href]), tags: /tags: ai, demo/.test(c.textContent), summary: c.querySelector("summary").textContent }; });
        ok("!! chapters and details: the duration badge (245 s is 4:05), three chapters each linking to the video at its second (1:30 is &t=90s), the tags, and a summary that counts the chapters", A.dur === "4:05" && A.chap.length === 3 && A.chap[1][1] === "https://www.youtube.com/watch?v=vidAAAAAAA1&t=90s" && A.tags && /3 chapters/.test(A.summary), JSON.stringify(A.chap[1]));
        await p.click('article[data-id="vidAAAAAAA1"] .thumb button');
        const PL = await p.evaluate(() => { const f = document.querySelector('article[data-id="vidAAAAAAA1"] iframe'); return f && f.src; });
        ok("clicking a thumbnail swaps in the player: the no-cookie embed of THAT video, autoplaying", PL && PL.startsWith("https://www.youtube-nocookie.com/embed/vidAAAAAAA1?") && /autoplay=1/.test(PL), PL);
        await p.fill("#q", "whisper"); const S1 = await p.evaluate(() => [...document.querySelectorAll("article.card")].map((c) => c.dataset.id));
        ok("search reads titles, descriptions AND repo names: 'whisper' finds the video whose title has it, and 'other/thing' finds the video that names that repo only in its description", eq(S1, ["vidAAAAAAA1"]) && await (async () => { await p.fill("#q", "other/thing"); return eq(await p.evaluate(() => [...document.querySelectorAll("article.card")].map((c) => c.dataset.id)), ["vidDDDDDDD4"]); })());
        await p.fill("#q", ""); await p.selectOption("#sort", "views"); const S2 = await p.evaluate(() => [...document.querySelectorAll("article.card")].map((c) => c.dataset.id));
        await p.selectOption("#sort", "old"); const S3 = await p.evaluate(() => [...document.querySelectorAll("article.card")].map((c) => c.dataset.id));
        await p.selectOption("#sort", "new"); await p.check("#onlyRepos"); const S4 = await p.evaluate(() => ({ ids: [...document.querySelectorAll("article.card")].map((c) => c.dataset.id), count: document.getElementById("count").textContent }));
        ok("!! sorting and filtering: most viewed puts the 120K video first, oldest first reverses the date order, and 'only videos naming a repo' leaves the three that name one (the owner-link-only and no-link videos go) with the count saying 3 of 5", S2[0] === "vidBBBBBBB2" && S2[1] === "vidDDDDDDD4" && S3[0] === "vidAAAAAAA1" && S3[4] === "vidDDDDDDD4" && eq(S4.ids, ["vidDDDDDDD4", "vidBBBBBBB2", "vidAAAAAAA1"]) && S4.count === "3 of 5 videos", JSON.stringify([S2.slice(0, 2), S4]));
        await p.click("#tab-repos");
        const R = await p.evaluate(() => [...document.querySelectorAll(".repo")].map((r) => ({ repo: r.dataset.repo, href: r.querySelector("h3 a").href, text: r.querySelector(".meta").textContent, vids: [...r.querySelectorAll("li a")].map((a) => a.href.split("v=")[1]) })));
        ok("!! the repos tab: SweK/SweK_Engine first (named in two videos, with both), then openai/whisper and other/thing (one each); the owner-only link and the look-alike are not repos; each links to its GitHub page", R.length === 3 && R[0].repo === "SweK/SweK_Engine" && R[0].href === "https://github.com/SweK/SweK_Engine" && /named in 2 videos/.test(R[0].text) && eq(R[0].vids.sort(), ["vidAAAAAAA1", "vidBBBBBBB2"]) && R.map((r) => r.repo).includes("openai/whisper") && R.map((r) => r.repo).includes("other/thing") && !R.some((r) => /someorg|evil/.test(r.repo)), JSON.stringify(R.map((r) => r.repo)));
        await p.click("#tab-about");
        const AB = await p.evaluate(() => ({ desc: document.getElementById("about").textContent, links: [...document.querySelectorAll("#view a")].map((a) => a.href), text: document.getElementById("view").textContent }));
        ok("the about tab: the channel's description with its GitHub link made a link, the links the channel gives, the GitHub people named (SweK, someorg), and a provenance note saying how many videos and when", /Channel about/.test(AB.desc) && AB.links.includes("https://github.com/SweK") && AB.links.includes("https://github.com/someorg") && /5 videos taken 2026-10-25/.test(AB.text));
        ok("no page error through any of that", errs.length === 0, errs.join(" | "));
        await p.close();

        const bad1 = await open("/channel.html?src=//evil.example/x.json", "#err"), E1 = await bad1.p.evaluate(() => document.getElementById("err").textContent); await bad1.p.close();
        const bad2 = await open("/channel.html?src=/__fixture/unsound.json", "#err"), E2 = await bad2.p.evaluate(() => document.getElementById("err").textContent); await bad2.p.close();
        const none = await open("/channel.html", "#err"), E3 = await none.p.evaluate(() => document.getElementById("err").textContent); await none.p.close();
        ok("!! what the page refuses, and says: a ?src that is not a path on this site, a snapshot with the wrong format (named), and no snapshot at all (the command to make one is printed)", /path on this site/.test(E1) && /format is "nope"/.test(E2) && /takeYoutubeChannel\.mjs --handle TheNextNewThingAI/.test(E3), JSON.stringify([E1.slice(0, 50), E2.slice(0, 60), E3.slice(0, 60)]));

        mode = "two";
        const two = await open("/channel.html?c=second"), N2 = await two.p.evaluate(() => document.getElementById("name").textContent); await two.p.close();
        const def = await open("/channel.html"), N1 = await def.p.evaluate(() => document.getElementById("name").textContent); await def.p.close();
        ok("with two channels in the index, ?c=second picks the second and the default is the first (SweK Engine's own channel will be a second entry beside the template)", N2 === "Second Channel" && N1 === "Fixture <b>Channel</b>", JSON.stringify([N1, N2]));
    } finally { await browser.close(); server.close(); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
console.log(`\nchannelPage-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here: the page against a REAL snapshot of a real channel (this sandbox cannot reach YouTube; run tools/ship/takeYoutubeChannel.mjs where you can, then open channel.html), and a real iframe player (the embed is only checked to be asked for, not to play).");
process.exit(fails === 0 ? 0 : 1);
