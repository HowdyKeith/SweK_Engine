// WebGLEngine/tools/fishInputSide-selfcheck.mjs -- UNNUMBERED. Run: node tools/fishInputSide-selfcheck.mjs
//
// THE GATE OF tools/fishInputSideLib.mjs AND tools/fishInputSide.mjs: the input side of a cell, from planted clouds of synapses whose every number was worked out by hand.
//
// THE FIXTURE (a stand-in for an export folder; no real root id, no real row): two cells, A on the high-y side of a midline at 260 um and B on the low-y side, 300 and 220 um, both at 500 x 150 um. Each cell's input synapses are drawn (seeded, sd 1.5 um on every axis)
// around three planted centres in [front-back, lateral, z]: perisomatic (0, -3, 8), lateral arm (5, 36, 6), z arm (0, -5, 62), where LATERAL IS AWAY FROM THE MIDLINE -- so in the file cell B's lateral arm sits at LOWER y than its soma and cell A's at higher.
//   cell A: 500 synapses from 175 partners -- perisomatic 303 (p1..p100 three each, and m1 with three), lateral 131 (l1..l40 three each, m1 with one, s1 with ten: exactly the STRONG_PARTNER line), z arm 60 (z1..z28 two each, x1 and x2 two each), FAR 6 (f1..f3, two each, 250 um from the soma).
//   cell B: 330 synapses from 90 partners -- perisomatic 200 (p81..p130, four each), lateral 100 (l36..l58 and x1, x2, four each), z arm 30 (z20..z34, two each); nothing far.
//   Tags by partner: p1..p70 and l1..l4 and x1, x2 inhibitory (1); every other p, l, z and s excitatory (2); z1..z10 and m1 and f1..f3 have no row (untagged).
//   Shared by A and B: p81..p100 (perisomatic on both: 20), l36..l40 (lateral on both: 5), z20..z28 (z arm on both: 9), x1 and x2 (z arm on A, lateral on B: 2) = 36 partners, 34 in the same group on both.
// Read off the fixture by hand: A's signs by group perisomatic 90 excitatory / 210 inhibitory / 3 untagged (m1), lateral 118 excitatory (l5..l40 and s1: 108 + 10) / 12 inhibitory / 1 untagged (m1), z arm 36 excitatory / 4 inhibitory / 20 untagged, far 0/0/6;
// B's: 322 excitatory, 8 inhibitory.
//
// SABOTAGED -- 47 mutants of tools/fishInputSideLib.mjs (run with SAB_COPY=tools/fishInputSide.mjs so the command's child process imports the mutant) and 14 of tools/fishInputSide.mjs, every one red by name:
//   L01 a doubled quote closes the field 3 | L02 a carriage return is not a line end 1 | L03 blank lines become rows 1 | L04 the last line without an end is dropped 1 | L05 a short row is not padded 1 |
//   L06 the soma is read in synapse voxels 5 | L07 any table's row is a soma 4 | L08 any cell's soma row will do 8 | L09 inputs are the synapses a cell sends 5 | L10 the synapses are read in soma voxels 4 |
//   L11 a dropped row is not counted 2 | L12 a missing position reads as zero 3 | L13 the sides are swapped 4 | L14 the midline is a side 1 | L15 lateral is not made to face away from the midline 6 |
//   L16 z is measured on the wrong axis 15 | L17 the generator is not seeded 3 | L18 the highest summed squared distance wins 2 | L19 fewer points than clusters are accepted 1 | L20 the trim is not applied 11 |
//   L21 the default trim is ten times too wide 11 | L22 lateral is the cluster furthest toward the midline 11 | L23 the z arm is the lowest of the other two 11 | L24 shares are of the fitted synapses only 1 |
//   L25 the far count is not kept 4 | L26 the spread divides by n - 1 1 | L27 purity is a count 2 | L28 a tied sign is excitatory 1 | L29 an untagged synapse counts as excitatory 2 | L30 partners come smallest first 1 |
//   L31 a tie goes to the later group 1 | L32 a strong partner needs one more synapse 1 | L33 nearly single-domain counts as single 1 | L34 an untagged synapse counts as excitatory in the report 2 |
//   L35 every shared partner is in the same group 3 | L36 a sign pair needs only one sign 1 | L37 a tag with no synapse id is kept 1 | L38 a tag that is not a number is kept 1 | L39 the midline is not the middle 2 |
//   L40 one cell needs no midline 2 | L41 one cell has a shared table 2 | L42 the dropped count is lost 1 | L43 a cell with no input is not refused by name 1 | L44 the trim does not reach domainsOf 2 |
//   L45 the seed does not reach domainsOf 1 | L46 no ids is not refused 1 | L47 signs are always reported present 2
//   the command:
//   C01 an unknown option is accepted 1 | C02 --trim is not an option 1 | C03 a midline that is not a number is used 1 | C04 the default cells are in reverse order 1 | C05 the root id is printed 2 |
//   C06 the json carries the root id 1 | C07 --json writes nothing 1 | C08 the signs file is not read 1 | C09 the far line is not printed 1 | C10 every run exits 0 1 | C11 the hint for the missing signs is gone 1 |
//   C12 the shared line is printed for one cell 1 | C13 --midline is not read 2 | C14 --cells is not read 2
// Two went 0 red the first time and were fixed in the gate. L42 (the dropped-row count lost between inputsOf and the result): nothing fed inputSide a row without a position; a row does now (cell B's result must say dropped 1). L45 (the seed not reaching the fit): on well-separated groups the
// seed changes nothing anyone can see, so the fit's own settings (seed, restarts, trim) are now part of every result as `fit` and the row reads them back (seed 9, 3 restarts, 150 um); the same row catches the trim not reaching the fit. Found while reading the ranges: L18 (the HIGHEST summed squared distance wins) was red only through the new
// restarts row, because the planted groups are so well apart that every restart finds them -- the row uses the cell's offsets with the far synapses left in, where a restart that starts on a far point is stuck (the worst single restart is more than twice the best).
// Two things in the fixture were changed so a mutant could not hide: the other table's soma-looking row comes BEFORE the cell's own (L07), and one partner has exactly ten synapses (the STRONG_PARTNER line, L32).
// NOT CHECKED: that the three-group reading is what the real cells are -- the fixture plants three groups and the tool finds them; the first real export's two cells gave three groups each in the same arrangement, which is a measurement and not a test. The tool says where synapses sit and who they come from; it does not say what the groups ARE.
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as L from "./fishInputSideLib.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
console.log("fishInputSide-selfcheck -- the input side of a cell, from planted clouds of synapses\n");

