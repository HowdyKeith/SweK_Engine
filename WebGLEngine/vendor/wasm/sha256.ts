// sha256.ts — SHA-256 (FIPS 180-4) in AssemblyScript, compiled to a portable .wasm.
// The whole point of this module: the SAME .wasm binary runs byte-identically on every
// box (Windows / Intel Mac / peers) via the bridge's own Node WebAssembly — no Docker,
// no per-OS binary. Cross-verifiable against Node crypto / the existing VBA+JS+Python demos.
//
// ABI: the host writes the input bytes into wasm linear memory starting at offset 0, calls
// hash(len), and the 32-byte digest is written to offset `digestPtr()` (also in memory).

const K: u32[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

// Reserve a fixed digest region high in the (small) memory. Input lives at 0..len.
const DIGEST: usize = 0x8000; // 32KB in — clear of demo inputs, within 1 page fallback + headroom

// @ts-ignore: decorator
@inline function rotr(x: u32, n: u32): u32 { return (x >>> n) | (x << (32 - n)); }

export function digestPtr(): usize { return DIGEST; }

// Hash `len` bytes already written to memory offset 0; write 32-byte digest to DIGEST. Returns DIGEST.
export function hash(len: i32): usize {
  let h0: u32 = 0x6a09e667, h1: u32 = 0xbb67ae85, h2: u32 = 0x3c6ef372, h3: u32 = 0xa54ff53a;
  let h4: u32 = 0x510e527f, h5: u32 = 0x9b05688c, h6: u32 = 0x1f83d9ab, h7: u32 = 0x5be0cd19;

  // Build the padded message length: original + 0x80 + zeros + 64-bit bit-length, to a 64-byte multiple.
  const bitLen: u64 = (<u64>len) * 8;
  let padded = len + 1;                 // 0x80
  while ((padded % 64) != 56) padded++; // pad with zeros until 56 mod 64
  const total = padded + 8;             // + 8-byte length

  // Write padding directly after the input in memory.
  store<u8>(len, 0x80);
  for (let i = len + 1; i < padded; i++) store<u8>(i, 0);
  // 64-bit big-endian bit length in the final 8 bytes
  for (let i = 0; i < 8; i++) store<u8>(padded + i, <u8>((bitLen >>> ((7 - i) * 8)) & 0xff));

  const w = new StaticArray<u32>(64);

  for (let off = 0; off < total; off += 64) {
    // load 16 big-endian words
    for (let t = 0; t < 16; t++) {
      const b = off + t * 4;
      w[t] = (<u32>load<u8>(b) << 24) | (<u32>load<u8>(b + 1) << 16) | (<u32>load<u8>(b + 2) << 8) | (<u32>load<u8>(b + 3));
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = w[t - 16] + s0 + w[t - 7] + s1;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = hh + S1 + ch + unchecked(K[t]) + w[t];
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = S0 + maj;
      hh = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
    }
    h0 += a; h1 += b; h2 += c; h3 += d; h4 += e; h5 += f; h6 += g; h7 += hh;
  }

  const hs = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i++) {
    const v = hs[i];
    store<u8>(DIGEST + i * 4, <u8>((v >>> 24) & 0xff));
    store<u8>(DIGEST + i * 4 + 1, <u8>((v >>> 16) & 0xff));
    store<u8>(DIGEST + i * 4 + 2, <u8>((v >>> 8) & 0xff));
    store<u8>(DIGEST + i * 4 + 3, <u8>(v & 0xff));
  }
  return DIGEST;
}
