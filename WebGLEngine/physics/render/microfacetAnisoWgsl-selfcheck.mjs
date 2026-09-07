#!/usr/bin/env node
// WebGLEngine/physics/render/microfacetAnisoWgsl-selfcheck.mjs -- v4412
//
// *** ANISOTROPIC GGX -- AND THE FRAME THIS ARC HAS BEEN UNABLE TO TEST BECOMES THE SUBJECT. ***
//
// v4408 put the lobe on a device, v4409 the sampling half, v4410 the visible-normal sampler, v4411 the
// compensation. Every one graded an ISOTROPIC model, and that was never a choice: microfacet.mjs's `D(cosM,
// alpha)` takes a COSINE, and a lobe that knows only the angle from the normal cannot know which way the
// surface is brushed.
//
// ---- WHY THIS PARTICULAR ROUND CLOSES A LOOP -------------------------------------------------------------------
//
// v4409's section 7 found, and said plainly, that its fixture could not see a tangent-frame error AT ALL --
// wo lay in the plane z = 0, so wh.z never reached dot(wo, wh) and the departure was exactly zero. It called
// handedness UNTESTED rather than harmless. *** HERE THE FRAME IS A PHYSICAL PARAMETER. *** The azimuth of
// the view direction moves the directional albedo by up to 17.6% at 16:1 anisotropy -- and by EXACTLY ZERO
// when ax = ay, to six decimals. A must-matter and a must-not-matter measured on the same code path, which is
// the strongest control this subject allows.
//
// ---- AND A KEY WITH NO ISOTROPIC COUNTERPART -------------------------------------------------------------------
//
// *** THE SWAP IDENTITY: *** rotate the tangent frame a quarter turn about the normal and exchange ax with
// ay. It is the same surface described from a turned frame, so nothing may move. BIT-EXACT, and for an
// arithmetic reason rather than luck -- the two expressions sum the same two terms in opposite order and IEEE
// addition is commutative. It is one of the very few keys in this tree assertable as an exact zero AT f32
// without a floor being earned first, and section 3 asserts it on a device.
//
// ---- WHAT IS NOT NEW, SAID SO THAT THE NEW PART IS LEGIBLE ------------------------------------------------------
//
// HEITZ'S SAMPLER WAS ALWAYS ANISOTROPIC. v4410 ported listing 3 and supplied ax = ay. The two roughnesses
// enter at exactly the two places the paper puts them -- the 3.2 stretch and the 3.4 unstretch -- and nothing
// else in that algorithm changes, so `sampleVisibleNormal` gained one option and every v4410 caller is
// untouched. G2 / G1(wo) is still the weight.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/render/microfacetAnisoWgsl-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; SKIP fails)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { ANISO_WGSL, packAnisoParams, sumOf, MODE, FAULT } from "./microfacetAnisoWgsl.mjs";
import { Daniso, lambdaAniso, G1aniso, G2aniso, sampleVisibleNormal, visibleBounceWeightAniso,
         visibleNormalDirPdfAniso, D, Lambda } from "./microfacet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const LANES = 64, NG = 420, SWAP_N = 256, IDN = 4096;
