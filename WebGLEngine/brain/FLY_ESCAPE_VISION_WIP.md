# The fly escapes, round 5: the real escape circuit -- visual cells in, Giant Fiber out (UNNUMBERED; REGISTERED 2026-11-16 BEFORE ITS CODE IS WRITTEN AND BEFORE ANY SUCH TRAINING IS RUN; ROUNDS 3 AND 4 ARE RUNNING AND UNREAD)

Keith, 2026-11-15: "Let's do Escape" (the third open item: the visual inputs the real circuit has), and 2026-11-16: "Another
chat has pulled in more fly data. Vision cells". Until now this was not possible: the tree held only the 313 connections among
34 cells of types GFC1 to GFC4. **Said plainly, and it changes what the earlier rounds were: those 34 cells are not the Giant
Fiber and not its visual inputs.** The data now on `origin/claude/inspiring-mayer-9mdcut` has the real thing, and this round
uses it. Nothing has been trained with it; no code of this round exists.

## 1. The data (another chat's, used unmodified)
`vendor/male-cns/giant-fiber-visual-circuit.json`, copied byte for byte from that branch at commit e5b750b6 (sha256
`5b7f2445...`; built there by `tools/maleCnsVisualCircuit.py` from Neuprint `male-cns:v1.0`, CC-BY-4.0 as the server declares;
described in that branch's `brain/FLY_VISUAL_INPUTS_WIP.md`): **42 neurons -- the two Giant Fibers (`DNp01`, right and left)
and, for each, its 10 strongest LC4 and 10 strongest LPLC2 cells -- and the 369 connections among them (3,894 synapses).**
* LC4 onto a Giant Fiber: 20 connections, 1,348 synapses. LPLC2 onto a Giant Fiber: 20, 1,007. Every one is on the fibre's own
  side.
* Among the visual cells: LC4 to LC4 119, LPLC2 to LPLC2 176, LPLC2 to LC4 16, LC4 to LPLC2 9 -- all within a side.
* From a Giant Fiber: 4 onto LC4, 3 onto LPLC2, and the two fibres onto each other (2).
* **What it is not:** the whole input. That note measures 126 LC4 and 185 LPLC2 cells onto the two fibres; these 40 are the
  strongest and carry 21 percent of that input. And the visual cells are a third of everything a Giant Fiber hears.

## 2. What is known of what these cells carry (read by that chat from the primary papers; `brain/FLY_RETINOTOPY_RF_WIP.md` there)
Ache et al. 2019: **LC4 encodes the looming disc's angular VELOCITY and LPLC2 its angular SIZE**; summed on the Giant Fiber they
reproduce its response. This round uses exactly that and no more: an LC4 cell is given the looming rate, an LPLC2 cell the size.

## 3. The arms (all started at the reflex, trained as round 3 trains: fresh episodes, a battery of 200; no memory)
The fly is half the reflex's answer plus its network's output, the output layer at zero, as in rounds 2 and 3. The network:
| arm | cells | what goes in | connections among them | what is read out | weights |
|---|---|---|---|---|---|
| **GF** (see 3b: its connections start at 0.01 x their synapse counts) | the 42 real cells | the looming rate into each of the 20 LC4 cells; the size into each of the 20 LPLC2 cells; nothing into the Giant Fibers | the 369 real ones | **the two Giant Fibers only** | 40 + 42 + 369 + 2 + 1 = 454 |
| **GSHUF** | the same 42 | the same | 369 connections placed by the draw's own shuffle among the 42 (`shuffledEdges(42, 369, 7000 + s)`) | the same two cells | 454 |
| **FREE** | 113 units | the looming rate and the size into every unit | none | every unit | 226 + 113 + 113 + 1 = 453 |
| **GNONE** | the same 42 | as GF | none | the two Giant Fibers | 40 + 42 + 2 + 1 = 85 |
Each cell computes as the earlier circuit policy's units do (a rectified sum, three steps along the connections, weights
learned, all zero among the cells at the start). Draws s = 1 to 16: 64 trainings.

**What each control is for.** GSHUF: does it matter WHERE the 369 connections are, with the same cells in and the same cells
out? FREE: the same two numbers into a net with no such structure and as many weights -- what the task allows from those
inputs. GNONE: with no connections nothing reaches a Giant Fiber, so its network can only add a constant; it should stay the
reflex, and if it does not, something else is being learned.

