// WebGLEngine/tools/flyCx-selfcheck.mjs -- UNNUMBERED. Run: node tools/flyCx-selfcheck.mjs
//
// THE GATE OF tools/flyCxLib.mjs AND tools/flyCx.mjs: the fruit fly's heading loop cut out of the hemibrain adjacency export, from a fixture of seven cells worked out by hand (no real body id).
//
// THE FIXTURE (traced-neurons.csv): 100 EPG L1 | 20 EPG R2 | 3 PEN_a L2 | 4 PEN_b R3 | 5 Delta7 (..._R) | 6 PEG L1 | 9 EPG with a comma and no side in its name (a quoted field) | 7 EPGt, 8 PFL3 (types that are NOT chosen) | 'abc' EPG (not an id).
//   The chosen cells in ascending NUMERIC id: 3 (PEN_a, layer 1) 4 (PEN_b, 2) 5 (Delta7, 3, inhibitory) 6 (PEG, 4) 9 (EPG, 0, no side) 20 (EPG, R) 100 (EPG, L) = indices 0..6.
// THE CONNECTIONS (pre > post : weight): 100>3 : 5 | 3>100 : 12 | 5>100 : 3 | 5>20 : 2 | 20>5 : 4 | 4>6 : 1 | 9>9 : 7 (a self-loop) | 100>8 : 9 and 7>100 : 6 (one end is not chosen) | 6>9 : 3 | 20>100 : 8       11 rows.
//   With the floor at 3: edges [from, to, weight, sign] sorted: [0,6,12,+] (3>100) [2,6,3,-] (5>100) [3,4,3,+] (6>9) [5,2,4,+] (20>5) [5,6,8,+] (20>100) [6,0,5,+] (100>3): 6 edges, 35 synapses, 5 excitatory and 1 inhibitory;
//   8 pairs between chosen cells (the self-loop not among them), 2 below the floor (5>20 : 2 and 4>6 : 1: 3 synapses), 1 self-loop. At a floor of 4: 4 edges and 4 pairs (9 synapses) below it; at 1: all 8 pairs are edges.
//   Input cells (E-PG and P-EN): indices 0 1 4 5 6; output cells (E-PG and P-EG): 3 4 5 6.
//
// SABOTAGED -- 41 mutants of tools/flyCxLib.mjs (run with SAB_COPY=tools/flyCx.mjs so the command's child process imports the mutant) and 31 of tools/flyCx.mjs, every one red by a row that names it:
//   the cells E01 Delta7 excitatory | E02 P-EG inhibitory | E03 the tangential subtype for the compass cells | E04 the side read anywhere in the name | E05 a one-digit side number | E06 a lower-case side | E07 a type with spaces not its type |
//   E08 any word is a body id | E09 a skipped row not counted | E10 cells sorted as text | E11 a body id twice accepted | E12 every cell in layer 0 | E13 the instance not kept
//   the edges E14 a pair at the floor dropped | E15 a pair one below the floor kept | E16 a self-loop an edge | E17 a repeated pair accepted | E18 a bad weight accepted | E19 the sign the target's | E20 the signs swapped | E21 sorted by target first |
//   E22 the edges backwards | E23 the rows not counted | E24 the pairs between chosen cells not counted | E25 the below-floor synapses counted as pairs | E26 a fractional floor | E27 a floor of zero | E28 a pair with one end chosen looked at
//   input and output E29 Delta7 cells as inputs | E30 P-EN_b not an input | E31 P-EG not an output
//   the circuit E32 no missing-type refusal | E33 no empty-table refusal | E34 the default floor 4 | E35 the class pair backwards | E36 the synapses counted as edges | E37 the rule renamed | E38 the defaults mutable | E39 a cell type mutable |
//   E40 the sides miscounted | E41 the floor not recorded
//   the command K01 an unknown option | K02 --min-weight | K03 --dir | K04 --write not options | K05 an option takes an option as its value | K06 no value at the end | K07 the files optional | K08 a fractional floor | K09 a zero floor |
//   K10 any header | K11 a row of the wrong width | K12 a file with no rows | K13 missing columns | K15 the last row dropped without a line end | K16 and K17 the two hashes swapped | K18 the licence note | K19 the sign note lost | K20 the citation lost |
//   K21 the folder not made | K22 no final newline | K23 every run writes | K24 a read failure exits 2 | K25 a refusal to stdout | K26 the floor not passed on | K27 the dry run not said | K28 the written path not said | K29 no io in the file |
//   K30 the floor not in the meta | K31 http | K32 --dir not joined to the file names
// ONE WENT 0 RED: K14 (the command no longer strips a carriage return from each row). EQUIVALENT: a Windows line end leaves "\r" on the weight, and Number("3\r") is 3, so the strip changed nothing; it was CUT (the gate keeps its Windows-line-ends row, which
// is a behaviour worth holding). The cut itself broke the command once, in a way the gate caught at once: the comment that said why was put on the line of the statement that moves to the next row, and swallowed it.
// NOT TRIED: nothing the gate can see is left out.
//
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as F from "./flyCxLib.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const J = (v) => JSON.stringify(v);
console.log("flyCx-selfcheck -- the heading loop out of the hemibrain adjacency export\n");

