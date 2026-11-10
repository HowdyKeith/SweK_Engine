// WebGLEngine/tools/ship/takeThirdAuditCmd.mjs -- UNNUMBERED. The command line of the plain net's third audit (tools/ship/takeThirdAudit.mjs). The flight is takeRankingValidityCmd.mjs's:
//   node tools/ship/takeRankingValidityCmd.mjs fly --arms rule-low06,plain:2 --from 20001 --to 20600 --out brain/plainThirdAudit.jsonl --workers 2        (the first-order orientation step is set there)
//   node tools/ship/takeThirdAuditCmd.mjs report --in brain/plainThirdAudit.jsonl                                                                         (READ ONCE; OFFLINE)
import { command } from "./takeThirdAudit.mjs";
process.exitCode = await command(process.argv.slice(2));
