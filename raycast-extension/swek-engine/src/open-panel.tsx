// open-panel.tsx — jump to any SweK Engine page from Raycast.
// Mirrors the engine's Applications panel + the KPop tray's engine-links list.
import { Action, ActionPanel, Icon, List, getPreferenceValues } from "@raycast/api";

const { bridgeUrl } = getPreferenceValues<{ bridgeUrl?: string }>();
const BASE = (bridgeUrl || "http://127.0.0.1:8787").replace(/\/+$/, "");

const PAGES: Array<{ title: string; path: string; hint: string; icon: Icon }> = [
  { title: "Main Engine", path: "/index.html", hint: "the WebGL engine", icon: Icon.GameController },
  { title: "Server Panel", path: "/server.html", hint: "boot modes, demos, hosting", icon: Icon.HardDrive },
  { title: "Control", path: "/control.html", hint: "phone UI", icon: Icon.Mobile },
  { title: "Settings", path: "/settings.html", hint: "engine settings", icon: Icon.Gear },
  { title: "Raycast LLM", path: "/raycast.html", hint: "this integration's panel", icon: Icon.Rocket },
  { title: "Hosting / LAN", path: "/hosting.html", hint: "tunnel + peers", icon: Icon.Globe },
  { title: "Pip-Boy (Fallout)", path: "/fallout.html", hint: "green CRT dash", icon: Icon.Monitor },
  { title: "Starfield", path: "/starfield.html", hint: "telemetry + console", icon: Icon.Stars },
  { title: "Solar / Battery", path: "/solar.html", hint: "Enphase", icon: Icon.Sun },
  { title: "Agenda", path: "/agenda.html", hint: "calendar + tasks", icon: Icon.Calendar },
  { title: "Weather", path: "/weather.html", hint: "engine weather", icon: Icon.CloudSun },
  { title: "Trading Floor", path: "/tradingfloor.html", hint: "markets", icon: Icon.LineChart },
  { title: "Asset Library", path: "/asset-library.html", hint: "browse / triage", icon: Icon.Folder },
  { title: "Universal Viewer", path: "/universal-viewer.html", hint: "glb / splat 3D", icon: Icon.Box },
  { title: "AI Brain", path: "/aibrain.html", hint: "LLM console", icon: Icon.Stars },
  { title: "Doc Skills", path: "/doc.html", hint: "document skills", icon: Icon.Document },
];

export default function OpenPanel() {
  return (
    <List searchBarPlaceholder="Open a SweK Engine panel">
      {PAGES.map((p) => (
        <List.Item
          key={p.path}
          icon={p.icon}
          title={p.title}
          subtitle={p.hint}
          accessories={[{ text: p.path }]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title={`Open ${p.title}`} url={`${BASE}${p.path}`} />
              <Action.CopyToClipboard title="Copy URL" content={`${BASE}${p.path}`} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
