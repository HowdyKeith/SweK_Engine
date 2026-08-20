Attribute VB_Name = "modGPUBrain"
Option Explicit

'***************************************************************
' modGPUBrain v1.4 -- the VBA OpenGL engine as a GPU Brain CLIENT.
' (GPU Brain phase 10; UNTESTED IN EXCEL -- verify per discipline.)
'
' The brain's bridge mailbox is engine-agnostic: anything that can POST
' a snapshot and read back a field is a client. This module makes the
' VBA engine that client, honoring the same authority model as the
' WebGL side: the game owns positions, the brain only publishes fields
' the game may consult. Kill the brain, the sampler returns False, the
' engine behaves exactly as before.
'
' DEPENDENCIES (from VBATransmitter_FixPack_v1 -- REQUIRED):
'   clsStringBuilder.cls  -- snapshot JSON is ~100KB; & concat would
'                            be O(n^2), the builder is O(n)
'   JSONParser.bas v2     -- pure-VBA parse of the field response.
'                            The old ScriptControl parser could not do
'                            this AT ALL on 64-bit Office; this
'                            integration exists because of the FixPack.
'
' USAGE (non-blocking, poll-driven -- no OnTime dance required):
'   1. Once per second-ish from your game loop / timer:
'        GPUBrain_Tick heights(), W, H, ox, oz, cellSize, goals, enemies
'      where heights() is a 0-based Single/Double array (row-major,
'      y*W+x), goals is a Collection of Dictionaries {x, z, id, energy},
'      enemies a Collection of Dictionaries {id, kind, energy, x, z}.
'      Tick is a state machine: it SENDS asynchronously and PARSES a
'      completed response on a later call -- it never blocks the frame.
'   2. In enemy steering (e.g., your pathfinder-failed fallback,
'      exactly like the WebGL kaiju PATCH-B3):
'        If GPUBrain_SampleFlow(ex, ez, fx, fz) Then
'            ' blend fx/fz into the enemy's heading (60/40 works)
'        End If
'   3. GPUBrain_SampleThreat(x, z, dist) gives distance-to-nearest-enemy
'      along traversable paths (higher = safer) for retreat logic.
'
' CONFIG
Private Const BRIDGE_URL As String = "http://127.0.0.1:8787"
Private Const STALE_MS As Long = 5000
'***************************************************************

' --- async request state machine ---
Private Enum BrainState
    BS_IDLE = 0
    BS_SENT = 1
End Enum

Private m_Http As Object                ' WinHttp.WinHttpRequest.5.1
Private m_State As BrainState

' --- received field ---
Private m_HaveField As Boolean
Private m_FieldTick As Long             ' GetTickCount at receipt
Private m_Ox As Double, m_Oz As Double, m_Cell As Double
Private m_W As Long, m_H As Long
Private m_Fx() As Single, m_Fz() As Single
Private m_Threat() As Single
Private m_HaveThreat As Boolean
' v1.4 -- dedicated player-seeking field (FPS/dungeon monsters flow to
' the player through corridors). Parallel to the nav field, driven by a
' player position POSTed in the snapshot; the brain solves pfx/pfz.
Private m_Pfx() As Single, m_Pfz() As Single
Private m_HavePlayerField As Boolean
' v1.1 -- per-enemy attack picks from the brain {id: {name, explore}}
Private m_Attacks As Object            ' Scripting.Dictionary or Nothing
' v1.3 -- per-enemy aggro/boldness from the brain {id: 0..1}
Private m_Aggro As Object
' v1.1 -- outcome queue: the game reports shot results; they ride the
' next snapshot POST exactly like the WebGL publisher drains its queue
Private m_Outcomes As Collection

#If VBA7 Then
    Private Declare PtrSafe Function GetTickCount Lib "kernel32" () As Long
#Else
    Private Declare Function GetTickCount Lib "kernel32" () As Long
#End If

' ============================================================
' PUBLIC API
' ============================================================

