#include "protocol.h"

#include "config.h"

namespace {

String jsonString(const String& line, const char* key) {
  const String pattern = String("\"") + key + "\":";
  int index = line.indexOf(pattern);
  if (index < 0) return "";
  index += pattern.length();
  while (index < (int)line.length() && (line[index] == ' ' || line[index] == '\t')) ++index;
  if (index >= (int)line.length() || line[index] != '"') return "";
  ++index;
  String value;
  value.reserve(line.length() - index);
  bool escaped = false;
  for (; index < (int)line.length(); ++index) {
    const char c = line[index];
    if (escaped) {
      switch (c) {
        case '"':
        case '\\':
        case '/':
          value += c;
          break;
        case 'b':
          value += '\b';
          break;
        case 'f':
          value += '\f';
          break;
        case 'n':
          value += '\n';
          break;
        case 'r':
          value += '\r';
          break;
        case 't':
          value += '\t';
          break;
        default:
          value += c;
          break;
      }
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      return value;
    } else {
      value += c;
    }
  }
  return "";
}

String jsonEscape(const String& value) {
  String escaped;
  escaped.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); ++i) {
    const char c = value[i];
    switch (c) {
      case '"':
        escaped += "\\\"";
        break;
      case '\\':
        escaped += "\\\\";
        break;
      case '\b':
        escaped += "\\b";
        break;
      case '\f':
        escaped += "\\f";
        break;
      case '\n':
        escaped += "\\n";
        break;
      case '\r':
        escaped += "\\r";
        break;
      case '\t':
        escaped += "\\t";
        break;
      default:
        if ((uint8_t)c < 0x20) {
          escaped += ' ';
        } else {
          escaped += c;
        }
        break;
    }
  }
  return escaped;
}

bool jsonNumber(const String& line, const char* key, float& out) {
  const String pattern = String("\"") + key + "\":";
  int index = line.indexOf(pattern);
  if (index < 0) return false;
  index += pattern.length();
  while (index < (int)line.length() && (line[index] == ' ' || line[index] == '\t')) ++index;
  int end = index;
  while (end < (int)line.length()) {
    const char c = line[end];
    if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') {
      ++end;
    } else {
      break;
    }
  }
  if (end == index) return false;
  out = line.substring(index, end).toFloat();
  return true;
}

bool setLookDirection(FaceEngine* face, String direction) {
  direction.trim();
  direction.toLowerCase();
  direction.replace('-', '_');
  direction.replace(' ', '_');

  float x = 0.0f;
  float y = 0.0f;
  if (direction == "left" || direction == "west") x = -1.0f;
  else if (direction == "right" || direction == "east") x = 1.0f;
  else if (direction == "up" || direction == "upward" || direction == "north") y = -1.0f;
  else if (direction == "down" || direction == "downward" || direction == "south") y = 1.0f;
  else if (direction == "up_left" || direction == "upper_left" ||
           direction == "top_left" || direction == "north_west") {
    x = -0.75f;
    y = -0.75f;
  } else if (direction == "up_right" || direction == "upper_right" ||
             direction == "top_right" || direction == "north_east") {
    x = 0.75f;
    y = -0.75f;
  } else if (direction == "down_left" || direction == "lower_left" ||
             direction == "bottom_left" || direction == "south_west") {
    x = -0.75f;
    y = 0.75f;
  } else if (direction == "down_right" || direction == "lower_right" ||
             direction == "bottom_right" || direction == "south_east") {
    x = 0.75f;
    y = 0.75f;
  } else if (direction != "center" && direction != "middle") {
    return false;
  }

  face->setLook(x, y);
  return true;
}

String eventLabel(String event) {
  event.replace('_', ' ');
  event.toUpperCase();
  return event;
}

}  // namespace

void FaceProtocol::begin(FaceEngine* face, FaceHardware* hardware, Stream* serial) {
  _face = face;
  _hardware = hardware;
  _serial = serial;
  _activated = !FACE_REQUIRE_ACTIVATION;
  _buffer.reserve(192);
}

void FaceProtocol::poll(uint32_t now) {
  (void)now;
  if (!_serial) return;
  while (_serial->available()) {
    const char c = (char)_serial->read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (_discardingLine) {
        sendError("command line too long");
      } else {
        processLine(_buffer);
      }
      _buffer = "";
      _discardingLine = false;
    } else if (!_discardingLine) {
      if (_buffer.length() < 256) {
        _buffer += c;
      } else {
        _buffer = "";
        _discardingLine = true;
      }
    }
  }
}

void FaceProtocol::sendLine(const String& line) {
  if (!_serial) return;
  _serial->print(line);
  _serial->print('\n');
}

void FaceProtocol::sendReady(const char* panel) {
  sendLine(String("{\"t\":\"ready\",\"fw\":\"0.1\",\"panel\":\"") + panel + "\"}");
}

void FaceProtocol::sendTouch(int x, int y) {
  sendLine(String("{\"t\":\"touch\",\"x\":") + x + ",\"y\":" + y + "}");
}

void FaceProtocol::sendError(const String& message) {
  sendLine(String("{\"t\":\"error\",\"v\":\"") + jsonEscape(message) + "\"}");
}

