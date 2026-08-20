// FILE: engine/molPdbParser.js
// VERSION: v1 — round 350
//
// PDB text parser. Just enough to read ATOM and HETATM records out of
// a Protein Data Bank file (or AlphaFold output) and produce the same
// {count, positions, fields, elements} struct the .mol decoder makes.
//
// PDB ATOM record format (fixed-width columns, per the PDB v3.3 spec):
//
//   Col 1-6   Record name ("ATOM  " or "HETATM")
//   Col 7-11  Atom serial number
//   Col 13-16 Atom name (e.g., " CA ")
//   Col 17    Alt loc indicator
//   Col 18-20 Residue name
//   Col 22    Chain ID
//   Col 23-26 Residue sequence number
//   Col 31-38 X coord (Angstrom, float)
//   Col 39-46 Y coord
//   Col 47-54 Z coord
//   Col 55-60 Occupancy
//   Col 61-66 Temperature factor (or pLDDT for AlphaFold)
//   Col 77-78 Element symbol
//
// We honor HETATM lines too (covers ligands, metals, water).
// We skip everything else (HEADER, SEQRES, HELIX, etc).

import { elementId } from "./molGenerator.js";

/**
 * Parse a PDB text blob.
 *
 * @param {string} pdbText
 * @returns {{ count, positions, fields, elements, residueCount }}
 */
export function parsePDB(pdbText) {
    if (typeof pdbText !== "string") throw new Error("parsePDB: expected text input");
    const lines = pdbText.split(/\r?\n/);
    const tmp = {
        positions: [],
        fields:    [],
        elements:  [],
        residueIds: new Set(),
    };
    for (const raw of lines) {
        // Stop at END / ENDMDL records (handle just the first model)
        if (raw.startsWith("ENDMDL") || raw === "END") break;
        const rec = raw.substring(0, 6);
        if (rec !== "ATOM  " && rec !== "HETATM") continue;

        // PDB columns are 1-indexed and inclusive. Substring uses
        // 0-indexed [start, end). Subtract 1 from start, keep end.
        const x = parseFloat(raw.substring(30, 38));
        const y = parseFloat(raw.substring(38, 46));
        const z = parseFloat(raw.substring(46, 54));
        if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) continue;

        const occupancy = parseFloat(raw.substring(54, 60)) || 1.0;
        const bfactor   = parseFloat(raw.substring(60, 66)) || 50.0;

        // Element symbol is at cols 77-78; fall back to first non-digit
        // chars of the atom name (cols 13-16) if missing.
        let eSym = raw.substring(76, 78).trim();
        if (!eSym) {
            const atomName = raw.substring(12, 16).trim();
            eSym = atomName.replace(/[0-9]/g, "").substring(0, 1);
        }
        const eid = elementId(eSym);

        // Track residue IDs for stats (chain + resName + resSeq)
        const resTag = raw.substring(20, 26);
        tmp.residueIds.add(resTag);

        tmp.positions.push(x, y, z);
        tmp.fields.push(bfactor, occupancy);   // bfactor stands in for pLDDT
        tmp.elements.push(eid, 0, 0, 0);
    }

    const count = tmp.positions.length / 3;
    return {
        count,
        positions: new Float32Array(tmp.positions),
        fields:    new Float32Array(tmp.fields),
        elements:  new Uint8Array(tmp.elements),
        residueCount: tmp.residueIds.size,
    };
}
