# RETIRED FILES — THE RECORD THAT REPLACES RECEIPTS THAT NO LONGER EXIST

Two gates asserted that a `.zip` recovery archive sat in this directory for each retirement below.
Those zips are gone, and **their contents are not recoverable from anywhere reachable**:

* `WebGLEngine/brain.js` appears in **none** of this repository's 64 commits. The deletion predates the repo.
* No commit in this repository's entire history deletes any file at all (`--diff-filter=D` returns zero).
* `.gitignore` line 40 excludes `*.zip`, and line 47 says so deliberately: *"The tools/ship/deleted/deleted_*.zip
  tombstones stay out."* The receipts were **never tracked**, so they only ever existed on the one machine that
  performed the deletion. In a clone, an unzipped delivery, or a fresh container, those gates could not pass —
  not because a cleanup binned the receipt, but because a receipt was never able to arrive.

**This file exists because the alternative was fabricating them.** Creating `stale-brain-duplicate.zip` and
`engine-barrel.zip` would have turned both gates green in seconds and made them certify a reversibility that does
not exist — the precise failure the archive rule was written to prevent. A receipt for a deletion you cannot
reverse is worse than a red gate, because it stops anyone looking.

The deletions themselves were **correct** and are not in question. What is retired here is the *unsatisfiable
assertion*, not the memory.

## What was deleted

| file | what it was | why it went | content |
|---|---|---|---|
| `WebGLEngine/brain.js` | stale duplicate of `brain/brain.js`, sat ~60 versions behind | a second declaration site that the bump never edited by name; nothing noticed until a broken-import scan tripped over it | **LOST** |
| `WebGLEngine/engine/index.js` | a three-line barrel that would throw on its first import | latent only because nothing imported it; it re-exported names that had not existed for ~923 versions | **LOST** |
| `WebGLEngine/engine/bootstrap.js` | went out with the barrel cluster | same cluster | **LOST** |
| `WebGLEngine/engine/world.js` | re-exported by the barrel | **NEVER EXISTED** — Keith swept 203 archived builds spanning v2282..v3205 and it is in none of them | n/a |
| `WebGLEngine/engine/renderer.js` | re-exported by the barrel | **NEVER EXISTED** — same sweep | n/a |

The last two are not losses. A barrel re-exporting them is why deleting it was the fix rather than the dodge.

## The v3524 baseline retirement — a different case, and a much better one

`baselineAgreement-selfcheck.mjs` demanded a zip for these three, and was the **third** gate caught by the same
unsatisfiable assertion; v3936 fixed two and missed it. It is recorded here for the same reason — but the loss is
of a different kind, and flattening the two would be its own dishonesty.

| file | what it was | why it went | content |
|---|---|---|---|
| `tools/roundhouse/result-baseline.json` | the second of two value baselines over one lab | v3524 **measured** it a strict subset of `lab-results-baseline.json`: all 245 keys present, **zero** unique, 0 of its 1734 fields missing, 0 holding a different value | **RECONSTRUCTIBLE** from the survivor — it was a subset, and that was proven before it went |
| `tools/roundhouse/resultBaseline.mjs` | the loader beside it | went out with the data it loaded | **LOST** |
| `tools/roundhouse/resultBaseline-selfcheck.mjs` | its gate | owned one check nothing else had: *a 5% planted move is detected and reported with the old and new values* | **LOST** — but the check was **ported first**, and section 2 of `baselineAgreement-selfcheck.mjs` asserts it still fires |

None of the three appears in any commit of this repository, so git is not a receipt for them either.

**This retirement is the one the archive rule was written to permit, not the one it was written to prevent.** The
data was proven redundant before deletion and the one unique assertion was moved before deletion — so what a zip
would have restored is a file whose every value is still in the tree and two files whose only irreplaceable
content is already running. That is why the gate now asserts *this record and the ported plant* instead of a
receipt: the receipt would certify a reversibility nobody needs, while the plant certifies the thing that would
actually have been lost.


## What is still asserted, and what is not

Still asserted, because it is still checkable and still the property worth having:

* `WebGLEngine/brain.js` has **not come back**, and the marker it duplicated is declared in exactly one file.
* `WebGLEngine/engine/index.js` has **not come back**, and no import in the tree resolves to a missing file.
* **This record exists and names every retired file.** Deleting it turns both gates red, so the loss cannot be
  quietly forgotten the way the zips were.

No longer asserted: that a recovery archive exists. It does not, it cannot be reconstructed, and continuing to
demand it made two gates permanently red for a reason no round could ever act on.

## If a copy ever turns up

Restoring either file to `tools/ship/deleted/` is strictly better than this record. If that happens, put the zip
back, re-add the archive assertion to the gate that owns it, and delete the corresponding row above — the same
way v3205 deleted `gpu/MemoryHeatmapOverlay.js`'s entry when Keith found it in a v3145 archive rather than
growing it. **Naming the correct response in advance is what produced it that time.**
