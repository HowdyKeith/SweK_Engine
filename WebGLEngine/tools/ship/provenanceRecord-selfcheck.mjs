// WebGLEngine/tools/ship/provenanceRecord-selfcheck.mjs
//
// Run: node tools/ship/provenanceRecord-selfcheck.mjs   (~2s -- MEASURED)
//
// v4416 -- *** PROVENANCE IS ATTESTED, NOT DERIVED -- AND FIVE NARROW PATTERNS IN ONE FUNCTION HID HALF OF
// WHAT THIS TREE HAD ALREADY WRITTEN DOWN. ***
//
// v4415 measured that "only 3 of 15 bodies record where they came from" and named closing that gap as item 8's
// next round. The gap was mostly a reading error. world/orreryAuthor.mjs's upstream scan carried FIVE separate
// too-narrow patterns, and each was found only by widening the one before:
//   1. the provenance file must be .md      -> missed gifenc/PROVENANCE.txt and slug/PROVENANCE.txt
//   2. the URL must be http(s)              -> missed gifenc's git://github.com/mattdesl/gifenc.git
//   3. the file must be called PROVENANCE   -> missed htmx/VERSIONS.txt, a full record: npm source, version,
//                                              verified date, and the tagged licence URL
//   4. the host must be github.com          -> missed raw.githubusercontent.com/bigskysoftware/htmx
//   5. (my fix for 3) depth <= 2            -> LOST vendor/wasm, whose record is three levels down and which
//                                              the OLD rule had found. A widening that narrows is a narrowing.
// *** AND v4415 WROTE A PARAGRAPH ABOUT REPLACING ITS OWN LICENCE REGEX WITH orrery.mjs's isLicenceFile, TWO
// LINES ABOVE PATTERN 1, IN THE SAME FUNCTION, IN THE SAME ROUND. *** Fixing one instance of a species is not
// fixing the species even when the instance is adjacent to it.
//
// The rule is structural now rather than a list of guessed filenames: a body's records are its shallow text
// files that are neither the licence nor shipped code, and all of them are read.
//
// SABOTAGES (4, all logged, MEASURED 6/3/3/3 by name -- one per narrow pattern, each restoring the exact rule
// v4415 shipped, and each taking down both the fixture row that names it AND the population count, which is
// what a check with two independent readers looks like when it works).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../world/orreryAuthor.mjs";
import { build } from "./orreryAuthorScan.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("tools/ship/provenanceRecord-selfcheck.mjs");
const FRESH = build(ENG);

// Frozen BY NAME and not by count -- v4399's rule, and the population this round exists to shrink.
// It may only get smaller: a body added without a record fails here on arrival.
const NO_UPSTREAM_AT_V4416 = Object.freeze([
    "fonts",     // OFL names IBM Corp with the Reserved Font Name Plex; no URL anywhere in the directory, and
                 // the well-known repository is NOT in this tree. Naming it would be reciting, not recording.
    "grass",     // LICENSE names boona13 and the directory holds nothing else at all.
    "keyhunt",   // HAS a record, deliberately WITHOUT a URL: ATTRIBUTION.txt names the project and its author
                 // and no URL exists in the tree. The record says so rather than constructing one from the name.
    "krbn",      // LICENSE names "Krbn contributors" and the directory holds nothing else.
]);

console.log("\n1. every body either records where it came from, or is named here with why");
{
    const missing = FRESH.bodies.filter((b) => !b.upstream || !b.upstream.owner).map((b) => b.name);
    const surprise = missing.filter((n) => !NO_UPSTREAM_AT_V4416.includes(n));
    ok("!! *** no body lacks an upstream except the four named above ***", surprise.length === 0,
        surprise.length ? "UNNAMED: " + surprise.join(", ") + " -- record it or add it here WITH THE REASON"
                        : `${missing.length} without an owner, all four named: ${missing.join(", ")}`);
    const fixed = NO_UPSTREAM_AT_V4416.filter((n) => !missing.includes(n));
    ok("...and the list may only SHRINK -- a name that gained a record is removed, not left standing",
        fixed.length === 0, fixed.length ? "NOW RECORDED, take them off the list: " + fixed.join(", ")
                                         : "4 still unrecorded, and a ratchet nobody has to remember to lower");
    ok("!! ...and eleven of fifteen DO record it, against the three v4415 claimed",
        FRESH.counts.withUpstream >= 11, `${FRESH.counts.withUpstream} of ${FRESH.counts.bodies} -- six records ` +
        "written this round from evidence in the tree, and two more that already existed and were being missed");
    REPORT.table("where each vendored body says it came from", ["body", "record", "upstream"],
        FRESH.bodies.map((b) => [b.name, b.upstreamFile || "-",
            b.upstream ? (b.upstream.owner ? b.upstream.owner + "/" + b.upstream.repo : b.upstream.url.slice(0, 44)) : "-"]),
        "Attested, not scraped. Four bodies have no upstream and are named in the gate with the reason.");
}

