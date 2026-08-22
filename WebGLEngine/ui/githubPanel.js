// ui/githubPanel.js - v1128
// Floating "GITHUB MANAGER" panel + left-edge minitab. One place to manage all your
// GitHub functions remotely: account/token, repos (list/create/edit/delete), releases
// (list/publish/delete), issues (list/create/close), commits + branches, and files
// (get/commit). Talks to the /github/* bridge routes. Self-contained (no dock system).

export function mountGithubPanel() {
    if (document.getElementById("ghPanelRoot")) return;

    const api = (op, body, method) => fetch("/github/" + op, { method: method || (body ? "POST" : "GET"), headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
    const E = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
    const IN = (ph, type) => { const i = document.createElement("input"); i.type = type || "text"; i.autocomplete = "off"; i.placeholder = ph || ""; i.style.cssText = "padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;width:100%;box-sizing:border-box;"; return i; };
    const BTN = (t, bg, bd) => { const b = E("button", `padding:6px 11px;background:${bg || "#2a4d3a"};color:#cfe;border:1px solid ${bd || "#4a7d5a"};border-radius:6px;cursor:pointer;font:11px ui-monospace,monospace;`, t); return b; };
    const TA = (ph, rows) => { const t = document.createElement("textarea"); t.placeholder = ph || ""; t.rows = rows || 4; t.style.cssText = "padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;width:100%;box-sizing:border-box;resize:vertical;"; return t; };

    // ---- panel shell (the Dock provides the minitab + slide-in drawer) ----
    const root = E("div", "width:440px;max-width:92vw;display:flex;flex-direction:column;font:12px system-ui,sans-serif;color:#cde;");
    root.id = "ghPanelRoot";
    const head = E("div", "display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #1d2736;");
    head.append(E("span", "font-weight:700;color:#9fd;letter-spacing:.5px;", "GITHUB MANAGER"));
    const repoSel = IN("active repo"); repoSel.style.flex = "1"; repoSel.style.width = "auto"; repoSel.setAttribute("list", "ghRepoList");
    const repoList = document.createElement("datalist"); repoList.id = "ghRepoList";
    head.append(repoSel, repoList); root.appendChild(head);

    const tabsRow = E("div", "display:flex;gap:3px;padding:7px 10px 0;flex-wrap:wrap;");
    const body = E("div", "padding:10px 12px;overflow:auto;");
    root.append(tabsRow, body);

    const out = E("div", "margin-top:8px;font:11px ui-monospace,monospace;color:#bcd;white-space:pre-wrap;max-height:230px;overflow:auto;background:#0b0e13;border:1px solid #1a222e;border-radius:6px;padding:7px 9px;display:none;");
    // v3910 -- ONE DEFINITION OF WHERE A TOKEN COMES FROM. The Account tab already had this URL hardcoded in
    // its "Where do I get a token?" note (v1847); it is a constant now and BOTH readers use it, so the day it
    // changes it changes once.
    const TOKEN_URL = "https://github.com/settings/tokens";
    // Every token-gated call in githubBridge answers with some spelling of "token required" -- publish, upload,
    // createRepo, issues, delete, eight of them. Keith hit the publish one and asked, reasonably, why the
    // message that names the thing you are missing does not offer the place to get it.
    // *** THE LINK IS ATTACHED HERE, AT say(), AND NOT AT THE EIGHT CALL SITES. *** Wrapping the one chokepoint
    // means a token error raised by a route nobody has written yet still arrives with its remedy, and there is
    // no list of messages to keep in step with the bridge -- which is the kind of list that goes stale silently.
    const TOKEN_ERR = /token[^.]{0,40}\brequired\b|\brequired\b[^.]{0,40}token/i;
    const say = (m, ok) => {
        out.style.display = "block";
        out.style.color = ok === false ? "#f88" : (ok ? "#9fe88f" : "#bcd");
        if (typeof m !== "string") { out.innerHTML = ""; out.appendChild(m); return; }
        out.textContent = m;
        if (ok === false && TOKEN_ERR.test(m)) {
            // A NODE, NOT innerHTML: the message is server text and this panel renders repo names, issue titles
            // and error bodies from GitHub. Building the link as an element keeps the message itself text.
            const wrap = document.createElement("div");
            wrap.style.cssText = "margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
            const a = document.createElement("a");
            a.href = TOKEN_URL; a.target = "_blank"; a.rel = "noopener";
            a.textContent = "\u2192 Get a token on GitHub";
            a.style.cssText = "color:#7fd1ff;font-size:11px;font-weight:bold;text-decoration:none;border:1px solid #2a4a6a;padding:3px 8px;border-radius:4px;";
            const hint = document.createElement("span");
            hint.style.cssText = "color:#8fa3bb;font-size:10px;";
            hint.textContent = "then paste it in the Account tab \u2014 it explains the two kinds and the scopes";
            wrap.append(a, hint);
            out.appendChild(wrap);
        }
    };
    const repo = () => repoSel.value.trim();

    // ---- sections ----
    const SECTIONS = {
        // v2504 -- publish a folder as ONE commit. The Contents API that "Files" uses does one file per commit,
        // which is fine for a fix and absurd for a project. This uses the Git Data API (blobs -> tree -> commit ->
        // ref), which is what `git push` does underneath, minus git: no binary, no credential helper, no working
        // directory. The token is the only credential, and it is already here.
        Publish() {
            const w = E("div", "display:flex;flex-direction:column;gap:6px;");
            const dir = IN("folder on this machine, e.g. C:\\SweK\\wavefront-tomo");
            const name = IN("repo name");
            const desc = IN("description");
            const tops = IN("topics, comma separated");
            const msg = IN("commit message");
            w.append(E("div", "color:#9bb0c8;font-size:11px;", "Publish a folder as one commit"), dir,
                     E("div", "color:#5b7188;font-size:10px;", "Look first. Publishing is not the risky part \u2014 publishing the WRONG FOLDER is."));
            const look = BTN("Look at it", "#2a3d4d", "#4a6a80");
            const pub = BTN("Publish \u2192 GitHub", "#4d3a2a", "#7d5a4a");
            pub.disabled = true; pub.style.opacity = ".45";
            const row = E("div", "display:flex;gap:6px;");
            row.append(look, pub);
            w.append(name, desc, tops, msg, row);

            look.onclick = async () => {
                say("looking\u2026");
                const p = await api("folder/preview", { dir: dir.value.trim() });
                if (!p.ok) { pub.disabled = true; pub.style.opacity = ".45"; return say(p.error, false); }
                // THE NESTING TRAP, and the reason this button exists rather than a drag-and-drop. Dragging a
                // folder onto GitHub's uploader gives you repo/foldername/src/... and every relative import
                // breaks. Same failure the ship ritual's zip verifier catches. Refuse it rather than warn.
                if (p.nested) { pub.disabled = true; pub.style.opacity = ".45"; return say("REFUSING.\n\n" + p.warn + "\n\nPick the project folder itself, not its parent.", false); }
                if (!name.value.trim()) name.value = String(dir.value.trim()).split(/[\\/]/).filter(Boolean).pop() || "";
                if (!msg.value.trim()) msg.value = "Publish " + p.count + " files";
                pub.disabled = false; pub.style.opacity = "1";
                const miss = [p.hasReadme ? null : "no README.md", p.hasLicense ? null : "no LICENSE", p.hasWorkflow ? null : "no CI (.github/workflows/)"].filter(Boolean);
                say(p.count + " files, " + (p.bytes/1024).toFixed(1) + " KB\n" +
                    "top level: " + p.top.join("  ") + "\n" +
                    (miss.length ? "\nmissing: " + miss.join(", ") + "\n" : "\n") +
                    "\n" + p.files.slice(0, 40).join("\n") + (p.count > 40 ? "\n\u2026 and " + (p.count - 40) + " more" : ""), true);
            };
            pub.onclick = async () => {
                say("publishing \u2014 blobs, tree, commit, ref\u2026");
                const r = await api("folder/publish", {
                    dir: dir.value.trim(), repo: name.value.trim(), description: desc.value.trim(),
                    message: msg.value.trim(),
                    topics: tops.value.split(",").map(x => x.trim()).filter(Boolean),
                });
                if (!r.ok) return say(r.error, false);
                const box = E("div");
                box.innerHTML = "<b>" + (r.created ? "Created" : "Updated") + "</b> \u2014 " + r.files + " files in one commit <code>" + r.commit + "</code>" +
                    (r.topicsSet === false ? "<br><span style='color:#fc8'>topics failed (token needs repo scope)</span>" : "") +
                    ((r.warnings || []).length ? "<br><span style='color:#fc8'>" + r.warnings.join(", ") + "</span>" : "") +
                    "<br><a href='" + r.url + "' target='_blank' rel='noopener' style='color:#7fd1ff'>" + r.url + "</a>";
                say(box, true);
                // (no repo-list refresh here: the list lives in another section and reaching into it from this one
                // would couple them. The link above is the confirmation that matters.)
            };
            return w;
        },
        Account() {
            const w = E("div", "display:flex;flex-direction:column;gap:6px;");
            const owner = IN("GitHub username"); const token = IN("personal access token (repo scope)", "password"); const eng = IN("engine repo (for version alert)");
            w.append(E("div", "color:#9bb0c8;font-size:11px;", "Account / token"), owner, token, eng);
            // v1847 — where to get a token. GitHub has no permanent "API key"; you generate a Personal
            // Access Token (PAT) yourself. Link opens the token settings; the note explains the two kinds
            // + the scopes this engine needs (Contents r/w to push; Administration r/w for createRepo).
            const help = E("details", "font-size:10px;color:#8fb3c8;background:#0a0e14;border:1px solid #1c2733;border-radius:6px;padding:6px 8px;margin-top:2px;");
            const sum = E("summary", "cursor:pointer;color:#9ed5ff;font-size:10px;", "Where do I get a token?");
            help.appendChild(sum);
            const tokLink = E("a", "color:#7fd1ff;font-size:11px;font-weight:bold;word-break:break-all;", "\u2192 github.com/settings/tokens");
            tokLink.href = TOKEN_URL; tokLink.target = "_blank"; tokLink.rel = "noopener";   // v3910 -- the shared constant, not a second copy
            const body = E("div", "margin-top:5px;line-height:1.55;");
            body.innerHTML =
                "GitHub has no permanent \u201cAPI key\u201d \u2014 you generate a <b>Personal Access Token (PAT)</b> yourself. Either kind works to create + push to your own repo:"
                + "<div style='margin-top:5px;'><b style='color:#bfe9d6;'>Fine-grained (recommended):</b> Settings \u2192 Developer settings \u2192 Personal access tokens \u2192 <i>Fine-grained tokens</i> \u2192 Generate. Scope it to your account, pick the repos (or \u201cAll repositories\u201d), and grant <b>Repository permissions \u2192 Contents: Read and write</b>. Add <b>Administration: Read and write</b> if you want this engine\u2019s <code>createRepo</code> to make new repos.</div>"
                + "<div style='margin-top:5px;'><b style='color:#bfe9d6;'>Classic:</b> same path but <i>Tokens (classic)</i> \u2192 Generate new token (classic) \u2192 check the <code>repo</code> scope.</div>"
                + "<div style='margin-top:5px;color:#caa05a;'>You see the token string only once \u2014 copy it, paste it above, then \u201cStore token in vault\u201d so it\u2019s never left in a plaintext file.</div>";
            help.append(tokLink, body);
            w.append(help);
            const r = E("div", "display:flex;gap:6px;flex-wrap:wrap;");
            const save = BTN("Save"), who = BTN("Verify (whoami)", "#3a4a6a", "#5a6a8a"), rl = BTN("Rate limit", "#3a4a6a", "#5a6a8a");
            r.append(save, who, rl); w.append(r);
            (async () => { const s = await api("config"); if (s && s.ok) { owner.value = s.owner || ""; eng.value = s.engineRepo || ""; if (s.hasToken) token.placeholder = "saved (\u2026" + s.tokenTail + ") \u2014 type to replace"; } })();
            const cfg = () => ({ owner: owner.value.trim(), engineRepo: eng.value.trim(), ...(token.value.trim() ? { token: token.value.trim() } : {}) });
            save.onclick = async () => { const j = await api("config", cfg()); say(j.ok ? "\u2713 saved" + (j.hasToken ? " (token set)" : "") : "save failed", j.ok); token.value = ""; };
            who.onclick = async () => { await api("config", cfg()); const j = await api("whoami"); say(j.ok ? `\u2713 ${j.login}${j.name ? " (" + j.name + ")" : ""}\n   public ${j.publicRepos}, private ${j.privateRepos || 0}` : "\u2717 " + j.error, j.ok); };
            rl.onclick = async () => { const j = await api("ratelimit"); say(j.ok ? `core: ${j.remaining}/${j.limit} left` : "\u2717 " + j.error, j.ok); };
            // v1130 — Windows Credential Manager
            w.append(E("div", "color:#9bb0c8;font-size:11px;margin-top:4px;", "Windows Credential Manager"));
            const vr = E("div", "display:flex;gap:6px;flex-wrap:wrap;align-items:center;");
            const vStore = BTN("Store token in vault", "#3a2a5a", "#6a4a9a"), vLoad = BTN("Load from vault", "#3a4a6a", "#5a6a8a"), vForget = BTN("Forget", "#5a3a3a", "#8a5a5a");
            const vMsg = E("span", "font-size:11px;color:#8b97a8;flex-basis:100%;");
            vr.append(vStore, vLoad, vForget, vMsg); w.append(vr);
            const credApi = (op, body) => fetch("/cred/" + op, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
            (async () => { const s = await credApi("status"); if (s && s.ok && s.available && s.items && s.items.githubToken) vMsg.textContent = s.items.githubToken.stored ? ("vault: token stored (\u2026" + s.items.githubToken.tail + ")") : "vault: no token stored"; else if (s && !s.available) vMsg.textContent = "vault: " + (s.reason || "unavailable"); })();
            vStore.onclick = async () => { if (!token.value.trim()) return (vMsg.textContent = "type the token above first", vMsg.style.color = "#f88"); vMsg.textContent = "storing in Windows vault\u2026"; const j = await credApi("set", { target: "githubToken", secret: token.value.trim() }); if (j.ok) { await credApi("load"); vMsg.textContent = "\u2713 stored in vault (and loaded). You can clear it from github.json now."; vMsg.style.color = "#9fe88f"; token.value = ""; } else { vMsg.textContent = "\u2717 " + j.error; vMsg.style.color = "#f88"; } };
            vLoad.onclick = async () => { const j = await credApi("load"); vMsg.textContent = j.ok ? ("\u2713 loaded from vault: " + ((j.loaded || []).join(", ") || "nothing stored")) : "\u2717 " + j.error; vMsg.style.color = j.ok ? "#9fe88f" : "#f88"; };
            vForget.onclick = async () => { const j = await credApi("del", { target: "githubToken" }); vMsg.textContent = j.ok ? "\u2713 removed token from vault" : "\u2717 " + j.error; vMsg.style.color = "#ffcf6b"; };
            return w;
        },
        Repos() {
            const w = E("div", "display:flex;flex-direction:column;gap:6px;");
            const list = BTN("List my repos", "#3a4a6a", "#5a6a8a"); w.append(list);
            w.append(E("div", "color:#9bb0c8;font-size:11px;margin-top:4px;", "Create"));
            const nName = IN("new repo name"); const nDesc = IN("description (optional)");
            const privWrap = E("label", "display:flex;gap:6px;align-items:center;color:#cde;font-size:11px;"); const nPriv = document.createElement("input"); nPriv.type = "checkbox"; privWrap.append(nPriv, document.createTextNode("private"));
            const create = BTN("Create repo"); w.append(nName, nDesc, privWrap, create);
            w.append(E("div", "color:#9bb0c8;font-size:11px;margin-top:4px;", "Edit active repo"));
            const eDesc = IN("new description"); const eTopics = IN("topics, comma-separated"); const update = BTN("Update repo", "#3a4a6a", "#5a6a8a");
            w.append(eDesc, eTopics, update);
            w.append(E("div", "color:#c88;font-size:11px;margin-top:4px;", "Danger \u2014 delete active repo"));
            const dConf = IN("type the repo name to confirm"); const del = BTN("Delete repo", "#5a2a2a", "#8a4a4a");
            w.append(dConf, del);
            // v2528 -- every row now carries a link to the repo AND, when there is one, to its live Pages site.
            // Keith's ask: "show the page link too, so I can just click". The probe runs AFTER the list renders --
            // forty HEAD requests before showing anything is a list nobody waits for.
            list.onclick = async () => {
                const j = await api("repos");
                if (!j.ok) return say("\u2717 " + j.error, false);
                repoList.innerHTML = "";
                const box = E("div");
                const slots = {};
                j.repos.forEach(rp => {
                    const o = document.createElement("option"); o.value = rp.name; repoList.appendChild(o);
                    const row = E("div", "padding:3px 0;display:flex;gap:7px;align-items:baseline;flex-wrap:wrap;");
                    const pick = E("span", "cursor:pointer;color:#9fd;", (rp.private ? "\uD83D\uDD12 " : "\u2606 ") + rp.name);
                    pick.onclick = () => { repoSel.value = rp.name; };
                    row.appendChild(pick);
                    const gh = E("a", "color:#7fd1ff;font-size:11px;text-decoration:none;", "repo >");
                    gh.href = "https://github.com/" + rp.full; gh.target = "_blank"; gh.rel = "noopener";
                    row.appendChild(gh);
                    // the slot the Pages link drops into once the probe answers. A private repo has no public
                    // Pages site worth linking, so it is not probed at all.
                    slots[rp.full] = E("span", "font-size:11px;color:#4a5f7a;", rp.private ? "" : "\u2026");
                    row.appendChild(slots[rp.full]);
                    if (rp.desc) row.appendChild(E("span", "color:#5b7699;font-size:11px;", "\u2014 " + rp.desc.slice(0, 34)));
                    box.appendChild(row);
                });
                say(box, true);
                const probe = j.repos.filter(r => !r.private).map(r => r.full);
                if (!probe.length) return;
                try {
                    const p = await fetch("/github/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repos: probe }) }).then(x => x.json());
                    for (const full of probe) {
                        const slot = slots[full]; if (!slot) continue;
                        const hit = p.pages && p.pages[full];
                        slot.textContent = "";
                        // No page is the NORMAL case and gets no clutter -- only a live one earns a link. Saying
                        // "no page" next to thirty repos is noise, and noise is what makes a panel unreadable.
                        if (hit && hit.live) {
                            const a = E("a", "color:#7fe3c4;font-size:11px;text-decoration:none;", "page >");
                            a.href = hit.url; a.target = "_blank"; a.rel = "noopener";
                            a.title = hit.url;
                            slot.appendChild(a);
                        }
                    }
                } catch { for (const full of probe) if (slots[full]) slots[full].textContent = ""; }
            };
            create.onclick = async () => { const j = await api("repo/create", { name: nName.value.trim(), description: nDesc.value.trim(), priv: nPriv.checked }); say(j.ok ? "\u2713 created " + j.name + "\n" + j.url : "\u2717 " + j.error, j.ok); if (j.ok) repoSel.value = j.name; };
            update.onclick = async () => { if (!repo()) return say("pick an active repo first", false); const j = await api("repo/update", { repo: repo(), description: eDesc.value, topics: eTopics.value.trim() ? eTopics.value.split(",").map(s => s.trim()).filter(Boolean) : undefined }); say(j.ok ? "\u2713 updated " + repo() : "\u2717 " + j.error, j.ok); };
            del.onclick = async () => { if (!repo()) return say("pick an active repo first", false); const j = await api("repo/delete", { repo: repo(), confirm: dConf.value.trim() }); say(j.ok ? "\u2713 deleted " + j.deleted : "\u2717 " + j.error, j.ok); if (j.ok) repoSel.value = ""; };
            return w;
        },
        Releases() {
            const w = E("div", "display:flex;flex-direction:column;gap:6px;");
            const listB = BTN("List releases", "#3a4a6a", "#5a6a8a"); const vc = BTN("Version check", "#3a4a6a", "#5a6a8a");
            const r1 = E("div", "display:flex;gap:6px;"); r1.append(listB, vc); w.append(r1);
            w.append(E("div", "color:#9bb0c8;font-size:11px;margin-top:4px;", "Publish a version"));
            const tag = IN("version tag (e.g. v1128)"); const name = IN("release title (optional)"); const notes = TA("release notes (optional)", 2); const asset = IN("asset path (optional, e.g. Gmail-safe zip)");
            const optR = E("div", "display:flex;gap:14px;color:#cde;font-size:11px;"); const dr = document.createElement("input"); dr.type = "checkbox"; const pr = document.createElement("input"); pr.type = "checkbox";
            const dl = E("label", "display:flex;gap:5px;align-items:center;"); dl.append(dr, document.createTextNode("draft")); const pl = E("label", "display:flex;gap:5px;align-items:center;"); pl.append(pr, document.createTextNode("pre-release")); optR.append(dl, pl);
            const pub = BTN("Publish version"); w.append(tag, name, notes, asset, optR, pub);
            const eng = BTN("\u26A1 Release current engine (auto-tag + build zip)", "#3a2a5a", "#6a4a9a"); eng.style.marginTop = "4px"; w.append(eng);
            (async () => { const s = await api("config"); if (s && s.ok && s.engineVersion && !tag.value) tag.value = s.engineVersion; })();
            listB.onclick = async () => { if (!repo()) return say("pick a repo", false); const j = await api("releases?repo=" + encodeURIComponent(repo())); if (!j.ok) return say("\u2717 " + j.error, false); if (!j.releases.length) return say("(no releases)", true); const box = E("div"); j.releases.forEach(rl => { const row = E("div", "display:flex;gap:6px;align-items:center;padding:2px 0;"); row.append(E("span", "color:#9fd;flex:1;", `${rl.tag}${rl.draft ? " (draft)" : ""}${rl.prerelease ? " (pre)" : ""} \u00B7 ${rl.assets} asset(s)`)); const d = E("span", "cursor:pointer;color:#f88;", "\u2715"); d.title = "delete release"; d.onclick = async () => { const x = await api("release/delete", { repo: repo(), id: rl.id }); if (x.ok) row.remove(); }; row.append(d); box.append(row); }); say(box, true); };
            vc.onclick = async () => { if (!repo()) return say("pick a repo", false); const j = await api("versioncheck?repo=" + encodeURIComponent(repo())); say(j.ok ? (j.none ? "no releases yet" : (j.behind ? "\u26A0 newer: " + j.latest + " (engine " + j.current + ")" : "\u2713 up to date (" + j.current + ")")) : "\u2717 " + j.error, j.ok && !j.behind); };
            pub.onclick = async () => { if (!repo() || !tag.value.trim()) return say("need repo + tag", false); pub.disabled = true; say("publishing\u2026"); const j = await api("publish", { repo: repo(), tag: tag.value.trim(), name: name.value.trim(), body: notes.value, assetPath: asset.value.trim(), draft: dr.checked, prerelease: pr.checked }); pub.disabled = false; const rel = j.release || {}; say(j.ok ? "\u2713 released " + rel.tag + (j.asset ? (j.asset.ok ? " + asset" : " (asset: " + j.asset.error + ")") : "") + "\n" + (rel.url || "") : "\u2717 " + (j.error || ""), j.ok); };
            // v3908 -- THE GUARD REFUSED THE VERY PATH ITS OWN MESSAGE RECOMMENDED. It said "pick a repo (or set
            // engineRepo in Account)" and then returned before anything could ever consult engineRepo, so setting
            // it did nothing and the button read as broken. publishEngineBuild() ALREADY falls back to
            // engineRepo || defaultRepo on the server -- the UI was stricter than the backend it calls, and the
            // error text described a remedy the code did not allow. AN ERROR MESSAGE IS A CLAIM TOO.
            eng.onclick = async () => { let er = repo();
                if (!er) { try { const s0 = await api("config"); er = ((s0 && s0.engineRepo) || "").trim(); } catch {} }
                if (!er) return say("pick a repo, or set engineRepo in Account", false); eng.disabled = true; say("building the engine zip + publishing\u2026 (takes a few seconds)"); const j = await api("publish-engine", { repo: er, body: notes.value, draft: dr.checked, prerelease: pr.checked }); eng.disabled = false; const rel = j.release || {}; say(j.ok ? "\u2713 released " + (j.tag || rel.tag) + (j.asset ? (j.asset.ok ? " + engine zip uploaded" : " (asset: " + j.asset.error + ")") : "") + "\n" + (rel.url || "") : "\u2717 " + (j.error || ""), j.ok); };
            return w;
        },
        Issues() {
            const w = E("div", "display:flex;flex-direction:column;gap:6px;");
            const r1 = E("div", "display:flex;gap:6px;align-items:center;"); const listB = BTN("List", "#3a4a6a", "#5a6a8a"); const stateSel = document.createElement("select"); stateSel.style.cssText = "padding:5px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;"; ["open", "closed", "all"].forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; stateSel.appendChild(o); });
            r1.append(listB, stateSel); w.append(r1);
            w.append(E("div", "color:#9bb0c8;font-size:11px;margin-top:4px;", "New issue"));
            const t = IN("issue title"); const b = TA("body (optional)", 3); const create = BTN("Create issue"); w.append(t, b, create);
            listB.onclick = async () => { if (!repo()) return say("pick a repo", false); const j = await api("issues?repo=" + encodeURIComponent(repo()) + "&state=" + stateSel.value); if (!j.ok) return say("\u2717 " + j.error, false); if (!j.issues.length) return say("(no issues)", true); const box = E("div"); j.issues.forEach(is => { const row = E("div", "display:flex;gap:6px;align-items:center;padding:2px 0;"); row.append(E("span", "color:#9fd;flex:1;", `#${is.number} ${is.title.slice(0, 40)}`)); if (is.state === "open") { const c = E("span", "cursor:pointer;color:#fb8;", "close"); c.onclick = async () => { const x = await api("issue/close", { repo: repo(), number: is.number }); if (x.ok) row.remove(); }; row.append(c); } box.append(row); }); say(box, true); };
            create.onclick = async () => { if (!repo() || !t.value.trim()) return say("need repo + title", false); const j = await api("issue/create", { repo: repo(), title: t.value.trim(), body: b.value }); say(j.ok ? "\u2713 #" + j.number + "\n" + j.url : "\u2717 " + j.error, j.ok); };
            return w;
        },
        Code() {
            const w = E("div", "display:flex;flex-direction:column;gap:6px;");
            const r1 = E("div", "display:flex;gap:6px;"); const commitsB = BTN("Recent commits", "#3a4a6a", "#5a6a8a"); const branchesB = BTN("Branches", "#3a4a6a", "#5a6a8a"); r1.append(commitsB, branchesB); w.append(r1);
            w.append(E("div", "color:#9bb0c8;font-size:11px;margin-top:4px;", "File \u2014 get / commit"));
            const fp = IN("path in repo, e.g. README.md"); const get = BTN("Get", "#3a4a6a", "#5a6a8a");
            const fr = E("div", "display:flex;gap:6px;"); fr.append(fp, get); w.append(fr);
            const content = TA("file content (load with Get, or type to create)", 5); const msg = IN("commit message"); const put = BTN("Commit file"); w.append(content, msg, put);
            let curSha = "";
            commitsB.onclick = async () => { if (!repo()) return say("pick a repo", false); const j = await api("commits?repo=" + encodeURIComponent(repo())); if (!j.ok) return say("\u2717 " + j.error, false); say(j.commits.map(c => `${c.sha} ${c.msg}  \u2014 ${(c.author || "").slice(0, 14)}`).join("\n") || "(none)", true); };
            branchesB.onclick = async () => { if (!repo()) return say("pick a repo", false); const j = await api("branches?repo=" + encodeURIComponent(repo())); if (!j.ok) return say("\u2717 " + j.error, false); say(j.branches.map(b => (b.protected ? "\uD83D\uDD12 " : "") + b.name).join("\n") || "(none)", true); };
            get.onclick = async () => { if (!repo() || !fp.value.trim()) return say("need repo + path", false); const j = await api("file/get", { repo: repo(), path: fp.value.trim() }); if (!j.ok) { curSha = ""; return say("\u2717 " + j.error, false); } curSha = j.sha; content.value = j.content; say("\u2713 loaded " + j.path + " (" + j.size + " bytes)", true); };
            put.onclick = async () => { if (!repo() || !fp.value.trim()) return say("need repo + path", false); const j = await api("file/put", { repo: repo(), path: fp.value.trim(), content: content.value, message: msg.value.trim(), sha: curSha || undefined }); if (j.ok) curSha = j.commit || curSha; say(j.ok ? "\u2713 committed " + j.path + "\n" + (j.url || "") : "\u2717 " + j.error, j.ok); };
            return w;
        },
    };

    let active = "Account";
    function renderTabs() { tabsRow.innerHTML = ""; Object.keys(SECTIONS).forEach(k => { const b = BTN(k, active === k ? "#2a4d3a" : "#1a2330", active === k ? "#4a7d5a" : "#2a3340"); b.style.padding = "4px 9px"; b.onclick = () => { active = k; render(); }; tabsRow.appendChild(b); }); }
    function render() { renderTabs(); body.innerHTML = ""; body.appendChild(SECTIONS[active]()); out.style.display = "none"; body.appendChild(out); }

    render();
    return { root };
}