// ---- the fixture ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const CELL_A = "864691128000000001", CELL_B = "864691128000000002", MID = 260;
const SOMA = { [CELL_A]: [500, 300, 150], [CELL_B]: [500, 220, 150] }, SIDE = { [CELL_A]: 1, [CELL_B]: -1 };
const CENTRE = { perisomatic: [0, -3, 8], lateral: [5, 36, 6], zArm: [0, -5, 62] };
const rng = L.mulberry(20260101);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const syn = [];   // { id, pre, post, group, x, y, z } in voxels of 16 x 16 x 30 nm
let nextId = 1000000;
const put = (cell, pre, group, n) => {
    for (let i = 0; i < n; i++) {
        const c = group === "far" ? [250, 0, 0] : CENTRE[group], sd = group === "far" ? 5 : 1.5, s = SOMA[cell];
        const o = [c[0] + sd * gauss(), c[1] + sd * gauss(), c[2] + sd * gauss()];
        syn.push({ id: String(nextId++), pre, post: cell, group, x: Math.round(((s[0] + o[0]) * 1000) / 16), y: Math.round(((s[1] + SIDE[cell] * o[1]) * 1000) / 16), z: Math.round(((s[2] + o[2]) * 1000) / 30) });
    }
};
const range = (a, b, f) => { for (let i = a; i <= b; i++) f(i); };
range(1, 100, (i) => put(CELL_A, "p" + i, "perisomatic", 3)); put(CELL_A, "m1", "perisomatic", 3);
range(1, 40, (i) => put(CELL_A, "l" + i, "lateral", 3)); put(CELL_A, "m1", "lateral", 1); put(CELL_A, "s1", "lateral", 10);
range(1, 28, (i) => put(CELL_A, "z" + i, "zArm", 2)); put(CELL_A, "x1", "zArm", 2); put(CELL_A, "x2", "zArm", 2);
range(1, 3, (i) => put(CELL_A, "f" + i, "far", 2));
range(81, 130, (i) => put(CELL_B, "p" + i, "perisomatic", 4));
range(36, 58, (i) => put(CELL_B, "l" + i, "lateral", 4)); put(CELL_B, "x1", "lateral", 4); put(CELL_B, "x2", "lateral", 4);
range(20, 34, (i) => put(CELL_B, "z" + i, "zArm", 2));
const tagOfPartner = (p) => { const k = p[0], n = Number(p.slice(1)); if (p === "x1" || p === "x2") return 1; if (k === "p") return n <= 70 ? 1 : 2; if (k === "l") return n <= 4 ? 1 : 2; if (k === "z") return n <= 10 ? null : 2; if (k === "s") return 2; return null; };
const csv = (rows) => rows.map((r) => r.map((v) => (/[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v))).join(",")).join("\n") + "\n";
const synapsesCsv = csv([["id", "pre_pt_root_id", "post_pt_root_id", "post_pt_position_x", "post_pt_position_y", "post_pt_position_z", "size"], ...syn.map((s) => [s.id, s.pre, s.post, s.x, s.y, s.z, ""])]);
const somaRow = (cell, extra = {}) => [cell, "somas", JSON.stringify({ cell_type: "na" }), JSON.stringify({ cell_type: "na", pt_position_x: String(Math.round((SOMA[cell][0] * 1000) / 8)), pt_position_y: String(Math.round((SOMA[cell][1] * 1000) / 8)), pt_position_z: String(Math.round((SOMA[cell][2] * 1000) / 30)), pt_root_id: cell, ...extra })];
const labelsCsv = csv([["root_id", "table", "text_columns", "row_json"], [CELL_A, "other_table", "{}", JSON.stringify({ pt_position_x: "1", pt_position_y: "1", pt_position_z: "1" })], somaRow(CELL_A), somaRow(CELL_B)]);
const signRows = syn.filter((s) => tagOfPartner(s.pre) !== null && tagOfPartner(s.pre) !== undefined).map((s) => [String(900000 + Number(s.id)), tagOfPartner(s.pre), s.id]);
const signsCsv = csv([["id", "tag", "target_id"], ...signRows]);
const files = { synapsesIn: L.parseTable(synapsesCsv), labels: L.parseTable(labelsCsv), signs: L.parseTable(signsCsv) };
const nA = syn.filter((s) => s.post === CELL_A).length, nB = syn.filter((s) => s.post === CELL_B).length;

