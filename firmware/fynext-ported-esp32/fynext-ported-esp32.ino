
// Fynext Ported ESP32
// Expressive robot face for the ESP32-2432S08 / ESP32-2432S028 (CYD).
// Fynext on the PC sends newline-delimited JSON to this sketch over USB serial.

#include "config.h"
#include "display.h"
#include "face_engine.h"
#if FACE_REQUIRE_ACTIVATION
#include "fynext_logo.h"
#endif
#include "protocol.h"
#include "sensors.h"

FynextDisplay display;
FaceEngine face;
FaceHardware hardware;
FaceProtocol protocol;

static uint32_t lastRenderAt = 0;
static uint32_t lastMoodAt = 0;
static uint32_t touchUntil = 0;
static Expression restoreExpression = EXPR_IDLE;
static bool wasActivated = false;

#if FACE_REQUIRE_ACTIVATION
static void drawActivationSplash() {
  display.fillScreen(TFT_BLACK);
  if (!display.drawJpg(FYNEXT_LOGO_JPG, sizeof(FYNEXT_LOGO_JPG), 0, 0,
                       FACE_SCREEN_WIDTH, FACE_SCREEN_HEIGHT)) {
    display.setTextDatum(textdatum_t::middle_center);
    display.setTextColor(FACE_EYE_COLOR, TFT_BLACK);
    display.setTextSize(1);
    display.drawString("FYNEXT", FACE_SCREEN_WIDTH / 2, FACE_SCREEN_HEIGHT / 2 - 8);
    display.drawString("/port fynext esp32", FACE_SCREEN_WIDTH / 2,
                       FACE_SCREEN_HEIGHT / 2 + 8);
  }
}
#endif

void setup() {
  Serial.begin(FACE_SERIAL_BAUD);
  delay(120);

  face.begin(&display);
  hardware.begin(&display);
  protocol.begin(&face, &hardware, &Serial);
#if defined(FACE_PANEL_ST7789)
  protocol.sendReady("ST7789");
#else
  protocol.sendReady("ILI9341");
#endif

  face.setExpression(EXPR_IDLE, true);
#if FACE_REQUIRE_ACTIVATION
  drawActivationSplash();
#endif
}

void loop() {
  const uint32_t now = millis();

  protocol.poll(now);
#if FACE_REQUIRE_ACTIVATION
  if (!protocol.isActivated()) {
    if (wasActivated) {
      drawActivationSplash();
      wasActivated = false;
    }
    return;
  }
#endif

  if (!wasActivated) {
    wasActivated = true;
    face.setExpression(EXPR_IDLE, true);
    face.clearLook();
    lastRenderAt = now;
  }

  face.update(now);

  if (now - lastRenderAt >= (1000 / FACE_TARGET_FPS)) {
    lastRenderAt = now;
    face.render(now);
  }

  int touchX = 0;
  int touchY = 0;
  if (hardware.readTouch(touchX, touchY, now)) {
    if (touchUntil == 0) restoreExpression = face.expression();
    const float gazeX = (touchX / (float)(FACE_SCREEN_WIDTH - 1)) * 2.0f - 1.0f;
    const float gazeY = (touchY / (float)(FACE_SCREEN_HEIGHT - 1)) * 2.0f - 1.0f;
    face.setLook(gazeX, gazeY);
    face.setExpression(EXPR_SURPRISED);
    touchUntil = now + 700;
    protocol.sendTouch(touchX, touchY);
  }

  if (touchUntil != 0 && now > touchUntil) {
    face.setExpression(restoreExpression);
    face.clearLook();
    touchUntil = 0;
  }

  if (now - lastMoodAt > 120) {
    lastMoodAt = now;
    hardware.setMood(face.currentColor(), face.glowLevel());
  }
}
