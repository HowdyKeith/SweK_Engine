// WebGLEngine/tools/ship/takeRankingReplicationCmd.mjs -- UNNUMBERED. The command line of the round 8 reader (tools/ship/takeRankingReplication.mjs). The three flights are takeRankingValidityCmd.mjs's (the first-order orientation step is set there):
//   node tools/ship/takeRankingValidityCmd.mjs fly --out brain/rankingReplicationH40.jsonl   --from 11    --to 20    --kinds plain,deep,far,both --workers 4
//   node tools/ship/takeRankingValidityCmd.mjs fly --out brain/rankingReplicationBig.jsonl   --from 23001 --to 23100 --kinds plain,deep,far,both --workers 4
//   node tools/ship/takeRankingValidityCmd.mjs fly --out brain/rankingReplicationAudit.jsonl --from 22001 --to 22600                               --workers 4
//   node tools/ship/takeRankingReplicationCmd.mjs report        (READ ONCE; OFFLINE)
import { command } from "./takeRankingReplication.mjs";
process.exitCode = await command(process.argv.slice(2));
