// tools/roundhouse/couplingIndependence.mjs
//
// v3389 -- A COUPLING ONLY TESTS WHAT THE TWO ROUTES DO NOT SHARE.
//
// v3387 established this the hard way. The electromagnetism planted error -- n = eps_r instead of
// sqrt(eps_r mu_r) -- was supposed to be caught by comparing Fresnel reflection against the seismic impedance
// reflection. IT WAS NOT. Both sides consumed the SAME wrong index, one directly and one through Z0/n, so they
// agreed perfectly on the wrong answer.
//
// That is a general hazard and this lab has been declaring couplings for many rounds without checking for it.
// This tool makes the condition decidable from the import graph instead of from an author's confidence.
//
// THREE VERDICTS, AND THE MIDDLE ONE IS THE TRAP:
//
//   INDEPENDENT   the two routes share no module. Agreement is real corroboration.
//                 Measured: Fresnel vs the seismic impedance reflection -- no shared dependency at all.
//
//   INCIDENTAL    they share a module but use DIFFERENT functions from it. The shared file cannot carry a
//                 corrupted value between them, so the coupling stands.
//                 Measured: transfer.mjs and clocks.mjs both import probe.js -- one takes circularL and
//                 iscoRadius, the other timeDilation. I had claimed "no shared line", which was imprecise;
//                 the claim survives, the wording did not.
//
//   IDENTITY      one route CALLS the other, so agreement is guaranteed by construction rather than measured.
//                 Measured: soundSpeedFluid calls vP. That was declared honestly as enforced-by-construction,
//                 and it is genuinely valuable -- two fields cannot drift apart -- but it is NOT corroboration
//                 and should never be counted as two independent confirmations of one number.
//
// A coupling audit that only asked "do they agree" would rate all three the same.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Named imports per resolved module file. */
export function namedImports(file) {
    const out = new Map();
    let src; try { src = fs.readFileSync(file, "utf8"); } catch { return out; }
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g)) {
        const names = m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        let t = path.resolve(path.dirname(file), m[2]);
        for (const ext of ["", ".js", ".mjs"]) if (fs.existsSync(t + ext)) { t = t + ext; break; }
        out.set(t, (out.get(t) || []).concat(names));
    }
    return out;
}

/** Transitive set of local module files a file depends on. */
export function transitiveDeps(file, seen = new Set()) {
    const abs = path.resolve(file);
    if (seen.has(abs) || !fs.existsSync(abs)) return seen;
    seen.add(abs);
    for (const dep of namedImports(abs).keys()) transitiveDeps(dep, seen);
    return seen;
}

/**
 * Classify a declared coupling between two modules.
 * Returns one of "identity", "incidental", "independent", "unreadable", with the evidence.
 *
 * *** v3722 -- A FILE THAT IS NOT THERE USED TO COME BACK "independent", WHICH IS THE STRONGEST VERDICT THIS
 * FUNCTION CAN GIVE. transitiveDeps returns early on a missing path, so an absent module contributes ZERO
 * imports, shares nothing with anything, and falls through to "no shared dependency". ABSENCE OF EVIDENCE WAS
 * BEING RETURNED AS EVIDENCE OF INDEPENDENCE -- and composeBind, whose whole purpose is refusing agreement it
 * cannot defend, then reported plain agree/disagree on that basis.
 *
 * IT IS REACHABLE, NOT HYPOTHETICAL: composeBind builds its paths as `tools/roundhouse/${dev}Bind.mjs`, and
 * `lbm` HAS NO BIND FILE -- its device is a local function inside devices.mjs (measured at v3719, for the same
 * reason the instrument census had been reading 79 of 80). So comparing lbm against anything asked this
 * function about a file that does not exist and was told the two routes were independent.
 *
 * UNKNOWN IS NOT INDEPENDENT. The new verdict says which side could not be read, and callers decide. *** */
export function classifyCoupling(fileA, fileB) {
    const A = path.resolve(fileA), B = path.resolve(fileB);
    const missing = [!fs.existsSync(A) ? path.basename(A) : null, !fs.existsSync(B) ? path.basename(B) : null].filter(Boolean);
    if (missing.length) {
        return { verdict: "unreadable", missing, sharedModules: [],
                 reason: `cannot judge independence: ${missing.join(" and ")} not on disk -- an absent module shares nothing with anything, which is not the same as sharing nothing` };
    }
    const impA = namedImports(A), impB = namedImports(B);

    // IDENTITY: one directly imports the other
    if (impA.has(B)) return { verdict: "identity", via: impA.get(B), reason: `${path.basename(A)} calls ${path.basename(B)}` };
    if (impB.has(A)) return { verdict: "identity", via: impB.get(A), reason: `${path.basename(B)} calls ${path.basename(A)}` };

    const depsA = transitiveDeps(A), depsB = transitiveDeps(B);
    const sharedModules = [...depsA].filter((x) => depsB.has(x) && x !== A && x !== B);
    if (!sharedModules.length) return { verdict: "independent", sharedModules: [], reason: "no shared dependency" };

    // shared module -- do they pull the SAME functions out of it?
    const sharedFns = [];
    for (const mod of sharedModules) {
        const a = impA.get(mod) || [], b = impB.get(mod) || [];
        for (const n of a) if (b.includes(n)) sharedFns.push(path.basename(mod) + ":" + n);
    }
    return sharedFns.length
        ? { verdict: "identity", sharedModules, sharedFunctions: sharedFns,
            reason: "both routes consume the same function, so a corrupted value reaches both" }
        : { verdict: "incidental", sharedModules: sharedModules.map((m) => path.basename(m)), sharedFunctions: [],
            reason: "shared file, different functions -- no value can pass between the routes" };
}

