// engine/visitor-chat.js — v1915
// A tiny floating chat widget that appears ONLY for remote (through-tunnel) viewers, letting them message
// the host. Self-contained (no deps), self-injecting: include with <script src="/engine/visitor-chat.js">.
// It checks /visitor/chat/config first and does nothing unless (a) visitor chat is enabled AND (b) this
// request is remote. Host replies arrive via /visitor/chat/poll.
(function () {
  if (window.__swekVisitorChat) return; window.__swekVisitorChat = true;
  var since = 0, name = localStorage.getItem("swekVisitorName") || "", open = false, pollTimer = null, box, log, input, bubble;

  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }

  function build() {
    bubble = document.createElement("button");
    bubble.textContent = "\uD83D\uDCAC Chat";
    bubble.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;background:#231a36;color:#cbb0ff;border:1px solid #4a3a6a;border-radius:20px;padding:9px 15px;font:13px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.4)";
    bubble.onclick = function(){ open = !open; box.style.display = open ? "flex" : "none"; bubble.style.display = open ? "none" : "block"; if (open && input) input.focus(); };
    document.body.appendChild(bubble);

    box = document.createElement("div");
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:100000;width:290px;max-width:92vw;height:380px;max-height:70vh;display:none;flex-direction:column;background:#100b1a;border:1px solid #3a2a5a;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.5);font:13px system-ui,sans-serif;color:#e8ddff;overflow:hidden";
    box.innerHTML =
      "<div style='display:flex;align-items:center;gap:8px;padding:9px 11px;background:#1a1030;border-bottom:1px solid #3a2a5a'>"+
        "<span style='flex:1;font-weight:600;color:#cbb0ff'>\uD83D\uDCAC Chat with the host</span>"+
        "<span id='svcClose' style='cursor:pointer;color:#8a7aa8;font-size:16px'>\u00d7</span>"+
      "</div>"+
      "<div id='svcLog' style='flex:1;overflow-y:auto;padding:9px;display:flex;flex-direction:column;gap:6px'></div>"+
      "<div style='padding:8px;border-top:1px solid #3a2a5a;display:flex;flex-direction:column;gap:6px'>"+
        "<input id='svcName' placeholder='your name (optional)' style='background:#0c0816;color:#e8ddff;border:1px solid #3a2a5a;border-radius:6px;padding:6px 8px;font:12px system-ui'>"+
        "<div style='display:flex;gap:6px'>"+
          "<input id='svcInput' placeholder='type a message\u2026' style='flex:1;background:#0c0816;color:#e8ddff;border:1px solid #3a2a5a;border-radius:6px;padding:7px 9px;font:13px system-ui'>"+
          "<button id='svcSend' style='background:#2a1a4a;color:#cbb0ff;border:1px solid #4a3a6a;border-radius:6px;padding:0 13px;cursor:pointer;font:13px system-ui'>Send</button>"+
        "</div>"+
      "</div>";
    document.body.appendChild(box);
    log = box.querySelector("#svcLog"); input = box.querySelector("#svcInput");
    var nameEl = box.querySelector("#svcName"); if (name) nameEl.value = name;
    box.querySelector("#svcClose").onclick = function(){ open=false; box.style.display="none"; bubble.style.display="block"; };
    nameEl.onchange = function(){ name = nameEl.value.trim().slice(0,40); localStorage.setItem("swekVisitorName", name); };
    box.querySelector("#svcSend").onclick = send;
    input.onkeydown = function(e){ if (e.key==="Enter"){ send(); } };
  }

  function add(from, text) {
    var mine = from === "visitor";
    var d = document.createElement("div");
    d.style.cssText = "max-width:82%;padding:6px 9px;border-radius:9px;font-size:13px;line-height:1.4;word-break:break-word;"+(mine
      ? "align-self:flex-end;background:#2a1a4a;color:#e8ddff;border:1px solid #4a3a6a"
      : "align-self:flex-start;background:#161020;color:#cfe;border:1px solid #2a3a4a");
    d.innerHTML = esc(text);
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }

  function send() {
    var text = (input.value||"").trim(); if (!text) return;
    name = (box.querySelector("#svcName").value||"").trim().slice(0,40); if (name) localStorage.setItem("swekVisitorName", name);
    input.value = "";
    add("visitor", text);   // optimistic
    fetch("/visitor/chat/send", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ text: text, name: name }) })
      .then(function(r){ return r.json(); }).then(function(j){ if (j && !j.ok && j.error) add("host", "\u26a0 " + j.error); }).catch(function(){});
  }

  function poll() {
    fetch("/visitor/chat/poll?since=" + since, { cache:"no-store" }).then(function(r){ return r.json(); }).then(function(j){
      if (!j || !j.ok) return;
      if (j.enabled === false) { teardown(); return; }
      (j.msgs||[]).forEach(function(m){ since = Math.max(since, m.id); if (m.from === "host") { add("host", m.text); if (!open) flash(); } });
    }).catch(function(){});
  }
  function flash(){ if (bubble) { bubble.style.background = "#3a2a5a"; bubble.textContent = "\uD83D\uDCAC New reply"; } }
  function teardown(){ if (pollTimer) clearInterval(pollTimer); if (box) box.remove(); if (bubble) bubble.remove(); window.__swekVisitorChat = false; }

  // only show for remote + enabled
  fetch("/visitor/chat/config", { cache:"no-store" }).then(function(r){ return r.json(); }).then(function(j){
    if (!j || !j.ok || !j.enabled || !j.remote) return;   // LAN/local viewers don't get the widget
    if (!document.body) { window.addEventListener("DOMContentLoaded", init); } else init();
  }).catch(function(){});
  function init(){ build(); poll(); pollTimer = setInterval(poll, 3000); maybeWelcome(); }

  // v1922 — first-visit WELCOME: greet the visitor with a map of where they appear to be (coarse IP geo)
  // and ask their name. Shown once (until they answer or dismiss). Uses /visitor/geo + /maps/tiles + the
  // self-name route. Purely a friendly hello — the location is the same coarse city-level geo already shown
  // to the host, rendered here so the visitor sees "we see you're near X, who are we speaking with?".
  function maybeWelcome(){
    if (localStorage.getItem("swekWelcomed") === "1" || name) {
      // v1971 — even if we already have a name locally, if the SERVER recognizes this IP as returning,
      // give a brief "welcome back, <name>" toast (once per load). Purely friendly.
      if (name) { fetch("/visitor/geo", { cache:"no-store" }).then(function(r){ return r.json(); }).then(function(g){ if (g && g.remote && (g.returning || g.name)) welcomeBack(g.name || name); }).catch(function(){}); }
      return;
    }
    fetch("/visitor/geo", { cache:"no-store" }).then(function(r){ return r.json(); }).then(function(g){
      if (!g || !g.remote) return;
      if (g.name) { name = g.name; localStorage.setItem("swekVisitorName", name); welcomeBack(g.name); return; }   // known visitor -> welcome back by name
      showWelcome(g);
    }).catch(function(){});
  }
  // v1971 — a small, self-dismissing "welcome back" toast for a recognized returning visitor.
  function welcomeBack(nm){
    try {
      if (document.getElementById("svcWelcomeBack")) return;
      var t = document.createElement("div"); t.id = "svcWelcomeBack";
      t.textContent = "\uD83D\uDC4B Welcome back" + (nm ? (", " + nm) : "") + "!";
      t.style.cssText = "position:fixed;bottom:80px;right:18px;z-index:100002;background:#0d1a12;color:#bfffd9;border:1px solid #2a6;border-radius:10px;padding:10px 15px;font:14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);opacity:0;transition:opacity .3s";
      document.body.appendChild(t);
      requestAnimationFrame(function(){ t.style.opacity = "1"; });
      setTimeout(function(){ t.style.opacity = "0"; setTimeout(function(){ try { t.remove(); } catch(e){} }, 400); }, 4200);
    } catch(e){}
  }
  function showWelcome(g){
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:100001;background:rgba(4,10,8,.82);display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif";
    var loc = (g && g.label) ? g.label : "";
    ov.innerHTML =
      "<div style='width:340px;max-width:92vw;background:#0d1512;border:1px solid #1c5;border-radius:14px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.6)'>"+
        "<div style='padding:13px 15px;background:#0a1a12;border-bottom:1px solid #1c5;color:#bfffd9;font-weight:600'>\uD83D\uDC4B Welcome to SweK</div>"+
        "<canvas id='wlMap' width='320' height='150' style='width:100%;height:150px;display:block;background:#04140b'></canvas>"+
        "<div style='padding:13px 15px;display:flex;flex-direction:column;gap:9px'>"+
          "<div style='color:#8fd0a0;font-size:12px'>"+(loc ? ("Looks like you're joining from <b style='color:#bfffd9'>"+esc(loc)+"</b>.") : "Glad you stopped by.")+"</div>"+
          "<div style='color:#cfe;font-size:13px'>Who are we speaking with?</div>"+
          "<input id='wlName' placeholder='your name' style='background:#06140b;color:#eaffea;border:1px solid #1a5;border-radius:7px;padding:9px 11px;font:14px system-ui'>"+
          "<div style='display:flex;gap:7px;justify-content:flex-end'>"+
            "<button id='wlSkip' style='background:transparent;color:#7a9a88;border:none;cursor:pointer;font:13px system-ui'>skip</button>"+
            "<button id='wlGo' style='background:#12331f;color:#bfffd9;border:1px solid #2a6;border-radius:7px;padding:8px 16px;cursor:pointer;font:13px system-ui'>Say hello</button>"+
          "</div>"+
        "</div>"+
      "</div>";
    document.body.appendChild(ov);
    var done = function(){ localStorage.setItem("swekWelcomed","1"); ov.remove(); };
    ov.querySelector("#wlSkip").onclick = done;
    var nmeEl = ov.querySelector("#wlName");
    var go = function(){
      var nm = (nmeEl.value||"").trim().slice(0,40);
      if (nm) { name = nm; localStorage.setItem("swekVisitorName", nm);
        fetch("/remotes/self-name", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name: nm }) }).catch(function(){});
        if (box && box.querySelector) { var f=box.querySelector("#svcName"); if (f) f.value = nm; }
      }
      done();
      if (bubble) { open = true; box.style.display="flex"; bubble.style.display="none"; }   // slide into chat
    };
    ov.querySelector("#wlGo").onclick = go;
    nmeEl.onkeydown = function(e){ if (e.key==="Enter") go(); };
    nmeEl.focus();
    // draw the geo map (OSM tiles via the bridge), recolored Pip-Boy green to match SweK
    if (g && g.geo && g.geo.lat != null && g.geo.lon != null) drawWelcomeMap(g.geo.lat, g.geo.lon);
    else { var c=ov.querySelector("#wlMap"), x=c.getContext("2d"); x.fillStyle="#04140b"; x.fillRect(0,0,c.width,c.height); x.fillStyle="#2bff88"; x.font="12px monospace"; x.textAlign="center"; x.fillText("location unavailable", c.width/2, c.height/2); }
  }
  function drawWelcomeMap(lat, lon){
    var c = document.getElementById("wlMap"); if (!c) return; var x = c.getContext("2d");
    x.fillStyle = "#04140b"; x.fillRect(0,0,c.width,c.height);
    x.fillStyle = "#2bff88"; x.font = "12px monospace"; x.textAlign = "center"; x.fillText("locating\u2026", c.width/2, c.height/2);
    fetch("/maps/tiles?lat="+lat+"&lon="+lon+"&zoom=10&cols=3&rows=3&provider=osm", { cache:"no-store" }).then(function(r){ return r.json(); }).then(function(T){
      if (!T || !T.ok || !T.tiles) return;
      var ts = T.tileSize||256, gw = T.cols*ts, gh = T.rows*ts, sc = Math.max(c.width/gw, c.height/gh);
      var ox = (c.width-gw*sc)/2, oy = (c.height-gh*sc)/2, remaining = 0;
      T.tiles.forEach(function(t){ if(!t.dataUrl) return; remaining++; var im=new Image(); im.onload=function(){ try{ x.drawImage(im, ox+t.rx*ts*sc, oy+t.ry*ts*sc, ts*sc, ts*sc); }catch(e){} if(--remaining===0) finish(); }; im.src=t.dataUrl; });
      if (remaining===0) finish();
      function finish(){
        try { var id=x.getImageData(0,0,c.width,c.height), d=id.data; for(var i=0;i<d.length;i+=4){ var l=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255; d[i]=Math.round(8+l*40); d[i+1]=Math.round(20+l*210); d[i+2]=Math.round(12+l*90);} x.putImageData(id,0,0); }catch(e){}
        x.fillStyle="#eaffea"; x.shadowColor="#2bff88"; x.shadowBlur=10; x.beginPath(); x.arc(c.width/2,c.height/2,5,0,7); x.fill(); x.shadowBlur=0;
        x.fillStyle="#8fd0a0"; x.font="8px monospace"; x.textAlign="right"; x.fillText("\u00a9 OpenStreetMap", c.width-4, c.height-4);
      }
    }).catch(function(){});
  }
})();
