// Self-check for ev/esConversation.js + ev/esSubs.js.
//
//   node ev/tools/es-conversation-selfcheck.mjs
//   node ev/tools/es-conversation-selfcheck.mjs /path/to/endless-sky/data
//
// The last big honest stub in the mission runner. A `conversation` used to be dropped on the floor and
// acceptance assumed, so every branching story in the game had exactly one branch. v2176 made the hole
// impossible to ignore: the default start's intro -- where the banker reads out your mortgage and you
// choose your first ship -- was recorded and never played.
//
// The grammar is small and every rule in it decides where the story goes, so each is pinned: what merges
// with what, where a branch goes when a target is omitted, that `goto accept` is an ENDPOINT and not a
// label unless a label of that name exists, that `to display` hides text without changing the path, and
// that a conversation which runs off the end accepts.

import { parseES, parseESFiles } from "../esParse.js";
import { buildUniverseFromES } from "../esData.js";
import { buildConversation, startConversation, ENDPOINTS, endpointOf, outcomeName, requiresLaunch, missionResult } from "../esConversation.js";
import { buildSubstitutions, substitutionMap, applySubstitutions, playerSubstitutions, RESERVED } from "../esSubs.js";
import { makeRng } from "../esAuthority.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

const C = (lines) => buildConversation(parseES(["conversation \"t\"", ...lines].join("\n")).children[0]);
// Walk to the end, always taking choice `pick` (default: the first).
const play = (conv, opts = {}) => {
    const r = startConversation(conv, { test: opts.test || (() => true), apply: opts.apply || (() => {}), expand: opts.expand });
    const seen = [];
    let g = 0;
    while (!r.done() && g++ < 200) {
        seen.push(r.text());
        if (r.isName()) { r.submitName(); continue; }
        const ch = r.choices();
        if (!ch.length) break;
        r.choose(ch[opts.pick != null ? Math.min(opts.pick, ch.length - 1) : 0].index);
    }
    seen.push(r.text());
    return { r, text: seen.join(""), outcome: r.outcomeName() };
};

// --- 1. text, merging, and where it stops merging -----------------------------------------------
{
    const c = C(['\t`One.`', '\t`Two.`']);
    ok("consecutive lines merge into one node", c.nodes.length === 1);
    ok("...and both are spoken", play(c).text === "One.\nTwo.\n");
    ok("running off the end accepts", play(c).outcome === "accept");

    const l = C(['\t`One.`', '\tlabel here', '\t`Two.`']);
    ok("a label breaks the merge: text above never joins text below", l.nodes.length === 2);
    ok("...and the label names the node that follows", l.labels.here === 1);

    const a = C(['\t`One.`', '\taction', '\t\tset "x"', '\t`Two.`']);
    ok("an action breaks the merge", a.nodes.length === 3);

    const s = C(['\t`One.`', '\tscene "backdrop"', '\t`Two.`']);
    ok("a scene always starts a new node", s.nodes.length === 2);
    ok("...and names a backdrop", play(s).r.scene() === "backdrop");

    ok("a text line with a value is skipped, as ES skips it", C(['\ttext extra']).nodes.length === 0);
}

// --- 2. actions run, once, on the way past --------------------------------------------------------
{
    let applied = 0;
    const c = C(['\t`Hi.`', '\taction', '\t\tset "x"', '\t`Bye.`']);
    const out = play(c, { apply: () => applied++ });
    ok("an action on the path is applied", applied === 1);
    ok("...and the text on both sides is spoken", out.text === "Hi.\nBye.\n");

    let skipped = 0;
    const b = C(['\tbranch skip', '\t\thas "x"', '\taction', '\t\tset "y"', '\tlabel skip', '\t`End.`']);
    play(b, { test: () => true, apply: () => skipped++ });
    ok("an action the branch jumped over is NOT applied", skipped === 0);
    play(b, { test: () => false, apply: () => skipped++ });
    ok("...and IS applied when the branch falls through", skipped === 1);
}

