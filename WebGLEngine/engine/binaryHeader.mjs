// engine/binaryHeader.mjs -- v4228
//
// ONE PLACE THAT KNOWS HOW A VERSIONED HEADER WORKS, because six of this tree's own binary formats each grew
// a magic and none of them grew a version, and six independent fixes would have been six chances to disagree.
//
// *** WHAT WAS MEASURED, BEFORE ANY OF THIS WAS WRITTEN ***
// engine/wndFormat.js, mtoFormat.js, molFormat.js, ovmFormat.js, p3dFormat.js and vxFormat.js each write a
// 4-byte magic at offset 0, CHECK it on read, and then go straight to the payload. Every one of them carries a
// "// VERSION: v1 -- round NNN" line at the top of the SOURCE. That is a comment in the reader, not a byte in
// the file: it travels with whoever has the code and never with the data. So a writer that changed a layout
// would keep the same magic, and today's reader would accept the file and misread it in silence -- which is
// strictly worse than refusing it, because a refusal names the problem and a misread invents a plausible
// number and hands it to a renderer.
//
// media/afContainer.mjs is the one that already does it right -- u32 magic | u32 version | ... and unpack()
// throws by name when the version is not the reader's own -- and it is the model this file generalises.
//
// *** THE SCHEME, AND WHY IT CANNOT ORPHAN A FILE THAT ALREADY EXISTS ***
// A versioned file is:   u32 magic | u32 version | <exactly the body that used to follow the old magic>
// The magic is bumped ONCE, by replacing the trailing "!" with "2" -- "WND!" becomes "WND2" -- so that the
// presence of a version field is decidable from the first four bytes and stays readable in a hex dump. After
// this one bump the magic never moves again: a future layout change bumps the VERSION, which is the entire
// point of having one.
//
// A reader accepts BOTH. The old magic means "written before there was a version", is reported as version 0,
// and is read with the old body offset. Nothing that exists stops being readable.
//
// *** AND THAT LEGACY PATH IS NOT CEREMONY, THOUGH IT NEARLY WAS. *** Checked rather than assumed: every one
// of these six formats is written ONLY from inside this tree (wndDemo, mtoDemo, molDemo, ovmGenerator and
// ovmDemo, p3dDemo, flowDemo), the Python pipelines their headers describe -- NetCDF4/scipy, SimpleITK plus a
// 3D U-Net, AtomicFieldProcessor, TRELLIS-2, Pixal3D -- are nowhere in this repository, and the only file of
// any of these types on disk is media/stage.af, which is the format that was already versioned. So the
// legacy path protects nothing IN the tree. It is kept for the file somebody exported from a demo page last
// month and still has, because that file silently misreading is the exact failure this round exists to stop,
// and a round that inflicted its own failure mode while fixing it would be a poor argument.

/** Thrown when a file cannot be read: wrong magic, or a version this reader does not speak. */
export class FormatHeaderError extends Error {
    constructor(message, detail) { super(message); this.name = "FormatHeaderError"; Object.assign(this, detail || {}); }
}

/** Bytes a versioned header occupies: the magic and the version. */
export const VERSIONED_HEADER_BYTES = 8;

/** "WND!" -> "WND2": the one-time bump that says "there is a version field after this". */
export function versionedMagic(legacyMagic) {
    return ((legacyMagic & 0x00ffffff) | (0x32 << 24)) >>> 0;
}

/** A magic as the four ASCII characters it is, for an error a person can act on. */
export function magicText(m) {
    let s = "";
    for (let i = 0; i < 4; i++) {
        const c = (m >>> (i * 8)) & 0xff;
        s += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : ".";
    }
    return s;
}

/**
 * Write `u32 magic | u32 version` at offset 0. Returns the offset the body starts at.
 * @param {DataView} dv
 * @param {number} legacyMagic the format's original magic; the versioned one is derived, never passed in twice
 * @param {number} version
 */
export function writeVersionedHeader(dv, legacyMagic, version) {
    if (!Number.isInteger(version) || version < 1) throw new FormatHeaderError("writeVersionedHeader: version must be an integer >= 1, got " + version);
    dv.setUint32(0, versionedMagic(legacyMagic), true);
    dv.setUint32(4, version >>> 0, true);
    return VERSIONED_HEADER_BYTES;
}

/**
 * Read a header that may or may not carry a version, and REFUSE what this reader cannot speak.
 *
 * @param {DataView} dv
 * @param {{name:string, legacyMagic:number, current:number, legacyBodyOffset:number}} spec
 * @returns {{version:number, bodyOffset:number, legacy:boolean}} version 0 means "written before versioning"
 */
export function readVersionedHeader(dv, spec) {
    const { name, legacyMagic, current, legacyBodyOffset } = spec;
    const versioned = versionedMagic(legacyMagic);
    if (dv.byteLength < 4) {
        throw new FormatHeaderError(`${name}: buffer too small to hold a magic (${dv.byteLength} bytes)`, { format: name });
    }
    const magic = dv.getUint32(0, true);

    if (magic === legacyMagic) {
        // Pre-versioning. Readable, and reported AS legacy rather than quietly relabelled version 1 -- a caller
        // that wants to know whether a file carries its own version must be able to find out.
        return { version: 0, bodyOffset: legacyBodyOffset, legacy: true };
    }
    if (magic !== versioned) {
        throw new FormatHeaderError(
            `${name}: magic mismatch (got 0x${magic.toString(16)} "${magicText(magic)}", expected ` +
            `0x${versioned.toString(16)} "${magicText(versioned)}" or the pre-version 0x${legacyMagic.toString(16)} "${magicText(legacyMagic)}")`,
            { format: name, magic });
    }
    if (dv.byteLength < VERSIONED_HEADER_BYTES) {
        throw new FormatHeaderError(`${name}: truncated before the version field (${dv.byteLength} bytes)`, { format: name });
    }
    const version = dv.getUint32(4, true);
    if (version < 1) {
        throw new FormatHeaderError(`${name}: version 0 in a versioned file, which is not a version`, { format: name, version });
    }
    // *** THE WHOLE POINT. *** A FUTURE version is refused BY NAME rather than read with today's layout. The
    // comparison is one-sided on purpose: a reader can always read what it already knows, and can never know
    // what a later writer decided to add.
    if (version > current) {
        throw new FormatHeaderError(
            `${name}: file is version ${version} and this reader speaks version ${current} -- refusing rather ` +
            `than reading a layout it does not know`,
            { format: name, version, reader: current });
    }
    return { version, bodyOffset: VERSIONED_HEADER_BYTES, legacy: false };
}
