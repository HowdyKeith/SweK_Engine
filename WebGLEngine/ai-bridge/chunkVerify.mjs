// WebGLEngine/ai-bridge/chunkVerify.mjs -- v3143
//
// CHUNKED CONTENT VERIFICATION, AND THE RESUME POINT THAT FALLS OUT OF IT.
//
// v3104 fixed the peer Grab to compare the size the walk reported against the bytes received, which catches a
// TRUNCATED transfer. IT DOES NOT CATCH A CORRUPT ONE. A proxy serving a same-length error body, a partial write
// later padded, a flipped bit in flight -- all arrive at exactly the expected length and are written to the
// destination under the right name. THE SIZE CHECK ANSWERS "DID IT ALL ARRIVE", NOT "IS IT THE SAME FILE".
//
// v3089 established the law in assetSync: a hash computed and thrown away is not a check, AN ABSENT HASH IS NOT
// A PASSING HASH, and verification happens BEFORE the rename. This brings the peer path to the same standard
// and adds the thing assetSync never needed -- RESUMPTION -- because Keith moves whole build trees between his
// own boxes and an interrupted 70 MB transfer currently starts from zero.
//
// *** THE RESUME POINT IS THE LAST VERIFIED CHUNK, NEVER THE FILE LENGTH. *** That distinction is the entire
// design. A partial file on disk has a length, and trusting it means resuming after bytes nobody checked --
// which is exactly how a corrupt prefix becomes a permanent corrupt file that every later transfer "resumes"
// past. So a chunk is only a resume point once its hash has matched, and the FIRST failing chunk truncates the
// answer: everything after it is discarded even if it happens to be right, because a gap cannot be verified.
//
// WHY A FLAT CHUNK LIST AND NOT A MERKLE TREE. iroh uses BLAKE3 because its tree lets a receiver verify a chunk
// against a small proof without holding the whole manifest. SweK's peers exchange the manifest anyway -- it is
// one JSON body on a LAN -- so the tree buys nothing here and costs a second implementation of something
// subtle. THE IDEA WORTH TAKING WAS PER-CHUNK VERIFICATION, NOT THE TREE.

import crypto from "node:crypto";

export const CHUNK_BYTES = 1 << 20;          // 1 MiB -- a manifest for a 70 MB build is ~70 lines
export const HASH = "sha256";

const hashOf = (buf) => crypto.createHash(HASH).update(buf).digest("hex");

/** Split a buffer into chunk digests. The LAST chunk is short and that is not an error. */
export function chunkManifest(buf, chunkBytes = CHUNK_BYTES) {
    if (!Buffer.isBuffer(buf)) throw new TypeError("chunkManifest needs a Buffer");
    if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) throw new RangeError("chunkBytes must be a positive integer");
    const chunks = [];
    for (let off = 0; off < buf.length; off += chunkBytes) {
        const end = Math.min(off + chunkBytes, buf.length);
        chunks.push({ off, len: end - off, hash: hashOf(buf.subarray(off, end)) });
    }
    // A ZERO-LENGTH FILE HAS NO CHUNKS AND IS STILL A LEGITIMATE FILE. Returning an empty list with the total
    // recorded keeps "nothing to verify" distinct from "verification found nothing wrong".
    return { size: buf.length, chunkBytes, hash: HASH, chunks, whole: hashOf(buf) };
}

/**
 * How much of `have` is verified against `manifest`?
 *
 * @returns { verifiedBytes, verifiedChunks, complete, firstBad, why }
 *   firstBad -- the index of the first chunk that does not match, or -1. EVERYTHING AFTER IT IS DISCARDED.
 */
