// TaskerBridge panel — fetches the task list, renders the deck, fires triggers.
(() => {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), filtersEl = $("#filters"), logEl = $("#log");
  const connEl = $("#conn"), nameEl = $("#deckName");
  let tasks = [], activeFilter = "all";

  const BE_LABELS = { autoremote: "AUTOREMOTE", tasker_http: "HTTP", mqtt: "MQTT", ha: "HA" };

  async function loadTasks() {
    try {
      const r = await fetch("./api/tasks");
      const d = await r.json();
      tasks = d.tasks || [];
      if (d.name) { nameEl.textContent = d.name.toUpperCase(); document.title = d.name; }
      setConn(true);
      renderFilters();
      render();
    } catch (e) {
      setConn(false);
      $("#empty") && ($("#empty").textContent = "cannot reach the bridge server");
    }
  }

  function setConn(up) {
    connEl.textContent = up ? "link up" : "link down";
    connEl.className = "conn " + (up ? "up" : "down");
  }

  function backends() {
    return ["all", ...Array.from(new Set(tasks.map(t => t.backend)))];
  }

  function renderFilters() {
    filtersEl.innerHTML = "";
    for (const b of backends()) {
      const c = document.createElement("button");
      c.className = "chip"; c.type = "button";
      c.textContent = b === "all" ? "ALL" : (BE_LABELS[b] || b.toUpperCase());
      c.setAttribute("aria-pressed", String(b === activeFilter));
      c.addEventListener("click", () => { activeFilter = b; renderFilters(); render(); });
      filtersEl.appendChild(c);
    }
  }

  function render() {
    grid.innerHTML = "";
    const list = tasks.filter(t => activeFilter === "all" || t.backend === activeFilter);
    if (!list.length) { grid.innerHTML = '<div class="empty">no tasks for this filter</div>'; return; }
    for (const t of list) {
      const b = document.createElement("button");
      b.className = "tile"; b.type = "button"; b.dataset.id = t.id;
      b.innerHTML =
        `<span class="be ${t.backend}">${BE_LABELS[t.backend] || t.backend}</span>` +
        `<span class="ico">${t.icon || "▶"}</span>` +
        `<span class="lab">${escapeHtml(t.label || t.id)}</span>`;
      b.addEventListener("click", () => fire(t, b));
      grid.appendChild(b);
    }
  }

  async function fire(task, tile) {
    if (tile.classList.contains("firing")) return;
    tile.classList.remove("ok", "err");
    tile.classList.add("firing");
    pulse();
    try {
      const r = await fetch("./api/trigger", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id }),
      });
      const d = await r.json();
      tile.classList.remove("firing");
      tile.classList.add(d.ok ? "ok" : "err");
      setTimeout(() => tile.classList.remove("ok", "err"), 1400);
      addLog(task.label || task.id, d.ok, d.ok ? (d.result?.via || "sent") : d.error);
    } catch (e) {
      tile.classList.remove("firing"); tile.classList.add("err");
      setTimeout(() => tile.classList.remove("err"), 1400);
      addLog(task.label || task.id, false, "network");
    }
  }

  function addLog(label, ok, detail) {
    const li = document.createElement("li");
    const t = new Date().toLocaleTimeString([], { hour12: false });
    li.innerHTML = `<span class="t">${t}</span><span class="${ok ? "ok" : "err"}">${ok ? "▸" : "✕"}</span>` +
      `<span>${escapeHtml(label)} <span style="color:var(--dim)">— ${escapeHtml(String(detail))}</span></span>`;
    logEl.prepend(li);
    while (logEl.children.length > 60) logEl.lastChild.remove();
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  $("#clearLog").addEventListener("click", () => { logEl.innerHTML = ""; });

  // --- little signal-scope canvas in the header (engine flavour) ---
  const cv = $("#signal"), cx = cv.getContext("2d");
  let phase = 0, jolt = 0;
  function pulse() { jolt = 1; }
  function tick() {
    const w = cv.width, h = cv.height;
    cx.clearRect(0, 0, w, h);
    cx.strokeStyle = "#5dff9b"; cx.lineWidth = 1.5; cx.globalAlpha = 0.9;
    cx.beginPath();
    for (let x = 0; x < w; x++) {
      const base = Math.sin((x * 0.18) + phase) * (2.5 + jolt * 9);
      const spike = jolt > 0 && Math.abs(x - (w * 0.5)) < 6 ? (6 - Math.abs(x - w * 0.5)) * jolt * 2.2 : 0;
      const y = h / 2 - base - spike;
      x ? cx.lineTo(x, y) : cx.moveTo(x, y);
    }
    cx.stroke();
    phase += 0.12; jolt *= 0.92; if (jolt < 0.01) jolt = 0;
    requestAnimationFrame(tick);
  }
  tick();

  loadTasks();
  setInterval(() => fetch("./api/health").then(r => setConn(r.ok)).catch(() => setConn(false)), 5000);
})();
