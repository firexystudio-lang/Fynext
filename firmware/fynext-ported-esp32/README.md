# Fynext Ported ESP32

Expressive robot face firmware for the **ESP32-2432S08 / ESP32-2432S028**
("Cheap Yellow Display") board. Fynext keeps running on the PC; this firmware
turns the ESP32 into the robot's face and listens to Fynext over USB serial.
The face uses white block eyes without eyebrows, blinks and looks around while
idle, and displays the current task label as Fynext works.

```
Fynext (PC, Node.js)
   │ USB serial, 115200 baud, newline-delimited JSON
   ▼
ESP32-2432S08
   ├─ white block eyes + pixel expressions
   ├─ emotions and blinking
   ├─ XPT2046 touch -> gaze + surprised reaction
   └─ RGB LED -> mood colour
```

## Hardware

| Part | Detail |
| :-- | :-- |
| Board | ESP32-2432S08 / ESP32-2432S028 (CYD) |
| MCU | ESP32-WROOM, 4 MB flash, no PSRAM |
| Display | 2.8" 240x320 ILI9341 TFT (configured driver) |
| Touch | XPT2046 resistive, separate SPI bus |
| RGB LED | GPIO 4 (R), 16 (G), 17 (B), active low |
| Backlight | GPIO 21 |

Display pins: `MISO 12, MOSI 13, SCLK 14, CS 15, DC 2, RST -1`.
Touch pins: `IRQ 36, MOSI 32, MISO 39, CLK 25, CS 33`.

The panel's native dimensions are 240x320. The face is intentionally rendered
in landscape at 320x240 (`setRotation(1)`); touch coordinates follow this
logical orientation. The driver and specified TFT pins are set in `config.h`
and `display.h`. Install the Espressif ESP32 board package and LovyanGFX.

The activation splash is currently disabled (`FACE_REQUIRE_ACTIVATION 0` in
`config.h`), so the face starts immediately and does not require the Fynext
logo or `/port fynext esp32` handshake. Set it to `1` to restore the splash and
activation requirement.

## Arduino IDE setup

1. Install the **ESP32** board package (Espressif) from Boards Manager.
2. Install **LovyanGFX** from Library Manager.
3. Open `fynext-ported-esp32.ino` in this folder.
4. Select **Tools > Board > ESP32 Arduino > ESP32 Dev Module**.
5. Keep flash size 4 MB, partition scheme default.
6. Upload speed 115200 is the safest choice on CYD boards.

### Panel selection

In `config.h`:

```cpp
#define FACE_PANEL_ILI9341 1
// #define FACE_PANEL_ST7789 1
```

Do not change the panel driver based only on the PCB family name. Change it
only after confirming that the fitted panel uses a different controller. If
colours are inverted, verify the panel's colour settings before changing
`cfg.invert` in `display.h`.

## Serial protocol

Every message is one JSON object per line.
Command lines are limited to 256 bytes; longer lines are discarded and return
an `error` response instead of being executed.

| Command | Example |
| :-- | :-- |
| Emotion | `{"t":"emotion","v":"happy"}` |
| Status/task/event + text + direction | `{"t":"task","v":"coding_04","text":"Editing config","direction":"lower_right","progress":35}` |
| Look | `{"t":"look","direction":"up_left"}` |
| Progress (0-100) | `{"t":"progress","v":65}` |
| Clear progress | `{"t":"progress_clear"}` |
| Blink | `{"t":"blink"}` |
| Speak level | `{"t":"speak","v":0.7}` |
| Brightness | `{"t":"bright","v":180}` |
| Ping | `{"t":"ping"}` |
| Reset | `{"t":"reset"}` |

The firmware replies with:

```json
{"t":"ready","fw":"0.1","panel":"ILI9341"}
{"t":"active","v":"fynext esp32"}
{"t":"pong"}
{"t":"touch","x":120,"y":80}
{"t":"error","v":"unknown emotion: foo"}
```

## Activation screen

After boot, the supplied Fynext logo remains on screen and face commands are
ignored until activation. Send the line `/port fynext esp32` to the firmware,
or forward this JSON message over USB serial:

```json
{"t":"activate","v":"fynext esp32"}
```

For chat-session activation, the host can send `{"t":"session","v":"start"}`
at the beginning of each session; this returns the display to the logo and
requires activation again. `{"t":"session","v":"end"}` and
`{"t":"deactivate"}` also show the logo. The `/port` command must be handled
and forwarded by the Fynext PC-side bridge; that bridge's source is not part
of this firmware project.

