// FILE: ui/kaggleSetupWizard.js
// VERSION: v1 — round 200 (v695)
//
// First-time Kaggle setup wizard. Walks new users through the four
// steps that were previously buried in kaggleBridge.js's header
// comment:
//
//   1. Sign in / create a Kaggle account
//   2. Phone-verify the account (Kaggle requires this for GPU access)
//   3. Generate an API token (downloads kaggle.json)
//   4. Paste the kaggle.json contents into the wizard
//   5. Install the kaggle Python package
//   6. Verify the connection works
//
// The wizard auto-detects current state on open via GET /kaggle/status:
//
//   { configured, kaggleInstalled, authOk, authError, ... }
//
// If a user is already partially set up, the wizard skips ahead to the
// first unsatisfied step. If everything passes, it goes straight to a
// "Setup complete!" panel with a "Re-run" option (in case they need to
// rotate the API token).
//
// USAGE:
//   import { mountKaggleSetupWizard } from "./ui/kaggleSetupWizard.js";
//   const wizard = mountKaggleSetupWizard();
//   wizard.open();           // shows the panel
//   wizard.close();          // hides it
//   wizard.onComplete(fn);   // callback when setup finishes
//
// kaggleLab.js wires a "⚙ First-time setup" link at the top of its
// panel that calls wizard.open(). When Kaggle Lab detects
// configured: false on mount, it auto-opens the wizard once.

const C = {
    bg:       "rgba(10, 14, 22, 0.97)",
    border:   "#553a7a",
    accent:   "#c9b",
    text:     "#cfd",
    dim:      "#9bc",
    ok:       "#6c8",
    warn:     "#ec9",
    bad:      "#c66",
    step_bg:  "rgba(20, 24, 36, 0.92)",
    btn_bg:   "rgba(85, 58, 122, 0.4)",
    btn_brd:  "#7c5fa8",
    input_bg: "#15131e",
};

const STEPS = [
    { id: "account",  num: 1, label: "Kaggle account" },
    { id: "phone",    num: 2, label: "Phone-verify" },
    { id: "token",    num: 3, label: "API token" },
    { id: "paste",    num: 4, label: "Save credentials" },
    { id: "install",  num: 5, label: "Install kaggle (pip)" },
    { id: "verify",   num: 6, label: "Verify connection" },
];

// Helpers ---------------------------------------------------------------

function el(tag, styles, text) {
    const e = document.createElement(tag);
    if (styles) Object.assign(e.style, styles);
    if (text != null) e.textContent = text;
    return e;
}

async function _status() {
    try {
        const r = await fetch("/kaggle/status", { cache: "no-store" });
        if (!r.ok) return null;
        return r.json();
    } catch { return null; }
}

async function _postConfig({ username, key }) {
    try {
        const r = await fetch("/kaggle/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, key }),
        });
        const txt = await r.text();
        if (!txt) return { ok: r.ok };
        try { return JSON.parse(txt); } catch { return { ok: false, error: txt.slice(0, 200) }; }
    } catch (e) { return { ok: false, error: e.message }; }
}

async function _postInstall() {
    try {
        const r = await fetch("/kaggle/install", { method: "POST" });
        const txt = await r.text();
        if (!txt) return { ok: r.ok };
        try { return JSON.parse(txt); } catch { return { ok: false, error: txt.slice(0, 200) }; }
    } catch (e) { return { ok: false, error: e.message }; }
}