sec("1. the CSV reader");
{
    const t = L.parseTable('a,b,c\r\n1,"x,y",3\r\n"he said ""hi""",,\n"line\nbreak",2\n\n7,8,9');
    ok("!! parseTable READS WHAT THE EXPORT WRITES: a quoted field with a comma, doubled quotes inside quotes, an empty field, CRLF and LF line ends, a newline inside quotes, a short row (missing fields are empty strings), a blank line (skipped) and a last line with no end of line",
        t.length === 4 && t[0].b === "x,y" && t[0].c === "3" && t[1].a === 'he said "hi"' && t[1].b === "" && t[2].a === "line\nbreak" && t[2].b === "2" && t[2].c === "" && t[3].a === "7" && t[3].c === "9" && Object.keys(t[0]).join() === "a,b,c");
    ok("an empty file, and a header with no rows, are empty tables", L.parseTable("").length === 0 && L.parseTable("a,b\n").length === 0 && L.parseTable("a,b").length === 0);
    ok("the fixture's own files survive the round trip: 500 + 330 synapse rows, the three label rows with their JSON intact, the signs", files.synapsesIn.length === nA + nB && nA === 500 && nB === 330 && files.labels.length === 3 && JSON.parse(files.labels[1].row_json).pt_root_id === CELL_A && files.signs.length === signRows.length);
}

sec("2. the soma, the synapses and the units");
{
    const sa = L.somaOf(files.labels, CELL_A);
    ok("!! somaOf TAKES THE somas TABLE'S ROW IN VOXELS OF 8 x 8 x 30 nm: cell A's soma is (500, 300, 150) um to the voxel (the row of another table for the same cell, at (1, 1, 1), is not it)", near(sa[0], 500, 0.01) && near(sa[1], 300, 0.01) && near(sa[2], 150, 0.02), sa.join(" "));
    ok("somaOf refuses a cell with no soma row, naming the id, and does not read another cell's row", /root id 864691128999999999 has no soma row/.test(throws(() => L.somaOf(files.labels, "864691128999999999")) || "") && near(L.somaOf(files.labels, CELL_B)[1], 220, 0.01));
    const a = L.inputsOf(files.synapsesIn, CELL_A), b = L.inputsOf(files.synapsesIn, CELL_B);
    ok("!! inputsOf TAKES THE POSTSYNAPTIC POSITION IN VOXELS OF 16 x 16 x 30 nm and only the rows that arrive on the cell: 500 for A and 330 for B, each with its id, its partner and a position in micrometres near the cell's soma (within 300 um)",
        a.synapses.length === 500 && b.synapses.length === 330 && a.dropped === 0 && a.synapses.every((s) => s.post === CELL_A && Math.hypot(s.p[0] - 500, s.p[1] - 300, s.p[2] - 150) < 300) && b.synapses.every((s) => s.post === CELL_B));
    const holes = [...files.synapsesIn.slice(0, 3), { ...files.synapsesIn[3], post_pt_position_y: "" }, { ...files.synapsesIn[4], post_pt_position_x: "nope" }], h = L.inputsOf(holes, CELL_A);
    ok("a row without a usable position is left out and COUNTED (2 of 5 here), not read as zero", h.synapses.length === 3 && h.dropped === 2);
    ok("!! sideOf SAYS WHICH SIDE OF THE MIDLINE A SOMA IS ON, and refuses the midline itself", L.sideOf([0, 300, 0], MID) === 1 && L.sideOf([0, 220, 0], MID) === -1 && /exactly on the midline/.test(throws(() => L.sideOf([0, 260, 0], 260)) || ""));
    const offA = L.offsetsOf(a.synapses, sa, 1), offB = L.offsetsOf(b.synapses, L.somaOf(files.labels, CELL_B), -1);
    const mean = (off, f) => { const g = off.filter((_, i) => (f === "A" ? a : b).synapses && syn.filter((s) => s.post === (f === "A" ? CELL_A : CELL_B))[i].group === "lateral"); return [0, 1, 2].map((k) => g.reduce((s, o) => s + o[k], 0) / g.length); };
    const lA = mean(offA, "A"), lB = mean(offB, "B");
    ok("!! LATERAL IS AWAY FROM THE MIDLINE FOR BOTH CELLS: the lateral arm of cell A (high-y side) and of cell B (low-y side, whose arm sits at LOWER y than its soma) both come out at lateral offset +36 um (+-0.5), front-back +5, z +6; without the side factor cell B's arm would read -36",
        near(lA[1], 36, 0.5) && near(lB[1], 36, 0.5) && near(lA[0], 5, 0.5) && near(lB[0], 5, 0.5) && near(lA[2], 6, 0.5) && near(lB[2], 6, 0.5), `A ${lA.map((v) => v.toFixed(2))} B ${lB.map((v) => v.toFixed(2))}`);
}

