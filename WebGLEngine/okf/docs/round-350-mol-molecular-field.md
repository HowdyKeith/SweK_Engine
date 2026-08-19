---
type: doc
title: "Round 350 — `MOL!` molecular structures (instanced spheres + PDB import)"
tags: ["swek-engine", "round-doc"]
---

# Round 350 — `MOL!` molecular structures (instanced spheres + PDB import)

First of the three sister formats. Molecules as world entities with CPK or pLDDT confidence coloring, plus a bonus PDB text parser so real `.pdb` files from the Protein Data Bank or AlphaFold drop straight into the viewer.

## What landed

### `engine/molFormat.js`

24-byte stride matching the Python `AtomicFieldProcessor` from `lastai_finally.txt`:

```
Offset  Type     Field
------  -------  -----------------------------------
0-3     uint32   Magic = 0x214C4F4D ("MOL!" LE)
4-7     uint32   Atom count (N)
8+      N × 24 bytes:
          0-11   f32 × 3   Position (X, Y, Z) in Angstroms
          12-19  f32 × 2   pLDDT confidence + occupancy
          20-23  u8  × 4   Element ID + charge sign + 2 reserved
```

Element IDs are atomic numbers (H=1, C=6, N=7, O=8, P=15, S=16) so the renderer's CPK lookup is direct.

### `engine/molGenerator.js`

Three classes of generator + lookup tables:

**Element data:**
- `CPK_COLORS` — Corey-Pauling-Koltun palette (H white, C dark grey, N blue, O red, P orange, S yellow, plus metals)
- `VDW_RADIUS` — Van der Waals radii in Angstroms (rendered sphere size)
- `ELEMENT_REGISTRY` — name/symbol → atomic number, case-insensitive

**Synthetic structures:**
- `generateAlphaHelix(opts)` — 5-atom backbone per residue (N-Cα-C-O-Cβ stub), ~3.6 residues per turn, 1.5 Å rise. Defaults: 8 residues = 40 atoms with realistic pLDDT
- `generateWaterCluster(opts)` — O at center + 2 H at 104.5° angle, scattered in a 3D grid
- `generateDNADuplex(opts)` — Two strands with ~10 BP/turn helical spiral, P/O/C/N atom mix

### `engine/molPdbParser.js`

Real PDB text file parser. ~80 lines, handles `ATOM` and `HETATM` records with fixed-column parsing per the PDB v3.3 spec. Stops at `ENDMDL` so multi-model NMR files only show model 1. Element symbol falls back to atom-name first-letter when col 77-78 is missing.

Confirmed against a sample alpha-helix PDB block in T7: 6 ATOM lines + 1 HETATM (Zn at residue 100) → 7 atoms, 3 distinct residues, correct elements, correct coordinates, B-factors stored in `fields[i*2]` for pLDDT coloring.

### `engine/MolRenderer.js`

Multi-entity instanced sphere renderer. Same architecture as `P3dRenderer`/`OvmRenderer`:
- Shared low-poly icosphere (12 verts + 60 indices, 20 triangles) — efficient at typical viewing distances
- Per-instance attributes: position (vec3), radius (float, from VDW table × atomScale), color (vec3, mode-dependent)
- Color buffer is `DYNAMIC_DRAW` so switching CPK ↔ pLDDT mode only re-uploads color (one `bufferSubData` per mode change, verified in T9)
- `setColorMode(id, mode)` — flip an entity's coloring without rebuilding any other state

Fragment shader: Lambertian diffuse + specular pop (cos⁸ exponent) + subtle rim term. Molecules look properly glossy.

### `window.mol` console API

```js
window.mol.load(url, opts)       // fetch + decodeMOL + add
window.mol.loadPdb(url, opts)    // fetch + parsePDB + add (real PDB text)
window.mol.add(mol, opts)        // already-parsed mol struct
window.mol.list()
window.mol.clear()
window.mol.remove(id)
window.mol.update(id, patch)     // position/rotation/scale/colorMode
window.mol.setColorMode(id, mode)// "cpk" or "plddt"
```

### Demo panel features

- **Structure dropdown** — alpha-helix / water cluster / DNA duplex
- **Color radio** — CPK or pLDDT
- **Atom size slider** — 0.10 to 1.00 (VDW radius multiplier)
- **Auto-rotate** — slow Y-axis spin
- **🔄 Regenerate / 💾 Export .mol / 📂 Import .mol / 📂 Import .pdb**
- **📍 Place in world** — via `window.mol.add`

The PDB import is the standout — drop any `.pdb` file (AlphaFold output, RCSB download, your own protein) and it renders immediately.

## Asset pipeline matrix — now four formats

