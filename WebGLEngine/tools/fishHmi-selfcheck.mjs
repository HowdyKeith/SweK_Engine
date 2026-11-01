// WebGLEngine/tools/fishHmi-selfcheck.mjs -- UNNUMBERED. Run: node tools/fishHmi-selfcheck.mjs
//
// THE GATE OF tools/fishHmiLib.mjs AND tools/fishHmi.mjs: the hindbrain-motion-integrator circuit, from a spreadsheet and a zip file the gate writes itself, every number worked out by hand.
//
// THE FIXTURE (an xlsx built in the gate -- a zip writer with stored and deflated entries, data descriptors, extra fields of different lengths in the local and central headers, an end-of-directory comment; shared strings, rich text,
// phonetic runs, inline strings, numbers, formula strings, entities, sparse cells, a column at AB, a self-closing empty row; nothing from a real file). 13 rows: eleven cells and two rows without a usable Cell ID ('abc'; none).
//   101 class 1 VGluT2 | 102 class 1 VGluT2 | 103 class 2 Gad1B | 104 L-2 Gad1B | 105 class 1 unlabeled | 106 class 7 VGluT2 | 201 spn_turning_rov3 VGluT2 | 202 spn_forward_rom1 VGluT2 | 203 spn_turning_miv1_prox unlabeled
//   | 301 class 4 VGluT2 | 302 'other' unclear. Each synapse is one tuple in the `inputs` of the cell it ends on or the `outputs` of the cell it starts from (both rows list it: counted twice, as the package does).
//   25 tuples in the rows of real cells: 19 identified, 2 to '-', 2 malformed (a three-field tuple; the partner 'abc'), 1 to a cell outside the dataframe (999), 1 self-loop (106); one list that cannot be read (302's outputs). 14 distinct pairs:
//     A 101>201 x3 (two in 201's inputs, one in 101's outputs) | B 101>203 x1 | C 103>202 x2 | D 103>201 x1 | E 102>101 x2 | F 104>103 x1 | G 101>102 x1 (E and G are a reciprocal pair) | H 106>102 x1 | I 301>106 x1
//     | J 105>201 x2 | K 302>101 x1 | L 203>202 x1 | M 105>302 x1 | N 302>104 x1       (J K L M N have a presynaptic cell with no sign)
//   Layers: targets 201 202 203; layer 1 = 101, 103 (signed, onto a target); layer 2 = 102 (onto 101), 104 (onto 103); layer 3 = 106; layer 4 = 301. 105 and 302 never enter (no sign), 203 is a target with no sign.
//   depth 1: 5 neurons, 4 edges (A B C D: 2 excitatory, 2 inhibitory), 7 synapses, left out for want of a sign: J K L = 3 pairs, 4 synapses (M is between two cells that are not chosen; N ends on 104, not chosen yet)
//   depth 2: 7 neurons, 7 edges (+ E F G: 4 excitatory, 3 inhibitory), 11 synapses, left out J K L N = 4 pairs, 5 synapses
//   depth 3: 8 neurons, 8 edges (+ H), 12 synapses | depth 4: 9 neurons, 9 edges (+ I), 13 synapses | depth 9: the same as 4.
//   Sides (midline 260 um, y in soma voxels of 8 nm): 101 at y 40000 = 320 um R | 102 at 20000 = 160 L | 103 at 32500 = 260 (on the midline: none) | 201 at 32499 = 259.992 L | 202 at 32501 = 260.008 R | 104, 203 have no position.
//
// SABOTAGED -- 131 mutants of tools/fishHmiLib.mjs (run with SAB_COPY=tools/fishHmi.mjs so the command's child process imports the mutant) and 51 of tools/fishHmi.mjs, every one red by a row that names it (a throw inside a section is a named red of that
// section, "section N ran to the end", and none of these went red ONLY that way):
//   zip and checksum: L01 wrong CRC polynomial | L02 CRC not inverted | L03 CRC starts at zero | L04 end record only at the very end | L05 no end record not refused | L06 zip64 count accepted | L07 zip64 offset accepted |
//   L08 central signature unchecked | L09 encrypted entry read | L10 a folder is a file | L11 local signature unchecked | L12 data starts after the CENTRAL extra field | L13 stored entry inflated | L14 any method inflated |
//   L15 unpacked size unchecked | L16 CRC unchecked | L17 compressed bytes cut at the unpacked size
//   xlsx: L18 columns base 25 | L19 first column is the second | L20 no sheet1 not refused | L21 shared strings always read | L22 an empty <si/> skipped | L23 inline string unread | L24 shared index off by one | L25 index past the table not refused |
//   L26 a styled empty cell reads as text | L27 a <v> value not unescaped | L28 header hole undefined | L29 a value under no header kept | L30 an empty row is a record | L33 a self-closing cell swallows the next | L34 text not unescaped |
//   L35 only the last run | L36 phonetic run is text | L37 <t/> swallows the text after it | L38 <t> with an attribute is not text | L39-L43 &amp; &lt; &gt; &quot; &apos; | L44 hex entity read as decimal | L45 decimal read as hex |
//   L46 numeric entities not decoded | L47 &amp; decoded first (twice-decoded text)
//   labels: L48 proximal taken after turning | L49 anything containing _prox | L50 forward not told from other | L51 turning needs the whole word | L52 forward needs the whole word | L53 SPN only if it STARTS with spn |
//   L54 L-2 misnamed | L55 1.0 | L56 2.0 | L57 'Class 2' | L58 'contralateral axon' | L59 7.0 | L60 4.0 | L61 '5 or 6' | L62 6.0 | L63 class not trimmed | L64 F and R swapped | L65 transmitter not lower-cased |
//   L66 glutamatergic | L67 gaba | L68 inhibitory | L69 unlabelled | L70 Exc and Inh swapped | L71 group: containing spn is not an SPN | L72 turning and forward swapped in the group
//   python literals: L73 tuples unread | L74 a tuple closes with a bracket | L75 a missing comma accepted | L76 unterminated list unnamed | L77 backslash escape unread | L78 double quotes unread | L79 plus sign | L80 leading-dot number |
//   L81 exponent | L82 None as 0 | L83 True/False swapped | L84 text after the literal accepted
//   cells and graph: L85 a decimal Cell ID is an id | L86 Cell ID not trimmed | L87 levels keep their type | L88 an unreadable level list stops the build | L89 missing status reads as '?' | L90 a row without a cell makes edges |
//   L91 'n/a' lists parsed | L92 unreadable list not counted | L93 a scalar list walked | L94 a three-field tuple is a synapse | L95 a non-tuple not refused | L96 nan not unidentified | L97 None not unidentified |
//   L98 a decimal partner is a cell | L99 text partner not trimmed | L100 a partner outside the dataframe is an edge | L101 inputs and outputs swapped | L102 a self-loop is an edge | L103 a pair counted once
//   circuit: L104 decimal depth | L105 no SPN not refused | L106 a cell with no label feeds the layers | L107 closure one layer short | L108 a chosen cell re-layered | L109 ids sort as text | L110 edges by source only |
//   L111 edges by target only | L112 left-out pairs not counted | L113 left-out synapses not summed | L114 an unsigned cell inside the set keeps its edges | L115 pairs onto unchosen cells counted as left out |
//   L116 sign from the target | L117 an inhibitory cell excitatory | L118 weight 1 | L119 side from x | L120 side from z | L121 y in 30 nm | L122 wrong unit | L123 midline cell has a side | L124 sides swapped |
//   L125 no position is left | L126 midline not a parameter | L127 default depth 3 | L128 default midline 259 | L129 voxel 40 nm | L130 a required column dropped | L131 defaults mutable | L132 byLayer off by one | L133 byGroup of a non-SPN is its class
//   the command (tools/fishHmi.mjs): C01 unknown option accepted | C02 --midline-um | C03 --somas | C04 --write | C05 --depth not options | C06 an option takes another option as its value | C07 no value at the end | C08 --xlsx optional |
//   C09 decimal depth | C10 midline not a number | C11 missing column read | C12 every run writes | C13 folder not made | C14 no final newline | C15 sha256 of the name | C16-C18 --depth / --somas / --midline-um not passed on |
//   C19-C23 a soma file with no rows / no id / no _x / no _y / no _z read | C24 malformed and unreadable swapped | C25 excitatory and inhibitory swapped | C26 left-out pairs not said | C27 refusal to stdout | C28 read failure exits 2 |
//   C29 written path not said | C30 licence claimed | C31 ids called root ids | C32 signs the wrong way in the note | C33 build counts not in the meta | C34 key order | C35 http | C36 citation lost | C37 soma file named by its path |
//   C38 soma note | C39 dry run not said | C40 --somas unread | C41 default depth 3 | C42 default midline 260 | C43 dropped rows not counted | C44 pairs counted by cell | C45 dataset unnamed |
//   C46 soma hash of the name | C47 soma count off by one | C48 soma file path in the meta | C49 soma meta never written | C50 midline not recorded | C51 soma meta written without a soma file
// WHAT THE SABOTAGE FOUND, FIXED IN THE GATE OR THE LIBRARY: two 0-red mutants the first time. (1) A self-closing <row/> regex: the library had been changed to read it, and the mutant that put the old regex back changed NOTHING -- an empty
// row swallows the next row, whose cells carry their own addresses, so the same cells come out. EQUIVALENT: the change was cut, the comment says why, and the gate keeps an empty row of both forms in the fixture (L30). (2) <t xml:space="preserve"/>:
// the fixture put it alone in a string, where swallowing finds no closing tag; it now sits before <t>after</t>. Two rows (L12 the central extra field, L21 the missing shared-strings file) first went red only as "section ran to the end"; the
// rows now catch the throw and name themselves. The first real file showed the row-regex change was not needed and the CRC check did not break it (999 rows read, 3,013 tuples).
// NOT TRIED: removing the Number() around the soma coordinates in tools/fishHmi.mjs (equivalent: the library multiplies, and a string coerces).
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as H from "./fishHmiLib.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = (v) => JSON.stringify(v);
// a section that throws is a named red of that section (the library under test is allowed to fail, the gate is not allowed to die); what a section builds for the next is kept here
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
let SHEET = null, CELLS = null, DROPPED = 0, EDGES = null, STATS = null;
console.log("fishHmi-selfcheck -- the hindbrain motion integrator's circuit, from a spreadsheet the gate writes itself\n");

