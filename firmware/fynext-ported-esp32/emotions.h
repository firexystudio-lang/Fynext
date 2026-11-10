#pragma once

#include <Arduino.h>

#include "config.h"

enum Expression : uint8_t {
  EXPR_IDLE = 0,
  EXPR_HAPPY,
  EXPR_SAD,
  EXPR_ANGRY,
  EXPR_SURPRISED,
  EXPR_THINKING,
  EXPR_LISTENING,
  EXPR_SPEAKING,
  EXPR_SLEEPY,
  EXPR_LOVE,
  EXPR_CONFUSED,
  EXPR_ERROR,
  EXPR_CURIOUS,
  EXPR_FOCUSED,
  EXPR_SEARCHING,
  EXPR_PLANNING,
  EXPR_TOOL,
  EXPR_CODING,
  EXPR_TESTING,
  EXPR_WAITING,
  EXPR_SUCCESS,
  EXPR_COUNT
};

struct ExpressionPreset {
  const char* name;
  float open;       // eye opening, 0..1+
  float width;      // eye width scale
  float height;     // eye height scale
  float pupil;      // pupil size scale
  float gazeX;      // resting gaze, -1..1
  float gazeY;      // resting gaze, -1..1
  uint16_t color;   // RGB mood colour
  float glow;       // RGB mood intensity, 0..1
};

extern const ExpressionPreset EXPRESSION_PRESETS[EXPR_COUNT];

int expressionFromName(const String& name, uint8_t* variant = nullptr);
const char* expressionName(Expression expression);