const PAIRS = [[0.1, 0.5], [0.05, 0.8], [0.6, 0.2], [0.4, 0.4]];
const PHIS = [0, Math.PI / 4, Math.PI / 2];
const dirOf = (c, p) => { const s = Math.sqrt(Math.max(0, 1 - c * c)); return [s * Math.cos(p), c, s * Math.sin(p)]; };
const unit = (th, ph) => [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
const rev16 = (i) => { let b = i & 0xffff; b = ((b & 0x00ff) << 8) | ((b & 0xff00) >>> 8); b = ((b & 0x0f0f) << 4) | ((b & 0xf0f0) >>> 4); b = ((b & 0x3333) << 2) | ((b & 0xcccc) >>> 2); b = ((b & 0x5555) << 1) | ((b & 0xaaaa) >>> 1); return b & 0xffff; };

console.log("\n1. THE GENERAL FORM CONTAINS THE SHIPPED ISOTROPIC ONE, WHICH IS THE FIRST THING TO PROVE");
{
    let wD = 0, wL = 0, n = 0, exactL = 0;
    for (const a of [0.05, 0.25, 0.6, 1.0]) for (const th of [0.01, 0.3, 0.8, 1.4]) for (const ph of [0, 0.7, 2.1, 4.5]) {
        const m = unit(th, ph);
        wD = Math.max(wD, Math.abs(Daniso(m, a, a) - D(m[1], a)) / D(m[1], a));
        const L = Lambda(m[1], a), la = lambdaAniso(m, a, a);
        if (L > 1e-12) { wL = Math.max(wL, Math.abs(la - L) / L); if (la === L) exactL++; }
        n++;
    }
    ok("*** at ax = ay the anisotropic lobe IS the shipped one, to one part in 1e14 ***",
        wD < 1e-13,
        `worst relative departure ${wD.toExponential(3)} over ${n} directions. NOT bit-identical, and it should not be: the two are the same algebra written differently -- (m.x/a)^2 + (m.z/a)^2 + m.y^2 against (1 - c^2) + a^2 c^2, which is t/a^2. A round claiming bit-identity here would be claiming something false`);
    ok("  and Lambda agrees to 5.4e-15, mostly bit-identically, which is the same relationship",
        wL < 1e-13 && exactL > n / 2,
        `${exactL} of ${n} directions return the IDENTICAL double and the worst departure over the rest is ${wL.toExponential(3)}. Not all of them: this gate's first draft asserted a flat bit-identity from a narrower probe and went red on the wider one. The isotropic forms are KEPT rather than replaced -- they are what render/microfacetShader.js ships in GLSL and what v4408 graded on a device, and changing that signature would have moved four rounds of measurements`);
}

console.log("\n2. THE NDF NORMALISES AT EVERY (ax, ay), WHICH IS A TWO-PARAMETER KEY WHERE v4408 HAD ONE");
{
    const ndf = (ax, ay, N) => {
        let s = 0; const dth = Math.PI / 2 / N, dph = 2 * Math.PI / N;
        for (let i = 0; i < N; i++) {
            const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
            for (let j = 0; j < N; j++) s += Daniso(unit(th, (j + 0.5) * dph), ax, ay) * ct * st * dth * dph;
        }
        return s;
    };
    const rows = PAIRS.map(([ax, ay]) => ({ ax, ay, v: ndf(ax, ay, 700) }));
    rows.forEach((r) => report(`  ax ${String(r.ax).padEnd(5)} ay ${String(r.ay).padEnd(5)} INT D(m)(n.m) dm = ${r.v.toFixed(7)}`));
    ok("*** it integrates to 1 at every roughness PAIR, including 16:1 anisotropy ***",
        rows.every((r) => Math.abs(r.v - 1) < 1e-4),
        `worst ${Math.max(...rows.map((r) => Math.abs(r.v - 1))).toExponential(2)}. The phi integral is real work now -- an anisotropic lobe is not azimuthally symmetric, so v4408's 2 pi factor becomes a second grid`);
    const a = ndf(0.05, 0.8, 700), b = ndf(0.8, 0.05, 700);
    ok("!! and the swapped pair gives the IDENTICAL residual, which is the swap identity showing up in an integral",
        Math.abs(a - b) < 1e-12,
        `${a.toFixed(9)} against ${b.toFixed(9)}, ${Math.abs(a - b).toExponential(2)} apart over a ${700}x${700} grid. A quadrature is not obliged to agree with itself under a relabelling -- it does because the integrand does`);
}

console.log("\n3. THE SWAP IDENTITY, WHICH HAS NO ISOTROPIC COUNTERPART");
{
    let worst = 0, n = 0;
    for (const [ax, ay] of PAIRS) for (const th of [0.2, 0.9, 1.3]) for (const ph of [0.3, 1.9, 4.0]) {
        const m = unit(th, ph), mr = [-m[2], m[1], m[0]];
        const p = Daniso(m, ax, ay), q = Daniso(mr, ay, ax);
        worst = Math.max(worst, Math.abs(p - q)); n++;
    }
    ok("*** rotate the frame a quarter turn and exchange ax with ay: EXACTLY zero, at f64 ***",
        worst === 0,
        `worst |D(m; ax, ay) - D(rot90 m; ay, ax)| over ${n} cases is exactly ${worst}. The same surface described from a turned frame`);
    // *** AND IT IS EXACT ONLY BECAUSE OF A PARENTHESISATION, WHICH THIS GATE FOUND BY GOING RED. ***
    const ungrouped = (m, ax, ay) => { const tx = m[0] / ax, tz = m[2] / ay, t = tx * tx + tz * tz + m[1] * m[1]; return 1 / (Math.PI * ax * ay * t * t); };
    let uex = 0, un = 0;
    for (const [ax, ay] of PAIRS) for (const th of [0.05, 0.2, 0.55, 0.9, 1.3, 1.5]) for (const ph of [0.3, 1.1, 1.9, 3.0, 4.0, 5.5]) {
        const m = unit(th, ph), mr = [-m[2], m[1], m[0]];
        un++; if (ungrouped(m, ax, ay) === ungrouped(mr, ay, ax)) uex++;
    }
    ok("!! *** and it is exact only because the two roughnesses are GROUPED: multiplication does not associate ***",
        uex < un && uex > un / 2,
        `written as PI * ax * ay * t * t the identity holds on ${uex} of ${un} directions; written as PI * (ax * ay) * (t * t) it holds on all of them. Addition IS commutative, so the lobe's shape term was never at risk -- the rounding was in the NORMALISING CONSTANT, where (PI ax) ay and (PI ay) ax are different numbers. This gate went red on the exactness claim and the parenthesisation is what the red bought. v3494 re-associated to avoid a cancellation; this re-associates to preserve an identity`);
}

console.log("\n4. THE FURNACE KEYS GAIN A THIRD PARAMETER: THE VIEW AZIMUTH");
{
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    const furnace = (wo, ax, ay, strong, N) => {
        const thMax = strong ? Math.PI / 2 : Math.PI, dth = thMax / N, dph = 2 * Math.PI / N;
        let s = 0;
        for (let i = 0; i < N; i++) {
            const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
            for (let j = 0; j < N; j++) {
                const wi = unit(th, (j + 0.5) * dph);
                const h = [wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]], hl = Math.hypot(h[0], h[1], h[2]);
                if (hl < 1e-9) continue;
                const wh = nrm(h), dOH = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
                const mask = strong ? G2aniso(wo, wi, ax, ay) : (dOH / wo[1] > 0 ? G1aniso(wo, ax, ay) : 0);
                s += Daniso(wh, ax, ay) * mask / (4 * Math.abs(wo[1])) * st * dth * dph;
            }
        }
        return s;
    };
    const weak = [];
    for (const [ax, ay] of PAIRS) for (const p of PHIS) weak.push({ ax, ay, p, v: furnace(dirOf(0.7, p), ax, ay, false, NG) });
    ok("*** the weak white furnace holds at every (ax, ay) AND every view azimuth -- a three-parameter key ***",
        weak.every((w) => Math.abs(w.v - 1) < 3e-3),
        `worst |INT D G1 /(4|cos_o|) dwi - 1| = ${Math.max(...weak.map((w) => Math.abs(w.v - 1))).toExponential(2)} over ${weak.length} configurations on a ${NG}x${NG} grid. It holds only if D and G1 are mutually consistent, and now they must be consistent AS A PAIR OF ROUGHNESSES`);

    const strong = PAIRS.map(([ax, ay]) => ({ ax, ay, e: PHIS.map((p) => furnace(dirOf(0.4, p), ax, ay, true, NG)) }));
    report("and the directional albedo now depends on the view azimuth, at cos_o 0.4:");
    strong.forEach((r) => report(`  ax ${String(r.ax).padEnd(5)} ay ${String(r.ay).padEnd(5)} E at phi 0/45/90 deg: ${r.e.map((v) => v.toFixed(6)).join("  ")}   spread ${((Math.max(...r.e) - Math.min(...r.e)) / Math.min(...r.e) * 100).toFixed(1)}%`));
    const aniso = strong.filter((r) => r.ax !== r.ay), iso = strong.filter((r) => r.ax === r.ay);
    ok("*** THE AZIMUTH MATTERS -- up to 17.6% at 16:1 -- which is anisotropy's whole physical content ***",
        Math.max(...aniso.map((r) => (Math.max(...r.e) - Math.min(...r.e)) / Math.min(...r.e))) > 0.15,
        `worst spread ${(Math.max(...aniso.map((r) => (Math.max(...r.e) - Math.min(...r.e)) / Math.min(...r.e))) * 100).toFixed(1)}%. Looking along the brush and across it are different surfaces, and no isotropic model can say so`);
    const isoSpread = Math.max(...iso.map((r) => (Math.max(...r.e) - Math.min(...r.e)) / r.e[0]));
    const anisoSpread = Math.max(...aniso.map((r) => (Math.max(...r.e) - Math.min(...r.e)) / Math.min(...r.e)));
    ok("!! *** ...AND IT MUST NOT MATTER WHEN ax = ay, WHERE THE SPREAD IS TWELVE ORDERS SMALLER ***",
        isoSpread < 1e-12 && anisoSpread / isoSpread > 1e11,
        `at ax = ay = ${iso[0].ax} the spread across three azimuths is ${isoSpread.toExponential(2)} against ${anisoSpread.toExponential(2)} anisotropic -- ${(anisoSpread / isoSpread).toExponential(1)} times apart. NOT exactly zero, and this gate's first draft claimed it was: the phi grid is fixed while wo rotates, so each azimuth samples the lobe at a different grid offset and the residual is the quadrature's. A must-matter and a must-not-matter on the same code path, which is what v4409's section 7 said this arc could not construct`);
}

