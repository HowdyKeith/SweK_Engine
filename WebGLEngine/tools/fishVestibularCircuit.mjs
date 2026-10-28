// WebGLEngine/tools/fishVestibularCircuit.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/fishVestibularCircuitCmd.mjs; the gate is tools/fishVestibularCircuit-selfcheck.mjs)
//
// THE EXTRACTION OF RUNG 4b'S CIRCUIT, FROM THE VENDORED TABLES, IN THE SAME LANGUAGE AS THE GATES. tools/fishVestibularFacts.py (the helper branch's throwaway, ungated) printed the counts the rung 4b pre-registration quotes
// (brain/FISH_VESTIBULAR_HELPER_WIP.md); that note said "a tool that re-derives the counts from the tables, and a gate that holds the files to their hashes, are the next step". This is the tool and the gate holds it. It reads ONLY
// vendor/zebrafish-vestibular/ (Liu et al. 2022, Nat Commun 13:5060, CC BY 4.0): an .xlsx is a zip of XML, read here with node's own zlib, in memory, and never extracted.
// THE RULES THIS FILE FIXES ARE THE REGISTRATION'S, COPIED AND NOT RE-DECIDED (each one a decision of that note, none tuned):
//   - an afferent is MYELINATED iff its name is Ear_AnteriorMacula_R_01 .. _16 (phasic); the others are unmyelinated (tonic);
//   - a central neuron's class is its name's prefix (Mauthner_R, vestibular_commissural_R, tangential_nucleus_R, SuperiorVN_R, VS_R);
//   - the ESCAPE pathway (E) is Mauthner + vestibular commissural; the BALANCE pathway (B) is tangential + superior vestibular nucleus + vestibulospinal (the paper's own division);
//   - an edge is an (afferent, central neuron) pair with at least one synapse; its weight is the synapse count; no floor above 1;
//   - tuning angles are the workbooks' own, in radians: 0 = maximally sensitive to rightward (ipsilateral) tilt, pi/2 = maximally sensitive to rostral tilt.
// This file builds NO pilot and trains nothing. Pure apart from the files it reads. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR = path.resolve(HERE, "..", "vendor", "zebrafish-vestibular");
export const FILES = Object.freeze({ hairToAfferent: "41467_2022_32824_MOESM4_ESM.xlsx", afferentToCentral: "41467_2022_32824_MOESM5_ESM.xlsx", sourceZip: "41467_2022_32824_MOESM11_ESM.zip", sourceXlsx: "41467_2022_32824_MOESM11_SourceData.xlsx" });
export const CLASSES = Object.freeze([["VS_R", "VS"], ["SuperiorVN_R", "SVN"], ["tangential_nucleus_R", "tangential"], ["vestibular_commissural_R", "commissural"], ["Mauthner_R", "Mauthner"]]);
export const CLASS_ORDER = Object.freeze(["Mauthner", "commissural", "tangential", "SVN", "VS"]);
export const ESCAPE_CLASSES = Object.freeze(["Mauthner", "commissural"]), BALANCE_CLASSES = Object.freeze(["tangential", "SVN", "VS"]);
export const FEATURES = 14;   // the fish chat's count (brain/pilotSubPolicy.mjs): the one number here that is not in the tables
export const MYELINATED_RE = /^Ear_AnteriorMacula_R_(0[1-9]|1[0-6])$/;

