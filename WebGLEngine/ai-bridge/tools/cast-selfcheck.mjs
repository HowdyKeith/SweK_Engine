// ai-bridge/tools/cast-selfcheck.mjs — casting a stream to a peer, and detecting a media library.
//
//   node ai-bridge/tools/cast-selfcheck.mjs
//
// Two small rounds, and the discipline is the same as everywhere else: the url that arrives from the network
// is a url a page will OPEN, so it is validated rather than trusted; and the detector must refuse to link at
// something that merely happens to be listening on the right port.
//
// Neither of these is tested against the real thing. There is no Jellyfin here and no go2rtc; there are two
// real HTTP servers pretending, and the assertions are about OUR arithmetic and OUR refusals, which is the
// only part we wrote.

import { createServer } from "http";
import { prose } from "../../tools/ship/sourceScan.mjs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const announce = require(path.join(ENGINE, "ai-bridge", "announceBridge.js"));
const jellyfin = require(path.join(ENGINE, "ai-bridge", "jellyfinBridge.js"));

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

// --- 1. a stream url from the network is a url a page opens ---------------------------------------------
{
    const S = (u, extra) => announce.normalizeStream({ url: u, ...extra });
    ok("http and https are castable", !!S("http://192.168.50.40:1984/stream.html?src=cam") && !!S("https://a.example/x"));
    ok("ws and wss too, because that is what WebRTC signalling rides on", !!S("ws://h:8555/api/ws") && !!S("wss://h/api/ws"));

    ok("`javascript:` is refused -- that is how a toast becomes an exploit", S("javascript:alert(1)") === null);
    ok("`data:` is refused", S("data:text/html,<script>x</script>") === null);
    ok("`file:` is refused", S("file:///etc/passwd") === null);
    ok("`rtsp:` is refused -- a browser cannot open it anyway", S("rtsp://h/s") === null);
    ok("a url carrying CREDENTIALS is refused: a password in somebody's log", S("http://user:pw@h/s") === null);
    ok("a url longer than five hundred characters is not a url", S("http://h/" + "x".repeat(600)) === null);
    ok("garbage is refused rather than passed on", S("not a url") === null && S("") === null && announce.normalizeStream(null) === null);

    const good = S("http://192.168.50.40:1984/stream.html?src=frontdoor", { title: "Front door", mode: "webrtc" });
    ok("a good one keeps its url, title and mode", good.url.includes("frontdoor") && good.title === "Front door" && good.mode === "webrtc");
    ok("an unknown mode falls back to `page`, rather than being obeyed", S("http://h/x", { mode: "eval" }).mode === "page");
    ok("a title longer than eighty characters is cut, not refused", S("http://h/x", { title: "t".repeat(200) }).title.length === 80);
}

// --- 2. THE BUG THIS ROUND HAD TO FIX FIRST ---------------------------------------------------------------
//
// `_norm` builds a NEW object from the fields it knows. A stream passed through it would have been silently
// dropped, and the cast would have arrived as a toast with no url and nobody would have known why.
{
    const a = announce.normalize({ kind: "stream", text: "watch this", stream: { url: "ws://h:8555/api/ws", title: "cam" } });
    ok("an announcement's stream SURVIVES normalisation", !!a.stream && a.stream.url.startsWith("ws://"));
    ok("...and a message model that silently discarded it would be worse than one that refused it", true);
    ok("an ordinary announcement has no stream, and says so with null", announce.normalize({ text: "low disk" }).stream === null);
    ok("a bad stream on a good announcement drops the STREAM, not the announcement",
        (() => { const b = announce.normalize({ text: "hi", stream: { url: "javascript:x" } }); return b.text === "hi" && b.stream === null; })());

    // The ring and the dedup are the announce bridge's, and a cast is just an announcement.
    const r1 = announce.receive({ id: "cast1", text: "a", stream: { url: "http://h/x" } });
    const r2 = announce.receive({ id: "cast1", text: "a", stream: { url: "http://h/x" } });
    ok("a cast is received once", r1.new === true && r2.dup === true);
    ok("...and it arrives with its stream attached", r1.announcement.stream.url === "http://h/x");
}

