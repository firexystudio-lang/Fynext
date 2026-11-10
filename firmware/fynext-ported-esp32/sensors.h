#pragma once

#include <Arduino.h>

#include "display.h"

class FaceHardware {
 public:
  void begin(FynextDisplay* display);

  void setBacklight(uint8_t value);
  void setMood(uint16_t color565, float intensity);
  bool readTouch(int& x, int& y, uint32_t now);

 private:
  FynextDisplay* _display = nullptr;
  uint32_t _lastTouchAt = 0;
};
