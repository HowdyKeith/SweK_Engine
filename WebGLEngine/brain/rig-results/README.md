Rig (GTX 1080) result files, copied here as they stood on 2026-10-29. Each is read by its study's `report --in <file>`.
- fishVestibularStageA.4b-with-lambda.jsonl -- rung 4b stage A (164 circuits) plus the lower-lambda study (cxl50/cxl90 on P/B and P/whole), 170 records. Supersedes the earlier stage-A-only copy.
- needsCircuitStageA.rerun-amendment3.jsonl -- Piece 4 stage A, noisy gauge, rerun after Amendment 3 (reproduced the lost records exactly).
- advisorChipStageA.noisy.jsonl -- Round 4 advisor chip, 12 circuits, noisy gauge, fresh audits 111-162.
Not here: the Piece 4 clean-gauge run (still running; the earlier copy held only references).
These live under rig-results/ so a pull never collides with the rig's working files of the same name.
- fishVestibularReplicates.jsonl -- Addendum 10 (24 replicate circuits: lambda starts 0.5, 0.7 and NO STATE x 4 searches) AND Addendum 11 (24 shuffled-wiring controls at lambda 0.5), P/B and P/whole, fresh audits 83001-83060, plus refs:PR and refs:P: 50 records.
- livePractice1.llama3.1-8b.jsonl -- the first live practice run (llama3.1:8b through ollama). 45 of its 169 replies were lost to the terminal word-wrap fault fixed in advisorLive.cleanTerminal: a record of that fault, NOT a result.
- livePractice2.llama3.1-8b.jsonl -- the second live practice run (llama3.1:8b via ollama, after the terminal-output fix): 172 situations, 171 replies parse. A PRACTICE run on seeds 501-503, not an audit: brain alone 0.158, advised 0.133 over 6 dives (one dive crushed by the advice, one rescued).
- livePractice3.llama3.1-8b.jsonl, livePractice3.qwen2.5-7b.jsonl -- the broader practice runs: 16 dives (far, both x seeds 501-508), the same dives for both models, 457 and 449 situations. PRACTICE runs, not audits. llama3.1:8b: brain alone 0.198, advised 0.194. qwen2.5:7b: brain alone 0.198, advised 0.050 (it advised surfacing in 213 of 449 situations and the pump in 201, 193 of them with flooding at 0).
- (To come) fishVestibularGen2.jsonl -- Addendum 12 (NO STATE on real vs shuffled wiring, 4b-P); fishVestibularGen3.jsonl -- Addendum 13 (4b-E replicates).
