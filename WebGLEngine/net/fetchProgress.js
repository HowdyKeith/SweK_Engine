// FILE: net/fetchProgress.js -- v4199
//
// The fetch half of net/fetchProgress.mjs: stream a response body and report what has arrived.
// Everything that DECIDES anything -- whether a total can be trusted, and why not -- lives in the model.
"use strict";

import { progressEvent, totalIsComparable } from "./fetchProgress.mjs";

/**
 * fetch() that reports progress while the body streams in.
 *
 * @returns { ok, status, bytes: Uint8Array, total, loaded } -- the bytes, so a caller can hand them straight
 *          to a parser the way window.splat.load hands them to parseSplatFile.
 *
 * *** IT FALLS BACK TO A PLAIN arrayBuffer() RATHER THAN FAILING. *** response.body is absent on some
 * transports (and in some test doubles). A loader that threw there would trade "no progress bar" for "no
 * download", which is the wrong way round.
 */
export async function fetchWithProgress(url, { onProgress, fetchImpl, file, ...init } = {}) {
    const f = fetchImpl || fetch;
    const r = await f(url, init);
    if (!r.ok) return { ok: false, status: r.status, bytes: null, total: null, loaded: 0 };

    const len = r.headers && r.headers.get ? r.headers.get("content-length") : null;
    const enc = r.headers && r.headers.get ? r.headers.get("content-encoding") : null;
    const name = file || url;

    if (!r.body || typeof r.body.getReader !== "function") {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (onProgress) onProgress(progressEvent(buf.length, len, enc, name));
        return { ok: true, status: r.status, bytes: buf, total: totalIsComparable(len, enc) ? Number(len) : null, loaded: buf.length };
    }

    const reader = r.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (onProgress) onProgress(progressEvent(loaded, len, enc, name));
    }
    const bytes = new Uint8Array(loaded);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
    return { ok: true, status: r.status, bytes, total: totalIsComparable(len, enc) ? Number(len) : null, loaded };
}

export { progressEvent, totalIsComparable };
