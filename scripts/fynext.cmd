@echo off
set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
node "%~dp0..\fynext.js" %*
