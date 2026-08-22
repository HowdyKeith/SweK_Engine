// FILE: ai-bridge/keyTransfer.js
// VERSION: v1 - deliberate, password-gated key MOVE (build step #5)
//
// The capability proxy (#4) shares a capability WITHOUT moving the credential. This is the OTHER, deliberate path: a peer
// asks for a key, the holder SEES the request and types their LOGIN password to authorize, and only then is the key sealed
// (swekCrypto) to the requester's published key and handed over. Two gates (see + password), encrypted in transit, logged
// both ends, and the requester then OWNS the key (persisted). Pure eligibility logic here; the live flow lives in server.js.

// Friendly key name -> the env var that holds its value. ONLY these may ever be moved. Add named API keys here as needed.
const TRANSFERABLE = {
    gemini:    "GEMINI_API_KEY",
    openai:    "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    ha:        "HA_TOKEN",
};
// Hard deny-list: these must NEVER be transferable even if one were mistakenly mapped above (the engine's own auth/session
// secrets and the SweK peer token). keyEligible refuses any name whose env var lands here.
const NEVER = ["SWEK_TOKEN", "VE_SESSION", "VE_PASSWORD", "AUTH_PASSWORD"];

function keyEligible(name) {
    const n = String(name || "");
    if (!Object.prototype.hasOwnProperty.call(TRANSFERABLE, n)) return false;
    return NEVER.indexOf(TRANSFERABLE[n]) === -1;
}
function envVarFor(name) { return keyEligible(name) ? TRANSFERABLE[String(name)] : null; }
function transferableNames() { return Object.keys(TRANSFERABLE).filter(keyEligible); }

module.exports = { TRANSFERABLE, NEVER, keyEligible, envVarFor, transferableNames };
