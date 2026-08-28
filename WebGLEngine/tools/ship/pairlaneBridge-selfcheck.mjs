// WebGLEngine/tools/ship/pairlaneBridge-selfcheck.mjs -- v4107
//
// Run: node tools/ship/pairlaneBridge-selfcheck.mjs   (~0.3s; no network, no npx, no spawn)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/pairlaneBridge.js -- kiyo-e/pairlane, browser-to-browser file transfer over WebRTC.
//
// *** WHAT THIS CAN AND CANNOT PROVE, SAID ONCE. *** A REAL TRANSFER IS NEVER RUN HERE: it needs `npx pairlane`
// (a Rust binary fetched from npm), a reachable room server, and a SECOND endpoint to transfer to. None of the
// three exist in this container. So the real send/receive is a documented contract, exactly as sharpBridge.js's
// local path is, and ONE REAL RUN ON A LINUX OR MAC BOX IS WHAT TURNS IT INTO A FACT.
//
// What IS driven, and it is the half with consequences: every refusal, the platform gate, the endpoint
// validation, and the URL scanner -- all pure functions over injected inputs, so every branch runs here
// including the Windows one that CANNOT be reached by running the real thing on this Linux box.
//
// *** THE PROPERTY THAT MATTERS MOST IS NOT "DOES IT TRANSFER", IT IS "WHO CAN START ONE AND WHO CAN READ THE
// LINK". *** The room URL carries the decryption key in its fragment, so it is a BEARER SECRET: whoever holds
// it can pull the file while a send is running. A LAN-reachable route would hand that to every peer on the
// network. That is the check with a consequence outside this repository, so it is asserted against server.js
// rather than trusted.
"use strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const P = require_(path.join(ENG, "ai-bridge", "pairlaneBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("pairlaneBridge-selfcheck -- who may start a transfer, and who may read the link\n");

// ---- 1. THE PLATFORM GATE, DRIVEN ON EVERY BRANCH INCLUDING THE ONE THIS BOX IS NOT ------------------------
{
    console.log("1. *** WINDOWS IS NOT ON pairlane'S OWN SUPPORTED LIST, AND KEITH'S RIG IS WINDOWS ***");
    const win = P.platformSupport("win32");
    ok("!! *** win32 is REFUSED, rather than spawning an npx that cannot work ***",
        win.ok === false,
        "the README lists " + P.SUPPORTED + " -- a spawn there fails with whatever npm says about a missing " +
        "optional binary, which reads like a bug in SweK rather than an unsupported platform");
    ok("!! ...and the refusal NAMES the supported platforms, so it is actionable rather than a flat no",
        /Linux/.test(win.why) && /macOS/.test(win.why), win.why.slice(0, 80));
    ok("!! ...and it offers build-from-source as a POSSIBILITY, not a claim this tree cannot back",
        /may work/.test(win.why) && /untested/.test(win.why),
        "the README does not claim Windows support for a source build and this box cannot test it; " +
        "asserting it would be the invented-fact shape this tree refuses");
    ok("linux is supported", P.platformSupport("linux").ok === true);
    ok("darwin is supported", P.platformSupport("darwin").ok === true);
    ok("!! an unknown platform is refused rather than assumed fine",
        P.platformSupport("freebsd").ok === false, P.platformSupport("freebsd").why.slice(0, 60));
}

// ---- 2. EVERY REFUSAL LANDS BEFORE A PROCESS IS SPAWNED ---------------------------------------------------
{
    console.log("\n2. NOTHING IS SPAWNED FOR AN ARGUMENT THAT CANNOT WORK");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pairlane-"));

    ok("send refuses no file at all", P.send("").ok === false, P.send("").error);
    const missing = P.send(path.join(scratch, "nope.bin"));
    ok("send refuses a file that is not there", missing.ok === false && /no such file/.test(missing.error), missing.error);
    const dir = P.send(scratch);
    ok("!! send refuses a DIRECTORY -- `pairlane send` takes one file, and the CLI's error for this is opaque",
        dir.ok === false && /not a file/.test(dir.error), dir.error);

    ok("receive refuses an empty room", P.receive("", scratch).ok === false);
    const noOut = P.receive("abc123", "");
    ok("!! *** receive REFUSES to invent an output directory ***",
        noOut.ok === false && /output directory/.test(noOut.error),
        "a received file landing anywhere the packer walks would ride into the next release zip -- the class " +
        "of mistake sharpBridge.js's wouldBePackaged() exists to refuse one directory over. Being told where " +
        "to write is cheaper than guessing and being wrong once.");

    ok("!! ...and none of those refusals created anything",
        fs.readdirSync(scratch).length === 0,
        "a refusal that leaves state behind is how the next run finds a directory it did not make");

    ok("stop refuses an id that was never issued",
        P.stop("999").ok === false && /no such job/.test(P.stop("999").error));
    fs.rmSync(scratch, { recursive: true, force: true });
}