/**
 * v3390 -- THE PAIRS ARE DERIVED FROM THE DECLARATIONS, NOT TRANSCRIBED BESIDE THEM.
 *
 * The first version of this file carried a hand-written list of three pairs. crossDevice-selfcheck declares
 * TWELVE couplings, so the audit covered a quarter of what it claimed to -- and a hand-maintained register
 * drifts the moment someone declares a coupling without remembering to update it. That is the exact failure this
 * lab keeps finding elsewhere, reproduced in the tool built to find it.
 *
 * DERIVATION: each crossCheck({...}) call sits inside a block. Within that block a coupling names its two sides
 * either by importing physics modules directly, or by calling getDevice("x") -- in which case the modules are
 * whatever tools/roundhouse/xBind.mjs imports from physics/. Both paths are read from source.
 *
 * WHAT CANNOT BE DERIVED IS REPORTED AS SUCH. A block that names fewer than two distinct physics modules -- one
 * comparing two modes of a SINGLE device, say -- has no pair to classify, and comes back "underivable" rather
 * than being silently dropped or counted as independent.
 */
const RH = () => path.dirname(fileURLToPath(import.meta.url));

/** Physics modules a device bind pulls in. */
function bindModules(device, root) {
    const f = path.join(root, "tools", "roundhouse", device + "Bind.mjs");
    if (!fs.existsSync(f)) return [];
    return [...namedImports(f).keys()].filter((m) => /[\\/]physics[\\/]/.test(m));
}

/** Split crossDevice-selfcheck into the blocks that each contain a crossCheck call. */
export function declaredCouplings(root = ".") {
    const f = path.join(root, "tools", "roundhouse", "crossDevice-selfcheck.mjs");
    let src; try { src = fs.readFileSync(f, "utf8"); } catch { return []; }
    const lines = src.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (!/crossCheck\(\{/.test(lines[i])) continue;
        // walk back to the enclosing block opener, forward to the crossCheck's quantity
        let start = i;
        while (start > 0 && !/^\{\s*$/.test(lines[start])) start--;
        let end = i;
        while (end < lines.length - 1 && !/^\}\s*$/.test(lines[end])) end++;
        const block = lines.slice(start, end + 1).join("\n");
        // the quantity belongs to THIS crossCheck call, not to the first one in the block -- a block containing
        // two calls was reporting the same label twice, which made two distinct couplings look like duplicates.
        const near = lines.slice(i, Math.min(i + 6, lines.length)).join("\n");
        const q = (near.match(/quantity:\s*"([^"]+)"/) || [])[1] || "(unnamed)";

        const mods = new Set();
        for (const m of block.matchAll(/await import\("(\.\.[^"]+)"\)/g)) {
            let t = path.resolve(path.join(root, "tools", "roundhouse"), m[1]);
            for (const ext of ["", ".js", ".mjs"]) if (fs.existsSync(t + ext)) { mods.add(t + ext); break; }
        }
        for (const m of block.matchAll(/getDevice\("([^"]+)"\)/g)) {
            for (const bm of bindModules(m[1], root)) mods.add(bm);
        }
        out.push({ label: q, modules: [...mods] });
    }
    return out;
}

export function auditDeclared(root = ".") {
    return declaredCouplings(root).map((c) => {
        if (c.modules.length < 2) {
            return { label: c.label, verdict: "underivable",
                     reason: `only ${c.modules.length} physics module(s) named in the block -- no pair to classify` };
        }
        // v3390b -- KEEP ONLY TOP-LEVEL MODULES. Taking the first two named in a block was wrong: a block that
        // imports emit.mjs AND resolves lens's dependencies names geodesic.js too, and geodesic.js is emit's OWN
        // dependency. The pair chosen was (emit, geodesic) and the classifier correctly said "emit calls
        // geodesic" -- a true statement about the wrong pair, which demoted a sound coupling to an identity.
        //
        // A module that is a transitive dependency of another module in the set is not a SIDE of the coupling,
        // it is something a side is built from. Dropping those leaves the actual routes.
        const tops = c.modules.filter((m) =>
            !c.modules.some((other) => other !== m && transitiveDeps(other).has(path.resolve(m))));
        // THE COUNT AFTER FILTERING IS THE VERDICT, and getting here took three attempts worth recording.
        //   2 or more top-level modules -> two genuine sides, classify them
        //   exactly 1                   -> one side is a DEPENDENCY of the other, which IS the identity case
        //   0                           -> nothing to classify
        //
        // Checking identity BEFORE filtering was too eager: it flagged "emit calls geodesic" for the shadow
        // coupling, where geodesic is emit's own dependency and lens is the actual other side. Filtering without
        // the count was too aggressive the other way: it dropped rays.mjs from the sound-speed pair, which is
        // precisely the identity signature, and reported "underivable" for the clearest identity in the lab.
        if (tops.length === 1) {
            const dep = c.modules.find((m) => m !== tops[0] && namedImports(tops[0]).has(m));
            return { label: c.label, modules: c.modules.length, verdict: "identity",
                     via: dep ? namedImports(tops[0]).get(dep) : [],
                     reason: dep ? `${path.basename(tops[0])} calls ${path.basename(dep)}`
                                 : "one side is built from the other" };
        }
        if (tops.length === 0) {
            return { label: c.label, verdict: "underivable", modules: c.modules.length,
                     reason: "no top-level module survived -- the block names only dependencies of one another" };
        }
        const [a, b] = tops;
        return { label: c.label, modules: tops.length, ...classifyCoupling(a, b) };
    });
}
