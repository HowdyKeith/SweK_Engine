// demos_code/bitcoin_miner.js — engine-integrated wrapper for the
// cross-runtime BitcoinMinerDemo (which also lives standalone at
// /extras/BitcoinMinerDemo/bitcoin_miner.html in the archive).
//
// Mines synthetic Bitcoin-style block headers using real double-SHA-256.
// At difficulty=3 (leading-zero nibbles) the JS implementation finds
// a block roughly every few seconds at hash rates of 100k-500k H/s.
//
// VBA reference: VBAOpenGL_Demos_v2_67.xlsm has the same SHA-256 +
// BitcoinMinerSim — the engine xlsm uses identical algorithm and
// produces byte-identical hashes for the same nonce. The portfolio
// piece is the 10^3 performance gap between identical math in
// different runtimes (VBA ~150 H/s, JS ~100k H/s, ASIC ~10^14 H/s).
//
// Engine integration: when a block is found, spawn a "coin" entity in
// the 3D world at a random location near the camera. The found-block
// event becomes a visible thing IN the world, not just a stat.

const TARGET_DIFFICULTY = 3;    // leading-zero hex nibbles
const HASHES_PER_FRAME  = 600;  // tuned so the panel ticks visibly

// ---- SHA-256 (minimal, self-contained, matches BitcoinMinerDemo) ----
const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

function sha256(bytes) {
    const len = bytes.length;
    const bits = len * 8;
    // pad to 512-bit multiples
    const padLen = ((len + 9 + 63) & ~63);
    const padded = new Uint8Array(padLen);
    padded.set(bytes);
    padded[len] = 0x80;
    // big-endian length in bits
    padded[padLen - 4] = (bits >>> 24) & 0xff;
    padded[padLen - 3] = (bits >>> 16) & 0xff;
    padded[padLen - 2] = (bits >>>  8) & 0xff;
    padded[padLen - 1] = bits & 0xff;

    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a;
    let h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const W = new Uint32Array(64);

    for (let block = 0; block < padLen; block += 64) {
        for (let i = 0; i < 16; i++) {
            const o = block + i * 4;
            W[i] = ((padded[o]<<24)|(padded[o+1]<<16)|(padded[o+2]<<8)|padded[o+3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(W[i-15],7) ^ rotr(W[i-15],18) ^ (W[i-15]>>>3);
            const s1 = rotr(W[i-2],17) ^ rotr(W[i-2],19)  ^ (W[i-2]>>>10);
            W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
        }
        let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
            const ch = (e & f) ^ ((~e) & g);
            const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
            const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
            const mj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + mj) >>> 0;
            h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
        }
        h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
        h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
    }
    const out = new Uint8Array(32);
    const hs = [h0,h1,h2,h3,h4,h5,h6,h7];
    for (let i = 0; i < 8; i++) {
        out[i*4]   = (hs[i]>>>24) & 0xff;
        out[i*4+1] = (hs[i]>>>16) & 0xff;
        out[i*4+2] = (hs[i]>>>8)  & 0xff;
        out[i*4+3] = hs[i] & 0xff;
    }
    return out;
}

function bytesToHex(b) {
    let s = "";
    for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
    return s;
}

function leadingZeroNibbles(hashBytes) {
    let count = 0;
    for (let i = 0; i < hashBytes.length; i++) {
        const b = hashBytes[i];
        if (b === 0) { count += 2; continue; }
        if ((b & 0xf0) === 0) { count += 1; break; }
        break;
    }
    return count;
}

// ---- demo state ----
let overlay = null;
let panel = null;
let header = null;
let nonce = 0;
let totalHashes = 0;
let blocksFound = 0;
let lastFoundHash = "—";
let lastFoundNonce = 0;
let lastFoundAt = 0;
let lastRateTime = 0;
let hashesSinceLastRate = 0;
let currentRate = 0;
let recentHashes = [];   // ring of last 8
let elapsed = 0;
let coinEntities = [];   // entities spawned per block found
let workBuf = null;

function newHeader() {
    const h = new Uint8Array(80);
    // version 1 (LE)
    h[0] = 1;
    // prev block hash + merkle root + timestamp + bits: pseudo-random but
    // deterministic per session
    let seed = (Date.now() & 0xffff) | 0x10000;
    for (let i = 4; i < 76; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        h[i] = (seed >>> 8) & 0xff;
    }
    // nonce 76..79 zeroed
    return h;
}

function tryNonce() {
    workBuf[76] = nonce & 0xff;
    workBuf[77] = (nonce >>> 8) & 0xff;
    workBuf[78] = (nonce >>> 16) & 0xff;
    workBuf[79] = (nonce >>> 24) & 0xff;
    const h1 = sha256(workBuf);
    const h2 = sha256(h1);
    totalHashes++;
    hashesSinceLastRate++;
    return h2;
}

function spawnCoin(ctx, label) {
    // Pick a random spawn location within 25u of camera
    const cam = ctx.camera;
    let cx = 0, cy = 35, cz = 0;
    try {
        cx = cam?.position?.x ?? 0;
        cy = cam?.position?.y ?? 35;
        cz = cam?.position?.z ?? 0;
    } catch {}
    const a = ctx.rand() * Math.PI * 2;
    const r = 8 + ctx.rand() * 17;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const y = cy + 2 + ctx.rand() * 5;
    // portal_holy reads as a glowing gold coin (white-gold tint, blooms)
    const id = ctx.spawnMesh?.("portal_holy", x, y, z, 1.8);
    if (id != null) {
        coinEntities.push({ id, spawnedAt: elapsed });
    }
}

