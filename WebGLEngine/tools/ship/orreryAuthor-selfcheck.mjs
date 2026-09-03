// WebGLEngine/tools/ship/orreryAuthor-selfcheck.mjs
//
// Run: node tools/ship/orreryAuthor-selfcheck.mjs   (~6s -- MEASURED, browser section included)
//
// v4414 -- *** PAPERED IS NOT ATTRIBUTED, AND THE ORRERY HAS ONLY EVER KNOWN THE FIRST. ***
//
// docs/EXPLAIN-ITSELF.md item 8. Keith asked for the inversion -- the author as the sun, a universe centred on
// a person rather than on this repository. The measurement that opens it is that the field does not exist:
// orrery.json's fifteen bodies carry [name, arrived, sha, bytes] and files, and NO owner, url or repo on any
// of them. world/orrery.mjs has split them into CAPTURED and UNPAPERED since v4185 -- "may these bytes ship?"
// -- and has never asked whose they are.
//
// SIX KINDS, because "we know who wrote this" must not cover the cases where we plainly do not: person,
// collective (three.js authors is a REAL attribution and NOT a person -- drawing it as one would invent
// somebody), disclaimed (htmx ships 0BSD, whose text says THE AUTHOR and names nobody: papered, and the author
// still unknown), prose (keyhunt's ATTRIBUTION.txt credits a project and says NO CODE WAS COPIED), none, and
// unread (a licence is there and this could not parse it -- separated from `none` because an absence read as a
// skip is an absence read as a pass).
//
// *** AND THE FIRST DRAFT FALSELY ACCUSED A PROPERLY LICENSED DEPENDENCY. *** It filtered licence paths with a
// regex of its own that matched the licence word only at the start of a path segment, so
// vendor/fonts/IBMPlexSerif-OFL.txt did not count and `fonts` was reported as having NO PAPERWORK AT ALL.
// world/orrery.mjs's header records that exact harm happening THREE TIMES in one session before it widened
// LICENCE_NAME to match the word anywhere in a filename. Writing a second copy of a scan the tree had already
// fixed reproduced the bug it was fixed for; isLicenceFile is imported now.
//
// SABOTAGES (4, all logged, MEASURED 1/2/2/1 by name):
//   A. made COLLECTIVE match nothing -> "three.js authors" and "IBM Corp" read as PEOPLE. 1 red.
//   B. turned DISCLAIMED off -> htmx gains an author called "The Author". 2 red, including the named row.
//   C. reverted to the first draft's narrow licence regex -> `fonts` accused of having no paperwork.
//      *** IT COST ONE RED AT FIRST, AND THAT IS WHY SECTION 2 GAINED A ROW. *** `none: 1` is a valid bucket
//      and the partition still sums, so the census went on looking healthy while a properly licensed body was
//      falsely accused; only the bake-vs-scan comparison moved. Section 2 now asks a SECOND, INDEPENDENT
//      reader -- world/orrery.mjs's own CAPTURED/UNPAPERED decision -- and the sabotage costs 2 red naming
//      `fonts`. In the round itself this was found by LOOKING at the row, not by a gate.
//   D. dropped the unattributed block from the page -> the live browser row goes red. 1 red.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as A from "../../world/orreryAuthor.mjs";
import { licenceFor } from "../../world/orrery.mjs";
import { build, BAKE } from "./orreryAuthorScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("tools/ship/orreryAuthor-selfcheck.mjs");

const BAKED = JSON.parse(fs.readFileSync(path.join(ENG, BAKE), "utf8"));
const FRESH = build(ENG);

