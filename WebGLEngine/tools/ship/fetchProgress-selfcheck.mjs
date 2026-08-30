// WebGLEngine/tools/ship/fetchProgress-selfcheck.mjs -- v4199
//
// GATES net/fetchProgress.mjs and net/fetchProgress.js.
//
// *** THE REPORTING HALF ALREADY EXISTED AND IS ALREADY RIGHT. *** ui/localModelRun.js's progressLine()
// returns pct: null rather than inventing a number when the total is unknown, citing this tree's own "flag
// that lies" precedent. What was missing was anything on the ENGINE side producing those events at all --
// splat.load, realTerrain.load and schematic.load fetch large assets and report nothing.
//
// *** AND SECTION 3 MEASURES A DEFECT IN THAT EXISTING MODEL. *** progressLine is right about a MISSING
// Content-Length and wrong about a COMPRESSED one: Content-Length counts bytes on the wire, getReader()
// yields bytes after decoding, and progressLine clamps with Math.min(100, ...). Served gzip, it shows 100%
// on the first chunk and sits there. Measured live against a local server, both branches in one run.
//
// Run: node tools/ship/fetchProgress-selfcheck.mjs

import { totalIsComparable, progressEvent, validateProgress } from "../../net/fetchProgress.mjs";
import { progressLine } from "../../ui/localModelRun.js";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import zlib from "node:zlib";
import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// 1) WHEN A TOTAL CAN BE TRUSTED.
{
    ok(totalIsComparable("200000", null), "a plain Content-Length is comparable");
    ok(totalIsComparable("200000", "identity"), "and identity encoding is still plain");
    ok(!totalIsComparable("235", "gzip"), "*** gzip breaks the comparison ***");
    ok(!totalIsComparable("235", "br"), "and br");
    ok(!totalIsComparable("235", "zstd"), "and zstd -- the test is 'is there an encoding', not a list of known ones");
    ok(!totalIsComparable(null, null), "no Content-Length is not comparable");
    ok(!totalIsComparable("0", null) && !totalIsComparable("-5", null), "and neither is zero or negative");
    ok(!totalIsComparable("abc", null), "or a header that is not a number");
    // The list-of-known-encodings trap, asserted so nobody 'optimises' it back in.
    ok(!/gzip.*br.*deflate/.test(codeOnly(read("net/fetchProgress.mjs"))),
        "the model does not enumerate encodings -- a list would start lying the day a new one ships");
}

// 2) THE EVENT SHAPE, AND WHY A TOTAL IS MISSING.
{
    const plain = progressEvent(200000, "200000", null);
    ok(plain.total === 200000 && validateProgress(plain).length === 0, "a plain download reports a real total");
    const gz = progressEvent(200000, "235", "gzip");
    ok(gz.total === null, "*** a gzipped one reports NO total rather than a wrong one ***");
    ok(/compressed bytes/.test(gz.totalUnknownBecause), `and says why: "${gz.totalUnknownBecause}"`);
    const none = progressEvent(4096, null, null);
    ok(none.total === null && /no Content-Length/.test(none.totalUnknownBecause), "as does a missing header, with its own reason");
    ok(validateProgress({ loaded: 200000, total: 235, totalUnknownBecause: null }).some((p) => /exceeds total/.test(p)),
        "validateProgress catches loaded > total -- the shape of the bug this module exists for");
    ok(validateProgress({ loaded: 1, total: null }).some((p) => /reason/.test(p)),
        "and a missing total with no reason given");
    // The events feed the EXISTING reporter, not a second one.
    ok(progressLine(gz).pct === null, "*** progressLine, given this event, correctly shows no percentage ***");
    ok(/total size not reported/.test(progressLine(gz).text), `and says so in words: "${progressLine(gz).text}"`);
    ok(progressLine(plain).pct === 100, "control: the plain event does yield a percentage, so the null above is a decision");
}

