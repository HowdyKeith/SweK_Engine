// WebGLEngine/tools/fishInputSideLib.mjs -- UNNUMBERED (the version is chosen at ship time; gated by tools/fishInputSide-selfcheck.mjs; the command is tools/fishInputSide.mjs)
//
// THE INPUT SIDE OF A CELL, FROM THE SYNAPSES THAT ARRIVE ON IT: where on the cell they sit, which partner they come from, and (when the export carries the label table) whether they excite or inhibit.
// Written to take the throwaway numbers of the first export of the Mauthner candidates (brain/SUBMARINE_WIP.md, "The input side of the Mauthner candidates") out of the "unchecked" column: the same analysis, as a tool that is gated.
//
//   OFFSETS    a synapse's postsynaptic position minus the cell's soma, in micrometres, on three axes: front-back, LATERAL (positive AWAY from the midline, so a cell on each side of the fish is read the same way) and z.
//              The soma table is in 8 x 8 x 30 nm voxels and the synapse table in 16 x 16 x 30 (brain/SUBMARINE_WIP.md: "the units line up" only after the voxel size of each is applied).
//   FAR        a synapse more than `trimUm` (100) micrometres from the soma is NOT part of the fit and is called `far`: the first real export had 17 of 4,163 on one candidate at 250 to 280 micrometres while every other synapse of both cells
//              was within 89, and a k-means that is asked for three clusters spends one of them on such a handful (it did: the "z arm" of that cell came out as 17 synapses 256 micrometres away). Far synapses are counted, kept in the partner tables, and are
//              the first thing to look at in the viewer (a piece of another cell merged into this one would put its synapses there).
//   DOMAINS    k = 3 clusters of the offsets that are not far (deterministic k-means: k-means++ from a seeded generator, several restarts, the lowest summed squared distance wins), NAMED by the same rule for every cell: `lateral` is the cluster with the largest mean lateral
//              offset, `zArm` the one with the largest mean z among the other two, `perisomatic` the rest. The names are about where a cluster sits, not what it is: whether the lateral arm is a lateral dendrite is the viewer's word.
//   CHANNELS   a partner is a channel when it puts its synapses in one domain: purity = the share of its synapses in its commonest domain.
//   SIGNS      tag 1 = inhibitory, 2 = excitatory (the stack's label table); anything else, or no tag, is untagged.
// Pure: no file, no clock, no Math.random.
"use strict";

export const SOMA_VOXEL_NM = Object.freeze([8, 8, 30]);
export const SYNAPSE_VOXEL_NM = Object.freeze([16, 16, 30]);
export const DOMAINS = Object.freeze(["perisomatic", "lateral", "zArm"]);
export const FAR = "far", ALL = Object.freeze([...DOMAINS, FAR]);
export const TRIM_UM = 100;
export const STRONG_PARTNER = 10;   // synapses from one partner on one cell

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

/** A CSV file as an array of row objects keyed by the header: quoted fields, doubled quotes inside them, CRLF or LF line ends and a newline inside a quoted field are all read (the export's labels.csv quotes JSON). A short row gets "" for what it lacks. */
export function parseTable(text) {
    const rows = [];
    let row = [], cur = "", q = false;
    const t = String(text);
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === ",") { row.push(cur); cur = ""; }
        else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
        else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    if (!rows.length) return [];
    const [head, ...body] = rows;
    return body.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] === undefined ? "" : r[k]])));
}

/** A seeded generator in [0, 1) (mulberry32). */
export function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The soma of `rootId` in micrometres, from the rows of labels.csv ({ root_id, table, row_json }): the `somas` table's row, whose pt_position is in soma voxels. Throws when the cell has no soma row. */
export function somaOf(labelRows, rootId, voxelNm = SOMA_VOXEL_NM) {
    for (const r of labelRows) {
        if (String(r.root_id) !== String(rootId) || r.table !== "somas") continue;
        const j = JSON.parse(r.row_json), p = ["x", "y", "z"].map((a) => num(j["pt_position_" + a]));
        if (p.every(Number.isFinite)) return p.map((v, k) => (v * voxelNm[k]) / 1000);
    }
    throw new Error(`fishInputSide.somaOf: root id ${rootId} has no soma row with a position in labels.csv`);
}

