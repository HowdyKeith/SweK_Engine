// tools/roundhouse/peersPanel-selfcheck.mjs
//
// v2955 -- THE PEERS PANEL SHOWS BOTH DIRECTIONS.
//
// server.html's "SweK Engine Peers" box adds a peer by typing its tailnet or LAN IP, and the hub then PROBES
// that address. That is a pull, and it is the right tool for a machine the hub can reach. It is also the reason a
// peer behind NAT could never appear there: there is no IP to type that this hub can dial.
//
// Those peers check in through the lighthouse instead. This gate pins that both kinds appear in the one panel,
// that they are LABELLED so the two are never confused, and -- the part that would actually break something --
// that push peers are not fed to the prober, which would mark them permanently offline for being unreachable by
// design.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const page = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "server.html"), "utf8");

// ---- 1. BOTH KINDS RENDER IN THE SAME PANEL ---------------------------------------------------------------------------
{
    ok("!! lighthouse peers render inside the SweK Engine Peers panel",
        /_lighthouseHtml/.test(page) && /_rem = _lh \+ _rem;/.test(page),
        "one panel, both directions -- an operator should not have to know which mechanism a peer used in order " +
        "to find it. The pulled peers and the checked-in peers appear together");
}

// ---- 2. THEY ARE LABELLED, NOT BLENDED ---------------------------------------------------------------------------------
{
    ok("!! the block says 'checked in, not dialable' and shows each peer's origin",
        /checked in, not dialable/.test(page) && /esc\(r\.origin\)/.test(page),
        "pulled means the hub verified the address; pushed means the peer asserted itself. Rendering them " +
        "identically would hide which peers this hub has actually confirmed the location of");
}

// ---- 3. PUSH PEERS ARE NOT PROBED --------------------------------------------------------------------------------------
{
    // the lighthouse rows are rendered from their own array and never enter peerList, which is what probePeer maps over
    const feedsProbe = /peerList\s*=\s*[^;]*lighthouse/i.test(page) || /probePeer\([^)]*lighthouse/i.test(page);
    ok("!! lighthouse rows never enter peerList, so the prober never dials them",
        !feedsProbe && /deliberately NOT probed/.test(page),
        "probePeer maps over peerList; a push peer has no dialable address, so probing it would fail forever and " +
        "render it 'offline' when it is unreachable BY DESIGN. Keeping the two arrays separate is what prevents " +
        "a working remote peer from being displayed as a broken local one");
}

// ---- 4. FLEET DISAGREEMENT IS VISIBLE FROM THE PANEL ---------------------------------------------------------------------
{
    ok("a fleet with more than one master hash is warned about in the panel header",
        /different master hashes/.test(page),
        "the panel is where an operator looks; the one thing a fleet exists to detect should be visible there " +
        "and not only on a separate report page");

    ok("a peer whose own hash changed shows a marker",
        /masterChanges>0/.test(page),
        "rebuilt, updated or diverged -- flagged inline rather than requiring the roster JSON to be read");
}

// ---- 5. A MISSING LIGHTHOUSE DEGRADES QUIETLY ----------------------------------------------------------------------------
{
    ok("!! if /lighthouse is unavailable the panel still renders the pulled peers",
        /catch\(function\(\)\{ _lighthouseHtml=""; \}\)/.test(page),
        "an older hub, or one that has never had a check-in, must not break the peers panel. The fetch failing " +
        "empties the block and the existing panel renders exactly as before");
}

console.log();
if (fails) { console.log("peersPanel-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("peersPanel-selfcheck: all checks pass");
