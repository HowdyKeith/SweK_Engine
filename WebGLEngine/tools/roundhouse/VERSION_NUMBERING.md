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
