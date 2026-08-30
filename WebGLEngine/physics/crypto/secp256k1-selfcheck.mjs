// physics/crypto/secp256k1-selfcheck.mjs -- the EC half of Bitcoin, against an implementation that is not mine
//
// Run: node physics/crypto/secp256k1-selfcheck.mjs   (fast -- BigInt arithmetic, no network, no GPU)
//
// GATES physics/crypto/secp256k1.mjs and physics/crypto/bitcoinAddress.mjs.
//
// *** THE ANSWER KEY IS OPENSSL, NOT A TABLE I TYPED. *** node's crypto exposes secp256k1 through OpenSSL,
// which is a completely independent implementation with a different internal representation. Every k*G below
// is computed twice -- once by this tree's windowed Jacobian ladder, once by OpenSSL -- and the two must
// agree to the digit. That is the roundhouse's own rule (two routes, one number) applied to a curve rather
// than to a fluid, and it is a stronger key than any fixture because nobody here wrote the other side.
//
// The ADDRESS vectors are external in a different way: 1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH is the published
// address for private key 1 and has been for as long as Bitcoin has existed.
"use strict";
import crypto from "node:crypto";
import * as S from "./secp256k1.mjs";
import * as A from "./bitcoinAddress.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + (d ? "   " + d : ""));

const HASHES = {
    sha256: (b) => new Uint8Array(crypto.createHash("sha256").update(b).digest()),
    ripemd160: (b) => new Uint8Array(crypto.createHash("ripemd160").update(b).digest()),
};
const hex32 = (v) => v.toString(16).padStart(64, "0");
/** OpenSSL's k*G, as {x,y} -- the independent route. */
function opensslPub(k) {
    const e = crypto.createECDH("secp256k1");
    e.setPrivateKey(Buffer.from(hex32(k), "hex"));
    const p = e.getPublicKey("hex");              // 04 || X || Y
    return { x: BigInt("0x" + p.slice(2, 66)), y: BigInt("0x" + p.slice(66)) };
}

console.log("secp256k1-selfcheck -- the half of Bitcoin this engine did not have\n");

console.log("1. THE CURVE PARAMETERS ARE THE PUBLISHED ONES, NOT NUMBERS THAT HAPPEN TO WORK");
{
    ok("!! p is the SEC 2 prime, 2^256 - 2^32 - 977",
        S.P === (2n ** 256n - 2n ** 32n - 977n),
        "derived from its own definition rather than compared to a second copy of the literal");
    ok("!! G lies on y^2 = x^3 + 7", S.onCurve({ x: S.Gx, y: S.Gy }));
    ok("!! ...and G is the generator OpenSSL uses, so the two agree about the curve before anything is computed",
        (() => { const o = opensslPub(1n); return o.x === S.Gx && o.y === S.Gy; })(),
        "1*G by OpenSSL == the Gx, Gy typed in this module");
    ok("!! *** n*G IS THE POINT AT INFINITY -- the order is the order ***",
        S.isInfinity(S.scalarMul(S.N)),
        "the single strongest self-check on a scalar ladder: a subtly wrong double or add gives a point that " +
        "is still ON the curve and still looks fine, but does not close the group");
    ok("   ...and (n-1)*G is -G, the step just before it closes",
        (() => { const p = S.toAffine(S.scalarMul(S.N - 1n)); return p.x === S.Gx && p.y === S.mod(-S.Gy); })());
}

console.log("\n2. *** AGAINST OPENSSL, WHICH IS NOT THIS TREE'S CODE ***");
{
    const ks = [1n, 2n, 3n, 7n, 255n, 256n, 65537n,
        0x1n << 128n, S.N - 2n, S.N - 1n,
        0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefn,
        0x0000000000000000000000000000000000000000000000000000000000000abcn];
    let agree = 0;
    const bad = [];
    for (const k of ks) {
        const mine = S.toAffine(S.scalarMul(k)), theirs = opensslPub(k);
        if (mine.x === theirs.x && mine.y === theirs.y) agree++; else bad.push(k.toString(16).slice(0, 12));
    }
    ok("!! *** every k*G agrees with OpenSSL to the digit ***", agree === ks.length,
        agree + " of " + ks.length + " agree" + (bad.length ? "; DISAGREE at k = " + bad.join(", ") : "") +
        ". The set is chosen for the places a ladder breaks: 1 and 2 (no window yet), 255/256 (a carry across " +
        "a window boundary), 2^128 (a long run of zero bits), and n-1 and n-2 (the far end of the scalar range)");

    // random keys, because a fixed list can be fitted to and a sweep cannot
    let rAgree = 0;
    for (let i = 0; i < 24; i++) {
        const k = BigInt("0x" + crypto.randomBytes(32).toString("hex")) % (S.N - 1n) + 1n;
        const mine = S.toAffine(S.scalarMul(k)), theirs = opensslPub(k);
        if (mine.x === theirs.x && mine.y === theirs.y) rAgree++;
    }
    ok("!! ...and so do 24 RANDOM keys, which a fixture cannot be fitted to", rAgree === 24, rAgree + "/24");

    ok("   ...and every result is actually on the curve",
        [1n, 12345n, S.N - 3n].every((k) => S.onCurve(S.toAffine(S.scalarMul(k)))));
}