/** The synapses that arrive on `rootId`, from the rows of synapses_in.csv: { id, pre, post, p: [x, y, z] in micrometres } at the postsynaptic position. A row without a position is counted in `dropped` and left out. */
export function inputsOf(synapseRows, rootId, voxelNm = SYNAPSE_VOXEL_NM) {
    const out = [];
    let dropped = 0;
    for (const r of synapseRows) {
        if (String(r.post_pt_root_id) !== String(rootId)) continue;
        const p = ["x", "y", "z"].map((a, k) => (num(r["post_pt_position_" + a]) * voxelNm[k]) / 1000);
        if (!p.every(Number.isFinite)) { dropped++; continue; }
        out.push({ id: String(r.id), pre: String(r.pre_pt_root_id), post: String(rootId), p });
    }
    return { synapses: out, dropped };
}

/** +1 when the soma is on the high-y side of the midline, -1 on the low side; throws on the midline itself (no side to be lateral to). */
export function sideOf(somaUm, midlineUm) {
    const d = somaUm[1] - midlineUm;
    if (d === 0) throw new Error("fishInputSide.sideOf: the soma is exactly on the midline");
    return d > 0 ? 1 : -1;
}

/** The offset of each synapse from the soma: [front-back, lateral (positive away from the midline), z] in micrometres. */
export function offsetsOf(synapses, somaUm, side) {
    return synapses.map((s) => [s.p[0] - somaUm[0], side * (s.p[1] - somaUm[1]), s.p[2] - somaUm[2]]);
}

