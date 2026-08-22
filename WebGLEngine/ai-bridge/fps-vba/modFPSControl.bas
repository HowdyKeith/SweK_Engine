Attribute VB_Name = "modFPSControl"
' ===========================================================================
' modFPSControl.bas  -  v1257 (#6) FPS control path, Option C (browser-authoritative)
' ---------------------------------------------------------------------------
' The WebGL2 engine owns the first-person camera + enemy AI and PUBLISHES its
' pose to the ai-bridge (POST /fps/state). This module MIRRORS that pose into
' the VBA OpenGL engine so the Win32/WGL window shows the same view.
'
' This is a SCAFFOLD - it polls and parses; wire ApplyFpsPose() to your actual
' GL camera (modCamera / the view matrix) where marked. UNTESTED on the rig;
' send the AIBridge log if the parse or the camera apply misbehaves.
'
' Pairs with: GET http://127.0.0.1:8787/fps/state  ->
'   { "ok":true, "pose":{ "pos":[x,y,z], "yaw":r, "pitch":r, "vel":[x,y,z],
'     "src":"fpscontrol" }, "ts":..., "ageMs":... }
'
' Bun on Windows binds IPv4 - use 127.0.0.1, NOT localhost.
' Reuses the async XMLHTTP + pile-up-guard pattern from modHTTPBridge.bas.
' ===========================================================================
Option Explicit

Private Const FPS_URL As String = "http://127.0.0.1:8787/fps/state"
Private mHttp As Object          ' MSXML2.ServerXMLHTTP60 (async)
Private mBusy As Boolean         ' pile-up guard: one in-flight request at a time
Private mLastTs As Double        ' last pose timestamp we applied (skip stale repeats)

' Mirrored camera pose (read these from your render/camera code)
Public FpsX As Double, FpsY As Double, FpsZ As Double
Public FpsYaw As Double, FpsPitch As Double
Public FpsFresh As Boolean       ' True if a pose arrived within FRESH_MS
Private Const FRESH_MS As Double = 750

' Call once at startup (after the OnTime tick chain is running).
Public Sub FpsControl_Init()
    On Error Resume Next
    Set mHttp = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    mBusy = False
    mLastTs = 0
End Sub

' Call every engine tick (the variable-rate OnTime chain). Non-blocking: fires
' an async GET, and the readyState handler applies the pose when it returns.
Public Sub FpsControl_Poll()
    On Error Resume Next
    If mHttp Is Nothing Then FpsControl_Init
    If mBusy Then Exit Sub                      ' still waiting on the last GET
    mBusy = True
    mHttp.Open "GET", FPS_URL & "?t=" & CStr(Timer), True   ' async; cache-bust
    mHttp.setRequestHeader "Cache-Control", "no-cache"
    mHttp.OnReadyStateChange = GetRef_OnReady  ' see note below
    mHttp.Send
End Sub

' VBA can't take AddressOf for late-bound objects; if OnReadyStateChange isn't
' wired in your build, poll readyState from the tick instead by calling
' FpsControl_Drain() right after Send returns on the NEXT tick.
Private Function GetRef_OnReady() As Variant
    ' placeholder so the module compiles; real projects set
    ' mHttp.OnReadyStateChange = <class with OnReady> or use the drain pattern.
End Function

' Drain pattern (no callback): call once per tick; applies a completed response.
Public Sub FpsControl_Drain()
    On Error Resume Next
    If mHttp Is Nothing Then Exit Sub
    If mHttp.readyState <> 4 Then Exit Sub
    mBusy = False
    If mHttp.Status <> 200 Then Exit Sub
    ApplyFpsJson mHttp.responseText
End Sub

' Minimal hand parse (no JSON lib): pulls pos[0..2], yaw, pitch, ts out of the
' flat response. Robust enough for the fixed shape the bridge emits.
Private Sub ApplyFpsJson(ByVal s As String)
    On Error Resume Next
    If InStr(s, """ok"":true") = 0 Then Exit Sub
    If InStr(s, """pose"":null") > 0 Then FpsFresh = False: Exit Sub

    Dim ts As Double: ts = NumAfter(s, """ts"":")
    If ts > 0 And ts = mLastTs Then        ' unchanged since last apply
        FpsFresh = (AgeMs(s) < FRESH_MS)
        Exit Sub
    End If
    mLastTs = ts

    Dim p As String: p = Between(s, """pos"":[", "]")
    Dim parts() As String: parts = Split(p, ",")
    If UBound(parts) >= 2 Then
        FpsX = SafeD(parts(0)): FpsY = SafeD(parts(1)): FpsZ = SafeD(parts(2))
    End If
    FpsYaw = NumAfter(s, """yaw"":")
    FpsPitch = NumAfter(s, """pitch"":")
    FpsFresh = (AgeMs(s) < FRESH_MS)

    ApplyFpsPose
End Sub

' ---- WIRE THIS to your GL camera --------------------------------------------
' Set the VBA OpenGL engine's view from the mirrored pose. Yaw/pitch are radians
' in the same convention the browser uses (YXZ: yaw about +Y, pitch about +X,
' forward = (-sin yaw, 0, -cos yaw)). Adapt to modCamera's actual fields.
Public Sub ApplyFpsPose()
    On Error Resume Next
    ' Example (replace with your camera/view-matrix setter):
    '   Camera.EyeX = FpsX: Camera.EyeY = FpsY: Camera.EyeZ = FpsZ
    '   Camera.Yaw = FpsYaw: Camera.Pitch = FpsPitch
    '   Camera_RebuildView
End Sub

' ---- tiny string helpers ----------------------------------------------------
Private Function NumAfter(ByVal s As String, ByVal tag As String) As Double
    Dim i As Long: i = InStr(s, tag): If i = 0 Then Exit Function
    i = i + Len(tag)
    Dim j As Long: j = i
    Do While j <= Len(s)
        Dim ch As String: ch = Mid$(s, j, 1)
        If InStr("0123456789+-.eE", ch) = 0 Then Exit Do
        j = j + 1
    Loop
    NumAfter = SafeD(Mid$(s, i, j - i))
End Function
Private Function Between(ByVal s As String, ByVal a As String, ByVal b As String) As String
    Dim i As Long: i = InStr(s, a): If i = 0 Then Exit Function
    i = i + Len(a)
    Dim j As Long: j = InStr(i, s, b): If j = 0 Then Exit Function
    Between = Mid$(s, i, j - i)
End Function
Private Function AgeMs(ByVal s As String) As Double
    Dim a As Double: a = NumAfter(s, """ageMs"":")
    AgeMs = IIf(a <= 0, 999999, a)
End Function
Private Function SafeD(ByVal s As String) As Double
    On Error Resume Next
    SafeD = CDbl(Trim$(s))
End Function
