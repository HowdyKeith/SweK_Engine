// FILE: engine/molGenerator.js
// VERSION: v1 — round 350
//
// Element data tables (CPK colors + Van der Waals radii) and synthetic
// molecule generators. The generators emit the same struct shape the
// decoder produces ({count, positions, fields, elements}) so they can
// feed straight into the renderer or be encoded to .mol.

/**
 * CPK color scheme (Corey-Pauling-Koltun) — the standard molecular
 * visualization palette. Indexed by atomic number. Values are sRGB in
 * [0,1] range, ready to feed into a shader uniform array.
 *
 * Atomic-number 0 is "unknown" (off-list element); we render it grey.
 */
export const CPK_COLORS = {
    0:  [0.55, 0.55, 0.55],   // unknown / other → grey
    1:  [1.00, 1.00, 1.00],   // H — white
    6:  [0.20, 0.20, 0.20],   // C — dark grey (more visible than pure black)
    7:  [0.19, 0.31, 0.97],   // N — blue
    8:  [1.00, 0.05, 0.05],   // O — red
    15: [1.00, 0.50, 0.00],   // P — orange
    16: [1.00, 1.00, 0.19],   // S — yellow
    11: [0.67, 0.36, 0.95],   // Na — purple
    12: [0.54, 1.00, 0.00],   // Mg — green
    17: [0.12, 0.94, 0.12],   // Cl — bright green
    19: [0.56, 0.25, 0.83],   // K — violet
    20: [0.24, 1.00, 0.00],   // Ca — neon green
    26: [0.88, 0.40, 0.20],   // Fe — orange-brown
    29: [0.78, 0.50, 0.20],   // Cu — copper
    30: [0.49, 0.50, 0.69],   // Zn — slate blue
};

/**
 * Van der Waals radii in Angstroms. Used as the rendered sphere size.
 * Indexed by atomic number, with 1.7 as the default.
 */
export const VDW_RADIUS = {
    0:  1.70,
    1:  1.20,    // H
    6:  1.70,    // C
    7:  1.55,    // N
    8:  1.52,    // O
    15: 1.80,    // P
    16: 1.80,    // S
    11: 2.27,    // Na
    12: 1.73,    // Mg
    17: 1.75,    // Cl
    19: 2.75,    // K
    20: 1.97,    // Ca
    26: 1.94,    // Fe
    29: 1.40,    // Cu
    30: 1.39,    // Zn
};

/**
 * Element name → atomic number. Matches the Python `element_registry`
 * from lastai_finally.txt.
 */
export const ELEMENT_REGISTRY = {
    "H": 1,  "HYDROGEN":   1,
    "C": 6,  "CARBON":     6,
    "N": 7,  "NITROGEN":   7,
    "O": 8,  "OXYGEN":     8,
    "P": 15, "PHOSPHORUS": 15,
    "S": 16, "SULFUR":     16,
    "NA": 11, "SODIUM":    11,
    "MG": 12, "MAGNESIUM": 12,
    "CL": 17, "CHLORINE":  17,
    "K":  19, "POTASSIUM": 19,
    "CA": 20, "CALCIUM":   20,
    "FE": 26, "IRON":      26,
    "CU": 29, "COPPER":    29,
    "ZN": 30, "ZINC":      30,
};

/** Resolve an element symbol or name to an atomic number ID. 0 = unknown. */
export function elementId(s) {
    if (!s) return 0;
    const key = String(s).toUpperCase().trim();
    return ELEMENT_REGISTRY[key] ?? 0;
}

// =========================================================================
// Synthetic generators
// =========================================================================

/**
 * Idealized alpha-helix segment. Each residue is the standard
 * N-Cα-C-O backbone (4 heavy atoms), with one Cα-Hα sidechain stub.
 * Spacing: 1.5 Å between bonded atoms, ~3.6 residues per turn,
 * 1.5 Å rise per residue.
 *
 * Returns the standard mol struct. 5 residues × 5 atoms = 25 atoms.
 */
export function generateAlphaHelix({ residues = 8, plddtMean = 88, plddtJitter = 5 } = {}) {
    const ATOMS_PER_RES = 5;
    const N = residues * ATOMS_PER_RES;
    const positions = new Float32Array(N * 3);
    const fields    = new Float32Array(N * 2);
    const elements  = new Uint8Array(N * 4);

    let a = 0;
    for (let r = 0; r < residues; r++) {
        const t = r * 2 * Math.PI / 3.6;   // ~3.6 residues per turn
        const y = r * 1.5;                  // rise
        const radius = 2.3;                 // helix radius

        // Build 5 atoms around the helix backbone
        const writeAtom = (offsetAng, dy, dRadial, elementSym) => {
            const ang = t + offsetAng;
            const radial = radius + dRadial;
            positions[a * 3 + 0] = radial * Math.cos(ang);
            positions[a * 3 + 1] = y + dy;
            positions[a * 3 + 2] = radial * Math.sin(ang);
            // pLDDT — small per-atom jitter on the residue mean
            fields[a * 2 + 0] = plddtMean + (Math.sin(a * 13.37) * plddtJitter);
            fields[a * 2 + 1] = 1.0;
            const eid = elementId(elementSym);
            elements[a * 4 + 0] = eid;
            // Charge sign convention from the doc: O = -1 (255), N = +1
            elements[a * 4 + 1] = elementSym === "O" ? 255 : (elementSym === "N" ? 1 : 0);
            a++;
        };

        writeAtom(0.00,  0.0, 0.0, "N");
        writeAtom(0.18,  0.5, 0.2, "C");      // Cα
        writeAtom(0.36,  0.8, 0.5, "C");      // C'
        writeAtom(0.18,  1.0, 0.9, "O");      // backbone carbonyl O
        writeAtom(0.18,  0.2, 1.4, "C");      // Cβ stub
    }
    return { count: N, positions, fields, elements };
}

