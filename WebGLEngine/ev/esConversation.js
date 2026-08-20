// WebGLEngine/ev/esConversation.js — Endless Sky's conversation engine.
//
// The last big honest stub in the mission runner. Until now a `conversation` was dropped on the floor
// and acceptance was assumed, which meant every branching story in the game had exactly one branch.
// v2176 made the hole visible: the default start's intro -- where the banker reads out your mortgage and
// you choose your first ship -- was recorded and never played.
//
// There are 46 root conversations and 1,623 written INLINE inside missions and starts, so the builder
// takes a node, not a name.
//
// The model, from endless-sky/source/Conversation.cpp at master. A conversation is a flat list of nodes;
// every node's element carries the index of the node to visit next, or a negative endpoint sentinel.
//
//   <bare text>   a TEXT node. Consecutive lines MERGE into one node -- unless the previous node ended
//                 in a goto, or was a choice/branch/action, or this line carries a `to display`.
//   scene <spr>   always starts a new text node, and names a backdrop.
//   label <name>  names the NEXT node. The text above a label can never merge with the text below it.
//   choice        one element per child; each is a line the player can pick. `goto` on a child sends the
//                 pick somewhere; without one it falls through to the following node.
//   name          an empty choice node: the game asks for your name.
//   branch [t] [f]  conditions in its children. Element 0 is where a true test goes, element 1 a false
//                 one. Either may be omitted, meaning "the next node".
//   goto <label>  a node with one element pointing at the label.
//   action        applies condition assignments, then falls through.
//
//   goto accept | decline | defer | launch | flee | depart | die | explode  -- these are ENDPOINTS, not
//   labels, and they are what the caller acts on. `goto` with a matching label prefers the label.
//
// `to display` on a text line or a choice hides it without changing where the conversation goes.
//
// The engine is pure: conditions are tested and applied through callbacks, so the same code runs against
// the real condition store in the browser and against a plain object in a test.

"use strict";

const ENDPOINTS = { accept: -1, decline: -2, defer: -3, launch: -4, flee: -5, depart: -6, die: -7, explode: -8 };
const ENDPOINT_NAME = {};
for (const k in ENDPOINTS) ENDPOINT_NAME[ENDPOINTS[k]] = k;

// ES: LAUNCH, FLEE and DEPART force the player off the ground in addition to their mission outcome.
const LAUNCHES = new Set([ENDPOINTS.launch, ENDPOINTS.flee, ENDPOINTS.depart]);
const MISSION_RESULT = {
    [ENDPOINTS.accept]: "accept", [ENDPOINTS.launch]: "accept",
    [ENDPOINTS.decline]: "decline", [ENDPOINTS.flee]: "decline",
    [ENDPOINTS.defer]: "defer", [ENDPOINTS.depart]: "defer",
    [ENDPOINTS.die]: "die", [ENDPOINTS.explode]: "die",
};

function endpointOf(token) { return Object.prototype.hasOwnProperty.call(ENDPOINTS, token) ? ENDPOINTS[token] : 0; }
function outcomeName(n) { return ENDPOINT_NAME[n] || null; }
function isEndpoint(n) { return n < 0; }
function requiresLaunch(n) { return LAUNCHES.has(n); }
function missionResult(n) { return MISSION_RESULT[n] || null; }

// What may hang off a text line or a choice: a `goto`, a bare ENDPOINT keyword, `to display`, or
// `to activate`.
//
// The distinction that matters, and which this file originally had backwards: an endpoint is written as a
// BARE KEYWORD (`accept`), while `goto accept` looks for a LABEL named "accept" and nothing else --
// Conversation::Goto never consults the endpoint table. The base game does both, 2,484 bare endpoints and
// 167 gotos to labels that happen to share an endpoint's name, and the file where they sit side by side
// (data/human/deep missions.txt, line 436) is the one that settles it.
function readDestinations(node) {
    const out = { goto: null, endpoint: 0, toDisplay: null, toActivate: null };
    for (const c of (node.children || [])) {
        const k = c.tokens[0];
        if (k === "goto" && c.tokens.length >= 2 && out.goto == null) out.goto = c.tokens[1];
        else if (k === "to" && c.tokens[1] === "display" && !out.toDisplay) out.toDisplay = c;
        else if (k === "to" && c.tokens[1] === "activate" && !out.toActivate) out.toActivate = c;
        else if (c.tokens.length === 1 && endpointOf(k) < 0 && !out.endpoint) out.endpoint = endpointOf(k);
    }
    return out;
}
function hasDisplayRestriction(node) {
    for (const c of (node.children || [])) if (c.tokens[0] === "to" && c.tokens[1] === "display") return true;
    return false;
}