const NEURON_CSV = ['bodyId,type,instance', '100,EPG,EPG(PB08)_L1', '20,EPG,EPG(PB08)_R2', '3,PEN_a(PEN1),PEN_a(PB06a)_L2', '4,PEN_b(PEN2),PEN_b(PB06b)_R3', '5,Delta7,Delta7(PB15)_L1L9R8_R', '6,PEG,PEG(PB07)_L1', '9,EPG,"EPG,odd"', '7,EPGt,EPGt(PB09)_L9', '8,PFL3,PFL3_L', 'abc,EPG,EPG_x', ''].join("\n");
const ALL = [[100, 3, 5], [3, 100, 12], [5, 100, 3], [5, 20, 2], [20, 5, 4], [4, 6, 1], [9, 9, 7], [100, 8, 9], [7, 100, 6], [6, 9, 3], [20, 100, 8]].map(([pre, post, weight]) => ({ pre, post, weight }));
const CONN_CSV = "bodyId_pre,bodyId_post,weight\n" + ALL.map((r) => `${r.pre},${r.post},${r.weight}`).join("\n") + "\n";
const parseRows = (csv) => { const [h, ...rest] = csv.trim().split("\n"); const cols = h.split(","); return rest.map((l) => { const f = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { f.push(cur); cur = ""; } else cur += ch; } f.push(cur); return Object.fromEntries(cols.map((c, i) => [c, f[i]])); }); };
const NEURON_ROWS = parseRows(NEURON_CSV);

sec("1. the cells");
guarded("section 1", () => {
    const { cells, skipped } = F.neuronsOf(NEURON_ROWS);
    ok("the five types are chosen and no others (EPGt and PFL3 are not), 7 cells, in ascending NUMERIC id (3, 4, 5, 6, 9, 20, 100 -- not 100, 20, 3 ...), the row whose id is not a number skipped and counted", J(cells.map((c) => c.id)) === "[3,4,5,6,9,20,100]" && skipped === 1, J(cells.map((c) => c.id)));
    ok("each cell's class, transmitter and layer (the type's place in the list): 3 PEN_a Exc 1 | 4 PEN_b Exc 2 | 5 Delta7 Inh 3 | 6 PEG Exc 4 | 9, 20, 100 EPG Exc 0", J(cells.map((c) => [c.cls, c.nt, c.layer])) === '[["PEN_a","Exc",1],["PEN_b","Exc",2],["Delta7","Inh",3],["PEG","Exc",4],["EPG","Exc",0],["EPG","Exc",0],["EPG","Exc",0]]');
    ok("the side is the hemisphere the instance name ends in: 3 L, 4 R, 5 R (L1L9R8_R), 6 L, 9 none (a name with a comma and no side), 20 R, 100 L; the instance text is kept (the quoted comma too)", J(cells.map((c) => c.side)) === '["L","R","R","L",null,"R","L"]' && cells[4].instance === "EPG,odd" && cells[6].instance === "EPG(PB08)_L1");
    const sides = [["EPG(PB08)_L1", "L"], ["EPG_R", "R"], ["Delta7(PB15)_L1L9R8_R", "R"], ["x_L12", "L"], ["x_L1R2", null], ["EPG", null], ["EPG_LX", null], ["", null], [undefined, null]];
    const badSide = sides.filter(([t, want]) => F.sideOfInstance(t) !== want).map(([t, want]) => `${t} -> ${F.sideOfInstance(t)} (want ${want})`);
    ok("sideOfInstance reads the trailing _L / _R with or without a number (and nothing that merely contains one: a name that ends in neither is no side), and nothing else", badSide.length === 0, badSide.join(" ; "));
    const dup = throws(() => F.neuronsOf([...NEURON_ROWS, { bodyId: "100", type: "EPG", instance: "again" }]));
    ok("a body id listed twice is refused by name", /^flyCx\.neuronsOf: body id 100 is listed twice/.test(dup || ""), dup || "did not throw");
    ok("a type name with spaces around it is still its type; a row with no type is nothing", F.neuronsOf([{ bodyId: "1", type: " EPG ", instance: "a_L" }, { bodyId: "2", instance: "b" }]).cells.length === 1);
    ok("the constants: five types in order EPG, PEN_a, PEN_b, Delta7, PEG with their transmitters; the input classes EPG, PEN_a, PEN_b; the output classes EPG, PEG; the floor 3; all frozen; the sign note says where the signs come from", J(F.CELL_TYPES.map((t) => [t.type, t.cls, t.nt])) === '[["EPG","EPG","Exc"],["PEN_a(PEN1)","PEN_a","Exc"],["PEN_b(PEN2)","PEN_b","Exc"],["Delta7","Delta7","Inh"],["PEG","PEG","Exc"]]' && J(F.INPUT_CLASSES) === '["EPG","PEN_a","PEN_b"]' && J(F.OUTPUT_CLASSES) === '["EPG","PEG"]' && F.DEFAULTS.minWeight === 3 &&
        Object.isFrozen(F.CELL_TYPES) && Object.isFrozen(F.CELL_TYPES[0]) && Object.isFrozen(F.INPUT_CLASSES) && Object.isFrozen(F.OUTPUT_CLASSES) && Object.isFrozen(F.DEFAULTS) && /NOT read from the export/.test(F.SIGN_SOURCE) && /to be checked against the papers/.test(F.SIGN_SOURCE));
});

