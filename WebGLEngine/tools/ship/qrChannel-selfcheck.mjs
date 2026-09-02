#!/usr/bin/env node
// WebGLEngine/tools/ship/qrChannel-selfcheck.mjs -- v4301
//
// GATES ui/qrDecode.mjs AND ui/qrChannel.mjs -- the decoder this tree never had, and the frame protocol on
// top of it. Idea from ruvnet/rvQR (MIT); no code from it. Everything here runs in Node with no camera: the
// encoder is the vendored ui/vendor/qrcode.mjs, the decoder reads its matrix back, and the two must be
// inverse over EVERY version and level, not the one the channel happens to use.
//
// *** THE CHECK THAT MAKES THE DECODER REAL IS SECTION 3. *** A decoder that merely reads bits back from a
// clean matrix has not done the hard part; the Reed-Solomon correction is what lets a camera's misread
// modules through. So modules are flipped INSIDE the data region -- up to the code's capacity it must still
// return the exact bytes, and past it it must THROW rather than hand back something plausible. The second
// half is the control: a decoder with correction disabled would pass every clean round trip and fail only
// here.
//
// *** THE CHECK THAT MAKES THE CHANNEL HONEST IS SECTION 5. *** Drop one frame and assemble() must refuse
// and NAME it; corrupt one byte after the manifest was made and the SHA-256 must refuse. A short buffer
// returned quietly is the failure rvQR's own README lists first, and it is the one this file cannot let
// through.
//
// Run: node tools/ship/qrChannel-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "../../ui/qrDecode.mjs";
import * as C from "../../ui/qrChannel.mjs";
import { qrcode } from "../../ui/vendor/qrcode.mjs";
import { sha256Hex } from "../../tools/sha256.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");
const encode = (bytes, v, ec) => { const q = qrcode(v, ec); q.addData(latin1(bytes), "Byte"); q.make(); return q; };
const pattern = (n, salt) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 131 + salt * 7 + 3) & 255; return b; };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------------------------------------------------
sec("1. THE TABLES ARE THE VENDORED ENCODER'S OWN, NOT A RETYPING");
// ---------------------------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ui/vendor/qrcode.mjs"), "utf8");
    const slice = (name) => { const i = src.indexOf(`const ${name} = [`); return src.slice(i, src.indexOf("];", i)); };
    const rows = [...slice("RS_BLOCK_TABLE").matchAll(/\[([0-9,\s]+)\]/g)].map((m) => m[1].replace(/\s/g, "").split(",").map(Number));
    const bad = rows.filter((r, i) => JSON.stringify(r) !== JSON.stringify(D.RS_BLOCK_TABLE[i]));
    ok(rows.length === 160 && D.RS_BLOCK_TABLE.length === 160 && bad.length === 0,
       "*** RS_BLOCK_TABLE: all 160 rows equal the vendored source, parsed rather than trusted ***",
       `${rows.length} vendored rows, ${bad.length} differ`);
    const pos = [...slice("PATTERN_POSITION_TABLE").matchAll(/\[([0-9,\s]*)\]/g)].map((m) => m[1].replace(/\s/g, "").split(",").filter(Boolean).map(Number));
    ok(pos.length === 40 && pos.every((r, i) => JSON.stringify(r) === JSON.stringify(D.PATTERN_POSITION_TABLE[i])),
       "PATTERN_POSITION_TABLE: all 40 rows equal the vendored source");
    const hdr = fs.readFileSync(path.join(ENG, "ui/qrDecode.mjs"), "utf8").slice(0, 6000);
    ok(/Copyright \(c\) 2009 Kazuhiko Arase/.test(hdr) && /Permission is hereby granted, free of charge/.test(hdr) && /THE SOFTWARE IS PROVIDED "AS IS"/.test(hdr),
       "and the copy carries the MIT copyright AND permission notice in full, as a copy must",
       "a pointer to the licence is what copiedOutsideVendor found wanting at v4263");
    ok(Object.isFrozen(D.RS_BLOCK_TABLE) && Object.isFrozen(D.RS_BLOCK_TABLE[0]), "the tables are frozen");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. ENCODER AND DECODER ARE INVERSE OVER EVERY VERSION AND LEVEL, AT FULL CAPACITY");