| Format | Console API | Source |
|---|---|---|
| `.ply` splat | `window.splat.load(url)` | Hunyuan3D / Gaussian splat training |
| `.p3d` mesh | `window.p3d.load(url)` | Pixal3D / marching cubes |
| `.ovm` voxels | `window.ovm.load(url)` | TRELLIS-2 sparse interceptor |
| **`.mol` atoms** | **`window.mol.load(url)`** | **AtomicFieldProcessor (Python) — or use `loadPdb` for real PDB files** |

All four follow the same pattern: tight binary header + interleaved payload, one `gl.bufferData()` per upload, console API mirrors. Drop one of each into the same world and they coexist:

```js
await splat.load("/assets/scene.ply")
await p3d.load("/assets/mesh.p3d")
await ovm.load("/assets/asset.ovm")
await mol.loadPdb("https://files.rcsb.org/download/1ALA.pdb")  // real protein from RCSB!
```

## Tests — 1572/1572 cumulative

`test_v350.mjs` adds 94 tests across 13 groups:

- **T1-T4** Format constants ("MOL!" magic decodes correctly LE), empty/single/multi-atom round-trip identity, error paths (bad magic, mismatched lengths, too-small buffer)
- **T5** Element data: `elementId` resolves H/CARBON/" o "/null/Xe correctly. CPK H=white, O=red, N=blue. VDW H=1.20Å, O=1.52Å
- **T6** Generators: 5-residue helix = 25 atoms with C/N/O present, 4-water cluster = 12 atoms with exactly 4 oxygens, 5 BP × 8 atoms DNA has 10 phosphorus atoms (1 per strand per BP)
- **T7** PDB parser: 6 ATOM + 1 HETATM = 7 atoms in 3 residues, coords preserved, elements correctly resolved (N/C/O/Zn), B-factor → pLDDT slot, ENDMDL stops parsing at end of model 1
- **T8** Color computation: CPK gives correct element colors, pLDDT gives correct ramp colors at three confidence levels (95 → dark blue, 75 → light blue, 45 → orange), VDW radii lookup correct
- **T9** Renderer: icosphere has 60 indices (20 tris × 3), `setColorMode` triggers `bufferSubData` (confirmed via stub GL tracking), invalid mode rejected, input validation rejects plain arrays where typed arrays required, draw count = 60 × atom count
- **T10** Main wiring: v350, MolRenderer/MolDemo/parsePDB all imported, `window.mol` exposed with `loadPdb` and `setColorMode` endpoints, DEMO_MODES has `mol` entry, both render hooks present
- **T11** End-to-end: synth → encode → decode → renderer.add → render
- **T12** Asset pipeline matrix has all four (splat + p3d + ovm + mol)
- **T13** Demo file integrity (PDB import button, Place in world button, both color modes, auto-rotate)

## Try it

```js
engineVersion()   // "v350"

demos.set("mol")
// → "DNA duplex", click Auto-rotate — visible double helix
// → switch to pLDDT coloring — confidence-graded
// → click Place in world, exit demo to see it in the live world

// Mix structure types — all coexist
await mol.add(MOL_GENERATORS.alphaHelix({ residues: 12 }))
await mol.add(MOL_GENERATORS.dnaDuplex({ basePairs: 20 }), { position: [10, 5, -10] })

// Real PDB from RCSB (if you have network from the engine page)
await mol.loadPdb("https://files.rcsb.org/download/1ALA.pdb")
mol.update(1, { colorMode: "plddt" })
```

## Why this round matters

Beyond the demo: this is a **portfolio piece for AlphaFold/structural biology audiences**. The pipeline is real:

1. Python side: `biopython` parses CIF/PDB → emits `.mol` binary (24-byte stride from the doc)
2. JS side: `decodeMOL` reads it directly, `MolRenderer` draws it
3. Or skip the binary: `mol.loadPdb()` reads the PDB text in-browser

Either way: AlphaFold-3 prediction → live WebGL with pLDDT confidence rendering, end-to-end, no installs beyond the engine.

## Lineup

| Round | What |
|---|---|
| ✅ v343-v346 | Demo trilogy + AO + shadows |
| ✅ v347-v348 | P3D viewer + editable installs + world entity |
| ✅ v349 | OVM world entity |
| ✅ **v350** | **MOL world entity + PDB parser** |
| v351+ | `MTO!` medical imaging or `WND!` fluid field |
| v352+ | Frustum chunks + octree LoD (the rendering-load track) |

Two sister formats remain. `MTO!` medical (CT/MRI segmentation) is the closest cousin to MOL since it uses the same 22-24 byte interleaved layout. `WND!` fluid is structurally different (RGBA32F texture, not instanced) so it'd test more of the engine.
