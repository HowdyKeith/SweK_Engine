## v3905 -- THE WIDENED REGEX, RUN BESIDE THE NARROW ONE RATHER THAN INSTEAD OF IT -- AND IT CAUGHT v3904

Keith: "fixed: widening the regex." v3904 reported, while using it, that `definitionGates` reads
`export const NAME = (` and `export function NAME` and nothing else -- so an exported TABLE, an exported
CONSTANT, a class, an async function and a separately-declared `export { name }` were all outside its subject.

*** THAT IS 316 DEFINITIONS IN physics/ ALONE, AND A WRONG CONSTANT IS THE FOUNDING CASE OF THE WHOLE FILE:
"a 1% error in r_s = 2M survived five gates". THE INSTRUMENT COULD NOT SEE THE SHAPE OF ITS OWN ORIGIN STORY. ***

    narrow rule   1508 definitions   110 unmentioned    (function 1195, arrow 313)
    wide rule     1824 definitions   184 unmentioned    (+ value 245, named export 61, async fn 6, class 4)

### THE WIDENING IS A PARAMETER, NOT AN EDIT, AND THAT IS THE WHOLE DESIGN

Section 1's pin of 37 was set against 608 symbols found by the narrow rule. **Widening the rule in place would
have moved the denominator underneath a frozen ratchet without moving the ratchet** -- the exact defect this
file's siblings have written on them in three places (androidUpdateDoor asserting a spelling, caseStudy baking a
live count). So `definitionCoverage(root, { wide })` takes a parameter, **section 1 still calls the narrow rule
and still reads 110 against the frozen 37**, and the wide population gets its own reporting and its own floor.
There is a negative control on exactly that: a fixture asserting the narrow rule still sees only its two forms,
so a `wide` that leaked into the default would fail rather than silently re-baseline the tree.

### WHAT THE WIDENING REVEALS, AND IT IS A MUCH DARKER CLASS

74 definitions are unmentioned under the wide rule that the narrow rule could not see. **71 of the 74 are reached
by NO gate anywhere** -- against the narrow rule's 110, where 34 were already driven by a subject-named gate. The
difference is not an accident of which folder: v3904's cluster was *functions*, and a function tends to be called
by somebody's gate even when its own is silent. **A constant is not called. It is read, and nothing reads it.**

    the new dark, by cluster:  physics 15, xpbd 8, sph 7, thermal 6, predict 5, statmech 5, sync 5, hmc 4 ...

### AND IT CAUGHT THE ROUND THAT SHIPPED AN HOUR AGO -- TWICE

**(1) THE ONE COMMENT-ONLY DEFINITION IN 1824, AND v3904 WROTE IT.** The ungated test reads the RAW gate source,
so a name in a comment counts as a mention. That is section 2's stated floor and it is fine as far as it goes --
but the widening made the weakness measurable for the first time, and the answer across the whole census is a
single entry: `physics/render/furnace.mjs:EXPECTED_COSINE`, which v3904 named in a comment while **re-typing its
value as `4 / 3` in the assertion beside it**. A second declaration of a prediction, committed by the round that
was closing that very cluster. It reads `EXPECTED_COSINE.wrongPdf` and `.clean` from the module now, and
comment-only is a floor at 0. *** NOBODY CAN RUN A SENTENCE ABOUT A CONSTANT. ***

**(2) v3904's CLUSTER FLOOR HAD A HOLE THE NARROW RULE COULD NOT SEE.** Sabotage: add
`export const MESH_TOLERANCE_TABLE = {...}` to `physics/mesh/discontinuity.mjs` and leave it ungated.
**Section 4's floor -- the one v3904 shipped -- PASSES. Section 5's wide floor catches it.** A floor set under a
rule that cannot see tables was worth less than it looked, and the same registry now guards both populations, so
a cluster cannot be closed under one rule and dark under the other.

Both closed clusters survive the stricter instrument: physics/mesh and physics/render add **no** dark definition
under the wide rule.

### WHAT COUNTS, AND THE TWO THINGS THAT DELIBERATELY DO NOT

    counted:      export const/let/var NAME = <anything>     tables, arrays, bare constants
                  export const A = 1, B = 2                  BOTH names -- a multi-declarator is two definitions
                  export async function NAME / export class NAME
                  export { NAME }                            ONLY when NAME is declared in this same file

    NOT counted:  export { NAME } from "./other.mjs"         a re-export is not a definition
                  export { NAME } where NAME was IMPORTED    48 of these in physics/; counting them would move
                                                             another module's debt onto this one

Every form is driven by a fixture it must find, and both exclusions by one it must refuse -- because the way a
widened regex goes wrong is silently: **a pattern that matches nothing costs nothing and proves nothing.** The
multi-declarator case is real rather than hypothetical (`export const DT = 0.016, GRAVITY = [0, -10, 0];` appears
five times), and counting only the first name is how a scanner reports a smaller, wronger number and looks like
it improved.

### ALSO IN THIS ROUND

- The cross-gate reach classifier and the `CLOSED` cluster registry are **hoisted out of section 4** so section 5
  uses the same ones. Two copies of "which gate reaches this definition" is the duplicated-table defect this tree
  has paid for eight times.

### HONEST NOTES AND LIMITS

- **The multi-declarator split only handles statements that end on their line.** Every one in the tree does. A
  multi-line declarator list would have its first name counted and the rest missed -- stated here rather than
  discovered later.
- **Comment stripping is line-wise `//` plus `/* */`,** the same rule the file already used for `importOnly`. A
  name inside a template literal in a gate would read as code. Not seen; not guarded.
- **`definitionGates` stays RED**, at 110 against the frozen 37, exactly as at v3904. The widening did not touch
  the pinned population and the pin did not move.
- **The population still stops at `physics/`** -- v3368's finding, unchanged and not addressed here. The same
  scan over the whole tree finds more.
- Runtime 9.3s, up from 5.2s: the wide scan walks the modules a second time and classifies 74 new entries
  against 1100 gate files. `deadImportScan` is red for its pre-existing reason ("the deleted barrel left a
  recovery archive behind"), verified against a pristine v3903 extraction.
- The four physics gates from v3904 are green; `--affected` over the two changed files reports 1 of 2, and it is
  the section-1 ratchet.