// --- 3. choices ------------------------------------------------------------------------------------
{
    const c = C([
        '\t`Pick.`',
        '\tchoice',
        '\t\t`\tYes.`', '\t\t\tgoto yes',
        '\t\t`\tNo.`',
        '\t`Fell through.`',
        '\tgoto end',
        '\tlabel yes',
        '\t`You said yes.`',
        '\tlabel end',
        '\t`Done.`',
    ]);
    ok("a choice offers each of its lines", startConversation(c, {}).choices().length === 2);
    ok("a choice with a goto goes there", play(c, { pick: 0 }).text.includes("You said yes."));
    ok("a choice WITHOUT a goto falls through to the next node", play(c, { pick: 1 }).text.includes("Fell through."));
    ok("...and both reach the end", play(c, { pick: 0 }).text.includes("Done.") && play(c, { pick: 1 }).text.includes("Done."));
    ok("a multi-token choice line is skipped, as ES skips it", C(['\tchoice', '\t\t`\tone` two']).nodes.length === 0);

    // `to display` on a choice hides it without changing anything else
    const d = C(['\tchoice', '\t\t`\tSecret.`', '\t\t\tto display', '\t\t\t\thas "x"', '\t\t`\tPlain.`']);
    ok("a hidden choice is not offered", startConversation(d, { test: () => false }).choices().length === 1);
    ok("...and is offered when its condition holds", startConversation(d, { test: () => true }).choices().length === 2);
    // `to activate` (3 in the base game): shown, and not selectable.
    const act = C(['\tchoice', '\t\t`\tLocked.`', '\t\t\tto activate', '\t\t\t\thas "x"', '\t\t`\tOpen.`']);
    const ra = startConversation(act, { test: () => false });
    ok("a `to activate` choice is shown", ra.choices().length === 2);
    ok("...and marked unselectable", ra.choices()[0].disabled === true && ra.choices()[1].disabled === false);
    ok("...and refuses to be chosen", ra.choose(0) === false && ra.choose(1) === true);

    ok("every choice hidden -> fall through rather than freeze",
        startConversation(C(['\tchoice', '\t\t`\tOnly.`', '\t\t\tto display', '\t\t\t\thas "x"']), { test: () => false }).done() === true);
}

// --- 4. branch ------------------------------------------------------------------------------------
{
    const two = C(['\tbranch yes no', '\t\thas "x"', '\tlabel yes', '\t`Yes.`', '\tgoto end', '\tlabel no', '\t`No.`', '\tlabel end', '\t`Fin.`']);
    ok("a true branch takes the first target", play(two, { test: () => true }).text.includes("Yes."));
    ok("a false branch takes the second", play(two, { test: () => false }).text.includes("No."));

    const one = C(['\tbranch yes', '\t\thas "x"', '\t`Fell through.`', '\tgoto end', '\tlabel yes', '\t`Jumped.`', '\tlabel end', '\t`Fin.`']);
    ok("a branch with one target jumps when true", play(one, { test: () => true }).text.includes("Jumped."));
    ok("...and falls through to the next node when false", play(one, { test: () => false }).text.includes("Fell through."));

    const empty = C(['\tbranch yes', '\t`Skipped.`', '\tlabel yes', '\t`Taken.`']);
    ok("a branch with no conditions always goes true (ES: an empty set tests true)",
        play(empty, { test: () => false }).text.includes("Taken.") && !play(empty, { test: () => false }).text.includes("Skipped."));
}

