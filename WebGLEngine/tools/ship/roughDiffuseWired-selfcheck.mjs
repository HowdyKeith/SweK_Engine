#!/usr/bin/env node
// WebGLEngine/tools/ship/roughDiffuseWired-selfcheck.mjs -- v4282
//
// *** physics/render/roughDiffuse.mjs SHIPPED AT v4275 AND HAD NO CALLER FOR SEVEN ROUNDS. ***
//
// Its own gate's closing note said so: "unchecked: ANY CONSUMER. physics/render/pathTracer.mjs still uses
// albedo/PI and this round did not change it -- wiring a new lobe into a renderer is a behaviour change to
// every existing image, which is its own round with its own before-and-after." v4280 and v4281 then both
// cited it, by name, as THE example of a module the engine does not have. This is the before-and-after.
//
// The behaviour change is opt-in: a sphere with no `sigma` runs the statements it ran yesterday, in the same
// order, consuming the same random numbers. That is checked here by rendering the SAME SCENE through the
// committed v4281 tracer and the patched one and comparing hashes, not by reasoning about the diff.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { render } from "../../physics/render/pathTracer.mjs";
import { energyLoss, orenNayarAB, orenNayarBrdf, SIGMA_MAX } from "../../physics/render/roughDiffuse.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);

// One scene, one camera, used by every measurement below: a ball that fills the frame, so what is measured
// is the diffuse lobe rather than the background.
const scene = (sigma) => {
    const ball = { centre: [0, 0, 0], radius: 1.6, albedo: 0.8, emit: 0 };
    if (sigma !== undefined) ball.sigma = sigma;
    return [ball, { centre: [3, 4, 3], radius: 1.0, albedo: 0, emit: 8 }];
};
const OPTS = { w: 32, h: 32, spp: 64, seed: 11, eye: [0, 0, 4], fovDeg: 60 };
const shot = (sigma, r = render) => {
    const buf = r(scene(sigma), OPTS);
    let s = 0, n = 0, mx = 0;
    for (const v of buf) { if (v > 1e-9) { s += v; n++; } if (v > mx) mx = v; }
    return { sha: crypto.createHash("sha256").update(Buffer.from(Float64Array.from(buf).buffer))
                          .digest("hex").slice(0, 16),
             mean: s / Math.max(1, n), lit: n, max: mx };
};

console.log("roughDiffuseWired-selfcheck -- the lobe that had no caller, and what it changes\n");