function renderPanel() {
    if (!panel) return;
    const hashesLine = recentHashes.map((h, i) => {
        const fade = 1 - (i / recentHashes.length);
        const opacity = 0.30 + fade * 0.70;
        return `<div style="opacity:${opacity.toFixed(2)};color:#9fd;font-size:10px">${h}</div>`;
    }).join("");
    const rateStr = currentRate < 1000
        ? currentRate.toFixed(0) + " H/s"
        : currentRate < 1000000
        ? (currentRate / 1000).toFixed(1) + " kH/s"
        : (currentRate / 1000000).toFixed(2) + " MH/s";
    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            ⛏  BITCOIN MINER
        </div>
        <div style="font-size:11px;color:#9fd;line-height:1.5">
            Hash rate:  <b style="color:#0fa">${rateStr}</b><br/>
            Total:      <b>${totalHashes.toLocaleString()}</b><br/>
            Blocks:     <b style="color:#fd0">${blocksFound}</b><br/>
            Difficulty: ${TARGET_DIFFICULTY} leading zeros<br/>
        </div>
        <div style="margin-top:8px;font-family:monospace;font-size:9px;line-height:1.3">
            ${hashesLine}
        </div>`;
}

export default {
    id:    "bitcoin_miner",
    label: "BITCOIN MINER (CROSS-RUNTIME PORT)",
    hint:  "Real SHA-256 mining — VBA BitcoinMinerSim ported, byte-identical hashes",
    controls: [
        `Auto — mines at difficulty ${TARGET_DIFFICULTY} (~few seconds per block)`,
        "Found blocks spawn a coin entity in the 3D world",
        "Compare with extras/BitcoinMinerDemo/ — same algorithm in 3 runtimes",
    ],

    start(ctx) {
        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "left:20px",
            "top:140px",
            "width:280px",
            "background:rgba(4,12,20,0.88)",
            "border:1px solid #066",
            "border-radius:4px",
            "box-shadow:0 0 16px rgba(0,200,100,0.25), inset 0 0 16px rgba(0,80,40,0.15)",
            "padding:12px 14px",
            "color:#0fa",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);

        header = newHeader();
        workBuf = new Uint8Array(80);
        workBuf.set(header);
        nonce = 0;
        totalHashes = 0;
        blocksFound = 0;
        lastFoundHash = "—";
        lastFoundNonce = 0;
        recentHashes = [];
        elapsed = 0;
        lastRateTime = 0;
        hashesSinceLastRate = 0;
        currentRate = 0;
        coinEntities = [];

        renderPanel();
        ctx.kpop?.info?.("Bitcoin Miner", `Mining at difficulty ${TARGET_DIFFICULTY}`);
        console.log("[bitcoin_miner] started");
    },

    tick(ctx, dt) {
        if (!workBuf) return;
        elapsed += dt;

        // Hash a batch of nonces this frame
        let foundThisFrame = false;
        for (let i = 0; i < HASHES_PER_FRAME; i++) {
            const hash = tryNonce();
            const zeros = leadingZeroNibbles(hash);
            if (zeros >= TARGET_DIFFICULTY) {
                const hex = bytesToHex(hash);
                lastFoundHash = hex;
                lastFoundNonce = nonce;
                blocksFound++;
                lastFoundAt = elapsed;
                foundThisFrame = true;
                recentHashes.unshift("★ " + hex.slice(0, 32) + "…");
                ctx.kpop?.info?.("Block found!", `nonce=${nonce} (${blocksFound} total)`);
                spawnCoin(ctx, hex);
                // Re-seed header so the next block has different work
                header = newHeader();
                workBuf.set(header);
                nonce = -1;
            } else if (i === HASHES_PER_FRAME - 1 || (i & 0x3f) === 0) {
                // Occasionally show a non-block hash so the waterfall scrolls
                if (recentHashes.length < 8) {
                    recentHashes.unshift(bytesToHex(hash).slice(0, 32) + "…");
                }
            }
            nonce++;
        }
        // Trim ring
        if (recentHashes.length > 8) recentHashes.length = 8;

        // Update rate every 0.5s
        if (elapsed - lastRateTime >= 0.5) {
            const span = elapsed - lastRateTime;
            const inst = hashesSinceLastRate / span;
            currentRate = currentRate > 0 ? (currentRate * 0.6 + inst * 0.4) : inst;
            lastRateTime = elapsed;
            hashesSinceLastRate = 0;
        }

        renderPanel();

        // Despawn old coins after 30 seconds
        const cutoff = elapsed - 30;
        const survivors = [];
        for (const c of coinEntities) {
            if (c.spawnedAt < cutoff) {
                ctx.despawnEntity?.(c.id);
            } else {
                survivors.push(c);
            }
        }
        coinEntities = survivors;
    },

    stop(ctx) {
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null;
        for (const c of coinEntities) ctx.despawnEntity?.(c.id);
        coinEntities = [];
        workBuf = null; header = null;
        console.log(`[bitcoin_miner] stopped — total ${totalHashes} hashes, ${blocksFound} blocks`);
    },
};
