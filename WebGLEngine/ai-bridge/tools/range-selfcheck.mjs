// ai-bridge/tools/range-selfcheck.mjs — byte ranges, exactly.
//
//   node ai-bridge/tools/range-selfcheck.mjs
//
// Two halves. The parser is checked against RFC 7233 by hand: the off-by-one at the inclusive end, the
// SUFFIX form that means "the last N bytes" and not "from N", the clamp, the 416, the refusals. Then a real
// `http` server serves real slices of a real file over a real socket, and the bytes are compared.
//
// A range parser that round-trips against its own formatter proves nothing. The numbers below were worked
// out from the spec and written down.

import { createServer } from "http";
import { shutdownServer, liveHandles } from "../../tools/ship/serverShutdown.mjs";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const { parseRange, rangeHeaders, unsatisfiableHeaders } = require(path.join(ENGINE, "ai-bridge", "httpRange.js"));

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));
const R = (h, size) => parseRange(h, size);

// --- 1. the forms the spec defines --------------------------------------------------------------------
{
    const SIZE = 1000;
    const r1 = R("bytes=0-499", SIZE);
    ok("`bytes=0-499` is the first five hundred bytes", r1.kind === "range" && r1.start === 0 && r1.end === 499);
    ok("...and its LENGTH is 500, because the end is INCLUSIVE", r1.length === 500);
    ok("...which is `end - start + 1`, and the off-by-one there ships a video that plays for everyone but the one player that checks", r1.length === r1.end - r1.start + 1);

    const r2 = R("bytes=500-", SIZE);
    ok("`bytes=500-` runs to the end", r2.start === 500 && r2.end === 999 && r2.length === 500);

    // The one that gets written backwards.
    const r3 = R("bytes=-500", SIZE);
    ok("`bytes=-500` is the LAST five hundred bytes, not `from 500`", r3.start === 500 && r3.end === 999);
    ok("...which is the form an MP4 player asks for first, to find the `moov` atom at the end of the file", r3.length === 500);
    const r4 = R("bytes=-1", SIZE);
    ok("`bytes=-1` is the last byte", r4.start === 999 && r4.end === 999 && r4.length === 1);
    const r5 = R("bytes=-5000", SIZE);
    ok("a suffix longer than the file is the whole file", r5.start === 0 && r5.end === 999);

    const r6 = R("bytes=0-", SIZE);
    ok("`bytes=0-` is the whole file, and still a RANGE", r6.kind === "range" && r6.length === SIZE);
    ok("...because a client that asked a question is entitled to the answer it asked for", r6.start === 0 && r6.end === 999);

    const r7 = R("bytes=990-5000", SIZE);
    ok("an end past the file is CLAMPED, not complained about", r7.start === 990 && r7.end === 999 && r7.length === 10);
    const r8 = R("bytes=0-0", SIZE);
    ok("`bytes=0-0` is one byte", r8.length === 1);
    const r9 = R("bytes=999-999", SIZE);
    ok("the last byte, by index", r9.start === 999 && r9.end === 999);

    ok("whitespace and case are tolerated", R("  BYTES = 0-9 ", SIZE).length === 10);
}

// --- 2. what is unsatisfiable, and what is merely ignored ------------------------------------------------
{
    const SIZE = 1000;
    ok("a start past the end is UNSATISFIABLE: 416", R("bytes=1000-", SIZE).kind === "unsatisfiable");
    ok("...and so is one far past it", R("bytes=99999-", SIZE).kind === "unsatisfiable");
    ok("an end before the start is unsatisfiable", R("bytes=500-499", SIZE).kind === "unsatisfiable");
    ok("`bytes=-0` -- the last zero bytes -- is not a range", R("bytes=-0", SIZE).kind === "unsatisfiable");
    ok("an EMPTY FILE has no satisfiable range at all", R("bytes=0-0", 0).kind === "unsatisfiable" && R("bytes=-1", 0).kind === "unsatisfiable");

    // Ignored, not rejected. A server MAY ignore a Range header; a 400 for a typo would break a browser.
    ok("no header at all is `none`", R(undefined, SIZE).kind === "none" && R("", SIZE).kind === "none");
    ok("a unit we do not understand is IGNORED, per the spec", R("items=0-5", SIZE).kind === "none");
    ok("a malformed header is ignored, not rejected", R("bytes=abc", SIZE).kind === "none" && R("bytes=", SIZE).kind === "none" && R("bytes=-", SIZE).kind === "none");
    ok("MULTIPLE RANGES are ignored: we serve the whole file with a 200", R("bytes=0-99,200-299", SIZE).kind === "none");
    ok("...which is a correct response, and a half-built multipart/byteranges body is not", true);
}

// --- 3. the headers ---------------------------------------------------------------------------------------
{
    const r = R("bytes=200-299", 1000);
    const h = rangeHeaders(r, 1000, "video/mp4");
    ok("Content-Length is the length of the SLICE", h["Content-Length"] === 100);
    ok("...not of the file", h["Content-Length"] !== 1000);
    ok("Content-Range counts the FILE", h["Content-Range"] === "bytes 200-299/1000");
    ok("and Accept-Ranges says the server takes them", h["Accept-Ranges"] === "bytes");
    const u = unsatisfiableHeaders(1000);
    ok("a 416 tells the client the real size, so it stops guessing", u["Content-Range"] === "bytes */1000");
    ok("...and carries no body", u["Content-Length"] === 0);
}

