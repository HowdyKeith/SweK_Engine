// WebGLEngine/tools/ship/wgslSpec-selfcheck.mjs -- v4207
//
// GATES render/wgslSpec.mjs -- a WGSL conformance check, and the first thing in this tree that reads the
// WGSL it ships.
//
// *** THE TREE WRITES WGSL IN TWENTY-ODD PLACES AND NOTHING CHECKED ANY OF IT. *** Ten .wgsl files plus
// inline shaders in fluid, mpm, blackhole, nebula, anime4k, blobulator, cell-tracking, gauges and the
// brain's transport kernels. The only check available was createShaderModule() on a live GPU, and the
// build box has none.
//
// *** SECTION 2 IS WHY THAT MATTERED: THREE SHIPPED SHADERS CANNOT RUN ON A DEFAULT DEVICE. ***
// scan.wgsl, mb-scan-blocks.wgsl and fused-single-workgroup.wgsl each declare @workgroup_size(1024), four
// times WebGPU's default maxComputeInvocationsPerWorkgroup of 256 -- and `requiredLimits` appears NOWHERE in
// this repository, so every one of its eight requestDevice() calls is bare and gets exactly the defaults.
//
// *** AND SECTION 3 IS THE PART I GOT WRONG TWICE BEFORE GETTING IT RIGHT. *** The barrier check first
// flagged any barrier inside any if/for/while, and fired on correct code in the first real shader it read.
//
// Run: node tools/ship/wgslSpec-selfcheck.mjs

import { DEFAULT_LIMITS, LIMITS_PROVENANCE, STAGES, ADDRESS_SPACES, LIMITS, stripComments,
         parseEntryPoints, parseBindings, parseWorkgroupVars, sizeOf, validateWgsl, parseWgsl,
         nonUniformNames, barriersInNonUniformControlFlow } from "../../render/wgslSpec.mjs";
import { probeSource } from "./wgslDeviceLimits.mjs";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

function* walk(dir) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p); else yield p;
    }
}
const WGSL_FILES = [...walk(ENG)].filter((f) => f.endsWith(".wgsl")).sort();

// 1) *** PARSING, AGAINST THE TREE'S OWN SHADERS. ***
{
    ok(WGSL_FILES.length >= 10, `${WGSL_FILES.length} .wgsl files in the tree`);
    const scan = read("brain/transport/shaders/scan.wgsl");
    const p = parseWgsl(scan);
    ok(p.entryPoints.length === 1 && p.entryPoints[0].stage === "compute" && p.entryPoints[0].name === "main",
        "scan.wgsl: one @compute entry point called main");
    ok(JSON.stringify(p.entryPoints[0].workgroupSize) === "[1024,1,1]",
        "and its workgroup size reads as [1024,1,1] -- a bare X fills Y and Z with 1, as the spec says");
    ok(p.entryPoints[0].workgroupSizeIsLiteral, "recognised as a literal, so it can be checked");
    ok(p.bindings.length === 2 && p.bindings.every((b) => b.addressSpace === "storage" && b.access === "read_write"),
        `both bindings parse as storage,read_write: ${p.bindings.map((b) => `${b.group}/${b.binding} ${b.name}`).join(" ")}`);
    ok(p.workgroupVars.length === 1 && p.workgroupVars[0].bytes === 4096,
        `and array<u32, 1024> of workgroup storage sizes to ${p.workgroupVars[0].bytes} bytes`);
    // *** A TEMPLATE HOLE IS NOT A VIOLATION. *** Much of this tree builds WGSL in template literals.
    const tpl = "@compute @workgroup_size(${WG})\nfn main() {}";
    const t = parseEntryPoints(tpl);
    ok(t.length === 1 && !t[0].workgroupSizeIsLiteral, "a ${...} workgroup size parses as non-literal, not as a bad shader");
    ok(validateWgsl(tpl).length === 0, "...and passes validation, because it cannot be judged until the string is assembled");
    ok(validateWgsl(tpl, { allowTemplates: false }).some((x) => /not a literal/.test(x)),
        "...unless the caller asks to be told, which is a different question");
    // sizeOf, including the one everybody gets wrong.
    ok(sizeOf("f32") === 4 && sizeOf("vec2<f32>") === 8 && sizeOf("vec4<f32>") === 16, "scalar and vector sizes");
    ok(sizeOf("vec3<f32>") === 16, "vec3<f32> is 16 bytes, not 12 -- WGSL aligns it like a vec4, and under-counting it clears a shader that overflows");
    ok(sizeOf("array<vec4<f32>, 64>") === 1024, "arrays multiply through");
    ok(sizeOf("MyStruct") === null && sizeOf("array<u32>") === null,
        "and a struct or a runtime-sized array returns null -- an UNKNOWN size, which is not zero");
    ok(stripComments("a\n// x\nb\n/* y\nz */\nc").split("\n").length === 6, "stripComments keeps the line count");
}

