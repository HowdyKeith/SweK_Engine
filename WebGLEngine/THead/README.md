# THead — head / torso avatar models

Drop `.glb` / `.gltf` / `.vrm` head-or-torso models here to use them as the HEAD-mode avatar.

If this folder has no usable model, HEAD mode falls back to the built-in **default wireframe head**
(`/thead.html`) — a procedural three.js head/torso with talking (jaw), eye movement + blink, brows,
mood expressions, and nod/shake — exactly like Pip-Boy mode ships a default. No model required.

Drive the wireframe head from JS (it exposes `window.sweKHead`):
  sweKHead.talk(2)        // talk for 2s (jaw moves)
  sweKHead.blink()
  sweKHead.look(x, y)     // aim eyes, x/y in -1..1  (sweKHead.autoLook(true) to resume wandering)
  sweKHead.mood('happy')  // neutral | happy | sad | surprised | angry
  sweKHead.nod()  /  sweKHead.shake()
It also honors cross-window postMessage: { type:'tts', state:'start'|'end' }, { type:'mood', mood },
and { type:'audio_amp', amp } so the engine's TTS bus makes it talk in sync.