// Build from a `conversation` node -- root (`conversation "name"`) or inline (`conversation` with
// children, inside a mission's `on offer`). Unresolved labels are recorded rather than thrown: a plugin
// with a typo should lose one jump, not the whole story.
function buildConversation(node) {
    const nodes = [], labels = {}, unresolved = [];
    let canMerge = false;

    const addNode = (isChoice) => { nodes.push({ isChoice: !!isChoice, isBranch: false, scene: null, actions: null, conditions: null, elements: [] }); return nodes[nodes.length - 1]; };
    const addTextNode = () => { const n = addNode(false); n.elements.push({ text: "", next: nodes.length, toDisplay: null }); return n; };
    // `nodes.length` at the moment an element is created is the index AFTER this node: "the next node".
    // A goto names a label, always. Forward references are patched when the label appears.
    const linkLabel = (nodeIdx, elIdx, token) => {
        if (Object.prototype.hasOwnProperty.call(labels, token)) { nodes[nodeIdx].elements[elIdx].next = labels[token]; return; }
        unresolved.push({ label: token, node: nodeIdx, element: elIdx });
    };
    // A branch target is the one place ES checks the endpoint table before the labels.
    const linkBranch = (nodeIdx, elIdx, token) => {
        const e = endpointOf(token);
        if (e < 0) { nodes[nodeIdx].elements[elIdx].next = e; return; }
        linkLabel(nodeIdx, elIdx, token);
    };
    const attach = (nodeIdx, elIdx, d) => {
        if (d.goto) linkLabel(nodeIdx, elIdx, d.goto);
        else if (d.endpoint < 0) nodes[nodeIdx].elements[elIdx].next = d.endpoint;
    };

    for (const child of (node.children || [])) {
        const key = child.tokens[0];
        const hasValue = child.tokens.length >= 2;

        if (key === "scene" && hasValue) {
            const n = addTextNode(); n.scene = child.tokens[1]; canMerge = true;
        } else if (key === "label" && hasValue) {
            if (nodes.length) canMerge = false;               // text above a label never merges with below
            labels[child.tokens[1]] = nodes.length;
            for (const u of unresolved) if (u.label === child.tokens[1]) nodes[u.node].elements[u.element].next = nodes.length;
        } else if (key === "choice") {
            const n = addNode(true);
            for (const g of (child.children || [])) {
                if (g.tokens.length > 1) continue;             // ES: "choices should be a single token"
                const d = readDestinations(g);
                n.elements.push({ text: g.tokens[0] + "\n", next: nodes.length, toDisplay: d.toDisplay, toActivate: d.toActivate });
                attach(nodes.length - 1, n.elements.length - 1, d);
            }
            if (!n.elements.length) nodes.pop();               // an empty choice node is an authoring error
            canMerge = false;
        } else if (key === "name") {
            addNode(true); canMerge = false;                   // an empty choice node: a name entry field
        } else if (key === "branch") {
            const n = addNode(false);
            n.isBranch = true;
            // ES: "empty conditions might have to be removed in the future" -- an empty set tests TRUE.
            n.conditions = child.children && child.children.length ? child : null;
            for (let i = 1; i <= 2; i++) {
                n.elements.push({ text: "", next: nodes.length, toDisplay: null });
                if (child.tokens.length > i) linkBranch(nodes.length - 1, i - 1, child.tokens[i]);
            }
            canMerge = false;
        } else if (key === "goto" && hasValue) {
            const n = addNode(false);
            n.elements.push({ text: "", next: nodes.length, toDisplay: null });
            linkLabel(nodes.length - 1, 0, child.tokens[1]);   // "even if that name matches an endpoint"
            canMerge = false;
        } else if (key === "action" || key === "apply") {
            const n = addTextNode();
            n.actions = child;
            canMerge = false;
        } else if (hasValue) {
            continue;                                          // ES: "conversation text should be a single token"
        } else {
            if (!nodes.length || !canMerge || hasDisplayRestriction(child)) { addTextNode(); canMerge = true; }
            const n = nodes[nodes.length - 1];
            const el = n.elements[n.elements.length - 1];
            const d = readDestinations(child);
            if (hasDisplayRestriction(child)) el.toDisplay = d.toDisplay;
            el.text += key + "\n";
            if (d.goto || d.endpoint < 0) { attach(nodes.length - 1, n.elements.length - 1, d); canMerge = false; }
        }
    }
    // Anything still unresolved is a label that was never defined. Leave `next` pointing at the following
    // node -- the conversation limps on rather than hanging.
    const missing = [...new Set(unresolved.filter((u) => !Object.prototype.hasOwnProperty.call(labels, u.label)).map((u) => u.label))];
    return { nodes, labels, unresolved: missing };
}

