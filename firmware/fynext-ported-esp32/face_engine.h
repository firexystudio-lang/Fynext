#pragma once

#include <Arduino.h>

#include "display.h"
#include "emotions.h"

class FaceEngine {
 public:
  void begin(FynextDisplay* display);

  void setExpression(Expression expression, bool instant = false);
  bool setEmotionByName(const String& name);
  bool setStatus(const String& status);
  void setLabel(const String& label);
  void setProgress(float percent);
  void clearProgress();

  void setLook(float x, float y);
  void clearLook();
  void blink();
  void setSpeaking(float level);

  void update(uint32_t now);
  void render(uint32_t now);

  Expression expression() const { return _targetExpression; }
  uint16_t currentColor() const { return _current.color; }
  float speakingLevel() const { return _speakingLevel; }
  float glowLevel() const { return _current.glow; }

 private:
  struct EyeParams {
    float open;
    float width;
    float height;
    float pupil;
    float gazeX;
    float gazeY;
    float glow;
    uint16_t color;
  };

  void applyExpression(Expression expression, uint8_t variant, bool instant);
  static EyeParams paramsFromPreset(Expression expression);
  static float clampf(float value, float minValue, float maxValue);
  static uint16_t lerpColor(uint16_t a, uint16_t b, float t);
  static uint16_t scaleColor(uint16_t color, float factor);
  static void drawEye(LGFX_Sprite& sprite, const EyeParams& params);

  FynextDisplay* _display = nullptr;
  LGFX_Sprite _leftSprite;
  LGFX_Sprite _rightSprite;

  EyeParams _current = {};
  EyeParams _target = {};
  Expression _targetExpression = EXPR_IDLE;
  String _label;
  float _progress = -1.0f;

  uint32_t _lastUpdate = 0;
  uint32_t _nextBlink = 0;
  uint32_t _blinkStart = 0;
  bool _blinking = false;

  uint32_t _nextSaccade = 0;
  float _gazeX = 0.0f;
  float _gazeY = 0.0f;
  float _gazeTargetX = 0.0f;
  float _gazeTargetY = 0.0f;
  bool _manualLook = false;

  float _speakingLevel = 0.0f;
};