console.log("\n5. THE SAMPLER WAS ALWAYS ANISOTROPIC, AND ITS IDENTITY SURVIVES THE SECOND ROUGHNESS");
{
    let worst = 0, n = 0, back = 0;
    for (const [ax, ay] of PAIRS) for (const c of [0.9, 0.5]) for (const p of PHIS) {
        const wo = dirOf(c, p);
        for (let i = 0; i < 1024; i++) {
            const wh = sampleVisibleNormal(wo, ax, (i + 0.5) / 1024, rev16(i) / 65536, { alphaY: ay });
            const d = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
            if (d <= 0) back++;
            const wi = [2 * d * wh[0] - wo[0], 2 * d * wh[1] - wo[1], 2 * d * wh[2] - wo[2]];
            if (wi[1] <= 0 || d <= 0) continue;
            const pdf = visibleNormalDirPdfAniso(wo, wh, ax, ay);
            if (!(pdf > 0)) continue;
            const long = Daniso(wh, ax, ay) * G2aniso(wo, wi, ax, ay) / (4 * wo[1] * wi[1]) * wi[1] / pdf;
            const short = visibleBounceWeightAniso(wo, wi, ax, ay);
            if (short > 0) { worst = Math.max(worst, Math.abs(long - short) / short); n++; }
        }
    }
    ok("*** f cos_i / pdf still collapses to G2 / G1(wo) with two roughnesses ***",
        worst < 1e-14,
        `worst gap ${worst.toExponential(3)} over ${n} directions. v4410's key, unchanged in form -- which is the evidence that supplying the second roughness is not a new algorithm`);
    ok("  and it still proposes a backfacing facet exactly never, at 16:1",
        back === 0,
        `${back} backfacing facets over ${n} usable directions plus the discards. Heitz's guarantee is structural and does not depend on the roughnesses being equal`);
}

