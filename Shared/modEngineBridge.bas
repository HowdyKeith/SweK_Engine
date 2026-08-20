Attribute VB_Name = "modEngineBridge"
Option Explicit
' ============================================================
' MODULE: modEngineBridge.bas
' EngineCore side of the WebGL<->OpenGL bridge. Each tick (throttled), POST the
' engine state to the Node relay and apply any AI directives the browser brains
' queued. This is the "body" half of the bridge; the browser pages in
' WebGLEngine/brains/ are the "brains".
'
'   relay (server.js, :8787)
'     POST /bridge/game_tick  { tick, entities:[...] }  -> { ok, directives:[...] }
'     (browser POSTs /bridge/directive { cmd, ... }; relay queues; we drain here)
'
' Transport note: this uses a simple synchronous MSXML2.XMLHTTP POST (fine at
' ~10 Hz). If you want WebSockets/MQTT, swap HttpPost for the vbasmarttransmitter
' project's confirmed-working transport — the rest of this module is unchanged.
'
' Scene-mutation hooks in ApplyDirective are stubs until the canonical FPS room
' (roadmap step 1) defines the scene API. Untested in Excel — verify in-app.
' ============================================================

Private Const BRIDGE_URL As String = "http://localhost:8787"
Private Const POST_TIMEOUT_MS As Long = 400

' Active host base. Defaults to BRIDGE_URL; ResolveBridgeHost may repoint it to the
' transmitter (or another candidate) when Node is down. Keeps both hosts usable.
Public BridgeBaseURL As String

Private Function ActiveBase() As String
    If LenB(BridgeBaseURL) > 0 Then ActiveBase = BridgeBaseURL Else ActiveBase = BRIDGE_URL
End Function

' Probe a preference-ordered, comma-separated list of host bases and point the
' bridge at the first that answers GET /bridge/state. Default order: Node first,
' then a transmitter on :8099. Returns the chosen base, or "" if none answered.
' Call once at startup (or when a tick returns -1) to auto-switch.
Public Function ResolveBridgeHost(Optional ByVal candidatesCsv As String) As String
    If LenB(candidatesCsv) = 0 Then candidatesCsv = BRIDGE_URL & ",http://localhost:8099"
    Dim parts() As String, i As Long, c As String
    parts = Split(candidatesCsv, ",")
    For i = LBound(parts) To UBound(parts)
        c = Trim$(parts(i))
        If LenB(c) > 0 Then
            If ProbeGet(c & "/bridge/state") Then
                BridgeBaseURL = c
                ResolveBridgeHost = c
                Exit Function
            End If
        End If
    Next i
    ResolveBridgeHost = ""
End Function

Private Function ProbeGet(ByVal url As String) As Boolean
    On Error GoTo Fail
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    http.Open "GET", url, False
    http.send
    ProbeGet = (http.Status >= 200 And http.Status < 500)   ' answered at all = host is up
    Exit Function
Fail:
    ProbeGet = False
End Function

' Command state the latest directives left behind, for the scene to consume.
' A demo calls BridgeTick(state) then reads these. Reset CmdMoveValid/SpawnPending
' after acting on them.
Public LastTargetId As Long          ' last "target"/"highlight" entity id (-1 = none)
Public LastMoveX As Double           ' last "move" destination
Public LastMoveZ As Double
Public CmdMoveValid As Boolean       ' a "move" arrived this exchange
Public SpawnPending As Boolean       ' a "spawn" arrived

' Call each tick (or every N ticks) with the engine's state JSON. Returns the
' number of directives applied, or -1 on transport error (swallowed).
Public Function BridgeTick(ByVal stateJson As String) As Long
    Dim resp As String
    resp = HttpPost(ActiveBase() & "/bridge/game_tick", stateJson)
    If LenB(resp) = 0 Then BridgeTick = -1: Exit Function
    BridgeTick = ApplyDirectives(resp)
End Function

