// tools/roundhouse/lighthouse-selfcheck.mjs
//
// v2953 -- THE LIGHTHOUSE: A PEER BEHIND NAT CAN NOW JOIN A FLEET THAT COULD NEVER HAVE REACHED IT.
//
// /fingerprint/collect is a PULL: the hub fetches each peer's /fingerprint. On a LAN that is fine. For a machine
// behind NAT -- a cousin's desktop on their own home network -- there is no address to dial, so it could never
// be part of the fleet by ANY configuration on this side. Only the peer can open the connection. A Cloudflare
// tunnel gives the hub a stable, globally reachable address, so the peer reaching IN is the direction that works.

import { checkIn, emptyRoster, rosterSummary, peerKey } from "./lighthouse.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const rep = (host, master, platform = "linux") => ({ host, arch: "x64", platform, master, subsystems: new Array(50) });

// ---- 1. PROVENANCE IS RECORDED AND CANNOT BE SELF-CLAIMED --------------------------------------------------------------
{
    let R = checkIn(emptyRoster(), rep("rig", "AAAA"), { origin: "pull", at: "2026-07-25T10:00:00Z" });
    R = checkIn(R, rep("cousin-pc", "AAAA", "win32"), { origin: "push", at: "2026-07-25T11:00:00Z" });
    const s = rosterSummary(R, { now: "2026-07-25T12:00:00Z" });
    ok("!! pushed and pulled peers are distinguished in the roster",
        s.pulled === 1 && s.pushed === 1,
        "being PULLED means the hub reached out and verified the address; being PUSHED means the peer asserted " +
        "its own identity. Different epistemic situations -- a roster that rendered them identically would be " +
        "hiding which peers the hub has actually confirmed the location of");

    const bridge = fs.readFileSync(path.resolve(here, "..", "..", "ai-bridge", "fingerprintBridge.js"), "utf8");
    ok("!! origin is set by the HUB, never taken from the request body",
        /checkIn\(roster, rep, \{ origin: "push"/.test(bridge) && !/origin: rep\.origin/.test(bridge),
        "a peer cannot claim to have been pulled. 'Pulled' means we verified the address, which is something " +
        "only this side can know -- letting the body set it would let a peer manufacture credibility it has not earned");
}

// ---- 2. A PEER SENDS A FINGERPRINT, NOT A VERDICT ----------------------------------------------------------------------
{
    const script = fs.readFileSync(path.join(here, "lighthouse_checkin.mjs"), "utf8");
    ok("!! the peer-side script pushes master + subsystems + observables, and no verdict",
        /master: fp\.master, subsystems: fp\.subsystems/.test(script) && !/verdict/.test(script.replace(/\/\/.*$/gm, "")),
        "the hub grades. Same split as the phone ballot, the magmap report and the persistence ledger -- the " +
        "peer supplies measurement, never adjudication");
}

// ---- 3. FLEET DISAGREEMENT IS THE HEADLINE ------------------------------------------------------------------------------
{
    let R = checkIn(emptyRoster(), rep("rig", "AAAA"), { origin: "pull", at: "2026-07-25T10:00:00Z" });
    R = checkIn(R, rep("cousin-pc", "BBBB", "win32"), { origin: "push", at: "2026-07-25T11:00:00Z" });
    const s = rosterSummary(R, { now: "2026-07-25T12:00:00Z" });
    ok("!! two different master hashes across the fleet is surfaced, not averaged away",
        s.masters.length === 2,
        "the point of a fleet is cross-machine agreement; a roster that only counted peers and not their hashes " +
        "would miss the one thing it exists to detect");

    // the same peer changing its own hash between check-ins
    let R2 = checkIn(emptyRoster(), rep("cousin-pc", "AAAA", "win32"), { origin: "push", at: "2026-07-25T11:00:00Z" });
    R2 = checkIn(R2, rep("cousin-pc", "CCCC", "win32"), { origin: "push", at: "2026-07-26T11:00:00Z" });
    const s2 = rosterSummary(R2, { now: "2026-07-26T12:00:00Z" });
    ok("!! a peer whose OWN master hash changed between check-ins is flagged",
        s2.changedMaster.length === 1 && s2.rows[0].masterChanges === 1,
        "rebuilt, updated, or diverged -- all worth knowing, and invisible without keeping the history. The " +
        "roster keeps the last 10 master values per peer rather than only the current one");
}

// ---- 4. STALENESS IS A MEASUREMENT, NOT A BAKED-IN TIMEOUT ---------------------------------------------------------------
{
    let R = checkIn(emptyRoster(), rep("laptop", "AAAA"), { origin: "push", at: "2026-07-20T10:00:00Z" });
    const s = rosterSummary(R, { now: "2026-07-25T10:00:00Z" });
    ok("!! the roster reports AGE in hours and no live/dead verdict",
        s.rows[0].ageHours === 120 && !("status" in s.rows[0]) && !("alive" in s.rows[0]),
        "120h since last check-in, stated as a number. A laptop that is off overnight by design is not a " +
        "failure, and only the operator knows the cadence they expect -- so the roster measures and the reader " +
        "decides, rather than a hardcoded timeout being wrong for everyone");
}

// ---- 5. THE SAME MACHINE KEEPS ITS SLOT --------------------------------------------------------------------------------
{
    const a = peerKey(rep("cousin-pc", "AAAA", "win32"));
    const b = peerKey(rep("cousin-pc", "ZZZZ", "win32"));   // hash changed, machine did not
    const c = peerKey(rep("other-pc", "AAAA", "win32"));
    ok("the peer key is the MACHINE, not its current hash -- so history survives a rebuild",
        a === b && a !== c,
        "keyed on host/arch/platform. If the key included the master hash, a peer that rebuilt would appear as a " +
        "brand-new peer and the change this roster exists to notice would be erased by the noticing");
}

console.log();
if (fails) { console.log("lighthouse-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("lighthouse-selfcheck: all checks pass");
