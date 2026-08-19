// WebGLEngine/tools/ship/candidateKnown-selfcheck.mjs -- v3013
//
// Run: node tools/ship/candidateKnown-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/candidateKnown.mjs -- which scanned Android IPs are already ours.
//
// /android/candidates returns every Android device it can see on the LAN. On a real network that list is long
// and undifferentiated: a TV, three phones, a tablet nobody uses, and the two Shield boxes actually running a
// SweK GPU brain under Termux ALL LOOK THE SAME. Keith's question was whether the scan could be associated with
// the peers we already have, so the unknown list stops being a wall. It can -- the hub already holds three
// independent witnesses and had never consulted any of them for this.
//
// THREE WITNESSES, because each knows something the others do not:
//   ROSTER  a peer PUSHED a check-in -- it ran our code and said so
//   PEER    this hub successfully PULLED from it -- it answered our HTTP
//   LEDGER  it SUBMITTED magmap results -- it did real GPU work for us
//
// AND THE RULE THAT KEEPS THIS HONEST: AN IP MATCH IS EVIDENCE, NOT IDENTITY. DHCP reassigns. The phone that was
// .40 last week may be a printer today. So a match is reported as "this IP matches a peer that checked in 1h
// ago", never as "this IS that peer", and the AGE travels with it -- a six-week-old sighting and a six-minute-old
// one are different claims wearing the same word.
import { classifyCandidates, ipOf, WITNESS, FRESH_MS } from "../roundhouse/candidateKnown.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "candidateKnown.mjs"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const now = Date.now();
const iso = (ms) => new Date(now - ms).toISOString();
const cands = [{ ip: "192.168.1.40" }, { ip: "192.168.1.41" }, { ip: "192.168.1.55" }, { ip: "192.168.1.99" }];
const known = {
    roster: [{ origin: "http://192.168.1.40:8787", host: "shield", at: iso(3600000) }],
    peers: [{ url: "http://192.168.1.41:8787", host: "tablet", at: iso(60 * 3600000) }],
    ledger: [{ origin: "http://192.168.1.40:8787", host: "shield", at: iso(7200000) }],
};
const r = classifyCandidates(cands, known, now);
const by = (ip) => r.rows.find((x) => x.ip === ip);

// ---- 1. THE LIST GETS SHORTER, WHICH IS THE POINT ----------------------------------------------------------
{
    ok("!! known addresses are separated from unknown", r.knownCount === 2 && r.unknownCount === 2,
       r.note);
    ok("a matched address names its host", by("192.168.1.40").host === "shield",
       "an IP alone tells you nothing you can act on");
    ok("an unmatched address says WHY it is unmatched", /no check-in, no successful pull/.test(by("192.168.1.55").why || ""),
       "'unknown' with no reason is indistinguishable from 'not looked up'");
}

// ---- 2. THREE WITNESSES, AND MULTIPLE ARE REPORTED TOGETHER ---------------------------------------------------------
{
    const strong = by("192.168.1.40");
    ok("!! an address with TWO witnesses reports both", strong.witnesses.length === 2 &&
       strong.witnesses.includes(WITNESS.ROSTER) && strong.witnesses.includes(WITNESS.LEDGER),
       strong.witnesses.join(" + ") + " -- a box that checked in AND did GPU work is a stronger claim than either alone, and collapsing them to a boolean loses that");
    ok("all three witness kinds are distinct", new Set(Object.values(WITNESS)).size === 3);
    ok("...and each is named for what it OBSERVED, not what it is", Object.values(WITNESS).every((w) => /-/.test(w)),
       Object.values(WITNESS).join(", "));
}

// ---- 3. AN IP MATCH IS EVIDENCE, NOT IDENTITY -------------------------------------------------------------------------
{
    const old = by("192.168.1.41");
    ok("!! a STALE witness is flagged", old.stale === true,
       "60h old against a " + (FRESH_MS / 3600000) + "h window");
    ok("!! ...and the reason names DHCP", /DHCP reassigns/.test(old.why || ""),
       "the phone that was .40 last week may be a printer today -- a lead, not an identification");
    ok("a fresh witness is NOT flagged stale", by("192.168.1.40").stale === false);
    ok("the age travels with the claim", typeof old.ageMs === "number" && old.ageMs > 0,
       "a six-week-old sighting and a six-minute-old one are different claims wearing the same word");
    ok("!! the module says so in its own source", /EVIDENCE, NOT IDENTITY/.test(src),
       "the next reader will want to treat a match as a fact, and the file has to argue back");
}

// ---- 4. it does not invent what it cannot read -------------------------------------------------------------------------
{
    ok("ipOf returns null rather than guessing", ipOf("not-an-address") === null && ipOf("") === null);
    ok("...and pulls an IP out of a URL", ipOf("http://10.0.0.7:8787/x") === "10.0.0.7");
    ok("an undated witness is reported as undated, not as fresh", (() => {
        const u = classifyCandidates([{ ip: "10.0.0.1" }], { roster: [{ origin: "http://10.0.0.1", host: "h" }] }, now);
        return /undated/.test(u.rows[0].why) && u.rows[0].ageMs === null;
    })(), "a missing timestamp cannot be silently treated as 'just now'");
    ok("empty input does not throw", classifyCandidates([], {}).total === 0 && classifyCandidates(null, null).total === 0);
}

console.log(fails ? "\ncandidateKnown-selfcheck: " + fails + " FAILED" : "\ncandidateKnown-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
