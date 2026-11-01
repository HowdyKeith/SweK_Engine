// WebGLEngine/tools/ship/advisorLlmAuditCmd.mjs -- the command of tools/ship/advisorLlmAudit.mjs (no exports on purpose).
// Run: node tools/ship/advisorLlmAuditCmd.mjs record --model-id <tag>-t0 --cmd "ollama run <ollama name>" --practice <practice transcript> --out brain/llmAudit-<tag>-t0.jsonl [--max-calls N] [--dry-run]
//      node tools/ship/advisorLlmAuditCmd.mjs report --in <recording>[,<recording>...]
import { command } from "./advisorLlmAudit.mjs";
process.exitCode = await command(process.argv.slice(2));