console.log("1. *** A SCENE THAT SETS NO sigma IS BIT-IDENTICAL TO THE TRACER THAT SHIPPED AT v4281 ***");
{
    // The comparison is against the COMMITTED file, extracted from git, rather than against a remembered
    // number: a hash written into this gate would only ever prove that somebody typed it.
    // *** THE FIRST VERSION OF THIS SECTION READ `HEAD:` AND WAS CORRECT FOR EXACTLY AS LONG AS IT TOOK TO
    // COMMIT. *** The moment v4282 landed, HEAD held the PATCHED tracer, and "the committed tracer and the
    // patched one render the same bits" became a file compared with itself -- a check that can never fail
    // again, passing forever while proving nothing. What is wanted is the tracer AS IT WAS BEFORE THE
    // WIRING, and that revision is FOUND rather than typed: walk this file's history newest-first and take
    // the first revision whose source does not import roughDiffuse. A pinned SHA would be a claim with an
    // expiry date; this survives every future commit to the tracer, including ones that move the wiring.
    const before = path.join(ENG, "physics/render/_ptBefore.mjs");
    const REL = "WebGLEngine/physics/render/pathTracer.mjs";
    const ROOT = path.join(ENG, "..");
    let ran = false, beforeSha = null, rev = null, beforeSrc = null;
    try {
        const revs = execFileSync("git", ["log", "--format=%H", "--", REL],
                                  { cwd: ROOT, encoding: "utf8", maxBuffer: 8e6 }).trim().split("\n");
        for (const r of revs) {
            const t = execFileSync("git", ["show", `${r}:${REL}`],
                                   { cwd: ROOT, encoding: "utf8", maxBuffer: 8e6 });
            if (!/roughDiffuse\.mjs/.test(t)) { rev = r; beforeSrc = t; break; }
        }
        if (!rev) throw new Error("no revision of the tracer predates the roughDiffuse import");
        const src = beforeSrc;
        fs.writeFileSync(before, src);
        const prog = "const M=await import(" + JSON.stringify(before) + ");" +
            "const b=M.render([{centre:[0,0,0],radius:1.6,albedo:0.8,emit:0},{centre:[3,4,3],radius:1,albedo:0,emit:8}]," +
            JSON.stringify(OPTS) + ");" +
            "const c=await import('node:crypto');" +
            "process.stdout.write(c.createHash('sha256').update(Buffer.from(Float64Array.from(b).buffer)).digest('hex').slice(0,16));";
        beforeSha = execFileSync(process.execPath, ["--input-type=module", "-e", prog], { encoding: "utf8" });
        ran = true;
    } catch (e) { report("could not run the committed tracer: " + String(e).slice(0, 90)); }
    finally { try { fs.unlinkSync(before); } catch {} }

    const now = shot(undefined);
    // *** THE GUARD AGAINST A VACUOUS PASS. *** If the two sources are the same bytes, the hash comparison
    // below is a tautology no matter what it prints, so the difference is asserted BEFORE the agreement is.
    const nowSrc = fs.readFileSync(path.join(ENG, "physics/render/pathTracer.mjs"), "utf8");
    ok("CONTROL: the reference revision is genuinely a DIFFERENT file, not this one",
        ran && beforeSrc !== null && beforeSrc !== nowSrc && !/roughDiffuse\.mjs/.test(beforeSrc),
        ran ? `${rev.slice(0, 12)}, ${beforeSrc.length} chars against ${nowSrc.length}` : "not reached");
    ok("*** the pre-wiring tracer and the patched one render the same bits ***", ran && beforeSha === now.sha,
        !ran ? "SKIPPED -- git show failed, so this proves nothing"
             : beforeSha === now.sha ? `both ${now.sha}`
             : `committed ${beforeSha} against patched ${now.sha}`);
    ok("  and an explicit sigma of 0 is the same bits again", shot(0).sha === now.sha,
        "0 is not > 0, so it takes the original branch rather than a lobe that merely agrees with it");
    report("*** THE REDUCTION IS EXACT, AND THAT IS STILL NOT WHY THE BRANCH IS SEPARATE. *** Oren-Nayar at " +
        "sigma 0 has A = 1 and B = 0, so its BRDF IS albedo/pi to the last bit. One path could have served " +
        "both. It does not, because 'the arithmetic agrees' and 'the same statements run in the same order " +
        "consuming the same randoms' are different guarantees, and only the second one makes every existing " +
        "image bit-identical BY CONSTRUCTION rather than by a re-derivation somebody has to trust.");
    ok("CONTROL: the exact reduction really is exact", (() => {
        const { A, B } = orenNayarAB(0);
        return A === 1 && B === 0 && orenNayarBrdf(0.8, 0.6, 0.5, 0.3, 0) === 0.8 / Math.PI; })(),
        "A === 1, B === 0, and f === albedo/pi with === and no epsilon");
}

console.log("\n2. *** WHAT ROUGHNESS ACTUALLY DOES: IT FLATTENS THE BALL ***");
{
    const L = shot(undefined), s3 = shot(0.3), s6 = shot(0.6), s10 = shot(1.0);
    ok("a sigma surface renders differently from a Lambertian one", s10.sha !== L.sha);
    ok("*** the PEAK falls monotonically as roughness rises ***",
        s3.max < L.max && s6.max < s3.max && s10.max < s6.max,
        `${L.max.toFixed(4)} -> ${s3.max.toFixed(4)} -> ${s6.max.toFixed(4)} -> ${s10.max.toFixed(4)}`);
    const dMax = (L.max - s10.max) / L.max, dMean = (L.mean - s10.mean) / L.mean;
    // *** SABOTAGE E MADE BOTH DELTAS NEGATIVE AND THIS LINE PRINTED "a factor of 33". *** The ratio of two
    // numbers moving the WRONG way reads exactly like a healthy one, so the sign is now part of the claim:
    // the peak must actually fall before how fast it falls means anything.
    ok("*** and the peak falls MUCH faster than the mean, which is the whole signature ***",
        dMax > 0 && dMean > 0 && dMax > 10 * dMean,
        `peak -${(100 * dMax).toFixed(2)}% against mean -${(100 * dMean).toFixed(2)}% at sigma 1.0 ` +
        `-- a factor of ${(dMax / dMean).toFixed(0)}`);
    // *** THE CLAMP WAS ASSERTED AS A REGEX IN SECTION 4 AND NOTHING EVER RENDERED PAST IT. *** Deleting
    // Math.min(sig, SIGMA_MAX) reddened one TEXT check and no picture, because every sigma above was under
    // the cap. A gate that can only see a clamp in the source is not checking the clamp.
    const cap = shot(SIGMA_MAX), big = shot(10);
    ok("*** a sigma past the model's maximum renders AS the maximum ***", big.sha === cap.sha,
        `sigma 10 and sigma ${SIGMA_MAX.toFixed(4)} agree to the bit -- ${cap.sha}`);
    ok("  and that frame is finite and non-negative throughout", (() => {
        const buf = render(scene(10), OPTS);
        for (const v of buf) if (!Number.isFinite(v) || v < 0) return false;
        return true; })(),
        "Oren-Nayar's B term grows without bound in sigma; unclamped it is an unbounded multiplier on throughput");
    report("that is what a rough diffuse surface looks like and it is why the model exists: light is moved " +
        "OUT of the brightly-lit facing region and toward grazing angles, so the ball reads flatter -- the " +
        "moon rather than a billiard ball. A model that merely darkened everything would move both numbers " +
        "together, which is exactly what this check would catch.");
}

