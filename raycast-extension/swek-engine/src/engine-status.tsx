// engine-status.tsx — SweK Engine bridge health in a Raycast list.
// Endpoints (verified against server.js v2194):
//   /net/info      → { service:"swek-engine", hostname, port, recommended, mdns }
//   /package/info  → { ok, version, name }                    (engine version + friendly name)
//   /self/whoami   → { ok, name, tunnel, authEnabled, ... }   (this box's live tunnel URL)
//   /kpop/status   → { running }
//   /raycast/status→ { ollamaUp, models, platform }           (v2194 route)
//   /hosting/tunnel-registry → { ok, tunnels:[{ tunnelUrl, peerName, alive, manual, self }] }
import { Action, ActionPanel, Icon, List, getPreferenceValues } from "@raycast/api";
import { useFetch } from "@raycast/utils";

const { bridgeUrl } = getPreferenceValues<{ bridgeUrl?: string }>();
const BASE = (bridgeUrl || "http://127.0.0.1:8787").replace(/\/+$/, "");

type NetInfo = { service?: string; hostname?: string; recommended?: string };
type PkgInfo = { ok?: boolean; version?: number; name?: string };
type WhoAmI = { ok?: boolean; name?: string; tunnel?: string; authEnabled?: boolean };
type KpopStatus = { running?: boolean };
type RayStatus = { ollamaUp?: boolean; models?: string[]; platform?: string };
type TunnelReg = { ok?: boolean; tunnels?: Array<{ tunnelUrl?: string; peerName?: string; alive?: boolean; manual?: boolean; self?: boolean }> };

export default function EngineStatus() {
  const net = useFetch<NetInfo>(`${BASE}/net/info`, { keepPreviousData: true });
  const pkg = useFetch<PkgInfo>(`${BASE}/package/info`, { keepPreviousData: true });
  const who = useFetch<WhoAmI>(`${BASE}/self/whoami`, { keepPreviousData: true });
  const kpop = useFetch<KpopStatus>(`${BASE}/kpop/status`, { keepPreviousData: true });
  const ray = useFetch<RayStatus>(`${BASE}/raycast/status`, { keepPreviousData: true });
  const reg = useFetch<TunnelReg>(`${BASE}/hosting/tunnel-registry`, { keepPreviousData: true });

  const loading = net.isLoading || pkg.isLoading || kpop.isLoading || ray.isLoading || reg.isLoading;
  const up = !!net.data && net.data.service === "swek-engine";
  const tunnel = who.data?.tunnel || "";
  const peers = (reg.data?.tunnels ?? []).filter((t) => !t.self);

  return (
    <List isLoading={loading} searchBarPlaceholder="SweK Engine status">
      <List.Section title={`Bridge — ${BASE}`}>
        <List.Item
          icon={up ? Icon.CheckCircle : Icon.XMarkCircle}
          title={up ? `SweK Engine v${pkg.data?.version ?? "?"}` : "Bridge unreachable"}
          subtitle={up ? (pkg.data?.name || who.data?.name || net.data?.hostname || "") : "start START_NODE_Engine.bat / check the Bridge URL preference"}
          accessories={tunnel ? [{ tag: { value: "tunnel up" } }, { text: tunnel }] : []}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Server Panel" url={`${BASE}/server.html`} />
              <Action.OpenInBrowser title="Open Main Engine" url={`${BASE}/index.html`} />
              {tunnel ? <Action.CopyToClipboard title="Copy Tunnel URL" content={tunnel} /> : null}
            </ActionPanel>
          }
        />
        <List.Item
          icon={kpop.data?.running ? Icon.Bell : Icon.BellDisabled}
          title="KPop Listener"
          subtitle={kpop.data?.running ? "running (toasts / voice / pipes live)" : "not running"}
        />
        <List.Item
          icon={ray.data?.ollamaUp ? Icon.Bolt : Icon.BoltDisabled}
          title="Ollama"
          subtitle={ray.data?.ollamaUp ? `serving — ${(ray.data?.models ?? []).length} model(s)` : "not reachable on 11434"}
          accessories={(ray.data?.models ?? []).slice(0, 3).map((m) => ({ tag: m }))}
        />
      </List.Section>
      <List.Section title={`External peers · ${peers.length}`}>
        {peers.map((p) => (
          <List.Item
            key={p.tunnelUrl}
            icon={p.alive !== false ? Icon.Globe : Icon.CircleDisabled}
            title={p.peerName || p.tunnelUrl || "peer"}
            subtitle={p.tunnelUrl}
            accessories={[{ tag: p.manual ? "manual" : "learned" }, { text: p.alive !== false ? "alive" : "down" }]}
            actions={
              <ActionPanel>
                {p.tunnelUrl ? <Action.OpenInBrowser title="Open Peer Server Panel" url={`${p.tunnelUrl}/server.html`} /> : null}
                {p.tunnelUrl ? <Action.CopyToClipboard title="Copy Peer URL" content={p.tunnelUrl} /> : null}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