// ---------------------------------------------------------------------------------------------------------
{
    let tried = 0, wrong = [], t0 = Date.now();
    for (let v = 1; v <= 40; v++) for (const ec of ["L", "M", "Q", "H"]) {
        const cap = C.chunkFor(v, ec) + C.HEADER_BYTES, bytes = pattern(cap, v);
        tried++;
        try {
            const q = encode(bytes, v, ec), n = q.getModuleCount();
            const r = D.decodeQR((a, b) => q.isDark(a, b), n);
            if (r.version !== v || r.ec !== ec || !same(r.bytes, bytes)) wrong.push(`${v}-${ec}`);
        } catch (e) { wrong.push(`${v}-${ec}: ${e.message}`); }
    }
    ok(tried === 160 && wrong.length === 0, "*** 160 of 160 round trips return the exact bytes, version and level ***",
       wrong.length ? wrong.slice(0, 5).join(" | ") : `${tried} symbols in ${Date.now() - t0} ms`);
    ok(D.versionOf(21) === 1 && D.versionOf(177) === 40, "version is read from the side length: 21 -> 1, 177 -> 40");
    let threw = false; try { D.versionOf(22); } catch { threw = true; } ok(threw, "and a size no symbol has is refused");
    // capacity is what makes every throughput number below arithmetic
    ok(D.dataCapacity(1, "L") === 19 && D.dataCapacity(40, "L") === 2956 && D.dataCapacity(19, "L") === 795,
       "data capacity: v1-L 19, v19-L 795, v40-L 2956 codewords (ISO 18004 table 7)",
       `${D.dataCapacity(19, "L")} -- I first typed 792 for v19-L from memory; the table says 3x113 + 4x114`);
    ok(C.chunkFor(19, "L") === 795 - 3 - C.HEADER_BYTES, "a v19-L frame carries capacity minus 3 bytes (mode + 16-bit length is 20 bits) minus the 12-byte header",
       `${C.chunkFor(19, "L")} payload bytes`);
    // the modes this decoder also reads: numeric and alphanumeric, which the encoder picks for such text
    const qn = qrcode(2, "M"); qn.addData("0123456789012345", "Numeric"); qn.make();
    const rn = D.decodeQR((a, b) => qn.isDark(a, b), qn.getModuleCount());
    ok(rn.text === "0123456789012345" && rn.segments[0].mode === "numeric", "a numeric segment decodes to its digits", rn.text);
    const qa = qrcode(2, "M"); qa.addData("HELLO WORLD $1.50", "Alphanumeric"); qa.make();
    const ra = D.decodeQR((a, b) => qa.isDark(a, b), qa.getModuleCount());
    ok(ra.text === "HELLO WORLD $1.50" && ra.segments[0].mode === "alphanumeric", "an alphanumeric segment decodes to its text", ra.text);
}

