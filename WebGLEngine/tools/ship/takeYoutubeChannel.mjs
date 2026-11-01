// WebGLEngine/tools/ship/takeYoutubeChannel.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/takeYoutubeChannel.mjs --handle TheNextNewThingAI [--details] [--links <url,url>] [--out data/channels] [--slug name]
//      node tools/ship/takeYoutubeChannel.mjs --handle X --feed-file feed.xml --page-file page.html      (offline: parse files you saved, for a machine that cannot reach YouTube)
//
// THE COMMAND FOR ui/channelFeed.mjs: it reads a YouTube channel's PUBLIC pages (the @handle page for the channel id and what the channel says about itself, the RSS feed for the newest 15 videos with their full descriptions,
// and with --details each video's watch page for its duration and tags) and writes data/channels/<slug>.json, which channel.html renders, and data/channels/index.json, the list of channels the page offers. NO EXPORTS ON PURPOSE
// (the library is held by this file and the page, and graded by ui/channelFeed-selfcheck.mjs). No API key, no login. Run it again after each upload: the file is MERGED, so it grows past the feed's 15.
// THE SANDBOX THIS WAS WRITTEN IN CANNOT REACH YOUTUBE, so the first run on a machine that can is the first live parse; the command REFUSES an empty parse (a channel with no videos, a feed that is not a feed, a consent
// wall) rather than writing a file that says the channel is empty. Exit 0 wrote the file, 1 a refused parse or a failed fetch, 2 a bad argument.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrExit } from "./cliArgs.mjs";
import { parseFeed, parseChannelPage, parseWatchPage, snapshotFrom, mergeSnapshots, validateSnapshot, extractLinks, FORMAT } from "../../ui/channelFeed.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = parseOrExit("takeYoutubeChannel", { values: { "--handle": "string", "--channel-id": "string", "--out": "path", "--slug": "string", "--links": "string", "--feed-file": "path", "--page-file": "path", "--delay": "number" }, flags: ["--details"] });
const handle = (cli.values["--handle"] || "").replace(/^@/, ""), given = cli.values["--channel-id"] || null;
if (!handle && !given) { console.error("[takeYoutubeChannel] --handle (the @name of the channel) or --channel-id (UC...) is needed"); process.exit(2); }
if (given && !/^UC[\w-]{20,}$/.test(given)) { console.error("[takeYoutubeChannel] --channel-id wants the UC... id, 24 characters"); process.exit(2); }
if (handle && !/^[\w.-]{3,60}$/.test(handle)) { console.error("[takeYoutubeChannel] --handle wants the name after the @, letters, digits, dot, dash or underscore"); process.exit(2); }
const outDir = path.resolve(cli.values["--out"] || path.join(ENG, "data", "channels")), delay = cli.values["--delay"] ?? 600;
const slug = (cli.values["--slug"] || handle || given).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
const HEAD = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0", "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+cb; SOCS=CAI" };   // the cookies are the consent answer YouTube's EU wall wants, so a page comes back instead of the wall
async function get(url, file) {
    if (file) return fs.readFileSync(file, "utf8");
    const r = await fetch(url, { headers: HEAD, redirect: "follow" });
    if (!r.ok) throw new Error(url + " answered " + r.status);
    return r.text();
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
    let page = null;
    if (handle || cli.values["--page-file"]) {
        try { page = parseChannelPage(await get("https://www.youtube.com/@" + handle, cli.values["--page-file"])); }
        catch (e) { console.log("[takeYoutubeChannel] the channel page was not read (" + e.message + "); the feed's own title and id will stand"); }
    }
    const channelId = given || (page && page.channelId);
    if (!channelId && !cli.values["--feed-file"]) { console.error("[takeYoutubeChannel] no channel id: the @" + handle + " page gave none (blocked, a consent wall, or YouTube reshaped it). Pass --channel-id UC... (the channel's About > Share > Copy channel ID)"); process.exit(1); }
    const feed = parseFeed(await get("https://www.youtube.com/feeds/videos.xml?channel_id=" + channelId, cli.values["--feed-file"]));
    if (!feed.videos.length) { console.error("[takeYoutubeChannel] the feed parsed to NO videos: refusing to write a snapshot that says the channel is empty. Is the channel id right, and did YouTube answer with the feed?"); process.exit(1); }
    const details = {};
    if (cli.flags.has("--details")) {
        for (const v of feed.videos) { try { details[v.id] = parseWatchPage(await get("https://www.youtube.com/watch?v=" + v.id)); } catch (e) { console.log("  watch page " + v.id + " not read: " + e.message); } await wait(delay); }
        if (!Object.values(details).some((d) => d.lengthSeconds != null)) console.log("[takeYoutubeChannel] no watch page gave a duration: YouTube may have reshaped them, or answered a wall");
    }
    const extra = [...new Set([...extractLinks(page && page.description), ...(cli.values["--links"] ? cli.values["--links"].split(",").map((s) => s.trim()).filter(Boolean) : [])])];
    const snap = snapshotFrom({ handle: handle ? "@" + handle : null, feed, page, details, extraLinks: extra, at: new Date().toISOString() });
    const file = path.join(outDir, slug + ".json");
    let prev = null; try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    const merged = mergeSnapshots(prev, snap), bad = validateSnapshot(merged);
    if (bad.length) { console.error("[takeYoutubeChannel] the snapshot is not sound, not written: " + bad.join("; ")); process.exit(1); }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(merged, null, 1) + "\n");
    const ip = path.join(outDir, "index.json"); let idx = { format: "swek-channel-index-v1", channels: [] }; try { idx = JSON.parse(fs.readFileSync(ip, "utf8")); } catch {}
    idx.channels = (idx.channels || []).filter((c) => c.slug !== slug).concat([{ slug, handle: merged.handle, name: merged.channel.name, file: slug + ".json", videos: merged.videos.length, updated: merged.fetchedAt }]);
    fs.writeFileSync(ip, JSON.stringify(idx, null, 1) + "\n");
    const repos = new Set(merged.videos.flatMap((v) => (v.repos || []).map((r) => (r.owner + "/" + r.repo).toLowerCase())));
    console.log("[takeYoutubeChannel] wrote " + path.relative(ENG, file) + " (" + FORMAT + "): " + merged.videos.length + " videos (" + feed.videos.length + " in the feed, " + (merged.videos.length - feed.videos.length < 0 ? 0 : merged.videos.length - feed.videos.length) + " kept from earlier), " + repos.size + " GitHub repositories named, channel \"" + merged.channel.name + "\"" + (merged.channel.subscribers ? ", " + merged.channel.subscribers : ""));
    console.log("[takeYoutubeChannel] open channel.html" + (idx.channels.length > 1 ? "?c=" + slug : "") + " to see it");
} catch (e) {
    console.error("[takeYoutubeChannel] failed: " + (e && e.message)); process.exit(1);
}