// --- 5. endpoints ----------------------------------------------------------------------------------
{
    ok("the eight endpoint words are ES's", endpointOf("accept") === -1 && endpointOf("decline") === -2
        && endpointOf("defer") === -3 && endpointOf("launch") === -4 && endpointOf("flee") === -5
        && endpointOf("depart") === -6 && endpointOf("die") === -7 && endpointOf("explode") === -8);
    ok("anything else is a label, not an endpoint", endpointOf("elsewhere") === 0);

    // An endpoint is a BARE KEYWORD under a text line or a choice. `goto accept` is a jump to a LABEL
    // named "accept" and nothing else -- Conversation::Goto never consults the endpoint table. This file
    // originally had it backwards, and the base game does both, side by side, in deep missions.txt:436.
    for (const [word, result] of [["accept", "accept"], ["launch", "accept"], ["decline", "decline"], ["flee", "decline"],
        ["defer", "defer"], ["depart", "defer"], ["die", "die"], ["explode", "die"]]) {
        const c = C(['\t`Bye.`', '\t\t' + word]);
        ok(`a bare \`${word}\` ends the conversation as ${word}`, play(c).outcome === word);
        ok(`...and the mission result is "${result}"`, missionResult(ENDPOINTS[word]) === result);
    }
    const ch = C(['\tchoice', '\t\t`\tYes.`', '\t\t\taccept', '\t\t`\tNo.`', '\t\t\tdecline']);
    ok("a choice may end the conversation", play(ch, { pick: 0 }).outcome === "accept" && play(ch, { pick: 1 }).outcome === "decline");
    ok("launch, flee and depart force the player off the ground",
        requiresLaunch(ENDPOINTS.launch) && requiresLaunch(ENDPOINTS.flee) && requiresLaunch(ENDPOINTS.depart)
        && !requiresLaunch(ENDPOINTS.accept) && !requiresLaunch(ENDPOINTS.die));

    // `goto accept` is a JUMP TO A LABEL, even though "accept" is also an endpoint word. The base game
    // relies on this: deep missions.txt has `goto accept` in a choice and `label accept` eight lines down.
    const shadow = C(['\t`Go.`', '\t\tgoto accept', '\t`Skipped.`', '\tlabel accept', '\t`Not the endpoint.`']);
    ok("`goto accept` finds the label, not the endpoint", play(shadow).text.includes("Not the endpoint."));
    ok("...and does not fall through on the way", !play(shadow).text.includes("Skipped."));
    ok("a forward reference is patched when the label appears", shadow.unresolved.length === 0);

    // A branch target is the one place ES checks the endpoint table before the labels.
    const bre = C(['\tbranch accept', '\t\thas "x"', '\t`Not taken.`']);
    ok("a branch target MAY be an endpoint word", play(bre, { test: () => true }).outcome === "accept");
    ok("...and is a label otherwise", play(C(['\tbranch there', '\t\thas "x"', '\t`No.`', '\tlabel there', '\t`Yes.`']), { test: () => true }).text.includes("Yes."));

    ok("a goto to a label that does not exist limps on rather than hanging",
        (() => { const c = C(['\t`Go.`', '\t\tgoto nowhere', '\t`Next.`']); return c.unresolved.includes("nowhere") && play(c).outcome === "accept"; })());
}

// --- 6. the name entry field ------------------------------------------------------------------------
{
    const c = C(['\t`Sign here:`', '\tname', '\t`Thank you.`']);
    const r = startConversation(c, {});
    ok("a `name` node asks for a name", r.isName() && !r.choices().length);
    ok("...and moves on when it is given", r.submitName() && r.text() === "Thank you.\n");
    ok("...and the conversation still ends", r.done() && r.outcomeName() === "accept");
}

// --- 7. a conversation that loops without a choice cannot hang the tab -------------------------------
{
    const c = C(['\tlabel top', '\t`Round and round.`', '\tgoto top']);
    const out = play(c);
    ok("an unbreakable loop bails out rather than freezing", out.r.done());
    ok("...as a decline, which is the safe way to fail", out.outcome === "decline");
}

// --- 8. substitutions --------------------------------------------------------------------------------
{
    const subs = buildSubstitutions(parseES([
        'substitutions',
        '\t"<mood>" "cheerful"',
        '\t"<mood>" "grim"',
        '\t\thas "war"',
        '\t"noangle" "ignored"',
        '\t"<nothing>"',
        '\t"<first>" "hacked"',
    ].join("\n")));
    ok("entries load", subs.length === 2);
    ok("a key without an angle bracket is skipped", !subs.some((s) => s.key === "noangle"));
    ok("a key with no replacement is skipped", !subs.some((s) => s.key === "<nothing>"));
    ok("data may not shadow a reserved key", !subs.some((s) => s.key === "<first>") && RESERVED.has("<first>"));

    ok("the later entry wins when its condition holds", substitutionMap(subs, () => true)["<mood>"] === "grim");
    ok("...and the earlier one stands when it does not", substitutionMap(subs, () => false)["<mood>"] === "cheerful");

    const map = { "<a>": "1", "<b>": "2" };
    ok("tokens are replaced", applySubstitutions("<a> and <b>", map) === "1 and 2");
    ok("an unknown token is left exactly as written", applySubstitutions("<a> and <z>", map) === "1 and <z>");
    ok("a lone angle bracket is harmless", applySubstitutions("5 < 6", map) === "5 < 6");
    ok("nothing is rescanned: a replacement containing a token is not expanded again",
        applySubstitutions("<a>", { "<a>": "<b>", "<b>": "loop" }) === "<b>");
    ok("empty in, empty out", applySubstitutions("", map) === "" && applySubstitutions(null, map) === "");

    const me = playerSubstitutions({ first: "Ada", last: "Lovelace", payment: 1500, model: "Sparrow" });
    ok("the pilot's name is ours to supply", me["<first>"] === "Ada" && me["<last>"] === "Lovelace");
    ok("a payment is formatted with its unit", me["<payment>"] === "1,500 credits");
    ok("a key with nothing behind it is simply absent", !("<npc>" in me));
}