// ---- the gate's own zip and xlsx writers (independent of the library under test) ------------------------------------------------------------------------------------------------------------------
function crcOf(buf) { let crc = 0xffffffff; for (const b of buf) { let c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
/** entries: [{ name, data, method (0 stored, 8 deflated, other: stored bytes with that number), flags, localExtra, centralExtra, descriptor, crc, usize, raw }] */
function zipOf(entries, comment = "") {
    const parts = [], central = []; let offset = 0;
    for (const e of entries) {
        const name = Buffer.from(e.name), data = e.data || Buffer.alloc(0), method = e.method ?? 8, raw = e.raw || (method === 8 ? zlib.deflateRawSync(data) : data);
        const crc = e.crc ?? crcOf(data), usize = e.usize ?? data.length, flags = (e.flags || 0) | (e.descriptor ? 8 : 0), lx = e.localExtra || Buffer.alloc(0), cx = e.centralExtra || Buffer.alloc(0);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8);
        if (!e.descriptor) { lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(raw.length, 18); lh.writeUInt32LE(usize, 22); }
        lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(lx.length, 28);
        let dd = Buffer.alloc(0);
        if (e.descriptor) { dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(raw.length, 8); dd.writeUInt32LE(usize, 12); }
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(raw.length, 20); ch.writeUInt32LE(usize, 24);
        ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(cx.length, 30); ch.writeUInt32LE(offset, 42);
        central.push(ch, name, cx);
        parts.push(lh, name, lx, raw, dd); offset += lh.length + name.length + lx.length + raw.length + dd.length;
    }
    const cd = Buffer.concat(central), com = Buffer.from(comment), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(com.length, 20);
    return Buffer.concat([...parts, cd, end, com]);
}
const colName = (i) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/**
 * rows: arrays of cell specs (null = no cell). A spec: "text" (shared string), { n } (number), { i } (inline string), { rich: [runs] } (shared, several runs, the first with a font block), { esc } (shared string whose XML is given as it is),
 * { si } (shared, the <si> body as given), { ph: [base, phonetic] } (shared, with a phonetic run), { sp } (shared, xml:space preserved), { f } (a formula cell with a string result), { rawc: (ref) => xml } (any cell), { bad } (a shared index past the table). A row can also be { raw }.
 */
function xlsxOf(rows, { sheetName = "xl/worksheets/sheet1.xml", sharedFile = true, files = [] } = {}) {
    const shared = [""]; const si = (xml) => { shared.push(xml); return shared.length - 1; };   // index 0 is an empty <si/>, so a reader that drops empty entries shifts every index
    let body = ""; let rn = 0;
    for (const row of rows) {
        rn++;
        if (!Array.isArray(row)) { body += row.raw; continue; }
        let cx = "";
        row.forEach((c, k) => {
            if (c === null || c === undefined) return;
            const ref = colName(k) + rn;
            if (typeof c === "string") cx += `<c r="${ref}" t="s"><v>${si(`<t>${esc(c)}</t>`)}</v></c>`;
            else if ("n" in c) cx += `<c r="${ref}"><v>${c.n}</v></c>`;
            else if ("i" in c) cx += `<c r="${ref}" t="inlineStr"><is><t>${esc(c.i)}</t></is></c>`;
            else if ("rich" in c) cx += `<c r="${ref}" t="s"><v>${si(c.rich.map((t, q) => (q === 0 ? `<r><rPr><b/><sz val="11"/></rPr><t>${esc(t)}</t></r>` : `<r><t xml:space="preserve">${esc(t)}</t></r>`)).join(""))}</v></c>`;
            else if ("esc" in c) cx += `<c r="${ref}" t="s"><v>${si(`<t>${c.esc}</t>`)}</v></c>`;
            else if ("si" in c) cx += `<c r="${ref}" t="s"><v>${si(c.si)}</v></c>`;
            else if ("ph" in c) cx += `<c r="${ref}" t="s"><v>${si(`<r><t>${esc(c.ph[0])}</t></r><rPh sb="0" eb="1"><t>${esc(c.ph[1])}</t></rPh><phoneticPr fontId="1"/>`)}</v></c>`;
            else if ("sp" in c) cx += `<c r="${ref}" t="s"><v>${si(`<t xml:space="preserve">${esc(c.sp)}</t>`)}</v></c>`;
            else if ("f" in c) cx += `<c r="${ref}" t="str"><f>"${esc(c.f)}"</f><v>${esc(c.f)}</v></c>`;
            else if ("rawc" in c) cx += c.rawc(ref);
            else if ("bad" in c) cx += `<c r="${ref}" t="s"><v>${c.bad}</v></c>`;
        });
        body += `<row r="${rn}" spans="1:8">${cx}</row>`;
    }
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:AB20"/><sheetData>${body}</sheetData></worksheet>`;
    const entries = [{ name: "[Content_Types].xml", data: Buffer.from("<Types/>") }, { name: "xl/", method: 0 }, { name: sheetName, data: Buffer.from(sheet) }, ...files];
    if (sharedFile) entries.push({ name: "xl/sharedStrings.xml", data: Buffer.from(`<?xml version="1.0"?><sst count="${shared.length}" uniqueCount="${shared.length}">${shared.map((x) => (x === "" ? "<si/>" : `<si>${x}</si>`)).join("")}</sst>`), method: 0 });
    return zipOf(entries);
}

// ---- the fixture sheet ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const T = (p) => `(${p}, 1, 2, 3, 's')`, UN = "('-', 1, 2, 3, 's')", list = (...t) => "[" + t.join(", ") + "]";
const HEADER = ["Cell ID", "name", "classifier", "inputs", "outputs", "reconstruction_status", "final_neurotransmitter_ID", "network_level", ...Array(19).fill(null), "far"];
const ROWS = [
    HEADER,
    [{ n: 101 }, "R&D <1>", { n: 1 }, list(T(102), T(102), T(302), UN), { esc: "[(201, 1, 2, 3, &#39;s&#39;), (203, 1, 2, 3, &#x27;s&#x27;)]" }, "proofread", "VGluT2", "['input_one', 'network_seed']", ...Array(19).fill(null), "x"],
    ["102", "ib2", "1", list(T(101)), list(T(999)), "proofread", "VGluT2", "['network_seed']", "stray"],
    [{ n: 103 }, "inh", "2", "[]", { i: list(T(202), T(202)) }, { rawc: (ref) => `<c r="${ref}" s="2"/>` }, "Gad1B", "n/a"],
    [{ n: 104 }, "lat", "L-2", list(T(302)), list(T(103)), "proofread", "Gad1B", "[["],
    [{ n: 105 }, null, { n: 1 }, list("('abc', 1, 2, 3, 's')"), list(T(302)), "partial", "unlabeled"],
    [{ n: 106 }, { f: "a&b" }, { f: "7" }, "n/a", list(T(102), T(106)), "proofread", "VGluT2"],
    [{ n: 201 }, "t1", "spn_turning_rov3", { rich: ["[" + [T(101), T(101), T(103)].join(", ") + ", ", [T(105), T(105), UN].join(", ") + "]"] }, null, "proofread", "VGluT2"],
    ["202", null, "spn_forward_rom1", null, null, null, "VGluT2"],
    [{ n: 203 }, "t3", "spn_turning_miv1_prox", null, list(T(202)), "proofread", "unlabeled"],
    { raw: '<row r="11" spans="1:8"/>' },
    { raw: '<row r="12" spans="1:8"></row>' },
    [{ n: 301 }, "r4", "4", list("(101, 1, 2)"), list(T(106)), "proofread", "VGluT2"],
    [{ n: 302 }, "oth", "other", null, "[(101, 1, 2", "proofread", "unclear"],
    ["abc", "bad", "1", list(T(101)), null, null, "VGluT2"],
    [null, "bad2", "1", null, list(T(201)), null, "VGluT2"],
];
const XLSX = xlsxOf(ROWS);

// ================================================================================================================================================================================================================
sec("1. the checksum and the gate's own zip writer");
guarded("section 1", () => {
    ok("crc32 of '123456789' is 0xCBF43926, of nothing 0, and the library's agrees with the gate's on a 5000-byte buffer", H.crc32(Buffer.from("123456789")) === 0xcbf43926 && H.crc32(Buffer.alloc(0)) === 0 && H.crc32(Buffer.alloc(5000, "xyz")) === crcOf(Buffer.alloc(5000, "xyz")) && crcOf(Buffer.from("123456789")) === 0xcbf43926);
    const tmp = path.join(os.tmpdir(), `fishhmi-gatecheck-${process.pid}.xlsx`);
    fs.writeFileSync(tmp, XLSX);
    const py = spawnSync("python3", ["-I", "-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(sorted(z.namelist()))", tmp], { encoding: "utf8" });
    fs.rmSync(tmp, { force: true });
    if (py.error) console.log("  NOT CHECKED  python3 is not here, so the gate's zip writer was not read by an independent reader (the library reads it below)");
    else ok("an independent reader (Python's zipfile) opens the gate's own xlsx and finds every checksum right", py.status === 0 && /sharedStrings\.xml/.test(py.stdout) && /worksheets\/sheet1\.xml/.test(py.stdout), py.status === 0 ? "" : py.stderr.slice(0, 200));
});

// ================================================================================================================================================================================================================
sec("2. unzip: stored and deflated entries, the quirks of real archives, and what it refuses by name");
guarded("section 2", () => {
    const big = Buffer.alloc(5000, "xyz"), z = zipOf([
        { name: "a.txt", data: Buffer.from("hello"), method: 0 }, { name: "dir/", method: 0 }, { name: "dir/b.txt", data: big, localExtra: Buffer.from([0xfe, 0xca, 0, 0]) },
        { name: "c.bin", data: Buffer.from("streamed"), descriptor: true }, { name: "d.bin", data: Buffer.from("with a central extra"), centralExtra: Buffer.from([1, 2, 3, 4, 5, 6]) },
    ], "a comment on the archive");
    let m = new Map(); const e0 = throws(() => { m = H.unzip(z); });
    ok("a stored entry, a deflated one inside a folder, a streamed one (sizes after the data) and one with an extra field only in the central header are all read back; the folder entry is not a file; the comment after the directory does not hide it",
        e0 === null && J([...m.keys()]) === J(["a.txt", "dir/b.txt", "c.bin", "d.bin"]) && m.get("a.txt").toString() === "hello" && m.get("dir/b.txt").equals(big) && m.get("c.bin").toString() === "streamed" && m.get("d.bin").toString() === "with a central extra");
    ok("the entry's bytes in the archive are really compressed (the deflated 5000 bytes take far fewer, so the stored-versus-deflated branch is exercised)", z.length < 1500);
    const flip = Buffer.from(zipOf([{ name: "a.txt", data: Buffer.from("hello"), method: 0 }])); flip[30 + 5] ^= 1;
    const wrongSize = zipOf([{ name: "a.txt", data: Buffer.from("hello"), method: 0, usize: 6 }]);
    const badCentral = Buffer.from(zipOf([{ name: "a.txt", data: Buffer.from("hello"), method: 0 }])); badCentral.writeUInt32LE(0, badCentral.length - 22 - 46 - 5);
    const badLocal = Buffer.from(zipOf([{ name: "a.txt", data: Buffer.from("hello"), method: 0 }])); badLocal.writeUInt32LE(0, 0);
    const z64 = Buffer.from(zipOf([{ name: "a.txt", data: Buffer.from("hello"), method: 0 }])); z64.writeUInt16LE(0xffff, z64.length - 22 + 10);
    const z64b = Buffer.from(zipOf([{ name: "a.txt", data: Buffer.from("hello"), method: 0 }])); z64b.writeUInt32LE(0xffffffff, z64b.length - 22 + 16);
    const refusals = [
        ["a text file", Buffer.from("not a zip at all, just text of some length"), /no end-of-central-directory record -- not a zip file/], ["fewer than 22 bytes", Buffer.from("PK"), /not a zip file/],
        ["a count of 0xffff (zip64)", z64, /zip64/], ["an offset of 0xffffffff (zip64)", z64b, /zip64/],
        ["an encrypted entry", zipOf([{ name: "a.txt", data: Buffer.from("hello"), method: 0, flags: 1 }]), /a\.txt is encrypted/], ["compression method 12", zipOf([{ name: "a.txt", data: Buffer.from("hello"), method: 12 }]), /a\.txt uses compression method 12/],
        ["a size that differs from the directory's", wrongSize, /a\.txt is 5 bytes after unpacking, the directory says 6/], ["a flipped byte (the checksum)", flip, /a\.txt fails its CRC-32 checksum/],
        ["a damaged central-directory signature", badCentral, /entry 1 of 1 has no central-directory signature/], ["no local header where the directory says", badLocal, /a\.txt has no local header where the directory says/],
    ];
    for (const [what, buf, re] of refusals) { const e = throws(() => H.unzip(buf)); ok(`unzip refuses ${what} by name`, e !== null && /^fishHmi\.unzip: /.test(e) && re.test(e), e || "did not throw"); }
});

// ================================================================================================================================================================================================================
sec("3. readXlsx: the first sheet as records");
guarded("section 3", () => {
    SHEET = H.readXlsx(XLSX);
    ok("the header has 28 names, the ones with no header cell are empty and the last is 'far' (column AB)", SHEET.header.length === 28 && SHEET.header[0] === "Cell ID" && SHEET.header[7] === "network_level" && SHEET.header[8] === "" && SHEET.header[26] === "" && SHEET.header[27] === "far", J(SHEET.header.slice(6, 9)));
    ok("13 records: the self-closing empty row (11) and the empty one (12) are not records, and the rows after them (301, 302) are read whole", SHEET.rows.length === 13 && SHEET.rows[9]["Cell ID"] === "301" && SHEET.rows[10]["Cell ID"] === "302" && SHEET.rows[9].classifier === "4" && SHEET.rows[10].final_neurotransmitter_ID === "unclear", J(SHEET.rows.map((r) => r["Cell ID"])));
    const r = SHEET.rows;
    ok("numbers come back as text and strings are decoded: 101 has Cell ID '101', the name 'R&D <1>' (entities), classifier '1' (a number cell), and its outputs read '[(201, 1, 2, 3, 's'), (203, 1, 2, 3, 's')]' from &#39; and &#x27;",
        r[0]["Cell ID"] === "101" && r[0].name === "R&D <1>" && r[0].classifier === "1" && r[0].outputs === "[(201, 1, 2, 3, 's'), (203, 1, 2, 3, 's')]");
    ok("an inline string (103's outputs), formula string results (106's classifier '7' and its name 'a&b' -- entities in <v> decode too) and a text Cell ID (102, 202) are read", r[2].outputs === list(T(202), T(202)) && r[5].classifier === "7" && r[5].name === "a&b" && r[1]["Cell ID"] === "102" && r[7]["Cell ID"] === "202");
    ok("a rich-text cell is its runs joined (201's inputs, cut in the middle of the list, the second run space-preserving)", r[6].inputs === list(T(101), T(101), T(103), T(105), T(105), UN));
    ok("a cell with no entry is left out of its row (105 has no name, 202 no inputs or outputs) and a styled empty cell (103's status) is too; the far column holds its value only on 101", !("name" in r[4]) && !("inputs" in r[7]) && !("outputs" in r[7]) && !("reconstruction_status" in r[2]) && r[0].far === "x" && !("far" in r[1]));
    ok("a value under a column with no header name is not kept (102's stray ninth cell)", !("" in r[1]) && !Object.values(r[1]).includes("stray"));
    ok("the row with no Cell ID is kept as a record (it has other cells) with no 'Cell ID' key", !("Cell ID" in r[12]) && r[12].name === "bad2");
    const edge = H.readXlsx(xlsxOf([["k", "v"], [{ ph: ["base", "かな"] }, { sp: "  pad  " }], [{ esc: "a&amp;b &lt;c&gt; &quot;q&quot; &apos;s&apos; &#65;&#x42; &amp;lt;" }, "z"]]));
    ok("a phonetic run is not text, a space-preserved cell keeps its spaces, entities decode in one pass (&amp; &lt; &gt; &quot; &apos; &#65; &#x42;, and &amp;lt; is &lt;, not <)", edge.rows[0].k === "base" && edge.rows[0].v === "  pad  " && edge.rows[1].k === 'a&b <c> "q" \'s\' AB &lt;' && edge.rows[1].v === "z", J(edge.rows));
    const selfT = H.readXlsx(xlsxOf([["k", "v"], [{ si: '<t xml:space="preserve"/><t>after</t>' }, { esc: "x" }], [{ si: "<r><t/></r><r><t>y</t></r>" }, { si: "" }], ["p", "q"]]));
    ok("a self-closing <t/> (with an attribute or without) and an empty <si/> are the empty string and do not swallow the text after them", selfT.rows.length === 3 && selfT.rows[0].k === "after" && selfT.rows[0].v === "x" && selfT.rows[1].k === "y" && selfT.rows[1].v === "" && selfT.rows[2].k === "p", J(selfT.rows));
    const e1 = throws(() => H.readXlsx(xlsxOf([["k"], [{ bad: 99 }]])));
    ok("a cell that points past the shared strings is refused by name with its address", /fishHmi\.readXlsx: cell A2 points past the shared strings/.test(e1 || ""), e1 || "did not throw");
    const e2 = throws(() => H.readXlsx(xlsxOf([["k"]], { sheetName: "xl/worksheets/sheet2.xml" })));
    ok("a workbook with no xl/worksheets/sheet1.xml is refused by name", /no xl\/worksheets\/sheet1\.xml/.test(e2 || ""), e2 || "did not throw");
    const e3 = throws(() => H.readXlsx(xlsxOf([])));
    ok("a sheet with no rows is refused by name", /the sheet has no rows/.test(e3 || ""), e3 || "did not throw");
    let noShared = { rows: [] }; const e5 = throws(() => { noShared = H.readXlsx(xlsxOf([[{ i: "k" }, { i: "v" }], [{ n: 1 }, { i: "t" }]], { sharedFile: false })); });
    ok("a workbook with no sharedStrings.xml is read when it needs none (inline strings and numbers)", e5 === null && noShared.rows.length === 1 && noShared.rows[0].k === "1" && noShared.rows[0].v === "t", e5 || "");
    const wide = H.readXlsx(xlsxOf([[...Array(27).fill(null), "w"], [...Array(26).fill(null), "z", "y"]]));
    ok("column letters past Z are placed right (AA is the 27th column, AB the 28th)", wide.header.length === 28 && wide.header[27] === "w" && wide.rows[0].w === "y", J(wide.header.length));
    const e4 = throws(() => H.readXlsx(Buffer.from("not a zip")));
    ok("an unreadable file is refused with the zip's own message", /not a zip file/.test(e4 || ""), e4 || "did not throw");
});

// ================================================================================================================================================================================================================
sec("4. the package's labels, its Python literals, and the constants");
guarded("section 4", () => {
    const cls = [["1", "I"], [1, "I"], ["1.0", "I"], [" 1 ", "I"], ["2", "II"], ["2.0", "II"], ["Class 2", "II"], ["contralateral axon", "II"], ["L-2", "L-2"], ["7", "F"], ["7.0", "F"], ["4", "R"], ["4.0", "R"], ["5", "P"], ["5.0", "P"], ["6", "P"], ["6.0", "P"], ["5 or 6", "P"],
        ["1 or 2", "?"], ["other", "?"], ["", "?"], ["l-2", "?"], ["spn_turning_rov3", "SPN_turning"], ["SPN_Forward_x", "SPN_forward"], ["spn_turning_miv1_prox", "SPN_prox"], ["spn_forward_x_prox", "SPN_prox"], ["spn_other", "SPN_other"], ["spn", "SPN_other"], ["SPN_PROX", "SPN_prox"], ["spn_prox_forward", "SPN_forward"], ["spn_turn", "SPN_turning"], ["spn_forw", "SPN_forward"], ["xspn", "SPN_other"]];
    const bad = cls.filter(([v, want]) => H.classLabel(v) !== want).map(([v, want]) => `${J(v)}->${H.classLabel(v)} (want ${want})`);
    ok(`classLabel names all ${cls.length} classifiers as the package does (1 I | 2 / Class 2 / contralateral axon II | L-2 | 7 F | 4 R | 5, 6, 5 or 6 P | spn_* by turn / forw / _prox, case-blind | the rest '?')`, bad.length === 0, bad.join(" ; "));
    const nts = [["VGluT2", "Exc"], [" vglut2 ", "Exc"], ["Glutamatergic", "Exc"], ["excitatory", "Exc"], ["Gad1B", "Inh"], ["GABA", "Inh"], ["Inhibitory", "Inh"], ["unlabeled", "Unlabeled"], ["Unlabelled", "Unlabeled"], ["unclear", "Unknown"], ["n/a", "Unknown"], ["", "Unknown"], ["vglut2/gad1b", "Unknown"], ["both", "Unknown"]];
    const badNt = nts.filter(([v, want]) => H.ntLabel(v) !== want).map(([v, want]) => `${J(v)}->${H.ntLabel(v)} (want ${want})`);
    ok(`ntLabel reads all ${nts.length} transmitter spellings (VGluT2 and glutamatergic: Exc; Gad1B, GABA, inhibitory: Inh; unlabeled / unlabelled; everything else, a mixed label included, Unknown)`, badNt.length === 0, badNt.join(" ; "));
    const grp = [["spn_turning_rov3", "turning"], ["spn_forward_rom1", "forward"], ["SPN_TURN", "turning"], ["spn_x", "other"], ["spn", "other"], ["1", null], ["", null], ["xspn", "other"], ["x_spn_turning_prox", "turning"], ["span", null]];
    const badG = grp.filter(([v, want]) => H.spnGroup(v) !== want).map(([v, want]) => `${J(v)}->${J(H.spnGroup(v))} (want ${J(want)})`);
    ok("spnGroup: turning / forward / other for a classifier that contains 'spn' (any case, as the package's is_spn_cell reads it -- 'xspn' counts), null for every other cell", badG.length === 0, badG.join(" ; "));
    const P = H.parsePyLiteral, show = (t) => { try { const v = P(t); return typeof v === "number" ? String(v) : J(v); } catch (e) { return "THROWS " + e.message; } };
    const accepts = [["[]", "[]"], ["[(1, 'a', 2.5, -3, None, True, False), ('x', 1e3)]", '[[1,"a",2.5,-3,null,true,false],["x",1000]]'], ["(1,)", "[1]"], ["[1, 2, ]", "[1,2]"], ['"a b"', '"a b"'], ["'it\\'s'", '"it\'s"'], ["  [ 1 , 2 ]  ", "[1,2]"],
        ["-0.5", "-0.5"], [".5", "0.5"], ["+4", "4"], ["1e-3", "0.001"], ["[[1, [2]], ()]", "[[1,[2]],[]]"], ["nan", "NaN"], ["inf", "Infinity"], ["None", "null"], ["True", "true"], ["[False]", "[false]"]];
    const badP = accepts.filter(([t, want]) => show(t) !== want).map(([t, want]) => `${t} -> ${show(t)} (want ${want})`);
    ok(`parsePyLiteral reads ${accepts.length} literals: lists and tuples, quoted strings (single, double, escaped), ints, floats, signs, exponents, None / True / False / nan / inf, trailing commas and spaces`, badP.length === 0, badP.join(" ; "));
    const refusedP = ["[1,", "[1 2]", "[1] x", "", "{}", "__import__('os')", "[1,, 2]", "'abc", "(1, 2", "[", "foo", "[1, 2"].map((t) => [t, throws(() => P(t))]);
    ok("parsePyLiteral refuses text that is not such a literal, each with its name and a position: unterminated lists / strings, a missing comma, text after the literal, a dict, a call, an empty comma, a bare word", refusedP.every(([, e]) => e !== null && /^fishHmi\.parsePyLiteral: .* at character \d+$/.test(e)), refusedP.filter(([, e]) => e === null).map(([t]) => t).join(" | "));
    ok("the refusals are the right ones: '[1,' is unterminated, '[1 2]' wants a comma, '[1] x' has text after the literal, 'foo' is unexpected", /unterminated \[ at character 3/.test(refusedP[0][1]) && /expected , or \] at character 3/.test(refusedP[1][1]) && /text after the literal at character 4/.test(refusedP[2][1]) && /unexpected "foo" at character 0/.test(refusedP[10][1]), refusedP.slice(0, 3).map((x) => x[1]).join(" | "));
    ok("the constants are the ones the notes name: the required columns, the soma voxel (8 x 8 x 30 nm), depth 2 and the midline 259.208 um, all frozen", J(H.REQUIRED_COLUMNS) === J(["Cell ID", "classifier", "inputs", "outputs", "final_neurotransmitter_ID", "network_level"]) && J(H.SOMA_VOXEL_NM) === "[8,8,30]" && H.DEFAULTS.depth === 2 && H.DEFAULTS.midlineUm === 259.208 && Object.isFrozen(H.REQUIRED_COLUMNS) && Object.isFrozen(H.SOMA_VOXEL_NM) && Object.isFrozen(H.DEFAULTS));
});

// ================================================================================================================================================================================================================
sec("5. cellsOf and edgesOf: the cells and the graph the package builds");
guarded("section 5", () => {
    if (!SHEET) { ok("section 5 has section 3's sheet to build from", false); return; }
    ({ cells: CELLS, dropped: DROPPED } = H.cellsOf(SHEET.rows)); ({ edges: EDGES, stats: STATS } = H.edgesOf(SHEET.rows, CELLS));
    ok("eleven cells in the order of the file and two rows without a usable Cell ID dropped and counted ('abc' and none)", J([...CELLS.keys()]) === J(["101", "102", "103", "104", "105", "106", "201", "202", "203", "301", "302"]) && DROPPED === 2);
    const c = (id) => CELLS.get(id), brief = (id) => `${c(id).cls}/${c(id).nt}/${c(id).spn}`;
    ok("each cell's class, transmitter and SPN group: 101 I/Exc, 102 I/Exc, 103 II/Inh, 104 L-2/Inh, 105 I/Unlabeled, 106 F/Exc, 201 SPN_turning/Exc/turning, 202 SPN_forward/Exc/forward, 203 SPN_prox/Unlabeled/turning, 301 R/Exc, 302 ?/Unknown",
        [brief("101"), brief("102"), brief("103"), brief("104"), brief("105"), brief("106"), brief("201"), brief("202"), brief("203"), brief("301"), brief("302")].join(" ") ===
        "I/Exc/null I/Exc/null II/Inh/null L-2/Inh/null I/Unlabeled/null F/Exc/null SPN_turning/Exc/turning SPN_forward/Exc/forward SPN_prox/Unlabeled/turning R/Exc/null ?/Unknown/null");
    ok("the name, raw transmitter, raw classifier and status are kept (101: 'R&D <1>', VGluT2, '1', proofread; 105 has no name: '')", c("101").name === "R&D <1>" && c("101").rawNt === "VGluT2" && c("101").rawClass === "1" && c("101").status === "proofread" && c("105").name === "" && c("203").rawClass === "spn_turning_miv1_prox");
    ok("network levels are read as a list of text: 101 has two, 'n/a' and an unreadable '[[' and a missing column are none", J(c("101").levels) === '["input_one","network_seed"]' && c("103").levels.length === 0 && c("104").levels.length === 0 && c("105").levels.length === 0);
    const lv = H.cellsOf([{ "Cell ID": "7", network_level: "5" }, { "Cell ID": "8", network_level: "[1, 2]" }, { "Cell ID": " 9 " }, { "Cell ID": "1.5" }, { "Cell ID": "" }]);
    ok("a level that is not a list is none, numbers inside a list become text, a Cell ID is trimmed, a decimal one is not an id", lv.cells.get("7").levels.length === 0 && J(lv.cells.get("8").levels) === '["1","2"]' && lv.cells.has("9") && !lv.cells.has("1.5") && lv.dropped === 2);
    ok("tuples: 25 in the rows of real cells -- 19 identified, 2 to '-', 2 malformed, 1 outside the dataframe, 1 self-loop; one unreadable list; 13 rows", J(STATS) === J({ rows: 13, parseFailRows: 1, tuples: 25, identified: 19, unidentified: 2, malformed: 2, outsideDataframe: 1, selfLoops: 1 }), J(STATS));
    const want = { "101>201": 3, "101>203": 1, "103>202": 2, "103>201": 1, "102>101": 2, "104>103": 1, "101>102": 1, "106>102": 1, "301>106": 1, "105>201": 2, "302>101": 1, "203>202": 1, "105>302": 1, "302>104": 1 };
    const got = Object.fromEntries([...EDGES].map(([k, e]) => [k, e.n]));
    ok("14 distinct pairs with the counts worked out by hand (A 101>201 x3: two tuples in 201's inputs and one in 101's outputs; the reciprocal pair E 102>101 x2 and G 101>102 x1; nothing from 'abc' or the row with no id)", EDGES.size === 14 && J(Object.keys(got).sort()) === J(Object.keys(want).sort()) && Object.keys(want).every((k) => got[k] === want[k]), J(got));
    ok("an edge keeps its endpoints as text and its key is 'pre>post'", [...EDGES].every(([k, e]) => k === e.pre + ">" + e.post && typeof e.pre === "string" && typeof e.post === "string"));
    const uc = H.cellsOf([{ "Cell ID": "1" }, { "Cell ID": "2" }, { "Cell ID": "3" }]).cells, ue = (inputs) => { const r = H.edgesOf([{ "Cell ID": "1", inputs }], uc); return J([r.stats.tuples, r.stats.identified, r.stats.unidentified, r.stats.malformed, r.stats.outsideDataframe, r.stats.parseFailRows, [...r.edges].map(([k, e]) => k + "x" + e.n)]); };
    const units = [["5", "[0,0,0,0,0,0,[]]"], ["[None, 5, 'x']", "[3,0,0,3,0,0,[]]"], ["[(nan, 1, 2, 3, 's')]", "[1,0,1,0,0,0,[]]"], ["[(None, 1, 2, 3, 's')]", "[1,0,1,0,0,0,[]]"], ["[(101.5, 1, 2, 3, 's')]", "[1,0,0,1,0,0,[]]"], ["[(' 2 ', 1, 2, 3, 's')]", '[1,1,0,0,0,0,["2>1x1"]]'],
        ["[('2', 1, 2, 3, 's'), (2, 1, 2, 3, 's'), (3.0, 1, 2, 3, 's')]", '[3,3,0,0,0,0,["2>1x2","3>1x1"]]'], ["[(4, 1, 2, 3, 's')]", "[1,0,0,0,1,0,[]]"], ["[(1, 1, 2, 3, 's')]", "[1,0,0,0,0,0,[]]"], ["(1, 2", "[0,0,0,0,0,1,[]]"], ["n/a", "[0,0,0,0,0,0,[]]"], ["", "[0,0,0,0,0,0,[]]"]];
    const badU = units.filter(([t, want]) => { let got; try { got = ue(t); } catch (e) { got = "THROWS " + e.message; } return got !== want; }).map(([t]) => t);
    ok(`edgesOf on single rows (${units.length}): a scalar list is nothing, None / a number / a string in the list are malformed, a partner of nan or None is unidentified, a decimal partner is malformed, a partner as ' 2 ' or '2' or 2 or 3.0 is the same cell, one outside the dataframe is counted, a self-loop is not an edge, an unreadable list is counted, 'n/a' and '' are empty`, badU.length === 0, badU.join(" | "));
    const one = H.cellsOf([{ "Cell ID": "5" }]).cells.get("5");
    ok("a row with nothing but an id is a cell with no name, status, transmitter or class ('?', Unknown), no levels, not an SPN", one.name === "" && one.status === "" && one.rawNt === "" && one.nt === "Unknown" && one.rawClass === "" && one.cls === "?" && one.levels.length === 0 && one.spn === null);
});

// ================================================================================================================================================================================================================
sec("6. circuitOf: the circuit that ends in the spinal projection neurons");
guarded("section 6", () => {
    if (!EDGES) { ok("section 6 has section 5's graph to cut from", false); return; }
    const circ = (o) => H.circuitOf(CELLS, EDGES, o);
    const ids = (c) => c.neurons.map((n) => n.id), sel = (c) => c.selection;
    const d1 = circ({ depth: 1 }), d2 = circ({ depth: 2 }), d3 = circ({ depth: 3 }), d4 = circ({ depth: 4 }), d9 = circ({ depth: 9 }), dd = circ();
    ok("depth 1: 5 neurons in ascending id, the targets 201 202 203 and the signed cells onto them 101 103; edges A B C D with their signs and counts, sorted", J(ids(d1)) === "[101,103,201,202,203]" && J(d1.edges) === "[[0,2,3,1],[0,4,1,1],[1,2,1,-1],[1,3,2,-1]]", J(d1.edges));
    ok("depth 1 totals: 4 edges, 7 synapses, 2 excitatory, 2 inhibitory; 3 pairs (4 synapses) left out for want of a sign (J K L); layers {0:3, 1:2}", sel(d1).edges === 4 && sel(d1).synapses === 7 && sel(d1).excitatoryEdges === 2 && sel(d1).inhibitoryEdges === 2 && sel(d1).leftOutPairsWithoutASign === 3 && sel(d1).leftOutSynapsesWithoutASign === 4 && J(sel(d1).byLayer) === '{"0":3,"1":2}', J(sel(d1)));
    ok("depth 2: 7 neurons 101..104 and 201..203; 7 edges, the reciprocal pair among them, sorted by (from, to), 11 synapses, 4 excitatory, 3 inhibitory",
        J(ids(d2)) === "[101,102,103,104,201,202,203]" && J(d2.edges) === "[[0,1,1,1],[0,4,3,1],[0,6,1,1],[1,0,2,1],[2,4,1,-1],[2,5,2,-1],[3,2,1,-1]]" && sel(d2).synapses === 11 && sel(d2).excitatoryEdges === 4 && sel(d2).inhibitoryEdges === 3, J(d2.edges));
    ok("depth 2: 4 pairs (5 synapses) left out for want of a sign (J K L and N, which ends on 104 now chosen; M is between two cells that are not); layers {0:3, 1:2, 2:2}", sel(d2).leftOutPairsWithoutASign === 4 && sel(d2).leftOutSynapsesWithoutASign === 5 && J(sel(d2).byLayer) === '{"0":3,"1":2,"2":2}', J(sel(d2)));
    ok("the neurons at depth 2: id, class, transmitter, SPN group, layer, no side without positions",
        J(d2.neurons.map((n) => [n.id, n.cls, n.nt, n.group, n.layer, n.side])) === J([[101, "I", "Exc", null, 1, null], [102, "I", "Exc", null, 2, null], [103, "II", "Inh", null, 1, null], [104, "L-2", "Inh", null, 2, null], [201, "SPN_turning", "Exc", "turning", 0, null], [202, "SPN_forward", "Exc", "forward", 0, null], [203, "SPN_prox", "Unlabeled", "turning", 0, null]]));
    ok("the selection counts at depth 2: byClass, byGroup, bySide, rule and targets", J(sel(d2).byClass) === '{"I":2,"II":1,"L-2":1,"SPN_turning":1,"SPN_forward":1,"SPN_prox":1}' && J(sel(d2).byGroup) === '{"none":4,"turning":2,"forward":1}' && J(sel(d2).bySide) === '{"unknown":7}' && sel(d2).rule === "spnBackClosure" && sel(d2).targets === 3 && sel(d2).depth === 2 && sel(d2).neurons === 7);
    ok("depth 3 adds 106 (8 neurons, 8 edges incl. H 106>102, 12 synapses, 5 excitatory); depth 4 adds 301 (9 neurons, edge I, 13 synapses, 6 excitatory); the cell with a three-field tuple to 101 gets no edge from it",
        J(ids(d3)) === "[101,102,103,104,106,201,202,203]" && J(d3.edges) === "[[0,1,1,1],[0,5,3,1],[0,7,1,1],[1,0,2,1],[2,5,1,-1],[2,6,2,-1],[3,2,1,-1],[4,1,1,1]]" && sel(d3).synapses === 12 && sel(d3).excitatoryEdges === 5 &&
        J(ids(d4)) === "[101,102,103,104,106,201,202,203,301]" && d4.edges.length === 9 && J(d4.edges[8]) === "[8,4,1,1]" && sel(d4).synapses === 13 && sel(d4).excitatoryEdges === 6 && J(sel(d4).byLayer) === '{"0":3,"1":2,"2":2,"3":1,"4":1}', J(d4.edges));
    ok("depth 9 is depth 4 (nothing further feeds in: the closure ends), and the default depth is 2", J(d9.neurons) === J(d4.neurons) && J(d9.edges) === J(d4.edges) && sel(d9).depth === 9 && J(dd.neurons) === J(d2.neurons) && J(dd.edges) === J(d2.edges) && sel(dd).depth === 2);
    ok("a cell with no label is never a neuron (105, 302) and the unlabeled target 203 sends no edge; every edge's sign is its presynaptic cell's transmitter", ![105, 302].some((x) => ids(d4).includes(x)) && d4.edges.every(([f, , , s]) => s === (d4.neurons[f].nt === "Exc" ? 1 : -1)) && !d4.edges.some(([f]) => d4.neurons[f].id === 203));
    const somas = new Map([["101", [0, 40000, 0]], ["102", [99999, 20000, 99999]], ["103", [5, 32500, 5]], ["201", [0, 32499, 0]], ["202", [0, 32501, 0]]]);
    const s260 = circ({ depth: 2, somas, midlineUm: 260 }), s300 = circ({ depth: 2, somas, midlineUm: 300 }), sDef = circ({ depth: 2, somas });
    ok("sides at midline 260 um from the y soma voxel (8 nm): 101 R (320), 102 L (160 -- x and z are huge to show they are not used), 103 none (exactly 260), 104 none (no position), 201 L (259.992), 202 R (260.008), 203 none",
        J(s260.neurons.map((n) => n.side)) === J(["R", "L", null, null, "L", "R", null]) && J(sel(s260).bySide) === '{"R":2,"L":2,"unknown":3}', J(s260.neurons.map((n) => n.side)));
    ok("the midline is a parameter: at 300 um only 101 is on the right and 103, 202 are left; the default midline is 259.208", J(s300.neurons.map((n) => n.side)) === J(["R", "L", "L", null, "L", "L", null]) && J(sDef.neurons.map((n) => n.side)) === J(["R", "L", "R", null, "R", "R", null]), J(sDef.neurons.map((n) => n.side)));
    ok("positions change nothing but the sides", J(s260.edges) === J(d2.edges) && J(s260.neurons.map((n) => n.id)) === J(ids(d2)));
    for (const bad of [0, -1, 1.5, "2", NaN]) { const e = throws(() => circ({ depth: bad })); ok(`depth ${Number.isNaN(bad) ? "NaN" : J(bad)} is refused by name`, /fishHmi\.circuitOf: depth must be a whole number of 1 or more/.test(e || ""), e || "did not throw"); }
    const orows = [{ "Cell ID": "100", classifier: "spn_turning_a", final_neurotransmitter_ID: "VGluT2", inputs: "[(9, 1, 2, 3, 's'), (10, 1, 2, 3, 's'), (10, 1, 2, 3, 's')]" }, { "Cell ID": "9", classifier: "1", final_neurotransmitter_ID: "VGluT2" }, { "Cell ID": "10", classifier: "2", final_neurotransmitter_ID: "Gad1B" }];
    const oc = H.cellsOf(orows).cells, oci = H.circuitOf(oc, H.edgesOf(orows, oc).edges, { depth: 1 });
    ok("neurons are in ascending NUMERIC soma id (9, 10, 100 -- not 10, 100, 9) and the edges follow that order", J(oci.neurons.map((n) => n.id)) === "[9,10,100]" && J(oci.edges) === "[[0,2,1,1],[1,2,2,-1]]" && typeof oci.neurons[0].id === "number", J(oci.neurons.map((n) => n.id)));
    const noSpn = new Map([...CELLS].filter(([, c]) => c.spn === null)), e5 = throws(() => H.circuitOf(noSpn, EDGES));
    ok("a dataframe with no spinal projection neuron is refused by name", /no spinal projection neuron/.test(e5 || ""), e5 || "did not throw");
});

// ================================================================================================================================================================================================================
sec("7. the command");
guarded("section 7", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishhmi-")), xf = path.join(dir, "frame.xlsx"), sf = path.join(dir, "somas.csv"), of = path.join(dir, "out", "hmi.json");
    fs.writeFileSync(xf, XLSX);
    fs.writeFileSync(sf, "id,_x,_y,_z\n101,0,40000,0\n102,99999,20000,99999\n103,5,32401,5\n201,0,32400,0\n202,0,32402,0\n");
    const cmd = path.join(ENG, "tools", "fishHmi.mjs"), run = (args) => spawnSync(process.execPath, [cmd, ...args], { encoding: "utf8", cwd: ENG });
    const dry = run(["--xlsx", xf, "--out", of]);
    ok("a dry run exits 0, prints the build counts and the circuit's, says it is a dry run and writes nothing",
        dry.status === 0 && /\[fishHmi\] 13 rows, 11 cells \(2 rows without a usable Cell ID\); 25 synapse tuples: 19 identified, 2 to an unidentified partner, 2 malformed, 1 unreadable lists; 14 distinct pairs/.test(dry.stdout) && /dry run \(pass --write to write /.test(dry.stdout) && !fs.existsSync(of), dry.stdout.slice(0, 300) + dry.stderr);
    ok("it prints the circuit line: 7 neurons (3 spinal projection neurons, layers), 7 edges (4 excitatory, 3 inhibitory), 11 synapses, 4 pairs (5 synapses) left out, no sides without a soma file; and the classes",
        /circuit \(depth 2\): 7 neurons \(3 spinal projection neurons, \{"0":3,"1":2,"2":2\} by layer\), 7 edges \(4 excitatory, 3 inhibitory\), 11 synapses; 4 pairs \(5 synapses\) onto them from a cell with no label left out; sides: \{"unknown":7\} \(no soma positions: no sides\)/.test(dry.stdout) &&
        /by class \{"I":2,"II":1,"L-2":1,"SPN_turning":1,"SPN_forward":1,"SPN_prox":1\}; by SPN group \{"none":4,"turning":2,"forward":1\}/.test(dry.stdout), dry.stdout);
    const w = run(["--xlsx", xf, "--out", of, "--write"]);
    let js = null; try { js = JSON.parse(fs.readFileSync(of, "utf8")); } catch (e) { js = null; }
    ok("--write makes the folder and writes the circuit JSON ({ meta, neurons, edges }, a final newline) and says where", w.status === 0 && js !== null && J(Object.keys(js)) === '["meta","neurons","edges"]' && fs.readFileSync(of, "utf8").endsWith("}\n") && /\[fishHmi\] wrote /.test(w.stdout) && !/dry run/.test(w.stdout), w.stdout.slice(-200) + w.stderr);
    ok("the written neurons and edges are the depth-2 circuit worked out above (7 neurons with their ids and layers, the 7 edges)", js && J(js.neurons.map((n) => [n.id, n.layer])) === "[[101,1],[102,2],[103,1],[104,2],[201,0],[202,0],[203,0]]" && J(js.edges) === "[[0,1,1,1],[0,4,3,1],[0,6,1,1],[1,0,2,1],[2,4,1,-1],[2,5,2,-1],[3,2,1,-1]]");
    ok("the meta carries the file's own sha256, the build counts, the selection, the citation, the licence note (no licence claimed) and says the ids are SOMA ids", js && js.meta.sha256 === crypto.createHash("sha256").update(XLSX).digest("hex") && js.meta.build?.tuples === 25 && js.meta.build?.identified === 19 && js.meta.selection.neurons === 7 && js.meta.selection.synapses === 11 &&
        /Petkova/.test(js.meta.citation) && /none is claimed here/.test(js.meta.license) && /SOMA ids/.test(js.meta.ids) && /depth 2/.test(js.meta.typePattern) && /VGluT2 \+1, Gad1B -1/.test(js.meta.typePattern) && /HMI_analysis\.zip/.test(js.meta.dataset) && /^https:\/\/storage\.googleapis\.com\/fish1-release\//.test(js.meta.server));
    ok("without --somas the meta says so (somas null) and records the midline (259.208 um) that would have been used", js && js.meta.somas === null && js.meta.midlineUm === 259.208);
    const dep1 = run(["--xlsx", xf, "--out", of, "--depth", "1", "--write"]), j1 = JSON.parse(fs.readFileSync(of, "utf8")), dep4 = run(["--xlsx", xf, "--out", of, "--depth", "4", "--write"]), j4 = JSON.parse(fs.readFileSync(of, "utf8"));
    ok("--depth sets the closure: 1 gives 5 neurons and 4 edges (and says depth 1), 4 gives 9 and 9", dep1.status === 0 && /circuit \(depth 1\): 5 neurons/.test(dep1.stdout) && j1.neurons.length === 5 && j1.edges.length === 4 && j1.meta.selection.depth === 1 && dep4.status === 0 && j4.neurons.length === 9 && j4.edges.length === 9);
    const sd = run(["--xlsx", xf, "--somas", sf, "--out", of, "--write"]), jd = JSON.parse(fs.readFileSync(of, "utf8")), s260 = run(["--xlsx", xf, "--somas", sf, "--midline-um", "260", "--out", of, "--write"]), j260 = JSON.parse(fs.readFileSync(of, "utf8"));
    ok("--somas gives the sides at the default midline 259.208 um (101 R, 102 L, 103 exactly on it: none, 201 L, 202 R) and says how many positions it read; --midline-um 260 moves 103 and 202 to the left",
        sd.status === 0 && /sides: \{"R":2,"L":2,"unknown":3\} \(5 soma positions from somas\.csv\)/.test(sd.stdout) && J(jd.neurons.map((n) => n.side)) === J(["R", "L", null, null, "L", "R", null]) && s260.status === 0 && /sides: \{"R":1,"L":4,"unknown":2\}/.test(s260.stdout) && J(j260.neurons.map((n) => n.side)) === J(["R", "L", "L", null, "L", "L", null]), sd.stdout.split("\n")[1]);
    ok("with --somas the meta carries the soma file's name (not its path), its own sha256 and the number of positions read, and the midline in use (259.208 by default, 260 when asked)",
        jd.meta.somas && jd.meta.somas.file === "somas.csv" && jd.meta.somas.sha256 === crypto.createHash("sha256").update(fs.readFileSync(sf)).digest("hex") && jd.meta.somas.count === 5 && jd.meta.midlineUm === 259.208 && j260.meta.midlineUm === 260 && j260.meta.somas.count === 5, J(jd.meta.somas));
    const none = run([]), unk = run(["--xlsx", xf, "--bogus"]), d0 = run(["--xlsx", xf, "--depth", "0"]), d15 = run(["--xlsx", xf, "--depth", "1.5"]), dx = run(["--xlsx", xf, "--depth", "x"]), mx = run(["--xlsx", xf, "--midline-um", "abc"]), lastNoVal = run(["--xlsx", xf, "--out"]), outWrite = run(["--xlsx", xf, "--out", "--write"]), xNoVal = run(["--xlsx"]);
    ok("the command refuses by name, with the message on stderr, exit 2 and nothing on stdout: no --xlsx, an unknown option, --depth 0 / 1.5 / x, --midline-um abc, an option with no value (last, or followed by another option)",
        none.status === 2 && /--xlsx <em_zfish1_dataframe\.xlsx> is required/.test(none.stderr) && unk.status === 2 && /unknown option --bogus/.test(unk.stderr) && d0.status === 2 && /--depth must be a whole number of 1 or more, got 0/.test(d0.stderr) && d15.status === 2 && /got 1\.5/.test(d15.stderr) && dx.status === 2 && /got x/.test(dx.stderr) &&
        mx.status === 2 && /--midline-um must be a number, got abc/.test(mx.stderr) && lastNoVal.status === 2 && /--out needs a value/.test(lastNoVal.stderr) && outWrite.status === 2 && /--out needs a value/.test(outWrite.stderr) && xNoVal.status === 2 && /--xlsx needs a value/.test(xNoVal.stderr) &&
        [none, unk, d0, d15, dx, mx, lastNoVal, outWrite, xNoVal].every((r) => r.stdout === ""), [none, unk, d0, mx, lastNoVal, outWrite, xNoVal].map((r) => r.status + ":" + r.stderr.trim().slice(0, 60)).join(" | "));
    const missing = run(["--xlsx", path.join(dir, "nope.xlsx")]), garbage = path.join(dir, "garbage.xlsx"); fs.writeFileSync(garbage, "this is not a zip file at all");
    const g = run(["--xlsx", garbage]);
    const noClass = path.join(dir, "noclass.xlsx"); fs.writeFileSync(noClass, xlsxOf([["Cell ID", "inputs", "outputs", "final_neurotransmitter_ID", "network_level"], [{ n: 1 }, "[]", "[]", "VGluT2", "[]"]]));
    const nc = run(["--xlsx", noClass]);
    const noSpnFile = path.join(dir, "nospn.xlsx"); fs.writeFileSync(noSpnFile, xlsxOf([["Cell ID", "classifier", "inputs", "outputs", "final_neurotransmitter_ID", "network_level"], [{ n: 1 }, "1", "[]", "[]", "VGluT2", "[]"]]));
    const ns = run(["--xlsx", noSpnFile]);
    const badSoma = path.join(dir, "badsoma.csv"), emptySoma = path.join(dir, "emptysoma.csv"); fs.writeFileSync(badSoma, "id,x,y,z\n101,1,2,3\n"); fs.writeFileSync(emptySoma, "id,_x,_y,_z\n");
    const lacking = ["id", "_x", "_y", "_z"].map((c) => { const f = path.join(dir, `lack${c}.csv`); fs.writeFileSync(f, ["id", "_x", "_y", "_z"].map((h) => (h === c ? "other" : h)).join(",") + "\n101,1,2,3\n"); return run(["--xlsx", xf, "--somas", f]); });
    ok("a soma file lacking any ONE of id, _x, _y, _z is refused by name (exit 1, nothing on stdout)", lacking.every((r) => r.status === 1 && r.stdout === "" && /the soma file has no id, _x, _y, _z columns/.test(r.stderr)), lacking.map((r) => r.status).join(","));
    const bs = run(["--xlsx", xf, "--somas", badSoma]), es = run(["--xlsx", xf, "--somas", emptySoma]), ms = run(["--xlsx", xf, "--somas", path.join(dir, "nosuch.csv")]);
    ok("a missing file, a file that is not a zip, a sheet without a required column, a dataframe with no spinal projection neuron, a soma file without id/_x/_y/_z, one with no rows and one that is not there are each refused by name: exit 1, message on stderr, nothing on stdout, nothing written",
        missing.status === 1 && /ENOENT/.test(missing.stderr) && g.status === 1 && /not a zip file/.test(g.stderr) && nc.status === 1 && /the sheet has no column "classifier" \(it has Cell ID, inputs, outputs, final_neurotransmitter_ID, network_level\)/.test(nc.stderr) &&
        ns.status === 1 && /no spinal projection neuron/.test(ns.stderr) && bs.status === 1 && /the soma file has no id, _x, _y, _z columns/.test(bs.stderr) && es.status === 1 && /the soma file has no id, _x, _y, _z columns/.test(es.stderr) && ms.status === 1 && /ENOENT/.test(ms.stderr) &&
        [missing, g, nc, ns, bs, es, ms].every((r) => r.stdout === "" && /^fishHmi: /.test(r.stderr)), [missing, g, nc, ns, bs, es, ms].map((r) => r.status + ":" + r.stderr.trim().slice(0, 50)).join(" | "));
    fs.rmSync(dir, { recursive: true, force: true });
});

// ================================================================================================================================================================================================================
sec("8. NOT CHECKED");
console.log("  NOT CHECKED  that the gate's xlsx is what Excel writes: it is what the format says and what the one real file (999 rows) happened to be; features the real file does not use (formulas, merged cells, styles) are not read or needed");
console.log("  NOT CHECKED  that the circuit is the hindbrain motion integrator of the paper: the rule (spinal projection neurons and the labelled cells that feed them) is this tree's, the numbers on the real file are in brain/SUBMARINE_WIP.md");

finished = true;
console.log(fails ? `\nfishHmi-selfcheck: ${fails} FAILED` : "\nfishHmi-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