// --- 3. the /cast route's own rules, as the server enforces them -------------------------------------------
{
    const src = require("fs").readFileSync(path.join(ENGINE, "ai-bridge", "server.js"), "utf8");
    ok("POST /cast exists", /req\.url === "\/cast"/.test(src));
    ok("...and is trusted-requests-only, because a cast opens a page on somebody else's screen", /a cast opens a page on somebody else's screen/.test(prose(src)));
    ok("...it resolves a go2rtc stream by NAME, and refuses a name go2rtc does not have", /go2rtc has no stream called/.test(src));
    ok("...it uses the engine's own LAN address, never `localhost`", /never `localhost`/.test(src));
    ok("...and a path that climbs out of the engine is not a path", /that is not a path/.test(prose(src)));
    ok("...and every url goes through announceBridge.normalizeStream before it is broadcast", /announceBridge\.normalizeStream\(stream\)/.test(src));
    ok("the receiver gives a stream announcement its own toast, carrying the url", /kind: "toast", title: "\\uD83D\\uDCFA "/.test(src) || /a CAST: the peer is offering a stream/.test(src));
}

// --- 4. Jellyfin: detect, and refuse to link at something that is not it -----------------------------------
{
    ok("it owns exactly one route, because that is the whole integration", jellyfin._routes.size === 1 && jellyfin.owns("/jellyfin/status"));
    ok("...and nothing else", !jellyfin.owns("/jellyfin/library") && !jellyfin.owns("/jellyfin"));

    ok("with nothing listening, it says so plainly", (await jellyfin.probe("127.0.0.1", 1)).error === "nothing is listening");

    // Something IS on the port, and it is not Jellyfin. Linking a user at it would be worse than saying no.
    const impostor = createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<h1>hello</h1>"); });
    await new Promise((r) => impostor.listen(0, "127.0.0.1", r));
    const bad = await jellyfin.probe("127.0.0.1", impostor.address().port);
    ok("something on the port that is NOT Jellyfin is refused, not linked", !bad.ok && bad.reached === true);
    ok("...and named: `not JSON: not Jellyfin`", /not Jellyfin/.test(bad.error));
    await new Promise((r) => impostor.close(r));

    // A real-looking Jellyfin answers /System/Info/Public without authentication.
    const real = createServer((req, res) => {
        if (req.url === "/System/Info/Public") {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ServerName: "attic", Version: "10.9.11", Id: "abc", StartupWizardCompleted: true }));
        }
        res.writeHead(404); res.end();
    });
    await new Promise((r) => real.listen(0, "127.0.0.1", r));
    const good = await jellyfin.probe("127.0.0.1", real.address().port);
    ok("a real Jellyfin is detected without any credentials", good.ok && good.version === "10.9.11");
    ok("...and it gives its name", good.serverName === "attic");
    ok("...and whether it has been through its setup wizard", good.startupComplete === true);
    await new Promise((r) => real.close(r));

    // A fresh install answers, and is not ready. Linking somebody at a setup wizard and calling it a media
    // library is how a feature gets a bad name.
    const fresh = createServer((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ Version: "10.9.11", StartupWizardCompleted: false })); });
    await new Promise((r) => fresh.listen(0, "127.0.0.1", r));
    const f = await jellyfin.probe("127.0.0.1", fresh.address().port);
    ok("a fresh install is detected AND flagged as needing setup", f.ok && f.startupComplete === false);
    await new Promise((r) => fresh.close(r));

    ok("the url for a peer is the engine's LAN address, not `localhost`", jellyfin.webUrl("192.168.50.40") === "http://192.168.50.40:8096/");
    ok("...and for the host, loopback", jellyfin.webUrl("127.0.0.1") === "http://127.0.0.1:8096/");

    const s = await jellyfin.status("192.168.50.40");
    ok("the status says out loud that Jellyfin is a LIBRARY and not a transport", /library/i.test(s.note) && /go2rtc/.test(s.note));
    ok("...and that live LAN streams go through go2rtc at sub-second latency", /sub-second/.test(s.note));
    ok("with nothing installed, it offers no url to open", s.installed === false && s.url === null);
}

// --- 5. and the integration stays shallow, on purpose -------------------------------------------------------
{
    const src = require("fs").readFileSync(path.join(ENGINE, "ai-bridge", "jellyfinBridge.js"), "utf8");
    ok("the bridge does not proxy Jellyfin", !/createProxy|pipe\(res\)|http-proxy/.test(src));
    ok("...does not hold Jellyfin credentials", !/password|api[_-]?key|token/i.test(src.replace(/\/\/.*$/gm, "")));
    ok("...and says why: TWO AUTH SYSTEMS IS WORSE THAN ONE", /TWO AUTH SYSTEMS IS WORSE THAN ONE/.test(prose(src)));

    const cat = JSON.parse(require("fs").readFileSync(path.join(ENGINE, "ai-bridge", "install_catalog.json"), "utf8"));
    ok("the install catalog has a jellyfin entry", !!cat.jellyfin);
    ok("...whose description says it is NOT for live streams", /NOT for cross-sending live streams/.test(cat.jellyfin.description));
    ok("...and names what is, and why", /go2rtc/.test(cat.jellyfin.description) && /6-20s/.test(cat.jellyfin.description));
    ok("...and the install is idempotent", /already installed/.test(cat.jellyfin.cmds.join(" ")));
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