// ---- 3. THE ENDPOINT IS VALIDATED AT THE WRITE ------------------------------------------------------------
{
    console.log("\n3. A SELF-HOSTED ENDPOINT IS CHECKED WHERE IT IS SET, NOT WHERE IT IS USED");
    ok("unset is a real state, not an error", P.endpointError("") === "");
    ok("!! a non-URL is refused", /not a URL/.test(P.endpointError("hello")));
    ok("!! *** plain http is REFUSED for a remote host ***",
        /https/.test(P.endpointError("http://example.com")),
        "the room URL carries the decryption key in its fragment; negotiating the room over cleartext would " +
        "put the transfer's whole security story behind an http hop");
    ok("...but localhost over http is allowed, because a dev server on this box is not a network hop",
        P.endpointError("http://localhost:5173") === "" && P.endpointError("http://127.0.0.1:8787") === "");
    ok("a real https endpoint passes", P.endpointError("https://pairlane.example.com") === "");
    ok("the default endpoint is pairlane's own published instance",
        P.DEFAULT_ENDPOINT === "https://getpairlane.com");
}

// ---- 4. THE ROOM URL SCANNER, DRIVEN AGAINST THE README'S OWN EXAMPLE --------------------------------------
{
    console.log("\n4. *** THE PRINTED URL IS PARSED, NOT GUESSED AT ***");
    // The README's literal example line, so this is matched against the documented output rather than a shape
    // invented here.
    const real = "Share the printed URL: https://getpairlane.com/r/AbC123#k=SOMEKEY_-value";
    const got = P._scanForUrl(real);
    ok("!! the room URL is found in the CLI's own documented output line",
        got === "https://getpairlane.com/r/AbC123#k=SOMEKEY_-value", JSON.stringify(got));
    ok("!! ...and the KEY FRAGMENT is kept -- it IS the decryption key, and a URL without it is useless",
        /#k=/.test(got || ""),
        "encryption is on by default and the key never reaches the server; dropping the fragment would hand " +
        "the reader a link that cannot decrypt what it fetches");
    ok("a self-hosted host is matched too, not just getpairlane.com",
        P._scanForUrl("https://my.box.example/r/xyz#k=abc") === "https://my.box.example/r/xyz#k=abc");
    ok("an unencrypted room URL (--no-encrypt) still parses",
        P._scanForUrl("https://getpairlane.com/r/plain") === "https://getpairlane.com/r/plain");
    ok("!! ordinary output with no URL yields null rather than a partial match",
        P._scanForUrl("waiting for receivers...") === null);
}

// ---- 5. THE TERMS AND THE WARNING TRAVEL WITH EVERY REPLY --------------------------------------------------
{
    console.log("\n5. *** THE PERSON ABOUT TO PRESS SEND IS THE ONE WHO NEEDS TO KNOW WHAT THE LINK IS ***");
    const st = P.status();
    ok("status answers even on a box where the CLI could not run", st.ok === true);
    ok("!! status names the licence and the upstream repo",
        st.licence === "MIT" && /kiyo-e\/pairlane/.test(st.repo));
    ok("!! *** status warns THE ROOM URL IS A BEARER SECRET, in the reply itself ***",
        /BEARER SECRET/.test(st.note),
        "whoever holds the link can fetch the file while the send runs -- that belongs in front of the button, " +
        "not in a module header somebody read once");
    ok("!! ...and it says the file does NOT pass through the room server, which is the actual privacy claim",
        /does not pass through/.test(st.note));
    ok("status reports which endpoint is in play and whether it is the default",
        typeof st.endpoint === "string" && typeof st.endpointIsDefault === "boolean",
        st.endpoint + " (default: " + st.endpointIsDefault + ")");
    ok("...and it surfaces the platform verdict rather than making a caller re-derive it",
        typeof st.supported === "boolean" && st.platforms === P.SUPPORTED);
}

