#pragma once

#include <Arduino.h>

// ---------------------------------------------------------------------------
// Fynext Ported ESP32 - board configuration
//
// Target board: ESP32-2432S028, HW-458
//   - 2.8" 240x320 ILI9341 TFT, XPT2046 resistive touch
//
// The panel type below is selected for the hardware specified for this build.
// Select another driver only after confirming the installed panel.
// ---------------------------------------------------------------------------

#define FACE_PANEL_ILI9341 1
// #define FACE_PANEL_ST7789 1
#define FACE_REQUIRE_ACTIVATION 0

// Native panel is portrait; the face UI uses landscape logical coordinates.
#define FACE_PANEL_WIDTH 240
#define FACE_PANEL_HEIGHT 320
#define FACE_DISPLAY_ROTATION 1
#define FACE_SCREEN_WIDTH 320
#define FACE_SCREEN_HEIGHT 240
#define FACE_TARGET_FPS 30
#define FACE_SERIAL_BAUD 115200
#define FACE_MONO_COLOR RGB565(80, 220, 255)
#define FACE_EYE_COLOR RGB565(255, 255, 255)
#define FACE_STATUS_TEXT_MAX 128

// Display pins (CYD / ESP32-2432S028 wiring)
#define TFT_MISO 12
#define TFT_MOSI 13
#define TFT_SCLK 14
#define TFT_CS 15
#define TFT_DC 2
#define TFT_RST -1
#define TFT_BL 21

// XPT2046 touch pins (separate SPI bus on the CYD)
#define TOUCH_IRQ 36
#define TOUCH_MOSI 32
#define TOUCH_MISO 39
#define TOUCH_CLK 25
#define TOUCH_CS 33

// On-board RGB LED (active low)
#define RGB_LED_R 4
#define RGB_LED_G 16
#define RGB_LED_B 17
#define RGB_LED_ACTIVE_LOW 1

#define FACE_USE_TOUCH 1
#define FACE_USE_RGB_LED 1
#define FACE_DEBUG 0

// Eye sprite geometry. Two sprites of 140x120 at 16-bit use ~67 KB of RAM.
#define EYE_SPRITE_WIDTH 140
#define EYE_SPRITE_HEIGHT 120
#define EYE_LEFT_CENTER_X 96
#define EYE_RIGHT_CENTER_X 224
#define EYE_CENTER_Y 134
#define EYE_LEFT_SPRITE_X (EYE_LEFT_CENTER_X - EYE_SPRITE_WIDTH / 2)
#define EYE_RIGHT_SPRITE_X (EYE_RIGHT_CENTER_X - EYE_SPRITE_WIDTH / 2)
#define EYE_SPRITE_Y (EYE_CENTER_Y - EYE_SPRITE_HEIGHT / 2)

#define RGB565(r, g, b) ((uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3)))
