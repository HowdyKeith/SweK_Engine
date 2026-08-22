// ai-bridge/httpRange.js — RFC 7233, the byte-range half of it, and nothing else.
//
// Until v2208 the engine's static server sent whole files, always. A `<video>` on a television could play an
// MP4 and could not SEEK, because seeking is a browser asking for bytes 1,000,000 to 1,999,999 and being
// told "here is the whole film again, from zero." `comics.html` re-fetched a hundred-megabyte CBZ to show
// one page. Nothing was broken; everything was slow in a way that looked like the network's fault.
//
// This is the parser. It is separate from `server.js` because a twenty-thousand-line file is not a place to
// hide arithmetic, and because the arithmetic is the whole thing:
//
//   `bytes=0-499`      the first five hundred bytes. INCLUSIVE at both ends -- so the length is
//                      `end - start + 1`, and the off-by-one there is the classic way to ship a video that
//                      plays for everyone except the one person whose player checks.
//   `bytes=500-`       from 500 to the end.
//   `bytes=-500`       THE LAST five hundred bytes. Not "from 500". A suffix range, and it is the form MP4
//                      players use first, to find the `moov` atom at the end of the file.
//   `bytes=0-`         the whole thing, which still deserves a 206 rather than a 200, because the client
//                      asked a question and is entitled to the answer it asked for.
//
// WHAT IT REFUSES, and why refusing is the right answer:
//
//   * MULTIPLE RANGES (`bytes=0-99,200-299`). Legal, and answered with a `multipart/byteranges` body that
//     nothing in this engine needs and that is easy to get subtly wrong. A server MAY ignore a Range header
//     it does not want to honour, so this one returns the whole file with a 200. That is a correct response,
//     and a half-built multipart body is not.
//   * A range that starts past the end of the file. `416`, with a `Content-Range: bytes */<size>` so the
//     client learns the real size instead of guessing again.
//   * A unit that is not `bytes`. Ignored, per the spec: an unrecognised unit means the header is not for us.
//   * A syntactically broken header. Ignored, not rejected. RFC 7233: "a server MUST ignore a Range header
//     field that contains a range unit it does not understand" and, for a malformed one, treating it as
//     absent is the safe reading.
//
// An empty file is the one case that has no satisfiable range at all: `bytes=0-0` asks for a byte that is
// not there. It gets a 416, and `Content-Range: bytes */0`.

"use strict";

// Returns one of:
//   { kind: "none" }                          -- no Range header, or one to be ignored: serve 200
//   { kind: "unsatisfiable" }                 -- serve 416 with Content-Range: bytes * /size
//   { kind: "range", start, end, length }     -- serve 206, inclusive bounds
function parseRange(header, size) {
    if (typeof header !== "string" || !header) return { kind: "none" };
    if (!Number.isFinite(size) || size < 0) return { kind: "none" };

    const m = /^\s*bytes\s*=\s*(.*)$/i.exec(header);
    if (!m) return { kind: "none" };                    // a unit we do not understand: the header is not for us
    const spec = m[1].trim();
    if (!spec) return { kind: "none" };

    // Multiple ranges are legal and we decline to honour them. A server MAY ignore a Range header.
    if (spec.includes(",")) return { kind: "none" };

    const parts = /^(\d*)-(\d*)$/.exec(spec);
    if (!parts) return { kind: "none" };                // malformed: treat as absent
    const [, a, b] = parts;
    if (a === "" && b === "") return { kind: "none" };  // `bytes=-` means nothing

    let start, end;
    if (a === "") {
        // A SUFFIX range: `bytes=-500` is the LAST five hundred bytes, not "from 500". Getting this backwards
        // serves the beginning of a film to a player looking for the index at its end.
        const suffix = Number(b);
        if (!Number.isFinite(suffix)) return { kind: "none" };
        if (suffix === 0) return { kind: "unsatisfiable" };   // the last zero bytes are not a range
        if (size === 0) return { kind: "unsatisfiable" };
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(a);
        if (!Number.isFinite(start)) return { kind: "none" };
        if (size === 0 || start >= size) return { kind: "unsatisfiable" };
        if (b === "") end = size - 1;
        else {
            end = Number(b);
            if (!Number.isFinite(end)) return { kind: "none" };
            // A client may ask past the end; the spec says clamp, not complain.
            if (end >= size) end = size - 1;
            if (end < start) return { kind: "unsatisfiable" };
        }
    }
    // INCLUSIVE at both ends.
    return { kind: "range", start, end, length: end - start + 1 };
}

// The headers a 206 needs, and the two it must not forget: `Content-Length` is the LENGTH OF THE SLICE, not
// of the file, and `Content-Range` counts the file.
function rangeHeaders(r, size, contentType) {
    return {
        "Content-Type": contentType,
        "Content-Length": r.length,
        "Content-Range": `bytes ${r.start}-${r.end}/${size}`,
        "Accept-Ranges": "bytes",
    };
}

function unsatisfiableHeaders(size) {
    return { "Content-Range": `bytes */${size}`, "Content-Length": 0, "Accept-Ranges": "bytes" };
}

// Whether a file type is worth advertising ranges for. Advertising `Accept-Ranges: bytes` on everything is
// harmless and honest -- the server really does accept them -- so this exists only to answer the question a
// reader will have, and the answer is "everything".
const RANGEABLE = true;

module.exports = { parseRange, rangeHeaders, unsatisfiableHeaders, RANGEABLE };
