# Version numbering on this branch

**This branch's v4190–v4194 are NOT main's v4190–v4194.** They are five different rounds that happen to
carry the same labels, and after the merge both sets live in the same tree.

| number | main | this branch |
|---|---|---|
| v4190 | sound effects as data | the registry-wide mode-distinctness gate |
| v4191 | the DOM is a source too | plastic's budget claimed snug, exceeded by 41% |
| v4192 | the spell book | the lab's value freeze went red and would not say how red |
| v4193 | a clip as a reproducible input | the runaway that had stopped running away |
| v4194 | an accessibility defect | the stale-number sweep, four devices |

## Why this matters here specifically

Headers in this tree cite version numbers as the primary way of referring to prior findings — "v3194's
mode in name only", "v4170's vestigial field", "v3806's flip2d lesson". That convention only works while a
number names one thing. `cflBind.mjs` currently says "the SPH changes traced at v4193", and a reader has
two v4193s to pick from.

## What was done about it, and what was not

**NOT renumbered.** Rewriting the five commit messages means force-pushing two already-pushed branches, and
another session is working this engine on main; history rewrites are not worth the risk of disturbing it.
The 31 in-file markers were left alone for the same reason — churning them would conflict with anything
that session touches in the same files.

**Numbering continues at v4298.** Main is at v4296 with v4297 in flight, so this branch's next round takes
v4298 and there are no further collisions going forward. When citing one of the five ambiguous numbers,
say "this branch's v4193" or cite the finding rather than the number.

---

## *** v4315: THAT PREDICTION WAS WRONG, AND IT WAS WRONG FOR A REASON WORTH KEEPING ***

"There are no further collisions going forward" lasted exactly as long as it took main to ship three more
rounds. Main went v4297, **v4298, v4299, v4300** — and this branch had already spent v4298, v4299 and v4300.
Three new collisions, on top of the five:

| number | main | this branch |
|---|---|---|
| v4298 | the song button, and the dead link it found | numbering moved clear of main, two more devices swept |
| v4299 | Levels 11–13: the GPU decides what to draw | sweep for header ladders — 48 found |
| v4300 | Level 14: the economy closes its loops | four more ladders adjudicated |

**THE STRATEGY WAS THE BUG, NOT THE NUMBER.** "Pick a number above where main is" only works if main stops
advancing, and main is a live branch. A monotonic counter shared by two writers with no coordination
collides by construction; choosing a bigger starting point buys a delay, not an exemption. Same shape as a
baseline chosen to be comfortably above today's value: it describes the moment it was written and nothing
after it.

**AND THE EXPOSURE IS NOT THREE, IT IS FIFTEEN.** This branch has spent v4298 through v4315. Main is at
v4300. Every round main ships from here walks into a number this branch has already used, until one of two
things happens: this branch merges into main, or the branch stops numbering in that range. Nothing about
the current arrangement prevents the other twelve.

**Still NOT renumbered**, for the reason it was not renumbered before: another session works this engine on
main, and a history rewrite of pushed branches is not worth disturbing it. What is different now is that
the doc no longer claims the problem is over. The reliable way to refer to a finding across these two
branches is to name the finding, not the number — "the round that found plastic's budget exceeded by 41%"
resolves; "v4191" does not.
