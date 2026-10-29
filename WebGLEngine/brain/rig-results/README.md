Rig (GTX 1080) result files, copied here as they stood on 2026-10-29. Each is read by its study's `report --in <file>`.
- fishVestibularStageA.4b-with-lambda.jsonl -- rung 4b stage A (164 circuits) plus the lower-lambda study (cxl50/cxl90 on P/B and P/whole), 170 records. Supersedes the earlier stage-A-only copy.
- needsCircuitStageA.rerun-amendment3.jsonl -- Piece 4 stage A, noisy gauge, rerun after Amendment 3 (reproduced the lost records exactly).
- advisorChipStageA.noisy.jsonl -- Round 4 advisor chip, 12 circuits, noisy gauge, fresh audits 111-162.
Not here: the Piece 4 clean-gauge run (still running; the earlier copy held only references).
These live under rig-results/ so a pull never collides with the rig's working files of the same name.
- fishVestibularReplicates.jsonl -- Addendum 10: 24 replicate circuits on 4b-P (lambda starts 0.5, 0.7 and NO STATE x 4 searches, P/B and P/whole), fresh audits 83001-83060, plus refs:PR and refs:P (26 records).
- livePractice1.llama3.1-8b.jsonl -- the first live practice run (llama3.1:8b through ollama). 45 of its 169 replies were lost to the terminal word-wrap fault fixed in advisorLive.cleanTerminal: a record of that fault, NOT a result.