sec("3. the clusters");
{
    const pts = [];
    const r2 = L.mulberry(5);
    for (let c = 0; c < 3; c++) for (let i = 0; i < 40; i++) pts.push([c * 30 + r2(), r2() * 2, r2() * 2]);
    const k1 = L.kmeans(pts, 3, { seed: 3 }), k2 = L.kmeans(pts, 3, { seed: 3 }), k3 = L.kmeans(pts, 3, { seed: 4 });
    const groups = (km) => [0, 1, 2].map((c) => new Set(km.labels.slice(c * 40, c * 40 + 40)).size === 1 && km.labels[c * 40]).join();
    ok("!! kmeans FINDS THREE CLUSTERS THAT ARE THERE: forty points around each of three well-apart centres are each given one label, the three labels differ, and the summed squared distance is small (under 40 points x 3 x 2 axes)", new Set(km1labels(k1)).size === 3 && !groups(k1).includes("false") && k1.sse < 120, `sse ${k1.sse.toFixed(1)}`);
    ok("kmeans IS DETERMINISTIC: the same seed gives the same labels and centroids to the bit; another seed gives the same partition of these points (the clusters are the clusters)", JSON.stringify(k1) === JSON.stringify(k2) && samePartition(k1.labels, k3.labels));
    const offAll = (() => { const ins = L.inputsOf(files.synapsesIn, CELL_A), soma = L.somaOf(files.labels, CELL_A); return L.offsetsOf(ins.synapses, soma, 1); })();
    const singles = Array.from({ length: 12 }, (_, i) => L.kmeans(offAll, 3, { seed: i + 1, restarts: 1 }).sse), many = L.kmeans(offAll, 3, { seed: 1, restarts: 8 }).sse;
    ok("!! THE LOWEST SUMMED SQUARED DISTANCE WINS AMONG THE RESTARTS: on cell A's offsets with the six far synapses left in, single restarts are not all alike (the worst is more than twice the best -- a seed that picks a far point to start from gets stuck), and eight restarts from one seed reach the best of twelve single restarts",
        Math.max(...singles) > 2 * Math.min(...singles) && many <= Math.min(...singles) + 1e-6, `singles ${Math.min(...singles).toFixed(0)}..${Math.max(...singles).toFixed(0)}, eight restarts ${many.toFixed(0)}`);
    ok("kmeans refuses fewer points than clusters, naming both numbers", /2 points cannot make 3 clusters/.test(throws(() => L.kmeans([[0, 0, 0], [1, 1, 1]], 3)) || ""));
    function km1labels(k) { return k.labels; }
    function samePartition(a, b) { const m = new Map(); for (let i = 0; i < a.length; i++) { if (!m.has(a[i])) m.set(a[i], b[i]); if (m.get(a[i]) !== b[i]) return false; } return new Set(m.values()).size === m.size; }
}

const cellsOf = (opts = {}) => {
    const out = {};
    for (const c of [CELL_A, CELL_B]) {
        const ins = L.inputsOf(files.synapsesIn, c), soma = L.somaOf(files.labels, c), off = L.offsetsOf(ins.synapses, soma, SIDE[c]);
        out[c] = { ins, off, dom: L.domainsOf(off, { seed: 1, ...opts }) };
    }
    return out;
};

