// maps/uvtt/mapArt.mjs -- v3818
//
// *** WHAT IS IN A UVTT `image` FIELD, DECIDED FROM THE BYTES RATHER THAN FROM AN EVENT. ***
//
// uvtt.html used to hand the field straight to an <img> and wait: onload meant good, nothing meant bad. Two
// things were wrong with that, and the second one is the reason this file exists.
//
// FIRST, "nothing" WAS ACTUALLY NOTHING. There was an onload and NO onerror, so a field carrying the literal
// string "MapImage" -- which two of the seven shipped maps do -- failed into silence and the reader got a bare
// floor with no explanation.
//
// SECOND, AND THE INTERESTING ONE: ADDING onerror DID NOT FIX IT RELIABLY. Measured across repeated runs of
// the same seven presets, keep-60-lvl2 got its note on one run and not the next -- INTERMITTENT, which is the
// worst kind of "fixed". Both keep files carry the SAME failing data URL, so by the time the second one is
// loaded the browser has already failed that exact URL once and does not reliably re-fire either event on a
// fresh Image. *** THE VERDICT DEPENDED ON A CACHE, WHICH IS NOT A PROPERTY OF THE MAP. ***
//
// So the question is answered from the base64 itself, synchronously, before any Image exists. A PNG says its
// own size in its header: the eight-byte signature, then the IHDR length and tag, then width and height as
// big-endian uint32s at offsets 16 and 20. Reading those is cheaper than decoding the image and it cannot
// race anything.
//
// AND A 1x1 IS NOT A NEAR-MISS, IT IS THE WORST CASE. Five of the seven shipped maps carry the classic
// 68-byte 1x1 grey-alpha placeholder. An undecodable field leaves the floor alone and looks like a floor; a
// 1x1 that decodes SUCCEEDS, gets stretched over the whole map, and the caller then sets the material colour
// to white -- so the honest brown floor is replaced by one stretched pixel and the map reads as BLANK rather
// than as bare. A geometry-only UVTT is a perfectly normal thing to have. Not being told is not.

/** Smallest image worth using as a floor texture. Below this it is a placeholder, whatever it decodes to. */
export const MIN_ART_PX = 3;

/** Base64 -> bytes, in whichever runtime this is loaded by. The page needs it; so does the gate. */
function bytesOf(b64) {
    if (typeof atob === "function") {
        const s = atob(b64);
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * @returns {{usable:boolean, reason:string, why:string, width:number, height:number, bytes:number}}
 * `reason` is one of: "ok", "absent", "not-base64", "not-png", "placeholder".
 */
export function describeMapArt(image) {
    if (image === undefined || image === null || image === "") {
        return { usable: false, reason: "absent", why: "no image field \u2014 geometry only", width: 0, height: 0, bytes: 0 };
    }
    let b;
    try { b = bytesOf(String(image)); }
    catch { return { usable: false, reason: "not-base64", why: "image field is not base64 \u2014 geometry only", width: 0, height: 0, bytes: 0 }; }

    // The PNG signature. A field like "MapImage" decodes to six arbitrary bytes and fails here, which is the
    // point: it is not a truncated PNG, it is a note somebody left in a field expecting bytes.
    const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length < 24 || SIG.some((v, i) => b[i] !== v)) {
        return { usable: false, reason: "not-png", why: "image field is not a PNG \u2014 geometry only", width: 0, height: 0, bytes: b.length };
    }
    const be32 = (o) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
    const width = be32(16), height = be32(20);
    if (width < MIN_ART_PX || height < MIN_ART_PX) {
        return { usable: false, reason: "placeholder", width, height, bytes: b.length,
                 why: "map art is a " + width + "\u00d7" + height + " placeholder \u2014 geometry only" };
    }
    return { usable: true, reason: "ok", why: "", width, height, bytes: b.length };
}