' Drive this ~1Hz from the game loop. Non-blocking: sends async, and
' harvests a completed response on a later tick (WaitForResponse(0)
' polls without waiting).
Public Sub GPUBrain_Tick(heights() As Double, ByVal W As Long, ByVal H As Long, _
                         ByVal ox As Double, ByVal oz As Double, ByVal cellSize As Double, _
                         ByVal goals As Collection, ByVal enemies As Collection, _
                         Optional ByVal hasPlayer As Boolean = False, _
                         Optional ByVal playerX As Double = 0#, _
                         Optional ByVal playerZ As Double = 0#)
    ' v1.4 -- pass a player position to get the dedicated player-seek field
    ' back (pfx/pfz). Omit it and the behavior is exactly as before.
    On Error GoTo Fail
    Select Case m_State
        Case BS_IDLE
            SendSnapshot heights, W, H, ox, oz, cellSize, goals, enemies, hasPlayer, playerX, playerZ
        Case BS_SENT
            If m_Http.WaitForResponse(0) Then      ' completed?
                If m_Http.Status = 200 Then ParseFieldResponse m_Http.ResponseText
                m_State = BS_IDLE
            End If
    End Select
    Exit Sub
Fail:
    ' network hiccups are normal (brain not running); reset and retry
    m_State = BS_IDLE
End Sub

' Flow direction at world (x, z). True + fx/fz set when a fresh field
' covers the point and has a direction there; False otherwise -- the
' caller's existing behavior is the fallback, always.
Public Function GPUBrain_SampleFlow(ByVal x As Double, ByVal z As Double, _
                                    ByRef fx As Single, ByRef fz As Single) As Boolean
    GPUBrain_SampleFlow = False
    If Not m_HaveField Then Exit Function
    If (GetTickCount() - m_FieldTick) > STALE_MS Then Exit Function
    Dim gx As Long, gy As Long
    gx = Int((x - m_Ox) / m_Cell)
    gy = Int((z - m_Oz) / m_Cell)
    If gx < 0 Or gy < 0 Or gx >= m_W Or gy >= m_H Then Exit Function
    Dim i As Long: i = gy * m_W + gx
    fx = m_Fx(i): fz = m_Fz(i)
    If fx = 0! And fz = 0! Then Exit Function
    GPUBrain_SampleFlow = True
End Function

' v1.4 -- player-seeking flow at world (x, z): the direction a monster at
' this point should move to reach the player, routed around walls by the
' same cost field. True + fx/fz set when a fresh player field covers the
' point; False otherwise (caller's straight-at-player heading is the
' fallback, always). Consult it in the enemy update, exactly like
' SampleFlow, but for FPS/dungeon pursuit instead of objective nav.
Public Function GPUBrain_SamplePlayerFlow(ByVal x As Double, ByVal z As Double, _
                                          ByRef fx As Single, ByRef fz As Single) As Boolean
    GPUBrain_SamplePlayerFlow = False
    If Not m_HavePlayerField Then Exit Function
    If (GetTickCount() - m_FieldTick) > STALE_MS Then Exit Function
    Dim gx As Long, gy As Long
    gx = Int((x - m_Ox) / m_Cell)
    gy = Int((z - m_Oz) / m_Cell)
    If gx < 0 Or gy < 0 Or gx >= m_W Or gy >= m_H Then Exit Function
    Dim i As Long: i = gy * m_W + gx
    fx = m_Pfx(i): fz = m_Pfz(i)
    If fx = 0! And fz = 0! Then Exit Function
    GPUBrain_SamplePlayerFlow = True
End Function

' Cost-weighted distance to the nearest enemy (HIGHER = SAFER).
Public Function GPUBrain_SampleThreat(ByVal x As Double, ByVal z As Double, _
                                      ByRef dist As Single) As Boolean
    GPUBrain_SampleThreat = False
    If Not m_HaveThreat Then Exit Function
    If (GetTickCount() - m_FieldTick) > STALE_MS Then Exit Function
    Dim gx As Long, gy As Long
    gx = Int((x - m_Ox) / m_Cell)
    gy = Int((z - m_Oz) / m_Cell)
    If gx < 0 Or gy < 0 Or gx >= m_W Or gy >= m_H Then Exit Function
    dist = m_Threat(gy * m_W + gx)
    GPUBrain_SampleThreat = True
End Function

' v1.1 -- the brain's attack pick for an enemy id ("" when none/stale).
' Mirrors window.getBrainAttack: consult it AT FIRE TIME, honor if valid.
Public Function GPUBrain_GetAttack(ByVal id As String, Optional ByRef explore As Boolean) As String
    GPUBrain_GetAttack = ""
    explore = False
    If m_Attacks Is Nothing Then Exit Function
    If (GetTickCount() - m_FieldTick) > STALE_MS Then Exit Function
    If Not m_Attacks.Exists(id) Then Exit Function
    On Error Resume Next
    GPUBrain_GetAttack = m_Attacks(id)("name")
    explore = CBool(m_Attacks(id)("explore"))
End Function

' v1.1 -- report a shot result; drained into the next snapshot POST.
'   src: "brain" | "brain-explore" | "rotation"  (provenance -> propensity)
Public Sub GPUBrain_ReportOutcome(ByVal id As String, ByVal attackName As String, _
                                  ByVal hit As Boolean, ByVal src As String)
    If m_Outcomes Is Nothing Then Set m_Outcomes = New Collection
    Dim o As Object
    Set o = CreateObject("Scripting.Dictionary")
    o("id") = id: o("name") = attackName
    o("hit") = IIf(hit, 1, 0): o("src") = src
    m_Outcomes.Add o
End Sub

' v1.3 -- brain-published boldness for an enemy (True + 0..1 when fresh).
Public Function GPUBrain_GetAggro(ByVal id As String, ByRef a As Single) As Boolean
    GPUBrain_GetAggro = False
    If m_Aggro Is Nothing Then Exit Function
    If (GetTickCount() - m_FieldTick) > STALE_MS Then Exit Function
    If Not m_Aggro.Exists(id) Then Exit Function
    On Error Resume Next
    a = CSng(m_Aggro(id))
    GPUBrain_GetAggro = (Err.Number = 0)
    On Error GoTo 0
End Function

Public Function GPUBrain_Status() As String
    GPUBrain_Status = "state=" & m_State & " field=" & m_HaveField & _
        IIf(m_HaveField, " " & m_W & "x" & m_H & " age=" & (GetTickCount() - m_FieldTick) & "ms", "")
End Function

' ============================================================
' INTERNALS
' ============================================================

Private Sub SendSnapshot(heights() As Double, ByVal W As Long, ByVal H As Long, _
                         ByVal ox As Double, ByVal oz As Double, ByVal cellSize As Double, _
                         ByVal goals As Collection, ByVal enemies As Collection, _
                         Optional ByVal hasPlayer As Boolean = False, _
                         Optional ByVal playerX As Double = 0#, _
                         Optional ByVal playerZ As Double = 0#)
    If m_Http Is Nothing Then Set m_Http = CreateObject("WinHttp.WinHttpRequest.5.1")

    Dim sb As New clsStringBuilder
    sb.Init 131072                              ' ~100KB payload; O(n) build
    sb.Append "{""ox"":" & Trim$(Str$(ox)) & ",""oz"":" & Trim$(Str$(oz))
    sb.Append ",""cell"":" & Trim$(Str$(cellSize))
    sb.Append ",""w"":" & W & ",""h"":" & H & ",""heights"":["

    Dim i As Long, n As Long
    n = W * H
    For i = 0 To n - 1
        If i > 0 Then sb.Append ","
        ' 1 decimal is plenty for terrain cost; halves the payload
        sb.Append Trim$(Str$(Int(heights(i) * 10#) / 10#))
    Next i
    sb.Append "],""goals"":["

    Dim item As Object, first As Boolean
    first = True
    If Not goals Is Nothing Then
        For Each item In goals
            If Not first Then sb.Append ","
            sb.Append "{""x"":" & Trim$(Str$(item("x"))) & ",""z"":" & Trim$(Str$(item("z")))
            On Error Resume Next
            sb.Append ",""id"":""" & item("id") & """,""energy"":" & Trim$(Str$(item("energy")))
            ' v1.3 -- optional marksmanship reading on the player goal
            If item.Exists("acc") Then sb.Append ",""acc"":" & Trim$(Str$(item("acc")))
            ' v1.4 -- optional HP reading (difficulty telemetry)
            If item.Exists("hp") Then sb.Append ",""hp"":" & Trim$(Str$(item("hp")))
            On Error GoTo 0
            sb.Append "}"
            first = False
        Next item
    End If
    sb.Append "],""kaiju"":["

    first = True
    If Not enemies Is Nothing Then
        For Each item In enemies
            If Not first Then sb.Append ","
            sb.Append "{""id"":""" & item("id") & """,""kind"":""" & item("kind") & """"
            sb.Append ",""energy"":" & Trim$(Str$(item("energy")))
            sb.Append ",""x"":" & Trim$(Str$(item("x"))) & ",""z"":" & Trim$(Str$(item("z")))
            ' v1.2 -- optional target speed (aim-quality feature 14)
            On Error Resume Next
            If item.Exists("tspd") Then sb.Append ",""tspd"":" & Trim$(Str$(item("tspd")))
            On Error GoTo 0
            ' v1.1 -- optional attack repertoire: {name, family, range, damage}
            On Error Resume Next
            Dim atkCol As Object, atk As Object, firstA As Boolean
            Set atkCol = Nothing
            Set atkCol = item("attacks")
            If Not atkCol Is Nothing Then
                sb.Append ",""attacks"":["
                firstA = True
                For Each atk In atkCol
                    If Not firstA Then sb.Append ","
                    sb.Append "{""name"":""" & atk("name") & """,""family"":""" & atk("family") & """"
                    sb.Append ",""range"":" & Trim$(Str$(atk("range"))) & ",""damage"":" & Trim$(Str$(atk("damage"))) & "}"
                    firstA = False
                Next atk
                sb.Append "]"
            End If
            On Error GoTo 0
            sb.Append "}"
            first = False
        Next item
    End If
    ' v1.1 -- drain queued outcomes into this snapshot
    sb.Append "],""outcomes"":["
    If Not m_Outcomes Is Nothing Then
        Dim oc As Object, firstO As Boolean
        firstO = True
        For Each oc In m_Outcomes
            If Not firstO Then sb.Append ","
            sb.Append "{""id"":""" & oc("id") & """,""name"":""" & oc("name") & """"
            sb.Append ",""hit"":" & oc("hit") & ",""civsHit"":0,""kaijuHit"":0"
            sb.Append ",""src"":""" & oc("src") & """}"
            firstO = False
        Next oc
        Set m_Outcomes = New Collection
    End If
    sb.Append "]"
    ' v1.4 -- player position for the dedicated player-seeking field. The
    ' brain (WebGL parity: PATCH-B2k) solves pfx/pfz toward this point, so
    ' VBA FPS monsters path to the player through corridors via the SAME
    ' flow-field machinery -- and a CPU brain can serve it (it is fields).
    If hasPlayer Then
        sb.Append ",""player"":{""x"":" & Trim$(Str$(playerX)) & ",""z"":" & Trim$(Str$(playerZ)) & "}"
    End If
    sb.Append ",""ts"":" & CStr(GetTickCount()) & "}"

    m_Http.Open "POST", BRIDGE_URL & "/ai/brain/snapshot", True   ' TRUE = async
    m_Http.SetRequestHeader "Content-Type", "application/json"
    m_Http.Send sb.ToString
    m_State = BS_SENT
End Sub

' The snapshot POST's response carries the freshest field (same
' one-round-trip design as the WebGL publisher).
Private Sub ParseFieldResponse(ByVal jsonText As String)
    On Error GoTo Fail
    Dim root As Object
    Set root = JSONParser.ParseJson(jsonText)
    If root Is Nothing Then Exit Sub
    If Not root.Exists("field") Then Exit Sub
    If IsEmpty(root("field")) Or IsNull(root("field")) Then Exit Sub
    Dim f As Object
    Set f = root("field")
    If Not (f.Exists("fx") And f.Exists("fz") And f.Exists("w") And f.Exists("h")) Then Exit Sub

    m_W = CLng(f("w")): m_H = CLng(f("h"))
    m_Ox = CDbl(f("ox")): m_Oz = CDbl(f("oz")): m_Cell = CDbl(f("cell"))

    Dim n As Long: n = m_W * m_H
    ReDim m_Fx(0 To n - 1): ReDim m_Fz(0 To n - 1)
    Dim i As Long, v As Variant
    i = 0
    For Each v In f("fx"): If i < n Then m_Fx(i) = CSng(v): i = i + 1
    Next v
    i = 0
    For Each v In f("fz"): If i < n Then m_Fz(i) = CSng(v): i = i + 1
    Next v

    m_HaveThreat = False
    If f.Exists("threat") Then
        If Not IsNull(f("threat")) And Not IsEmpty(f("threat")) Then
            ReDim m_Threat(0 To n - 1)
            i = 0
            For Each v In f("threat"): If i < n Then m_Threat(i) = CSng(v): i = i + 1
            Next v
            m_HaveThreat = True
        End If
    End If

    ' v1.4 -- dedicated player-seeking field (pfx/pfz). Same shape as the
    ' nav field; present only when the snapshot carried a player position.
    m_HavePlayerField = False
    If f.Exists("pfx") And f.Exists("pfz") Then
        If Not IsNull(f("pfx")) And Not IsEmpty(f("pfx")) _
           And Not IsNull(f("pfz")) And Not IsEmpty(f("pfz")) Then
            ReDim m_Pfx(0 To n - 1): ReDim m_Pfz(0 To n - 1)
            i = 0
            For Each v In f("pfx"): If i < n Then m_Pfx(i) = CSng(v): i = i + 1
            Next v
            i = 0
            For Each v In f("pfz"): If i < n Then m_Pfz(i) = CSng(v): i = i + 1
            Next v
            m_HavePlayerField = True
        End If
    End If

    ' v1.3 -- per-enemy aggro
    Set m_Aggro = Nothing
    If f.Exists("aggro") Then
        If Not IsNull(f("aggro")) And Not IsEmpty(f("aggro")) Then Set m_Aggro = f("aggro")
    End If
    ' v1.1 -- per-enemy attack picks
    Set m_Attacks = Nothing
    If f.Exists("attack") Then
        If Not IsNull(f("attack")) And Not IsEmpty(f("attack")) Then Set m_Attacks = f("attack")
    End If

    m_HaveField = True
    m_FieldTick = GetTickCount()
    Exit Sub
Fail:
    ' malformed/partial response -- keep the previous field
End Sub
