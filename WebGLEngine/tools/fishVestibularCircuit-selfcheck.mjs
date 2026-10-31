// WebGLEngine/tools/fishVestibularCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/fishVestibularCircuit-selfcheck.mjs      (~0.3 s -- to be restated at ship)
//
// THE GATE OF tools/fishVestibularCircuit.mjs (and its command): the tool that re-derives rung 4b's circuit from the vendored tables, which brain/FISH_VESTIBULAR_HELPER_WIP.md named as "the next step" beside "a gate that holds the files to their hashes". It does both.
//   1  THE FILES     every vendored file is held to the sha256 PROVENANCE.md records for it; the workbook beside the zip is the zip's own member, byte for byte.
//   2  THE READER    a hand-built zip (stored and deflated members, a bad file, an unsupported method) and a hand-built workbook (shared strings, escapes, inline text, empty cells, two sheets) with worked answers.
//   3  THE RULES     the class prefixes, the two pathways, the myelinated names (01..16 only), the commissural alias between the two workbooks.
//   4  A SYNTHETIC EXTRACTION   three tiny workbooks in a temp folder with worked answers: zero cells are no edge, weights are the counts, the pathways, the reach, the tuning, the unreached afferents, the arm arithmetic.
//   5  THE REAL TABLES   every number the registration quotes (91 hair cells ... 332 edges, 580 synapses, the by-class table, E and B, the reach, the tuning, the floors, the arms and their trainable counts), and the note and the provenance file hold the same numbers as the tool.
// NOT CHECKED, said plainly: that the 106 afferents are all the right ear's utricular afferents; that the articles' own figures agree (the paper's Fig. 6c shares are re-derived, not compared to the figure); that any pilot trained on this circuit does anything.
//
// SABOTAGE LOG (48 mutants of tools/fishVestibularCircuit.mjs, each run against a copy of this gate, 4 at a time; every one red BY NAME):
//   the zip reader: the end record's signature, the entry count, the directory offset, a damaged entry accepted, stored and deflated swapped, other methods accepted, the extra field ignored, the local header's extra length ignored.
//   the workbook reader: the entity order (&amp; first), numeric entities, a two-run shared string joined with a gap, the shared index ignored, no trim, the sheet index off by one, an empty cell kept. the integer rule (decimals accepted).
//   the rules: the class prefixes swapped, the pathway inverted, the escape class short, the myelinated range moved at either end (17, 00).
//   the extraction: the hair-cell row pattern, the afferent column's case, pairs not counted, the tuning column's name, zero cells as edges, the reach flags swapped, the commissural alias dropped or rewritten onto itself, the Source Data's number pattern, the afferent tuning dropped, the summary row counted as an afferent.
//   the facts: the weight floors (> for >=), pairs not counted by class, myelinated and unmyelinated swapped, the share divided by the wrong count, 'live' as all, the rostral sign. the arms: the feature count, the trainable arithmetic (a bias, D from cells), the arm filter, phasic and tonic swapped. the hashes: another algorithm, a zero byte count.
//   Five went 0 red on the first pass and each became a row: a hair-cell row named AM_haircell_R_extra and a fractional cell (1.5) in the synthetic tables, an entity decoded ONCE ('x &lt; y'), a two-run shared string, and a damaged zip directory.
//   FOUND BY THAT ENTITY ROW, IN THE CODE THIS WAS PORTED FROM: tools/fishVestibularFacts.py unescapes a shared string when the table is read AND again when a cell reads it, so a literal '&lt;' in a cell would come out as '<'. No name in these workbooks holds an entity, so none of its numbers moved (the port prints the same ones); the port unescapes once.
//   FOUND BY THE PORT, ALSO IN THE PYTHON: the two workbooks spell the commissural cells differently (vestibular_commissural_R_0n in Supplementary Data 2, vestibular_commiss_R_0n in the Source Data) and the Python tool compared COUNTS of tuned cells (47 of 47) without ever matching a name; matched by name the first draft found 43 of 47. The alias is a registered rule now (sourceName), a gate row, and all 47 match.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import * as F from "./fishVestibularCircuit.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const near = (a, b, t) => Math.abs(a - b) <= t, J = JSON.stringify;
console.log("fishVestibularCircuit-selfcheck -- rung 4b's circuit from the vendored tables\n");

