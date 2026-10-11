// WebGLEngine/tools/ship/flakeCompare.mjs -- v4826
//
// THE PURE HALF OF tools/ship/flakeProbe.mjs: parse the rows a gate prints, and compare K runs of one gate for the rows that FLIPPED and the rows that read a THIN number.
// Split out so the command line can be a script with no exports (and so the gate that grades the comparison imports a module, not a CLI). See flakeProbe.mjs for why.
"use strict";

export const THIN_MAX = 3;   // a varying WHOLE number at or under this, in a row that passed, is the thin species

/** The rows of one run's output: [{ name, pass, detail }]. The gates print `  PASS  name   detail`; the detail follows the first run of three spaces. */
export function parseRows(text) {
    const rows = [];
    for (const line of String(text).split(/\r?\n/)) {
        const m = /^ {2}(PASS|FAIL)\s{2}(.*)$/.exec(line); if (!m) continue;
        const body = m[2], at = body.indexOf("   ");
        rows.push({ name: (at < 0 ? body : body.slice(0, at)).trim(), pass: m[1] === "PASS", detail: at < 0 ? "" : body.slice(at).trim() });
    }
    return rows;
}

/** The numbers in a detail string, as written (a hex fragment such as 8e62060a is a token, not a number: only decimal tokens with a word boundary count). */
export function numbersIn(detail) { return (String(detail).match(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g) || []).map(Number); }

/**
 * Compare K runs of one gate. runs: [{ code, rows, last }]. Returns { times, flipped, thin, crashed, stable } where
 * flipped = [{ name, pass, fail }], thin = [{ name, index, min, max, seen }], crashed = [{ run, code, last }].
 */
export function compareRuns(runs) {
    const flipped = [], thin = [], crashed = [], byName = new Map();
    runs.forEach((r, k) => {
        if (r.code !== 0 && !r.rows.some((x) => !x.pass)) crashed.push({ run: k, code: r.code, last: r.last });
        const seen = new Map();
        for (const row of r.rows) {
            const n = (seen.get(row.name) || 0) + 1; seen.set(row.name, n);
            const key = row.name + (n > 1 ? " #" + n : ""), e = byName.get(key) || { name: key, pass: 0, fail: 0, details: [] };
            if (row.pass) e.pass++; else e.fail++; e.details.push(row.detail); byName.set(key, e);
        }
    });
    for (const e of byName.values()) {
        if (e.pass && e.fail) { flipped.push({ name: e.name, pass: e.pass, fail: e.fail }); continue; }
        if (e.fail || e.details.length < 2) continue;
        const nums = e.details.map(numbersIn), width = Math.min(...nums.map((a) => a.length));
        for (let i = 0; i < width; i++) {
            const col = nums.map((a) => a[i]), lo = Math.min(...col), hi = Math.max(...col);
            if (lo !== hi && lo <= THIN_MAX && lo >= 0 && col.every(Number.isInteger)) { thin.push({ name: e.name, index: i, min: lo, max: hi, seen: col }); break; }
        }
    }
    return { times: runs.length, flipped, thin, crashed, stable: !flipped.length && !thin.length && !crashed.length };
}
