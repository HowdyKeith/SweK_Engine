// WebGLEngine/tools/ship/trainDecisionCircuitCmd.mjs -- UNNUMBERED. The command line of the decision-circuit training (tools/ship/trainDecisionCircuit.mjs); see there for the arguments.
// THE FIRST-ORDER ORIENTATION STEP: every number of the needs-and-limits series (and Round 33's twin gain this round is read against) was measured under it, and RK4 has been the engine's default since 2026-11-04; this command says euler out loud, in every worker process it starts,
// so that the training, the audit and the calibration are all on the dynamics the series was measured on. (A library does not set it: the gates are for the default.)
import { setOrientationDefault } from "../../physics/mechanics/rigidBody6dof.mjs";
setOrientationDefault("euler");
const { command } = await import("./trainDecisionCircuit.mjs");
process.exitCode = await command(process.argv.slice(2));
