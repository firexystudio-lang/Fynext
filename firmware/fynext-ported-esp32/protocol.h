#pragma once

#include <Arduino.h>

#include "face_engine.h"
#include "sensors.h"

class FaceProtocol {
 public:
  void begin(FaceEngine* face, FaceHardware* hardware, Stream* serial);
  void poll(uint32_t now);
  bool isActivated() const { return _activated; }

  void sendReady(const char* panel);
  void sendTouch(int x, int y);

 private:
  void processLine(const String& line);
  void sendLine(const String& line);
  void sendError(const String& message);

  FaceEngine* _face = nullptr;
  FaceHardware* _hardware = nullptr;
  Stream* _serial = nullptr;
  String _buffer;
  bool _discardingLine = false;
  bool _activated = false;
};