// ---- 6. THE ROUTE IS LOCAL-ONLY, AND THAT IS THE CHECK WITH TEETH -----------------------------------------
{
    console.log("\n6. *** A LAN-REACHABLE ROUTE HERE WOULD HAND EVERY PEER A FILE-EXFILTRATION BUTTON ***");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const block = (server.match(/startsWith\("\/pairlane\/"\)[\s\S]{0,900}/) || [""])[0];
    ok("!! the pairlane routes are dispatched at all", block.length > 0);
    ok("!! *** ...behind _isTrustedReq, refusing 403 otherwise ***",
        /_isTrustedReq\(req\)/.test(block) && /local only/.test(block),
        "these routes spawn a process AND publish a chosen file; /pairlane/status returns the bearer URL");
    ok("!! the trust check comes BEFORE any route in the block is matched",
        block.indexOf("_isTrustedReq") < block.indexOf("/pairlane/status"),
        "a guard placed after the first route would leave that route open -- the ordering IS the guard");
    ok("all five routes are wired",
        ["status", "send", "receive", "stop", "config"].every((r) => block.includes("/pairlane/" + r)));
    ok("...and the bridge is required LAZILY, so a tree without the file still boots",
        /require\("\.\/pairlaneBridge\.js"\)/.test(server) && !/^const pairlaneBridge/m.test(server));
    ok("!! the bearer URL is never written to the shared debug log or the ticker",
        !/debugLine[\s\S]{0,80}pairlane/i.test(server) && !/pairlane[\s\S]{0,80}debugLine/i.test(server),
        "both fan out to every connected page, which would defeat the local-only route one line above");
}

