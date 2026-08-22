// WebGLEngine/physics/wasmImports.js — v2622
//
// Parse a WebAssembly module's IMPORT SECTION -- the list of functions it borrows from the host. This is the
// whole ballgame for cross-platform determinism: a module that imports the host's Math.sin inherits the host's
// libm, which differs by a few ULPs between Linux and macOS (Valeriu measured exactly this in Krbn: 347017 vs
// 347019 bytes). A module that imports NO math baked its transcendentals in and gives the same bits everywhere.
"use strict";

// Read a LEB128 unsigned integer from bytes at position p. Returns [value, nextPos].
function uleb(b, p) {
    let r = 0, s = 0;
    for (;;) {
        const x = b[p]; p++;
        r |= (x & 0x7f) << s;
        if (!(x & 0x80)) break;
        s += 7;
    }
    return [r >>> 0, p];
}

/**
 * Return the list of imports as { module, name, kind } where kind is 0=func,1=table,2=mem,3=global.
 * Parses only the import section (id 2) and stops -- it does not validate the whole module.
 */
export function wasmImports(bytes) {
    if (!(bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d)) {
        throw new Error("not a wasm module (bad magic)");
    }
    let i = 8;                                   // skip magic + version
    const imports = [];
    while (i < bytes.length) {
        const sec = bytes[i]; i++;
        let size; [size, i] = uleb(bytes, i);
        const end = i + size;
        if (sec === 2) {
            let n; [n, i] = uleb(bytes, i);
            for (let k = 0; k < n; k++) {
                let ml; [ml, i] = uleb(bytes, i);
                const mod = Buffer.from(bytes.subarray(i, i + ml)).toString("latin1"); i += ml;
                let nl; [nl, i] = uleb(bytes, i);
                const nm = Buffer.from(bytes.subarray(i, i + nl)).toString("latin1"); i += nl;
                const kind = bytes[i]; i++;
                if (kind === 0) { let t; [t, i] = uleb(bytes, i); }        // func: type index
                else if (kind === 1) { i++; let l; [l, i] = uleb(bytes, i); } // table: elemtype + limits flag
                else if (kind === 2) { const fl = bytes[i]; i++; let l; [l, i] = uleb(bytes, i); if (fl) { let m; [m, i] = uleb(bytes, i); } }
                else if (kind === 3) { i += 2; }                          // global: valtype + mutability
                imports.push({ module: mod, name: nm, kind });
            }
            return imports;                       // done -- only the import section is needed
        }
        i = end;
    }
    return imports;
}

// The transcendental / rounding functions whose host implementations drift across platforms. sqrt is NOT here:
// it is a native wasm instruction (f64.sqrt), correctly-rounded and identical everywhere, never imported.
// Longest names first so e.g. "atan2" is not eaten by "atan" and "tanh" is not eaten by "tan"; a trailing
// f?l? catches the single-precision (sinf) and long-double (sinl) C variants that a math-importing build emits.
const MATH_NAMES = /(^|[._])(atan2|expm1|log10|log1p|remainder|scalbn|lgamma|tgamma|ldexp|frexp|hypot|asinh|acosh|atanh|asin|acos|atan|sinh|cosh|tanh|exp2|log2|cbrt|fmod|erf|sin|cos|tan|exp|log|pow)f?l?($|[._0-9])/i;

/** The subset of imports that are host math functions -- the cross-platform determinism hazard. */
export function mathImports(imports) {
    return imports.filter((im) => MATH_NAMES.test(im.name));
}
