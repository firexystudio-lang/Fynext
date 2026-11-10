#pragma once

#define LGFX_USE_V1
#include <LovyanGFX.hpp>

#include "config.h"

// LovyanGFX device definition for the ESP32-2432S0x "Cheap Yellow Display".
// Keeping the pins in code avoids editing TFT_eSPI's User_Setup.h.
class FynextDisplay : public lgfx::LGFX_Device {
 public:
  FynextDisplay() {
    {
      auto cfg = _bus.config();
      cfg.spi_host = HSPI_HOST;
      cfg.spi_mode = 0;
      cfg.freq_write = 40000000;
      cfg.freq_read = 16000000;
      cfg.spi_3wire = false;
      cfg.use_lock = true;
      cfg.pin_sclk = TFT_SCLK;
      cfg.pin_mosi = TFT_MOSI;
      cfg.pin_miso = TFT_MISO;
      cfg.pin_dc = TFT_DC;
      _bus.config(cfg);
      _panel.setBus(&_bus);
    }

    {
      auto cfg = _panel.config();
      cfg.pin_cs = TFT_CS;
      cfg.pin_rst = TFT_RST;
      cfg.pin_busy = -1;
      cfg.panel_width = FACE_PANEL_WIDTH;
      cfg.panel_height = FACE_PANEL_HEIGHT;
      cfg.offset_x = 0;
      cfg.offset_y = 0;
#if defined(FACE_PANEL_ST7789)
      cfg.offset_rotation = 2;
#else
      cfg.offset_rotation = 0;
#endif
      cfg.readable = true;
      cfg.invert = false;
      cfg.rgb_order = false;
      cfg.dlen_16bit = false;
      cfg.bus_shared = false;
#if defined(FACE_PANEL_ST7789)
      cfg.memory_width = 240;
      cfg.memory_height = 320;
#endif
      _panel.config(cfg);
    }

#if FACE_USE_TOUCH
    {
      auto cfg = _touch.config();
      cfg.spi_host = VSPI_HOST;
      cfg.pin_sclk = TOUCH_CLK;
      cfg.pin_mosi = TOUCH_MOSI;
      cfg.pin_miso = TOUCH_MISO;
      cfg.pin_cs = TOUCH_CS;
      cfg.pin_int = TOUCH_IRQ;
      cfg.freq = 1000000;
      cfg.x_min = 240;
      cfg.x_max = 3800;
      cfg.y_min = 3700;
      cfg.y_max = 200;
#if defined(FACE_PANEL_ST7789)
      cfg.offset_rotation = 2;
#else
      cfg.offset_rotation = 0;
#endif
      cfg.bus_shared = false;
      _touch.config(cfg);
      _panel.setTouch(&_touch);
    }
#endif

    setPanel(&_panel);
  }

 private:
#if defined(FACE_PANEL_ST7789)
  lgfx::Panel_ST7789 _panel;
#else
  lgfx::Panel_ILI9341 _panel;
#endif
  lgfx::Bus_SPI _bus;
#if FACE_USE_TOUCH
  lgfx::Touch_XPT2046 _touch;
#endif
};
