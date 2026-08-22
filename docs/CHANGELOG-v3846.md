## v3846 -- KEITH SETTLED THE sirt DEFAULT, AND MEASURING IT FIRST CHANGED WHAT "SETTLED" MEANT

The standing item was "moving the default is Keith's call" (v3615, restated v3616), and the call came back: move
it. *** MEASURING IT BEFORE MOVING IT TURNED A ONE-LINE CHANGE INTO A DIFFERENT ROUND, AND THE MEASUREMENT IS
THE ROUND. *** v3616 recommended the matched adjoint off ONE reading -- 16 angles at N = 96 -- and that reading
is correct and is not the whole shape.

*** THE TWO OPERATORS CROSS OVER WITH ANGLE COUNT -- AND I NEARLY REPORTED THAT AS A DISCOVERY WHEN THE TREE
ALREADY KNEW IT. *** ct.html has said so since v3617, verbatim: "It holds at 30 angles here and REVERSES at 90
... the correlation comparison FLIPS with angle count while the residual comparison does not -- the wrinkle is
an effect of SPARSE angles, not a general law." THAT IS THE FINDING, WRITTEN DOWN THIRTY VERSIONS AGO, ON A
PAGE. It is v2881/v2883's shape exactly -- reading one file and missing the correction already recorded in
another -- and it surfaced here only because toolFrontDoor's tool registry was open for an unrelated reason.
CORRECTED BEFORE SHIPPING RATHER THAN AFTER, which is the only reason it is a note and not a defect.

SO WHAT IS ACTUALLY NEW IS TWO THINGS, AND NEITHER IS THE CROSSOVER:

  (1) *** THE CROSSOVER NEVER LEFT THE PAGE. *** It is in ct.html's prose and in reportingTools' blurb, and in
      NEITHER sirt.mjs's header, NOR sirt-selfcheck, NOR the standing "moving the default is Keith's call" that
      three module headers kept repeating. THE FACT THAT DECIDES THE QUESTION SAT IN THE ONE PLACE NOBODY
      RE-READS WHEN DECIDING IT -- reachable and findable are two different edits, in prose this time.
  (2) *** THE SPARSE-SIDE GAP IS SATURATION, NOT BUDGET, WHICH ct.html'S FIXED-BUDGET NUMBERS COULD NOT
      ESTABLISH. *** "Matched loses the correlation at 30" leaves open the reading that it had simply not
      arrived yet -- exactly what v3616 said about the OTHER operator. Run to convergence, it does not close.

Swept across the angle counts sirt.mjs actually publishes, on its own phantom, run to convergence rather than
to a budget:

    nAngles      FBP        shipped @300      matched (converged)        winner
       12      0.874950     0.970618          0.954752  (resid 3.0e-4)   SHIPPED
       30      0.956257     0.987556          0.981497                   SHIPPED
      120      0.987036     0.996503          0.999732  (resid 1.29)     MATCHED

The matched operator's correlation SATURATES below the shipped pair where the data is sparse, and MORE BUDGET
DOES NOT CLOSE IT: 0.952483 at 300 iterations, 0.954752 at 2400, 0.954752 at 4800, with the residual down to
3.0e-4. *** THAT IS NOT EARLY STOPPING WEARING A DISGUISE -- IT WAS CHECKED TO CONVERGENCE. *** It is v3612's
ambiguity arriving from a third direction: the least-squares solution of an underdetermined system is not the
best picture, so DESCENDING FURTHER ON ||Ax - b|| BUYS THE DATA AND DOES NOT BUY THE OBJECT. At 120 views the
system is determined enough that the two agree about what the data means, and there the matched operator wins
outright on both numbers.

*** SO MOVING THE DEFAULT WHOLESALE WOULD HAVE REGRESSED THIS FILE'S OWN HEADLINE FINDING. *** FINDING 1 is
"the advantage is largest where the data is sparsest", and at twelve views the gain would have fallen +0.0957
-> +0.0776. A ROUND MUST NOT MOVE A VERDICT IT IS NOT ABOUT (v3679). Put to Keith with the numbers, the call
was SPLIT BY QUESTION, and both defaults are now right for theirs:

    sirt()         / landweber()         RECONSTRUCTION -- "what does the object look like". Defaults to
                                         backProject, UNCHANGED. Every published correlation stays
                                         reproducible and the hash-pinned MEASURED_V3613 table does not move.
    sirtDescent()  / landweberDescent()  THE OBJECTIVE -- "how small can ||Ax - b|| get". Defaults to
                                         matchedBackProject, because the other pair provably does not
                                         minimise the thing the claim names.

*** AND THE DEFECT THIS ACTUALLY FIXES WAS IN A GATE, WHICH IS WHY IT SURVIVED THIRTY VERSIONS AFTER v3616
PROVED THE PHYSICS. *** sirt-selfcheck's section 2 asserted "the residual falls at every checkpoint" over 200
iterations USING sirt(), THE OPERATOR THAT DOES NOT DESCEND. v3616 proved the shipped pair turns round and
nothing propagated that into the gate making the descent claim. MEASURED on that gate's own fixture (N = 48,
24 angles, 4000 iterations): the shipped pair bottoms out at 4.3452 near iteration 750 and RISES to 7.5556,
while the matched operator falls monotonically to 0.2945 and is still falling -- SO THE SHIPPED PAIR'S BEST
RESIDUAL IS STILL 14.8x THE MATCHED OPERATOR'S LAST. *** THE CLAIM WAS TRUE, AND TRUE ONLY INSIDE A BUDGET
SHORT ENOUGH TO STOP BEFORE THE TURN -- the same shape as a tolerance chosen by looking at where the
measurement landed. *** The descent claim now runs on the operator that owns it and PAST the turn, and the
non-monotonicity of the shipped pair is asserted beside it, so the split is evidence rather than preference.

