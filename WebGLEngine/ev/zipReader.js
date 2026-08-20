// WebGLEngine/ev/zipReader.js — a tiny, dependency-free ZIP reader for the browser.
// Reads the ZIP central directory and inflates entries using the browser's native
// DecompressionStream('deflate-raw'). No CDN, no library, nothing written to disk —
// everything happens in memory, so there is no temp folder to clean up.
//
//   import { readZip } from "./zipReader.js";
//   const entries = await readZip(uint8);   // [{ name, bytes:Uint8Array }, ...]
//
// Supports store (method 0) and deflate (method 8), which is what real EV data
// zips use. Zip64 and encryption are not supported (EV data doesn't need them).

const EOCD_SIG = 0x06054b50;   // End Of Central Directory
const CEN_SIG  = 0x02014b50;   // Central directory file header
const LOC_SIG  = 0x04034b50;   // Local file header

function findEOCD(dv, len) {
    // EOCD is at the end; scan backwards (comment can be up to 65535 bytes).
    const maxBack = Math.min(len, 65557);
    for (let i = len - 22; i >= len - maxBack; i--) {
        if (i < 0) break;
        if (dv.getUint32(i, true) === EOCD_SIG) return i;
    }
    return -1;
}

async function inflateRaw(bytes) {
    // Use the platform DecompressionStream for raw deflate.
    if (typeof DecompressionStream === "undefined") {
        throw new Error("DecompressionStream unavailable — update your browser to load zips");
    }
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Response(bytes).body.pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
}

// Read a ZIP archive (Uint8Array) → array of { name, bytes }.
async function readZip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const len = u8.byteLength;
    const eocd = findEOCD(dv, len);
    if (eocd < 0) throw new Error("not a zip (no end-of-central-directory record)");
    const count = dv.getUint16(eocd + 10, true);
    let cdOff = dv.getUint32(eocd + 16, true);

    const out = [];
    for (let n = 0; n < count; n++) {
        if (dv.getUint32(cdOff, true) !== CEN_SIG) break;
        const method   = dv.getUint16(cdOff + 10, true);
        const compSize = dv.getUint32(cdOff + 20, true);
        const nameLen  = dv.getUint16(cdOff + 28, true);
        const extraLen = dv.getUint16(cdOff + 30, true);
        const commLen  = dv.getUint16(cdOff + 32, true);
        const locOff   = dv.getUint32(cdOff + 42, true);
        const name = new TextDecoder().decode(u8.subarray(cdOff + 46, cdOff + 46 + nameLen));
        cdOff += 46 + nameLen + extraLen + commLen;

        // Jump to the local header to find the actual data start (its name/extra
        // lengths can differ from the central directory's).
        if (dv.getUint32(locOff, true) !== LOC_SIG) continue;
        const lNameLen  = dv.getUint16(locOff + 26, true);
        const lExtraLen = dv.getUint16(locOff + 28, true);
        const dataStart = locOff + 30 + lNameLen + lExtraLen;
        const comp = u8.subarray(dataStart, dataStart + compSize);

        if (name.endsWith("/")) continue;   // directory entry
        let bytes;
        if (method === 0) bytes = comp.slice();           // stored
        else if (method === 8) bytes = await inflateRaw(comp);   // deflate
        else continue;                                     // unsupported method
        out.push({ name, bytes });
    }
    return out;
}

export { readZip };