sec("4. the domains");
{
    const cs = cellsOf(), A = cs[CELL_A].dom, B = cs[CELL_B].dom;
    ok("!! THE THREE DOMAINS ARE FOUND AND NAMED BY WHERE THEY SIT, the same way for both cells: cell A has 303 perisomatic, 131 lateral, 60 z-arm and 6 far synapses, cell B 200, 100, 30 and 0 -- the planted counts, exactly",
        A.count.perisomatic === 303 && A.count.lateral === 131 && A.count.zArm === 60 && A.count.far === 6 && B.count.perisomatic === 200 && B.count.lateral === 100 && B.count.zArm === 30 && B.count.far === 0, JSON.stringify(A.count) + JSON.stringify(B.count));
    const cn = (d, k) => d.centroids[k].map((v) => v.toFixed(1)).join();
    ok("!! THE CENTROIDS ARE THE PLANTED CENTRES to 0.5 um on every axis, for both cells (perisomatic (0, -3, 8), lateral (5, 36, 6), z arm (0, -5, 62)), and the spreads are about the planted 1.5 um (+-0.6: a sample of thirty or sixty)",
        ["perisomatic", "lateral", "zArm"].every((k) => [A, B].every((d) => d.centroids[k].every((v, i) => near(v, CENTRE[k][i], 0.5)) && d.sd[k].every((v) => near(v, 1.5, 0.6)))), `A ${cn(A, "lateral")} B ${cn(B, "zArm")}`);
    ok("the shares are of ALL the synapses, far ones included: A's are 303/500, 131/500, 60/500 and 6/500", near(A.share.perisomatic, 303 / 500, 1e-12) && near(A.share.lateral, 131 / 500, 1e-12) && near(A.share.zArm, 60 / 500, 1e-12) && near(A.share.far, 6 / 500, 1e-12) && A.names.length === 500 && A.trimUm === 100);
    const nameCount = (d) => d.names.reduce((m, n) => ({ ...m, [n]: (m[n] || 0) + 1 }), {});
    ok("every synapse's name is its planted group (the fixture's own record of it): 500 + 330 names, none different", [CELL_A, CELL_B].every((c) => cs[c].dom.names.every((n, i) => n === syn.filter((s) => s.post === c)[i].group)) && JSON.stringify(nameCount(A)) === JSON.stringify({ perisomatic: 303, lateral: 131, zArm: 60, far: 6 }));
    const order = cs[CELL_A].off.map((o, i) => [o, i]).sort((x, y) => (x[0][2] + x[0][1] * 1e-3) - (y[0][2] + y[0][1] * 1e-3)), shuffled = order.map((x) => x[0]), back = L.domainsOf(shuffled, { seed: 1 });
    ok("THE NAMES DO NOT DEPEND ON THE ORDER OF THE ROWS: sorted by z instead of by file order, the same synapses get the same names (checked against the planted group of each) and the same counts", back.names.every((n, j) => n === syn.filter((s) => s.post === CELL_A)[order[j][1]].group) && back.count.zArm === 60);
    const wide = cellsOf({ trimUm: Infinity })[CELL_A].dom;
    ok("!! THE TRIM IS WHAT KEEPS THE FAR SYNAPSES FROM TAKING A CLUSTER (the first real export's cell 2): with no trim the six synapses 250 um out are fitted, take a cluster of their own (the perisomatic group is then those six, 254 um out) and the real perisomatic and lateral groups are merged (434 synapses), so neither planted count is found; with the trim of 100 um all three are; and a trim of 300 um lets them back in the same way",
        wide.count.far === 0 && wide.count.perisomatic !== 303 && wide.count.lateral !== 131 && A.count.perisomatic === 303 && A.count.lateral === 131 && cellsOf({ trimUm: 300 })[CELL_A].dom.count.perisomatic !== 303, JSON.stringify(wide.count));
    ok("a cell with fewer than three groups of synapses is refused by name (all points in one place: a cluster comes out empty)", /fewer than three groups/.test(throws(() => L.domainsOf(Array.from({ length: 30 }, () => [1, 1, 1]), { seed: 1 })) || ""));
    const grp = (c, g) => cs[c].off.filter((_, i) => cs[c].dom.names[i] === g), mu = (pts, a) => pts.reduce((x, p) => x + p[a], 0) / pts.length, sd = (pts, a) => Math.sqrt(pts.reduce((x, p) => x + (p[a] - mu(pts, a)) ** 2, 0) / pts.length);
    ok("!! THE CENTROIDS AND SPREADS ARE THE MEAN AND THE POPULATION SD OF THE SYNAPSES NAMED FOR THE GROUP, exactly (1e-9), for every group of both cells -- not a fit to the planted numbers", [CELL_A, CELL_B].every((c) => ["perisomatic", "lateral", "zArm"].every((g) => [0, 1, 2].every((a) => near(cs[c].dom.centroids[g][a], mu(grp(c, g), a), 1e-9) && near(cs[c].dom.sd[g][a], sd(grp(c, g), a), 1e-9)))));
    const again = cellsOf()[CELL_A].dom;
    ok("domainsOf IS DETERMINISTIC (same seed, same everything) and does not depend on the seed here (seed 7 gives the same names)", JSON.stringify(again) === JSON.stringify(A) && JSON.stringify(L.domainsOf(cs[CELL_A].off, { seed: 7 }).names) === JSON.stringify(A.names));
}