// ---------------------------------------------------------------------------------------------------------
sec("3. REED-SOLOMON: FLIPPED MODULES ARE CORRECTED UP TO CAPACITY, AND REFUSED PAST IT");
// ---------------------------------------------------------------------------------------------------------
{
    const text = "The quick brown fox jumps over the lazy dog", bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
    const q = encode(bytes, 5, "M"), n = q.getModuleCount(), map = D.functionPatternMap(n);
    const dataCells = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!map[r * n + c]) dataCells.push(r * n + c);
    const flipSet = (count, stride) => { const s = new Set(); for (let i = 0; i < dataCells.length && s.size < count; i += stride) s.add(dataCells[i]); return s; };
    const view = (flipped) => (r, c) => flipped.has(r * n + c) ? !q.isDark(r, c) : q.isDark(r, c);
    // v5-M: 2 blocks of 67 with 43 data -> 24 ec codewords per block -> corrects 12 codewords per block
    const blocks = D.rsBlocks(5, "M");
    ok(blocks.length === 2 && blocks[0].total === 67 && blocks[0].data === 43, "v5-M is two blocks of 67 codewords, 43 data", JSON.stringify(blocks[0]));
    // 24 flips spread by a prime stride touch at most 24 codewords across two blocks of t = 12 each. The
    // first draft flipped 40 and CRASHED the gate -- 40 modules landed in more than 12 codewords of one
    // block, which is past capacity: a correct refusal, exercised by accident, and a gate that dies on an
    // exception instead of printing a FAIL line. Both fixed here.
    let light = null, lightErr = null;
    try { light = D.decodeQR(view(flipSet(24, 53)), n); } catch (e) { lightErr = e.message; }
    ok(light !== null && light.text === text && light.corrected > 0, "*** 24 flipped modules, spread across the data region: exact text back, with corrections counted ***",
       light ? `${light.corrected} codewords corrected` : lightErr);
    let refused = null, wrongText = null;
    try { const r = D.decodeQR(view(flipSet(400, 2)), n); wrongText = r.text; } catch (e) { refused = e.message; }
    ok(refused !== null, "*** 400 flipped modules: the decoder THROWS rather than returning plausible bytes ***",
       refused ? refused.slice(0, 90) : "returned: " + JSON.stringify(wrongText));
    // the block-level primitive, on its own numbers: t errors in a (26,19) code correct, t+1 do not
    // 17 bytes, not 19: v1-L holds 19 codewords = 152 bits, and byte mode spends 12 on mode and length.
    // The first draft asked for 19 and the encoder threw "code length overflow (164>152)" -- arithmetic, not a bug.
    const q1 = encode(pattern(17, 1), 1, "L"), n1 = q1.getModuleCount();
    const raw = D.deinterleave(D.readCodewords((a, b) => q1.isDark(a, b), n1, D.readFormat((a, b) => q1.isDark(a, b), n1).mask), D.rsBlocks(1, "L"))[0];
    const hurt = (k) => { const b = raw.slice(); for (let i = 0; i < k; i++) b[i * 3] ^= 0x5a; return b; };
    const three = hurt(3); const fixed3 = D.rsCorrect(three, 7);
    ok(fixed3 === 3 && same(three, raw), "a (26,19) block with 3 corrupted codewords is restored exactly", `${fixed3} corrected`);
    let over = false; try { D.rsCorrect(hurt(4), 7); } catch { over = true; }
    ok(over, "and 4 -- past t = 3 -- is refused, never miscorrected into a different valid codeword");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. FORMAT AND MASK: READ FROM THE SYMBOL, TOLERANT OF DAMAGE, EXACT WHEN CLEAN");