console.log("\n1. a copyright line says one of six things, and the fixtures are the real ones");
{
    // SABOTAGE A: let COLLECTIVE match nothing -> "three.js authors" and "IBM Corp" read as people. 2 red.
    const cases = [
        ["Copyright (c) 2026 Erin Catto", "person", "Erin Catto"],
        ["Copyright © 2010-2023 three.js authors", "collective", "three.js authors"],
        ["Copyright (c) [2024] [Dunfan Lu]", "person", "Dunfan Lu"],
        ["Copyright (c) 2017 IBM Corp. with Reserved Font Name \"Plex\"", "collective", "IBM Corp"],
        ["Copyright (c) 2026 Krbn contributors", "collective", "Krbn contributors"],
        ["Copyright (c) 2020 The Author", "disclaimed", null],
        ["Copyright 2019 Some One. All rights reserved.", "person", "Some One"],
    ];
    const wrong = [];
    for (const [line, kind, who] of cases) {
        const h = A.holderFrom(line);
        const gotKind = h ? h.kind : "none", gotWho = h ? h.name : null;
        if (gotKind !== kind || gotWho !== who) wrong.push(`${line.slice(0, 34)}: want ${kind}/${who}, got ${gotKind}/${gotWho}`);
    }
    ok("!! *** every fixture lands on the kind and the name it is ***", wrong.length === 0, wrong.join("; ") || `${cases.length} of ${cases.length}`);
    ok("!! ...and a licence naming NOBODY is `disclaimed`, not a person called The Author",
        A.holderFrom("Copyright (c) 2020 The Author") ?.kind === "disclaimed",
        "htmx ships 0BSD and this is the whole finding: PAPERED IS NOT ATTRIBUTED");
    ok("...and the OFL's font-name clause is trimmed off the holder",
        A.holderFrom('Copyright (c) 2017 IBM Corp. with Reserved Font Name "Plex"').name === "IBM Corp",
        "keeping it would put a font name in an author's title");
    ok("...and text with no copyright line at all yields null rather than a guess",
        A.holderFrom("Permission to use, copy, modify and distribute this software") === null, "no invention");
}

console.log("\n2. the six kinds PARTITION the bodies, and nothing is dropped");
{
    const c = FRESH.counts;
    const sum = c.person + c.collective + c.disclaimed + c.prose + c.none + c.unread;
    ok("!! *** person + collective + disclaimed + prose + none + unread = every body ***", sum === c.bodies,
        `${c.person} + ${c.collective} + ${c.disclaimed} + ${c.prose} + ${c.none} + ${c.unread} = ${sum} of ${c.bodies}`);
    ok("!! ...and covered + unattributed = every body too, so the VIEW omits nothing", c.covered + c.missing === c.bodies,
        `${c.covered} covered by ${c.authors} authors + ${c.missing} unattributed = ${c.bodies}. A universe that ` +
        "quietly drops what it cannot name is a universe lying about its own coverage");
    // *** THE ROW THAT WOULD HAVE CAUGHT THIS ROUND'S OWN FALSE ACCUSATION, ADDED AFTER SABOTAGING FOR IT. ***
    // Reverting to the first draft's narrow licence regex costs only ONE red -- the bake-vs-scan comparison --
    // because `none: 1` is a perfectly valid bucket and the partition still sums. The census goes on looking
    // healthy while a properly licensed body is accused of having no paperwork. So this asks a SECOND,
    // INDEPENDENT reader: world/orrery.mjs has decided CAPTURED vs UNPAPERED since v4185, and a body it calls
    // CAPTURED cannot be `none` here. Two readers of one question disagreeing is the signal; one reader with a
    // plausible answer is not.
    const OJ = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
    const disagree = FRESH.bodies.filter((b) => b.kind === "none" &&
        licenceFor((OJ.bodies.find((x) => x.name === b.name) || {}).files?.map((f) => f.path) || []).found);
    ok("!! *** no body world/orrery.mjs calls CAPTURED is reported here as having no licence at all ***",
        disagree.length === 0,
        disagree.length ? disagree.map((b) => b.name).join(", ") + " -- ONE OF THE TWO READERS IS WRONG, and a " +
            "false accusation against a properly licensed dependency is the harm orrery.mjs's header records three times"
            : `${FRESH.counts.none} body(ies) with no licence, and orrery.mjs agrees on every one`);
    ok("...and every unattributed body carries the REASON it cannot be named",
        FRESH.unattributed.every((u) => ["disclaimed", "prose", "none", "unread"].includes(u.kind)),
        FRESH.unattributed.map((u) => u.name + ": " + u.kind).join(", ") || "none");
    REPORT.table("who the bytes say wrote each vendored body", ["body", "kind", "who", "evidence"],
        FRESH.bodies.map((b) => [b.name, b.kind, b.who || "-", b.licenceFile || "no licence file"]),
        `${c.attributed} of ${c.bodies} attributed, ${c.withUpstream} recording an upstream owner. Read from the ` +
        "copyright line on disk -- nothing inferred from a package or directory name.");
}

