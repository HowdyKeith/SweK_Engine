// WebGLEngine/tools/ship/crossdeskProxy-selfcheck.mjs -- v3012
//
// Run: node tools/ship/crossdeskProxy-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// CAN A LAN PEER REACH ANOTHER PEER'S REMOTE-DESKTOP CONTROL PLANE? Now yes -- and only the control plane.
//
// Keith asked whether a LAN peer could reach a Mac's CrossDesk view through a separate tunnel. The honest split
// is that the CONTROL PLANE and the PIXELS have different answers, and only one of them was ever available.
//
// What already existed: capabilityProxy (v1744), whose principle is "share the capability, not the credential"
// -- a box lacking a key borrows a PEER's capability, the peer runs it with its own key, and only the result
// comes back. A deliberately narrow whitelist: text2voxel and ha. CrossDesk was not on it, so the answer was no.
//
// WHAT THIS ROUND ADDS IS READ-ONLY, AND THE RESTRICTION IS THE WHOLE DESIGN. Only /crossdesk/status crosses the
// proxy. setConfig must NOT, because the config carries serverAddress and relayPort -- A PEER ABLE TO WRITE
// THOSE COULD REDIRECT SOMEONE ELSE'S REMOTE-DESKTOP SESSION TO A HOST OF ITS CHOOSING. That is exactly the
// reasoning that keeps lock, alarm_control_panel, cover and climate out of HA_ALLOWED_DOMAINS.
//
// AND IT DOES NOT CARRY PIXELS. CrossDesk's transport is a MiniRTC relay on its own ports and its web client is
// third-party hosted. An HTTP proxy can lend the ANSWER about a session, never the session -- so a cloudflared
// quick tunnel reaches the control plane and cannot reach the stream. Stated because the opposite assumption is
// the natural one and would cost a round to discover.
import { PROXYABLE, CROSSDESK_ALLOWED, HA_ALLOWED_DOMAINS, canServe, pickCapabilityPeer, crossdeskRouteAllowed } from "../../ai-bridge/capabilityProxy.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const src = fs.readFileSync(path.join(ENG, "ai-bridge", "capabilityProxy.js"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE CAPABILITY EXISTS AND IS ROUTABLE --------------------------------------------------------------
{
    ok("crossdesk is proxyable", PROXYABLE.includes("crossdesk"), PROXYABLE.join(", "));
    ok("a box advertising it can serve it", canServe("crossdesk", { crossdesk: true }) === true);
    ok("...and one that does not, cannot", canServe("crossdesk", {}) === false,
       "advertising is required -- the whitelist alone is not permission");
    const peer = pickCapabilityPeer("crossdesk", [{ url: "a", caps: {} }, { url: "b", caps: { crossdesk: true } }]);
    ok("!! a peer that advertises it is selected over one that does not", peer && peer.url === "b",
       "which answers 'which of these boxes can I actually get a screen from' before you walk to another room");
}

// ---- 2. READ-ONLY, AND THE REFUSAL IS THE POINT ------------------------------------------------------------------
{
    ok("status crosses the proxy", crossdeskRouteAllowed("status") && crossdeskRouteAllowed("/status"));
    ok("!! CONFIG DOES NOT", crossdeskRouteAllowed("config") === false,
       "the config carries serverAddress and relayPort -- a peer able to write those could redirect someone else's remote-desktop session to a host of its choosing");
    ok("...and neither does anything else", ["", "web", "install", "../config", "status/../config"].every((r) => !crossdeskRouteAllowed(r)),
       "it is a WHITELIST, not a prefix match -- /crossdesk/config would pass a naive startsWith check and is exactly what must not");
    ok("the allowed list is small and stated", Array.isArray(CROSSDESK_ALLOWED) && CROSSDESK_ALLOWED.length === 1, CROSSDESK_ALLOWED.join(","));
    ok("!! the reason is recorded beside the rule", /serverAddress and relayPort/.test(src) && /REDIRECT/.test(src),
       "a whitelist without its reasoning gets widened by the next reader who finds it inconvenient");
}

// ---- 3. IT INHERITS THE EXISTING SAFETY POSTURE RATHER THAN INVENTING ONE --------------------------------------------
{
    ok("the HA domain restriction is untouched", !HA_ALLOWED_DOMAINS.includes("lock") && !HA_ALLOWED_DOMAINS.includes("alarm_control_panel"),
       "adding a capability must not loosen an existing one -- " + HA_ALLOWED_DOMAINS.join(", "));
    ok("the whitelist stayed narrow", PROXYABLE.length === 3, PROXYABLE.length + " capabilities, each added deliberately");
    ok("!! the pixels/control-plane split is written down", /can lend the ANSWER about a session, never the session/i.test(src),
       "an HTTP proxy and a MiniRTC relay are different transports, and assuming otherwise is the natural mistake");
}

console.log(fails ? "\ncrossdeskProxy-selfcheck: " + fails + " FAILED" : "\ncrossdeskProxy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