sec("5. the partners");
{
    const cs = cellsOf(), tags = L.tagsOf(files.signs);
    ok("tagsOf MAPS A SYNAPSE ID TO ITS TAG, and leaves out a row with no tag or no id", tags.size === signRows.length && L.tagsOf([{ target_id: "5", tag: "2" }, { target_id: "", tag: "1" }, { target_id: "6", tag: "" }, { target_id: "7", tag: "3" }]).size === 2 && L.tagsOf([{ target_id: "5", tag: "2" }]).get("5") === 2 && L.tagsOf([{ target_id: "7", tag: "3" }]).get("7") === 3);
    const pa = L.partnersOf(cs[CELL_A].ins.synapses, cs[CELL_A].dom.names, tags), pb = L.partnersOf(cs[CELL_B].ins.synapses, cs[CELL_B].dom.names, tags), get = (ps, id) => ps.find((p) => p.pre === id);
    ok("!! A PARTNER IS A COUNT PER GROUP: A has 175 partners and B 90; p1 has 3 synapses all perisomatic (purity 1), m1 has 4 (3 perisomatic and 1 lateral: dominant perisomatic, purity 0.75), s1 has 10 lateral, f1 has 2 far (dominant far)",
        pa.length === 175 && pb.length === 90 && get(pa, "p1").n === 3 && get(pa, "p1").domains.perisomatic === 3 && get(pa, "p1").purity === 1 && get(pa, "m1").n === 4 && get(pa, "m1").dominant === "perisomatic" && get(pa, "m1").purity === 0.75 && get(pa, "m1").domains.lateral === 1 && get(pa, "s1").n === 10 && get(pa, "s1").dominant === "lateral" && get(pa, "f1").dominant === "far" && get(pa, "f1").n === 2);
    ok("!! A PARTNER'S SIGN IS ITS MAJORITY, from the tags of its synapses: p1 inhibitory (3 of 3 tagged 1), p100 excitatory, l2 inhibitory, l10 excitatory, x1 inhibitory, z3 NO sign (untagged), m1 none; a tie between the two is none",
        get(pa, "p1").sign === "inhibitory" && get(pa, "p1").inh === 3 && get(pa, "p100").sign === "excitatory" && get(pa, "l2").sign === "inhibitory" && get(pa, "l10").sign === "excitatory" && get(pa, "x1").sign === "inhibitory" && get(pa, "z3").sign === "none" && get(pa, "z3").untagged === 2 && get(pa, "m1").sign === "none"
        && L.partnersOf([{ id: "1", pre: "q", p: [0, 0, 0] }, { id: "2", pre: "q", p: [0, 0, 0] }], ["lateral", "lateral"], new Map([["1", 1], ["2", 2]]))[0].sign === "none");
    ok("partners come out biggest first, the smaller id first among equals (s1 ten, then the four of cell A's m1, then the threes), and without tags every synapse is untagged", pa[0].pre === "s1" && pa[0].n === 10 && pa[1].pre === "m1" && pa[2].n === 3 && pa[2].pre < pa[3].pre && L.partnersOf(cs[CELL_A].ins.synapses, cs[CELL_A].dom.names, null).every((p) => p.exc === 0 && p.inh === 0 && p.untagged === p.n));
    ok("a partner whose synapses are split evenly between two groups goes to the first of them in the order perisomatic, lateral, z arm, far (a tie is not left to chance)", L.partnersOf([{ id: "1", pre: "q", p: [0, 0, 0] }, { id: "2", pre: "q", p: [0, 0, 0] }], ["lateral", "perisomatic"], null)[0].dominant === "perisomatic" && L.partnersOf([{ id: "1", pre: "q", p: [0, 0, 0] }, { id: "2", pre: "q", p: [0, 0, 0] }], ["far", "zArm"], null)[0].dominant === "zArm");
    const mini = (pre, dominant, sign) => ({ pre, dominant, sign }), shm = L.sharedOf([mini("a", "lateral", "excitatory"), mini("b", "lateral", "none"), mini("c", "zArm", "inhibitory"), mini("d", "far", "none")], [mini("a", "lateral", "excitatory"), mini("b", "zArm", "excitatory"), mini("c", "zArm", "none"), mini("e", "far", "none")]);
    ok("!! sharedOf COUNTS A SIGN PAIR ONLY WHEN BOTH CELLS HAVE A SIGN: of three shared partners (a, b, c) only a has one on both cells (excitatory/excitatory 1), b and c have none on one side and are not in the sign pairs; two are in the same group on both (a and c); d and e are not shared", shm.shared === 3 && shm.sameDomain === 2 && JSON.stringify(shm.signPairs) === JSON.stringify({ "excitatory/excitatory": 1 }) && shm.pairs["lateral>lateral"] === 1 && shm.pairs["lateral>zArm"] === 1 && shm.pairs["zArm>zArm"] === 1);
    const sh = L.sharedOf(pa, pb);
    ok("!! THE SHARED PARTNERS ARE COUNTED AND PLACED: 36 are on both cells, 34 in the same group on both -- 20 perisomatic>perisomatic (p81..p100), 5 lateral>lateral (l36..l40), 9 zArm>zArm (z20..z28) -- and 2 (x1, x2) are z arm on A and lateral on B; by sign 34 excitatory/excitatory and 2 inhibitory/inhibitory",
        sh.shared === 36 && sh.sameDomain === 34 && sh.pairs["perisomatic>perisomatic"] === 20 && sh.pairs["lateral>lateral"] === 5 && sh.pairs["zArm>zArm"] === 9 && sh.pairs["zArm>lateral"] === 2 && Object.keys(sh.pairs).length === 4 && sh.signPairs["excitatory/excitatory"] === 34 && sh.signPairs["inhibitory/inhibitory"] === 2 && Object.keys(sh.signPairs).length === 2);
}

