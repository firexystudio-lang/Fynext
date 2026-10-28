@echo off
set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
node "%~dp0fynext.js" %*
