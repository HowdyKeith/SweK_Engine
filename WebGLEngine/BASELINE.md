# SweK Engine fingerprint BASELINE -- POINTER, NOT A COPY

**The authoritative baseline is `tools/fingerprint/BASELINE.md`.** It sits next to
`libmTripwire-selfcheck.mjs`, which is the only thing in the tree that reads a baseline
(`new URL("./BASELINE.md", import.meta.url)`), so that file is the one the gate checks against.

## Why this file is a pointer now (v2915)

This path used to hold a full copy of the fifty-subsystem hash table. The two copies had drifted:
they agreed on 51 of 52 rows and disagreed on exactly one --

| | obb-collision |
|---|---|
| this file (stale) | `8d4d80e9a86e2cd73d4d5728cc3b0cc0586fd6d6e2302e911c8c330f993fcb74` |
| `tools/fingerprint/BASELINE.md` (canonical) | `3a0a1ce97d452571979e8a12b0760a2dbaeaba0fc908dda8b4b56b2aaa040ed1` |

and that single row is precisely the one the v2889 libm purge moved, when obb-collision's quat-norm
`hypot` was replaced with the `sqrt` form. The regeneration updated the file the gate reads and left
this one behind. Nothing read it, so nothing failed -- it was simply wrong, at the most discoverable
path in the repository, for twenty-six versions.

Verified before writing this: `libmTripwire-selfcheck.mjs` reports all 50 subsystem hashes matching on
this machine against the canonical file, master `50b891b6b090cf4c`.

## The pattern this is the third instance of

- **v2910** -- the `MODES` device table lived inside `census-selfcheck.mjs`; three censuses silently
  skipped `lens.map` because the list they shared was a copy.
- **v2912** -- the `EXACT_OK` register lived inside the same selfcheck; extracted to
  `exactZeroRegister.mjs` before it could bite the same way twice.
- **v2915** -- this file.

`tools/ship/singleSource-selfcheck.mjs` now fails if a second copy of the baseline table appears
anywhere in the tree.

canonical sha256[0:16] at time of writing: `780111de3505b95e`