console.log("\n3. WHAT THIS TREE CANNOT SAY, stated as a number rather than left implied");
{
    const c = FRESH.counts;
    ok("!! *** only " + c.withUpstream + " of " + c.bodies + " bodies record WHERE they came from ***",
        c.withUpstream < c.bodies && c.withUpstream >= 1,
        "PROVENANCE.md exists for two bodies and a README for a third. The other twelve are attributed by " +
        "COPYRIGHT LINE ALONE: this tree knows who wrote them and not where they came from, which is the gap " +
        "an author-centred GitHub universe would need closed and which no round has closed yet");
    ok("...and an upstream, where present, resolves to an owner and a repo",
        FRESH.bodies.filter((b) => b.upstream).every((b) => !b.upstream.owner || (b.upstream.owner && b.upstream.repo)),
        FRESH.bodies.filter((b) => b.upstream && b.upstream.owner).map((b) => b.name + " -> " + b.upstream.owner + "/" + b.upstream.repo).join(", "));
    ok("...and a body with more than one licence says so rather than hiding the others",
        FRESH.bodies.filter((b) => b.licences > 1).every((b) => Array.isArray(b.alsoHolders)),
        FRESH.bodies.filter((b) => b.licences > 1).map((b) => b.name + ": " + b.licences + " licence files").join(", ") || "none");
}

console.log("\n4. the bake is what the scan produces -- no hand-edited middle");
{
    ok("!! *** " + BAKE + " equals a fresh scan of the tree ***",
        JSON.stringify({ ...BAKED, built: null }) === JSON.stringify({ ...FRESH, built: null }),
        "a baked record that drifts from its scanner is the defect four rounds of this session have been about");
    ok("...and every body in orrery.json has a row here, so an arrival cannot land unattributed and unseen",
        (() => { const O = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
                 return O.bodies.every((b) => BAKED.bodies.some((r) => r.name === b.name)); })(),
        `${BAKED.bodies.length} rows against orrery.json's bodies`);
    ok("...and every licence file the bake cites still exists",
        BAKED.bodies.filter((b) => b.licenceFile).every((b) => fs.existsSync(path.join(ENG, "vendor", b.name, b.licenceFile))),
        `${BAKED.bodies.filter((b) => b.licenceFile).length} paths checked -- every attribution stays falsifiable`);
}

console.log("\n5. THE PAGE ACTUALLY SHOWS IT -- an unwired bake is an orphan");
{
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const skip = browserSkipReason(pw.chromium, pw.from, HEADLESS_SHELL);
    if (skip) { say("SKIPPED -- " + skip); say("*** A SKIP AND NOT A PASS: sections 1-4 read the record; only this one renders it."); }
    else {
        const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
        const srv = http.createServer((q, r) => {
            const u = decodeURIComponent(String(q.url).split("?")[0]);
            const f = path.join(ENG, u === "/" ? "orrery.html" : u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end("no"); }
            r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
            r.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await br.newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" });
        await pg.waitForTimeout(1500);
        const shown = await pg.evaluate(() => {
            const b = document.getElementById("authbtn"); b.click();
            const card = document.getElementById("authors");
            return { visible: card.style.display !== "none", head: document.getElementById("ahead").textContent,
                     text: document.getElementById("alist").textContent, label: b.textContent };
        });
        ok("!! *** the author view opens and names the authors it baked ***",
            shown.visible && /\d+ authors, \d+ of \d+ bodies/.test(shown.head), `"${shown.head}", button now "${shown.label}"`);
        const named = FRESH.systems.slice(0, 3).map((s) => s.author);
        ok("...and the biggest systems are on screen BY NAME, not merely counted",
            named.every((a) => shown.text.includes(a)), named.join(", "));
        ok("!! ...and the unattributed bodies are DRAWN, with why, rather than omitted",
            FRESH.unattributed.every((u) => shown.text.includes(u.name)) && /unattributed/.test(shown.text),
            FRESH.unattributed.map((u) => u.name).join(", ") + " -- the count in the heading and the list agree");
        ok("  and the page threw nothing", errs.length === 0, errs.join(" | ") || "clean");
        await br.close(); srv.close();
    }
}

say("WHAT THIS DOES NOT CLAIM. That the copyright line is TRUE -- it is what the vendored bytes assert, and a " +
    "licence copied wrong upstream is copied wrong here. That the author is the AUTHOR: vendor/draco holds " +
    "three.js's DRACOLoader.js and its licence names Mr.doob, so the body is named for a FORMAT and attributed " +
    "to the person who wrote the loader, which is correct about the bytes and misleading about the name. That " +
    "one holder speaks for a body with three licence files -- vendor/wasm has three, and the first that parses " +
    "wins with the others reported beside it. And it is NOT the GitHub universe Keith asked for: twelve of the " +
    "fifteen have no upstream recorded anywhere in the tree, so there is nothing to centre a repository graph " +
    "on. This is the field that view needs, measured; the view itself is a list beside the orrery, not a map.");

REPORT.write();
console.log(`\norreryAuthor-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