**What is and is not real here, said before the result.** Real: which cells exist, which connect to which, that the visual
cells feed the Giant Fibers on their own side, and (from the paper) which cell type carries size and which velocity. Not real:
(a) the synapse COUNTS are not used -- every connection starts at zero and is learned; (b) there is no left and right eye -- the
environment's fly has no heading, so both sides' cells are given the same two numbers; (c) the cells have no receptive fields
(the lattice-to-visual-field calibration is not derived in that chat's note), so where the mover is does not choose which cells
see it; (d) no memory between ticks; (e) in the animal the Giant Fiber fires for a take-off within milliseconds, and this fly
must decide early enough to WALK home, so the reflex half (which uses the bearing) still does most of the work.

## 3b. AMENDMENT, 2026-11-16, made after the code was written and BEFORE ANY TRAINING OF THE ROUND: the connections start at their synapse counts
**What section 3 registered cannot be trained, and I found that out on a draw the round does not use.** With every connection at
zero nothing reaches a Giant Fiber cell, the read-out sees silence, and no fly the trainer tries ever chooses differently from
the reflex: every return is the same and the trainer does not move. On draw 901 (3 iterations, the round's 96 flies tried): GSHUF
moved 0 of 454 weights and GNONE 0 of 85; GF moved once and its battery reading did not change; only FREE trained.

**The amendment, one thing:** a connection starts at **0.01 x its synapse count** (so the 2,355 synapses onto the two Giant
Fibers start as a real drive), and is learned from there. **GSHUF keeps the same 369 strengths and puts them in its shuffle's
369 places**, so GF and GSHUF differ in where the strengths are and in nothing else. GNONE has no connections and so no
strengths; it cannot train, by construction, and is kept as the arm that must stay the reflex. Section 3's "(a) the synapse
counts are not used" is withdrawn: they are now the start. The 0.01 was chosen before it was tried, to bring a Giant Fiber's
input to order 1, and was not adjusted.

**On draw 901 with the amendment** (3 iterations): GF moved all 454 weights and its battery readings were 0.557, 0.684, 0.630
(the reflex there: 0.674); GSHUF moved all 454 and its three readings were 0.674; FREE as before; GNONE 0 of 85. **What that
shows before the round, and it bears on T1:** the real wiring converges 40 visual cells onto 2 Giant Fibers, so those two cells
are driven hard and the two read-out weights have a long lever -- the trainer's noise changes the real-wired fly's choices much
more than the shuffled one's. T1 may therefore turn on how far the trainer can move the read-out as much as on what the wiring
computes. That is still a difference the wiring makes, and it is said here so it is not found later.

**The expectations of section 6 were written before this and are left as written.** One is added: GNONE's 16 flies score the
reflex's number exactly (it cannot move): about 95 percent.

## 4. The questions and the reading (each read ONCE from the committed records; alpha 0.01, two-sided, a tie counted against the claim)
* **T1, THE WIRING: GF against GSHUF** -- the exact rank-sum, 16 against 16. Words: `THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES
  BETTER THAN A SHUFFLE OF IT` / `... ESCAPES WORSE THAN A SHUFFLE OF IT` / `... CANNOT BE TOLD APART FROM A SHUFFLE OF IT`.
  Asked of flies that do the task when both arms' means are at or above the reflex's (as in round 2).
* **T2, GF against FREE** -- the same test. Words: `THE REAL ESCAPE CIRCUIT ESCAPES BETTER THAN A FREE NET ON THE SAME TWO
  NUMBERS` / `... ESCAPES WORSE THAN A FREE NET ON THE SAME TWO NUMBERS` / `... CANNOT BE TOLD APART FROM A FREE NET ON THE SAME TWO NUMBERS`.
* **T0, the 16 GF flies against the reflex** and **T3, all 64 against the reflex** -- the exact sign tests. T0's words:
  `A FLY WITH THE REAL ESCAPE CIRCUIT, STARTED AT THE REFLEX, ESCAPES BETTER THAN THE REFLEX` / `... ESCAPES WORSE THAN THE
  REFLEX` / `... CANNOT BE TOLD APART FROM THE REFLEX`; T3's are round 2's.
* Described, not tested: each arm's mean beside round 3's arms (which were given all 13 numbers); GNONE beside the reflex;
  lives, time fed, passes left for, strikes that catch; the gain on the battery beside the gain on the audit.

## 5. Checks, made first; a failure is the first line and the reading is NOT WEIGHED
64 records (4 arms x 16 draws), each once; round 3's recipe; each arm's weight count and wiring (GF's the data's 369, a GSHUF
draw's its own shuffle and not the real one); GF draw 1 the same trained twice; a history in every record; the registered
floors; the untrained fly of every arm the reflex to the bit; and the gate re-audits two records an arm.

## 6. Expectations, written before the code
**T1: CANNOT BE TOLD APART about 72 percent, BETTER about 14, WORSE about 14** (eight rounds of the same answer on other
wiring; the difference here is that the cells in and the cells out are fixed, so the wiring is the only road between them).
T2: CANNOT about 50, WORSE about 35 (a free net has more ways to use two numbers), BETTER about 15. T3: BETTER about 55. T0:
BETTER about 30, CANNOT about 55. GNONE's mean within 0.005 of the reflex's: about 65 percent. Some arm's mean above 0.68:
about 30 percent.

## 7. What a reading would and would not mean
T1 BETTER would be the first sign in this work that a real fly circuit's wiring helps, on the circuit's own job with its own
inputs and output, and would want a second round before it is believed. T1 CANNOT says that, as modelled (section 3's five
"not real"), where the connections are does not matter. Neither is a statement about the animal.

## 8. The cost
64 trainings; the nets are smaller than round 3's. About 30 minutes alone. Resumable.

## 9. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyEscapeVision.mjs run` -> `brain/flyEscapeVisionRound.jsonl`, committed byte for byte before it is read;
`node tools/ship/takeFlyEscapeVision.mjs read` prints the checks and the reading.

## 10. The result (run 2026-11-16 in the sandbox, 31.0 minutes; `brain/flyEscapeVisionRound.jsonl` committed whole at 3b26b297 before it was read; read once)
**A slip of mine, said first.** While the run was writing the file, a commit of other work (2b048f15) swept in a partial copy
of it: its first four records. I had not read it and did not; the whole file was committed again when the run ended, the
partial copy is its first bytes exactly, and the reading below was made once, after that.

**The checks hold, and the start was the reflex:** the untrained fly of every arm scores 0.6465, to the bit.

| | mean score | sd | least | most | lives (of 200) | feeds | caught by a strike |
|---|---|---|---|---|---|---|---|
| **GF**, the real circuit | 0.7501 | 0.0031 | 0.7411 | 0.7569 | 193.4 | 0.533 | 0.015 |
| GSHUF, its strengths in shuffled places | 0.7323 | 0.0286 | 0.6623 | 0.7524 | 188.8 | 0.521 | 0.025 |
| FREE, 113 units on the same two numbers | 0.7571 | 0.0103 | 0.7360 | 0.7736 | 185.6 | 0.586 | 0.036 |
| GNONE, the cells with no connections | 0.6465 | 0 | 0.6465 | 0.6465 | 156 | 0.513 | 0.107 |
| the reflex | 0.6465 | | | | 156 | 0.513 | 0.107 |

* **T1: THE REAL ESCAPE CIRCUIT'S WIRING ESCAPES BETTER THAN A SHUFFLE OF IT** (asked of flies that do the task; ranks 333, the
  middle 264; exact two-sided p 0.0085 against the registered 0.01).
* **T2: THE REAL ESCAPE CIRCUIT CANNOT BE TOLD APART FROM A FREE NET ON THE SAME TWO NUMBERS** (206; p 0.029; it leans below).
* **T0: A FLY WITH THE REAL ESCAPE CIRCUIT, STARTED AT THE REFLEX, ESCAPES BETTER THAN THE REFLEX** (16 of 16; p 3.1e-5).
* **T3: A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX** (48 of 64 above, the 16 GNONE flies equal; p 7.7e-5).

**What T1 is, and what it is not.** It is the first time in this work that a real wiring is told from a shuffle of itself, and
it is the registered test giving the registered word. It is not a better fly: 12 of the 16 shuffles end where the real circuit
ends (0.743 to 0.752 against 0.741 to 0.757) and the best shuffle is above 14 of the 16 real-wired flies. The difference is
that the real wiring trained to the same place every time (sd 0.003) and 4 of the 16 shuffles did not get there (0.66 to
0.71). That is the thing section 3b said to watch for: the real wiring brings all 40 visual cells onto the two cells that are
read, a shuffle brings 13 to 20 of them, and the trainer has a longer, surer lever on the real one. So what was shown is that
THIS wiring's convergence onto its output makes it easier to train here -- which is a property of the wiring, and a plain one.
It was not shown that anything finer about where the connections are matters. And the p is 0.0085 beside a line at 0.01.

**It wants a second round before it is believed, as section 7 said**, and the round is clear: a shuffle that keeps each cell's
count of connections in and out (so the convergence onto the Giant Fibers is kept and only the rest is moved), more draws, and
new shuffles. If the real wiring still trains more surely than that, the finer wiring matters; if not, it was the convergence.

**The rest.** Without connections nothing was learned: all 16 GNONE trainings ended with the weights they began with. A free
net on the same two numbers does as well or a little better (0.757), by feeding more and being caught more. Two numbers through
the real circuit (0.750) do as well as round 3's arms did on all thirteen (0.741).

**Expectations against what came.** I gave T1 BETTER 14 percent. T2, T3 and GNONE came as weighted; T0 BETTER I gave 30.

