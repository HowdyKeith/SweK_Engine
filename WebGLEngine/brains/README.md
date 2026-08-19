# Bridge brains (browser side)

Three pages that talk to the Node relay (server.js, :8787) and demonstrate the
three bridge patterns. Serve the engine folder and open each page; they read
engine state (GET /bridge/state + WS bridge:state) and POST directives
(/bridge/directive) that the EngineCore drains via modEngineBridge.

- `ai-brain.html`   — pattern 1: browser computes targets, pushes them to the engine.
- `dashboard.html`  — pattern 2: live minimap + telemetry; click an entity to highlight it in-engine.
- `commander.html`  — pattern 3: top-down command view; click to issue move/target orders.

Shared transport: `bridgeClient.js`.