// 2) *** THE FINDING: THREE SHIPPED SHADERS EXCEED THE DEFAULT DEVICE LIMITS. ***
{
    const results = WGSL_FILES.map((f) => [path.relative(ENG, f), validateWgsl(fs.readFileSync(f, "utf8"))]);
    const over = results.filter(([, p]) => p.some((x) => /invocations per workgroup, over the limit/.test(x)));
    ok(over.length === 3, `${over.length} shipped .wgsl files declare more invocations per workgroup than a default device allows`);
    for (const [f] of over) ok(/scan|fused-single-workgroup/.test(f), `  ${f}`);
    const clean = results.filter(([, p]) => p.length === 0);
    ok(clean.length === WGSL_FILES.length - 3,
        `and the other ${clean.length} validate clean -- the check is not simply rejecting everything`);
    // *** requiredLimits APPEARS NOWHERE, SO THE DEFAULTS ARE NOT A CONSERVATIVE FLOOR -- THEY ARE THE FACT. ***
    // *** THE SCAN MUST EXCLUDE THE THREE FILES THIS ROUND ADDED, OR IT COUNTS ITS OWN DETECTOR. ***
    // First run reported "requiredLimits appears 3 times" and went red against a true claim: every one of
    // those three was in render/wgslSpec.mjs, this gate, or tools/ship/wgslDeviceLimits.mjs -- as a variable
    // name, a regex literal and a template-literal comment, none of which codeOnly() strips. A checker that
    // counts itself measures the checker.
    const SELF = ["render/wgslSpec.mjs", "tools/ship/wgslSpec-selfcheck.mjs", "tools/ship/wgslDeviceLimits.mjs"];
    let requestDevice = 0, requiredLimits = 0, scanned = 0;
    for (const f of walk(ENG)) {
        if (!/\.(js|mjs|html)$/.test(f)) continue;
        if (SELF.includes(path.relative(ENG, f))) continue;
        scanned++;
        const src = codeOnly(fs.readFileSync(f, "utf8"));
        requestDevice += (src.match(/requestDevice\s*\(/g) || []).length;
        requiredLimits += (src.match(/requiredLimits/g) || []).length;
    }
    ok(requestDevice >= 8, `${requestDevice} requestDevice() call sites in the tree`);
    ok(requiredLimits === 0,
        `and across ${scanned} files requiredLimits appears ${requiredLimits} times -- every device in this tree ` +
        `runs at the defaults, so a 1024-wide workgroup is not merely unportable, it cannot be created here`);
    note(`over-limit: ${over.map(([f]) => path.basename(f)).join(", ")}`);
}

// 3) *** THE BARRIER CHECK, AND THE TWO FALSE POSITIVES IT USED TO PRODUCE. ***
{
    const scan = stripComments(read("brain/transport/shaders/scan.wgsl"));
    const nu = nonUniformNames(scan);
    ok(nu.has("lid") && nu.has("gid"), `invocation builtins found: ${[...nu].filter((x) => ["lid", "gid"].includes(x)).join(", ")}`);
    ok(nu.has("thid"), "and one hop of propagation: `let thid = lid.x;` makes thid non-uniform too");
    // *** THE REGRESSION. *** scan.wgsl's barriers are CORRECT: one is the first statement of a for loop
    // whose trip count is the same for every invocation, and the other sits at plain function scope. The
    // first version of this check flagged both -- "any barrier inside any if/for/while" -- and a validator
    // that fires on correct code teaches people to ignore it.
    ok(barriersInNonUniformControlFlow(scan).length === 0,
        "scan.wgsl's barriers are NOT flagged: a uniform for-loop is uniform control flow, and one at function scope is not in a conditional at all");
    ok(validateWgsl(read("brain/transport/shaders/scan.wgsl")).every((x) => !/Barrier/.test(x)),
        "...so no barrier problem survives into its problem list");
    // And the true positive it must still catch.
    const bad = ["@group(0) @binding(0) var<storage, read_write> d: array<u32>;",
                 "var<workgroup> s: array<u32,64>;",
                 "@compute @workgroup_size(64)",
                 "fn main(@builtin(local_invocation_id) lid: vec3<u32>) {",
                 "  let t = lid.x;",
                 "  if (t < 32u) {", "    workgroupBarrier();", "    s[t] = d[t];", "  }", "}"].join("\n");
    const hits = barriersInNonUniformControlFlow(stripComments(bad));
    ok(hits.length === 1 && hits[0].fn === "workgroupBarrier", "a barrier inside `if (t < 32u)` where t comes from local_invocation_id IS flagged");
    ok(hits[0].on === "t < 32u", `and the report names the predicate that makes it non-uniform: "${hits[0].on}"`);
    // A barrier under a uniform condition is left alone.
    const uniformIf = bad.replace("if (t < 32u)", "if (arrayLength(&d) > 4u)");
    ok(barriersInNonUniformControlFlow(stripComments(uniformIf)).length === 0,
        "a barrier under a condition with no invocation id in it is left alone");
    // *** THE GREEDY-REGEX BUG, REPLAYED. *** The condition capture was [\s\S]* and matched from an `if (`
    // far above, through a whole block, to a later `)` -- reporting predicates like
    // "gid.x < n) { shared_data[thid] = ...; } el" and flagging correct code on that basis.
    const twoBlocks = ["fn f(@builtin(local_invocation_id) lid: vec3<u32>) {",
                       "  if (lid.x < 4u) { let a = 1u; }",
                       "  workgroupBarrier();", "}"].join("\n");
    ok(barriersInNonUniformControlFlow(stripComments(twoBlocks)).length === 0,
        "a barrier AFTER a closed non-uniform block is not attributed to it -- a condition cannot span a brace");
}

// 4) *** THE OTHER RULES, EACH WITH A SHADER THAT BREAKS EXACTLY ONE. ***
{
    const has = (src, re) => validateWgsl(src).some((x) => re.test(x));
    ok(validateWgsl("").length === 1, "an empty source is refused");
    ok(has("fn helper() -> u32 { return 1u; }", /no entry point/), "a module with no entry point is refused");
    ok(has("@compute\nfn main() {}", /no @workgroup_size/), "@compute without @workgroup_size is refused -- the spec requires it");
    ok(has("@fragment @workgroup_size(8)\nfn main() {}", /only valid on @compute/), "@workgroup_size on a fragment stage is refused");
    ok(!has("@fragment\nfn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }", /workgroup/),
        "...while a plain fragment entry point is fine");
    ok(has("@group(0) @binding(0) var<storage> a: array<u32>;\n@group(0) @binding(0) var<storage> b: array<u32>;\n@compute @workgroup_size(1)\nfn m() {}", /declared twice/),
        "two resources on one (group, binding) is refused -- the shader compiler will not catch that");
    ok(has("@group(9) @binding(0) var<storage> a: array<u32>;\n@compute @workgroup_size(1)\nfn m() {}", /beyond maxBindGroups/),
        "a group index past maxBindGroups is refused");
    ok(has("@group(0) @binding(0) var<uniform, read_write> a: vec4<f32>;\n@compute @workgroup_size(1)\nfn m() {}", /read_write is only valid in the storage/),
        "read_write outside the storage address space is refused");
    ok(has("@group(0) @binding(0) var<nowhere> a: vec4<f32>;\n@compute @workgroup_size(1)\nfn m() {}", /unknown address space/),
        "an unknown address space is refused");
    ok(has("var<workgroup> big: array<vec4<f32>, 2048>;\n@compute @workgroup_size(64)\nfn m() {}", /workgroup storage is \d+ bytes, over/),
        `32768 bytes of workgroup storage is refused against a ${DEFAULT_LIMITS.maxComputeWorkgroupStorageSize} budget`);
    // *** THE LIMITS ARE A PARAMETER, WHICH IS THE WHOLE POINT OF NOT TRUSTING THE RECORDED NUMBERS. ***
    const big = "@compute @workgroup_size(1024)\nfn m() {}";
    ok(validateWgsl(big).length > 0, "1024 is refused against the recorded defaults");
    ok(validateWgsl(big, { limits: { ...DEFAULT_LIMITS, maxComputeWorkgroupSizeX: 1024, maxComputeInvocationsPerWorkgroup: 1024 } }).length === 0,
        "and accepted against a device that reports it can do 1024 -- the limits are an argument, not a constant");
    ok(STAGES.length === 3 && ADDRESS_SPACES.length === 6, `${STAGES.length} stages, ${ADDRESS_SPACES.length} address spaces`);
}

// 5) *** THE PROVENANCE OF THE NUMBERS, WHICH IS v4203'S LESSON APPLIED BEFORE THE MISTAKE. ***
{
    ok(LIMITS_PROVENANCE.verifiedAgainstSpec === false && LIMITS_PROVENANCE.verifiedAgainstDevice === false,
        "DEFAULT_LIMITS records that it was verified against NEITHER the spec nor a device");
    ok(/blocked|egress|no navigator\.gpu/i.test(LIMITS_PROVENANCE.why), `and says why: ${LIMITS_PROVENANCE.why.slice(0, 80)}...`);
    ok(LIMITS_PROVENANCE.checkWith === "tools/ship/wgslDeviceLimits.mjs" && fs.existsSync(path.join(ENG, LIMITS_PROVENANCE.checkWith)),
        "and names a tool that exists, so the check is a path and not an intention");
    ok(typeof probeSource() === "string" && /requestAdapter|requestDevice/.test(probeSource()),
        "the probe is exportable source a person can paste into any browser console");
    ok(/requiredLimits appears nowhere|BARE requestDevice/.test(probeSource()),
        "and it takes a BARE device deliberately, matching how this tree asks for one");
    // Every limit is a positive integer, or the comparisons above are meaningless.
    for (const [k, v] of Object.entries(DEFAULT_LIMITS)) ok(Number.isInteger(v) && v > 0, `${k} = ${v}`);
}

// 6) *** THE STATED LIMITS ARE REAL. *** v4204 caught me claiming a limitation the module did not have.
{
    ok(LIMITS.length === 5, `${LIMITS.length} limits written down`);
    ok(LIMITS.every((l) => typeof l === "string" && l.length > 30), "each is a sentence");
    ok(validateWgsl("@compute @workgroup_size(64)\nfn m() { let x = notDeclaredAnywhere; }").length === 0,
        "LIMIT: conformance is not compilation -- an undefined identifier passes here and fails at createShaderModule");
    ok(sizeOf("MyStruct") === null,
        "LIMIT: a struct is unsized to this scanner, so a workgroup total can be an under-count");
    const helper = ["fn helper() { workgroupBarrier(); }",
                    "@compute @workgroup_size(64)",
                    "fn main(@builtin(local_invocation_id) lid: vec3<u32>) { if (lid.x < 8u) { helper(); } }"].join("\n");
    ok(validateWgsl(helper).every((x) => !/Barrier/.test(x)),
        "LIMIT: a barrier reached through a helper function is a false negative -- stated, and demonstrated");
    ok(validateWgsl("@compute @workgroup_size(${WG})\nfn m() {}").length === 0,
        "LIMIT: a template hole cannot be checked until the string is assembled");
}

// 7) *** PURITY AND WIRING. ***
{
    const src = codeOnly(read("render/wgslSpec.mjs"));
    ok(!/\bdocument\b|\bwindow\b|navigator\.|readFileSync|fetch\(/.test(src),
        "wgslSpec.mjs touches no DOM, no GPU and no disk -- it is handed a string");
    ok(!/Math\.random|Date\.now/.test(src), "and has no clock and no randomness");
    const tool = noComments(read("tools/ship/wgslDeviceLimits.mjs"));
    ok(/fileURLToPath\(import\.meta\.url\) === process\.argv\[1\]/.test(tool),
        "the device tool only launches a browser when run directly -- v4204 shipped that bug once and it is not repeated");
    ok(/dantiicu\/dawn-switch/.test(prose(read("render/wgslSpec.mjs"))), "and the module records where the idea was reached from");
    ok(/transitionSpec/.test(prose(read("render/wgslSpec.mjs"))), "and which of this tree's shapes it follows");
    const mainQ = noComments(read("main.js")), mainC = codeOnly(read("main.js"));
    ok(/import \{[^}]*validateWgsl[^}]*\} from ["']\.\/render\/wgslSpec\.mjs["']/.test(mainQ), "main.js imports the validator");
    ok(/window\.wgsl\s*=/.test(mainC), "and exposes window.wgsl");
    ok(/DEFAULT_LIMITS|limits/.test(mainC), "with the limits reachable, since they are the thing most likely to be wrong");
    for (const f of WGSL_FILES) note(`${path.relative(ENG, f)}: ${validateWgsl(fs.readFileSync(f, "utf8")).length} problem(s)`);
}

console.log(`wgslSpec-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
