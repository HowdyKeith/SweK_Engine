// FILE: ui/haIntegrations.js
// v1350 — single source of truth for the HA-integration catalog the avatar/engine
// looks for. Loaded as a plain script (sets window.HA_INTEGRATIONS) so both
// ha-capabilities.html (the install checklist) and ha-diagram.html (the map view)
// read the same list. detect = HA component/domain names; kind core|HACS; url =
// docs (core) or github repo (HACS, turned into a 1-click HACS link by the panels);
// enables = what it unlocks here; icon = a glyph for the diagram cards.
window.HA_INTEGRATIONS = [
  { id:"cast",            label:"Google Cast",            detect:["cast"],                    kind:"core", icon:"\uD83D\uDCFA", url:"https://www.home-assistant.io/integrations/cast/",  enables:"Cast video, images and slideshows from the engine to Chromecast / Nest Hub / Android TV." },
  { id:"media_player",    label:"Media players (any)",    detect:["media_player"],            kind:"core", icon:"\uD83D\uDD08", url:"https://www.home-assistant.io/integrations/media_player/", enables:"The base layer for casting, speaking, and play/pause/volume control on any player." },
  { id:"androidtv_remote",label:"Android TV Remote",      detect:["androidtv_remote"],        kind:"core", icon:"\uD83C\uDFAE", url:"https://www.home-assistant.io/integrations/androidtv_remote/", enables:"Full D-pad + power + app-launch remote for Android TV / Google TV." },
  { id:"roku",            label:"Roku",                   detect:["roku"],                    kind:"core", icon:"\uD83D\uDCFA", url:"https://www.home-assistant.io/integrations/roku/",   enables:"Roku remote, app launch and casting \u2014 your Roku target hardware." },
  { id:"tts",             label:"Text-to-Speech (Piper\u2026)",detect:["tts"],                kind:"core", icon:"\uD83D\uDDE3\uFE0F", url:"https://www.home-assistant.io/integrations/tts/",    enables:"Speak the avatar's / engine's voice through your house speakers." },
  { id:"frigate",         label:"Frigate NVR",            detect:["frigate"],                 kind:"HACS", icon:"\uD83D\uDCF9", url:"https://github.com/blakeblackshear/frigate-hass-integration", enables:"Pull NVR / security-camera feeds into the pip-boy screen and camera viewers." },
  { id:"alexa_media",     label:"Alexa Media Player",     detect:["alexa_media"],             kind:"HACS", icon:"\uD83D\uDD37", url:"https://github.com/alandtse/alexa_media_player", enables:"Each Echo as a media_player \u2014 speak cough/doorbell announcements on the Shed Echo, and send typed commands from the Alexa command panel." },
  { id:"browser_mod",     label:"Browser Mod",            detect:["browser_mod"],             kind:"HACS", icon:"\uD83D\uDDA5\uFE0F", url:"https://github.com/thomasloven/hass-browser_mod", enables:"Pop the engine's media or a dashboard onto any browser / wall display on demand." },
  { id:"midea_ac_lan",    label:"Midea AC (LAN)",         detect:["midea_ac_lan"],            kind:"HACS", icon:"\u2744\uFE0F", url:"https://github.com/wuwentao/midea_ac_lan", enables:"Local control of Midea U-shaped ACs (your MAW12V1QWT) as a climate entity." },
  { id:"wled",            label:"WLED",                   detect:["wled"],                    kind:"core", icon:"\uD83D\uDD06", url:"https://www.home-assistant.io/integrations/wled/",   enables:"Drive addressable LED strips with engine effects + alert colors (engine can also talk to WLED directly)." },
  { id:"weather",         label:"Weather",                detect:["weather"],                 kind:"core", icon:"\uD83C\uDF24\uFE0F", url:"https://www.home-assistant.io/integrations/weather/", enables:"Drive the engine's sky + clouds from your local weather." },
  { id:"person",          label:"Person / Presence",      detect:["person","device_tracker"], kind:"core", icon:"\uD83D\uDEB6", url:"https://www.home-assistant.io/integrations/person/",  enables:"Greet you on arrival and note departures by presence." },
  { id:"calendar",        label:"Calendar",               detect:["calendar"],                kind:"core", icon:"\uD83D\uDCC5", url:"https://www.home-assistant.io/integrations/calendar/",enables:"Show upcoming events on the agenda / pip-boy screen." },
  { id:"light",           label:"Lights",                 detect:["light"],                   kind:"core", icon:"\uD83D\uDCA1", url:"https://www.home-assistant.io/integrations/light/",   enables:"Let house lights react to engine alerts (flash on battery-full, warnings, etc.)." },
  { id:"mqtt",            label:"MQTT",                   detect:["mqtt"],                    kind:"core", icon:"\uD83D\uDD0C", url:"https://www.home-assistant.io/integrations/mqtt/",    enables:"Bridge Tasmota / Zigbee2MQTT / DIY devices the engine can then drive." }
];