/**
 * Water cluster — N₃ water molecules arranged in a randomized cube.
 * Useful for testing AO/depth and small atom counts.
 */
export function generateWaterCluster({ count = 30, spacing = 3.5, seed = 7, plddt = 100 } = {}) {
    // Hash-based RNG for repeatable output
    let s = (seed >>> 0) || 1;
    const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s >>>= 0; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
    const N = count * 3;   // 1 oxygen + 2 hydrogens per water
    const positions = new Float32Array(N * 3);
    const fields    = new Float32Array(N * 2);
    const elements  = new Uint8Array(N * 4);
    let a = 0;
    for (let w = 0; w < count; w++) {
        const cx = (rng() - 0.5) * count * spacing;
        const cy = (rng() - 0.5) * count * spacing;
        const cz = (rng() - 0.5) * count * spacing;
        const ang = rng() * 2 * Math.PI;
        // O at center
        positions[a*3] = cx; positions[a*3+1] = cy; positions[a*3+2] = cz;
        elements[a*4] = 8; elements[a*4+1] = 255;
        fields[a*2] = plddt; fields[a*2+1] = 1.0;
        a++;
        // 2 H atoms — covalent angle is 104.5° so they spread ~52° from up
        const hOff = 1.0;
        for (let h = 0; h < 2; h++) {
            const hAng = ang + (h ? 0.91 : -0.91);   // ±52° in radians
            positions[a*3]   = cx + hOff * Math.cos(hAng);
            positions[a*3+1] = cy + hOff * Math.sin(hAng);
            positions[a*3+2] = cz + (rng() - 0.5) * 0.4;
            elements[a*4] = 1; elements[a*4+1] = 0;
            fields[a*2] = plddt; fields[a*2+1] = 1.0;
            a++;
        }
    }
    return { count: N, positions, fields, elements };
}

/**
 * DNA-like double helix — purine/pyrimidine stubs along an idealized
 * spiral. ~10 base-pairs per turn. Not biochemically accurate (each
 * "base" is just a 4-atom cluster) but reads as a recognizable DNA
 * silhouette.
 */
export function generateDNADuplex({ basePairs = 12 } = {}) {
    const atomsPerBP = 8;
    const N = basePairs * atomsPerBP;
    const positions = new Float32Array(N * 3);
    const fields    = new Float32Array(N * 2);
    const elements  = new Uint8Array(N * 4);
    let a = 0;
    const radius = 5.0, rise = 3.4;
    for (let b = 0; b < basePairs; b++) {
        const t = b * 2 * Math.PI / 10;   // 10 BP/turn
        const y = b * rise;
        // Strand 1 backbone (P + 3 sugar atoms)
        const writeAtom = (strand, eSym, radial, dy, angOff) => {
            const ang = t + angOff + (strand ? Math.PI : 0);
            positions[a*3]   = radial * Math.cos(ang);
            positions[a*3+1] = y + dy;
            positions[a*3+2] = radial * Math.sin(ang);
            const eid = elementId(eSym);
            elements[a*4] = eid;
            elements[a*4+1] = eSym === "O" ? 255 : (eSym === "N" ? 1 : 0);
            fields[a*2] = 75; fields[a*2+1] = 1.0;
            a++;
        };
        // Strand 1
        writeAtom(0, "P", radius,       0.0, 0.0);
        writeAtom(0, "O", radius + 0.5, 0.5, 0.1);
        writeAtom(0, "C", radius - 0.5, 1.0, 0.05);
        writeAtom(0, "N", radius - 1.5, 0.5, -0.05);
        // Strand 2
        writeAtom(1, "P", radius,       0.0, 0.0);
        writeAtom(1, "O", radius + 0.5, 0.5, 0.1);
        writeAtom(1, "C", radius - 0.5, 1.0, 0.05);
        writeAtom(1, "N", radius - 1.5, 0.5, -0.05);
    }
    return { count: N, positions, fields, elements };
}

export const MOL_GENERATORS = {
    alphaHelix:  generateAlphaHelix,
    waterCluster: generateWaterCluster,
    dnaDuplex:   generateDNADuplex,
};