export function verifiedPrefix(manifest, have) {
    if (!manifest || !Array.isArray(manifest.chunks)) throw new TypeError("verifiedPrefix needs a manifest");
    if (!Buffer.isBuffer(have)) throw new TypeError("verifiedPrefix needs a Buffer");
    let verifiedBytes = 0, verifiedChunks = 0, firstBad = -1, why = null;
    for (let i = 0; i < manifest.chunks.length; i++) {
        const c = manifest.chunks[i];
        if (have.length < c.off + c.len) { why = "ran out of local bytes at chunk " + i; break; }
        if (hashOf(have.subarray(c.off, c.off + c.len)) !== c.hash) {
            firstBad = i;
            why = "chunk " + i + " at offset " + c.off + " does not match -- resuming from " + verifiedBytes +
                  ", the end of the last VERIFIED chunk, not from the " + have.length + " bytes on disk";
            break;
        }
        verifiedBytes += c.len; verifiedChunks++;
    }
    const complete = verifiedChunks === manifest.chunks.length && verifiedBytes === manifest.size;
    return { verifiedBytes, verifiedChunks, complete, firstBad, why };
}

/**
 * v3175 -- THE PLAN A RESUMING RECEIVER CAN ACTUALLY EXECUTE.
 *
 * v3167 produced the RANGES and the Grab used them ONLY when there was exactly one, falling back to the prefix
 * rule for scattered damage because "several ranges need multipart responses or several requests and neither
 * has been designed". This designs it.
 *
 * *** SEVERAL REQUESTS, NOT MULTIPART, AND THE REASON IS THIS SESSION'S MOST REPEATED LESSON. *** A
 * `Range: bytes=0-99,200-299` reply arrives as multipart/byteranges, which needs a PARSER -- boundary strings,
 * per-part headers, per-part Content-Range. That is a SECOND IMPLEMENTATION OF SOMETHING SUBTLE, which is
 * exactly what v3143 refused for Merkle trees and v3154 spent a round undoing for a solidity predicate. On a
 * LAN, N round trips cost almost nothing, and each reply is an ORDINARY 206 the existing code already handles.
 *
 * *** AND THE REQUEST COUNT IS BOUNDED, WITH THE FALLBACK NAMED. *** Damage scattered across forty chunks would
 * be forty requests to save a fraction of a 70 MB file. Past maxRequests the honest answer is REFETCH THE WHOLE
 * THING -- slower in bytes, simpler in failure modes, and it is stated rather than discovered.
 */
export function resumePlan(manifest, have, { maxRequests = 8 } = {}) {
    const a = resumeRanges(manifest, have);
    if (a.complete) return { kind: "COMPLETE", ranges: [], bytes: 0, why: "every chunk verified against the manifest" };
    // NOTHING KEPT IS NOT THE SAME AS SCATTERED DAMAGE. A .part whose very first chunk is bad has no usable
    // prefix at all, and asking for "everything from byte 0" as a range is a whole-file fetch wearing a 206.
    if (a.goodBytes === 0) return { kind: "WHOLE", ranges: [], bytes: manifest.size, why: "no chunk verified -- nothing to keep" };
    if (a.ranges.length > maxRequests) {
        return { kind: "WHOLE", ranges: [], bytes: manifest.size,
                 why: "damage spans " + a.ranges.length + " separate runs, over the " + maxRequests +
                      "-request budget -- refetching whole is slower in bytes and simpler in failure modes" };
    }
    // A PLAN THAT COSTS MORE THAN THE FILE IS NOT A PLAN. Overlapping guards elsewhere compare against the
    // prefix rule; this one compares against the only other option that always works.
    if (a.bytes >= manifest.size) {
        return { kind: "WHOLE", ranges: [], bytes: manifest.size, why: "the ranges total the whole file anyway" };
    }
    return { kind: "RANGES", ranges: a.ranges, bytes: a.bytes, bad: a.bad, missing: a.missing,
             why: a.ranges.length + " request(s) for " + a.bytes + " bytes instead of " + manifest.size };
}

