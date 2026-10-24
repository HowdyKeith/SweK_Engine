// WebGLEngine/tools/fishHmiLib.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/fishHmi.mjs; both halves are held by tools/fishHmi-selfcheck.mjs)
//
// THE PURE HALF OF tools/fishHmi.mjs: read the Fish1 release's HMI-analysis dataframe (HMI = the HINDBRAIN MOTION INTEGRATOR, the paper's case study of "recurrent excitation and contralateral inhibition", whose outputs are
// spinal projection neurons for TURNING and for FORWARD swimming), build the graph the package's own code builds, and cut from it the circuit that ends in the spinal projection neurons. No file, no clock, no Math.random.
//
// THE PACKAGE (gs://fish1-release/paper_data/HMI_analysis.zip, open): data/em_zfish1_dataframe.xlsx, 999 cells, one row each: `Cell ID` (the SOMA id of the CAVE `somas` table, not a root id), `name`, `classifier` (1, 2, 4, 5 or 6, 7, L-2, "spn_turning_*",
// "spn_forward_*", ...), `inputs` and `outputs` (Python-literal lists of tuples (partner cell id or '-', x, y, z, 'size'): one tuple per synapse the person tracing the cell marked), `reconstruction_status`, `final_neurotransmitter_ID` (Gad1B,
// VGluT2, unlabeled, unclear, n/a) and `network_level` (a list: input_one, network_seed, output_one, output_two, ...). The package's own src/zfish/graph/build.py makes the graph this file makes: for each row and each tuple of `inputs` / `outputs`
// with at least four fields, an edge partner->cell / cell->partner, counted once per tuple (a synapse that is listed in BOTH cells' rows is counted twice, as their code counts it); a partner of '-' is an unidentified contact and is not an edge.
//
// THE CIRCUIT (circuitOf), one rule with two knobs: the TARGETS are the spinal projection neurons (the classifier contains "spn", as the package's is_spn_cell reads it; the proximal ones, classifier ending _prox, are kept and labelled SPN_prox -- the package's own figure leaves them out); LAYER 1 is every cell with a neurotransmitter label (Gad1B = inhibitory, VGluT2 = excitatory) that has an identified
// edge onto a target; LAYER k+1 is every labelled cell with an identified edge onto layer k; stop at `depth` (default 2). The neurons are the targets and the layers; the edges are every identified pair among them whose PRESYNAPTIC cell has a sign
// (a pair from a cell without a label has no sign and is left out and COUNTED). Sign: +1 VGluT2, -1 Gad1B; weight: the tuple count. Neurons are in ascending soma id. Cells are annotated with their class, transmitter, SPN group (turning / forward /
// other) and, when soma positions are given, their side of the midline.
// Pure functions: see tools/fishHmi-selfcheck.mjs.
"use strict";
import zlib from "node:zlib";

export const REQUIRED_COLUMNS = Object.freeze(["Cell ID", "classifier", "inputs", "outputs", "final_neurotransmitter_ID", "network_level"]);
export const SOMA_VOXEL_NM = Object.freeze([8, 8, 30]);
export const DEFAULTS = Object.freeze({ depth: 2, midlineUm: 259.208 });

// ---- the xlsx file: a zip of XML, read with nothing but zlib -------------------------------------------------------------------------------------------------------------------------------------------
/** The CRC-32 of a buffer (the zip format's checksum) as an unsigned integer. */
export function crc32(buf) {
    let crc = 0xffffffff;
    for (const b of buf) { let c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
    return (crc ^ 0xffffffff) >>> 0;
}
/** The files of a zip archive as a Map name -> Buffer (stored and deflated entries, each checked against the directory's size and CRC-32; no zip64, no encryption: refused by name). */
export function unzip(buf) {
    let e = buf.length - 22;
    while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < 0) throw new Error("fishHmi.unzip: no end-of-central-directory record -- not a zip file");
    const count = buf.readUInt16LE(e + 10), cdOffset = buf.readUInt32LE(e + 16);
    if (count === 0xffff || cdOffset === 0xffffffff) throw new Error("fishHmi.unzip: a zip64 archive -- this reader is for small files");
    const files = new Map();
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`fishHmi.unzip: entry ${i + 1} of ${count} has no central-directory signature`);
        const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
        const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42), name = buf.toString("utf8", p + 46, p + 46 + nameLen);
        p += 46 + nameLen + extraLen + commentLen;
        if (flags & 1) throw new Error(`fishHmi.unzip: ${name} is encrypted`);
        if (name.endsWith("/")) continue;
        if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`fishHmi.unzip: ${name} has no local header where the directory says`);
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), raw = buf.subarray(start, start + csize);
        let data;
        if (method === 0) data = Buffer.from(raw);
        else if (method === 8) data = zlib.inflateRawSync(raw);
        else throw new Error(`fishHmi.unzip: ${name} uses compression method ${method}`);
        if (data.length !== usize) throw new Error(`fishHmi.unzip: ${name} is ${data.length} bytes after unpacking, the directory says ${usize}`);
        if (crc32(data) !== crc) throw new Error(`fishHmi.unzip: ${name} fails its CRC-32 checksum (a damaged download?)`);
        files.set(name, data);
    }
    return files;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, g) => (g[0] === "#" ? String.fromCodePoint(g[1] === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : ENTITIES[g]));
