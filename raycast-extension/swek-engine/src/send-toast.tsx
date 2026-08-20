// send-toast.tsx — fire a KPop toast on the engine box via POST /kpop/toast.
// Body matches KPopListener's Process-Json: { Title, Message, ToastType, Progress }.
import { Action, ActionPanel, Form, Toast, getPreferenceValues, showToast } from "@raycast/api";
import { useState } from "react";

const { bridgeUrl } = getPreferenceValues<{ bridgeUrl?: string }>();
const BASE = (bridgeUrl || "http://127.0.0.1:8787").replace(/\/+$/, "");

export default function SendToast() {
  const [busy, setBusy] = useState(false);

  async function submit(values: { title: string; message: string; toastType: string }) {
    if (!values.title) { await showToast({ style: Toast.Style.Failure, title: "Title required" }); return; }
    setBusy(true);
    try {
      const r = await fetch(`${BASE}/kpop/toast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Title: values.title, Message: values.message || "", ToastType: values.toastType || "Info", Progress: -1 }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (r.ok && j.ok !== false) await showToast({ style: Toast.Style.Success, title: "Toast sent to engine box" });
      else await showToast({ style: Toast.Style.Failure, title: "Send failed", message: j.error || (r.status === 503 ? "KPop Listener not running" : `HTTP ${r.status}`) });
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Bridge unreachable", message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send Toast" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description text={`Fires a Windows toast on the engine box through ${BASE}/kpop/toast (needs the KPop Listener running there).`} />
      <Form.TextField id="title" title="Title" placeholder="Build finished" />
      <Form.TextArea id="message" title="Message" placeholder="v2194 self-check: 42/42" />
      <Form.Dropdown id="toastType" title="Type" defaultValue="Info">
        <Form.Dropdown.Item value="Info" title="Info" />
        <Form.Dropdown.Item value="Success" title="Success" />
        <Form.Dropdown.Item value="Warning" title="Warning" />
        <Form.Dropdown.Item value="Error" title="Error" />
      </Form.Dropdown>
    </Form>
  );
}