/**
 * Splice fetched ranges into the kept bytes, VERIFYING EACH CHUNK BEFORE IT COUNTS.
 *
 * *** A RANGE THAT ARRIVED IS NOT A RANGE THAT IS RIGHT. *** v3161 established that the SPLICE IS DECIDED BY
 * THE RESPONSE, never by the request -- a peer that ignored the header sends the whole file. Here the same rule
 * goes one level deeper: even a correct 206 of the correct length can carry wrong bytes, and the manifest
 * already holds the hash that settles it. Verifying after assembly would tell you the file is wrong; verifying
 * per range tells you WHICH REQUEST to repeat.
 *
 * @param parts [{ start, end, body }] -- body being exactly the bytes the peer returned for that range
 */
export function spliceRanges(manifest, have, parts) {
    const out = Buffer.from(have);
    const bad = [];
    for (const p of parts) {
        const len = p.end - p.start + 1;
        // A SHORT OR LONG BODY IS NOT A RANGE. Copying it anyway would shift everything after it, and the
        // whole-file hash would then fail for a reason nobody could locate.
        if (!Buffer.isBuffer(p.body) || p.body.length !== len) {
            bad.push({ start: p.start, why: "body is " + (p.body ? p.body.length : "absent") + " bytes, expected " + len });
            continue;
        }
        if (p.start + len > out.length) {
            const grown = Buffer.alloc(p.start + len);
            out.copy(grown, 0); grown.fill(0, out.length);
            p.body.copy(grown, p.start);
            return spliceRanges(manifest, grown, parts.filter((q) => q !== p));
        }
        p.body.copy(out, p.start);
    }
    const after = chunkAudit(manifest, out);
    return {
        ok: bad.length === 0 && after.complete,
        buf: out,
        rejected: bad,
        // WHICH CHUNKS ARE STILL WRONG, so a caller repeats a request rather than the transfer.
        stillBad: after.bad, stillMissing: after.missing,
        why: bad.length ? "one or more ranges were not the bytes asked for"
           : (after.complete ? null : "spliced, but " + (after.bad.length + after.missing.length) + " chunk(s) still fail the manifest"),
    };
}

/**
 * v3167 -- WHICH CHUNKS ARE BAD, not just where the good prefix ends.
 *
 * verifiedPrefix walks forward and STOPS at the first mismatch, and everything after it is discarded. That was
 * gated at v3143 with the reason "A GAP CANNOT BE VERIFIED" -- and *** THAT REASON IS ONLY TRUE WITHOUT A CHUNK
 * LIST. *** v3160 added /peer/dl/manifest, which IS a chunk list, and every chunk in it carries its own hash and
 * offset. Since that round we have been able to check each chunk INDEPENDENTLY and have not.
 *
 * The comparison with copyparty's up2k is what surfaced it: their handshake sends the client's hashlist and the
 * SERVER REPLIES WITH WHICH CHUNKS TO RESEND. On a 70 MB build with one corrupt chunk in the middle, that is
 * the difference between re-fetching half the file and re-fetching one megabyte.
 *
 * A REASON CAN EXPIRE WITHOUT THE CODE CHANGING, AND NOTHING RE-READS THE REASONS.
 *
 * MISSING AND CORRUPT STAY APART, because they are different facts about a transfer: a chunk beyond the local
 * length was never received, and a chunk that hashes wrong was received WRONG. Both need re-fetching and only
 * the second means something went wrong on the wire.
 */
export function chunkAudit(manifest, have) {
    if (!manifest || !Array.isArray(manifest.chunks)) throw new TypeError("chunkAudit needs a manifest");
    if (!Buffer.isBuffer(have)) throw new TypeError("chunkAudit needs a Buffer");
    const bad = [], missing = [];
    let goodBytes = 0;
    for (let i = 0; i < manifest.chunks.length; i++) {
        const c = manifest.chunks[i];
        if (have.length < c.off + c.len) { missing.push(i); continue; }
        if (hashOf(have.subarray(c.off, c.off + c.len)) !== c.hash) { bad.push(i); continue; }
        goodBytes += c.len;
    }
    return { bad, missing, goodBytes, total: manifest.chunks.length, complete: bad.length === 0 && missing.length === 0 };
}