console.log("\n3. THE GROUP LAW HOLDS, INCLUDING THE BRANCH THAT SILENTLY RETURNS A WRONG POINT");
{
    const G = S.toJacobian(S.Gx, S.Gy);
    const aff = (p) => S.toAffine(p);
    const eq = (p, q) => (p === null && q === null) || (p && q && p.x === q.x && p.y === q.y);

    ok("!! addition commutes: 3G + 5G == 5G + 3G",
        eq(aff(S.pointAdd(S.scalarMul(3n), S.scalarMul(5n))), aff(S.pointAdd(S.scalarMul(5n), S.scalarMul(3n)))));
    ok("!! and associates: (2G + 3G) + 5G == 2G + (3G + 5G)",
        eq(aff(S.pointAdd(S.pointAdd(S.scalarMul(2n), S.scalarMul(3n)), S.scalarMul(5n))),
           aff(S.pointAdd(S.scalarMul(2n), S.pointAdd(S.scalarMul(3n), S.scalarMul(5n))))));
    ok("!! 3G + 5G == 8G, so add and the ladder agree",
        eq(aff(S.pointAdd(S.scalarMul(3n), S.scalarMul(5n))), aff(S.scalarMul(8n))));

    // *** THE EQUAL-x BRANCH. *** P + P must double; P + (-P) must be infinity. Confusing the two is the
    // classic EC bug and it does NOT produce garbage -- it produces a valid curve point, so "is it on the
    // curve" passes and only an identity like this one catches it.
    ok("!! *** P + P doubles rather than vanishing ***", eq(aff(S.pointAdd(G, G)), aff(S.scalarMul(2n))),
        "same x AND same y -> double");
    const negG = { x: S.Gx, y: S.mod(-S.Gy), z: 1n };
    ok("!! *** P + (-P) vanishes rather than doubling ***", S.isInfinity(S.pointAdd(G, negG)),
        "same x, DIFFERENT y -> infinity. Both branches share the U1 == U2 test, and getting the inner " +
        "S1 == S2 test backwards yields a point that is still on the curve");
    ok("   ...and infinity is the identity from both sides",
        eq(aff(S.pointAdd(G, S.INFINITY)), aff(G)) && eq(aff(S.pointAdd(S.INFINITY, G)), aff(G)));
}

console.log("\n4. MONTGOMERY BATCH INVERSION IS AN IDENTITY, SO IT IS CHECKED AS ONE");
{
    const vals = [1n, 2n, 3n, 12345n, S.P - 1n, S.Gx, S.Gy, 0x7fffffffn];
    const batch = S.batchInvMod(vals);
    const one = vals.map((v) => S.invMod(v));
    ok("!! *** n inverses from ONE inversion match n individual inversions, exactly ***",
        batch.every((b, i) => b === one[i]),
        vals.length + " values. This is the trick that makes a GPU search viable at all, and it is exact " +
        "arithmetic rather than an approximation -- so it is gated as equality, not as a tolerance");
    ok("   ...and each really is an inverse: v * v^-1 == 1 mod p",
        batch.every((b, i) => S.mod(b * vals[i]) === 1n));

    // *** A ZERO POISONS THE WHOLE PRODUCT, SO IT IS REFUSED RATHER THAN SKIPPED. *** Returning 0 for the
    // zero element would give every LATER element a wrong inverse, silently -- the running product is what
    // couples them, which is exactly what makes the trick fast.
    let threw = false;
    try { S.batchInvMod([1n, 0n, 3n]); } catch { threw = true; }
    ok("!! *** a zero in the batch is REFUSED, because it would corrupt its neighbours and not itself ***",
        threw, "skipping it would leave the other inverses wrong with nothing to show for it");
}