' Minimal helper to build the state JSON if the caller doesn't already have one.
' (DemoLevel already emits {tick, entities:[...]}; reuse that when available.)
Public Function BuildStateJSON(ByVal tick As Long, ByVal entitiesJsonArray As String) As String
    BuildStateJSON = "{""tick"":" & tick & ",""entities"":" & entitiesJsonArray & "}"
End Function

' ---- transport (swap this for the smarttransmitter WS/MQTT if desired) ------
Private Function HttpPost(ByVal url As String, ByVal body As String) As String
    On Error GoTo Fail
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    http.Open "POST", url, False
    http.setRequestHeader "Content-Type", "application/json"
    http.send body
    If http.Status >= 200 And http.Status < 300 Then HttpPost = http.responseText
    Exit Function
Fail:
    HttpPost = ""          ' relay down / timeout: degrade silently, keep rendering
End Function

' ---- directive handling -----------------------------------------------------
' Lightweight scan for {"cmd":"..."} entries in the relay response. Good enough
' for the simple directive shapes the brains send; for complex payloads, parse
' with a real JSON helper.
Private Function ApplyDirectives(ByVal resp As String) As Long
    Dim n As Long, p As Long, q As Long, cmd As String, obj As String
    p = InStr(1, resp, """directives""")
    If p = 0 Then Exit Function
    Do
        p = InStr(p, resp, """cmd""")
        If p = 0 Then Exit Do
        q = InStr(p, resp, ":")
        cmd = ExtractQuoted(resp, q)
        ' grab the small object around this cmd as raw context for field reads
        obj = Mid$(resp, p, 160)
        ApplyDirective cmd, obj
        n = n + 1
        p = p + 5
    Loop
    ApplyDirectives = n
End Function

' Dispatch one directive — records it into the public command state above so the
' running scene (e.g. Demo_BridgeFPS) can react to the browser brains.
Public Sub ApplyDirective(ByVal cmd As String, ByVal raw As String)
    Select Case LCase$(cmd)
        Case "target", "highlight"
            LastTargetId = ReadLong(raw, "id")
        Case "move"
            LastMoveX = ReadDbl(raw, "x")
            LastMoveZ = ReadDbl(raw, "z")
            CmdMoveValid = True
        Case "spawn"
            SpawnPending = True
        Case Else
            Debug.Print "[bridge] unhandled cmd: " & cmd
    End Select
End Sub

' ---- tiny field readers (raw is a short JSON fragment) ----------------------
Private Function ExtractQuoted(ByVal s As String, ByVal fromPos As Long) As String
    Dim a As Long, b As Long
    a = InStr(fromPos, s, """")
    If a = 0 Then Exit Function
    b = InStr(a + 1, s, """")
    If b = 0 Then Exit Function
    ExtractQuoted = Mid$(s, a + 1, b - a - 1)
End Function

Private Function ReadLong(ByVal raw As String, ByVal key As String) As Long
    Dim p As Long, i As Long, c As String, num As String
    p = InStr(1, raw, """" & key & """")
    If p = 0 Then Exit Function
    p = InStr(p, raw, ":")
    For i = p + 1 To Len(raw)
        c = Mid$(raw, i, 1)
        If (c >= "0" And c <= "9") Or c = "-" Then num = num & c _
        ElseIf LenB(num) > 0 Then Exit For
    Next i
    If LenB(num) > 0 Then ReadLong = CLng(num)
End Function

Private Function ReadDbl(ByVal raw As String, ByVal key As String) As Double
    Dim p As Long, i As Long, c As String, num As String
    p = InStr(1, raw, """" & key & """")
    If p = 0 Then Exit Function
    p = InStr(p, raw, ":")
    For i = p + 1 To Len(raw)
        c = Mid$(raw, i, 1)
        If (c >= "0" And c <= "9") Or c = "-" Or c = "." Then num = num & c _
        ElseIf LenB(num) > 0 Then Exit For
    Next i
    If LenB(num) > 0 Then ReadDbl = CDbl(num)
End Function