Base expressions: `idle`, `happy`, `sad`, `angry`, `surprised`,
`thinking`, `listening`, `speaking`, `sleepy`, `love`, `confused`, `error`,
`curious`, `focused`, `searching`, `planning`, `tool`, `coding`, `testing`,
`waiting`, `success`.

Each of the 21 base expressions has 12 numbered geometric/gaze variations,
giving 252 numbered variants plus the unnumbered base expressions. Use a
two-digit suffix such as `angry_01` through `angry_12`, or send a base
expression without a suffix.

Fynext can send status, a short on-screen label, and a gaze direction as work
progresses. Direction values include `left`, `right`, `up`, `down`, `up_left`,
`up_right`, `down_left`, `down_right`, and `center`. Labels up to 128
characters are accepted; text longer than 48 characters scrolls across the
display. Progress appears as a small bar below the label. A completed
expression automatically fills the bar.

```json
{"t":"task","v":"listening","text":"Listening"}
{"t":"event","v":"request_start","text":"Thinking"}
{"t":"event","v":"search_start","text":"Searching the web","direction":"up_right","progress":20}
{"t":"event","v":"tool_start","text":"Opening a tool","direction":"right","progress":35}
{"t":"progress","v":50,"text":"Reading results"}
{"t":"event","v":"tool_end","text":"Tool finished","progress":65}
{"t":"task","v":"coding_04","text":"Editing config.h","direction":"down_left","progress":75}
{"t":"event","v":"test_start","text":"Running tests","direction":"down","progress":90}
{"t":"event","v":"response_speaking","text":"Preparing a response"}
{"t":"event","v":"response_complete","text":"Done"}
```

Status aliases include `analyzing`/`reasoning` -> `thinking`,
`web_search`/`browsing` -> `searching`, `using_tool`/`tool_call` -> `tool`,
`writing_code` -> `coding`, and `running_tests`/`checking` -> `testing`.
Event aliases include `request_start`, `search_start`, `tool_start`/`tool_end`,
`test_start`/`test_pass`, `response_speaking`, `response_complete`, and
`response_error`. Events display their name as a label when no `text` is
provided. The firmware maps events it receives; the Fynext serial bridge must
send them. `{"t":"look","direction":"down_right"}` can also move the eyes
independently, while numeric `x`/`y` look commands remain supported.
Touch gaze is temporary: after the touch reaction the eyes return to
automatic movement instead of staying fixed at the touched coordinate.

The Serial Monitor also accepts simple commands for quick testing:

```text
HAPPY
THINKING
BLINK
SPEAK 0.7
LOOK 0.5 -0.3
PING
```

## Pairing with Fynext

1. Install dependencies in the Fynext project: `npm install`
2. Start Fynext and run `/face ports` to find the COM port.
3. Enable the bridge and select the port:

```text
/face on
/face port COM5
```

4. Test an expression:

```text
/face test happy
```

Fynext now drives the face automatically: thinking while the model works,
speaking while the answer streams, happy when the response completes, and sad
on errors.

### Useful commands

| Command | Purpose |
| :-- | :-- |
| `/face` | Show bridge status |
| `/face on` / `/face off` | Enable or disable the bridge |
| `/face ports` | List serial ports |
| `/face port COM5` | Select a port |
| `/face test happy` | Send a test expression |
| `/face emotion sad` | Same as test |
| `/face status thinking` | Send a status value |

## Troubleshooting

- **White screen:** wrong panel macro (`ILI9341` vs `ST7789`).
- **Inverted colours:** set `cfg.invert = true` in `display.h`.
- **Red and blue swapped:** set `cfg.rgb_order = true` in `display.h`
  (common on dual-USB CYD revisions).
- **Screen rotated or mirrored:** adjust `cfg.offset_rotation` in `display.h`
  (ST7789 defaults to `2`, ILI9341 to `0`).
- **Touch gaze is offset:** the XPT2046 calibration differs per batch; adjust
  `x_min/x_max/y_min/y_max` in `display.h` or use a calibration sketch.
- **Touch never triggers:** set `cfg.pin_int = -1` in `display.h` so the driver
  polls instead of waiting for the IRQ line.
- **Fynext does not find the board:** use the UART USB port (CH340/CP2102).
  On two-USB CYD revisions the other port is the native ESP32 USB.
- **`serialport` missing:** run `npm install serialport` in the Fynext project.
- **Board not detected by Fynext:** close the Arduino Serial Monitor; only one
  program can hold the COM port at a time.