// --- 9. text is expanded on the way to the screen ------------------------------------------------------
{
    const c = C(['\t`Hello, <first>.`']);
    const map = playerSubstitutions({ first: "Ada" });
    ok("conversation text is substituted", play(c, { expand: (t) => applySubstitutions(t, map) }).text === "Hello, Ada.\n");
    const ch = C(['\tchoice', '\t\t`\tPay <payment>.`']);
    ok("...and so are the choices",
        startConversation(ch, { expand: (t) => applySubstitutions(t, playerSubstitutions({ payment: 90 })) }).choices()[0].text.trim() === "Pay 90 credits.");
}

// --- 10. optional: every conversation in the real game ---------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const gather = (d) => { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith("_")) continue; const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(gather(p)); else if (e.name.endsWith(".txt")) o.push(p); } return o; };
    const uni = buildUniverseFromES(parseESFiles(gather(dir).map((f) => fs.readFileSync(f, "utf8"))));

    const inline = [];
    const walk = (n) => { for (const c of n.children || []) { if (c.tokens[0] === "conversation" && c.children && c.children.length) inline.push(c); walk(c); } };
    for (const m of uni.esMissions) walk(m);
    for (const e of uni.esEvents) walk(e);
    const all = [...Object.values(uni.conversations), ...inline];

    console.log("");
    console.log(`  (real data: ${uni.counts.conversations} root conversations, ${inline.length} written inline, ${uni.counts.substitutions} substitutions)`);

    let threw = 0, unresolved = 0, stalled = 0, unfinished = 0;
    const ends = {};
    for (const node of all) {
        let conv;
        try { conv = buildConversation(node); } catch (e) { threw++; continue; }
        if (conv.unresolved.length) unresolved++;
        for (const seed of [1, 2, 3, 4, 5]) {
            const rng = makeRng(seed);
            try {
                const r = startConversation(conv, { test: () => rng() < 0.5, apply: () => {}, expand: (t) => t });
                let g = 0;
                while (!r.done() && g++ < 20000) {
                    if (r.isName()) { r.submitName(); continue; }
                    const ch = r.choices();
                    if (!ch.length) { stalled++; break; }
                    r.choose(ch[Math.floor(rng() * ch.length)].index);
                }
                if (!r.done()) unfinished++;
                else ends[r.outcomeName()] = (ends[r.outcomeName()] || 0) + 1;
            } catch (e) { threw++; }
        }
    }
    ok(`real data: all ${all.length} conversations build without throwing`, threw === 0);
    ok("real data: every label in the game resolves", unresolved === 0);
    ok("real data: 5 random walks of each never stall on a node with no way out", stalled === 0);
    // A player can circle a question hub forever too, by never picking "that's all". 45 of 8,345 walks do.
    ok(`real data: ${8345 - unfinished} of 8345 random walks reach an ending`, unfinished < all.length / 20);
    ok("real data: every ending is one of ES's eight words", Object.keys(ends).every((k) => k in ENDPOINTS));

    const intro = buildConversation(uni.conversations["default intro"]);
    const map = playerSubstitutions({ first: "Ada", last: "Lovelace" });
    const out = play(intro, { expand: (t) => applySubstitutions(t, map) });
    ok("real data: the default start's intro plays", out.outcome === "accept");
    ok("real data: ...opening on the bank lobby", startConversation(intro, {}).scene() === "scene/lobby");
    ok("real data: ...and the banker reads out the same numbers esAccount computes",
        out.text.includes("2,503 credits") && out.text.includes("433,567 credits in interest"));
    ok("real data: ...and it asks you to sign your name", intro.nodes.some((n) => n.isChoice && !n.elements.length));
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
