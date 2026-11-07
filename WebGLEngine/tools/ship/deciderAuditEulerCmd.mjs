// WebGLEngine/tools/ship/deciderAuditEulerCmd.mjs -- UNNUMBERED. The command of tools/ship/deciderAudit.mjs with the FIRST-ORDER orientation step said out loud (the same arguments as tools/ship/deciderAuditCmd.mjs).
//   node tools/ship/deciderAuditEulerCmd.mjs report --in brain/rig-results/deciderAudit-decider-2b.jsonl
// WHY: the recording of Mapika/decider-2b was made under the first-order step (the series' step); RK4 has been the engine's default since 2026-11-04, and a replay under it flies dives whose situations the transcript does not hold, so it REFUSES
// ("the transcript has no recorded answer for this situation ... a replay never invents one") instead of reading anything. Under the first-order step all 4,218 asks are found (answer rate 1.000).
import { setOrientationDefault } from "../../physics/mechanics/rigidBody6dof.mjs";
setOrientationDefault("euler");
const { command } = await import("./deciderAudit.mjs");
process.exitCode = await command(process.argv.slice(2));