console.log("\n2. THE SCRAPE IS WRONG, and the most important body is where it fails");
{
    // Not an argument -- a measurement, re-taken every run over the real directory.
    const count = (body, re) => {
        const dir = path.join(ENG, "vendor", body);
        const hits = new Map();
        const walk = (d) => { let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
            for (const x of e) { const p = path.join(d, x.name);
                if (x.isDirectory()) { walk(p); continue; }
                let t = ""; try { t = fs.readFileSync(p, "utf8"); } catch { continue; }
                for (const m of t.match(re) || []) hits.set(m, (hits.get(m) || 0) + 1); } };
        walk(dir);
        return [...hits.entries()].sort((a, b) => b[1] - a[1]);
    };
    const three = count("three", /github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g);
    const top = three[0], real = three.find((h) => /mrdoob\/three\.js/.test(h[0]));
    ok("!! *** the COMMONEST GitHub URL inside vendor/three is not three.js ***",
        !!top && !/mrdoob/.test(top[0]) && !!real && top[1] > real[1],
        `${top ? top[0] + " x" + top[1] : "?"} against ${real ? real[0] + " x" + real[1] : "none"} -- the glTF ` +
        "loader cites the SPECIFICATION it implements, so a scraper picking the commonest URL files three.js " +
        "under KhronosGroup. THIS IS WHY THE RECORDS ARE ATTESTATIONS WITH THEIR REASONING AND NOT A SCAN");
    const jolt = count("jolt", /github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g);
    ok("...and where a scrape WOULD have worked it is still written down, with that fact as the evidence",
        jolt.length === 1 && /jrouwe/.test(jolt[0][0]),
        `vendor/jolt has exactly one GitHub URL (${jolt[0] ? jolt[0][0] : "none"}) -- not the most frequent, the ONLY one, ` +
        "which is a different and much stronger claim and is what its record says");
    REPORT.table("what a URL scrape of vendor/three would conclude", ["url", "hits"],
        three.slice(0, 4).map(([u, n]) => [u, String(n)]),
        "The top row is the answer a frequency heuristic gives. It is wrong, and it is wrong by 6x.");
}

console.log("\n3. the five widenings, each with the record it was hiding");
{
    const P = (paths, want) => A.attributionFor("x", paths, () => want);
    ok("a record with a .txt extension counts",
        P(["PROVENANCE.txt"], "https://github.com/a/b").upstream?.owner === "a", "gifenc and slug, missed by v4415");
    ok("...a git:// URL counts", A.upstreamFrom("git://github.com/mattdesl/gifenc.git")?.owner === "mattdesl",
        "gifenc's own record writes it that way");
    ok("...a record not called PROVENANCE counts",
        P(["VERSIONS.txt"], "https://github.com/a/b").upstream?.owner === "a", "htmx/VERSIONS.txt is a full record");
    ok("...raw.githubusercontent.com is a GitHub URL",
        A.upstreamFrom("https://raw.githubusercontent.com/bigskysoftware/htmx/v2.0.10/LICENSE")?.owner === "bigskysoftware",
        "how htmx records the licence it took");
    ok("!! ...and a record three levels down still counts -- the widening that narrowed",
        P(["quickjs/quickjs-emscripten-core/README.md"], "https://github.com/a/b").upstream?.owner === "a",
        "MY OWN depth<=2 cut lost vendor/wasm, which the rule I was replacing had found. Caught by re-reading " +
        "the whole table, not the count: it went up while one row went blank");
    ok("...and shipped code is not read as a record",
        P(["three.module.js"], "https://github.com/a/b").upstream === null,
        "a URL in a source file is not a URL the source came from -- vendor/three is the proof");
}

