# spaceprojectsim: the economy does not converge, and the waterfall is why

**Status:** draft, for filing against Kalcode/spaceprojectsim. Their CONTRIBUTING asks for exactly this shape of
report -- a clean baseline run with numbers.

**Provenance, stated first because it decides how much weight each part carries.** The run below is Keith's, on
his own build, headless on 127.0.0.1:8080 with `WORLD_SPEED=4` and **no tuning.json** -- their defaults. The
numbers are his measurements, reproduced here rather than re-derived. The *analysis* of the goal waterfall is
ours and is drawn from reading their published agent traces; it is offered as a hypothesis with the evidence
that suggested it, not as a claim we have confirmed inside their code.

## What was observed

A clean run of roughly 5,900 ticks, no tuning applied:

| quantity | observation |
|---|---|
| ore / food / fuel prices | **pinned** at 340.31, 500.00, 22.00 across 80 consecutive ticks |
| faction treasuries | fell about **90%** |
| contracts | **228 expired** against 363 paid |
| crew morale | 69 -> **32 average, 0 minimum** |
| fleet state (tick 80) | **213 of 282** ships idle |
| fleet state (tick 5920) | **133-138 of 282** on `rest_crew`, 190 crew eating |

Prices that do not move across 80 ticks are the headline, but they are probably a symptom rather than the
fault.

## The hypothesis: a price signal cannot reach most of the fleet

Agent goal selection appears to run as a **waterfall**, in order:

    rest_crew -> refuel -> sell_cargo -> seek_retrofit -> [elective band]

Every rung above the elective band is a **hard gate**: it fires regardless of any margin. Only inside the
elective band is there a *scored* comparison -- `fulfill_delivery` against `trade_run`, weighted by
`ln(profit) x (1 + prefer_goals)`.

**That means a price only influences a decision for a ship standing in the elective band at that instant.** And
in both regimes above, the band is a minority state: 213 of 282 idle early, 133-138 on `rest_crew` late. A
market signal arriving while three quarters of the fleet is gated cannot propagate, and the prices stay where
they are because almost nobody is in a position to trade on them.

If that reading is right, tuning the price model will not fix convergence. **The binding constraint is how many
ships are eligible to respond**, and morale floored at 0 minimum with 190 crew eating suggests `rest_crew` is
absorbing the fleet rather than clearing.

## What would distinguish the hypothesis from the alternatives

We built a probe against your existing admin and debug routes to try to settle this, and it is deliberately
conservative about what it can conclude. It plants a supply delta via
`POST /api/admin/markets/{location}/supply`, then reads `GET /api/debug/agent/{id}/trace` before and after, and
reports one of:

- **MOVED** -- the ship's goal changed after the planted delta
- **UNMOVED** -- it did not, *and the ship was in the elective band*, so the signal genuinely failed to persuade
- **BLOCKED** -- the ship was on a waterfall rung above the band, so the delta could not have mattered
- **INSUFFICIENT** -- too little of the fleet is measurable for the result to mean anything
- **NO-TRACE** -- the decision was not observed, which is not the same as it not happening

The distinction between **UNMOVED** and **BLOCKED** is the whole point. Without it, "the price change did
nothing" is ambiguous between *the market model is unresponsive* and *nobody was listening*, and those have
different fixes.

## Questions we cannot answer from outside

1. Is the waterfall ordering above accurate, and is the elective band the only place price is scored?
2. Is `rest_crew` intended to absorb this fraction of the fleet at steady state, or is that the defect?
3. Should contract expiry at 228-vs-363 be read as a symptom of the same gating, or as separate?

## Also worth a separate, smaller PR

- **Windows build:** `LNK1140` (PDB size limit) is not a disk-space error and recurs on a clean tree. Fixed by
  `[profile.dev] debug=1` or building `--release`. Worth a line in the build docs.
- **`make verify` cannot pass on rustc 1.97.1:** seven `float_literal_f32_fallback` warnings, and the target
  uses `-D warnings`. A clean first contribution for somebody.
