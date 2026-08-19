// tools/ship/asciiExternal.mjs -- v3777
//
// *** THE "KEEP IT ENTIRELY EXTERNAL" ROUTE, MADE A FIRST-CLASS OPTION.
// A generator SweK does not contain -- stong/gradscii-art (AGPL-3.0), a shell script, somebody's Python, a
// hand-typed folder -- writes ONE TEXT FILE PER FRAME. This module turns that pile into the document
// tools/ship/asciiFrames.mjs validates. IT READS TEXT AND NAMES. That is not derived work under anybody's
// licence: SweK contains no generator, links against none, and cannot tell which one produced its input. ***
//
// *** IT TAKES BLOBS, NOT A PATH. No fs, no directory walking, no network -- the caller (a page's file picker,
// or a gate's fixture) hands in `[{ name, text }]`. A function that takes its input is testable; one that
// reads a disk is not, and this one has to be provable before anybody trusts a 700-frame import. ***
//
// *** THE SILENT FAILURE THIS EXISTS FOR IS THE ORDER. A folder of frames sorts LEXICOGRAPHICALLY by default,
// so frame10 lands before frame2 and the video plays in a scrambled order THAT LOOKS LIKE A BAD EDIT RATHER
// THAN A BUG. Nothing throws, every frame is present, the count is right. NATURAL-NUMERIC ORDERING IS THE
// WHOLE POINT OF THIS FILE. ***

/** Pull the LAST run of digits from a name: t_iter_0100.txt -> 100, frame2.txt -> 2. */
export function indexOf(name) {
    const m = String(name).match(/(\d+)(?!.*\d)/);
    return m ? parseInt(m[1], 10) : null;
}

/**
 * @param {[{name:string, text:string}]} blobs
 * @param {{fps:number, cols?:number, rows?:number, requireContiguous?:boolean}} opts
 * @returns {{ ok, errors, warnings, doc }} -- `doc` is the shape asciiFrames.importFrames accepts
 */
export function fromTextFiles(blobs, opts = {}) {
    const errors = [], warnings = [];
    if (!Array.isArray(blobs) || blobs.length === 0) return { ok: false, errors: ["no files given"], warnings, doc: null };

    const fps = opts.fps;
    if (!Number.isFinite(fps) || fps <= 0) errors.push("fps must be supplied and positive -- IT IS NOT IN THE FILES, so it cannot be guessed");

    // ---- ORDER -------------------------------------------------------------------------------------------
    const indexed = blobs.map((b) => ({ ...b, idx: indexOf(b.name) }));
    const missing = indexed.filter((b) => b.idx === null);
    if (missing.length && missing.length !== indexed.length) {
        // *** MIXED IS REFUSED RATHER THAN PATCHED. Some numbered and some not means the order is genuinely
        // unknown for part of the set, and choosing one silently is the guess this file exists to prevent. ***
        errors.push(missing.length + " of " + indexed.length + " names carry no number (" +
                    missing.slice(0, 3).map((b) => b.name).join(", ") + (missing.length > 3 ? ", ..." : "") +
                    ") while the rest do -- the order of the unnumbered ones is UNKNOWABLE, not guessable");
    }
    const numbered = missing.length === 0;
    const ordered = numbered
        ? indexed.slice().sort((a, b) => a.idx - b.idx)
        : indexed.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (!numbered && missing.length === indexed.length) {
        warnings.push("no name carries a number, so the order is the NAMES' OWN sort -- check it is the one you meant");
    }

    if (numbered) {
        const idxs = ordered.map((b) => b.idx);
        const dupes = idxs.filter((v, i) => i > 0 && v === idxs[i - 1]);
        if (dupes.length) errors.push("duplicate frame numbers: " + [...new Set(dupes)].slice(0, 5).join(", ") +
            " -- two files claiming one position, and last-one-wins would silently drop the other");
        const gaps = [];
        for (let i = 1; i < idxs.length; i++) if (idxs[i] !== idxs[i - 1] + 1) gaps.push(idxs[i - 1] + ".." + idxs[i]);
        if (gaps.length) {
            // *** A GAP IS REPORTED, NOT REFUSED BY DEFAULT. gradscii-art's own step dumps are every 100
            // iterations (t_iter_0000, t_iter_0100, ...), so a run of them is ALL GAPS AND PERFECTLY VALID.
            // A gap in a per-frame export is a DROPPED FRAME. The module cannot tell which it was handed, so
            // it says so and lets the caller demand contiguity if that is what they meant. ***
            const msg = "frame numbers are not contiguous (" + gaps.slice(0, 4).join(", ") +
                        (gaps.length > 4 ? ", ..." : "") + ") -- fine for a step dump every N iterations, a " +
                        "DROPPED FRAME in a per-frame export";
            if (opts.requireContiguous) errors.push(msg); else warnings.push(msg);
        }
    }

    // ---- DIMENSIONS --------------------------------------------------------------------------------------
    // Inferred from the FIRST file and then CHECKED against every other, never assumed to hold.
    const linesOf = (t) => {
        const body = String(t).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const ls = body.split("\n");
        if (ls.length > 1 && ls[ls.length - 1] === "") ls.pop();
        return ls;
    };
    const first = ordered.length ? linesOf(ordered[0].text) : [];
    const rows = Number.isInteger(opts.rows) ? opts.rows : first.length;
    const cols = Number.isInteger(opts.cols) ? opts.cols : (first[0] ? first[0].length : 0);
    if (!(rows > 0 && cols > 0)) errors.push("could not determine a grid: first file is " + first.length + " rows");

    if (rows > 0 && cols > 0) {
        for (const b of ordered) {
            const ls = linesOf(b.text);
            if (ls.length !== rows) { errors.push(b.name + ": " + ls.length + " rows, expected " + rows); continue; }
            const bad = ls.findIndex((l) => l.length !== cols);
            if (bad >= 0) errors.push(b.name + ": row " + bad + " is " + ls[bad].length + " chars, expected " + cols);
        }
    }

    if (errors.length) return { ok: false, errors, warnings, doc: null };
    return { ok: true, errors, warnings,
             doc: { fps, cols, rows, frameCount: ordered.length,
                    frames: ordered.map((b) => linesOf(b.text).join("\n")) },
             order: ordered.map((b) => b.name) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const g = (ch) => [ch.repeat(6), ch.repeat(6)].join("\n");
    const names = ["frame1.txt", "frame2.txt", "frame10.txt"];
    console.log("[asciiExternal] names as given : " + names.join(", "));
    console.log("[asciiExternal] LEXICOGRAPHIC  : " + names.slice().sort().join(", ") + "   <-- frame10 before frame2");
    const r = fromTextFiles(names.map((n, i) => ({ name: n, text: g(".:#"[i]) })), { fps: 12 });
    console.log("[asciiExternal] natural-numeric: " + r.order.join(", "));
    console.log("[asciiExternal] ok=" + r.ok + "  " + r.doc.cols + "x" + r.doc.rows + "  warnings: " + (r.warnings[0] || "none"));
}