const textOf = (xml) => { const bare = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ""), re = /<t(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/t>)/g; let out = "", m; while ((m = re.exec(bare))) out += m[1] === undefined ? "" : unescapeXml(m[1]); return out; };
const colIndex = (ref) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** The first sheet of an xlsx file as { header: [names], rows: [{ name: text }] } (numbers come back as their text; an empty cell is left out of its row; a row with no value in a named column is not a record and is left out). */
export function readXlsx(buf) {
    const files = unzip(buf), sheet = files.get("xl/worksheets/sheet1.xml");
    if (!sheet) throw new Error("fishHmi.readXlsx: no xl/worksheets/sheet1.xml in the file");
    const shared = files.has("xl/sharedStrings.xml") ? [...files.get("xl/sharedStrings.xml").toString("utf8").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((m) => (m[1] === undefined ? "" : textOf(m[1]))) : [];
    const grid = [];
    for (const rm of sheet.toString("utf8").matchAll(/<row(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const cells = [];
        for (const cm of (rm[1] || "").matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const attrs = cm[1], body = cm[2] || "", ref = /\br="([A-Z]+\d+)"/.exec(attrs), type = /\bt="([^"]*)"/.exec(attrs);
            if (!ref) continue;
            let value;
            if (type && type[1] === "inlineStr") value = textOf(body);
            else { const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body); if (!v) continue; value = type && type[1] === "s" ? shared[Number(v[1])] : unescapeXml(v[1]); }
            if (value === undefined) throw new Error(`fishHmi.readXlsx: cell ${ref[1]} points past the shared strings`);
            cells[colIndex(ref[1])] = value;
        }
        grid.push(cells);
    }
    if (!grid.length) throw new Error("fishHmi.readXlsx: the sheet has no rows");
    const header = Array.from(grid[0], (h) => (h === undefined ? "" : h));
    return { header, rows: grid.slice(1).map((cells) => { const o = {}; header.forEach((h, i) => { if (h !== "" && cells[i] !== undefined) o[h] = cells[i]; }); return o; }).filter((o) => Object.keys(o).length) };
}

// ---- the package's labels (src/zfish/labels.py) -------------------------------------------------------------------------------------------------------------------------------------------------------
/** The compact class label the package uses: I (1), II (2 and 'Class 2' and 'contralateral axon'), L-2, F (7), R (4), P (5, 6, '5 or 6'), SPN_turning / SPN_forward / SPN_other / SPN_prox, '?' for anything else ('1 or 2', 'other', ...). */
export function classLabel(value) {
    const text = String(value).trim().toLowerCase();
    if (text.includes("spn")) { if (text.endsWith("_prox")) return "SPN_prox"; if (text.includes("turn")) return "SPN_turning"; if (text.includes("forw")) return "SPN_forward"; return "SPN_other"; }
    const v = String(value).trim();
    if (v === "L-2") return "L-2";
    if (v === "1" || v === "1.0") return "I";
    if (v === "2" || v === "2.0" || v === "Class 2" || v === "contralateral axon") return "II";
    if (v === "7" || v === "7.0") return "F";
    if (v === "4" || v === "4.0") return "R";
    if (["5", "5.0", "6", "6.0", "5 or 6"].includes(v)) return "P";
    return "?";
}
/** Exc (VGluT2 and its spellings), Inh (Gad1B and its spellings), Unlabeled, or Unknown (everything else: 'unclear', 'n/a', ...). */
export function ntLabel(value) {
    const t = String(value).trim().toLowerCase();
    if (["vglut2", "vglut", "glut", "glutamatergic", "excitatory", "exc"].includes(t)) return "Exc";
    if (["gad1b", "gad", "gaba", "gabaergic", "inhibitory", "inh"].includes(t)) return "Inh";
    if (t === "unlabeled" || t === "unlabelled") return "Unlabeled";
    return "Unknown";
}
/** The SPN group of a raw classifier: "turning", "forward", "other" for a spinal projection neuron (the package's is_spn_cell: the classifier contains 'spn', any case), null for any other cell. */
export function spnGroup(raw) {
    const t = String(raw).trim().toLowerCase();
    if (!t.includes("spn")) return null;
    return t.includes("turn") ? "turning" : t.includes("forw") ? "forward" : "other";
}

