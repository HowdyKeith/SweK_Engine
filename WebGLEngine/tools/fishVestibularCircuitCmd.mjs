// WebGLEngine/tools/fishVestibularCircuitCmd.mjs -- UNNUMBERED. Prints the facts of rung 4b's circuit from the vendored tables (tools/fishVestibularCircuit.mjs).
import { extract, factLines } from "./fishVestibularCircuit.mjs";
for (const l of factLines(extract())) console.log(l);