sec("6. the report");
{
    const cs = cellsOf(), tags = L.tagsOf(files.signs);
    const mk = (c) => { const ps = L.partnersOf(cs[c].ins.synapses, cs[c].dom.names, tags); return L.reportOf(cs[c].ins.synapses, cs[c].off, cs[c].dom, ps, tags); };
    const ra = mk(CELL_A), rb = mk(CELL_B);
    ok("!! THE REPORT OF CELL A, by hand: 500 synapses, 175 partners; by commonest group 101 perisomatic (p1..p100 and m1), 41 lateral (l1..l40 and s1), 30 z arm (z1..z28, x1, x2), 3 far; strong partners (10 or more) one, lateral (s1, which has exactly ten); 174 of 175 keep to one group (m1 does not); synapses per partner 3.0 perisomatic, 3.12 lateral, 2 z arm, 2 far",
        ra.synapses === 500 && ra.partners.total === 175 && JSON.stringify(ra.partners.byDominant) === JSON.stringify({ perisomatic: 101, lateral: 41, zArm: 30, far: 3 }) && JSON.stringify(ra.partners.strongByDominant) === JSON.stringify({ perisomatic: 0, lateral: 1, zArm: 0, far: 0 }) && ra.partners.singleDomain === 174 && near(ra.partners.singleDomainShare, 174 / 175, 1e-12)
        && ra.partners.synapsesPerPartner.perisomatic === 3 && ra.partners.synapsesPerPartner.lateral === 3.12 && ra.partners.synapsesPerPartner.zArm === 2 && ra.partners.synapsesPerPartner.far === 2 && ra.far.synapses === 6 && ra.trimUm === 100, JSON.stringify(ra.partners.byDominant));
    ok("!! THE SIGNS BY GROUP, by hand: cell A perisomatic 90 excitatory / 210 inhibitory / 3 untagged; lateral 118 / 12 / 1; z arm 36 / 4 / 20; far 0 / 0 / 6; cell B 322 excitatory and 8 inhibitory in all, none untagged",
        JSON.stringify(ra.signs.perisomatic) === JSON.stringify({ excitatory: 90, inhibitory: 210, untagged: 3 }) && JSON.stringify(ra.signs.lateral) === JSON.stringify({ excitatory: 118, inhibitory: 12, untagged: 1 }) && JSON.stringify(ra.signs.zArm) === JSON.stringify({ excitatory: 36, inhibitory: 4, untagged: 20 }) && JSON.stringify(ra.signs.far) === JSON.stringify({ excitatory: 0, inhibitory: 0, untagged: 6 })
        && ["perisomatic", "lateral", "zArm", "far"].reduce((s, d) => s + rb.signs[d].excitatory, 0) === 322 && ["perisomatic", "lateral", "zArm", "far"].reduce((s, d) => s + rb.signs[d].inhibitory, 0) === 8 && ["perisomatic", "lateral", "zArm", "far"].every((d) => rb.signs[d].untagged === 0), JSON.stringify(ra.signs.lateral));
    const rn = L.reportOf(cs[CELL_A].ins.synapses, cs[CELL_A].off, cs[CELL_A].dom, L.partnersOf(cs[CELL_A].ins.synapses, cs[CELL_A].dom.names, null), null);
    ok("without tags the report has no signs at all (not zeros that read as 'all untagged')", !("signs" in rn) && rn.synapses === 500);
}