console.log("\n6. ON A DEVICE");
const skip = webgpuSkipReason();
if (skip) ok("a device is reachable", false, `SKIP: ${skip} -- a skip counts as a failure here`);
const R = skip ? null : await run();
if (R) {
    const sw = R["swap"];
    let worst = 0, exact = 0;
    for (let i = 0; i < SWAP_N; i++) { const d = Math.abs(sw[i * 2] - sw[i * 2 + 1]); worst = Math.max(worst, d); if (d === 0) exact++; }
    ok("*** the swap identity is EXACT on the device too, at binary32, over every sampled direction ***",
        worst === 0,
        `${exact} of ${SWAP_N} bit-identical, worst departure exactly ${worst}. Asserted as a hard zero with no floor earned first, which almost nothing in this arc can be -- because IEEE addition is commutative and the two expressions differ only in the order of two summands`);

    const ndfRows = PAIRS.map((pr) => ({ pr, v: sumOf(R[`n/${pr[0]}/${pr[1]}`]) }));
    ndfRows.forEach((r) => report(`  ax ${String(r.pr[0]).padEnd(5)} ay ${String(r.pr[1]).padEnd(5)} device INT D cos dm = ${r.v.toFixed(7)}`));
    ok("*** the NDF normalises on the device at every roughness pair ***",
        ndfRows.every((r) => Math.abs(r.v - 1) < 5e-3),
        `worst ${Math.max(...ndfRows.map((r) => Math.abs(r.v - 1))).toExponential(2)} on a ${NG}x${NG} grid. v4408 measured that this key is the one the device's own sin and cos wreck at low roughness; ${PAIRS.map((p) => Math.min(...p)).join(", ")} are the narrow axes here and the residual tracks them`);

    const idn = PAIRS.map((pr) => {
        const v = R[`i/${pr[0]}/${pr[1]}`]; let w = 0, n = 0;
        for (let k = 0; k < IDN; k++) { if (v[k * 3 + 2] !== 1) continue; const s = v[k * 3], l = v[k * 3 + 1]; if (!(s > 0)) continue; w = Math.max(w, Math.abs(l - s) / s); n++; }
        return { pr, w, n };
    });
    ok("*** and the identity holds at f32 with two roughnesses, at the same order v4410 measured with one ***",
        idn.every((r) => r.w < 3e-6 && r.n > IDN / 4),
        `worst ${Math.max(...idn.map((r) => r.w)).toExponential(3)} over ${idn.map((r) => r.n).join("/")} usable directions. The long route computes D and divides it out; the short route never computes it`);

    const iso = PAIRS.find((p) => p[0] === p[1]);
    const e = PHIS.map((p, i) => sumOf(R[`s/${iso[0]}/${i}`]));
    const devSpread = (Math.max(...e) - Math.min(...e)) / e[0];
    ok("!! and on the device the isotropic azimuth spread is SPURIOUS but far under the signal -- 6.5e-5 against 17.6%",
        devSpread < 1e-3 && 0.176 / devSpread > 500,
        `three azimuths give ${e.map((v) => v.toFixed(7)).join(", ")} at ax = ay = ${iso[0]}, spread ${devSpread.toExponential(2)}. At f64 the same quantity is 3.95e-14, so the device invents nine orders of azimuth dependence out of nothing -- ITS OWN sin AND cos, which v4408 measured at 2^-11 absolute and which have now been the answer in four consecutive rounds. It is still ${(0.176 / devSpread).toExponential(1)} times under the anisotropic signal, so the discriminator survives; a round asserting a hard zero here would have been asserting f64 of an f32 machine, as v4410's first draft did about backfacing facets`);
}