/**
 * Coalesce the chunks that need re-fetching into byte ranges, so ADJACENT bad chunks become ONE request.
 *
 * A range per chunk would be correct and chatty: a 70 MB file at 1 MiB chunks whose tail is missing is
 * seventy requests where one would do. Merging only ADJACENT indices keeps each range contiguous, which is what
 * a single Range header can express -- multipart ranges exist and are a different, worse conversation.
 */
export function resumeRanges(manifest, have) {
    const a = chunkAudit(manifest, have);
    const need = [...a.bad, ...a.missing].sort((x, y) => x - y);
    const ranges = [];
    for (const i of need) {
        const c = manifest.chunks[i];
        const last = ranges[ranges.length - 1];
        if (last && last.end + 1 === c.off) { last.end = c.off + c.len - 1; last.chunks.push(i); }
        else ranges.push({ start: c.off, end: c.off + c.len - 1, chunks: [i] });
    }
    return {
        ...a, ranges,
        bytes: ranges.reduce((n, r) => n + (r.end - r.start + 1), 0),
        // WHAT THE OLD PATH WOULD HAVE COST, carried alongside so the saving is VISIBLE rather than claimed --
        // and computed by CALLING verifiedPrefix rather than re-deriving its rule here. A second implementation
        // of "where does the good prefix end" is v3154's six-copies mistake in miniature, and this one would be
        // in the same file as the original.
        //
        // NOTE THE HONEST ASYMMETRY: for a SHORT file the two are IDENTICAL -- everything after the last whole
        // chunk is missing either way. THE SAVING IS FOR CORRUPT PREFIXES ONLY, and claiming it generally would
        // be claiming a number that is true in one of the two cases.
        prefixOnlyBytes: manifest.size - verifiedPrefix(manifest, have).verifiedBytes,
    };
}

/**
 * What to ask the peer for. Empty means nothing is needed.
 *
 * A SIZE MATCH WITH A HASH MISMATCH IS CORRUPTION, NOT TRUNCATION, and the two want different requests: a short
 * file needs the tail, a corrupt one needs a REWRITE from the first bad chunk. Reporting both as "incomplete"
 * would have the caller append to a file whose prefix is already wrong.
 */
export function resumeRequest(manifest, have) {
    const v = verifiedPrefix(manifest, have);
    if (v.complete) return { need: false, from: manifest.size, kind: "complete", why: null };
    return {
        need: true,
        from: v.verifiedBytes,
        // v3167 -- what THIS rule costs, so a caller can compare it against the chunk audit without re-deriving.
        prefixOnlyBytes: manifest.size - v.verifiedBytes,
        kind: v.firstBad >= 0 ? "corrupt" : "short",
        why: v.why || ("have " + have.length + " of " + manifest.size + " bytes"),
        discardAfter: v.verifiedBytes,
    };
}

/** Final gate before a rename. Refuses on ANY doubt, and says which. */
export function acceptOrRefuse(manifest, buf) {
    if (!manifest || typeof manifest.whole !== "string" || !manifest.whole) {
        // v3089's law: an ABSENT hash is not a PASSING hash.
        return { ok: false, reason: "no manifest hash supplied -- refusing rather than accepting unverified bytes" };
    }
    if (buf.length !== manifest.size) return { ok: false, reason: "size " + buf.length + " != manifest " + manifest.size };
    const got = hashOf(buf);
    if (got !== manifest.whole) {
        return { ok: false, reason: "SIZE MATCHES AND CONTENT DOES NOT -- " + got.slice(0, 12) + " != " + manifest.whole.slice(0, 12) + ". This is corruption, not truncation" };
    }
    return { ok: true, reason: null };
}
