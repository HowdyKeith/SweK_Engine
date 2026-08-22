// FILE: ai-bridge/capabilityProxy.js
// VERSION: v1 - capability proxy (build step #4)
//
// "Share the capability, not the credential." A box that lacks a credential (e.g. no Gemini key) borrows a PEER's
// capability: the peer runs the operation with its OWN key and returns only the result, so the credential never leaves its
// owner. This is the safe alternative to handing the key over (that deliberate move is the separate, password-gated #5).
//
// This module is PURE decision logic (whitelist + which peer to route to) so it unit-tests headless. The live peer calls,
// the trust gating, and the actual key use all live in server.js.

// Whitelist of capabilities that may be proxied. Deliberately narrow - only safe, well-defined operations get added here.
// text2voxel: a text prompt -> validated voxel JSON via the holder's Gemini key (server route /ai/asset -> generateAsset).
// ha: drive the holder's Home Assistant - but ONLY the safe domains below (no locks/alarms/covers/climate).
// crossdesk: v3012. A peer may ask ANOTHER peer whether it can host a remote-desktop session -- is CrossDesk
// configured, what platform floor does that machine sit under, is its web client reachable. That is the CONTROL
// PLANE and it is genuinely useful across a LAN: "which of these boxes can I actually get a screen from" is a
// question you want answered before you walk to another room.
//
// READ-ONLY, AND THE RESTRICTION IS THE POINT. Only /crossdesk/status may be proxied. setConfig MUST NOT be,
// because the config carries serverAddress and relayPort -- a peer able to write those could REDIRECT SOMEONE
// ELSE'S REMOTE-DESKTOP SESSION TO A HOST OF ITS CHOOSING. That is the same reasoning that keeps lock,
// alarm_control_panel, cover and climate out of HA_ALLOWED_DOMAINS: the proxy exists to lend a capability, not
// to hand over control of the machine that has it.
//
// AND IT DOES NOT CARRY PIXELS. CrossDesk's own transport is a MiniRTC relay on its own ports and its web client
// is third-party hosted; an HTTP proxy can lend the ANSWER about a session, never the session. Stated here
// because the opposite assumption is the natural one and would waste a round.
const PROXYABLE = ["text2voxel", "ha", "crossdesk"];

// Which crossdesk sub-routes may cross the proxy. A whitelist, not a prefix match: /crossdesk/config would pass
// a naive startsWith check and is exactly what must not.
const CROSSDESK_ALLOWED = ["status"];
function crossdeskRouteAllowed(route) { return CROSSDESK_ALLOWED.indexOf(String(route || "").replace(/^\/+/, "")) !== -1; }

// Home Assistant domains a peer may drive through the proxy. Excludes lock / alarm_control_panel / cover / climate so a
// trusted peer can turn on lights or cast media but cannot unlock a door, disarm an alarm, open a garage, or change HVAC.
const HA_ALLOWED_DOMAINS = ["light", "media_player", "scene", "switch", "notify"];   // v1867 — notify: TV toast to a peer's Shield
function haDomainAllowed(domain) { return HA_ALLOWED_DOMAINS.indexOf(String(domain || "")) !== -1; }

// Can THIS box serve `cap`? It must be on the whitelist AND advertised in our own caps.
function canServe(cap, localCaps) {
    return PROXYABLE.indexOf(cap) !== -1 && !!(localCaps && localCaps[cap]);
}

// Pick the first reachable peer that advertises `cap`. peers: [{ url, caps:{...}, online? }].
// Skips peers that don't advertise the capability, and (if the field is present) ones marked offline.
function pickCapabilityPeer(cap, peers) {
    if (PROXYABLE.indexOf(cap) === -1) return null;
    const list = Array.isArray(peers) ? peers : [];
    for (const p of list) {
        if (!p || !p.url || !p.caps || !p.caps[cap]) continue;
        if (p.online === false) continue;
        return p;
    }
    return null;
}

module.exports = { PROXYABLE, HA_ALLOWED_DOMAINS, CROSSDESK_ALLOWED, canServe, pickCapabilityPeer, haDomainAllowed, crossdeskRouteAllowed };