// --- walking -------------------------------------------------------------------------------------
// `ctx.test(node)`   -> boolean, evaluate a condition block
// `ctx.apply(node)`  -> apply condition assignments
// `ctx.expand(text)` -> substitutions and phrase interpolation (optional)
//
// `advance()` runs until the conversation needs the player: a choice, a name, or an ending. Everything
// it passes through on the way -- text, scenes, actions, branches -- happens exactly once.
function startConversation(conv, ctx = {}) {
    const test = ctx.test || (() => true);
    const apply = ctx.apply || (() => {});
    const expand = ctx.expand || ((t) => t);
    const MAX_STEPS = 10000;   // a conversation that loops without a choice is a bug, not a hang

    let index = 0, outcome = null, text = "", scene = null, choices = [];

    function shows(el) { return !el.toDisplay || !!test(el.toDisplay); }

    function advance() {
        text = ""; choices = [];
        let steps = 0;
        while (steps++ < MAX_STEPS) {
            if (index < 0) { outcome = index; return; }
            if (index >= conv.nodes.length) { outcome = ENDPOINTS.accept; return; }   // running off the end accepts
            const n = conv.nodes[index];

            if (n.isChoice) {
                if (!n.elements.length) { choices = []; return; }                      // a name entry field
                const visible = [];
                for (let i = 0; i < n.elements.length; i++) {
                    const el = n.elements[i];
                    if (!shows(el)) continue;
                    // `to activate` (3 in the base game): the choice is SHOWN and cannot be picked.
                    visible.push({ index: i, text: expand(el.text), disabled: !!(el.toActivate && !test(el.toActivate)) });
                }
                // Every choice hidden: ES leaves the player stuck, which is an authoring bug. We fall
                // through to the node after, so a bad `to display` costs a paragraph, not the session.
                if (!visible.length || visible.every((v) => v.disabled)) { index = n.elements[0].next; continue; }
                choices = visible;
                return;
            }
            if (n.scene) scene = n.scene;
            if (n.actions) apply(n.actions);
            if (n.isBranch) {
                const yes = n.conditions ? !!test(n.conditions) : true;   // an empty branch always goes true
                index = yes ? n.elements[0].next : n.elements[1].next;
                continue;
            }
            const el = n.elements[0];
            if (el.text && shows(el)) text += expand(el.text);
            index = el.next;
        }
        outcome = ENDPOINTS.decline;   // ran away; better a declined mission than a frozen tab
    }

    function choose(i) {
        const n = conv.nodes[index];
        if (!n || !n.isChoice || !n.elements[i]) return false;
        const shown = choices.find((c) => c.index === i);
        if (!shown || shown.disabled) return false;
        index = n.elements[i].next;
        advance();
        return true;
    }

    advance();
    return {
        text: () => text,
        scene: () => scene,
        choices: () => choices.slice(),
        isName: () => outcome === null && index >= 0 && index < conv.nodes.length && conv.nodes[index].isChoice && !conv.nodes[index].elements.length,
        done: () => outcome !== null,
        outcome: () => outcome,
        outcomeName: () => outcomeName(outcome),
        result: () => missionResult(outcome),
        requiresLaunch: () => outcome != null && requiresLaunch(outcome),
        choose,
        // The name-entry node has no choices; acknowledging it moves on.
        submitName: () => { const n = conv.nodes[index]; if (!n || !n.isChoice || n.elements.length) return false; index += 1; advance(); return true; },
        node: () => index,
    };
}

export { ENDPOINTS, buildConversation, startConversation, endpointOf, outcomeName, isEndpoint, requiresLaunch, missionResult };
if (typeof module !== "undefined" && module.exports)
    module.exports = { ENDPOINTS, buildConversation, startConversation, endpointOf, outcomeName, isEndpoint, requiresLaunch, missionResult };
