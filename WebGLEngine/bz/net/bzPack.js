// WebGLEngine/bz/net/bzPack.js — BZFlag's wire, one integer at a time.
//
// Round eleven. Everything else in this port could be checked against a `.bzw` file on disk. A protocol
// cannot: it is checked against a server that is not here. So the only honest way to build it is to
// transcribe the packing rules exactly, assert the exact bytes they must produce, and say clearly which
// parts have been spoken to a real `bzfs` and which have not.
//
// From src/net/Pack.cxx (2.4 branch). Everything is NETWORK BYTE ORDER -- `htons` and `htonl`, which is
// big-endian -- and a float is its IEEE-754 bits sent as a big-endian uint32. There is no alignment and no
// padding: a message is its fields, back to back.
//
// A string field is FIXED WIDTH and NUL-padded, not length-prefixed. `sendEnter` memcpy's a callsign into a
// 32-byte hole and moves the cursor 32 bytes whatever the name's length. Read one back and you must stop at
// the first NUL yourself.

"use strict";

// --- writing ------------------------------------------------------------------------------------------
class Writer {
    constructor(size) { this.buf = new Uint8Array(size || 1024); this.view = new DataView(this.buf.buffer); this.at = 0; }
    _room(n) { if (this.at + n > this.buf.length) throw new RangeError("bz packet overrun"); }
    u8(v) { this._room(1); this.view.setUint8(this.at, v & 0xff); this.at += 1; return this; }
    i8(v) { this._room(1); this.view.setInt8(this.at, v); this.at += 1; return this; }
    u16(v) { this._room(2); this.view.setUint16(this.at, v & 0xffff, false); this.at += 2; return this; }
    i16(v) { this._room(2); this.view.setInt16(this.at, v, false); this.at += 2; return this; }
    u32(v) { this._room(4); this.view.setUint32(this.at, v >>> 0, false); this.at += 4; return this; }
    i32(v) { this._room(4); this.view.setInt32(this.at, v | 0, false); this.at += 4; return this; }
    f32(v) { this._room(4); this.view.setFloat32(this.at, v, false); this.at += 4; return this; }
    vec(v) { this.f32(v[0]); this.f32(v[1]); this.f32(v[2]); return this; }
    // A fixed-width, NUL-padded field. Truncated if too long, exactly as a memcpy into a short buffer is.
    str(s, width) {
        this._room(width);
        const bytes = new TextEncoder().encode(String(s || ""));
        for (let i = 0; i < width; i++) this.buf[this.at + i] = i < bytes.length ? bytes[i] : 0;
        this.at += width;
        return this;
    }
    raw(bytes) { this._room(bytes.length); this.buf.set(bytes, this.at); this.at += bytes.length; return this; }
    bytes() { return this.buf.subarray(0, this.at); }
}

// --- reading ------------------------------------------------------------------------------------------
class Reader {
    constructor(bytes, at) { this.buf = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.at = at || 0; }
    get left() { return this.buf.length - this.at; }
    _need(n) { if (this.left < n) throw new RangeError("bz packet underrun"); }
    u8() { this._need(1); const v = this.view.getUint8(this.at); this.at += 1; return v; }
    i8() { this._need(1); const v = this.view.getInt8(this.at); this.at += 1; return v; }
    u16() { this._need(2); const v = this.view.getUint16(this.at, false); this.at += 2; return v; }
    i16() { this._need(2); const v = this.view.getInt16(this.at, false); this.at += 2; return v; }
    u32() { this._need(4); const v = this.view.getUint32(this.at, false); this.at += 4; return v; }
    i32() { this._need(4); const v = this.view.getInt32(this.at, false); this.at += 4; return v; }
    f32() { this._need(4); const v = this.view.getFloat32(this.at, false); this.at += 4; return v; }
    vec() { return [this.f32(), this.f32(), this.f32()]; }
    // Stop at the first NUL. The rest of the field is padding, and it is not part of the name.
    str(width) {
        this._need(width);
        let end = this.at;
        while (end < this.at + width && this.buf[end] !== 0) end++;
        const s = new TextDecoder().decode(this.buf.subarray(this.at, end));
        this.at += width;
        return s;
    }
    raw(n) { this._need(n); const s = this.buf.subarray(this.at, this.at + n); this.at += n; return s; }
}

export { Writer, Reader };
if (typeof module !== "undefined" && module.exports) module.exports = { Writer, Reader };
