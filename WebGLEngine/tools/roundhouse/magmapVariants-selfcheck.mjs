// tools/roundhouse/magmapVariants-selfcheck.mjs
//
// v2948 -- OPTIMISATION ROUND 2: KERNEL VARIANTS THE DESKTOP CANNOT MEASURE.
//
// Round 1 optimised the CPU reference, which this box can time. The kernel itself runs on a GPU this box does
// not have, so round 2 ships HYPOTHESES for a phone to adjudicate. That is not a compromise -- it is the same
// phone-measures/desktop-adjudicates split as every other claim here, and the only way the measurement exists.
//
// This gate cannot run WGSL. What it CAN do is prove the variants are safe to send: bit-identical by
// construction, structurally valid, and free of the barrier bug that turns a shared-memory kernel into a hang.

import { VARIANTS, variantWgsl, validateVariant, SHARED_CAP } from "./magmapVariants.mjs";
import { WGSL } from "./magmapGpu.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE INCUMBENT IS IN THE LIST ---------------------------------------------------------------------------------
{
    const base = VARIANTS.find((v) => v.id === "base-wg64");
    ok("!! the shipped kernel is one of the timed variants",
        !!base && base.workgroup === 64 && !base.sharedTrig && variantWgsl(WGSL, base) === WGSL.replace(/@compute\s+@workgroup_size\(\s*\d+\s*\)/, "@compute @workgroup_size(64)"),
        "a benchmark without the incumbent measures nothing -- every speedup is relative to the kernel actually in use");
}

// ---- 2. EVERY VARIANT IS STRUCTURALLY VALID --------------------------------------------------------------------------
{
    const bad = VARIANTS.map((v) => ({ v, r: validateVariant(variantWgsl(WGSL, v), v) })).filter((x) => !x.r.ok);
    ok("!! all " + VARIANTS.length + " variants pass structural validation",
        bad.length === 0,
        bad.length ? bad.map((x) => x.v.id + ": " + x.r.problems.join(",")).join(" | ")
                   : "workgroup size applied, braces balanced, no banned ops, shared variants declare their arrays");
}

// ---- 3. THE ARITHMETIC IS UNTOUCHED ----------------------------------------------------------------------------------
{
    // strip the parts a variant is allowed to change; what remains must be byte-identical to the base
    // NOTE (v2948): the first version of this normaliser did not strip COMMENTS, so the explanatory lines the
    // shared variant inserts read as arithmetic drift and failed three correct kernels. Second time this round a
    // structural check was wrong rather than the kernel -- strip comments and whitespace FIRST, then compare.
    const norm = (s) => s
        .replace(/\/\/[^\n]*/g, "")
        .replace(/@compute @workgroup_size\(\d+\)/, "WG")
        .replace(/var<workgroup>[^;]*;/g, "")
        .replace(/, @builtin\(local_invocation_id\) lid : vec3<u32>/, "")
        .replace(/for \(var t : u32 = lid\.x[\s\S]*?workgroupBarrier\(\);/, "")
        .replace(/let inRange = k < total;/, "if (k >= total) { return; }")
        .replace(/if \(inRange\) \{ (out\[k\] = [^;]*;) \}/, "$1")
        .replace(/cosW\[j\]/g, "cosT[j]").replace(/sinW\[j\]/g, "sinT[j]")
        .replace(/\s+/g, " ").trim();
    const baseNorm = norm(WGSL);
    const drifted = VARIANTS.filter((v) => norm(variantWgsl(WGSL, v)) !== baseNorm);
    ok("!! no variant changes a single arithmetic operation",
        drifted.length === 0,
        drifted.length ? "DRIFTED: " + drifted.map((v) => v.id).join(", ")
                       : "with grouping and table-source normalised away, every variant is byte-identical to the " +
                         "shipped kernel. This is what 'bit-identical by construction' means -- not a hope, a property");
}

// ---- 4. THE BARRIER TRAP IS FIXED BY CONSTRUCTION --------------------------------------------------------------------
{
    const shared = VARIANTS.filter((v) => v.sharedTrig);
    let allSafe = true, detail = "";
    for (const v of shared) {
        const src = variantWgsl(WGSL, v);
        const b = src.indexOf("workgroupBarrier()"), ret = src.indexOf("if (k >= total) { return; }");
        if (ret !== -1) { allSafe = false; detail = v.id + " kept the early return"; }
        if (b < 0) { allSafe = false; detail = v.id + " has no barrier"; }
        if (b > src.search(/var\s+acc/)) { allSafe = false; detail = v.id + " barriers too late"; }
    }
    ok("!! every shared-memory variant barriers BEFORE any thread can exit",
        allSafe && shared.length === 3,
        allSafe ? shared.length + " shared variants: the cooperative load and barrier sit above the bounds check, " +
                  "which became a guarded write. A barrier reached by only some threads is undefined behaviour in " +
                  "WGSL -- the classic 'works on my phone, hangs on yours' bug, removed by construction not by test"
                : detail);

    ok("shared variants declare arrays large enough for the trig table",
        shared.every((v) => new RegExp(`array<f32, ${SHARED_CAP}>`).test(variantWgsl(WGSL, v))) && SHARED_CAP >= 48,
        "cap " + SHARED_CAP + " >= nT 48; the bench skips a shared variant rather than overflow if nT ever exceeds it");
}

console.log();
if (fails) { console.log("magmapVariants-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("magmapVariants-selfcheck: all checks pass");