// ---- 7. THE MAC-PEER RELAY, SAME SHAPE raycastBridge's ALREADY EARNED, DRIVEN ON SOURCE ---------------------
//
// v4109 -- Keith: "can we call a mac peer to start the pairlane bridge, like we do with other mac services?"
// pairlane refuses on win32 (section 1), so on Keith's Windows rig THAT is the end of the road without a relay.
// raycastBridge's /raycast/relay + /raycast/peer-exec is the SAME SHAPE this need already has an answer for
// (Raycast is also darwin-only and the PC drives it through a known mesh peer) -- reused rather than reinvented.
// A live two-box relay cannot be driven from one container with no peer to call; what CAN be driven, and is,
// is the two-tier trust split that makes the relay safe: peer-exec must accept BOTH a trusted caller and a
// known mesh peer (the relay itself, calling FROM the PC, is recognised on the Mac side that way), while relay
// itself must stay trusted-only (this box's owner decides who gets driven) and must verify the target peer
// against the KNOWN mesh before forwarding anything -- an unpaired URL must never be dialled.
{
    console.log("\n7. *** THE MAC-PEER RELAY: TWO TRUST LEVELS, AND NEITHER COLLAPSES INTO THE OTHER ***");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const peerExecBlock = (server.match(/req\.url === "\/pairlane\/peer-exec"\)[\s\S]{0,500}/) || [""])[0];
    const relayBlock = (server.match(/req\.url === "\/pairlane\/relay"\)[\s\S]{0,1100}/) || [""])[0];

    ok("!! /pairlane/peer-exec is dispatched", peerExecBlock.length > 0);
    ok("!! *** ...and accepts a trusted caller OR a KNOWN MESH PEER, not trusted-only ***",
        /!_isTrustedReq\(req\) && !_knownPeerReq\(req\)/.test(peerExecBlock),
        "trusted-only here would refuse the relay's own forwarded request -- the PC calling FROM its own IP, " +
        "which the Mac only recognises via _knownPeerReq, not _isTrustedReq (that only ever answers for the " +
        "box's own owner)");

    ok("!! /pairlane/relay is dispatched", relayBlock.length > 0);
    ok("!! *** ...and relay is TRUSTED-ONLY -- unlike peer-exec, a known peer may NOT ask THIS box to relay ***",
        /if \(!_isTrustedReq\(req\)\) \{ sendJson\(\{ ok: false, error: "local only" \}, 403\); return; \}/.test(relayBlock),
        "relay is the box's own owner choosing which peer gets driven; a peer that could trigger it too would " +
        "let ANY paired box use this one as a launchpad against a THIRD box");
    ok("!! ...and the target peer is checked against the KNOWN MESH before anything is forwarded",
        /known\.has\(peer\)/.test(relayBlock) && /not in the known mesh/.test(relayBlock),
        "an unpaired URL typed into the peer field must never be dialled -- that would make this box an open " +
        "relay to anywhere on the internet, not just the LAN mesh it is meant for");
    ok("!! ...and the peer field itself is stripped before forwarding, not passed through as an action arg",
        /delete body\.peer/.test(relayBlock),
        "the receiving peer's OWN action dispatcher should never see who relayed the call as if it were part of " +
        "the request payload");

    // The whitelist dispatcher itself: same shape as _rayPeerAction, five named actions and a named refusal.
    const dispatch = (server.match(/async function _pairlanePeerAction\([\s\S]{0,900}?\n    \}/) || [""])[0];
    ok("!! *** the dispatcher is a WHITELIST with a named default, not an eval of the action string ***",
        /case "status":/.test(dispatch) && /case "send":/.test(dispatch) && /case "receive":/.test(dispatch) &&
        /case "stop":/.test(dispatch) && /case "config":/.test(dispatch) && /default: return \{ ok: false, error: "unknown action"/.test(dispatch),
        "an unrecognised action is refused BY NAME, listing what IS allowed -- the same shape _rayPeerAction " +
        "already uses, so a caller that gets it wrong can see why");
    ok("...and every branch calls into the SAME pairlaneBridge functions the local routes call -- no second copy",
        /P\.status\(\)/.test(dispatch) && /P\.send\(/.test(dispatch) && /P\.receive\(/.test(dispatch) &&
        /P\.stop\(/.test(dispatch) && /P\.setConfig\(/.test(dispatch));
}

// ---- 8. THE PAGE: A REAL HOME, THE MAC SYSTEM VIEW, AND THE RENAMED FILE-TRANSFER PANEL ----------------------
{
    console.log("\n8. *** pairlane.html IS REACHABLE FROM WHERE A READER WOULD ACTUALLY LOOK ***");
    ok("!! pairlane.html exists", fs.existsSync(path.join(ENG, "pairlane.html")));
    const page = fs.readFileSync(path.join(ENG, "pairlane.html"), "utf8");
    const opens = (page.match(/<div\b/g) || []).length, closes = (page.match(/<\/div>/g) || []).length;
    ok("!! its <div> tags balance", opens === closes && opens > 0, opens + " open, " + closes + " close");
    ok("!! it has a local card AND a remote (Mac-peer) card -- one page, both paths",
        /id="localCard"/.test(page) && /id="remoteCard"/.test(page));
    ok("!! the remote card is hidden by DEFAULT and shown only once status() says this box is unsupported",
        /remoteCard[\s\S]{0,40}display:\s*none/.test(page) && /remoteCard.*\.style\.display = supported \? "none" : ""/.test(page.replace(/\s+/g, " ")),
        "a Linux/Mac box that can already run pairlane directly should not be steered at a peer it does not need");
    ok("!! the room URL is flagged as a secret in the page too, not just in the bridge's status() note",
        /class=.secret./.test(page) && /BEARER SECRET/i.test(page));

    const placements = fs.readFileSync(path.join(ENG, "tools", "ship", "pagePlacements.mjs"), "utf8");
    ok("!! pairlane.html is listed in macPages() -- Keith: \"pairlane would show in the Mac System panel\"",
        /file: "pairlane\.html",\s*why: "[^"]*Mac peer/.test(placements));

    const sections = fs.readFileSync(path.join(ENG, "tools", "ship", "pageSections.mjs"), "utf8");
    const nearshareBlock = (sections.match(/id: "nearshare"[\s\S]{0,900}?pages: \[[^\]]*\]/) || [""])[0];
    ok("!! pairlane.html joined the (renamed) File Transfer Utils panel's page list too",
        /"pairlane\.html"/.test(nearshareBlock), nearshareBlock.slice(0, 160));
    ok("!! *** the panel's label is RENAMED to what Keith actually asked for, id/tab left untouched ***",
        /label: "File Transfer Utils"/.test(nearshareBlock) && /id: "nearshare", tab: "nearshare"/.test(nearshareBlock),
        "renaming the internal id too would touch every existing data-tab/data-panel selector for no reason " +
        "the request asked for -- the visible label is what changed");

    const serverHtml = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! the server.html tab button shows the renamed label, not the old one",
        /data-tab="nearshare">[\s\S]{0,80}File Transfer Utils/.test(serverHtml) && !/data-tab="nearshare">[\s\S]{0,80}>\s*NearShare</.test(serverHtml));
    ok("!! ...and pairlane.html is also a direct link where the other Mac-System tools already are",
        /href="\/pairlane\.html"/.test(serverHtml));
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