// ---------------------------------------------------------------------------------------------------------
{
    const seen = new Set();
    for (let salt = 0; salt < 24; salt++) { const q = encode(pattern(30, salt), 3, "Q"); seen.add(D.readFormat((a, b) => q.isDark(a, b), q.getModuleCount()).mask); }
    ok(seen.size >= 4, "the encoder picks different masks for different data, and each is read back", `${seen.size} distinct masks over 24 symbols`);
    const q = encode(pattern(12, 9), 2, "H"), n = q.getModuleCount();   // v2-H holds 16 codewords: 12 bytes fit, 20 did not
    const f = D.readFormat((a, b) => q.isDark(a, b), n);
    ok(f.ec === "H" && f.distance === 0, "level H reads back as H at Hamming distance 0", JSON.stringify(f));
    // damage both copies in different places: the nearest valid code still wins
    const dmg = new Set([8 * n + (n - 1), 8 * n + (n - 3), 2 * n + 8]);
    const f2 = D.readFormat((r, c) => dmg.has(r * n + c) ? !q.isDark(r, c) : q.isDark(r, c), n);
    ok(f2.ec === "H" && f2.mask === f.mask && f2.distance > 0, "three damaged format modules: same level and mask, distance reported",
       `distance ${f2.distance}`);
    ok(D.formatCode(0) === 0x5412 && D.formatCode((D.EC_BITS.L << 3) | 0) === 0x77c4,
       "the BCH format codes match the standard's published values: M/mask0 = 0x5412, L/mask0 = 0x77C4");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. THE CHANNEL: FRAMES ROUND-TRIP THROUGH SYMBOLS, AND A GAP OR A CORRUPTION IS REFUSED BY NAME");
// ---------------------------------------------------------------------------------------------------------
{
    const payload = new Uint8Array(3000); for (let i = 0; i < payload.length; i++) payload[i] = (i * 7919 + (i >> 8)) & 255;
    const P = await C.payloadToMatrices(payload, { version: 19, ec: "L", chunkBytes: 256 });
    ok(P.total === 1 + Math.ceil(3000 / 256) && P.matrices.length === P.total, "3000 bytes at 256 per frame is a manifest plus 12 data frames", `${P.total} frames`);
    ok(P.hash === sha256Hex(payload) && P.id === P.hash.slice(0, 8), "the manifest carries the payload's SHA-256 and the stream id is its first four bytes");
    const rx = new C.Receiver();
    for (const m of P.matrices) rx.accept(C.matrixToFrame(m.isDark, m.n));
    const out = rx.assemble();
    ok(same(out, payload), "*** every frame through encoder, matrix and decoder: the payload is byte-identical ***", `${out.length} bytes`);
    // out of order and duplicated: costs nothing
    const rx2 = new C.Receiver(); const order = [...P.matrices].reverse().concat(P.matrices.slice(3, 6));
    for (const m of order) rx2.accept(C.matrixToFrame(m.isDark, m.n));
    ok(same(rx2.assemble(), payload) && rx2.duplicates === 3, "reversed arrival plus three duplicates: same bytes, duplicates counted", `${rx2.duplicates} duplicates`);
    // a dropped frame
    const rx3 = new C.Receiver(); P.matrices.forEach((m, i) => { if (i !== 5) rx3.accept(C.matrixToFrame(m.isDark, m.n)); });
    let gap = null; try { rx3.assemble(); } catch (e) { gap = e.message; }
    ok(gap !== null && /missing: 5\b/.test(gap) && !rx3.complete && JSON.stringify(rx3.missing()) === "[5]",
       "*** frame 5 dropped: assemble() refuses and names it; missing() says [5] ***", gap);
    // a dropped manifest is a gap too -- data alone cannot be verified
    const rx4 = new C.Receiver(); P.matrices.forEach((m, i) => { if (i !== 0) rx4.accept(C.matrixToFrame(m.isDark, m.n)); });
    let noManifest = null; try { rx4.assemble(); } catch (e) { noManifest = e.message; }
    ok(noManifest !== null && rx4.missing()[0] === 0, "without the manifest there is no length and no hash, so nothing assembles", noManifest);
    // a corrupted chunk with the right length: only the hash can see it
    const enc = C.encodeFrames(payload, { chunkBytes: 256 });
    const rx5 = new C.Receiver(); enc.frames.forEach((f, i) => { const g = Uint8Array.from(f); if (i === 4) g[C.HEADER_BYTES + 10] ^= 1; rx5.accept(g); });
    let bad = null; try { rx5.assemble(); } catch (e) { bad = e.message; }
    ok(bad !== null && /SHA-256 mismatch/.test(bad), "*** one bit flipped in frame 4's body: the SHA-256 refuses it ***", bad);
    // a frame from another stream is refused, not mixed in
    const other = C.encodeFrames(pattern(700, 3), { chunkBytes: 256 });
    const rx6 = new C.Receiver(); enc.frames.forEach((f) => rx6.accept(f)); const res = rx6.accept(other.frames[1]);
    ok(res.foreign === true && rx6.foreign === 1 && same(rx6.assemble(), payload), "a frame with another stream id is counted as foreign and never assembled in");
    let junk = false; try { C.parseFrame(Uint8Array.from([1, 2, 3])); } catch { junk = true; }
    ok(junk, "bytes that are not a frame throw at parse, before any state changes");
}

// ---------------------------------------------------------------------------------------------------------
sec("6. THROUGHPUT IS TABLE ARITHMETIC, AND rvQR'S OWN FIGURE FALLS OUT OF IT");
// ---------------------------------------------------------------------------------------------------------
{
    const t = C.throughput({ version: 19, ec: "L", fps: 10, chunkBytes: 256 });
    ok(t.bytesPerSecond === 2560, "*** 256 bytes per frame at 10 fps is 2.56 KB/s -- rvQR's 'about 2.5 KB/s at the defaults' is this product ***", `${t.bytesPerSecond} B/s`);
    ok(Math.abs(t.secondsFor(40 * 1024) - 16.1) < 0.05, "and its 40 KB demo 'takes about 16 seconds': 161 frames at 10 fps is 16.1 s", `${t.secondsFor(40 * 1024).toFixed(1)} s -- the first draft asserted a rounded 17, which 16.1 is not`);
    const flat = C.throughput({ version: 19, ec: "L", fps: 10 });
    ok(flat.chunkBytes === 780 && flat.bytesPerSecond === 7800, "filling v19-L is 780 bytes per frame, 7.8 KB/s at 10 fps",
       `${flat.bytesPerSecond} B/s -- rvQR's '10 KB/s flat out' needs a higher version or frame rate than this`);
    const v40 = C.throughput({ version: 40, ec: "L", fps: 10 });
    ok(v40.chunkBytes === 2956 - 3 - C.HEADER_BYTES && v40.bytesPerSecond > 29000, "v40-L is 2941 bytes per frame: 29.4 KB/s at 10 fps, if a camera can read a 177-module symbol", `${v40.bytesPerSecond} B/s`);
    let tooBig = false; try { await C.frameToQR(new Uint8Array(800), { version: 19, ec: "L" }); } catch { tooBig = true; }
    ok(tooBig, "a frame larger than the symbol holds is refused before the encoder sees it");
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  rsCorrect returns 0 without touching the block.
//      -> exit=1, THREE lines in section 3: the 24-flip symbol comes back with 0 corrected (and wrong), the
//      (26,19) block is not restored, and -- the one that matters -- 4 errors are no longer REFUSED, because
//      a corrector that does nothing also never notices it cannot. Every clean round trip in section 2 stayed
//      green, which is exactly why section 3 exists.
//
//   B  assemble() returns the frames it has as a short buffer instead of throwing.
//      -> exit=1, two lines in section 5: the dropped-frame case and the dropped-manifest case. The short
//      buffer is rvQR's first-listed failure and the reason the receiver has no partial success.
//
//   C  mask pattern 2 tests the row instead of the column.
//      -> exit=1, section 2 names the first symbol whose encoder chose mask 2 (5-H: "locator degree 11 but 0
//      roots"). One wrong mask formula is invisible on every symbol that happened to pick another mask, so
//      the round trip runs all 160, not one.
//
//   D  the SHA-256 is computed and never compared.
//      -> exit=1, one line: the flipped bit in frame 4's body sails through. Same length, right frame count,
//      wrong file -- the case only the hash can see.
//
//   Caught while writing, not by sabotage: v19-L holds 795 codewords, not the 792 I typed from memory; v1-L
//   holds 19 codewords, of which byte mode can carry 17 bytes; v2-H holds 16, so a 20-byte fixture overflowed;
//   and 161 frames at 10 fps is 16.1 s, which does not round to 17. Four numbers, four corrections, all now
//   asserted from the table rather than typed.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the camera half. Nothing in this tree locates a symbol in a video frame, so the " +
    "channel is proven from matrix to bytes and not from pixels to bytes. Also unchecked: kanji and structured-" +
    "append modes (refused with a message), and any frame rate a real screen and camera sustain.");
process.exit(fails ? 1 : 0);