sec("2. the edges");
guarded("section 2", () => {
    const { cells } = F.neuronsOf(NEURON_ROWS), e3 = F.edgesAmong(ALL, cells), e4 = F.edgesAmong(ALL, cells, 4), e1 = F.edgesAmong(ALL, cells, 1);
    ok("at the floor of 3: six edges, sorted by (from, to): [0,6,12,+] [2,6,3,-] [3,4,3,+] [5,2,4,+] [5,6,8,+] [6,0,5,+] -- the sign is the SOURCE cell's transmitter, a pair AT the floor is kept, the weight is the synapse count", J(e3.edges) === "[[0,6,12,1],[2,6,3,-1],[3,4,3,1],[5,2,4,1],[5,6,8,1],[6,0,5,1]]", J(e3.edges));
    ok("the counts: 11 rows read, 8 pairs between chosen cells, 1 self-loop, 2 pairs below the floor holding 3 synapses (a pair with one end not chosen is none of these)", J(e3.stats) === J({ rows: 11, between: 8, selfLoops: 1, belowFloor: 2, belowFloorSynapses: 3 }), J(e3.stats));
    ok("at a floor of 4: [0,6,12] [5,2,4] [5,6,8] [6,0,5] stay, 4 pairs (3 + 3 + 2 + 1 = 9 synapses) fall below; at a floor of 1 all 8 pairs are edges and none is below", J(e4.edges.map((e) => e.slice(0, 3))) === "[[0,6,12],[5,2,4],[5,6,8],[6,0,5]]" && e4.stats.belowFloor === 4 && e4.stats.belowFloorSynapses === 9 && e1.edges.length === 8 && e1.stats.belowFloor === 0);
    ok("the inhibitory cell's edge carries sign -1 and the excitatory ones +1 (5 and 1)", e3.edges.filter((e) => e[3] > 0).length === 5 && e3.edges.filter((e) => e[3] < 0).length === 1 && e3.edges.find((e) => e[3] < 0)[0] === 2);
    const text = ALL.map((r) => ({ pre: String(r.pre), post: String(r.post), weight: String(r.weight) }));
    ok("rows given as text (a file's) work like numbers", J(F.edgesAmong(text, cells).edges) === J(e3.edges));
    ok("an iterator is enough (a generator is read once, never held)", J(F.edgesAmong((function* () { yield* ALL; })(), cells).edges) === J(e3.edges));
    const bad = (rows, w) => throws(() => F.edgesAmong(rows, cells, w));
    const rows = [["a pair listed twice", [...ALL, { pre: 100, post: 3, weight: 1 }], undefined, /the pair 100>3 is listed twice/], ["a weight of 0", [{ pre: 100, post: 3, weight: 0 }], undefined, /weight 0, which is not a whole number of 1 or more/], ["a fractional weight", [{ pre: 100, post: 3, weight: 2.5 }], undefined, /weight 2\.5/],
        ["a weight that is not a number", [{ pre: 100, post: 3, weight: "x" }], undefined, /weight x/], ["a floor of 0", ALL, 0, /minWeight must be a whole number of 1 or more, got 0/], ["a fractional floor", ALL, 1.5, /got 1\.5/]];
    for (const [what, r, w, re] of rows) { const e = bad(r, w); ok(`edgesAmong refuses ${what} by name`, e !== null && /^flyCx\.edgesAmong: /.test(e) && re.test(e), e || "did not throw"); }
    ok("a bad weight on a pair with an end that is not chosen is not looked at (the export's other 3.5 million rows are none of this file's business)", bad([{ pre: 100, post: 8, weight: "garbage" }]) === null);
    const io = F.ioOf(cells);
    ok("the input cells (E-PG and P-EN) are indices 0 1 4 5 6 and the output cells (E-PG and P-EG) are 3 4 5 6", J(io) === '{"inputs":[0,1,4,5,6],"outputs":[3,4,5,6]}', J(io));
});