const sq = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Deterministic k-means on 3-D points: `restarts` runs of Lloyd's algorithm from k-means++ seeds, the lowest summed squared distance wins (the earliest on a tie). Returns { labels, centroids, sse }. */
export function kmeans(points, k, { seed = 1, restarts = 8, maxIter = 100 } = {}) {
    if (!Array.isArray(points) || points.length < k) throw new Error(`fishInputSide.kmeans: ${points ? points.length : 0} points cannot make ${k} clusters`);
    const rng = mulberry(seed);
    let best = null;
    for (let r = 0; r < restarts; r++) {
        const centroids = [points[Math.floor(rng() * points.length)].slice()];
        while (centroids.length < k) {
            const d = points.map((p) => Math.min(...centroids.map((c) => sq(p, c)))), total = d.reduce((a, v) => a + v, 0);
            let pick = rng() * total, idx = 0;
            if (total > 0) { while (idx < d.length - 1 && pick >= d[idx]) { pick -= d[idx]; idx++; } } else idx = Math.floor(rng() * points.length);
            centroids.push(points[idx].slice());
        }
        let labels = new Array(points.length).fill(-1);
        for (let it = 0; it < maxIter; it++) {
            let moved = false;
            const next = points.map((p) => { let b = 0, bd = Infinity; for (let j = 0; j < k; j++) { const d = sq(p, centroids[j]); if (d < bd) { bd = d; b = j; } } return b; });
            for (let i = 0; i < next.length; i++) if (next[i] !== labels[i]) { moved = true; break; }
            labels = next;
            const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
            points.forEach((p, i) => { const s = sums[labels[i]]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
            sums.forEach((s, j) => { if (s[3] > 0) centroids[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
            if (!moved) break;
        }
        const sse = points.reduce((a, p, i) => a + sq(p, centroids[labels[i]]), 0);
        if (!best || sse < best.sse) best = { labels, centroids: centroids.map((c) => c.slice()), sse };
    }
    return best;
}

/** The three domains of a cell from its offsets: { names: [domain name per synapse, "far" for a synapse beyond trimUm], centroids: { perisomatic, lateral, zArm }, share (of ALL the synapses), sd, count (with far) }. The naming rule is in the header. Throws when two clusters cannot be told apart by it. */
export function domainsOf(offsets, opts = {}) {
    const { trimUm = TRIM_UM, seed = 1, restarts = 8 } = opts, keep = offsets.map((o) => Math.hypot(o[0], o[1], o[2]) <= trimUm), fit = offsets.filter((_, i) => keep[i]);
    const { labels: fl, centroids } = kmeans(fit, 3, { seed, restarts }), count = [0, 0, 0];
    let at = 0;
    const labels = keep.map((k) => (k ? fl[at++] : -1));
    labels.forEach((l) => { if (l >= 0) count[l]++; });
    if (count.some((c) => c === 0)) throw new Error("fishInputSide.domainsOf: a cluster came out empty, so the cell has fewer than three groups of synapses");
    const lat = [0, 1, 2].sort((a, b) => centroids[b][1] - centroids[a][1] || a - b)[0];
    const rest = [0, 1, 2].filter((j) => j !== lat), z = rest.sort((a, b) => centroids[b][2] - centroids[a][2] || a - b)[0], peri = rest.find((j) => j !== z);
    const nameOf = { [lat]: "lateral", [z]: "zArm", [peri]: "perisomatic" };
    const names = labels.map((l) => (l < 0 ? FAR : nameOf[l])), by = { perisomatic: peri, lateral: lat, zArm: z };
    const out = { names, centroids: {}, share: {}, sd: {}, count: {}, trimUm, fit: { seed, restarts, trimUm } };
    for (const d of DOMAINS) {
        const j = by[d], pts = offsets.filter((_, i) => labels[i] === j), c = centroids[j];
        out.centroids[d] = c.slice(); out.count[d] = pts.length; out.share[d] = pts.length / offsets.length;
        out.sd[d] = [0, 1, 2].map((a) => Math.sqrt(pts.reduce((s, p) => s + (p[a] - c[a]) ** 2, 0) / pts.length));
    }
    out.count[FAR] = labels.filter((l) => l < 0).length; out.share[FAR] = out.count[FAR] / offsets.length;
    return out;
}

/** Per partner: how many synapses on the cell, in each domain, the commonest domain (ties go to the order of DOMAINS), its purity, and the signs. `tagOf` maps a synapse id to a tag (1 inhibitory, 2 excitatory) or is null. */
export function partnersOf(synapses, names, tagOf = null) {
    const by = new Map();
    synapses.forEach((s, i) => {
        let e = by.get(s.pre);
        if (!e) by.set(s.pre, e = { pre: s.pre, n: 0, domains: { perisomatic: 0, lateral: 0, zArm: 0, far: 0 }, exc: 0, inh: 0, untagged: 0 });
        e.n++; e.domains[names[i]]++;
        const t = tagOf ? tagOf.get(s.id) : undefined;
        if (t === 2) e.exc++; else if (t === 1) e.inh++; else e.untagged++;
    });
    for (const e of by.values()) {
        const top = ALL.reduce((b, d) => (e.domains[d] > e.domains[b] ? d : b), ALL[0]);
        e.dominant = top; e.purity = e.domains[top] / e.n;
        e.sign = e.exc > e.inh ? "excitatory" : e.inh > e.exc ? "inhibitory" : "none";
    }
    return [...by.values()].sort((a, b) => b.n - a.n || (a.pre < b.pre ? -1 : 1));
}

/** The facts about one cell's input side, as numbers only (no root id): synapses, shares and centroids by domain, partners by commonest domain, the single-domain share, strong partners by domain, and (with tags) the signs by domain. */
export function reportOf(synapses, offsets, dom, partners, tagged) {
    const r = { synapses: synapses.length, trimUm: dom.trimUm, far: { synapses: dom.count[FAR], share: dom.share[FAR] }, domains: {}, partners: { total: partners.length, byDominant: { perisomatic: 0, lateral: 0, zArm: 0, far: 0 }, strongByDominant: { perisomatic: 0, lateral: 0, zArm: 0, far: 0 }, singleDomain: 0, singleDomainShare: 0, synapsesPerPartner: {} } };
    for (const d of DOMAINS) r.domains[d] = { synapses: dom.count[d], share: dom.share[d], centroidUm: dom.centroids[d].map((v) => Math.round(v * 10) / 10), sdUm: dom.sd[d].map((v) => Math.round(v * 10) / 10) };
    for (const p of partners) {
        r.partners.byDominant[p.dominant]++;
        if (p.n >= STRONG_PARTNER) r.partners.strongByDominant[p.dominant]++;
        if (p.purity === 1) r.partners.singleDomain++;
    }
    r.partners.singleDomainShare = partners.length ? r.partners.singleDomain / partners.length : 0;
    for (const d of ALL) { const v = partners.filter((p) => p.domains[d] > 0).map((p) => p.domains[d]); r.partners.synapsesPerPartner[d] = v.length ? Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 100) / 100 : 0; }
    if (tagged) {
        r.signs = { perisomatic: { excitatory: 0, inhibitory: 0, untagged: 0 }, lateral: { excitatory: 0, inhibitory: 0, untagged: 0 }, zArm: { excitatory: 0, inhibitory: 0, untagged: 0 }, far: { excitatory: 0, inhibitory: 0, untagged: 0 } };
        synapses.forEach((s, i) => { const t = tagged.get(s.id), d = r.signs[dom.names[i]]; if (t === 2) d.excitatory++; else if (t === 1) d.inhibitory++; else d.untagged++; });
    }
    return r;
}

/** The partners two cells share, with where each puts its synapses on each cell: { shared, sameDomain, pairs: { "perisomatic>perisomatic": n, ... }, signPairs (when both have signs) }. */
export function sharedOf(partnersA, partnersB) {
    const b = new Map(partnersB.map((p) => [p.pre, p])), pairs = {}, signPairs = {};
    let shared = 0, same = 0;
    for (const a of partnersA) {
        const o = b.get(a.pre);
        if (!o) continue;
        shared++; if (a.dominant === o.dominant) same++;
        const k = `${a.dominant}>${o.dominant}`; pairs[k] = (pairs[k] || 0) + 1;
        if (a.sign !== "none" && o.sign !== "none") { const sk = `${a.sign}/${o.sign}`; signPairs[sk] = (signPairs[sk] || 0) + 1; }
    }
    return { shared, sameDomain: same, pairs, signPairs };
}

/** The tags of synapse_signs.csv rows ({ target_id, tag }) as a map from synapse id to tag (1 or 2); a row with another tag is kept as that number and counts as untagged. */
export function tagsOf(signRows) {
    const m = new Map();
    for (const r of signRows) { const t = num(r.tag); if (r.target_id !== "" && r.target_id !== undefined && Number.isFinite(t)) m.set(String(r.target_id), t); }
    return m;
}

/** Everything for a set of cells in one call: the report of each cell and, for two cells, what they share. `files` = { synapsesIn: rows, labels: rows, signs: rows | null }. */
export function inputSide(files, cellIds, { midlineUm = null, seed = 1, restarts = 8, trimUm = TRIM_UM } = {}) {
    if (!Array.isArray(cellIds) || cellIds.length < 1) throw new Error("fishInputSide.inputSide: no cell ids");
    const somas = cellIds.map((c) => somaOf(files.labels, c));
    let mid = midlineUm, midNote = "given";
    if (mid === null || mid === undefined) {
        const ys = somas.map((s) => s[1]);
        if (cellIds.length < 2 || Math.min(...ys) === Math.max(...ys)) throw new Error("fishInputSide.inputSide: no midline: give --midline, or two cells on opposite sides of the fish");
        mid = (Math.min(...ys) + Math.max(...ys)) / 2; midNote = "the middle of the cells' somas along the left-right axis";
    }
    const tagged = files.signs ? tagsOf(files.signs) : null, cells = [];
    cellIds.forEach((c, i) => {
        const { synapses, dropped } = inputsOf(files.synapsesIn, c);
        if (!synapses.length) throw new Error(`fishInputSide.inputSide: cell ${i + 1} of ${cellIds.length} has no input synapse in synapses_in.csv`);
        const side = sideOf(somas[i], mid), off = offsetsOf(synapses, somas[i], side), dom = domainsOf(off, { seed, restarts, trimUm }), partners = partnersOf(synapses, dom.names, tagged);
        cells.push({ id: c, fit: dom.fit, somaUm: somas[i].map((v) => Math.round(v * 10) / 10), side, dropped, partners, report: reportOf(synapses, off, dom, partners, tagged) });
    });
    return { midlineUm: mid, midlineFrom: midNote, signs: !!tagged, cells, shared: cells.length === 2 ? sharedOf(cells[0].partners, cells[1].partners) : null };
}
