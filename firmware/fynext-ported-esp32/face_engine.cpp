#include "face_engine.h"

#include <math.h>

const ExpressionPreset EXPRESSION_PRESETS[EXPR_COUNT] = {
    // name        open  width height pupil gazeX gazeY colour           glow
    {"idle",       1.00f, 1.00f, 1.00f, 1.00f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.42f},
    {"happy",      0.72f, 1.04f, 0.82f, 1.00f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.70f},
    {"sad",        0.72f, 0.98f, 0.82f, 0.95f, 0.00f,  0.20f, FACE_MONO_COLOR, 0.32f},
    {"angry",      0.56f, 1.08f, 0.72f, 0.82f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.78f},
    {"surprised",  1.08f, 1.05f, 1.05f, 0.65f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.85f},
    {"thinking",   0.90f, 0.96f, 0.96f, 1.00f, 0.30f, -0.30f, FACE_MONO_COLOR, 0.48f},
    {"listening",  1.02f, 1.00f, 1.00f, 1.04f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.55f},
    {"speaking",   0.94f, 1.00f, 0.96f, 1.00f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.62f},
    {"sleepy",     0.24f, 1.00f, 0.90f, 0.85f, 0.00f,  0.22f, FACE_MONO_COLOR, 0.18f},
    {"love",       0.76f, 1.04f, 0.90f, 1.10f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.80f},
    {"confused",   0.96f, 1.00f, 0.98f, 0.96f, 0.00f,  0.12f, FACE_MONO_COLOR, 0.48f},
    {"error",      1.00f, 1.00f, 1.00f, 0.00f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.90f},
    {"curious",    1.04f, 1.00f, 1.02f, 0.88f, 0.10f, -0.10f, FACE_MONO_COLOR, 0.60f},
    {"focused",    0.72f, 0.98f, 0.84f, 0.92f, 0.00f,  0.04f, FACE_MONO_COLOR, 0.50f},
    {"searching",  0.94f, 0.98f, 0.96f, 1.00f, 0.00f, -0.05f, FACE_MONO_COLOR, 0.48f},
    {"planning",   0.92f, 0.98f, 0.98f, 1.00f, 0.10f, -0.38f, FACE_MONO_COLOR, 0.50f},
    {"tool",       0.82f, 0.98f, 0.92f, 0.96f, 0.30f,  0.04f, FACE_MONO_COLOR, 0.56f},
    {"coding",     0.74f, 0.98f, 0.86f, 0.92f,-0.12f,  0.20f, FACE_MONO_COLOR, 0.52f},
    {"testing",    1.02f, 1.02f, 1.02f, 0.90f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.68f},
    {"waiting",    0.58f, 1.00f, 0.90f, 1.00f, 0.00f,  0.04f, FACE_MONO_COLOR, 0.24f},
    {"success",    0.76f, 1.04f, 0.90f, 1.00f, 0.00f,  0.00f, FACE_MONO_COLOR, 0.82f},
};

static String normalised(const String& value) {
  String out = value;
  out.trim();
  out.toLowerCase();
  return out;
}