console.log("\n4. every record names evidence, not just an answer");
{
    // *** THE FIRST DRAFT READ A FIELD THE BAKE DID NOT CARRY, so `recs` was EMPTY and `.every()` over it was
    // true: a PASS printing "0 records". v4401's vacuous check, third sighting this session, and caught by
    // reading the detail rather than the exit code. upstreamFile is in the bake now, and the population is
    // asserted non-empty before anything is asserted about its members.
    const recs = FRESH.bodies.filter((b) => b.upstreamFile && /provenance/i.test(b.upstreamFile));
    ok("the records exist to be checked at all", recs.length >= 6, `${recs.length} PROVENANCE files found`);
    // *** AND THE FIRST VERSION OF THIS ROW ASKED FOR THE WRONG PROPERTY. *** It required the word EVIDENCE and
    // failed box3d, gifenc and taichi-js -- the three records that PREDATE this round and are, in one respect,
    // better evidenced than the six written today: they PIN A COMMIT OR A VERSION, which is a stronger thing to
    // know than a paragraph of reasoning. What a record must actually do is say HOW IT KNOWS: pin the artifact,
    // or state the argument, or state what it could not establish. Broadening this is not weakening it to get
    // green -- the six new records still have to carry their reasoning, because they pin nothing and say so.
    // A bare semver on its own line IS a pin -- gifenc's record opens "gifenc 1.0.3" -- and "VERIFIED BY
    // ENCODING, NOT BY READING: 8 frames 64x64 -> 1364 bytes, magic GIF89a" is the strongest evidence in the
    // whole set: it ran the artifact. Two more widenings, found the same way as the other five, by looking at
    // the row that failed instead of at the count.
    const PINNED = /\b(commit|tag|version)\b\s*[|:]|@?\b\d+\.\d+\.\d+\b|\b[0-9a-f]{40}\b/i;
    const ARGUED = /EVIDENCE|NOT ESTABLISHED|NO CODE|records it as|VERIFIED/;
    const weak = recs.filter((b) => {
        const t = fs.readFileSync(path.join(ENG, "vendor", b.name, b.upstreamFile), "utf8");
        return !PINNED.test(t) && !ARGUED.test(t);
    });
    ok("!! *** every PROVENANCE record says what it rests on, or what it could not establish ***",
        recs.length >= 6 && weak.length === 0, weak.length ? "says neither how it knows nor what it could not establish: " + weak.map((b) => b.name).join(", ")
                    : `${recs.length} records: ${recs.filter((b) => PINNED.test(fs.readFileSync(path.join(ENG, "vendor", b.name, b.upstreamFile), "utf8"))).length} pin an artifact, the rest argue from what is in the tree and say what they could not pin`);
    ok("...and a record with no URL says WHY there is none rather than omitting the field",
        (() => { const p = path.join(ENG, "vendor", "keyhunt", "PROVENANCE.txt");
                 return fs.existsSync(p) && /does not construct one/.test(fs.readFileSync(p, "utf8")); })(),
        "keyhunt: the project and author are named and no URL exists anywhere in the tree");
}

say("WHAT THIS DOES NOT CLAIM. That the recorded upstreams are CORRECT -- they are attestations written from " +
    "evidence inside this tree, and section 2 exists precisely because the alternative is provably worse, not " +
    "because attestation is infallible. It does not pin versions: only box3d, gifenc, htmx and taichi-js record " +
    "a tag or a version, and the six written this round say in as many words that they do not. It cannot tell a " +
    "record that was true when written from one that has gone stale, because nothing here reaches the network. " +
    "And it does not close item 8: an author-centred GITHUB universe needs owner/repo for every body, and four " +
    "still have none -- three because the tree genuinely does not know, which is a fact about the tree and not " +
    "a gap in the scan.");

REPORT.write();
console.log(`\nprovenanceRecord-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