// ---- the Python-literal lists of the `inputs` and `outputs` columns -----------------------------------------------------------------------------------------------------------------------------------
/** A Python literal made of lists, tuples, quoted strings, numbers, None / True / False: returns the JS value (tuples and lists both as arrays) or throws. Not eval: a name that is not one of those is refused. */
export function parsePyLiteral(text) {
    const s = String(text);
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const fail = (why) => { throw new Error(`fishHmi.parsePyLiteral: ${why} at character ${i}`); };
    function value() {
        ws();
        const c = s[i];
        if (c === "[" || c === "(") {
            const close = c === "[" ? "]" : ")", out = []; i++; ws();
            while (s[i] !== close) { if (i >= s.length) fail(`unterminated ${c}`); out.push(value()); ws(); if (s[i] === ",") { i++; ws(); } else if (s[i] !== close) fail("expected , or " + close); }
            i++; return out;
        }
        if (c === "'" || c === '"') {
            let j = i + 1, out = "";
            while (j < s.length && s[j] !== c) { if (s[j] === "\\" && j + 1 < s.length) { out += s[j + 1]; j += 2; } else out += s[j++]; }
            if (j >= s.length) fail("unterminated string");
            i = j + 1; return out;
        }
        const m = /^[-+]?(?:\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+)|^(?:None|True|False|nan|inf)\b/.exec(s.slice(i));
        if (!m) fail(`unexpected ${JSON.stringify(s.slice(i, i + 12))}`);
        i += m[0].length;
        return m[0] === "None" ? null : m[0] === "True" ? true : m[0] === "False" ? false : m[0] === "nan" ? NaN : m[0] === "inf" ? Infinity : Number(m[0]);
    }
    const v = value(); ws();
    if (i < s.length) fail("text after the literal");
    return v;
}
const EMPTY = new Set(["", "n/a", "na", "nan", "none", "[]", "[ ]", "{}", "()"]);

// ---- the graph the package's code builds ----------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The cells of the dataframe rows: { id, name, rawClass, cls, nt (Exc / Inh / Unlabeled / Unknown), rawNt, levels, status, spn }. A row without a usable Cell ID is dropped and counted. */
export function cellsOf(rows) {
    const cells = new Map(); let dropped = 0;
    for (const r of rows) {
        const idText = String(r["Cell ID"] ?? "").trim();
        if (!/^\d+$/.test(idText)) { dropped++; continue; }
        let levels = [];
        try { const v = r.network_level === undefined || EMPTY.has(String(r.network_level).trim().toLowerCase()) ? [] : parsePyLiteral(r.network_level); levels = Array.isArray(v) ? v.map(String) : []; } catch (e) { levels = []; }
        cells.set(idText, { id: idText, name: r.name ?? "", rawClass: String(r.classifier ?? ""), cls: classLabel(r.classifier ?? ""), rawNt: String(r.final_neurotransmitter_ID ?? ""), nt: ntLabel(r.final_neurotransmitter_ID ?? ""), levels, status: r.reconstruction_status ?? "", spn: spnGroup(r.classifier ?? "") });
    }
    return { cells, dropped };
}
/** The edges as a Map "pre>post" -> { pre, post, n }, counted once per tuple of each row's `inputs` and `outputs` exactly as src/zfish/graph/build.py does (a partner of '-' or one not in the dataframe is not an edge; a tuple with fewer than four fields is malformed), with the counts the package keeps. Self-loops are counted and left out. */
export function edgesOf(rows, cells) {
    const edges = new Map(), stats = { rows: rows.length, parseFailRows: 0, tuples: 0, identified: 0, unidentified: 0, malformed: 0, outsideDataframe: 0, selfLoops: 0 };
    for (const r of rows) {
        const id = String(r["Cell ID"] ?? "").trim();
        if (!cells.has(id)) continue;
        for (const [col, dir] of [["inputs", "in"], ["outputs", "out"]]) {
            const raw = r[col];
            if (raw === undefined || EMPTY.has(String(raw).trim().toLowerCase())) continue;
            let list;
            try { list = parsePyLiteral(raw); } catch (e) { stats.parseFailRows++; continue; }
            if (!Array.isArray(list)) continue;
            for (const t of list) {
                stats.tuples++;
                if (!Array.isArray(t) || t.length < 4) { stats.malformed++; continue; }
                const p = t[0];
                if (p === "-" || p === null || (typeof p === "number" && Number.isNaN(p))) { stats.unidentified++; continue; }
                const partner = typeof p === "number" && Number.isInteger(p) ? String(p) : typeof p === "string" && /^\d+$/.test(p.trim()) ? p.trim() : null;
                if (partner === null) { stats.malformed++; continue; }
                if (!cells.has(partner)) { stats.outsideDataframe++; continue; }
                const pre = dir === "in" ? partner : id, post = dir === "in" ? id : partner;
                if (pre === post) { stats.selfLoops++; continue; }
                stats.identified++;
                const key = pre + ">" + post, e = edges.get(key);
                if (e) e.n++; else edges.set(key, { pre, post, n: 1 });
            }
        }
    }
    return { edges, stats };
}