sec("7. the whole thing from the files");
{
    const res = L.inputSide(files, [CELL_A, CELL_B]);
    ok("!! inputSide DOES IT ALL FROM THE PARSED FILES: with no midline given it takes the middle of the two somas along the left-right axis (260 um, and says so), reads cell A on the high side and B on the low, and has the same counts and the shared partners as the hand work above",
        near(res.midlineUm, 260, 0.01) && /middle of the cells' somas/.test(res.midlineFrom) && res.signs === true && res.cells[0].side === 1 && res.cells[1].side === -1 && res.cells[0].report.synapses === 500 && res.cells[1].report.synapses === 330 && res.shared.shared === 36 && res.cells[0].report.domains.zArm.synapses === 60 && res.cells[1].report.partners.total === 90);
    const r1 = L.inputSide({ ...files, signs: null }, [CELL_A], { midlineUm: 258 });
    ok("one cell needs a midline, and a given midline is used as given (258 here, said to be given); without the label table the result says signs false", r1.midlineUm === 258 && r1.midlineFrom === "given" && r1.signs === false && r1.shared === null && !("signs" in r1.cells[0].report) && /no midline/.test(throws(() => L.inputSide(files, [CELL_A]) ) || ""));
    ok("inputSide refuses by name: a cell with no soma row, a cell with no input synapse, an empty list of cells, and two cells at the same left-right position with no midline given",
        /has no soma row/.test(throws(() => L.inputSide(files, ["864691128999999999"], { midlineUm: 260 })) || "") && /cell 1 of 1 has no input synapse/.test(throws(() => L.inputSide({ ...files, synapsesIn: files.synapsesIn.filter((r) => r.post_pt_root_id !== CELL_A) }, [CELL_A], { midlineUm: 260 })) || "") && /no cell ids/.test(throws(() => L.inputSide(files, [])) || "")
        && /no midline/.test(throws(() => L.inputSide({ ...files, labels: files.labels.map((r) => (r.root_id === CELL_B && r.table === "somas" ? { ...r, row_json: r.row_json.replace(/"pt_position_y":"\d+"/, '"pt_position_y":"' + Math.round((SOMA[CELL_A][1] * 1000) / 8) + '"') } : r)) }, [CELL_A, CELL_B])) || ""));
    const withHole = L.inputSide({ ...files, synapsesIn: [...files.synapsesIn, { ...files.synapsesIn.find((r) => r.post_pt_root_id === CELL_B), post_pt_position_x: "" }] }, [CELL_A, CELL_B]);
    ok("!! A ROW WITHOUT A POSITION IS COUNTED ALL THE WAY UP: one added row for cell B with no x is dropped, cell B's result says dropped 1 (and keeps its 330 synapses), cell A's says 0", withHole.cells[1].dropped === 1 && withHole.cells[0].dropped === 0 && withHole.cells[1].report.synapses === 330);
    const fitted = L.inputSide(files, [CELL_A, CELL_B], { seed: 9, restarts: 3, trimUm: 150 });
    ok("!! THE FIT'S OWN SETTINGS REACH THE FIT AND ARE REPORTED (a result says how it was made): seed 9, 3 restarts and a trim of 150 um come out in each cell's `fit`, the defaults are seed 1, 8 restarts, 100 um, and the two cells always agree",
        fitted.cells.every((c) => c.fit.seed === 9 && c.fit.restarts === 3 && c.fit.trimUm === 150) && res.cells.every((c) => c.fit.seed === 1 && c.fit.restarts === 8 && c.fit.trimUm === 100));
    const again = L.inputSide(files, [CELL_A, CELL_B]);
    ok("the whole result is deterministic: two runs give the same JSON; the seed does not change the groups here", JSON.stringify(again) === JSON.stringify(res) && JSON.stringify(L.inputSide(files, [CELL_A, CELL_B], { seed: 9 }).cells.map((c) => c.report.domains)) === JSON.stringify(res.cells.map((c) => c.report.domains)));
}

sec("8. the command");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fishinput-"));
    fs.writeFileSync(path.join(dir, "synapses_in.csv"), synapsesCsv); fs.writeFileSync(path.join(dir, "labels.csv"), labelsCsv); fs.writeFileSync(path.join(dir, "synapse_signs.csv"), signsCsv);
    fs.writeFileSync(path.join(dir, "mauthner_candidates.json"), JSON.stringify({ ids: [CELL_A, CELL_B] }));
    const cmd = path.join(ENG, "tools", "fishInputSide.mjs"), run = (args) => spawnSync(process.execPath, [cmd, ...args], { encoding: "utf8", cwd: ENG }), jf = path.join(dir, "report.json");
    const r = run(["--dir", dir, "--json", jf]), report = fs.existsSync(jf) ? fs.readFileSync(jf, "utf8") : "";
    ok("!! THE COMMAND PRINTS THE FACTS AND NO ROOT ID: exit 0, the two cells in the order of mauthner_candidates.json, 500 and 330 input synapses, the far line for cell A (6 synapses), 36 shared partners, the signs, and neither the printed output nor the --json file contains either root id or any partner id",
        r.status === 0 && /cell 1: soma at 500 x 300 x 150 um, high-y side, 500 input synapses from 175 partners/.test(r.stdout) && /cell 2: soma at 500 x 220 x 150 um, low-y side, 330 input synapses from 90 partners/.test(r.stdout) && /FAR \(more than 100 um from the soma, not in the fit\): 6 synapses from 3 partners/.test(r.stdout) && /shared by cells 1 and 2: 36 partners, 34 in the same group on both/.test(r.stdout)
        && /excitatory 90, inhibitory 210, untagged 3/.test(r.stdout) && !r.stdout.includes("86469112800") && !report.includes("86469112800") && report.includes('"signs": true') && /counts only: no root id/.test(r.stdout), r.stderr.slice(0, 200));
    const r2 = run(["--dir", dir, "--cells", CELL_B, "--midline", "260"]);
    ok("--cells picks and orders the cells and --midline is used (one cell: cell 1 is B, on the low side)", r2.status === 0 && /cell 1: soma at 500 x 220 x 150 um, low-y side, 330 input synapses/.test(r2.stdout) && /midline 260\.0 um \(given\)/.test(r2.stdout) && !/shared by/.test(r2.stdout));
    const r3 = run(["--dir", dir, "--trim", "300"]);
    ok("--trim reaches the library: with 300 um the six far synapses are in the fit and the FAR line is gone", r3.status === 0 && !/FAR \(more than/.test(r3.stdout));
    fs.rmSync(path.join(dir, "synapse_signs.csv"));
    const r4 = run(["--dir", dir]);
    ok("without synapse_signs.csv it says so and tells how to get it (--signs), and prints no signs", r4.status === 0 && /signs NOT in this export \(run fishCaveExport\.py export with --signs\)/.test(r4.stdout) && !/excitatory \d+, inhibitory/.test(r4.stdout));
    const bad = [run([]), run(["--dir"]), run(["--dir", dir, "--nope"]), run(["--dir", path.join(dir, "missing")]), run(["--dir", dir, "--midline", "x"]), run(["--dir", dir, "--cells", "864691128999999999", "--midline", "260"])];
    ok("the command refuses by name, each with a message on stderr and nothing on stdout: no --dir (2), --dir without a value (2), an unknown option (2), a folder without the files (1: names synapses_in.csv), a midline that is not a number (1), a cell with no soma row (1)",
        bad[0].status === 2 && /--dir <an export folder> is required/.test(bad[0].stderr) && bad[1].status === 2 && bad[2].status === 2 && /unknown option --nope/.test(bad[2].stderr) && bad[3].status === 1 && /synapses_in\.csv|mauthner_candidates\.json/.test(bad[3].stderr) && bad[4].status === 1 && /--midline must be a number/.test(bad[4].stderr) && bad[5].status === 1 && /has no soma row/.test(bad[5].stderr) && bad.every((b) => b.stdout === ""), bad.map((b) => b.status).join());
    fs.rmSync(dir, { recursive: true, force: true });
}

finished = true;
console.log(fails ? `\nfishInputSide-selfcheck: ${fails} FAILED` : "\nfishInputSide-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
