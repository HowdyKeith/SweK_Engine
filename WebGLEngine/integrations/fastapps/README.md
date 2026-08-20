# SweK on FastApps -- ChatGPT App widgets over SweK's routes

This exposes SweK Engine capabilities as ChatGPT App widgets, using
[FastApps](https://github.com/DooiLabs/FastApps) (OpenAI Apps SDK + FastMCP).
Each widget is two files: a Python tool that calls a SweK server route, and a
React component that renders the result.

## Widgets

- **swek-fingerprint-check** (`server/tools/fingerprint_check.py` +
  `server/components/FingerprintCheck.jsx`) -- asks one SweK box to fan out to
  the fleet and report which peers agree on the cross-architecture master hash
  and which diverge. The engine's verification spine, in a chat.
- **swek-ground-truth** (`server/tools/ground_truth.py` +
  `server/components/GroundTruth.jsx`) -- generates the exact 4D ground-truth
  benchmark and scores naive estimators against it, so ChatGPT can show what a
  4D-estimation method would be graded on.

## Server routes used

- `POST /fleet/fingerprint-check` -- fleet-wide master check (already in SweK).
- `GET  /groundtruth/summary?seed=N` -- ground-truth stats (added for this).

Both run on a SweK server (default `http://localhost:8787`); pass `base_url` to
point at a specific box.

## Run

    pip install -r requirements.txt
    fastapps dev            # serves the MCP endpoint, prints a public URL

Add the printed URL + `/mcp` to ChatGPT under Settings > Connectors. Then ask
ChatGPT to "check the SweK fleet fingerprint" or "show the SweK ground truth for
seed 7".

## Scope

This is a distribution surface, not a change to the engine: the determinism and
the fingerprint live in SweK; these widgets only call its routes and render what
comes back. It exists so a SweK fleet can be driven and inspected from ChatGPT.