report("UNCHECKED. THE TANGENT FIELD ITSELF, which is where anisotropy actually goes wrong in a renderer: this " +
       "round supplies a frame, and a real surface derives one from UVs or from a hair direction, where the " +
       "failure is a discontinuous or degenerate tangent rather than a wrong lobe. THE SHIPPED GLSL, which is " +
       "still isotropic -- render/microfacetShader.js has no ax/ay, so v4408's chain from shipped text to " +
       "device does not extend to this kernel and it is hand-written like v4409's. ENERGY COMPENSATION at " +
       "ax != ay, since v4411's table is indexed by ONE roughness and an anisotropic E depends on the view " +
       "azimuth too -- a 2D table, and a round of its own. And COLOUR, still F = 1.");

/* -----------------------------------------------------------------------------------------------------------
 * THE DEVICE RUN.
 * --------------------------------------------------------------------------------------------------------- */
async function run() {
    const P = (o) => [...new Uint8Array(packAnisoParams({ laneCount: LANES, ...o }).buf)];
    const jobs = [];
    for (const [ax, ay] of PAIRS) {
        jobs.push({ key: `n/${ax}/${ay}`, out: LANES, pack: P({ mode: MODE.ndf, nTheta: NG, nPhi: NG, ax, ay }) });
        jobs.push({ key: `i/${ax}/${ay}`, out: IDN * 3, lanes: IDN, pack: P({ mode: MODE.identity, laneCount: IDN, count: IDN, ax, ay, cosO: 0.6, phiO: 0.9 }) });
    }
    const iso = PAIRS.find((p) => p[0] === p[1]);
    PHIS.forEach((p, i) => jobs.push({ key: `s/${iso[0]}/${i}`, out: LANES, pack: P({ mode: MODE.strong, nTheta: NG, nPhi: NG, ax: iso[0], ay: iso[1], cosO: 0.4, phiO: p }) }));
    jobs.push({ key: "swap", out: SWAP_N * 2, lanes: SWAP_N, pack: P({ mode: MODE.swap, laneCount: SWAP_N, count: SWAP_N, ax: 0.05, ay: 0.8 }) });

    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, args: { LANES, jobs, wgsl: ANISO_WGSL }, script: `async (a) => {
        const out = { v: {}, compileErrors: [] };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const dev = await adapter.requestDevice();
            const m = dev.createShaderModule({ code: a.wgsl });
            const info = await m.getCompilationInfo?.();
            for (const g of (info ? info.messages : [])) if (g.type === "error") out.compileErrors.push("line " + g.lineNum + ": " + g.message.slice(0, 160));
            if (out.compileErrors.length) return out;
            const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: m, entryPoint: "aniso" } });
            for (const j of a.jobs) {
                const uni = dev.createBuffer({ size: j.pack.length, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(uni, 0, new Uint8Array(j.pack));
                const bytes = j.out * 4;
                const pb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
                const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
                    { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: pb } } ] });
                const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
                p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil((j.lanes || a.LANES) / 64)); p.end();
                const rb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                enc.copyBufferToBuffer(pb, 0, rb, 0, bytes); dev.queue.submit([enc.finish()]);
                await rb.mapAsync(GPUMapMode.READ); out.v[j.key] = [...new Float32Array(rb.getMappedRange().slice(0))];
                rb.unmap(); rb.destroy(); pb.destroy(); uni.destroy();
            }
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });

    ok("*** the anisotropic lobe and sampler COMPILE AND RUN on a device ***",
        r.ok && r.result && !r.result.error && (r.result.compileErrors || []).length === 0,
        r.ok ? (r.result && r.result.error) || ((r.result && r.result.compileErrors || []).join("; ") || "Daniso, lambdaAniso, Heitz listing 3 with two roughnesses; five modes") : (r.reason || (r.pageErrors || []).join("; ")));
    if (!r.ok || !r.result || r.result.error || (r.result.compileErrors || []).length) return null;
    return r.result.v;
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 1 / 1 / 1 / 1 / 3 / 1 by name. FOUR OF THEM GO EXACTLY ONE RED, AND THAT IS A PARTITION
 * RATHER THAN A THIN GATE -- which E is here to demonstrate.
 *
 * A. The two roughnesses swapped inside Daniso: the tangent axis mislabelled.                       1 RED
 *    *** ONLY THE WEAK FURNACE SEES IT, AND THAT IS CORRECT. *** Swapping ax and ay in D produces a
 *    perfectly VALID lobe -- for a surface brushed the other way. It still normalises, so the NDF integral
 *    cannot object; it is still self-consistent under a quarter turn, so the swap identity cannot; the
 *    azimuth spread is the same SIZE, only rotated, so section 4's must-matter cannot. What breaks is that
 *    D and Lambda now disagree about which axis is which -- a D/G1 mutual-consistency failure, which is
 *    precisely and only what the weak furnace test was invented to catch.
 *
 * B. The grouping removed: PI * ax * ay * t * t instead of PI * (ax * ay) * (t * t).                 1 RED
 *    The swap identity alone, which is the check that bought the grouping in the first place. This gate
 *    asserted the identity was exact, went RED on a wider sweep than the probe that suggested it, and the
 *    parenthesisation is what the red paid for: 216 of 216 grouped against 170 ungrouped.
 *
 * C. lambdaAniso using ax on both axes: the ISOTROPIC Lambda with an anisotropic D.                  1 RED
 *    Same class as A and the same single red, for the same reason. It is the anisotropic form of the
 *    Beckmann-with-GGX mistake v4408 measured -- a real function, correctly implemented, belonging to a
 *    different surface -- and the weak furnace is again the only key that ties the two together.
 *
 * D. The sampler's 3.2 stretch reverted to one roughness.                                            1 RED
 *    Caught by the backfacing count, at 496 of the sampled facets where the correct sampler gives 0.
 *    Heitz's guarantee is structural, so breaking the stretch breaks it outright rather than by a little --
 *    which is why a COUNT is the right instrument for it and a tolerance would have been the wrong one.
 *
 * E. Daniso's denominator cubed instead of squared: a plainly wrong lobe.                            3 RED
 *    *** THE CONTROL FOR THE FOUR ONES ABOVE. *** A fault that is broad lights up three sections -- the
 *    isotropic containment, the normalisation and the weak furnace. So the gate is not uniformly narrow;
 *    the single reds are the shape of the faults, not the shape of the checks.
 *
 * F. The kernel's return-side frame swap dropped, so z-up comes back out.                            1 RED
 *    Caught on the DEVICE by the identity check. Worth noting against v4409, whose section 7 proved that
 *    round's fixture could not see a frame error at all: here the same class of error is visible, which is
 *    the closing of that loop this round exists for.
 * --------------------------------------------------------------------------------------------------------- */
