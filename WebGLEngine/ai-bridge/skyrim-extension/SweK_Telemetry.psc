Scriptname SweK_Telemetry extends Quest
{ SweK Engine telemetry — writes player stats to a JSON file every few seconds via
  PapyrusUtil's JsonUtil, for the SweK bridge skyrimBridge.js to read. SCAFFOLD: verify
  JsonUtil signatures against your PapyrusUtil version + confirm the output path. }

; --- config -------------------------------------------------------------------
String Property FilePath = "C:\\Users\\howdy\\Documents\\My Games\\Skyrim Special Edition\\SKSE\\swek_telemetry.json" Auto
Float  Property IntervalSeconds = 3.0 Auto

Actor _player

Event OnInit()
    _player = Game.GetPlayer()
    RegisterForSingleUpdate(IntervalSeconds)
EndEvent

Event OnUpdate()
    If _player == None
        _player = Game.GetPlayer()
    EndIf
    If _player != None
        ; current + max actor values
        Float hp  = _player.GetActorValue("Health")
        Float hpM = _player.GetBaseActorValue("Health")
        Float mp  = _player.GetActorValue("Magicka")
        Float mpM = _player.GetBaseActorValue("Magicka")
        Float sp  = _player.GetActorValue("Stamina")
        Float spM = _player.GetBaseActorValue("Stamina")
        Int   lvl = _player.GetLevel()
        Int   gold = _player.GetGoldAmount()
        String loc = "Unknown"
        If _player.GetCurrentLocation()
            loc = _player.GetCurrentLocation().GetName()
        EndIf

        ; --- write JSON via PapyrusUtil JsonUtil ---
        ; NOTE: confirm these JsonUtil function names against your PapyrusUtil build.
        JsonUtil.SetStringValue(FilePath, "name", _player.GetActorBase().GetName())
        JsonUtil.SetIntValue(FilePath,    "level", lvl)
        JsonUtil.SetFloatValue(FilePath,  "health", hp)
        JsonUtil.SetFloatValue(FilePath,  "healthMax", hpM)
        JsonUtil.SetFloatValue(FilePath,  "magicka", mp)
        JsonUtil.SetFloatValue(FilePath,  "magickaMax", mpM)
        JsonUtil.SetFloatValue(FilePath,  "stamina", sp)
        JsonUtil.SetFloatValue(FilePath,  "staminaMax", spM)
        JsonUtil.SetIntValue(FilePath,    "gold", gold)
        JsonUtil.SetStringValue(FilePath, "location", loc)
        JsonUtil.Save(FilePath)
    EndIf
    RegisterForSingleUpdate(IntervalSeconds)
EndEvent
