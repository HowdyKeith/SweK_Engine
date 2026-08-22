// WebGLEngine/ev/snd.js — Mac 'snd ' resource decoder (System 7 sampled sound),
// a clean-room port of TheDiamondProject/Graphite libGraphite/resources/sound.cpp
// (MIT). EV Nova stores sound effects (weapon fire, explosions, UI) as 'snd '
// resources. This decodes the common forms — standard/extended headers (8- or
// 16-bit PCM) and IMA4-compressed (cmpSH) — into { sampleRate, channels, pcm:
// Float32Array } ready for WebAudio.
//
//   import { decodeSND } from "./snd.js";
//   const s = decodeSND(bytes);   // bytes = Uint8Array of the 'snd ' resource
//   if (s.ok) { /* build an AudioBuffer from s.pcm at s.sampleRate */ }

const FMT = { type1: 1, type2: 2 };
const CMD_BUFFER = 81;
const ENC = { stdSH: 0x00, extSH: 0xFF, cmpSH: 0xFE };

// IMA ADPCM tables
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const IMA_STEP = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
    253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
    1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
    3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
    11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
    32767,
];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function decodeSND(bytes) {
    if (!bytes || bytes.byteLength < 20) return { error: "snd too short" };
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 0;
    const u16 = () => { const v = dv.getUint16(p, false); p += 2; return v; };
    const i16 = () => { const v = dv.getInt16(p, false); p += 2; return v; };
    const u32 = () => { const v = dv.getUint32(p, false); p += 4; return v; };
    const u8 = () => bytes[p++];

    try {
        const format = u16();
        if (format === FMT.type1) {
            const numDataFormats = u16();
            if (numDataFormats !== 1) return { error: "snd: unsupported (multi data formats)" };
            u16();          // data format id (sampledSynth = 5)
            u32();          // channel init option
        } else if (format === FMT.type2) {
            u16();          // ref count
        } else {
            return { error: "snd: unknown format " + format };
        }

        const numCommands = u16();
        let bufferOffset = -1;
        for (let i = 0; i < numCommands; i++) {
            const cmd = u16() & 0x7FFF;
            u16();                 // param1
            const param2 = u32();  // param2 (data offset for buffer cmd)
            if (cmd === CMD_BUFFER && bufferOffset < 0) bufferOffset = param2;
        }
        if (bufferOffset < 0) return { error: "snd: no buffer command" };

        // Jump to the sound header (offset is from the record start = byte 0 here)
        p = bufferOffset;
        u32();                     // data pointer (unused for sampled)
        const length = u32();      // for std: #samples; also = channel count in ext/cmp
        const sampleRateFixed = u32();
        u32();                     // loop start
        u32();                     // loop end
        const encoding = u8();
        u8();                      // base frequency
        const sampleRate = sampleRateFixed >> 16;

        if (encoding === ENC.stdSH) {
            // Standard: `length` 8-bit unsigned PCM samples, mono
            const n = length;
            const pcm = new Float32Array(n);
            for (let i = 0; i < n && p < bytes.byteLength; i++) pcm[i] = (bytes[p++] - 128) / 128;
            return { ok: true, sampleRate: sampleRate || 22050, channels: 1, pcm, encoding: "std8" };
        }

        if (encoding === ENC.extSH) {
            const numFrames = u32();
            p += 22;               // aiff rate(10) + markerChunk(4) + instrChunks(4) + aesRec(4)
            const sampleSize = u16();
            p += 14;               // future use
            const channels = length || 1;
            const total = numFrames * channels;
            const pcm = new Float32Array(total);
            let o = 0;
            for (let f = 0; f < numFrames; f++) {
                for (let c = 0; c < channels; c++) {
                    if (sampleSize === 8) pcm[o++] = (bytes[p++] - 128) / 128;
                    else { pcm[o++] = dv.getInt16(p, false) / 32768; p += 2; }
                }
            }
            return { ok: true, sampleRate: sampleRate || 22050, channels, pcm, encoding: "ext" + sampleSize };
        }

        if (encoding === ENC.cmpSH) {
            const numFrames = u32();
            p += 14;               // aiff rate(10) + markerChunk(4)
            const compFormat = u32();
            p += 12;               // future_use_2(4) + state_vars(4) + leftover(4)
            const compressionId = dv.getInt16(p, false); p += 2;
            u16();                 // packet size
            p += 2;                // snth id
            u16();                 // sample size
            // Only fixed IMA4 (format 'ima4' = 0x696D6134)
            if (compFormat !== 0x696D6134) return { error: "snd: unsupported compression 0x" + compFormat.toString(16) };
            const channels = length || 1;
            const out = new Float32Array(numFrames * 64 * channels);
            let o = 0;
            // Each frame: per channel, a 2-byte preamble + 32 bytes (64 nibbles) = 64 samples
            for (let f = 0; f < numFrames; f++) {
                for (let c = 0; c < channels; c++) {
                    if (p + 34 > bytes.byteLength) break;
                    const preamble = dv.getUint16(p, false); p += 2;
                    let predictor = (preamble & 0xFF80) << 16 >> 16;   // sign-extend top 9 bits
                    let index = preamble & 0x007F;
                    for (let i = 0; i < 32; i++) {
                        const byte = bytes[p++];
                        for (const nibble of [byte & 0x0F, byte >> 4]) {
                            const step = IMA_STEP[index];
                            let diff = step >> 3;
                            if (nibble & 4) diff += step;
                            if (nibble & 2) diff += step >> 1;
                            if (nibble & 1) diff += step >> 2;
                            if (nibble & 8) diff = -diff;
                            predictor = clamp(predictor + diff, -32768, 32767);
                            index = clamp(index + IMA_INDEX[nibble], 0, 88);
                            out[o + (c)] = predictor / 32768;
                            o += channels;   // interleaved; will fix below for mono
                        }
                    }
                }
            }
            // (For mono, channels=1 so interleave math above is a plain sequence.)
            return { ok: true, sampleRate: sampleRate || 22050, channels, pcm: out, encoding: "ima4" };
        }

        return { error: "snd: unknown encoding 0x" + encoding.toString(16) };
    } catch (e) {
        return { error: "snd decode threw: " + e.message };
    }
}

// Build a WebAudio AudioBuffer from a decoded snd (needs an AudioContext).
function sndToAudioBuffer(ctx, dec) {
    if (!dec || !dec.ok) return null;
    const ch = Math.max(1, dec.channels || 1);
    const frames = Math.floor(dec.pcm.length / ch);
    const buf = ctx.createBuffer(ch, frames, dec.sampleRate);
    for (let c = 0; c < ch; c++) {
        const out = buf.getChannelData(c);
        for (let i = 0; i < frames; i++) out[i] = dec.pcm[i * ch + c];
    }
    return buf;
}

export { decodeSND, sndToAudioBuffer };