// 3) *** THE GZIP TRAP, MEASURED IN A REAL BROWSER AGAINST A REAL SERVER. ***
{
    const require_ = createRequire(import.meta.url);
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        note("SKIPPED -- " + skip);
        note("*** A SKIP, NOT A PASS. Sections 1-2 check the decision; only this one proves the numbers it decides on are real.");
    } else {
        note("chromium via " + pwFrom);
        const raw = Buffer.from("SweK".repeat(50000));          // 200000 bytes, very compressible
        const gz = zlib.gzipSync(raw);
        const srv = http.createServer((rq, rs) => {
            if (rq.url === "/") { rs.writeHead(200, { "Content-Type": "text/html" }); return rs.end("<!doctype html><title>p</title>"); }
            if (rq.url === "/gz") {
                rs.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Encoding": "gzip", "Content-Length": String(gz.length) });
                return rs.end(gz);
            }
            if (rq.url === "/none") { rs.writeHead(200, { "Content-Type": "application/octet-stream" }); return rs.end(raw); }
            rs.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": String(raw.length) });
            rs.end(raw);
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const port = srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
        const pg = await (await b.newContext()).newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
        const R = await pg.evaluate(async () => {
            const probe = async (p) => {
                const r = await fetch(p);
                const cl = r.headers.get("content-length"), enc = r.headers.get("content-encoding");
                const rd = r.body.getReader(); let loaded = 0;
                for (;;) { const { done, value } = await rd.read(); if (done) break; loaded += value.length; }
                return { contentLength: cl ? +cl : null, contentEncoding: enc, bytesRead: loaded };
            };
            return { plain: await probe("/plain"), gzipped: await probe("/gz"), none: await probe("/none") };
        });
        ok(errs.length === 0, "the page ran with no script error");
        ok(R.plain.bytesRead === R.plain.contentLength,
            `plain: ${R.plain.bytesRead} bytes read against Content-Length ${R.plain.contentLength} -- they agree`);
        ok(R.gzipped.bytesRead === 200000 && R.gzipped.contentLength < 1000,
            `*** gzipped: Content-Length ${R.gzipped.contentLength} but ${R.gzipped.bytesRead} bytes read -- ` +
            `a factor of ${Math.round(R.gzipped.bytesRead / R.gzipped.contentLength)} ***`);
        const naive = (R.gzipped.bytesRead / R.gzipped.contentLength) * 100;
        ok(naive > 1000,
            `a naive percentage would read ${naive.toFixed(0)}%, and progressLine's Math.min(100, ...) would ` +
            `pin it at 100% on the FIRST CHUNK and hold it there for the whole download`);
        // And the model, given the real measured headers, refuses the comparison.
        ok(!totalIsComparable(R.gzipped.contentLength, R.gzipped.contentEncoding),
            "*** fed the REAL measured headers, the model reports the total as untrustworthy ***");
        ok(totalIsComparable(R.plain.contentLength, R.plain.contentEncoding),
            "and trusts the plain one -- so the refusal is a decision, not a blanket");
        ok(R.none.contentLength === null && !totalIsComparable(R.none.contentLength, R.none.contentEncoding),
            "a server sending no Content-Length is refused too, for a different stated reason");
        await b.close(); srv.close();
    }
}

// 4) PURITY AND WIRING.
{
    const model = codeOnly(read("net/fetchProgress.mjs"));
    ok(!/\bfetch\(|\bdocument\b|\bwindow\b|Math\.random|Date\.now/.test(model),
        "the model has no fetch, no DOM, no clock -- the decision is testable without a network");
    ok(/from "\.\/fetchProgress\.mjs"/.test(noComments(read("net/fetchProgress.js"))),
        "the transport half uses the model rather than a second copy of the rule");
    ok(!/content-encoding/i.test(codeOnly(read("net/fetchProgress.js")).replace(/getReader|arrayBuffer/g, "")),
        "*** and decides nothing itself -- one owner for whether a total can be trusted ***");
    ok(/arrayBuffer/.test(codeOnly(read("net/fetchProgress.js"))),
        "it falls back to arrayBuffer() when there is no stream, rather than trading no-progress for no-download");
    ok(/progressLine|localModelRun/.test(prose(read("net/fetchProgress.mjs"))),
        "the model names the reporter it feeds, so nobody grows a second one");
    ok(/851|Content-Length counts compressed/.test(prose(read("net/fetchProgress.mjs"))),
        "and records the measurement rather than an adjective");
    // *** THE WIRING, BY STATEMENT AND CALL -- not by spotting the path in a string. ***
    const m = noComments(read("main.js"));
    ok(/import\s*\{[^}]*\bfetchWithProgress\b[^}]*\}\s*from\s*["']\.\/net\/fetchProgress\.js["']/.test(m),
        "main.js imports fetchWithProgress by statement");
    ok(/await\s+fetchWithProgress\s*\(/.test(codeOnly(read("main.js"))),
        "*** and window.splat.load AWAITS it -- the loader that reported nothing now reports ***");
    ok(!/const r = await fetch\(url, \{ cache: "no-store" \}\)/.test(codeOnly(read("main.js"))),
        "and the bare fetch it replaced is GONE, not left beside it");
}

console.log(`fetchProgress-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether any caller SHOWS the progress it now receives. What is checked
is that a total is trusted only when it describes the same bytes the reader counts, that a gzipped response
is refused with its reason, and that the refusal is measured against a real server rather than assumed.`);
process.exit(fail ? 1 : 0);
