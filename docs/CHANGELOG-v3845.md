## v3845 -- THE TIER-1 FLUID PLANTS, AND TWO ITEMS THE ROADMAP WAS STILL ASKING FOR AFTER THEY SHIPPED

The brief was "Tier-2 keys: info/entropy.mjs and mesh/voxelize.mjs, plus the Tier-1 fluid plants -- verify each
against the census first". *** THE CENSUS ANSWERED THE FIRST HALF BY REFUSING IT. BOTH TIER-2 ITEMS ARE DONE:
entropy took a mode plant at v3781 (`mergelargest`, excessOverH 2.012e-2 -> 1.940) and voxelize at v3782
(`oneaxis`, order 1.968 -> 0.227), and both are LIVE in `plantedCoverage --verify` today. *** The list they were
read off is v3767's; v3783's own tail already says "TIER 2 CONTINUES: sirt.mjs + ambiguity.mjs" and nothing else.
A ROADMAP LINE IS A CLAIM ABOUT THE TREE AND IT GOES STALE LIKE ANY OTHER, which is exactly what "verify against
the census first" is for -- it saved two rounds of rebuilding shipped work.

THE SAME CHECK RE-DATED THE SECOND HALF TOO. "The six fluid devices" is v3762's phrasing; flip2d took its plant at
v3806, so FIVE were genuinely bare: windtunnel, hydrostatic, pbc, freesurface, flip3d. All five are planted here.
*** plantedCoverage --verify 72 -> 77 of 106, MODE PLANTS 34 -> 39, UNCOVERED 33 -> 28. *** RUN AFTER THE
PATCH, not predicted: all five appear by name with the flips their gates assert, and DECLARED BUT DEAD is
UNCHANGED at `mpmrefine` alone -- which flip3d was one mode-order slip from joining, and did not. Paired
edits declared below.

*** pbc: THE PLANT WAS THERE ALL ALONG AND ONE WORD BOUNDARY HID IT. *** pbcBind has computed `wrapWRONG` since
v3301 and reported it as `plantedForceDiff` -- and the census has listed pbc as UNCOVERED for five hundred
versions, because readsPlantedKnob tests /\bplanted\b/ and `plantedForceDiff` FAILS THAT \b ON THE CAPITAL F. A
real, live, measured plant was invisible to the census built to find plants, and every reader of that report has
been sent to write one that already existed. This is "REACHABLE AND FINDABLE ARE TWO DIFFERENT EDITS" (v3766) in
its purest form yet: the previous instances hid a device behind a dynamic import or left a mode off a list, and
this one hid a plant BEHIND A CAPITAL LETTER. *** THE FIX IS NOT TO RENAME THE OBSERVABLE INTO MATCHING A REGEX,
which would be writing code to satisfy a scanner. *** It is declared as a MODE, the way the census actually
adjudicates: worstForceDiff 2.331e-15 -> 1.0489, a separation of 4.5e14, and the plant's value is the size of the
forces themselves (max |force| 0.9934). The plant did not change; the tree can now be asked about it.

*** freesurface AND flip3d: TWO MORE MEASUREMENTS MADE AND THROWN AWAY. *** Both devices' headers already
described their own plant, ran it, and kept the result as prose. freeSurfaceBind's argument for keeping the
`depth` mode is "reimplement v3540's shipped bug -- take the MINIMUM cell per column instead of the maximum --
and the gap reads 0.0000, a perfect pass"; flip3dBind's front door has printed "the divergence dropping its z
term leaves the hydrostatic column PERFECT and moves isotropy to 2.5e-1" for a hundred versions. A MEASUREMENT
MADE AND DISCARDED IS NOT COVERAGE, and that is the whole reason two devices that had already run their plants
still read as bare.

*** AND freesurface IS THE ROUND'S BEST ARGUMENT FOR WHY THE CONTRACT NAMES AN OBSERVABLE. *** The declared
observable is `depthErrFrac` (0.0500 -> 0.8944, 5.96x its bar) and NOT `gapEnvelope` -- because gapEnvelope
IMPROVES under the defect, 0.0526 -> EXACTLY 0.0000, a perfect pass, since the container floor is level too. A
plant declared against it would have read as THE CODE GETTING BETTER and shipped a plant that certified the bug.
A DEFECT THAT MOVES A KEY THE RIGHT WAY IS THE FAILURE MODE THE MODE-PLANT CONTRACT EXISTS TO EXPOSE.

flip3d needed the mirror-image care: `worstRel` lives ONLY in the isotropy branch, so "isotropy" is now FIRST in
the modes list. probeModePlant compares against `modes.find(m => m !== plantMode)`, and with "hydrostatic" first
the census would have built an arm containing no worstRel and reported this device DECLARED BUT DEAD -- which is
exactly what mpmrefine reads in today's census. THE DEFAULT IS UNTOUCHED: flip3dDefaults still returns
"hydrostatic". worstRel 0 -> 3.467e-1, and the 0 is EXACT (the transposed pair is bit-identical when the solver
is honest), so the bar needs no tolerance. The hydrostatic key is BLIND to it by construction -- a column at rest
has no z-flow to lose -- which is the round's proof that the two modes were never one claim.