================================================================================================================
TIER 2: physics/tomography/sirtKeys-selfcheck.mjs is NEW, AND EVERY CLAIM THIS MODULE HAD WAS SELF-REFERENTIAL
================================================================================================================

sirt's own gate checked that one step equals step * B b (an identity between two spellings of the same code),
that the residual falls (measured by the same residual() the iteration drives), and that the reconstruction
correlates with the truth it was built from. *** NONE OF THOSE CAN SEE A WRONG OPERATOR, AND ONE HAD BEEN
SHIPPED SINCE v3613. *** Three keys, all from outside the tree, gate-only, no shipped module changed to make
them pass:

  A. THE ADJOINT IS A DEFINITION, NOT AN OPINION. <Ax, y> = <x, A^T y> for all x, y is what "transpose" MEANS
     -- no tolerance argument, no reference implementation. MEASURED at N = 32: matchedBackProject 2.665e-14,
     backProject 1.733e+1 AGAINST INNER PRODUCTS OF SIZE 1.809e+1. *** THE DEFECT IS THE SIZE OF THE ANSWER,
     and the two are separated by 6.5e14 -- no tolerance choice could put them on the same side of a line. ***

  B. LANDWEBER'S STEP BOUND IS A CLOSED FORM, AND IT IS THE SAME SHAPE AS THE VON NEUMANN CFL LIMIT v3842
     GRADED cfl.js AGAINST. The theorem: the iteration converges iff 0 < lambda < 2 / sigma_max(A)^2. MEASURED:
     lambda_max(A^T A) = 4.757077e+2, so the ceiling is 4.204262e-3. At 0.99x the bound the residual is
     monotone and lands at 4.577e-1; AT 1.01x IT DIVERGES TO 1.089e+6. *** THE BOUNDARY IS SHARP TO ONE
     PERCENT EITHER SIDE, WHICH IS WHAT MAKES IT A KEY AND NOT A GUIDELINE. *** Also swept at 0.25x / 0.5x /
     0.9x (all monotone) and 1.1x / 1.5x (1.9e+34 and 1.0e+123).

     *** AND THE SHIPPED powerStep IS GRADED AGAINST A BOUND IT WAS NEVER TOLD. It solves for 1/lambda_max by
     power iteration and knows nothing about the theorem's factor of 2; that it lands at EXACTLY 0.5000000000
     of the ceiling is the closed form agreeing with the code rather than the code restating the closed
     form. ***

  C. STATIONARITY OF THE NORMAL EQUATIONS -- calculus, not tomography. A minimiser of ||Ax - b||^2 has gradient
     -2 A^T(b - Ax) = 0, so the gradient norm must collapse: MEASURED 8.7720e+3 at x = 0 -> 6.4979e-3 after
     6000 matched iterations, a factor of 1.35e+6. *** THE THEOREM ONLY APPLIES WHEN B IS THE ADJOINT, WHICH IS
     WHY THE SHIPPED PAIR HAS NO STATIONARITY CLAIM AVAILABLE TO IT AT ALL. ***

15 checks, RUNTIME 1.6 s measured with time(1) -- cheap because N = 32 is enough: these are IDENTITIES AND
BOUNDARIES, and neither needs a big grid to be decisive.

NO KEY IS CLAIMED FOR THE CROSSOVER, and it is reported rather than asserted as one. Which reconstruction looks
right is not a number this sandbox can settle; the keys grade the OBJECTIVE, and the objective is provably not
the picture. The gate says so in its own tail.

NOT CLAIMED: that the matched operator reconstructs worse. At N = 48 / 24 angles it reads 0.983912 against the
shipped pair's 0.904417 over the same 4000 iterations -- THE CROSSOVER IS ABOUT HOW UNDERDETERMINED THE SYSTEM
IS, not about the operator being good or bad, and two of this file's three published angle counts happen to sit
on the sparse side. NOT CLAIMED: that sirt.mjs reconstructs well; keys A-C grade the ITERATION AS AN OPTIMISER
and the quality of the picture stays FINDING 1's business.

PAIRED EDITS NAMED HERE FOR frozenReferee: physics/tomography/reconOps.mjs (+ landweberDescent) and
physics/tomography/sirt.mjs (+ sirtDescent, stepForMatched, MEASURED_V3846) with
physics/tomography/sirt-selfcheck.mjs; physics/tomography/sirtKeys-selfcheck.mjs is NEW and is GATE-ONLY -- a
pure consumer of unchanged modules, which is what a Tier-2 grading gate should be. reconOps-selfcheck's
"landweber still defaults to backProject, so v3613's readings stay reproducible" IS STILL GREEN AND IS THE
POINT: the split added an entry point, it did not move one.

GATES GREEN: sirtKeys (new), sirt, reconOps, matchedAdjoint, adjoint, ambiguity, ct, reconQuality, fanbeam,
tomographyBind, adjointBind. No device added; the ct device is still deliberately unchanged.

CARRIED REDS, NONE MINE AND ALL PRE-EXISTING: gateQuality (mpmGpuPage-selfcheck prose-as-code, baseline 41 --
and it scanned sirtKeys-selfcheck and did NOT flag it, which is the useful half of that report),
toolFrontDoor-selfcheck (reconOps silent -- reconOps.mjs still has no printing front door; this round added an
export, not a door), deviceInstrumentMap-selfcheck, plantedCoverage-selfcheck (undeclared 6),
discovery-selfcheck, coverageTriage-selfcheck.

TIER 2 CONTINUES, AND IT IS ONE NAME: ambiguity.mjs. sirt.mjs is done and its blocker is retired.
