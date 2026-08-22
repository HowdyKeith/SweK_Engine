// physics/xpbd/couplingRegistry.js
//
// The single source of truth for what couplings exist and how to drive them. The authoring UI (couple.html) builds
// itself entirely from this list -- the picker, the sliders, and which field the brush paints all come from here, so
// the UI holds no physics of its own and cannot drift from what is gated. Each entry carries only metadata plus a
// `substep` that DELEGATES to the already-verified module; the registry reimplements nothing. The gate proves that
// delegation is byte-for-byte faithful, so this file stays a faithful index and never a second copy of the physics.
//
// driver: "field"  -> the coupling reads a per-node scalar the brush paints (temperature, activation).
// driver: "strain" -> the coupling reads stress from the motion itself; nothing to paint (plasticity).
// kind:   "temporary" (relaxes from base) | "permanent" (rewrites base) | "selective" (only flagged fibers).
import { thermalModulate, modulatedSubstep } from "./modulate.js";
import { muscleModulate } from "./muscle.js";
import { plasticSubstep } from "./plastic.js";
import { fluidMeshSubstep } from "./fluid.js";

export const COUPLINGS = [
    {
        id: "thermal",
        label: "Thermal  (heat swells and softens)",
        driver: "field", fieldName: "temperature", kind: "temporary",
        params: [
            { name: "expansion", label: "Expansion", min: 0, max: 0.5, default: 0.15, step: 0.01 },
            { name: "soften", label: "Softening", min: 0, max: 30, default: 6, step: 0.5 },
        ],
        substep: (state, cons, batches, field, opts) => modulatedSubstep(state, cons, batches, (c) => thermalModulate(c, field, opts), opts),
    },
    {
        id: "muscle",
        label: "Muscle  (signal contracts fibers)",
        driver: "field", fieldName: "activation", kind: "selective",
        params: [
            { name: "contraction", label: "Contraction", min: 0, max: 0.8, default: 0.4, step: 0.05 },
        ],
        substep: (state, cons, batches, field, opts) => modulatedSubstep(state, cons, batches, (c) => muscleModulate(c, field, opts), opts),
    },
    {
        id: "plastic",
        label: "Plasticity  (yield dents permanently)",
        driver: "strain", fieldName: null, kind: "permanent",
        params: [
            { name: "yieldStrain", label: "Yield strain", min: 0.01, max: 0.5, default: 0.05, step: 0.01 },
            { name: "creep", label: "Creep", min: 0, max: 1, default: 0.4, step: 0.05 },
            { name: "maxStrain", label: "Max strain", min: 0.1, max: 2, default: 1.0, step: 0.1 },
        ],
        substep: (state, cons, batches, _field, opts) => plasticSubstep(state, cons, batches, opts),
    },
    {
        id: "fluid",
        label: "Fluid  (pressure caves, two-way)",
        driver: "body", fieldName: null, kind: "two-way",
        params: [
            { name: "fluidRadius", label: "Fluid radius", min: 0.05, max: 0.2, default: 0.09, step: 0.01 },
            { name: "contactRadius", label: "Contact radius", min: 0.1, max: 0.4, default: 0.26, step: 0.02 },
        ],
        // driver "body": two systems. substep(fluidState, meshState, meshCons, meshBatches, opts) -> both advance.
        substep: (fluid, mesh, meshCons, meshBatches, opts) => fluidMeshSubstep(fluid, mesh, meshCons, meshBatches, opts),
    },
];

export function couplingById(id) { for (const c of COUPLINGS) if (c.id === id) return c; return null; }
export function couplingIds() { return COUPLINGS.map((c) => c.id); }