*** THE flip3d KNOB IS WRITTEN THE LONG WAY ON PURPOSE, AND THE TIDY VERSION WAS WRONG. *** `flatDivergence`
branches on the WHOLE divergence expression rather than factoring the z term into a variable, because
floating-point addition is not associative: `... + w1 - w0` and `... + (w1 - w0)` are DIFFERENT OPERATIONS. The
first draft factored it and moved the default in the last ulp. A KNOB THAT CHANGES THE DEFAULT IS NOT A KNOB.
VERIFIED BIT-IDENTICAL against the pristine v3844 extract -- same summed pressure field to all 17 digits, same
maxDivergence -- rather than assumed, and the gate pins it.

*** windtunnel: THE DEVICE HAD NO GATE OF ITS OWN, AND THE FIRST THING THE NEW ONE FOUND WAS ITS DEFAULT. ***
tools/roundhouse/fluidBind-selfcheck.mjs is NEW. fluidBind's header calls balanceErr "simultaneously is-the-force
-right and is-this-reading-finished" and NOBODY HAD ASKED IT THE SECOND QUESTION. Measured, empty channel:
7.204e-1 at 500 steps, 2.813e-1 at the DEVICE DEFAULT of 3500, 3.943e-2 at 10000, 1.918e-3 at 20000, 4.539e-6 at
40000. *** THE DEFAULT SITS AT 2.8e-1, WHICH READS IN A LOG EXACTLY LIKE "THE FORCE MEASUREMENT IS 28% WRONG" AND
MEANS "THE FLOW HAS NOT SETTLED". *** The plant is the bounce-back indexing confusion -- reading where a
population is GOING (x + e_i) instead of where it CAME FROM -- one character, same 432 links walked, finite and
plausible result. ON A FLAT WALL IT MEASURES EXACTLY ZERO FORCE, because the outgoing set is symmetric about a
straight boundary: solidFx 5.123e-2 -> 0, so balanceErr reads EXACTLY 1. The channel is driven and the instrument
reports that nothing pushes back. *** AND THE SEPARATION IS STILL ONLY 3.55x, ENTIRELY BECAUSE THE HONEST ARM IS
NOT CONVERGED. THE PLANT IS AS STRONG AS A PLANT CAN BE AND THE BASELINE IS WEAK, AND THOSE READ IDENTICALLY IN A
PASS/FAIL LINE *** (v3806's flip2d lesson from the other side). In the `drag` geometry the same defect separates
3.024e-2 -> 9.251e-1, 30.6x, with cd 5.4773 -> 0.9748.

NOT FIXED AND NAMED AS DEBT: `steps` is CLAMPED AT 20000 by fluidBind's own validator, so the converged reading is
not reachable through the device at all, and raising the default takes a round from 1.7 s to 17 s against that
file's own "a device round should finish in seconds". Making the identity converge at an affordable runtime is a
FIXTURE question -- domain size and tau, not steps -- and that is a different round.

*** A windtunnel PLANT THAT WAS TRIED AND IS INERT, GATED SO NOBODY SPENDS THE ROUND AGAIN: dropping the internal
-link guard -- the `if (solid[source]) continue` the shipped comment insists on -- CHANGES THE FORCE NOT AT ALL.
432 links become 720 and fx moves by 2.4e-14 relative, because internal solid-solid links cancel pairwise. THE
GUARD IS CORRECT AND IT IS ALSO UNTESTABLE BY THIS IDENTITY, which is a fact about the key and not about the
guard. Finding that out cost a build rather than a round. ***

*** hydrostatic: THE ROUND SPENT MOST OF ITSELF LEARNING THAT `retained` CANNOT HOLD A PLANT, AND THAT IS WHY
THIS DEVICE REACHED v3845 UNPLANTED. *** Height retention is an END STATE -- collapsed under the ideal EOS,
blown apart under Tait -- and once it has done either, a method defect of any plausible size lands in the same
place. TWO REAL DEFECTS WERE BUILT AND MEASURED BEFORE THIS WAS BELIEVED RATHER THAN ARGUED: rho0 assumed as the
nominal m/d^3 = 160 instead of the measured packing 144.34 moves retained 0.6324 -> 0.6220 (1.7%, still
`collapsed`); Tait's B missing its /gamma moves it 1.8418 -> 1.8352 (0.4%, still `expanded`). *** A PLANT
DECLARED AGAINST `retained` WOULD HAVE BEEN TECHNICALLY LIVE -- the census only asks that the number MOVE -- AND
WOULD HAVE CERTIFIED THIS DEVICE ON A SUB-PERCENT WOBBLE. THE CENSUS ASKS "DID IT MOVE"; A PLANT HAS TO ANSWER
"WOULD THE GATE HAVE CAUGHT IT", AND THOSE COME APART EXACTLY HERE. ***

So the plant sits on `densityMismatch`, the one observable with range and the one thing this device actually
asserts: that the recorded rest density IS the lattice's measured packing. It drops makeColumn's interior filter,
so the packing is averaged over all 686 particles instead of the 441 interior ones -- and surface particles read
LOW, because an SPH density is a kernel sum and a particle at the free surface has half a neighbourhood. THE
SURFACE DEFICIT GETS REPORTED AS THE LATTICE'S DENSITY: packedDensity 144.339 -> 140.326, densityMismatch
2.345e-3 -> 2.618e-2, an 11.1x separation across a 1e-2 bar. `retained` is BIT-IDENTICAL across both arms
(0.6324) and that is deliberate -- `matched` hands makeColumn an explicit restDensity, so the world is identical
and the plant perturbs only the measurement under grade. A PLANT THAT MOVED THE PHYSICS TOO WOULD NOT ISOLATE
THE CLAIM.

*** GUARDING THE MODE WAS NOT A SIDE ERRAND, IT WAS THE PLANT'S PRECONDITION, AND deviceModes-selfcheck WENT RED
TO SAY SO. *** v3806 lost a round to a validator written as `if (mode !== primary) mode = primary`, which
SILENTLY REVERTED its plant -- both arms read an identical number and the plant fired at nothing. So every one of
the five validators now LISTS its plant mode. Two of them (hydrostatic, pbc) had accepted any string at all, so
adding the guards made deviceModes-selfcheck's staleness half fire: "STALE ENTRIES, DELETE THEM: hydrostatic,
pbc". BOTH DELETED FROM UNGUARDED_BASELINE, not commented out, the same way "em" left at v3424. THE RATCHET RAN
THE RIGHT WAY AND IT WAS THE GATE THAT NOTICED.

PAIRED EDITS NAMED HERE FOR frozenReferee: pbcBind + pbc-selfcheck; freeSurfaceBind + freeSurfaceBind-selfcheck;
flip3dBind + flip3dBind-selfcheck + fluid/flip3d.mjs (the `flatDivergence` knob); fluidBind + fluidBind-selfcheck
(NEW); hydrostaticBind + hydrostatic-selfcheck + physics/sph/hydrostatic.mjs (the `surfacePacking` knob).
tools/ship/labDevices-selfcheck.mjs and tools/roundhouse/deviceModes-selfcheck.mjs are registry-contract updates
that FOLLOW the mode-list changes -- three hardcoded mode counts and one baseline. No device added; the registry
is unchanged, so promptCost's device count does not move.

RUNTIMES MEASURED with time(1), against verify.mjs's 180 s per-gate budget: fluidBind-selfcheck 21 s (NEW),
freeSurfaceBind-selfcheck 24 s, flip3dBind-selfcheck 68 s, hydrostatic-selfcheck 85 s (60 s on the pristine
extract; the +25 s is the one extra settle that makes the `retained`-is-saturated finding a live assertion rather
than a quoted number). The Tait half of that finding is recorded in hydrostaticBind.mjs's header rather than
re-derived every run, which is where a fact nobody needs to re-measure belongs.

NOT CLAIMED: that any of these five modules is verified. Each device gained ONE plant against ONE key, and every
header says which claim that is and which claims it leaves untouched. ONE PLANT TESTS ONE CLAIM.

TIER 2 CONTINUES, AND IT IS NOW TWO NAMES, NOT FOUR: sirt.mjs + ambiguity.mjs. sirt carries a standing "MOVING
THE DEFAULT IS KEITH'S CALL", so grading it wants that settled or an explicit decision to grade it as shipped.
ambiguity.mjs has no such blocker and is the one that can be picked up cold.

TIER 1: THE FLUID GROUP IS CLOSED. The census's remaining UNCOVERED list is where the next one comes from.

CARRIED REDS, NONE MINE: deviceInstrumentMap-selfcheck (`multigrid3d` / `voxelize` UNEXPLAINED), plantedCoverage-
selfcheck (undeclared 6), discovery-selfcheck ("launcher prints end-of-script marker"), toolFrontDoor-selfcheck
(reconOps silent), gateQuality (mpmGpuPage-selfcheck prose-as-code, baseline 41), and coverageTriage-selfcheck
(2 FAIL: the PHYSICS_ROOTS denominator, and `physics/mpm/gpuKernelInterp.mjs` unclassified) -- that last one
MEASURED BYTE-IDENTICALLY RED ON THE PRISTINE v3844 EXTRACT rather than assumed to be somebody else's. mpmrefine remains DECLARED BUT
DEAD in the census and is NOT mine -- it is named above only because flip3d was one mode-order slip from joining it.
