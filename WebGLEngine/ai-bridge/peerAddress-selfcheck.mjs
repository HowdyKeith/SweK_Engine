// WebGLEngine/ai-bridge/peerAddress-selfcheck.mjs — v2542
//
// Run: node ai-bridge/peerAddress-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// WHY THIS EXISTS: A COMMENT IS NOT THE CODE. IT IS A CLAIM ABOUT THE CODE, AND NOTHING CHECKS IT.
//
// assetSync.js carried this, written at v1845:
//     - virtual/bridge addresses that answer on :8787 but aren't real LAN boxes:
//         * 100.64-127.x       (CGNAT / Tailscale-ish carrier space)
//     Real LAN ranges kept: 192.168.x, 10.x, and 172.16.x
//
// and server.html carried this, in the UI, for a human to read:
//     add peer by tailnet IP (e.g. 100.90.1.5)
//
// Those two disagree, and one of them is a lie. Reading the COMMENT, the answer is that the button advertises an
// address the server refuses -- a control that cannot succeed. Reading the CODE, v1886 added:
//     if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10: Tailscale tailnet IPs
// and never updated the comment above it. THE FEATURE WORKS. THE COMMENT HAS BEEN WRONG FOR 41 VERSIONS.
//
// v2541 put a gate on the claims in predictions.html, on the grounds that a claim nothing can falsify is
// decoration. A STALE COMMENT IS THE SAME SPECIES: a claim about behaviour, living in the source, that nothing
// ever checks. Prose cannot be gated. THE BEHAVIOUR IT DESCRIBES CAN.
//
// So this file is the comment, rewritten as assertions. If someone "cleans up" the CGNAT branch because the
// comment above it says CGNAT is junk, this goes red and says which machine just stopped being reachable.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const assetSync = require("./assetSync.js");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// addPeer returns the peer list. Add, look, remove -- the real function in its real context. Lifting the
// validator out with a regex tests a DIFFERENT function: it has a dependency (_isOwnHost) and throws without it,
// which is how the first attempt at this failed.
const accepts = (url) => {
    const list = assetSync.addPeer(url);
    const host = url.replace(/^https?:\/\//, "").split(":")[0];
    const took = Array.isArray(list) && list.some((p) => String(p).includes(host));
    if (took) assetSync.removePeer(url);
    return took;
};

// ---- THE ONE THAT MATTERS: a tailnet peer can be added -----------------------------------------------------
// This is not hypothetical. The plan is to run the engine on a machine in another house, on a tailnet, for days.
// If this branch is ever removed as "CGNAT junk", that machine silently stops being addable and the button that
// invites you to add it goes on inviting you.
{
    ok("A TAILNET PEER CAN BE ADDED (100.64.0.0/10)", accepts("http://100.90.1.5:8787"),
       "server.html's own example: 'add peer by tailnet IP (e.g. 100.90.1.5)'");
    ok("...anywhere in the range, not just the example", accepts("http://100.127.255.254:8787") && accepts("http://100.64.0.1:8787"));
    ok("...and the UI's promise matches the server's behaviour", accepts("http://100.101.102.103:8787"),
       "a control that advertises an address the server refuses is decoration");
}

// ---- the real LAN, which is what the fleet actually runs on -------------------------------------------------
{
    ok("192.168.x is a peer (Stellar Atlas, PurtyGF)", accepts("http://192.168.50.40:8787"));
    ok("10.x is a peer", accepts("http://10.0.0.5:8787"));
    ok("172.16.x is a peer (the real-LAN slice)", accepts("http://172.16.3.4:8787"));
    ok(".local names are peers (mDNS)", accepts("http://stellar-atlas.local:8787"));
}

// ---- and the junk this filter was built to stop, which must STAY stopped -------------------------------------
// The v1845 filter exists because gossip/discovery was letting these in. Loosening the tailnet rule must not
// loosen these: a Docker bridge answering on :8787 is not a peer, it is this box wearing a hat.
{
    ok("Docker/WSL bridge 172.17-31.x is NOT a peer", !accepts("http://172.17.0.2:8787") && !accepts("http://172.31.9.9:8787"));
    ok("link-local 169.254.x is NOT a peer", !accepts("http://169.254.1.1:8787"));
    ok("a public hostname is NOT a peer", !accepts("http://api.github.com:8787"));
    ok("a routable public IP is NOT a peer", !accepts("http://8.8.8.8:8787"));
    ok("nonsense octets are NOT a peer", !accepts("http://999.1.1.1:8787"));
}

// ---- prunePeers must agree with addPeer ---------------------------------------------------------------------
// prunePeers re-filters the saved list through the SAME predicate. If they ever disagreed, a peer you added would
// vanish on the next restart and nothing would say why -- which is the worst kind of bug: it looks like the
// network.
{
    assetSync.addPeer("http://100.90.1.5:8787");
    const kept = assetSync.prunePeers();
    const survives = Array.isArray(kept) ? kept.some((p) => String(p).includes("100.90.1.5")) : assetSync.addPeer("").some((p) => String(p).includes("100.90.1.5"));
    ok("a tailnet peer SURVIVES prunePeers (it does not vanish on restart)", survives,
       "add and prune must use the same predicate, or peers disappear silently");
    assetSync.removePeer("http://100.90.1.5:8787");
}

console.log(fails ? "\npeerAddress-selfcheck: " + fails + " FAILED" : "\npeerAddress-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
