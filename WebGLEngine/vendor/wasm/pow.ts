// pow.ts — SHA-256d (double SHA-256) proof-of-work miner, compiled to pow.wasm.
// mine(prefixLen, difficultyBits, startNonce, maxTries): the caller writes a byte prefix at memory
// offset 0; we append an 8-byte little-endian nonce, double-SHA the (prefix+nonce), and check whether
// the digest has `difficultyBits` leading zero bits. Returns the winning nonce (>=0) or -1 if none in
// the tried range. Digest of the winner is left at digestPtr(). This is real SHA-256 (FIPS 180-4) — the
// same core as sha256.wasm — so results cross-check against Node crypto / the VBA+JS+Python demos.

const INPUT_OFF: usize = 0x10000;      // 64KB in — clear of AS static data      // prefix bytes + appended nonce live here
const DIGEST: usize = 0x20000;    // first-hash digest
const DIGEST2: usize = 0x20040;   // final (second) digest
const HASHED_COUNT_OFF: usize = 0x20100; // how many hashes we did (u32) — for hashrate

const K: u32[] = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
];

// @ts-ignore: decorator
@inline function rotr(x: u32, n: u32): u32 { return (x >>> n) | (x << (32 - n)); }

const w = new StaticArray<u32>(64);

// SHA-256 of `len` bytes at `inOff`, digest (32 bytes) written to `outOff`.
function sha256(inOff: usize, len: i32, outOff: usize): void {
  let h0: u32=0x6a09e667,h1: u32=0xbb67ae85,h2: u32=0x3c6ef372,h3: u32=0xa54ff53a;
  let h4: u32=0x510e527f,h5: u32=0x9b05688c,h6: u32=0x1f83d9ab,h7: u32=0x5be0cd19;
  const bitLen: u64 = (<u64>len) * 8;
  let padded = len + 1; while ((padded % 64) != 56) padded++;
  const total = padded + 8;
  store<u8>(inOff + <usize>len, 0x80);
  for (let i = len + 1; i < padded; i++) store<u8>(inOff + <usize>i, 0);
  for (let i = 0; i < 8; i++) store<u8>(inOff + <usize>(padded + i), <u8>((bitLen >>> ((7 - i) * 8)) & 0xff));
  for (let off = 0; off < total; off += 64) {
    for (let t = 0; t < 16; t++) {
      const b = inOff + <usize>(off + t * 4);
      unchecked(w[t] = (<u32>load<u8>(b) << 24) | (<u32>load<u8>(b+1) << 16) | (<u32>load<u8>(b+2) << 8) | (<u32>load<u8>(b+3)));
    }
    for (let t = 16; t < 64; t++) {
      const a15 = unchecked(w[t-15]), a2 = unchecked(w[t-2]);
      const s0 = rotr(a15,7) ^ rotr(a15,18) ^ (a15 >>> 3);
      const s1 = rotr(a2,17) ^ rotr(a2,19) ^ (a2 >>> 10);
      unchecked(w[t] = unchecked(w[t-16]) + s0 + unchecked(w[t-7]) + s1);
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,hh=h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = hh + S1 + ch + unchecked(K[t]) + unchecked(w[t]);
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = S0 + maj;
      hh=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
    }
    h0+=a;h1+=b;h2+=c;h3+=d;h4+=e;h5+=f;h6+=g;h7+=hh;
  }
  const hs = [h0,h1,h2,h3,h4,h5,h6,h7];
  for (let i = 0; i < 8; i++) {
    const v = hs[i];
    store<u8>(outOff + <usize>(i*4),   <u8>((v>>>24)&0xff));
    store<u8>(outOff + <usize>(i*4+1), <u8>((v>>>16)&0xff));
    store<u8>(outOff + <usize>(i*4+2), <u8>((v>>>8)&0xff));
    store<u8>(outOff + <usize>(i*4+3), <u8>(v&0xff));
  }
}

export function digestPtr(): usize { return DIGEST2; }
export function hashedPtr(): usize { return HASHED_COUNT_OFF; }

// @ts-ignore: decorator
@inline function leadingZeroBits(off: usize): i32 {
  let bits = 0;
  for (let i = 0; i < 32; i++) {
    const byte = load<u8>(off + <usize>i);
    if (byte == 0) { bits += 8; continue; }
    let b = <i32>byte, c = 0;
    while ((b & 0x80) == 0) { c++; b <<= 1; }
    bits += c; break;
  }
  return bits;
}

// Grind nonces. prefix bytes are already at INPUT_OFF (length prefixLen). We append an 8-byte LE nonce.
export function mine(prefixLen: i32, difficultyBits: i32, startNonce: i32, maxTries: i32): i32 {
  let tries = 0;
  let nonce = startNonce;
  while (tries < maxTries) {
    // write 8-byte little-endian nonce after the prefix
    let n = <u64>(<u32>nonce);
    for (let i = 0; i < 8; i++) { store<u8>(INPUT_OFF + <usize>(prefixLen + i), <u8>((n >>> (i * 8)) & 0xff)); }
    const msgLen = prefixLen + 8;
    sha256(INPUT_OFF, msgLen, DIGEST);   // first hash (this pads INPUT_OFF in place, but past msgLen — fine, we rewrite the nonce each round and re-pad)
    sha256(DIGEST, 32, DIGEST2);         // second hash
    tries++;
    if (leadingZeroBits(DIGEST2) >= difficultyBits) {
      store<u32>(HASHED_COUNT_OFF, <u32>tries);
      return nonce;
    }
    nonce++;
  }
  store<u32>(HASHED_COUNT_OFF, <u32>tries);
  return -1;
}
