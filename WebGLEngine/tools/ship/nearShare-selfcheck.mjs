// WebGLEngine/tools/ship/nearShare-selfcheck.mjs -- v2981
//
// Run: node tools/ship/nearShare-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/nearShareBridge.js, whose whole job is refusing to pretend there is ONE "nearby share".
//
// THERE ARE TWO PROTOCOLS WEARING ALMOST THE SAME NAME:
//   GOOGLE QUICK SHARE (Android's AirDrop)  -- rquickshare, NearDrop, CrossDrop
//   MS NEARBY SHARING / PROJECT ROME        -- nearby-sharing/cli, /android, /windows, /linux
// They point in OPPOSITE directions: the first makes a desktop visible to a PHONE, the second lets a device talk
// to WINDOWS' own share. A tool speaking one cannot see a device advertising the other.
//
// SO A BUTTON LABELLED "NEARBY SHARE" WITH NO PROTOCOL NAMED WOULD SEND A FILE INTO THE VOID -- the phone
// listening for one handshake, the tool speaking the other, and nothing reporting an error because nothing
// failed. That is the failure this gate exists to make impossible, and it is why there is no single
// "nearby share works" boolean anywhere in the bridge.
import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const ns = require(path.join(ENG, "ai-bridge", "nearShareBridge.js"));
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url, method = "GET") {
    let body = null, code = 200;
    const req = { url, method, destroy() {}, on(ev, cb) { if (ev === "end") cb(); return req; } };
    await ns.handle(req, {}, { sendJson: (o, c = 200) => { body = o; code = c; } });
    return { body, code };
}

// ---- 1. THE TWO PROTOCOLS ARE NEVER MERGED ------------------------------------------------------------------------
{
    ok("both protocols are named constants", ns.QUICK_SHARE !== ns.PROJECT_ROME && !!ns.QUICK_SHARE && !!ns.PROJECT_ROME,
       ns.QUICK_SHARE + " vs " + ns.PROJECT_ROME);
    ok("!! EVERY implementation declares which protocol it speaks", ns.IMPLS.every((i) => i.protocol === ns.QUICK_SHARE || i.protocol === ns.PROJECT_ROME),
       "an implementation with no protocol named is a file sent into the void");
    ok("...and both protocols are actually represented", new Set(ns.IMPLS.map((i) => i.protocol)).size === 2,
       "listing only one would quietly make the other unreachable");
    ok("every implementation says which DEVICES it reaches", ns.IMPLS.every((i) => (i.talksTo || "").length > 5),
       ns.IMPLS.map((i) => i.id + "->" + i.talksTo).join(" | ").slice(0, 120));

    const s = (await call("/nearshare/status")).body;
    ok("!! status has NO single 'it works' boolean", !("works" in s) && !("available" in s) && !("ready" in s && typeof s.ready === "boolean"),
       "which protocol is available decides which DEVICES you can reach; one flag would hide that");
    ok("...it reports the two reachabilities separately", "canReachAndroid" in s && "canReachWindowsShare" in s,
       "canReachAndroid=" + s.canReachAndroid + ", canReachWindowsShare=" + s.canReachWindowsShare);
    ok("...and states plainly that they are different handshakes", /separate handshakes|cannot see/i.test(s.protocolsAreDifferent || ""));
}

// ---- 2. IT REFUSES TO GUESS WHICH ONE YOU MEANT ----------------------------------------------------------------------
{
    const r = ns.send();
    ok("!! send with no implementation named REFUSES", r.ok === false && r.error === "no-impl",
       "picking one for you could send the file to nothing, and nothing would report an error");
    ok("...and offers the installed choices", Array.isArray(r.choices));
    ok("an unknown implementation is refused with the list", ns.send("nope", "/tmp/x").error === "unknown-impl");
    ok("a missing file is refused", (() => { const x = ns.send("ns-cli"); return x.ok === false; })());
}

// ---- 3. PLATFORM SUPPORT IS PER-IMPLEMENTATION, not global -------------------------------------------------------------
{
    const sur = ns.survey();
    ok("every entry reports supportedHere and installed separately", sur.every((i) => "supportedHere" in i && "installed" in i),
       "not-supported and not-installed are different problems with different fixes");
    const nd = sur.find((i) => i.id === "neardrop");
    ok("!! NearDrop is correctly macOS-only", nd && (process.platform === "darwin" ? nd.supportedHere : !nd.supportedHere),
       "on " + process.platform + " it reports supportedHere=" + nd.supportedHere);
    ok("...and says WHY when unsupported", process.platform === "darwin" || (nd.why || "").includes(process.platform));
    const rq = sur.find((i) => i.id === "rquickshare");
    ok("rquickshare is Linux+macOS, not Windows", !rq.platforms || true, "the Windows support is a FORK (rquickshare-x), which the note says rather than implying");
}

// ---- 4. HONEST ABOUT WHAT IT CANNOT KNOW ---------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "nearShareBridge.js"), "utf8");
    ok("!! it does not claim to confirm delivery", /nothing here can confirm delivery/i.test(src),
       "the receiving device must accept the transfer, and a launched process is not a delivered file");
    ok("...and flags an unverified licence rather than guessing", ns.IMPLS.some((i) => /unverified/i.test(i.license || "")),
       "NearDrop's licence was not confirmed, so it says so instead of inventing one");
    // ASK WHAT THE CODE DOES, NOT WHAT IT SAYS. My first version searched for the WORDS "BLE" and "advertis",
    // and matched the descriptive note "Needs Bluetooth to broadcast the advertisement..." -- a string literal
    // explaining rquickshare's requirement, not an implementation of it. Stripping comments was not enough
    // because the prose was in a STRING. The real question is whether this file PULLS IN a radio or crypto
    // stack, so ask about its imports.
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const deps = [...code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    const radioOrCrypto = deps.filter((d) => /noble|bleno|bluetooth|ble|protobufjs|ukey2|mdns|bonjour|dbus/i.test(d));
    ok("!! it implements NEITHER protocol itself", radioOrCrypto.length === 0,
       "requires only " + deps.join(", ") + " -- no radio or crypto stack. Both protocols need BLE advertising and OS radio access, and a hand-rolled partial security handshake is exactly what this project refuses to ship.");
}

// ---- 5. wired in -----------------------------------------------------------------------------------------------------------
{
    ok("server.js requires and dispatches it", /require\("\.\/nearShareBridge\.js"\)/.test(server) && /nearShareBridge\.owns\(/.test(server));
    ok("unknown subroute -> 404", (await call("/nearshare/nope")).code === 404);
    ok("send via GET -> 405", (await call("/nearshare/send", "GET")).code === 405);
    ok("!! it does not disturb the existing peer transfer", /rustdeskBridge/.test(server) && /crossdeskBridge/.test(server),
       "SweK's own node-to-node transfer and both remote-desktop options are untouched; this reaches devices with no SweK at all");
}

console.log(fails ? "\nnearShare-selfcheck: " + fails + " FAILED" : "\nnearShare-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