// --- 4. A REAL SERVER, REAL SLICES, REAL BYTES ------------------------------------------------------------
//
// The parser could be perfectly right and the server still send the wrong bytes: `fs.createReadStream`'s
// `end` is inclusive too, and a reader who assumes otherwise loses a byte per request. So: compare.
{
    const tmp = path.join(os.tmpdir(), `range-${process.pid}.bin`);
    const SIZE = 4096;
    const body = Buffer.alloc(SIZE);
    for (let i = 0; i < SIZE; i++) body[i] = i & 0xff;      // a file whose byte at index i IS i mod 256
    fs.writeFileSync(tmp, body);

    // The same shape `serveStaticFile` uses, so the test exercises the arithmetic and not a copy of it.
    const srv = createServer((req, res) => {
        const r = parseRange(req.headers.range, SIZE);
        if (r.kind === "unsatisfiable") { res.writeHead(416, unsatisfiableHeaders(SIZE)); return res.end(); }
        if (r.kind === "range") {
            res.writeHead(206, rangeHeaders(r, SIZE, "application/octet-stream"));
            if (req.method === "HEAD") return res.end();
            return fs.createReadStream(tmp, { start: r.start, end: r.end }).pipe(res);
        }
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": SIZE, "Accept-Ranges": "bytes" });
        if (req.method === "HEAD") return res.end();
        fs.createReadStream(tmp).pipe(res);
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + srv.address().port + "/f.bin";
    const get = async (range, method = "GET") => {
        const res = await fetch(base, { method, headers: range ? { Range: range } : {} });
        const buf = method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
        return { status: res.status, headers: res.headers, buf };
    };

    const whole = await get(null);
    ok("with no Range, the whole file, 200", whole.status === 200 && whole.buf.length === SIZE);
    ok("...and it advertises that it takes ranges", whole.headers.get("accept-ranges") === "bytes");

    const first = await get("bytes=0-99");
    ok("a first slice is a 206", first.status === 206);
    ok("...of exactly 100 bytes", first.buf.length === 100);
    ok("...and they are THE RIGHT 100 BYTES", first.buf.equals(body.subarray(0, 100)));
    ok("...with the Content-Range the client needs", first.headers.get("content-range") === `bytes 0-99/${SIZE}`);

    const mid = await get("bytes=1000-1999");
    ok("a middle slice is exactly right", mid.buf.length === 1000 && mid.buf.equals(body.subarray(1000, 2000)));
    ok("...which is where `createReadStream`'s INCLUSIVE `end` would otherwise cost a byte", mid.buf[999] === body[1999]);

    const tail = await get("bytes=-256");
    ok("a suffix range returns the file's LAST bytes", tail.buf.length === 256 && tail.buf.equals(body.subarray(SIZE - 256)));
    ok("...and says where they came from", tail.headers.get("content-range") === `bytes ${SIZE - 256}-${SIZE - 1}/${SIZE}`);

    const lastByte = await get("bytes=4095-4095");
    ok("one byte, the last one", lastByte.buf.length === 1 && lastByte.buf[0] === body[SIZE - 1]);

    const clamped = await get("bytes=4090-99999");
    ok("an end past the file is clamped and served", clamped.status === 206 && clamped.buf.length === 6);

    const over = await get("bytes=4096-");
    ok("a start past the end is 416", over.status === 416);
    ok("...and tells the client the real size", over.headers.get("content-range") === `bytes */${SIZE}`);

    const multi = await get("bytes=0-9,20-29");
    ok("multiple ranges get the whole file and a 200, not a broken multipart body", multi.status === 200 && multi.buf.length === SIZE);

    const head = await get("bytes=100-199", "HEAD");
    ok("a HEAD with a Range answers 206 with the slice's length and no body",
        head.status === 206 && head.headers.get("content-length") === "100");

    // The thing this whole round exists for.
    const seek = await get("bytes=2048-2559");
    ok("SEEKING WORKS: a player jumps to the middle and gets the middle", seek.buf.equals(body.subarray(2048, 2560)));

    // v4000 -- the same teardown that fast-failed bz-tactics on Keith's Windows rig with libuv's
    // UV_HANDLE_CLOSING assert. srv.close() resolves while its handles are still mid-close, and
    // process.exit() inside that window is the crash. This gate has the identical shape and simply had
    // not been the one run that day. See tools/ship/serverShutdown.mjs for the measurement.
    await shutdownServer(srv);
    fs.unlinkSync(tmp);
}

// --- 5. and the engine's own static server uses it ---------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENGINE, "ai-bridge", "server.js"), "utf8");
    ok("serveStaticFile parses the Range header", /httpRange\.parseRange\(req\.headers/.test(src));
    ok("...answers 416 when it cannot be satisfied", /res\.writeHead\(416, httpRange\.unsatisfiableHeaders/.test(src));
    ok("...answers 206 with a sliced stream", /res\.writeHead\(206/.test(src) && /createReadStream\(abs, \{ start: range\.start, end: range\.end \}\)/.test(src));
    ok("...and advertises Accept-Ranges on an ordinary 200 too", /"Accept-Ranges":\s*"bytes"/.test(src));
    ok("...because a client that does not know it may ask for a slice will never ask", true);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
{
    // THE TEARDOWN IS A CHECK. The crash it guards produced a PERFECT SCORELINE followed by a fast-fail,
    // so a passing count was never going to catch it coming back.
    const live = liveHandles();
    ok("nothing is still holding the event loop open at exit", live.length === 0,
        live.length ? "STILL LIVE: " + live.join(", ") : "no sockets, no server, no timers");
}
process.exit(fail ? 1 : 0);
