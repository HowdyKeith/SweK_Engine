// FILE: net/fetchProgress.mjs -- v4199
//
// WHETHER A DOWNLOAD CAN HONESTLY REPORT A PERCENTAGE, and what to say when it cannot. Pure -- no fetch, no
// DOM, no clock -- so the decision is testable without a network.
//
// *** THE REPORTING HALF OF THIS ALREADY EXISTED AND IS ALREADY RIGHT. *** ui/localModelRun.js's
// progressLine() returns `pct: null` rather than inventing a number when the total is unknown, and its own
// comment names the reason: "a progress bar that lies about how far along it is is the same family as this
// tree's flag that lies". What was missing was anything on the ENGINE side producing those events --
// splat.load, realTerrain.load and schematic.load fetch large assets and report nothing at all. This file is
// the transport half, and it feeds the model that already exists rather than growing a second one.
//
// *** AND IT FIXES A REAL DEFECT IN THAT MODEL, MEASURED RATHER THAN REASONED. ***
// progressLine is right about a MISSING Content-Length and wrong about a COMPRESSED one. Content-Length
// describes the bytes ON THE WIRE; response.body.getReader() yields the bytes AFTER decoding. When the
// server gzips, those are different numbers, and not by a little:
//
//   200000 bytes of compressible payload, served gzip
//   Content-Length: 235          bytes read from the stream: 200000       ratio 851x
//
// Measured in headless Chromium against a local server, both branches in one run. progressLine clamps with
// Math.min(100, ...), so it would show 100% on the first chunk and sit there for the entire download -- the
// precise failure its own comment warns against, arrived at from the other direction. A total that cannot be
// compared to what the reader counts is not a total, and this file says so.
"use strict";

/**
 * Is `total` comparable to the bytes a reader will count?
 *
 * @param contentLength  the Content-Length header, or null
 * @param contentEncoding the Content-Encoding header, or null
 */
export function totalIsComparable(contentLength, contentEncoding) {
    const n = Number(contentLength);
    if (!Number.isFinite(n) || n <= 0) return false;
    // *** ANY content-encoding BREAKS THE COMPARISON, NOT JUST gzip. *** br, deflate, zstd and anything a
    // future server negotiates all decode to a different length. Listing the ones we know would quietly
    // start lying the day a new one ships, so the test is "is there an encoding at all".
    if (contentEncoding && String(contentEncoding).trim() && String(contentEncoding).toLowerCase() !== "identity") return false;
    return true;
}

/**
 * The progress event for a caller, in exactly the shape ui/localModelRun.js's progressLine() consumes.
 *
 * `total` is null whenever it cannot be trusted, which routes into the path progressLine already handles
 * correctly -- bytes so far, no denominator, no invented percentage.
 */
export function progressEvent(loaded, contentLength, contentEncoding, file = null) {
    const comparable = totalIsComparable(contentLength, contentEncoding);
    return {
        status: "download",
        file,
        loaded,
        total: comparable ? Number(contentLength) : null,
        // Why the denominator is missing, for a caller that wants to say so rather than just omit it.
        totalUnknownBecause: comparable ? null
            : (contentEncoding && String(contentEncoding).toLowerCase() !== "identity"
                ? `the response is ${contentEncoding}-encoded, so Content-Length counts compressed bytes and the reader counts decoded ones`
                : "the server sent no Content-Length"),
    };
}

/** Everything wrong with a progress observation. Empty means it can be shown to a person. */
export function validateProgress(ev) {
    const p = [];
    if (!ev || typeof ev !== "object") return ["not an object"];
    if (!Number.isFinite(ev.loaded) || ev.loaded < 0) p.push("loaded is not a non-negative number");
    if (ev.total !== null && (!Number.isFinite(ev.total) || ev.total <= 0)) p.push("total is neither null nor positive");
    // *** loaded > total IS THE SHAPE OF THE BUG THIS FILE EXISTS FOR. *** If it ever appears, the total was
    // not comparable and something upstream decided it was.
    if (ev.total !== null && ev.loaded > ev.total) {
        p.push(`loaded ${ev.loaded} exceeds total ${ev.total} -- the total was not comparable to what the reader counts`);
    }
    if (ev.total === null && !ev.totalUnknownBecause) p.push("no total and no reason given for its absence");
    return p;
}