console.log("\n3. *** THE ENERGY COMPENSATION, MEASURED IN A RENDER FOR THE FIRST TIME ***");
{
    // v4275 measured the loss in the BRDF integral. Nobody had measured what it costs a picture.
    const src = fs.readFileSync(path.join(ENG, "physics/render/pathTracer.mjs"), "utf8");
    const uncompPath = path.join(ENG, "physics/render/_ptUncompensated.mjs");
    fs.writeFileSync(uncompPath, src.replace(/diffuseTable\(sig\)/g, "null")
                                    .replace(/diffuseTable\(hit\.sphere\.sigma\)/g, "null"));
    let uncomp = null;
    try { uncomp = (await import(uncompPath)).render; } catch { /* reported below */ }
    const L = shot(undefined);
    ok("the uncompensated lobe can be built for comparison", !!uncomp);
    if (uncomp) {
        const on = { 0.3: shot(0.3, uncomp), 0.6: shot(0.6, uncomp), 1.0: shot(1.0, uncomp) };
        const cp = { 0.3: shot(0.3), 0.6: shot(0.6), 1.0: shot(1.0) };
        const lossOf = (x) => (L.mean - x.mean) / L.mean;
        ok("*** WITHOUT compensation the picture visibly loses light as roughness rises ***",
            lossOf(on[1.0]) > 0.1,
            `mean falls ${(100 * lossOf(on[0.3])).toFixed(2)}%, ${(100 * lossOf(on[0.6])).toFixed(2)}%, ` +
            `${(100 * lossOf(on[1.0])).toFixed(2)}% at sigma 0.3 / 0.6 / 1.0`);
        ok("*** WITH it, the same scene holds its light ***", Math.abs(lossOf(cp[1.0])) < 0.01,
            `${(100 * lossOf(cp[1.0])).toFixed(2)}% at sigma 1.0 -- against ` +
            `${(100 * lossOf(on[1.0])).toFixed(2)}% uncompensated`);
        ok("  and the gap widens with roughness, as the table predicts",
            lossOf(on[1.0]) - lossOf(cp[1.0]) > lossOf(on[0.3]) - lossOf(cp[0.3]));
        const e = energyLoss(1.0);
        report(`v4275 measured the BRDF INTEGRAL losing ${(100 * e.mean).toFixed(1)}% on average at sigma 1.0 ` +
            `(worst ${(100 * e.worst).toFixed(1)}%). This scene loses ${(100 * lossOf(on[1.0])).toFixed(1)}% ` +
            `of its rendered mean. THOSE ARE DIFFERENT NUMBERS ABOUT DIFFERENT THINGS and neither contradicts ` +
            `the other: a render dilutes the lobe's loss with multiple bounces, the light's geometry and the ` +
            `pixels that see sky. Quoting the integral figure as the picture's would have been the easy error.`);
    }
    try { fs.unlinkSync(uncompPath); } catch {}
}