sec("3. the circuit");
guarded("section 3", () => {
    const c = F.circuitOf(NEURON_ROWS, ALL), s = c.selection;
    ok("seven neurons, six edges, 35 synapses, 5 excitatory and 1 inhibitory, the rule named, the floor recorded", c.neurons.length === 7 && c.edges.length === 6 && s.synapses === 35 && s.excitatoryEdges === 5 && s.inhibitoryEdges === 1 && s.rule === "headingLoop" && s.minWeight === 3 && s.neurons === 7 && s.edges === 6);
    ok("by class {EPG 3, PEN_a 1, PEN_b 1, Delta7 1, PEG 1} (in the order the cells are met: PEN_a, PEN_b, Delta7, PEG, EPG) and by side {L 3, R 3, none 1}", J(s.byClass) === '{"PEN_a":1,"PEN_b":1,"Delta7":1,"PEG":1,"EPG":3}' && J(s.bySide) === '{"L":3,"R":3,"none":1}', J(s.byClass) + " " + J(s.bySide));
    ok("the edges by pair of classes, each with its synapses", J(s.byClassPair) === J({ "PEN_a>EPG": { edges: 1, synapses: 12 }, "Delta7>EPG": { edges: 1, synapses: 3 }, "PEG>EPG": { edges: 1, synapses: 3 }, "EPG>Delta7": { edges: 1, synapses: 4 }, "EPG>EPG": { edges: 1, synapses: 8 }, "EPG>PEN_a": { edges: 1, synapses: 5 } }), J(s.byClassPair));
    ok("the bookkeeping: 1 neuron row skipped, 11 connection rows read, 8 pairs between chosen cells, 1 self-loop, 2 pairs (3 synapses) below the floor", s.skippedNeuronRows === 1 && s.connectionRows === 11 && s.pairsBetweenChosenCells === 8 && s.selfLoops === 1 && s.belowFloorPairs === 2 && s.belowFloorSynapses === 3);
    ok("the circuit is in the shape brain/pilotSubCircuit.mjs takes: neurons with a layer, an nt and an id, edges [from, to, n, sign], and the io", c.neurons.every((n) => Number.isInteger(n.layer) && (n.nt === "Exc" || n.nt === "Inh") && Number.isInteger(n.id)) && c.edges.every((e) => e.length === 4) && J(c.io) === '{"inputs":[0,1,4,5,6],"outputs":[3,4,5,6]}');
    const r4 = F.circuitOf(NEURON_ROWS, ALL, { minWeight: 4 });
    ok("a floor of 4 makes a different circuit (4 edges) and says so", r4.edges.length === 4 && r4.selection.minWeight === 4 && r4.selection.belowFloorPairs === 4);
    const none = throws(() => F.circuitOf([{ bodyId: "1", type: "PFL3", instance: "x" }], ALL)), noDelta = throws(() => F.circuitOf(NEURON_ROWS.filter((r) => r.type !== "Delta7"), ALL));
    ok("a table with none of the five types is refused by name; one that lacks a type (no Delta7) is refused naming the type", /^flyCx\.circuitOf: no neuron of the five types/.test(none || "") && /no neuron of type Delta7 in the table/.test(noDelta || ""), (none || "") + " | " + (noDelta || ""));
});

