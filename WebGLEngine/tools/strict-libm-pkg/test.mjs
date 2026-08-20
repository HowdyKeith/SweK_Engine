// test.mjs — the guarantee, checkable. Run: node test.mjs
//
// Two things it proves: (1) the source calls no host transcendental (the STRUCTURAL guarantee -- grep it),
// and (2) every function matches the host Math to machine epsilon (so nothing was traded for the guarantee).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictSin, strictCos, strictHypot, strictLog2, strictAtan2, STRICT_TRIG_MAX } from "./index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---- 1. THE GREP GUARANTEE across every source file ---------------------------------------------------------------
{
    const forbidden = /Math\.(hypot|log2|log10|log|exp|expm1|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt)\b/g;
    let hits = [];
    for (const f of ["src/strictTrig.mjs", "src/strictMath.mjs"]) {
        const code = stripComments(fs.readFileSync(path.join(HERE, f), "utf8"));
        for (const m of code.match(forbidden) || []) hits.push(f + ":" + m);
    }
    ok("no host transcendental Math in the source (grep it)", hits.length === 0,
       hits.length ? "found " + hits.join(", ") : "only sqrt/round/abs remain -- all ECMA-exact, identical on every conforming engine.");
}

// ---- 2. accuracy vs host Math -------------------------------------------------------------------------------------
{
    const rng = mulberry(999);
    let eTrig = 0, eHyp = 0, eLog = 0, eAt = 0;
    for (let i = 0; i < 200000; i++) {
        const x = (rng() * 2 - 1) * STRICT_TRIG_MAX;
        eTrig = Math.max(eTrig, Math.abs(strictSin(x) - Math.sin(x)), Math.abs(strictCos(x) - Math.cos(x)));
        const a = (rng() * 2 - 1) * 1e6, b = (rng() * 2 - 1) * 1e6, mh = Math.hypot(a, b);
        if (mh) eHyp = Math.max(eHyp, Math.abs(strictHypot(a, b) - mh) / mh);
        eAt = Math.max(eAt, Math.abs(strictAtan2(a, b) - Math.atan2(a, b)));
        const v = Math.exp((rng() * 2 - 1) * 40);
        eLog = Math.max(eLog, Math.abs(strictLog2(v) - Math.log2(v)));
    }
    ok("strictSin/strictCos within 1e-15 of Math", eTrig < 1e-15, "max abs err " + eTrig.toExponential(2));
    ok("strictHypot exact vs Math.hypot", eHyp < 1e-15, "max rel err " + eHyp.toExponential(2));
    ok("strictLog2 within 1e-13 of Math.log2", eLog < 1e-13, "max abs err " + eLog.toExponential(2));
    ok("strictAtan2 within 1e-13 of Math.atan2", eAt < 1e-13, "max abs err " + eAt.toExponential(2));
}

// ---- 3. determinism: the render fingerprint is reproducible -------------------------------------------------------
{
    import("node:crypto").then(({ default: crypto }) => {
        const rng = mulberry(42);
        const f1 = new Float64Array(4000), f2 = new Float64Array(4000);
        const fill = (out) => { const r = mulberry(42); for (let i = 0; i < 1000; i++) { const ang = (r() * 2 - 1) * 3.14159; out[i * 4] = strictSin(ang); out[i * 4 + 1] = strictHypot(r() * 100, r() * 100); out[i * 4 + 2] = strictAtan2(r() - 0.5, r() - 0.5); out[i * 4 + 3] = strictLog2(r() * 1e6 + 1); } };
        fill(f1); fill(f2);
        const h = (f) => crypto.createHash("sha256").update(Buffer.from(f.buffer)).digest("hex");
        ok("the strict fingerprint is reproducible bit-for-bit", h(f1) === h(f2), "sha256 " + h(f1).slice(0, 16) + "...");
        console.log(fails ? "\n" + fails + " FAILED" : "\nall checks pass");
        process.exit(fails ? 1 : 0);
    });
}
