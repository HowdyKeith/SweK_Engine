# Voice control the engine through Home Assistant Assist

You already have the whole local voice stack — `wake_word.openwakeword`,
`stt.faster_whisper`, `tts.piper`, `conversation.home_assistant`, and the Kitchen
Assist mic (your "Doggy" pipeline). This wires spoken phrases to engine actions.

## How it flows

```
you speak  ->  HA Assist (wake word + STT + intent match)
           ->  intent_script calls rest_command.swek_voice
           ->  POST http://<your-PC-ip>:8787/voice/command  {command, args}
           ->  the bridge broadcasts "voice:command" to the engine page
           ->  the engine runs it (weather / time of day / clouds / kaiju)
```

The engine must be open on a device (Shield/PC), same as the Twitch chat commands.

## Vocabulary the engine understands

`command` (+ optional `args`):

- Weather: `rain`, `storm`, `snow`, `mist`, `cloudy`, `blizzard`, `clear` (also `sun` / `sunny`)
- Clouds: `clouds` + one of `cumulus`, `cumulonimbus`, `stratus`, `stratocumulus`, `cirrus`, `nimbostratus`, or `clouds off`
- Time of day: `day`, `night`, `dawn`, `dusk`, `noon`, `morning`, `evening`, `afternoon`
- Kaiju: `kaiju` (on) / `kaiju off`

## 1) Add the REST command

In HA `configuration.yaml` (replace the IP with your engine PC's LAN address):

```yaml
rest_command:
  swek_voice:
    url: "http://192.168.11.50:8787/voice/command"
    method: POST
    content_type: "application/json"
    payload: '{"command": "{{ command }}", "args": "{{ args | default(\"\") }}"}'
```

## 2) Teach Assist the sentences

Create `config/custom_sentences/en/swek.yaml`:

```yaml
language: "en"
intents:
  SwekWeather:
    data:
      - sentences:
          - "make it rain"
          - "start the rain"
          - "(start|make) a storm"
          - "make it snow"
          - "clear (the )?sky"
          - "stop the weather"
        # the slot value is filled per-sentence below via response, or use lists
  SwekTime:
    data:
      - sentences:
          - "make it (day|night|dawn|dusk|noon|morning|evening)"
          - "set the time to (day|night|dawn|dusk|noon)"
  SwekKaiju:
    data:
      - sentences:
          - "(spawn|start) (a )?kaiju"
          - "stop the kaiju"
```

Then map those intents to the rest_command in `configuration.yaml`:

```yaml
intent_script:
  SwekWeather:
    action:
      - service: rest_command.swek_voice
        data:
          command: >
            {% set t = text | lower %}
            {% if 'snow' in t %}snow
            {% elif 'storm' in t %}storm
            {% elif 'rain' in t %}rain
            {% elif 'clear' in t or 'stop' in t %}clear
            {% else %}clear{% endif %}
          args: ""
    speech:
      text: "Done."
  SwekTime:
    action:
      - service: rest_command.swek_voice
        data:
          command: >
            {% set t = text | lower %}
            {% if 'night' in t %}night
            {% elif 'dawn' in t %}dawn
            {% elif 'dusk' in t %}dusk
            {% elif 'noon' in t %}noon
            {% elif 'morning' in t %}morning
            {% elif 'evening' in t %}evening
            {% else %}day{% endif %}
          args: ""
    speech:
      text: "Okay."
  SwekKaiju:
    action:
      - service: rest_command.swek_voice
        data:
          command: "kaiju"
          args: >
            {{ 'off' if 'stop' in (text | lower) else 'on' }}
    speech:
      text: "On it."
```

(`text` is the raw recognized sentence; the templates pick the keyword. If you
prefer explicit slots/lists, HA's custom-sentence `lists` work too — this keyword
approach is the simplest to start.)

## 3) Restart HA, assign the pipeline

Restart Home Assistant (or reload YAML). Make sure your Assist pipeline (the
Kitchen "Doggy" one) uses `conversation.home_assistant` so these custom sentences
are matched. Say the wake word, then e.g. "make it rain."

## Test without talking

From the engine PC you can fire a command straight at the bridge:

```powershell
curl -Method POST http://localhost:8787/voice/command -Body '{"command":"storm"}' -ContentType application/json
```

or use **Settings -> Voice Control -> Test** in the engine. `GET /voice/last`
shows the last command the bridge received.