console.log("\n4. THE WIRING, READ FROM THE TRACER'S OWN SOURCE");
{
    const src = fs.readFileSync(path.join(ENG, "physics/render/pathTracer.mjs"), "utf8");
    ok("*** pathTracer imports roughDiffuse ***",
        /import \{[^}]*roughDiffuseBrdf[^}]*\} from "\.\/roughDiffuse\.mjs"/.test(src),
        "the import v4275's own gate said did not exist");
    ok("  the bounce takes the new lobe only when sigma is positive", /if \(!\(sig > 0\)\) \{/.test(src),
        "!(sig > 0) also rejects NaN and undefined, where sig <= 0 would not");
    ok("  and NEE evaluates the real BRDF at the light rather than skipping",
        /const kL = hit\.sphere\.sigma > 0/.test(src),
        "a microfacet surface skips NEE because its integrand needs a sampled lobe; Oren-Nayar is closed form");
    ok("  the compensation table is cached rather than rebuilt per bounce",
        /_diffuseTables\.get\(s\)/.test(src) && /buildDiffuseTable\(s\)/.test(src),
        "buildDiffuseTable integrates the lobe, which no bounce can afford");
    ok("  and sigma is clamped to the model's own maximum",
        /Math\.min\(sig, SIGMA_MAX\)/.test(src) && SIGMA_MAX === Math.PI / 2);
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read, restored
// md5-identical (e96c1cd131ab6eb5) after every one. MEASURED.
//
//   A  `if (!(sig > 0))` becomes `if (sig <= 0)` -- the guard a reviewer would call a tidy-up.
//      -> exit=1, 6 red, the most of any of the five. `undefined <= 0` is FALSE, so every sphere in the tree
//      that has never heard of roughness falls into the new branch with sigma undefined, Math.min(undefined,
//      SIGMA_MAX) is NaN, and the Lambertian peak reads a flat 1.0000. *** THE OPT-IN IS THE WHOLE PROMISE OF
//      THIS ROUND AND ONE INVERTED COMPARISON REVOKES IT FOR EVERY EXISTING IMAGE. *** Section 1's bit-identity
//      catches it, and so do three checks that were not written with it in mind.
//
//   B  the bounce's compensation table replaced with null -- the lobe still runs, the energy is not put back.
//      -> exit=1, 2 red, and the second one is the interesting one. The scene loses 11.01% of its light, which
//      section 3 catches by design. It ALSO fails the flattening signature at "a factor of 1": peak and mean
//      fall together. That is the sentence in section 2's report -- "a model that merely darkened everything
//      would move both numbers together" -- turning out to be a check rather than a remark.
//
//   C  `Math.PI *` dropped from the bounce's k, so the BRDF is used where a throughput factor is wanted.
//      -> exit=1, 3 red. The pi is not decoration: roughDiffuseBrdf returns a BRDF and the cosine-sampled
//      bounce has already divided by pi in its pdf, so omitting it darkens by pi and every rough surface
//      loses a quarter of its light. Caught as a monotonicity break, not as a magic number anywhere.
//
//   D  azimuthCos short-circuited to 1 -- the two directions treated as always sharing an azimuth.
//      -> exit=1, 3 red. Oren-Nayar's B term is multiplied by max(0, cos(phi_i - phi_o)); pinning that to 1
//      makes the term always additive, so the ball gets BRIGHTER with roughness (peak 1.1387 -> 1.5486) and
//      the surface GAINS 11% of light with compensation on. *** A ROUGH SURFACE THAT GLOWS STILL LOOKS LIKE A
//      ROUGH SURFACE, *** which is why the direction of every measurement is asserted and not just its size.
//
//   E  NEE's kL forced to 1 -- the light sampled with the Lambertian weight while the bounce uses the lobe.
//      -> exit=1, 3 red, and it is the one that improved the gate. It is a SMALL error, because the direct
//      term is one of several contributions: the peak moves by 0.63% and it moves the wrong way. The
//      signature check caught it -- but printed "a factor of 33", because the ratio of two negative deltas
//      reads exactly like the healthy answer. The condition now requires both deltas to be POSITIVE before
//      their ratio means anything. A check that fails while printing a reassuring number is half a check.
//
//   F  the history walk stops at the first revision instead of the first one without the import -- which is
//      to say, `git show HEAD:`, exactly what this section did when it was written.
//      -> exit=1, 1 red, AND IT IS NOT THE BIT-IDENTITY CHECK. That check PASSED, reporting "both
//      d66e8de3147f2a91", because it was comparing the file with itself: 37357 chars against 37357, at
//      revision 4f50dcd -- the tree's HEAD when the sabotage was run, which is to say this round's own
//      wiring commit. *** THE HEADLINE ASSERTION OF THIS SECTION BECAME
//      INCAPABLE OF FAILING THE INSTANT v4282 WAS COMMITTED, AND IT WENT ON PRINTING A HASH AND THE WORD
//      PASS. *** Nothing in the run looked wrong. Only the control that asserts the two sources DIFFER
//      before asserting they AGREE says anything at all, which is why it exists and why it runs first.
//
// None went 0 RED. B, E and F are the trio worth keeping: B proves section 2's prose is load-bearing, E is
// the only one small enough that a tolerance would have shrugged at it, and F is the one where the gate was
// wrong rather than the module -- a before-and-after whose "before" drifts forward to meet the "after" is
// not a comparison, and it decays into a tautology quietly, at commit time, with every light still green.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER OREN-NAYAR IS THE RIGHT MODEL, which v4275's own note already said and " +
    "is no more settled now -- the 1994 form is one of several and the repository that prompted it exists " +
    "because this one loses energy. What is new is that the tree can now RENDER with it and the pictures " +
    "were measured. Also unchecked: any surface that is not a sphere, any scene with more than one light, " +
    "and MIS -- a sigma surface does NEE and a cosine bounce with no weighting between them, exactly as the " +
    "Lambertian path always has, so this inherits that approximation rather than fixing or worsening it.");
process.exit(fails ? 1 : 0);