// ---- reading an .xlsx --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The members of a zip as { name: Buffer } (stored or deflated), read from the central directory. */
export function readZip(buf) {
    let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("fishVestibularCircuit.readZip: not a zip (no end-of-central-directory record)");
    const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const out = {};
    for (let k = 0; k < n; k++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("fishVestibularCircuit.readZip: a bad central directory entry");
        const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8"), lh = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.slice(lh, lh + csize);
        out[name] = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : (() => { throw new Error(`fishVestibularCircuit.readZip: ${name} uses compression method ${method}`); })();
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}
const unescapeXml = (s) => s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
/** { sheet name: [ { column letter: text } per row ] } from the bytes of an .xlsx. Cells are the stored values; no formula is evaluated. */
export function readXlsx(buf) {
    const z = readZip(buf), text = (n) => z[n].toString("utf8"), shared = [];
    if (z["xl/sharedStrings.xml"]) for (const m of text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
    const names = [...text("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]), out = {};
    names.forEach((name, i) => {
        const rows = [];
        for (const rm of text(`xl/worksheets/sheet${i + 1}.xml`).matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
            const cells = {};
            for (const m of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
                const body = m[3] || "", v = /<v>([\s\S]*?)<\/v>/.exec(body) || /<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
                if (!v) continue;
                cells[m[1]] = (m[2].includes('t="s"') ? shared[Number(v[1])] : unescapeXml(v[1])).trim();   // a shared string was unescaped once when the table was read: unescaping it again would turn a literal "&lt;" into "<" (the Python tool this was ported from does)
            }
            rows.push(cells);
        }
        out[unescapeXml(name)] = rows;
    });
    return out;
}
const num = (s) => (/^-?\d+$/.test(s || "") ? parseInt(s, 10) : null);
export const classOf = (name) => { for (const [prefix, c] of CLASSES) if (name.startsWith(prefix)) return c; return null; };
export const pathwayOf = (cls) => (ESCAPE_CLASSES.includes(cls) ? "E" : "B");
/** THE TWO WORKBOOKS SPELL THE COMMISSURAL CELLS DIFFERENTLY: Supplementary Data 2 says `vestibular_commissural_R_01`, the Source Data says `vestibular_commiss_R_01` (found while porting: the Python tool compared COUNTS, 47 and 47, and never matched a name). The Source Data's spelling is mapped onto the table's; no other name differs. */
export const sourceName = (n) => n.replace(/^vestibular_commiss_R_/, "vestibular_commissural_R_");
export const isMyelinated = (name) => MYELINATED_RE.test(name);

// ---- the extraction ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
/** Everything the registration quotes, derived from the tables in `dir`. */
export function extract(dir = DIR) {
    const read = (f) => fs.readFileSync(path.join(dir, f)), files = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, { file: f, bytes: read(f).length, sha256: sha256(read(f)) }]));
    // layer 1: hair cells -> afferents
    const d1 = readXlsx(read(FILES.hairToAfferent)).Matrix, h1 = d1[0];
    const aCols = Object.keys(h1).filter((k) => /^\s*ear_anteriormacula/i.test(h1[k])), hc = d1.slice(1).filter((r) => /^AM_haircell_R_\d+$/.test(r.A || ""));
    const layer1 = { hairCells: hc.length, hairCellsWithSynapse: hc.filter((r) => aCols.some((k) => (num(r[k]) || 0) > 0)).length, afferents: aCols.length, synapses: hc.reduce((s, r) => s + aCols.reduce((t, k) => t + (num(r[k]) || 0), 0), 0), pairs: hc.reduce((s, r) => s + aCols.filter((k) => (num(r[k]) || 0) > 0).length, 0) };
    // layer 2: afferents -> central neurons
    const d2 = readXlsx(read(FILES.afferentToCentral)).Sheet1, h2 = d2[0];
    const tCols = Object.keys(h2).filter((k) => classOf(h2[k])), tunCol = Object.keys(h2).find((k) => h2[k] === "Computed afferent tuning");
    if (!tunCol) throw new Error("fishVestibularCircuit.extract: no 'Computed afferent tuning' column");
    const rows = d2.slice(1).filter((r) => /^ear_anteriormacula/i.test(r.A || ""));
    const centrals = tCols.map((k) => ({ col: k, name: h2[k], cls: classOf(h2[k]), pathway: pathwayOf(classOf(h2[k])), theta: null }));
    const edges = [], reach = new Map();
    const afferents = rows.map((r) => {
        const a = { name: r.A, myelinated: isMyelinated(r.A), theta: r[tunCol] ? parseFloat(r[tunCol]) : null, reachE: false, reachB: false };
        for (const c of centrals) { const w = num(r[c.col]) || 0; if (w > 0) { edges.push({ a: r.A, c: c.name, w }); if (c.pathway === "E") a.reachE = true; else a.reachB = true; } }
        return a;
    });
    // the central neurons' own tuning, from the Source Data (the xlsx the vendored zip holds, read from the vendored copy of that member)
    const sd = readXlsx(read(FILES.sourceXlsx))["Fig 3d, 4a,b,c"], ct = new Map();
    for (const r of sd) if (r.B && /^(Mauthner|vestibular_commiss|SuperiorVN|tangential|VS)/.test(r.B) && /^-?[\d.]+(E-?\d+)?$/.test(r.C || "")) ct.set(sourceName(r.B), parseFloat(r.C));
    for (const c of centrals) c.theta = ct.has(c.name) ? ct.get(c.name) : null;
    return { files, layer1, afferents, centrals, edges, centralTuningCells: ct.size };
}

// ---- derived facts ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const sum = (v) => v.reduce((s, x) => s + x, 0);
/** The facts the registration quotes, computed from an extraction. */
export function factsOf(x) {
    const cls = new Map(x.centrals.map((c) => [c.name, c.cls])), pw = new Map(x.centrals.map((c) => [c.name, c.pathway])), aff = new Map(x.afferents.map((a) => [a.name, a]));
    const byClass = Object.fromEntries(CLASS_ORDER.map((c) => [c, { cells: x.centrals.filter((q) => q.cls === c).length, synapses: 0, pairs: 0, myelinated: 0, unmyelinated: 0 }]));
    for (const e of x.edges) { const b = byClass[cls.get(e.c)]; b.synapses += e.w; b.pairs++; if (aff.get(e.a).myelinated) b.myelinated += e.w; else b.unmyelinated += e.w; }
    const side = (p) => { const es = x.edges.filter((e) => pw.get(e.c) === p), m = sum(es.filter((e) => aff.get(e.a).myelinated).map((e) => e.w)); return { cells: x.centrals.filter((c) => c.pathway === p).length, edges: es.length, synapses: sum(es.map((e) => e.w)), myelinatedShare: m / sum(es.map((e) => e.w)) }; };
    const live = x.afferents.filter((a) => a.reachE || a.reachB), withAngle = live.filter((a) => a.theta !== null);
    const floors = Object.fromEntries([1, 2, 3].map((f) => { const es = x.edges.filter((e) => e.w >= f); return [f, { edges: es.length, synapses: sum(es.map((e) => e.w)), afferents: new Set(es.map((e) => e.a)).size, centrals: new Set(es.map((e) => e.c)).size }]; }));
    return {
        afferents: x.afferents.length, myelinated: x.afferents.filter((a) => a.myelinated).length, centrals: x.centrals.length, edges: x.edges.length, synapses: sum(x.edges.map((e) => e.w)), byClass, E: side("E"), B: side("B"),
        live: live.length, eOnly: live.filter((a) => a.reachE && !a.reachB).length, bOnly: live.filter((a) => a.reachB && !a.reachE).length, both: live.filter((a) => a.reachE && a.reachB).length, liveMyelinated: live.filter((a) => a.myelinated).length, unreached: x.afferents.length - live.length,
        tuning: { known: withAngle.length, rostral: withAngle.filter((a) => Math.sin(a.theta) > 0).length, caudal: withAngle.filter((a) => Math.sin(a.theta) < 0).length, ipsilateral: withAngle.filter((a) => Math.cos(a.theta) > 0).length, contralateral: withAngle.filter((a) => Math.cos(a.theta) < 0).length },
        floors,
    };
}
/** One arm of rung 4b ("whole" = all 47 cells, "B" the balance pathway, "E" the escape pathway): its inputs (the afferents with at least one synapse onto an arm cell, phasic = myelinated), edges, cells and the registration's own trainable counts (T tuning-derived input, D dense input). */
export function armOf(x, arm) {
    const keep = (c) => arm === "whole" || c.pathway === arm, names = new Set(x.centrals.filter(keep).map((c) => c.name)), es = x.edges.filter((e) => names.has(e.c));
    const inputs = [...new Set(es.map((e) => e.a))].sort(), cells = new Set(es.map((e) => e.c)).size, aff = new Map(x.afferents.map((a) => [a.name, a]));
    const base = es.length + inputs.length + cells + 4 * cells + 4;
    return { arm, inputs: inputs.length, phasic: inputs.filter((a) => aff.get(a).myelinated).length, tonic: inputs.filter((a) => !aff.get(a).myelinated).length, cells, edges: es.length, synapses: sum(es.map((e) => e.w)), trainableT: base, trainableD: FEATURES * inputs.length + base };
}
/** The facts as lines (the Python tool's report, from the same rules). */
export function factLines(x) {
    const f = factsOf(x), L = [], pc = (v) => (100 * v).toFixed(1);
    L.push(`layer 1 (hair cell -> afferent): ${x.layer1.hairCells} hair cells (${x.layer1.hairCellsWithSynapse} with a synapse), ${x.layer1.afferents} afferents, ${x.layer1.synapses} synapses, ${x.layer1.pairs} pairs`);
    L.push(`layer 2 (afferent -> central): ${f.afferents} afferents (${f.myelinated} myelinated), ${f.centrals} central neurons ${JSON.stringify(Object.fromEntries(CLASS_ORDER.map((c) => [c, f.byClass[c].cells])))}; ${f.edges} edges, ${f.synapses} synapses`);
    for (const c of CLASS_ORDER) { const b = f.byClass[c]; L.push(`   ${c.padEnd(12)} ${b.synapses} synapses over ${b.pairs} pairs; myelinated ${b.myelinated}, unmyelinated ${b.unmyelinated} (myelinated share ${pc(b.myelinated / b.synapses)}%)`); }
    L.push(`pathway E (escape): ${f.E.cells} cells, ${f.E.edges} edges, ${f.E.synapses} synapses, myelinated share ${pc(f.E.myelinatedShare)}%; pathway B (balance): ${f.B.cells} cells, ${f.B.edges} edges, ${f.B.synapses} synapses, myelinated share ${pc(f.B.myelinatedShare)}%`);
    L.push(`afferents reaching a central neuron: ${f.live} (E only ${f.eOnly}, B only ${f.bOnly}, both ${f.both}); myelinated ${f.liveMyelinated}, unmyelinated ${f.live - f.liveMyelinated}; unreached ${f.unreached}`);
    L.push(`tuning known for ${f.tuning.known} of ${f.live}: rostral-leaning ${f.tuning.rostral}, caudal-leaning ${f.tuning.caudal}; ipsilateral-leaning ${f.tuning.ipsilateral}, contralateral ${f.tuning.contralateral}`);
    for (const k of [1, 2, 3]) L.push(`   floor >= ${k}: ${f.floors[k].edges} edges, ${f.floors[k].synapses} synapses, ${f.floors[k].afferents} afferents, ${f.floors[k].centrals} central neurons`);
    for (const a of ["whole", "B", "E"]) { const r = armOf(x, a); L.push(`   arm ${a.padEnd(5)} ${r.inputs} inputs (${r.phasic} phasic, ${r.tonic} tonic), ${r.cells} central cells, ${r.edges} edges, ${r.synapses} synapses; trainable T ${r.trainableT}, D ${r.trainableD}`); }
    L.push(`central neurons with a tuning angle in the Source Data: ${x.centrals.filter((c) => c.theta !== null).length} of ${x.centrals.length}`);
    return L;
}