// ---- the circuit that ends in the spinal projection neurons ------------------------------------------------------------------------------------------------------------------------------------------
const signOf = (nt) => (nt === "Exc" ? 1 : nt === "Inh" ? -1 : 0);
/**
 * The circuit: targets = SPN cells; layer 1 = signed cells with an identified edge onto a target; layer k+1 = signed cells with an identified edge onto layer k, to `depth`. Edges = identified pairs among the chosen neurons whose presynaptic cell
 * has a sign. `somas` (optional Map id -> [x, y, z] in soma voxels of 8 x 8 x 30 nm) gives each neuron a side: 'L' / 'R' by its position on the left-right (y) axis against `midlineUm`.
 * Returns { neurons: [{ id, cls, nt, group, layer, side }], edges: [[from index, to index, n, sign]], selection } with the neurons in ascending soma id.
 */
export function circuitOf(cells, edges, { depth = DEFAULTS.depth, somas = null, midlineUm = DEFAULTS.midlineUm } = {}) {
    if (!(Number.isInteger(depth) && depth >= 1)) throw new Error(`fishHmi.circuitOf: depth must be a whole number of 1 or more, got ${depth}`);
    const targets = [...cells.values()].filter((c) => c.spn !== null).map((c) => c.id);
    if (!targets.length) throw new Error("fishHmi.circuitOf: no spinal projection neuron (a classifier containing 'spn') in the dataframe");
    const layer = new Map(targets.map((t) => [t, 0])), signedPre = new Map();
    for (const e of edges.values()) { if (signOf(cells.get(e.pre).nt) !== 0 && e.pre !== e.post) { if (!signedPre.has(e.post)) signedPre.set(e.post, []); signedPre.get(e.post).push(e.pre); } }
    let frontier = targets;
    for (let d = 1; d <= depth; d++) {
        const next = [];
        for (const t of frontier) for (const p of signedPre.get(t) || []) if (!layer.has(p)) { layer.set(p, d); next.push(p); }
        frontier = next;
    }
    const ids = [...layer.keys()].sort((a, b) => (a.length - b.length) || (a < b ? -1 : 1)), index = new Map(ids.map((id, k) => [id, k]));
    const out = [], skipped = { noSign: 0, noSignSynapses: 0 };
    for (const e of edges.values()) {
        if (!index.has(e.post)) continue;
        const sign = signOf(cells.get(e.pre).nt);
        if (sign === 0) { skipped.noSign++; skipped.noSignSynapses += e.n; continue; }   // an edge onto a chosen neuron from a cell with no label (in the set or not): no sign, so not an edge here, and counted
        if (!index.has(e.pre)) continue;   // a signed cell beyond the depth
        out.push([index.get(e.pre), index.get(e.post), e.n, sign]);
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const sideOf = (id) => { const p = somas && somas.get(id); if (!p) return null; const y = (p[1] * SOMA_VOXEL_NM[1]) / 1000; return y === midlineUm ? null : y > midlineUm ? "R" : "L"; };
    const neurons = ids.map((id) => { const c = cells.get(id); return { id: Number(id), cls: c.cls, nt: c.nt, group: c.spn, layer: layer.get(id), side: sideOf(id) }; });
    const by = (f) => neurons.reduce((m, n) => { const k = f(n); m[k] = (m[k] || 0) + 1; return m; }, {});
    return {
        neurons, edges: out,
        selection: { rule: "spnBackClosure", depth, targets: targets.length, neurons: neurons.length, edges: out.length, synapses: out.reduce((s, e) => s + e[2], 0), excitatoryEdges: out.filter((e) => e[3] > 0).length, inhibitoryEdges: out.filter((e) => e[3] < 0).length,
            byLayer: by((n) => n.layer), byClass: by((n) => n.cls), byGroup: by((n) => n.group || "none"), bySide: by((n) => n.side || "unknown"), leftOutPairsWithoutASign: skipped.noSign, leftOutSynapsesWithoutASign: skipped.noSignSynapses },
    };
}