console.log("\n5. THE ADDRESS, AGAINST VECTORS OLDER THAN THIS TREE");
{
    const pub1c = S.encodePoint(S.publicKey(1n), true);
    const pub1u = S.encodePoint(S.publicKey(1n), false);
    ok("!! privkey 1, COMPRESSED -> 1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
        A.p2pkhAddress(pub1c, HASHES) === "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
        A.p2pkhAddress(pub1c, HASHES));
    ok("!! privkey 1, UNCOMPRESSED -> 1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm",
        A.p2pkhAddress(pub1u, HASHES) === "1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm",
        A.p2pkhAddress(pub1u, HASHES));
    ok("!! *** and the two DIFFER, which is a property of Bitcoin and not a bug here ***",
        A.p2pkhAddress(pub1c, HASHES) !== A.p2pkhAddress(pub1u, HASHES),
        "one key, two encodings, two addresses -- the reason a wallet has to record which form it used, and " +
        "the reason funds have been lost by restoring a key into a wallet that assumed the other one");

    ok("   the compressed prefix tracks the y parity",
        S.encodePoint(S.publicKey(1n), true).slice(0, 2) === ((S.publicKey(1n).y & 1n) === 0n ? "02" : "03"));

    // leading-zero handling, the part base58 implementations get wrong
    ok("!! *** a leading zero byte becomes a literal '1', which the base conversion alone would drop ***",
        A.base58Encode(new Uint8Array([0, 0, 1])) === "112" && A.base58Encode(new Uint8Array([1])) === "2",
        "[0,0,1] -> '112' against [1] -> '2'. A zero contributes nothing to the NUMBER, and a mainnet " +
        "address starts with a 0x00 version byte -- without this every address would be a character short " +
        "and would still decode to the right hash, so a round-trip test would pass on a wrong string");
}

console.log("\n6. IT IS WIRED, AND IT DID NOT GROW A SECOND SHA-256");
{
    const fs2 = await import("node:fs"), path2 = await import("node:path"), url2 = await import("node:url");
    const ENG = path2.resolve(path2.dirname(url2.fileURLToPath(import.meta.url)), "..", "..");
    const { codeOnly } = await import("../../tools/ship/sourceScan.mjs");
    const mainCode = codeOnly(fs2.readFileSync(path2.join(ENG, "main.js"), "utf8"));
    ok("!! main.js imports the curve AND calls it",
        /import\s*\*\s*as\s+SECP\s+from/.test(mainCode) && /SECP\.publicKey\s*\(/.test(mainCode),
        "codeOnly'd, so the changelog comment cannot satisfy it -- v4169's lesson, arriving wired this time");

    // *** THE DEMO'S SHA-256 IS REUSED RATHER THAN A SECOND ONE WRITTEN. ***
    const demo = await import("../../demos_code/bitcoin_miner.js");
    const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    const a1 = hex(demo.sha256(new Uint8Array([97])));
    const a2 = crypto.createHash("sha256").update(Buffer.from([97])).digest("hex");
    ok("!! *** the miner's OWN sha256 is exported and agrees with OpenSSL byte for byte ***",
        typeof demo.sha256 === "function" && a1 === a2,
        a1.slice(0, 32) + "... -- the address pipeline INJECTS a hasher precisely so this tree does not grow " +
        "a second SHA-256 beside the one the VBA port is byte-identical to. Two implementations of one hash " +
        "is the defect this tree finds most often, and it would have been invisible here because both would " +
        "be correct");

    const tree = fs2.readFileSync(path2.join(ENG, "physics", "crypto", "bitcoinAddress.mjs"), "utf8");
    ok("   ...and the address module imports NO hash and no node builtin, so a page can load it",
        !/^\s*import[^\n]*node:/m.test(codeOnly(tree)) && !/\bmodule\s*\.\s*exports\b/.test(codeOnly(tree)),
        "hashes arrive as parameters. That also keeps node's crypto on ONE side of this gate's comparison " +
        "rather than both, which is what stops it grading a thing against itself");

    const att = path2.join(ENG, "vendor", "keyhunt", "ATTRIBUTION.txt");
    ok("!! the upstream attribution is vendored", fs2.existsSync(att) && /MIT/.test(fs2.readFileSync(att, "utf8")),
        "technique reference, no code copied -- that project is Python on a GPU, this is BigInt on a CPU");
}

report("NOT BUILT HERE, ON PURPOSE: the key SEARCH. gpu-keyhunt's subject is scanning private keys against a " +
       "database of funded addresses, and its own README puts the expected value at negative -- \"you will " +
       "burn more electricity than the astronomical-unlikely hit pays\". This module computes an address from " +
       "a key you supply and has no notion of a key space, a database or a hit. The pipeline was the part " +
       "worth having; it completes demos_code/bitcoin_miner.js, which had the hashing half and no curve.");
report("NOT CLAIMED: constant time. The windowed ladder branches on scalar bits and BigInt is variable-time. " +
       "The module header says so too, because a reader reaching for a signing primitive will not read this.");

console.log("\n" + (fails ? "secp256k1-selfcheck: " + fails + " FAILED" : "secp256k1-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
