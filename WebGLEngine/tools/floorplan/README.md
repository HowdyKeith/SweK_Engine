# The SweK floorplan's starting map

`architecture.json` is the part of a [Floorplan](https://github.com/haydenschmitty/floorplan) map a reader of the code has to write: the parts of SweK, what each one is for, the outside services, two flows and the tour. It was written on 2026-11-21 against the tree at that date. Floorplan keeps its own `floorplan/` folder at the repo root out of git, so this copy is the one that lasts.

To draw the map on your machine:

1. Install the plugin from the install panel (row `skill-floorplan`, in the Desktop, casting and code maps group), or run `claude plugin marketplace add haydenschmitty/floorplan`, then `claude plugin install floorplan@floorplan`.
2. Copy this file to `floorplan/architecture.json` at the repo root (beside `WebGLEngine/`).
3. In a new Claude Code session at the repo root, ask for "a floorplan". The plugin sees the existing map and refreshes it instead of starting over.

**What it doesn't have yet:** a name and description for each of the 6,623 code files. Every part has a summary, but files show their generated names. Floorplan fills those in with `describe.mjs`, which is many hours of reading at this size.
