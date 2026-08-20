---
type: claim
title: You cannot measure substance by counting words
description: "The Anti-Dump Index (github.com/VolkanSah/Anti-Dump-Index, AGPL-3.0, web-verified) scores input quality to gate expensive LLM calls -- this engine's own idea, pointed at prompts in"
tags: [settled, "swek-engine", v2548]
timestamp: v2548
---

# You cannot measure substance by counting words

- **Status:** settled  
- **Since:** v2548

## Prediction

The Anti-Dump Index (github.com/VolkanSah/Anti-Dump-Index, AGPL-3.0, web-verified) scores input quality to gate expensive LLM calls -- this engine's own idea, pointed at prompts instead of builds. Its section 9.2 Substance Score claims to detect 'fancy but empty' inputs. PREDICTION: it can be beaten by typing, because a keyword is a thing you can type.

## Why

ADI asks DOES THIS TEXT LOOK LIKE SUBSTANCE, which is answerable by pasting nouns. claimsGate (v2541) asks CAN THIS BE KILLED, which is not: a kill condition has to survive contact with reality. That is the whole difference, and it is why this module is NOT wired into verify.mjs.

## Measured

BEATEN. Using the dictionary from the WebGPU port: an honest sentence containing a real measurement scores 0.00; 'help plsss fix asap' scores 0.00; nine keywords in a row saying nothing scores 10.00. THE EMPTY ONE WINS BY 10x AND THE HONEST ONE TIES WITH PURE NOISE. And it is not a tuning problem -- pasting the same three words twice more raises the score 2.00 -> 8.00, so a BIGGER dictionary is a bigger vocabulary to paste from. SEPARATELY, the README's own worked example 5.3 does not close: (0 - (2.0*1.0 + 0.5*0.5)) / (1.5*1.0 + 1.5*1.0) = -0.75, not the -0.92 printed. Example 5.2 (unweighted) closes exactly. Example 5.1 prints (0.75-0.1)/(0+0) = INFINITY as a score.

## Kill condition

Show an input that is genuinely empty but scores LOW, and a genuinely substantive one that scores HIGH, using a published dictionary the author of the input can read. If the dictionary must be secret to work, it is security by obscurity and not a measure.

# Citations

- Code: tools/ship/substance.mjs + substance-selfcheck.mjs (14 checks, gated). IN FAIRNESS: the gaming measurement uses the 12-word dictionary from the pasted WebGPU port, NOT adi.py's real regexes -- adi.py may score those three inputs better. The STRUCTURAL claim is independent of dictionary size and that is what is asserted. My transcription of 9.2 and 9.3 is hand-checked against the README so the criticism lands on the METHOD, not on my arithmetic.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
