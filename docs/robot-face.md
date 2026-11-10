# Fynext Ported ESP32 - robot face

Fynext can drive an ESP32-2432S028 as a physical robot face over USB serial.
The firmware renders the face and Fynext sends session, task, progress, and
response events.

## Quick start

```text
npm install
# upload firmware/fynext-ported-esp32/fynext-ported-esp32.ino with Arduino IDE
/port fynext esp32
/face ports
/face port COM5
/face test happy
```

`/port fynext esp32` enables the face bridge and saves that setting. It
activates the ESP32 at startup, after reconnects, and whenever a new or saved
conversation is opened. If automatic port detection picks the wrong device,
select it with `/face port COM5`.

## Behaviour

| Fynext event | Face reaction |
| :-- | :-- |
| User sends a prompt | `listening` |
| Model starts working | `thinking` |
| Fynext runs a tool | Task-specific expression, label, and tool-batch progress |
| Answer streams | `speaking` pulse |
| Response completes | `success`, then `idle` |
| Error / abort | `sad` / `idle` |
| Touch on screen | looks at finger, `surprised` |

## Configuration

Settings live in `src/config/index.js` defaults and can be overridden in
`%APPDATA%\fynext\settings.json` on Windows:

```json
{
  "robotFaceEnabled": true,
  "robotFacePort": "COM5",
  "robotFaceBaud": 115200
}
```

`robotFacePort` may be `"auto"` to pick the first CH340/CP210/Espressif port.

## Files

- `firmware/fynext-ported-esp32/` - Arduino sketch and firmware docs
- `src/robot/face-bridge.js` - serial bridge, auto-reconnect, command throttle
- `src/cli/main.js` - `/face` command and agent event hooks