// Parse the user-pasted kaggle.json. Accepts either:
//   - the full JSON `{"username":"...", "key":"..."}`
//   - or two separate lines "username: foo / key: bar"
// Returns { username, key } on success or { error } on failure.
function _parseKaggleJson(raw) {
    const s = String(raw || "").trim();
    if (!s) return { error: "paste your kaggle.json contents (you downloaded the file in step 3)" };
    // Try JSON first
    try {
        const j = JSON.parse(s);
        if (j.username && j.key) return { username: String(j.username), key: String(j.key) };
    } catch {}
    // Fallback regex parse — handles "username: x" line format
    const u = s.match(/username\s*[:=]\s*["']?([\w.-]+)/i);
    const k = s.match(/key\s*[:=]\s*["']?([\w]+)/i);
    if (u && k) return { username: u[1], key: k[1] };
    return { error: "couldn't find username + key in what you pasted. Expected JSON: {\"username\":\"...\",\"key\":\"...\"}" };
}

// Wizard mount ----------------------------------------------------------

export function mountKaggleSetupWizard() {
    let root = null;
    let _onComplete = null;

    function _build() {
        const wrap = el("div", {
            position: "fixed",
            top: "60px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "9500",
            width: "min(560px, calc(100vw - 32px))",
            maxHeight: "calc(100vh - 100px)",
            overflow: "auto",
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: "10px",
            padding: "14px 18px",
            color: C.text,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: "12px",
            lineHeight: "1.5",
            boxShadow: "0 12px 40px rgba(0,0,0,0.65)",
        });

        wrap.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                <div style="color:${C.accent}; font-weight:700; font-size:14px; letter-spacing:0.04em;">
                    🧙 KAGGLE SETUP WIZARD
                </div>
                <button id="ksw-close" title="close" style="background:transparent; border:0; color:${C.text}; cursor:pointer; font-size:16px; padding:2px 6px;">✕</button>
            </div>
            <div style="color:${C.dim}; font-size:11px; margin-bottom:12px;">
                Connects this engine to your Kaggle account so the AI bridge can submit notebooks to free T4 / P100 GPUs.
                Detects current state — skips steps you've already done.
            </div>
            <div id="ksw-summary" style="background:${C.step_bg}; border:1px solid ${C.border}; border-radius:6px; padding:8px 10px; margin-bottom:12px; font-size:11px;">
                <span style="color:${C.dim};">Loading current state…</span>
            </div>
            <div id="ksw-steps"></div>
            <div id="ksw-msg" style="margin-top:10px; font-size:11px; min-height:1.4em; color:${C.dim};"></div>
        `;

        // Build each step row
        const stepsContainer = wrap.querySelector("#ksw-steps");
        for (const step of STEPS) {
            const row = el("div", {
                background: C.step_bg,
                border: `1px solid ${C.border}`,
                borderRadius: "6px",
                padding: "8px 10px",
                margin: "6px 0",
            });
            row.id = `ksw-step-${step.id}`;
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="ksw-status" style="font-size:14px; min-width:18px; text-align:center;">◯</span>
                    <span style="color:${C.accent}; font-weight:600;">${step.num}.</span>
                    <span style="color:${C.text}; flex:1;">${step.label}</span>
                </div>
                <div class="ksw-body" style="margin-top:6px; display:none;"></div>
            `;
            stepsContainer.appendChild(row);
        }

        return wrap;
    }

    // Show/hide a step's expanded body. Active step is auto-expanded;
    // done steps collapse; pending steps stay collapsed.
    function _setStepState(stepId, state, html) {
        const row = root.querySelector(`#ksw-step-${stepId}`);
        if (!row) return;
        const statusEl = row.querySelector(".ksw-status");
        const bodyEl   = row.querySelector(".ksw-body");
        const symbols = { pending: "◯", active: "⏳", done: "✓", bad: "✗" };
        const colors  = { pending: C.dim, active: C.accent, done: C.ok, bad: C.bad };
        statusEl.textContent = symbols[state] || "◯";
        statusEl.style.color  = colors[state]   || C.dim;
        if (html != null) bodyEl.innerHTML = html;
        bodyEl.style.display = (state === "active" || state === "bad") ? "block" : "none";
        row.style.borderColor = (state === "active") ? "#9d7fcc" : C.border;
    }

    async function _refresh() {
        const summary = root.querySelector("#ksw-summary");
        const msg     = root.querySelector("#ksw-msg");
        msg.textContent = "";
        const st = await _status();
        if (!st) {
            summary.innerHTML = `<span style="color:${C.bad};">Bridge unreachable — is the AI bridge running?</span>`;
            for (const s of STEPS) _setStepState(s.id, "pending");
            return;
        }
        // Render summary
        const fmt = (b, label) => `<span style="color:${b ? C.ok : C.dim};">${b ? "✓" : "◯"} ${label}</span>`;
        summary.innerHTML = `
            <div style="display:flex; flex-wrap:wrap; gap:14px;">
                ${fmt(st.configured, "credentials saved")}
                ${fmt(st.kaggleInstalled, "kaggle pkg installed")}
                ${fmt(st.authOk, "auth verified")}
                <span style="color:${C.dim};">·</span>
                <span style="color:${C.dim};">${(st.templates || []).length} templates ready</span>
                ${st.jobCount ? `<span style="color:${C.dim};">· ${st.jobCount} past jobs</span>` : ""}
            </div>
        `;

        // Steps 1 + 2 + 3 don't have a programmatic done-check — they're
        // user attestations. We default them to "done" if creds are saved,
        // since reaching that state implies user passed them. Otherwise
        // they walk in order.
        const credsDone = !!st.configured;
        const installDone = !!st.kaggleInstalled;
        const verifiedOk  = !!st.authOk;

        // Step 1 — account
        if (credsDone) {
            _setStepState("account", "done");
        } else {
            _setStepState("account", "active", `
                <div style="color:${C.dim};">
                    Need a free Kaggle account. Sign in or sign up — no credit card required.
                </div>
                <a href="https://www.kaggle.com/account/login" target="_blank" rel="noopener" style="display:inline-block; margin-top:6px; padding:6px 12px; background:${C.btn_bg}; color:${C.accent}; border:1px solid ${C.btn_brd}; border-radius:4px; text-decoration:none;">Open kaggle.com/account/login →</a>
                <button data-advance="account" style="margin-left:6px; padding:6px 12px; background:transparent; color:${C.text}; border:1px solid ${C.border}; border-radius:4px; cursor:pointer;">I have an account →</button>
            `);
            return;     // gate progress until they advance
        }

        // Step 2 — phone-verify
        // Kaggle requires phone verification for GPU access. We surface
        // this even when creds are saved, because a configured-but-not-
        // phone-verified user will get cryptic GPU errors. Set to "done"
        // optimistically if creds are saved (user can't really attest
        // programmatically); the verify step below will catch it.
        if (credsDone) {
            _setStepState("phone", "done");
        } else {
            _setStepState("phone", "active", `
                <div style="color:${C.dim};">
                    Kaggle requires phone verification before you can use GPU notebooks
                    (their policy, not ours).
                </div>
                <a href="https://www.kaggle.com/settings" target="_blank" rel="noopener" style="display:inline-block; margin-top:6px; padding:6px 12px; background:${C.btn_bg}; color:${C.accent}; border:1px solid ${C.btn_brd}; border-radius:4px; text-decoration:none;">Open kaggle.com/settings →</a>
                <button data-advance="phone" style="margin-left:6px; padding:6px 12px; background:transparent; color:${C.text}; border:1px solid ${C.border}; border-radius:4px; cursor:pointer;">Phone verified →</button>
            `);
            return;
        }

        // Step 3 — get API token
        if (credsDone) {
            _setStepState("token", "done");
        } else {
            _setStepState("token", "active", `
                <div style="color:${C.dim};">
                    On the Settings page, scroll to "API" and click <b>Create New API Token</b>.
                    Your browser downloads <code style="background:${C.input_bg}; padding:1px 4px; border-radius:3px;">kaggle.json</code>.
                </div>
                <a href="https://www.kaggle.com/settings" target="_blank" rel="noopener" style="display:inline-block; margin-top:6px; padding:6px 12px; background:${C.btn_bg}; color:${C.accent}; border:1px solid ${C.btn_brd}; border-radius:4px; text-decoration:none;">Open kaggle.com/settings →</a>
                <button data-advance="token" style="margin-left:6px; padding:6px 12px; background:transparent; color:${C.text}; border:1px solid ${C.border}; border-radius:4px; cursor:pointer;">I downloaded kaggle.json →</button>
            `);
            return;
        }

        // Step 4 — paste creds. The big one.
        if (credsDone) {
            const usernameDisplay = st.username || "(saved)";
            _setStepState("paste", "done", `
                <div style="color:${C.ok};">✓ Saved as user <b>${usernameDisplay}</b>. <a href="#" data-reset="1" style="color:${C.warn}; margin-left:6px;">re-paste / rotate</a></div>
            `);
        } else {
            _setStepState("paste", "active", `
                <div style="color:${C.dim}; margin-bottom:6px;">
                    Open <code style="background:${C.input_bg}; padding:1px 4px; border-radius:3px;">kaggle.json</code> in a text editor and paste its contents below.
                    Looks like: <code>{"username":"yourname","key":"abc...xyz"}</code>
                </div>
                <textarea id="ksw-paste" rows="3" placeholder='{"username":"...","key":"..."}' style="width:100%; box-sizing:border-box; padding:6px 8px; background:${C.input_bg}; color:${C.text}; border:1px solid ${C.border}; border-radius:4px; font:11px ui-monospace,Menlo,monospace; resize:vertical;"></textarea>
                <button id="ksw-save" style="margin-top:6px; padding:6px 14px; background:${C.btn_bg}; color:${C.accent}; border:1px solid ${C.btn_brd}; border-radius:4px; cursor:pointer;">Save credentials</button>
            `);
            // Hook the save button (re-querying each refresh)
            const pasteIn = root.querySelector("#ksw-paste");
            const saveBtn = root.querySelector("#ksw-save");
            saveBtn?.addEventListener("click", async () => {
                const msg = root.querySelector("#ksw-msg");
                const parsed = _parseKaggleJson(pasteIn?.value || "");
                if (parsed.error) { msg.style.color = C.bad; msg.textContent = parsed.error; return; }
                saveBtn.disabled = true; saveBtn.textContent = "Saving…";
                msg.style.color = C.dim; msg.textContent = "writing ~/.kaggle/kaggle.json…";
                const r = await _postConfig({ username: parsed.username, key: parsed.key });
                if (r.ok) {
                    msg.style.color = C.ok; msg.textContent = "✓ saved";
                    await _refresh();
                } else {
                    msg.style.color = C.bad; msg.textContent = "save failed: " + (r.error || "unknown");
                    saveBtn.disabled = false; saveBtn.textContent = "Save credentials";
                }
            });
            return;
        }

        // Step 5 — install kaggle pip pkg
        if (installDone) {
            _setStepState("install", "done", `
                <div style="color:${C.ok};">✓ ${st.kaggleVersion ? st.kaggleVersion : "kaggle CLI ready"}</div>
            `);
        } else {
            _setStepState("install", "active", `
                <div style="color:${C.dim};">
                    The bridge needs the <code>kaggle</code> Python package to submit notebooks.
                    Runs <code>pip install kaggle</code> in the bridge's Python (allowlisted).
                </div>
                <button id="ksw-install" style="margin-top:6px; padding:6px 14px; background:${C.btn_bg}; color:${C.accent}; border:1px solid ${C.btn_brd}; border-radius:4px; cursor:pointer;">Install kaggle (pip)</button>
            `);
            const installBtn = root.querySelector("#ksw-install");
            installBtn?.addEventListener("click", async () => {
                const msg = root.querySelector("#ksw-msg");
                installBtn.disabled = true; installBtn.textContent = "Installing…";
                msg.style.color = C.dim;
                msg.innerHTML = "pip install kaggle — running in the background (output streams to the PS Console minitab, bottom-left).";
                // /kaggle/install returns immediately {ok:true, note:"installing"};
                // the actual pip install runs async. Kick it off then poll
                // /kaggle/status every 2s until kaggleInstalled flips true,
                // or we hit the timeout.
                const kick = await _postInstall();
                if (!kick.ok) {
                    msg.style.color = C.bad; msg.textContent = "install kick-off failed: " + (kick.error || "unknown");
                    installBtn.disabled = false; installBtn.textContent = "Install kaggle (pip)";
                    return;
                }
                // Poll. 90s total = 45 × 2s.
                let installed = false;
                for (let i = 0; i < 45; i++) {
                    await new Promise(r => setTimeout(r, 2000));
                    const st = await _status();
                    msg.innerHTML = `pip install kaggle — still running (${(i + 1) * 2}s elapsed)…`;
                    if (st?.kaggleInstalled) { installed = true; break; }
                }
                if (installed) {
                    msg.style.color = C.ok; msg.textContent = "✓ kaggle installed";
                    await _refresh();
                } else {
                    msg.style.color = C.warn;
                    msg.innerHTML = "Install didn't complete in 90s. It may STILL be running — check the PS Console output. If pip failed, try again from a PowerShell window (<code>python -m pip install kaggle</code>) and reopen this wizard.";
                    installBtn.disabled = false; installBtn.textContent = "Install kaggle (pip)";
                }
            });
            return;
        }

        // Step 6 — verify auth
        if (verifiedOk) {
            _setStepState("verify", "done", `<div style="color:${C.ok};">✓ Connected as ${st.username}</div>`);
            // Setup is COMPLETE — show the all-done banner + close option
            const msg = root.querySelector("#ksw-msg");
            msg.style.color = C.ok;
            msg.innerHTML = `🎉 <b>Setup complete!</b> You can now submit jobs from the Kaggle Lab panel. <button id="ksw-done" style="margin-left:8px; padding:4px 10px; background:${C.btn_bg}; color:${C.accent}; border:1px solid ${C.btn_brd}; border-radius:4px; cursor:pointer;">Done</button>`;
            root.querySelector("#ksw-done")?.addEventListener("click", () => {
                if (typeof _onComplete === "function") { try { _onComplete(); } catch {} }
                close();
            });
        } else {
            _setStepState("verify", "bad", `
                <div style="color:${C.bad};">Authentication test failed.</div>
                ${st.authError ? `<div style="color:${C.dim}; margin-top:4px; font-size:10px;">${st.authError}</div>` : ""}
                <div style="color:${C.dim}; margin-top:6px;">
                    Common causes: token was revoked, username doesn't match, or you haven't phone-verified yet.
                    Click below to retry; if it still fails, re-paste credentials in step 4.
                </div>
                <button id="ksw-verify" style="margin-top:6px; padding:6px 14px; background:${C.btn_bg}; color:${C.accent}; border:1px solid ${C.btn_brd}; border-radius:4px; cursor:pointer;">Retry verification</button>
            `);
            root.querySelector("#ksw-verify")?.addEventListener("click", async () => {
                const msg = root.querySelector("#ksw-msg");
                msg.style.color = C.dim; msg.textContent = "verifying…";
                await _refresh();
            });
        }
    }

    // Top-level event hookup — uses event delegation so we don't need
    // to re-bind after every refresh
    function _bind() {
        root.addEventListener("click", async (ev) => {
            const t = ev.target;
            // ✕ close
            if (t.id === "ksw-close") { close(); return; }
            // step-advance attestations (1-3): nothing to save, just refresh
            if (t.dataset?.advance) {
                // For pre-creds steps the user just "attests" they did it.
                // We can't actually verify until they paste creds; so just
                // visually mark this step done and move on by re-refreshing
                // (the next step will already be "active" if creds aren't yet saved).
                const sid = t.dataset.advance;
                _setStepState(sid, "done");
                // Walk to next pending step visually
                const idx = STEPS.findIndex(s => s.id === sid);
                if (idx >= 0 && idx + 1 < STEPS.length) {
                    // Re-render the next step in its "active" state by querying status again
                    // (in case anything changed on the server between clicks).
                    await _refresh();
                }
                return;
            }
            // Re-paste / rotate link in step 4
            if (t.dataset?.reset) {
                ev.preventDefault();
                // Clear server-side creds by posting empty values
                await _postConfig({ username: "", key: "" });
                await _refresh();
                return;
            }
        });
    }

    function open() {
        if (root) return;
        root = _build();
        document.body.appendChild(root);
        _bind();
        _refresh();
    }

    function close() {
        if (!root) return;
        root.remove();
        root = null;
    }

    function onComplete(fn) { _onComplete = fn; }

    function isOpen() { return !!root; }

    // Auto-open helper for first-time users — checks /kaggle/status and
    // opens the wizard if not configured. Returns a promise that resolves
    // when the wizard either auto-opens or decides not to.
    async function autoOpenIfNeeded() {
        const st = await _status();
        if (st && !st.configured) {
            open();
            return true;
        }
        return false;
    }

    return { open, close, onComplete, isOpen, autoOpenIfNeeded };
}