sec("4. the command");
guarded("section 4", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flycx-")), nf = path.join(dir, "traced-neurons.csv"), cf = path.join(dir, "traced-total-connections.csv"), of = path.join(dir, "out", "cx.json");
    fs.writeFileSync(nf, NEURON_CSV); fs.writeFileSync(cf, CONN_CSV);
    const cmd = path.join(ENG, "tools", "flyCx.mjs"), run = (args) => spawnSync(process.execPath, [cmd, ...args], { encoding: "utf8", cwd: ENG });
    const dry = run(["--dir", dir, "--out", of]);
    ok("a dry run exits 0, prints the table sizes and the loop's, says it is a dry run and writes nothing", dry.status === 0 && /\[flyCx\] 10 traced neurons in the table; 11 connection rows read/.test(dry.stdout) && /heading loop: 7 neurons \{"PEN_a":1,"PEN_b":1,"Delta7":1,"PEG":1,"EPG":3\}, sides \{"L":3,"R":3,"none":1\}; 6 edges of at least 3 synapses \(5 excitatory, 1 inhibitory\), 35 synapses; 2 pairs \(3 synapses\) between these cells below the floor left out/.test(dry.stdout) &&
        /input cells 5 \(E-PG and P-EN\), output cells 4 \(E-PG and P-EG\)/.test(dry.stdout) && /dry run \(pass --write to write /.test(dry.stdout) && !fs.existsSync(of), dry.stdout.slice(0, 300) + dry.stderr);
    const w = run(["--neurons", nf, "--connections", cf, "--out", of, "--write"]);
    let js = null; try { js = JSON.parse(fs.readFileSync(of, "utf8")); } catch (e) { js = null; }
    ok("--write makes the folder and writes { meta, neurons, edges, io } with a final newline; --neurons and --connections work in place of --dir", w.status === 0 && js !== null && J(Object.keys(js)) === '["meta","neurons","edges","io"]' && fs.readFileSync(of, "utf8").endsWith("}\n") && /\[flyCx\] wrote /.test(w.stdout) && js.neurons.length === 7 && js.edges.length === 6 && J(js.io) === '{"inputs":[0,1,4,5,6],"outputs":[3,4,5,6]}', w.stdout.slice(-120) + w.stderr);
    const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    ok("the meta carries each input file's size and sha256, the dataset and the open server, the licence note, the citation, the ids note, the SIGN note (they are the literature's, not the data's), the floor and the selection",
        js && js.meta.files["traced-neurons.csv"].sha256 === sha(nf) && js.meta.files["traced-total-connections.csv"].sha256 === sha(cf) && js.meta.files["traced-neurons.csv"].bytes === fs.statSync(nf).size && /hemibrain:v1\.2/.test(js.meta.dataset) && /^https:\/\/storage\.googleapis\.com\/hemibrain\/v1\.2\//.test(js.meta.server) && /CC-BY 4\.0/.test(js.meta.license) && /Scheffer/.test(js.meta.citation) &&
        /body ids/.test(js.meta.ids) && /NOT read from the export/.test(js.meta.signs) && js.meta.build.minWeight === 3 && js.meta.selection.edges === 6 && js.meta.cellTypes.length === 5);
    const f4 = run(["--dir", dir, "--min-weight", "4", "--out", of, "--write"]), j4 = JSON.parse(fs.readFileSync(of, "utf8"));
    ok("--min-weight sets the floor: 4 gives 4 edges and records it", f4.status === 0 && /4 edges of at least 4 synapses/.test(f4.stdout) && j4.edges.length === 4 && j4.meta.build.minWeight === 4);
    const none = run([]), unk = run(["--dir", dir, "--bogus"]), w0 = run(["--dir", dir, "--min-weight", "0"]), w15 = run(["--dir", dir, "--min-weight", "1.5"]), wx = run(["--dir", dir, "--min-weight", "x"]), nov = run(["--dir"]), outw = run(["--dir", dir, "--out", "--write"]), only = run(["--neurons", nf]);
    ok("the command refuses by name, message on stderr, exit 2 and nothing on stdout: no files, an unknown option, a floor of 0 / 1.5 / x, an option with no value (last, or followed by another option), --neurons without --connections",
        none.status === 2 && /--dir <export folder> \(or --neurons and --connections\) is required/.test(none.stderr) && unk.status === 2 && /unknown option --bogus/.test(unk.stderr) && w0.status === 2 && /--min-weight must be a whole number of 1 or more, got 0/.test(w0.stderr) && w15.status === 2 && /got 1\.5/.test(w15.stderr) && wx.status === 2 && /got x/.test(wx.stderr) &&
        nov.status === 2 && /--dir needs a value/.test(nov.stderr) && outw.status === 2 && /--out needs a value/.test(outw.stderr) && only.status === 2 && /is required/.test(only.stderr) && [none, unk, w0, w15, wx, nov, outw, only].every((r) => r.stdout === ""), [none, unk, w0, nov, outw, only].map((r) => r.status + ":" + r.stderr.trim().slice(0, 50)).join(" | "));
    const badHead = path.join(dir, "badhead.csv"); fs.writeFileSync(badHead, "pre,post,w\n1,2,3\n");
    const short = path.join(dir, "short.csv"); fs.writeFileSync(short, "bodyId_pre,bodyId_post,weight\n1,2\n");
    const empty = path.join(dir, "empty.csv"); fs.writeFileSync(empty, "bodyId_pre,bodyId_post,weight");
    const nocol = path.join(dir, "nocol.csv"); fs.writeFileSync(nocol, "bodyId,kind\n1,EPG\n");
    const crlf = path.join(dir, "crlf.csv"); fs.writeFileSync(crlf, CONN_CSV.replace(/\n/g, "\r\n"));
    const dupe = path.join(dir, "dupe.csv"); fs.writeFileSync(dupe, CONN_CSV + "100,3,1\n");
    const rs = [run(["--neurons", nf, "--connections", badHead]), run(["--neurons", nf, "--connections", short]), run(["--neurons", nf, "--connections", empty]), run(["--neurons", nocol, "--connections", cf]), run(["--neurons", path.join(dir, "missing.csv"), "--connections", cf]), run(["--neurons", nf, "--connections", dupe])];
    ok("a connections file with the wrong header, a row of two fields, no rows, a neurons file without the columns, a missing file and a pair listed twice are each refused by name: exit 1, message on stderr, nothing on stdout, nothing written",
        rs.every((r) => r.status === 1 && r.stdout === "" && /^flyCx: /.test(r.stderr)) && /header is "pre,post,w", not bodyId_pre,bodyId_post,weight/.test(rs[0].stderr) && /line 2 of the connections file has 2 fields, not 3/.test(rs[1].stderr) && /has no rows/.test(rs[2].stderr) && /the neurons file has no column type, instance/.test(rs[3].stderr) && /ENOENT/.test(rs[4].stderr) && /listed twice/.test(rs[5].stderr), rs.map((r) => r.status + ":" + r.stderr.trim().slice(0, 60)).join(" | "));
    const cr = run(["--neurons", nf, "--connections", crlf, "--out", path.join(dir, "cr.json")]);
    ok("a file with Windows line ends is read the same (6 edges)", cr.status === 0 && /6 edges of at least 3 synapses/.test(cr.stdout), cr.stdout.slice(0, 200) + cr.stderr);
    const nolast = path.join(dir, "nolast.csv"); fs.writeFileSync(nolast, CONN_CSV.trimEnd());
    ok("a file with no line end after its last row is read whole too (11 rows)", /11 connection rows read/.test(run(["--neurons", nf, "--connections", nolast, "--out", path.join(dir, "nl.json")]).stdout));
    fs.rmSync(dir, { recursive: true, force: true });
});

sec("5. NOT CHECKED");
console.log("  NOT CHECKED  the signs: they are the literature's as remembered, assigned by type; the gate holds that the code assigns what it says, not that what it says is right");
console.log("  NOT CHECKED  that these five types are the whole heading loop of the fly (the real central complex has many more cell types that carry heading to the steering cells); the file says what it holds");

finished = true;
console.log(fails ? `\nflyCx-selfcheck: ${fails} FAILED` : "\nflyCx-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
