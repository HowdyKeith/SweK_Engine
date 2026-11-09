# winPathLint-selfcheck on a Windows host -- a patch for the ship chat (2026-11-09)

**What happened.** The rig's v4913 verify (clone of main f168538c0, win32) ended `DO NOT SHIP`: one NEW red, `tools/ship/winPathLint-selfcheck.mjs`, and the pool row that is the same gate's recorded red. Its four FAIL rows:
`a FAKE root is spelled with backslashes ...` (got `["\\x\\brain\\a.jsonl","C:\\zz\\q\\r","\\x\\a"]`), `a REAL root is not respelled ...` (got `["\\tmp\\w","\\","\\x"]`), `the v4912 class ...`, `the v4882 class ...`. Every other gate (1,630) was green; the three capped gates and the one 1.55x gate were false reds alone.

**Cause.** The gate tests `winPathShim.mjs`, which makes a POSIX box spell paths the way win32 does. Those four rows state what the shim does FROM a POSIX box (a fake root `/x` respelled with backslashes, `/tmp` and `/` left alone, a stub keyed by a posix path green plain and red under the shim). On a Windows host the plain run already spells paths with backslashes and a drive letter (`path.resolve("/zz","q","r")` is `C:\zz\q\r`, `/` is `\`, `/tmp` is `\tmp`), so the rows fail by construction. It is a gate bug, not a v4913 bug, and no change to a path can clear it.

**The patch** (`brain/WINPATHLINT_WIN32_SKIP_2026-11-09.patch`, one file, +21/-4 lines in `tools/ship/winPathLint-selfcheck.mjs`, made against `origin/main` f168538c0 and checked with `git apply --check` and applied in a fresh worktree of it):
- `okPosixHost(...)` wraps those four rows: on `process.platform === "win32"` (or `SWEK_PRETEND_WIN32_HOST=1`) each prints a `SKIP` line (neither PASS nor FAIL) instead of running; on a POSIX host it is `ok` exactly as before.
- Section 7 runs the gate again in a child with `SWEK_PRETEND_WIN32_HOST=1` and asserts exit 0, no FAIL, exactly four SKIP rows (named) and the other rows (41+ at the time) PASS.
- Header note with the three mutants of the skip that go red on that row and the fourth (`process.platform === "win32"` removed) declared as 0 red on a POSIX box by construction.
- Gate result here (Linux): `all checks pass`, 8 s (it was 4 s: the new row runs the gate twice); 45 PASS rows plus the child's 4 SKIPs. It adds 4 s to a gate that is already over the 3 s line, so its stated-runtime header and timing record move with it.

**Not done, said plainly.** Not run on a Windows host. The patch is written from the rig's printed output. If a Windows run still shows a red in a row the patch does not guard, that row needs reading from its own output. The version, changelog and gate count are the ship chat's (a new gate row set and a runtime change belong in a round): `git apply brain/WINPATHLINT_WIN32_SKIP_2026-11-09.patch` from the repository root applies it.
