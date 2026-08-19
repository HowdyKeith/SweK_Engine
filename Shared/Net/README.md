# Net — standalone networking (extracted from the VBA smart transmitter)

Pulled out so the engine can do its own sockets without the transmitter running.

> The **full** transmitter (189 modules — incl. HTTP/WebSocket/MQTT **servers** and
> routing) now lives in-archive at `/VBATransmitter`. This folder stays the slim,
> dependency-free extract for the engine.

## Included now (verified standalone — no external module deps)
- `WinsockDeclares.bas`, `WinsockUtils.bas`, `WinAPI.bas` — raw Winsock core
  (WSAStartup/socket/connect/send/recv + helpers). 650 lines, self-contained.

## Mapped, pull on request (bounded closures, verify on compile)
- **Standalone MQTT client** (HA autodiscovery): `clsMQTTClient.cls`,
  `clsMQTTMessage.cls`, `clsMQTTClientData.cls`, `clsMQTTQueueItem.cls`,
  `MQTTConstants.bas`, `MQTTPacketBuilder.bas`, `clsMQTTDiscovery.cls`
  (+ Winsock core; `clsMQTTClient` also news `clsmDNSManager` for discovery).
- **Standalone WebSocket client** (a transport option for modEngineBridge):
  `clsWebsocketClient.cls`, `clsWebsocketCore.cls`, `clsWebsocketSecurity.cls`,
  `WebsocketClient.bas`, `clsWebsocket.cls`, `clsJsonParser.cls` (+ Winsock core).

Smart-transmitter end-to-end integration is deferred until after the 3D-engine
release, per plan — this folder just makes the pieces reusable now.
