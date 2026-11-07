// WebGLEngine/tools/ship/takeKindMatchedCmd.mjs -- UNNUMBERED. The command line of the round 9 reader (tools/ship/takeKindMatched.mjs). The three flights are takeRankingValidityCmd.mjs's (the first-order orientation step is set there):
//   node tools/ship/takeRankingValidityCmd.mjs fly --out brain/kindMatchedMixed.jsonl   --from 24001 --to 24150 --kinds plain,deep,far,both --workers 4
//   node tools/ship/takeRankingValidityCmd.mjs fly --out brain/kindMatchedMatched.jsonl --from 24151 --to 24450 --kinds far,both --workers 4
//   node tools/ship/takeRankingValidityCmd.mjs fly --out brain/kindMatchedAudit3.jsonl   --from 25001 --to 25600 --kinds far,both --workers 4
//   node tools/ship/takeKindMatchedCmd.mjs report        (READ ONCE; OFFLINE)
import { command } from "./takeKindMatched.mjs";
process.exitCode = await command(process.argv.slice(2));