int expressionFromName(const String& name, uint8_t* variant) {
  String key = normalised(name);
  if (variant) *variant = 0;

  const int separator = key.lastIndexOf('_');
  if (separator >= 0 && separator + 1 < (int)key.length()) {
    bool numericSuffix = true;
    for (int i = separator + 1; i < (int)key.length(); ++i) {
      if (key[i] < '0' || key[i] > '9') {
        numericSuffix = false;
        break;
      }
    }
    if (numericSuffix) {
      const int parsedVariant = key.substring(separator + 1).toInt();
      if (parsedVariant < 1 || parsedVariant > 12) return -1;
      if (variant) *variant = (uint8_t)parsedVariant;
      key = key.substring(0, separator);
    }
  }

  for (int i = 0; i < EXPR_COUNT; ++i) {
    if (key == EXPRESSION_PRESETS[i].name) return i;
  }
  if (key == "working" || key == "busy" || key == "think" || key == "analyzing" ||
      key == "analysis" || key == "reasoning" || key == "request_start" ||
      key == "model_start" || key == "model_thinking" || key == "response_start") {
    return EXPR_THINKING;
  }
  if (key == "done" || key == "complete" || key == "task_complete" ||
      key == "request_complete" || key == "response_complete" || key == "test_pass" ||
      key == "tests_passed") return EXPR_SUCCESS;
  if (key == "ready" || key == "neutral" || key == "default") return EXPR_IDLE;
  if (key == "fail" || key == "failed" || key == "crash" || key == "response_error" ||
      key == "tool_error" || key == "test_fail" || key == "tests_failed") return EXPR_ERROR;
  if (key == "hear" || key == "heard" || key == "listen_start" ||
      key == "user_speaking") return EXPR_LISTENING;
  if (key == "talk" || key == "talking" || key == "response_speaking") return EXPR_SPEAKING;
  if (key == "search" || key == "web_search" || key == "browsing" ||
      key == "search_start") return EXPR_SEARCHING;
  if (key == "tool_use" || key == "using_tool" || key == "tool_call" ||
      key == "tool_start") return EXPR_TOOL;
  if (key == "tool_end" || key == "tool_complete" || key == "tool_result") return EXPR_FOCUSED;
  if (key == "code" || key == "writing_code") return EXPR_CODING;
  if (key == "test" || key == "running_tests" || key == "checking" ||
      key == "test_start" || key == "tests_running" || key == "test_end") return EXPR_TESTING;
  if (key == "queue" || key == "queued" || key == "pending" ||
      key == "waiting_user" || key == "waiting_input") return EXPR_WAITING;
  if (key == "question" || key == "wondering") return EXPR_CURIOUS;
  return -1;
}

const char* expressionName(Expression expression) {
  if (expression >= EXPR_COUNT) return "idle";
  return EXPRESSION_PRESETS[expression].name;
}

FaceEngine::EyeParams FaceEngine::paramsFromPreset(Expression expression) {
  if (expression >= EXPR_COUNT) expression = EXPR_IDLE;
  const ExpressionPreset& preset = EXPRESSION_PRESETS[expression];
  EyeParams params;
  params.open = preset.open;
  params.width = preset.width;
  params.height = preset.height;
  params.pupil = preset.pupil;
  params.gazeX = preset.gazeX;
  params.gazeY = preset.gazeY;
  params.glow = preset.glow;
  params.color = preset.color;
  return params;
}