// ---- a zip and a workbook, built by hand ---------------------------------------------------------------------------------------------------------------------------------------------------------
const crc32 = zlib.crc32;
function makeZip(entries) {   // entries: [{ name, data: Buffer, deflate }]
    const local = [], central = []; let off = 0;
    for (const e of entries) {
        const nm = Buffer.from(e.name), raw = e.data, body = e.deflate ? zlib.deflateRawSync(raw) : raw, method = e.method ?? (e.deflate ? 8 : 0), crc = crc32(raw);
        const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
        const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
        local.push(lh, nm, body); central.push(ch, nm); off += 30 + nm.length + body.length;
    }
    const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
    return Buffer.concat([...local, cd, end]);
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function makeXlsx(sheets) {   // sheets: { name: [ { col: value } per row ] }; strings go to the shared table, numbers are <v>
    const shared = [], idx = (s) => { let i = shared.indexOf(s); if (i < 0) { shared.push(s); i = shared.length - 1; } return i; };   // a string "rich:ab|cd" is a shared string of two runs
    const names = Object.keys(sheets), files = [];
    names.forEach((n, i) => {
        const rows = sheets[n].map((r, ri) => `<row r="${ri + 1}">${Object.entries(r).map(([c, v]) => (v === null ? `<c r="${c}${ri + 1}"/>` : typeof v === "number" ? `<c r="${c}${ri + 1}"><v>${v}</v></c>` : v.startsWith("rawinline:") ? `<c r="${c}${ri + 1}" t="inlineStr"><is><t>${v.slice(10)}</t></is></c>` : v.startsWith("inline:") ? `<c r="${c}${ri + 1}" t="inlineStr"><is><t>${esc(v.slice(7))}</t></is></c>` : `<c r="${c}${ri + 1}" t="s"><v>${idx(v)}</v></c>`)).join("")}</row>`).join("");
        files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(`<worksheet><sheetData>${rows}</sheetData></worksheet>`), deflate: true });
    });
    files.push({ name: "xl/workbook.xml", data: Buffer.from(`<workbook><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}"/>`).join("")}</sheets></workbook>`) });
    files.push({ name: "xl/sharedStrings.xml", data: Buffer.from(`<sst>${shared.map((s) => (s.startsWith("rich:") ? `<si>${s.slice(5).split("|").map((t) => `<r><t>${esc(t)}</t></r>`).join("")}</si>` : `<si><t>${esc(s)}</t></si>`)).join("")}</sst>`), deflate: true });
    return makeZip(files);
}

sec("1. THE FILES (held to PROVENANCE.md)");
{
    const prov = fs.readFileSync(path.join(F.DIR, "PROVENANCE.md"), "utf8"), table = new Map([...prov.matchAll(/`(41467_2022_32824_[A-Za-z0-9_]+\.(?:xlsx|zip))`[^|\n]*\|[^|\n]*\|\s*([\d,]+)\s*\|\s*`?([0-9a-f]{64})`?/g)].map((m) => [m[1], { bytes: Number(m[2].replace(/,/g, "")), sha256: m[3] }]));
    const x = F.extract();
    const recorded = Object.entries(F.FILES).filter(([k]) => k !== "sourceXlsx");
    ok("!! each of the three tabled files (the two Supplementary Data workbooks and the Source Data zip) is held to the sha256 and the byte count PROVENANCE.md records, and the tool reports the same", recorded.every(([k, f]) => table.has(f) && x.files[k].sha256 === table.get(f).sha256 && x.files[k].bytes === table.get(f).bytes), recorded.map(([k, f]) => `${f.slice(15, 26)} ${table.has(f) ? "tabled" : "NOT TABLED"}`).join(", "));
    const addLine = /`41467_2022_32824_MOESM11_SourceData\.xlsx`[^\n]*?(\d[\d,]*) bytes, sha256 `([0-9a-f]{64})`/.exec(prov);
    ok("!! the Source Data workbook (added later, described in a paragraph) is held to the 86,497 bytes and the sha256 that paragraph records", !!addLine && x.files.sourceXlsx.bytes === Number(addLine[1].replace(/,/g, "")) && x.files.sourceXlsx.sha256 === addLine[2] && x.files.sourceXlsx.bytes === 86497);
    const member = F.readZip(fs.readFileSync(path.join(F.DIR, F.FILES.sourceZip)))["Source Data for figures.xlsx"];
    ok("!! the workbook beside the zip IS the zip's own member 'Source Data for figures.xlsx', byte for byte (the copy took nothing and changed nothing)", !!member && F.sha256(member) === x.files.sourceXlsx.sha256 && member.length === x.files.sourceXlsx.bytes);
}

sec("2. THE READER (hand-built zip and workbook)");
{
    const z = makeZip([{ name: "a.txt", data: Buffer.from("stored text") }, { name: "dir/b.txt", data: Buffer.from("deflated text ".repeat(50)), deflate: true }]), got = F.readZip(z);
    ok("!! a stored member and a deflated one are read back exactly (names, lengths, bytes), in a zip built here with a central directory", J(Object.keys(got)) === J(["a.txt", "dir/b.txt"]) && got["a.txt"].toString() === "stored text" && got["dir/b.txt"].toString() === "deflated text ".repeat(50));
    ok("!! a file that is not a zip is refused; a member with an unsupported compression method is refused and named", /not a zip/.test(throws(() => F.readZip(Buffer.from("hello world, not a zip at all"))) || "") && /compression method 9/.test(throws(() => F.readZip(makeZip([{ name: "x.bin", data: Buffer.from("abc"), method: 9 }]))) || ""));
    const book = makeXlsx({ Matrix: [{ A: "name", B: "Café & <co>", C: "inline:plain &amp; text" }, { A: "r2", B: 7, C: null, D: "rawinline:&#233;&#x41;" }, { A: "r3", B: "x &lt; y", C: "rich:ab|cd", D: "  padded  " }], "Sheet & two": [{ A: "only", B: 3 }] }), x = F.readXlsx(book);
    ok("!! an entity is decoded ONCE (the text 'x &lt; y' stored escaped twice reads back as 'x &lt; y', not '<'), a shared string of two runs is joined without a gap, and cell text is trimmed", x.Matrix[2].B === "x &lt; y" && x.Matrix[2].C === "abcd" && x.Matrix[2].D === "padded");
    const badZip = makeZip([{ name: "a.txt", data: Buffer.from("x") }]), at = badZip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); badZip[at + 3] = 0x09;
    ok("!! a damaged central directory entry is refused", /bad central directory entry/.test(throws(() => F.readZip(badZip)) || ""));
    ok("!! a workbook reads: shared strings (with &amp; and &lt; unescaped), inline text, numbers as their stored text, an empty cell skipped, a numeric entity (decimal and hex) in raw XML decoded, and two sheets, the second named with an ampersand", J(x.Matrix[0]) === J({ A: "name", B: "Café & <co>", C: "plain &amp; text" }) && J(x.Matrix[1]) === J({ A: "r2", B: "7", D: "éA" }) && J(x["Sheet & two"]) === J([{ A: "only", B: "3" }]) && Object.keys(x).length === 2);
}

sec("3. THE RULES");
{
    ok("!! a central neuron's class is its name's prefix: VS_R, SuperiorVN_R, tangential_nucleus_R, vestibular_commissural_R, Mauthner_R; anything else is null", F.classOf("VS_R_07") === "VS" && F.classOf("SuperiorVN_R_02") === "SVN" && F.classOf("tangential_nucleus_R_11") === "tangential" && F.classOf("vestibular_commissural_R_04") === "commissural" && F.classOf("Mauthner_R") === "Mauthner" && F.classOf("Ear_AnteriorMacula_R_01") === null && F.classOf("Computed afferent tuning") === null && F.classOf("vestibular_commiss_R_01") === null);
    ok("!! the escape pathway is the Mauthner cell and the commissural cells; the balance pathway is the other three classes", ["Mauthner", "commissural"].every((c) => F.pathwayOf(c) === "E") && ["tangential", "SVN", "VS"].every((c) => F.pathwayOf(c) === "B") && J(F.ESCAPE_CLASSES) === J(["Mauthner", "commissural"]) && J(F.BALANCE_CLASSES) === J(["tangential", "SVN", "VS"]));
    ok("!! an afferent is myelinated (phasic) iff its name is Ear_AnteriorMacula_R_01 to _16: 01, 09, 10 and 16 are; 00, 17, 1, 011 and a lower-case spelling are not", ["Ear_AnteriorMacula_R_01", "Ear_AnteriorMacula_R_09", "Ear_AnteriorMacula_R_10", "Ear_AnteriorMacula_R_16"].every(F.isMyelinated) && ["Ear_AnteriorMacula_R_00", "Ear_AnteriorMacula_R_17", "Ear_AnteriorMacula_R_1", "Ear_AnteriorMacula_R_011", "ear_anteriormacula_R_01", "ear_anteriormacula_R_17"].every((n) => !F.isMyelinated(n)));
    ok("!! the Source Data's spelling of the commissural cells is mapped onto the table's (vestibular_commiss_R_01 -> vestibular_commissural_R_01) and nothing else is touched", F.sourceName("vestibular_commiss_R_03") === "vestibular_commissural_R_03" && F.sourceName("Mauthner_R") === "Mauthner_R" && F.sourceName("VS_R_01") === "VS_R_01" && F.sourceName("vestibular_commissural_R_03") === "vestibular_commissural_R_03");
}

sec("4. A SYNTHETIC EXTRACTION (three tiny workbooks, worked answers)");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishvest-"));
    // layer 1: 3 hair cells (the third has no synapse), 3 afferent columns (one of them the unreached afferent), a non-afferent column that must not count, and a non-hair-cell row
    const m1 = [{ A: "x", B: "Ear_AnteriorMacula_R_01", C: "Ear_AnteriorMacula_R_17", D: "ear_anteriormacula_R_18", E: "Total" }, { A: "AM_haircell_R_1", B: 2, C: 1, D: 0, E: 3 }, { A: "AM_haircell_R_2", B: 0, C: 4, D: 0, E: 4 }, { A: "AM_haircell_R_3", B: 0, C: 0, D: 0, E: 0 }, { A: "AM_haircell_R_extra", B: 50, C: 50, D: 50 }, { A: "summary", B: 99, C: 99, D: 99 }];
    // layer 2: 3 afferents x 5 central cells (one per class, the Mauthner one named plainly), a zero that is no edge, and the tuning column
    const m2 = [{ A: "afferent", B: "Mauthner_R", C: "vestibular_commissural_R_01", D: "tangential_nucleus_R_01", E: "SuperiorVN_R_01", F: "VS_R_01", G: "Computed afferent tuning" },
        { A: "Ear_AnteriorMacula_R_01", B: 3, C: 0, D: 2, E: 0, F: 1, G: "0.5" }, { A: "Ear_AnteriorMacula_R_17", B: 0, C: 4, D: 0, E: 1, F: 0, G: "-1.5" }, { A: "ear_anteriormacula_R_18", B: 0, C: 0, D: 0, E: 0, F: "inline:1.5", G: "2" }, { A: "total", B: 3, C: 4, D: 2, E: 1, F: 1 }];
    const sd = [{ A: "x", B: "name", C: "angle" }, { B: "Mauthner_R", C: "0.4" }, { B: "vestibular_commiss_R_01", C: "-2.5" }, { B: "tangential_nucleus_R_01", C: "1E-2" }, { B: "SuperiorVN_R_01", C: "1.2" }, { B: "VS_R_01", C: "nan" }, { B: "other_cell", C: "9" }];
    fs.writeFileSync(path.join(dir, F.FILES.hairToAfferent), makeXlsx({ Matrix: m1 })); fs.writeFileSync(path.join(dir, F.FILES.afferentToCentral), makeXlsx({ Sheet1: m2 })); fs.writeFileSync(path.join(dir, F.FILES.sourceXlsx), makeXlsx({ "Fig 3d, 4a,b,c": sd })); fs.writeFileSync(path.join(dir, F.FILES.sourceZip), makeZip([{ name: "z", data: Buffer.from("z") }]));
    const x = F.extract(dir), f = F.factsOf(x);
    ok("!! layer 1: 3 hair cells (2 with a synapse), 3 afferent columns (the Total column, the summary row and a row named AM_haircell_R_extra do not count); 3 synapses from hair cell 1 and 4 from hair cell 2 make 7, in 3 pairs", x.layer1.hairCells === 3 && x.layer1.hairCellsWithSynapse === 2 && x.layer1.afferents === 3 && x.layer1.synapses === 7 && x.layer1.pairs === 3, J(x.layer1));
    ok("!! layer 2 edges: only cells above zero are edges, weights are the counts: 5 edges (M 3, T 2, VS 1 from afferent 01; commissural 4, SVN 1 from afferent 17), 11 synapses; the 'total' row is not an afferent and a fractional cell (1.5) is not a synapse count", x.edges.length === 5 && f.synapses === 11 && J(x.edges.map((e) => [e.a.slice(-2), e.c.slice(0, 4), e.w])) === J([["01", "Maut", 3], ["01", "tang", 2], ["01", "VS_R", 1], ["17", "vest", 4], ["17", "Supe", 1]]) && x.afferents.length === 3);
    ok("!! the myelinated flag, the reach and the tuning of each afferent: 01 is myelinated and reaches E and B (theta 0.5), 17 is not and reaches E and B (-1.5), 18 reaches nothing (2)", J(x.afferents.map((a) => [a.myelinated, a.reachE, a.reachB, a.theta])) === J([[true, true, true, 0.5], [false, true, true, -1.5], [false, false, false, 2]]) && f.live === 2 && f.unreached === 1 && f.both === 2 && f.eOnly === 0 && f.bOnly === 0 && f.myelinated === 1 && f.liveMyelinated === 1);
    ok("!! the central tuning comes from the Source Data BY NAME with the commissural alias: Mauthner 0.4, the commissural cell -2.5 (its name differs between the books), the tangential 0.01 (scientific notation), SVN 1.2; the VS cell has no number ('nan') and none is invented", J(x.centrals.map((c) => c.theta)) === J([0.4, -2.5, 0.01, 1.2, null]) && x.centralTuningCells === 4);
    const by = f.byClass;
    ok("!! by class: Mauthner 3 synapses (all myelinated), commissural 4 (all unmyelinated), tangential 2, SVN 1, VS 1; E = 2 cells, 2 edges, 7 synapses, myelinated share 3/7; B = 3 cells, 3 edges, 4 synapses, share 3/4", by.Mauthner.synapses === 3 && by.Mauthner.myelinated === 3 && by.commissural.synapses === 4 && by.commissural.unmyelinated === 4 && by.tangential.synapses === 2 && by.SVN.synapses === 1 && by.VS.synapses === 1 && f.E.cells === 2 && f.E.edges === 2 && f.E.synapses === 7 && near(f.E.myelinatedShare, 3 / 7, 1e-12) && f.B.cells === 3 && f.B.edges === 3 && f.B.synapses === 4 && near(f.B.myelinatedShare, 3 / 4, 1e-12));
    const aw = F.armOf(x, "whole"), ab = F.armOf(x, "B"), ae = F.armOf(x, "E");
    ok("!! the arms: whole = 2 inputs (1 phasic, 1 tonic), 5 cells, 5 edges, trainable T = 5 + 2 + 5 + 20 + 4 = 36 and D = 14 x 2 + 36 = 64; B = 2 inputs, 3 cells, 3 edges; E = 2 inputs, 2 cells, 2 edges, T = 2 + 2 + 2 + 8 + 4 = 18", aw.inputs === 2 && aw.phasic === 1 && aw.tonic === 1 && aw.cells === 5 && aw.edges === 5 && aw.trainableT === 36 && aw.trainableD === 64 && ab.inputs === 2 && ab.cells === 3 && ab.edges === 3 && ae.inputs === 2 && ae.cells === 2 && ae.edges === 2 && ae.trainableT === 18 && ae.synapses === 7);
    const fl = f.floors; ok("  the weight floors: >= 1 is 5 edges, >= 2 is 3 edges (3, 2, 4), >= 3 is 2 edges (3, 4), >= 4 is not asked", fl[1].edges === 5 && fl[2].edges === 3 && fl[2].afferents === 2 && fl[3].edges === 2 && fl[3].centrals === 2);
    ok("!! a table with no 'Computed afferent tuning' column is refused", (() => { fs.writeFileSync(path.join(dir, F.FILES.afferentToCentral), makeXlsx({ Sheet1: [{ A: "afferent", B: "Mauthner_R" }, { A: "Ear_AnteriorMacula_R_01", B: 1 }] })); return /Computed afferent tuning/.test(throws(() => F.extract(dir)) || ""); })());
    fs.rmSync(dir, { recursive: true, force: true });
}

sec("5. THE REAL TABLES (every number the registration quotes)");
{
    const x = F.extract(), f = F.factsOf(x), L = x.layer1;
    ok("!! layer 1: 91 hair-cell rows (90 with a synapse), 106 afferents, 930 synapses, 312 hair-cell/afferent pairs (the sheet's own summary rows give 929 and 311: a blank cell the recount reads as one synapse)", L.hairCells === 91 && L.hairCellsWithSynapse === 90 && L.afferents === 106 && L.synapses === 930 && L.pairs === 312);
    ok("!! layer 2: 106 afferents (16 myelinated), 47 central neurons (1 Mauthner, 4 commissural, 11 tangential, 12 SVN, 19 VS), 332 edges, 580 synapses", f.afferents === 106 && f.myelinated === 16 && f.centrals === 47 && f.edges === 332 && f.synapses === 580 && J(CLASS_COUNTS(f)) === J({ Mauthner: 1, commissural: 4, tangential: 11, SVN: 12, VS: 19 }));
    ok("!! by class, synapses over pairs: VS 307 / 186, tangential 104 / 66, SVN 88 / 49, Mauthner 52 / 18, commissural 29 / 13", [["VS", 307, 186], ["tangential", 104, 66], ["SVN", 88, 49], ["Mauthner", 52, 18], ["commissural", 29, 13]].every(([c, s, p]) => f.byClass[c].synapses === s && f.byClass[c].pairs === p));
    ok("!! the paper's Fig. 6c claim, from the raw table: 68% of the synapses onto the escape cells come from myelinated afferents against 39% onto the balance cells (67.9% and 39.1%)", near(f.E.myelinatedShare, 0.679, 0.0005) && near(f.B.myelinatedShare, 0.391, 0.0005) && f.byClass.Mauthner.myelinated === 37 && f.byClass.VS.myelinated === 113);
    ok("!! the two pathways: E has 5 cells, 31 edges, 81 synapses; B has 42 cells, 301 edges, 499 synapses; of the 84 afferents that reach a cell, 8 reach only E, 59 only B and 17 both; 22 reach none; 16 are myelinated", f.E.cells === 5 && f.E.edges === 31 && f.E.synapses === 81 && f.B.cells === 42 && f.B.edges === 301 && f.B.synapses === 499 && f.live === 84 && f.eOnly === 8 && f.bOnly === 59 && f.both === 17 && f.unreached === 22 && f.liveMyelinated === 16);
    ok("!! tilt tuning of the 84: 51 lean rostral and 33 caudal, 74 ipsilateral and 10 contralateral; the Mauthner cell's own angle is 0.4338 rad (ipsilateral, slightly rostral) and all 47 central cells have one", f.tuning.known === 84 && f.tuning.rostral === 51 && f.tuning.caudal === 33 && f.tuning.ipsilateral === 74 && f.tuning.contralateral === 10 && near(x.centrals.find((c) => c.cls === "Mauthner").theta, 0.433758, 1e-6) && x.centrals.every((c) => c.theta !== null) && x.centralTuningCells === 47);
    ok("!! the weight floors the note reports and did not use: >= 2 leaves 143 edges, 57 afferents, 44 neurons; >= 3 leaves 64 edges, 37 afferents, 27 neurons", f.floors[2].edges === 143 && f.floors[2].afferents === 57 && f.floors[2].centrals === 44 && f.floors[3].edges === 64 && f.floors[3].afferents === 37 && f.floors[3].centrals === 27);
    const aw = F.armOf(x, "whole"), ab = F.armOf(x, "B"), ae = F.armOf(x, "E");
    ok("!! the arms and the registration's trainable counts: whole 84 inputs (16 phasic), 47 cells, 332 edges, T 655 and D 1,831; B 76 inputs, 42 cells, 301 edges, T 591 and D 1,655; E 25 inputs (14 phasic), 5 cells, 31 edges, T 85 and D 435", aw.inputs === 84 && aw.phasic === 16 && aw.cells === 47 && aw.trainableT === 655 && aw.trainableD === 1831 && ab.inputs === 76 && ab.cells === 42 && ab.edges === 301 && ab.trainableT === 591 && ab.trainableD === 1655 && ae.inputs === 25 && ae.phasic === 14 && ae.cells === 5 && ae.edges === 31 && ae.trainableT === 85 && ae.trainableD === 435);
    const note = fs.readFileSync(new URL("../brain/FISH_VESTIBULAR_HELPER_WIP.md", import.meta.url), "utf8"), prov = fs.readFileSync(path.join(F.DIR, "PROVENANCE.md"), "utf8");
    ok("!! the registration note holds the same numbers as the tool: 332 edges and 580 synapses, E 31 edges and 81 synapses, B 301 edges and 499 synapses, 1,831 and 655 trainable weights, 51 rostral and 33 caudal; the provenance file holds 930 synapses, 312 pairs, 580 synapses", /\*\*332 edges, 580 synapses\*\*/.test(note) && /31 edges, 81 synapses/.test(note) && /301 edges, 499 synapses/.test(note) && /\*\*1,831\*\*/.test(note) && /\*\*655\*\*/.test(note) && /51 lean rostral and 33 caudal/.test(note) && /930 synapses/.test(prov) && /312 hair-cell\/afferent pairs/.test(prov) && /580 synapses/.test(prov));
    const lines = F.factLines(x).join("\n");
    ok("  the command's report prints the layer lines, the class table, both pathways, the reach, the tuning, the floors and the three arms", /layer 1[^\n]*91 hair cells \(90 with a synapse\)/.test(lines) && /layer 2[^\n]*332 edges, 580 synapses/.test(lines) && /pathway E[\s\S]*pathway B/.test(lines) && /arm whole[^\n]*T 655, D 1831/.test(lines) && /floor >= 3: 64 edges/.test(lines) && /47 of 47/.test(lines));
}
function CLASS_COUNTS(f) { return Object.fromEntries(F.CLASS_ORDER.map((c) => [c, f.byClass[c].cells])); }

sec("9. THREE CONSTANTS THE EXTRACTION IS BUILT ON (named here so the definition ratchet can see them)");
ok("!! CLASSES are the five cell classes in the order the pilot reads them (vestibular, superior vestibular nucleus, tangential, commissural, Mauthner); FEATURES is the 14 the tuning gives; MYELINATED_RE names the sixteen anterior-macula afferents 01-16 and no other", F.CLASSES.length === 5 && F.CLASSES[4][1] === "Mauthner" && F.FEATURES === 14 && F.MYELINATED_RE.test("Ear_AnteriorMacula_R_05") && F.MYELINATED_RE.test("Ear_AnteriorMacula_R_16") && !F.MYELINATED_RE.test("Ear_AnteriorMacula_R_17") && !F.MYELINATED_RE.test("Ear_AnteriorMacula_R_00"));

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
