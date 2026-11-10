#include "sensors.h"

#include "config.h"

void FaceHardware::begin(FynextDisplay* display) {
  _display = display;

  pinMode(TFT_BL, OUTPUT);
  setBacklight(255);

#if FACE_USE_RGB_LED
  pinMode(RGB_LED_R, OUTPUT);
  pinMode(RGB_LED_G, OUTPUT);
  pinMode(RGB_LED_B, OUTPUT);
  setMood(RGB565(80, 220, 255), 0.35f);
#endif
}

void FaceHardware::setBacklight(uint8_t value) {
  analogWrite(TFT_BL, value);
}

void FaceHardware::setMood(uint16_t color565, float intensity) {
#if FACE_USE_RGB_LED
  intensity = constrain(intensity, 0.0f, 1.0f);
  const uint8_t r = ((color565 >> 11) & 0x1F) * 8;
  const uint8_t g = ((color565 >> 5) & 0x3F) * 4;
  const uint8_t b = (color565 & 0x1F) * 8;
  const uint8_t scale = (uint8_t)(40 + intensity * 215);
  const uint8_t rr = (uint8_t)((r * scale) / 255);
  const uint8_t gg = (uint8_t)((g * scale) / 255);
  const uint8_t bb = (uint8_t)((b * scale) / 255);
#if RGB_LED_ACTIVE_LOW
  analogWrite(RGB_LED_R, 255 - rr);
  analogWrite(RGB_LED_G, 255 - gg);
  analogWrite(RGB_LED_B, 255 - bb);
#else
  analogWrite(RGB_LED_R, rr);
  analogWrite(RGB_LED_G, gg);
  analogWrite(RGB_LED_B, bb);
#endif
#else
  (void)color565;
  (void)intensity;
#endif
}

bool FaceHardware::readTouch(int& x, int& y, uint32_t now) {
#if FACE_USE_TOUCH
  if (now - _lastTouchAt < 350) return false;
  int32_t rawX = 0;
  int32_t rawY = 0;
  if (!_display->getTouch(&rawX, &rawY)) return false;

  x = constrain((int)rawX, 0, FACE_SCREEN_WIDTH - 1);
  y = constrain((int)rawY, 0, FACE_SCREEN_HEIGHT - 1);
  _lastTouchAt = now;
  return true;
#else
  (void)x;
  (void)y;
  (void)now;
  return false;
#endif
}