void FaceProtocol::processLine(const String& line) {
  if (!_face) return;
  String trimmed = line;
  trimmed.trim();
  if (!trimmed.length()) return;

  String plainCommand = trimmed;
  plainCommand.toLowerCase();
  if (plainCommand == "/port fynext esp32") {
    _activated = true;
    sendLine("{\"t\":\"active\",\"v\":\"fynext esp32\"}");
    return;
  }

  if (trimmed[0] == '{') {
    String type = jsonString(trimmed, "t");
    type.toLowerCase();

    if (type == "activate") {
      String target = jsonString(trimmed, "v");
      target.trim();
      target.toLowerCase();
      if (target != "fynext esp32" && target != "esp32") {
        sendError("activation target must be fynext esp32");
        return;
      }
      _activated = true;
      sendLine("{\"t\":\"active\",\"v\":\"fynext esp32\"}");
      return;
    }

    if (type == "deactivate" || type == "session") {
      String state = type == "session" ? jsonString(trimmed, "v") : "end";
      state.toLowerCase();
      if (state != "end" && state != "start") {
        sendError("session state must be start or end");
        return;
      }
#if FACE_REQUIRE_ACTIVATION
      _activated = false;
      sendLine("{\"t\":\"inactive\",\"v\":\"fynext esp32\"}");
#else
      _activated = true;
      sendLine("{\"t\":\"active\",\"v\":\"fynext esp32\"}");
#endif
      return;
    }

    if (!_activated) return;

    if (type == "emotion") {
      String value = jsonString(trimmed, "v");
      if (!value.length()) value = jsonString(trimmed, "name");
      if (!_face->setEmotionByName(value)) {
        sendError(String("unknown emotion: ") + value);
      } else {
        _face->setLabel("");
        _face->clearProgress();
      }
      return;
    }

    if (type == "status" || type == "task" || type == "event") {
      String value = jsonString(trimmed, "v");
      if (!value.length()) value = jsonString(trimmed, "name");
      if (!_face->setStatus(value)) {
        sendError(String("unknown status: ") + value);
        return;
      }

      String label = jsonString(trimmed, "text");
      if (!label.length()) label = jsonString(trimmed, "label");
      if (!label.length() && type == "event") label = eventLabel(value);
      _face->setLabel(label);

      float progress = 0.0f;
      if (jsonNumber(trimmed, "progress", progress)) {
        _face->setProgress(progress);
      } else if (_face->expression() == EXPR_SUCCESS) {
        _face->setProgress(100.0f);
      } else {
        _face->clearProgress();
      }

      String direction = jsonString(trimmed, "direction");
      if (direction.length() && !setLookDirection(_face, direction)) {
        sendError(String("unknown look direction: ") + direction);
        return;
      }

      float x = 0.0f;
      float y = 0.0f;
      const bool hasX = jsonNumber(trimmed, "x", x);
      const bool hasY = jsonNumber(trimmed, "y", y);
      if (!direction.length() && (hasX || hasY)) {
        if (!hasX || !hasY) {
          sendError("status look requires both x and y");
          return;
        }
        _face->setLook(x, y);
      }
      return;
    }

    if (type == "progress") {
      float progress = 0.0f;
      if (!jsonNumber(trimmed, "v", progress) &&
          !jsonNumber(trimmed, "value", progress)) {
        sendError("progress requires numeric v");
        return;
      }
      _face->setProgress(progress);
      String label = jsonString(trimmed, "text");
      if (label.length()) _face->setLabel(label);
      return;
    }

    if (type == "progress_clear") {
      _face->clearProgress();
      return;
    }

    if (type == "look") {
      String direction = jsonString(trimmed, "direction");
      if (!direction.length()) direction = jsonString(trimmed, "v");
      if (direction.length()) {
        if (!setLookDirection(_face, direction)) {
          sendError(String("unknown look direction: ") + direction);
        }
        return;
      }

      float x = 0.0f;
      float y = 0.0f;
      jsonNumber(trimmed, "x", x);
      jsonNumber(trimmed, "y", y);
      _face->setLook(x, y);
      return;
    }

    if (type == "speak" || type == "mouth") {
      float level = 0.0f;
      if (!jsonNumber(trimmed, "v", level)) jsonNumber(trimmed, "level", level);
      _face->setSpeaking(level);
      return;
    }

    if (type == "blink") {
      _face->blink();
      return;
    }

    if (type == "bright") {
      float value = 255.0f;
      jsonNumber(trimmed, "v", value);
      if (_hardware) _hardware->setBacklight((uint8_t)constrain(value, 0.0f, 255.0f));
      return;
    }

    if (type == "ping") {
      sendLine("{\"t\":\"pong\"}");
      return;
    }

    if (type == "reset") {
      _face->setExpression(EXPR_IDLE, true);
      _face->setLabel("");
      _face->clearProgress();
      return;
    }

    sendError(String("unknown command: ") + type);
    return;
  }

  if (!_activated) return;

  String command = trimmed;
  command.toUpperCase();

  if (command == "PING") {
    sendLine("{\"t\":\"pong\"}");
    return;
  }
  if (command == "BLINK") {
    _face->blink();
    return;
  }
  if (command == "RESET") {
    _face->setExpression(EXPR_IDLE, true);
    _face->setLabel("");
    _face->clearProgress();
    return;
  }
  if (command.startsWith("SPEAK ")) {
    _face->setSpeaking(constrain(command.substring(6).toFloat(), 0.0f, 1.0f));
    return;
  }
  if (command.startsWith("LOOK ")) {
    float x = 0.0f;
    float y = 0.0f;
    sscanf(command.substring(5).c_str(), "%f %f", &x, &y);
    _face->setLook(x, y);
    return;
  }

  if (!_face->setEmotionByName(command)) {
    sendError(String("unknown emotion: ") + command);
  } else {
    _face->setLabel("");
    _face->clearProgress();
  }
}
