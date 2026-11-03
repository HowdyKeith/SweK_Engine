// WebGLEngine/tools/ship/deciderAuditCmd.mjs -- the command of tools/ship/deciderAudit.mjs (no exports on purpose).
// Start the model server first (it keeps the weights loaded):  python tools/ship/deciderServe.py --model Mapika/decider-2b --port 8765
// Run: node tools/ship/deciderAuditCmd.mjs record --model-id Mapika/decider-2b --out brain/rig-results/deciderAudit-decider-2b.jsonl [--url http://127.0.0.1:8765/ask] [--max-calls N] [--dry-run]
//      node tools/ship/deciderAuditCmd.mjs report --in brain/rig-results/deciderAudit-decider-2b.jsonl
import { command } from "./deciderAudit.mjs";
process.exitCode = await command(process.argv.slice(2));
