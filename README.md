# Fynext

Terminal tabanli yerel LLM yazilim ajanidir. Node.js 18 veya ustu ve calisan
bir [Ollama](https://ollama.com/) kurulumu gerektirir. Ilk calistirmada
varsayilan model Ollama uzerinden indirilir.

## Kurulum

Paket npm registry'de yayimlandiktan sonra:

```powershell
npm install -g @mfiretech/fynext
```

Komut PowerShell, Windows Terminal veya diger terminallerden kullanilabilir:

```powershell
fynext
fynext --help
fynext --version
fynext --prompt "Bu projeyi incele"
```

Ayarlar Windows'ta `%APPDATA%\fynext\settings.json`, diger platformlarda
`~/.config/fynext/settings.json` altinda saklanir; `XDG_CONFIG_HOME`
ayarlanmis ise onun kullanildigi dizin tercih edilir.

## Yerel paket denemesi

Proje klasorunde bagimlilik gerektirmeden paket arsivini olusturup kontrol edin:

```powershell
npm pack --dry-run
npm install -g .
```