float FaceEngine::clampf(float value, float minValue, float maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

uint16_t FaceEngine::lerpColor(uint16_t a, uint16_t b, float t) {
  t = clampf(t, 0.0f, 1.0f);
  int ar = (a >> 11) & 0x1F;
  int ag = (a >> 5) & 0x3F;
  int ab = a & 0x1F;
  int br = (b >> 11) & 0x1F;
  int bg = (b >> 5) & 0x3F;
  int bb = b & 0x1F;
  int r = (int)(ar + (br - ar) * t);
  int g = (int)(ag + (bg - ag) * t);
  int bl = (int)(ab + (bb - ab) * t);
  return (uint16_t)((r << 11) | (g << 5) | bl);
}

uint16_t FaceEngine::scaleColor(uint16_t color, float factor) {
  factor = clampf(factor, 0.0f, 1.0f);
  int r = (int)(((color >> 11) & 0x1F) * factor);
  int g = (int)(((color >> 5) & 0x3F) * factor);
  int b = (int)((color & 0x1F) * factor);
  return (uint16_t)((r << 11) | (g << 5) | b);
}

void FaceEngine::begin(FynextDisplay* display) {
  _display = display;
  _display->init();
  _display->setRotation(FACE_DISPLAY_ROTATION);
  _display->fillScreen(TFT_BLACK);

  _leftSprite.setColorDepth(16);
  _rightSprite.setColorDepth(16);
  _leftSprite.createSprite(EYE_SPRITE_WIDTH, EYE_SPRITE_HEIGHT);
  _rightSprite.createSprite(EYE_SPRITE_WIDTH, EYE_SPRITE_HEIGHT);
  _leftSprite.fillScreen(TFT_BLACK);
  _rightSprite.fillScreen(TFT_BLACK);

  _current = paramsFromPreset(EXPR_IDLE);
  _target = _current;
  _targetExpression = EXPR_IDLE;

  const uint32_t now = millis();
  _lastUpdate = now;
  _nextBlink = now + 2200;
  _nextSaccade = now + 1400;
}

void FaceEngine::setExpression(Expression expression, bool instant) {
  applyExpression(expression, 0, instant);
}

void FaceEngine::applyExpression(Expression expression, uint8_t variant, bool instant) {
  if (expression >= EXPR_COUNT) return;
  _targetExpression = expression;
  _target = paramsFromPreset(expression);
  if (variant > 0) {
    static const float gazeX[12] = {0.0f, -0.65f, 0.65f, 0.0f, 0.0f,
                                    -0.50f, 0.50f, -0.50f, 0.50f, 0.0f, 0.0f, 0.0f};
    static const float gazeY[12] = {0.0f, 0.0f, 0.0f, -0.58f, 0.58f,
                                    -0.42f, -0.42f, 0.42f, 0.42f, 0.0f, 0.0f, 0.0f};
    const uint8_t index = variant - 1;
    _target.gazeX = clampf(_target.gazeX + gazeX[index], -0.90f, 0.90f);
    _target.gazeY = clampf(_target.gazeY + gazeY[index], -0.90f, 0.90f);
    if (variant == 1) {
      _target.pupil *= 0.82f;
    } else if (variant == 10) {
      _target.open *= 0.72f;
      _target.height *= 0.84f;
    } else if (variant == 11) {
      _target.open = min(1.15f, _target.open * 1.10f);
      _target.width *= 1.08f;
    } else if (variant == 12) {
      _target.width *= 0.90f;
      _target.height *= 0.88f;
      _target.pupil *= 0.62f;
    }
  }
  if (instant) {
    _current = _target;
    render(millis());
  }
}

bool FaceEngine::setEmotionByName(const String& name) {
  uint8_t variant = 0;
  const int index = expressionFromName(name, &variant);
  if (index < 0) return false;
  applyExpression((Expression)index, variant, false);
  return true;
}

bool FaceEngine::setStatus(const String& status) {
  uint8_t variant = 0;
  const int index = expressionFromName(status, &variant);
  if (index < 0) return false;
  _manualLook = false;
  _gazeTargetX = 0.0f;
  _gazeTargetY = 0.0f;
  applyExpression((Expression)index, variant, false);
  return true;
}

void FaceEngine::setLabel(const String& label) {
  _label = label;
  _label.trim();
  if (_label.length() > FACE_STATUS_TEXT_MAX) {
    _label = _label.substring(0, FACE_STATUS_TEXT_MAX);
  }
}

void FaceEngine::setProgress(float percent) {
  _progress = clampf(percent, 0.0f, 100.0f);
}

void FaceEngine::clearProgress() {
  _progress = -1.0f;
}

void FaceEngine::setLook(float x, float y) {
  _gazeTargetX = clampf(x, -1.0f, 1.0f);
  _gazeTargetY = clampf(y, -1.0f, 1.0f);
  _manualLook = true;
  _nextSaccade = millis() + 2500;
}

void FaceEngine::clearLook() {
  _manualLook = false;
  _gazeTargetX = 0.0f;
  _gazeTargetY = 0.0f;
  _nextSaccade = millis() + random(350, 900);
}

void FaceEngine::blink() {
  _blinking = true;
  _blinkStart = millis();
}

void FaceEngine::setSpeaking(float level) {
  _speakingLevel = clampf(level, 0.0f, 1.0f);
  if (_speakingLevel > 0.05f && _targetExpression != EXPR_SPEAKING) {
    setExpression(EXPR_SPEAKING);
  }
}

void FaceEngine::update(uint32_t now) {
  if (_lastUpdate == 0) _lastUpdate = now;
  float dt = (now - _lastUpdate) / 1000.0f;
  _lastUpdate = now;
  dt = clampf(dt, 0.0f, 0.1f);

  const float blend = 1.0f - expf(-dt * 10.0f);
  _current.open += (_target.open - _current.open) * blend;
  _current.width += (_target.width - _current.width) * blend;
  _current.height += (_target.height - _current.height) * blend;
  _current.pupil += (_target.pupil - _current.pupil) * blend;
  _current.gazeX += (_target.gazeX - _current.gazeX) * blend;
  _current.gazeY += (_target.gazeY - _current.gazeY) * blend;
  _current.glow += (_target.glow - _current.glow) * blend;
  _current.color = lerpColor(_current.color, _target.color, blend);

  if (!_manualLook && now >= _nextSaccade) {
    if (_targetExpression == EXPR_SEARCHING) {
      _gazeTargetX = (random(-1000, 1001) / 1000.0f) * 0.72f;
      _gazeTargetY = (random(-1000, 1001) / 1000.0f) * 0.16f;
      _nextSaccade = now + random(650, 1250);
    } else if (_targetExpression == EXPR_TOOL) {
      _gazeTargetX = random(0, 2) == 0 ? -0.62f : 0.62f;
      _gazeTargetY = (random(-1000, 1001) / 1000.0f) * 0.12f;
      _nextSaccade = now + random(900, 1700);
    } else {
      _gazeTargetX = (random(-1000, 1001) / 1000.0f) * 0.38f;
      _gazeTargetY = (random(-1000, 1001) / 1000.0f) * 0.30f;
      _nextSaccade = now + random(1400, 3800);
    }
  }
  const float gazeBlend = 1.0f - expf(-dt * 8.0f);
  _gazeX += (_gazeTargetX - _gazeX) * gazeBlend;
  _gazeY += (_gazeTargetY - _gazeY) * gazeBlend;

  if (!_blinking && now >= _nextBlink) {
    _blinking = true;
    _blinkStart = now;
  }
  if (_blinking) {
    const float t = (now - _blinkStart) / 180.0f;
    if (t >= 1.0f) {
      _blinking = false;
      uint32_t blinkMin = 1800;
      uint32_t blinkMax = 5200;
      if (_targetExpression == EXPR_WAITING || _targetExpression == EXPR_SLEEPY) {
        blinkMin = 4200;
        blinkMax = 7600;
      } else if (_targetExpression == EXPR_LISTENING || _targetExpression == EXPR_TESTING) {
        blinkMin = 1400;
        blinkMax = 3000;
      }
      _nextBlink = now + random(blinkMin, blinkMax);
    }
  }

  _speakingLevel *= expf(-dt * 4.0f);
  if (_speakingLevel < 0.01f) _speakingLevel = 0.0f;
}

void FaceEngine::drawEye(LGFX_Sprite& sprite, const EyeParams& params) {
  sprite.fillScreen(TFT_BLACK);

  const int cx = EYE_SPRITE_WIDTH / 2;
  const int cy = EYE_SPRITE_HEIGHT / 2;
  const int eyeW = max(20, (int)(90.0f * params.width));
  const int eyeH = max(8, (int)(76.0f * params.height * params.open));
  sprite.fillRect(cx - eyeW / 2, cy - eyeH / 2, eyeW, eyeH, FACE_EYE_COLOR);

  const int pupilW = max(4, min((int)(17.0f * params.pupil), eyeW - 6));
  const int pupilH = max(4, min((int)(23.0f * params.pupil), eyeH - 4));
  if (params.pupil > 0.05f) {
    const int maxX = max(0, eyeW / 2 - pupilW / 2 - 3);
    const int maxY = max(0, eyeH / 2 - pupilH / 2 - 2);
    const int pupilX = cx + (int)(clampf(params.gazeX, -1.0f, 1.0f) * maxX);
    const int pupilY = cy + (int)(clampf(params.gazeY, -1.0f, 1.0f) * maxY);
    sprite.fillRect(pupilX - pupilW / 2, pupilY - pupilH / 2,
                    pupilW, pupilH, TFT_BLACK);
  }
}

void FaceEngine::render(uint32_t now) {
  float blinkFactor = 1.0f;
  if (_blinking) {
    const float t = (now - _blinkStart) / 180.0f;
    if (t < 1.0f) blinkFactor = 1.0f - sinf(PI * t);
  }

  float pulse = 1.0f + 0.045f * sinf(now / 85.0f) * _speakingLevel;
  if (_targetExpression == EXPR_SUCCESS) pulse += 0.035f * sinf(now / 180.0f);
  if (_targetExpression == EXPR_TESTING) pulse += 0.018f * sinf(now / 260.0f);

  EyeParams params = _current;
  params.open = clampf(params.open * blinkFactor * pulse, 0.0f, 1.15f);
  params.pupil = clampf(params.pupil * (1.0f + 0.14f * _speakingLevel), 0.0f, 2.0f);
  const float gx = clampf(_manualLook ? _gazeX : params.gazeX + _gazeX, -1.0f, 1.0f);
  const float gy = clampf(_manualLook ? _gazeY : params.gazeY + _gazeY, -1.0f, 1.0f);
  params.gazeX = gx;
  params.gazeY = gy;

  drawEye(_leftSprite, params);
  drawEye(_rightSprite, params);
  _leftSprite.pushSprite(_display, EYE_LEFT_SPRITE_X, EYE_SPRITE_Y);
  _rightSprite.pushSprite(_display, EYE_RIGHT_SPRITE_X, EYE_SPRITE_Y);

  _display->fillRect(0, 0, FACE_SCREEN_WIDTH, 52, TFT_BLACK);
  _display->setTextDatum(textdatum_t::top_center);
  _display->setTextColor(FACE_EYE_COLOR, TFT_BLACK);
  _display->setTextSize(1);
  _display->drawString(expressionName(_targetExpression), FACE_SCREEN_WIDTH / 2, 3);
  if (_label.length()) {
    if (_label.length() <= 48) {
      _display->drawString(_label, FACE_SCREEN_WIDTH / 2, 17);
    } else {
      const size_t loopLength = _label.length() + 4;
      const size_t start = (now / 180) % loopLength;
      char visibleLabel[49];
      for (size_t i = 0; i < 48; ++i) {
        const size_t index = (start + i) % loopLength;
        visibleLabel[i] = index < _label.length() ? _label[index] : ' ';
      }
      visibleLabel[48] = '\0';
      _display->drawString(visibleLabel, FACE_SCREEN_WIDTH / 2, 17);
    }
  }
  if (_progress >= 0.0f) {
    const int barX = 44;
    const int barY = 38;
    const int barWidth = FACE_SCREEN_WIDTH - 2 * barX;
    _display->drawRect(barX, barY, barWidth, 8, FACE_EYE_COLOR);
    const int fillWidth = (int)((barWidth - 4) * (_progress / 100.0f));
    if (fillWidth > 0) {
      _display->fillRect(barX + 2, barY + 2, fillWidth, 4, FACE_EYE_COLOR);
    }
  }

  _display->fillRect(132, 204, 56, 32, TFT_BLACK);
  if (_speakingLevel > 0.05f) {
    const int mouthWidth = 12 + (int)(20.0f * _speakingLevel);
    const int mouthHeight = 4 + (int)(12.0f * _speakingLevel);
    _display->fillRect((FACE_SCREEN_WIDTH - mouthWidth) / 2, 216,
                       mouthWidth, mouthHeight, FACE_EYE_COLOR);
    return;
  }

  switch (_targetExpression) {
    case EXPR_HAPPY:
    case EXPR_SUCCESS:
    case EXPR_LOVE:
      _display->fillRect(146, 216, 8, 3, FACE_EYE_COLOR);
      _display->fillRect(154, 219, 12, 3, FACE_EYE_COLOR);
      _display->fillRect(166, 216, 8, 3, FACE_EYE_COLOR);
      break;
    case EXPR_SAD:
    case EXPR_SLEEPY:
      _display->fillRect(146, 219, 8, 3, FACE_EYE_COLOR);
      _display->fillRect(154, 216, 12, 3, FACE_EYE_COLOR);
      _display->fillRect(166, 219, 8, 3, FACE_EYE_COLOR);
      break;
    case EXPR_SURPRISED:
      _display->fillRect(156, 214, 8, 3, FACE_EYE_COLOR);
      _display->fillRect(153, 217, 3, 8, FACE_EYE_COLOR);
      _display->fillRect(164, 217, 3, 8, FACE_EYE_COLOR);
      _display->fillRect(156, 225, 8, 3, FACE_EYE_COLOR);
      break;
    case EXPR_CURIOUS:
      _display->fillRect(157, 216, 6, 3, FACE_EYE_COLOR);
      _display->fillRect(154, 219, 3, 6, FACE_EYE_COLOR);
      _display->fillRect(163, 219, 3, 6, FACE_EYE_COLOR);
      _display->fillRect(157, 225, 6, 3, FACE_EYE_COLOR);
      break;
    case EXPR_CONFUSED:
      _display->fillRect(146, 218, 10, 3, FACE_EYE_COLOR);
      _display->fillRect(156, 215, 8, 3, FACE_EYE_COLOR);
      _display->fillRect(164, 220, 10, 3, FACE_EYE_COLOR);
      break;
    case EXPR_ANGRY:
    case EXPR_ERROR:
      _display->fillRect(148, 219, 24, 4, FACE_EYE_COLOR);
      break;
    default:
      _display->fillRect(150, 220, 20, 3, FACE_EYE_COLOR);
      break;
  }
}
