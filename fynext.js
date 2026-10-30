#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');
const { loadConfig, loadSystemPrompt, saveSettingsPatch } = require('./src/config');
const llm = require('./src/llm');
const tools = require('./src/tools');
const setup = require('./src/setup');
const projectContext = require('./src/project-context');
const { Screen, sanitize } = require('./src/screen');
const { PlainPresenter } = require('./src/plain');
const chatHistory = require('./src/chat-history');
const { requiresToolFollowThrough } = require('./src/task-intent');
const featureRoadmap = require('./src/feature-roadmap');

const MAX_CALLS = 30;

const COMMAND_HELP = [
  'Komutlar:',
  '  /yardım, /help          Bu yardım',
  '  /model [ad]             Model seç veya adıyla değiştir',
  '  /modeller, /models      Yerel Ollama modellerini seç',
  '  /usage                  Oturum token kullanımını göster',
  '  /araçlar, /tools        Kullanılabilir araçları listele',
  '  /project, /proje        Proje hafızasını ve özetini göster',
  '  /memory, /hafıza        Proje hafızasını yenile ve göster',
  '  /git, /status           Git durumunu ve son değişiklikleri göster',
  '  /review, /incele        Olası riskleri hızlıca denetle',
  '  /plan                   Plan moduna geç (salt okunur; düzeltme önerir)',
  '  /build                  Build moduna geç (cihaz erişimi)',
  '  /mode                   Geçerli modu göster',
  '  /prompt                 Sistem promptunu göster',
  '  /roadmap, /features     Fynext özellik yol haritasını göster',
  '  /yenile, /reload        system_prompt.txt dosyasını yeniden yükle',
  '  /workspace [yol]        Çalışma alanını göster veya değiştir',
  '  /temp [0-2]             Sıcaklığı göster veya ayarla',
  '  /approve on|off         İşlem onayını aç veya kapat',
  '  /geçmiş [numara]        Sohbet geçmişini listele veya aç',
  '  /yeni                   Yeni sohbet başlat',
  '  /temizle, /clear        Sohbeti ve ekranı temizle',
  '  /çık, /exit             Çıkış',
  '',
  'Kısayollar (tam ekran):',
  '  Enter                 Mesajı gönder',
  '  Tab                   Plan / Build modunu değiştir',
  '  Düşünüyor yazısı      İşlem özetini aç / kapat',
  '  Alt+Enter / Ctrl+J    Mesaj içinde yeni satır',
  '  PageUp / PageDown     Sohbeti kaydır',
  '  Fare tekerleği        Sohbeti yukarı / aşağı kaydır',
  '  Yukarı / Aşağı        İmleci satırlar arasında taşı',
  '  Ctrl+P / Ctrl+N       Önceki / sonraki mesaj geçmişi',
  '  Ctrl+O                Yeni sohbet başlat',
  '  Ctrl+A / Ctrl+E       Satır başı / sonu',
  '  Ctrl+B / Ctrl+F       İmleci sola / sağa taşı',
  '  Ctrl+W                Önceki kelimeyi sil',
  '  Ctrl+U                Mesajı temizle',
  '  Ctrl+K                İmleçten satır sonuna kadar sil',
  '  Ctrl+L                Ekranı yenile',
  '  Ctrl+C                Çalışırken durdur; boşken iki kez çık',
  '  Ctrl+D                Çık'
].join('\n');

const FLAG_HELP = [
  'Kullanım:',
  '  fynext [seçenekler]',
  '  fynext --prompt "görev"',
  '  echo "görev" | fynext',
  '',
  'Seçenekler:',
  '  --model <ad>          Model adı (varsayılan: qwen2.5-coder:3b)',
  '  --workspace, -w <yol> Çalışma alanı',
  '  --plain               Tam ekran arayüz yerine düz terminal',
  '  --prompt <metin>      Tek seferlik görev çalıştır',
  '  --restricted          Çalışma alanı dışına çıkmayı engelle, onay iste',
  '  --approve             Yıkıcı işlemler için onay iste (varsayılan)',
  '  --no-approve          Onay isteme',
  '  --no-color            Renkleri kapat',
  '  --help, -h            Bu yardımı göster',
  '  --version, -v         Sürümü göster',
  '',
  'Kısayollar (tam ekran):',
  '  Enter                 Gönder',
  '  Tab                   Plan / Build modunu değiştir',
  '  Alt+Enter / Ctrl+J    Yeni satır',
  '  PageUp / PageDown     Sohbette kaydır',
  '  Ctrl+C                Çalışırken durdur; boşken iki kez çık',
  '  Ctrl+D                Çık',
  '  Ctrl+P / Ctrl+N       Komut geçmişi',
  '  Ctrl+O                Yeni sohbet başlat',
  '  Ctrl+L                Ekranı yenile'
].join('\n');

function parseArgs(argv) {
  const flags = {
    help: false,
    version: false,
    plain: false,
    prompt: null,
    model: null,
    workspace: null,
    restricted: false,
    approve: null,
    color: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];
    let value = null;
    if (arg.startsWith('--') && arg.includes('=')) {
      const eq = arg.indexOf('=');
      value = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    switch (arg) {
      case '--help':
      case '-h':
        flags.help = true;
        break;
      case '--version':
      case '-v':
        flags.version = true;
        break;
      case '--plain':
      case '--no-tui':
        flags.plain = true;
        break;
      case '--prompt':
        if (value == null) value = argv[++i];
        if (value == null) throw new Error('--prompt için metin gerekli');
        flags.prompt = value;
        break;
      case '--model':
        if (value == null) value = argv[++i];
        if (!value) throw new Error('--model için ad gerekli');
        flags.model = value;
        break;
      case '--workspace':
      case '-w':
        if (value == null) value = argv[++i];
        if (!value) throw new Error('--workspace için yol gerekli');
        flags.workspace = value;
        break;
      case '--restricted':
        flags.restricted = true;
        break;
      case '--approve':
        flags.approve = true;
        break;
      case '--no-approve':
        flags.approve = false;
        break;
      case '--no-color':
        flags.color = false;
        break;
      default:
        throw new Error(`Bilinmeyen seçenek: ${arg}`);
    }
  }

  return flags;
}

function summarize(text, max) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const limit = max || 160;
  return value.length > limit ? value.slice(0, limit) + '…' : value;
}

function callSignature(cfg, call) {
  const args = Object.assign({}, call.arguments || {});
  if (call.name === 'fs_write' && !args.append) delete args.append;
  for (const key of ['path', 'source', 'destination']) {
    if (typeof args[key] === 'string' && args[key]) {
      try {
        args[key] = path.resolve(cfg.workspace, args[key]).replace(/\//g, '\\').toLowerCase();
      } catch (_) {
        /* yoksay */
      }
    }
  }
  return call.name + ':' + JSON.stringify(args);
}

function isAbort(err) {
  if (!err) return false;
  return /iptal|abort|cancel/i.test(String(err.message || err));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function startStartupSplash(stdout) {
  const word = 'fynext';
  const colors = [196, 202, 208, 202];
  let frame = 0;
  let stopped = false;

  function draw() {
    const columns = stdout.columns || 80;
    const rows = stdout.rows || 24;
    const row = Math.max(1, Math.ceil(rows / 2));
    const column = Math.max(1, Math.floor((columns - word.length) / 2) + 1);
    let text = '';
    for (let i = 0; i < word.length; i += 1) {
      const color = colors[(i + frame) % colors.length];
      text += `\x1b[38;5;${color}m${word[i]}`;
    }
    stdout.write(`\x1b[${row};${column}H\x1b[2K${text}\x1b[0m`);
    frame += 1;
  }

  stdout.write('\x1b[?25l\x1b[2J');
  draw();
  const timer = setInterval(draw, 100);
  const onResize = () => draw();
  const onExit = () => stop();
  stdout.on('resize', onResize);
  process.once('exit', onExit);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    stdout.removeListener('resize', onResize);
    process.removeListener('exit', onExit);
    stdout.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h');
  }

  return stop;
}

function buildSystemPrompt(cfg, base, mode) {
  const projectMemory = cfg.projectContext
    ? projectContext.buildProjectMemoryText(cfg.projectContext)
    : 'Project memory has not been generated.';
  const env = [
    '',
    'RUNTIME CONTEXT:',
    `- Mode: ${mode === 'plan' ? 'PLAN (read only; inspect and recommend, do not modify)' : `BUILD (carry out the requested work; destructive changes ${cfg.approveDestructive ? 'require approval' : 'do not require approval'})`}`,
    `- Workspace: ${cfg.workspace}`,
    `- Platform: ${process.platform} ${process.arch}`,
    `- Date: ${new Date().toISOString()}`,
    `- Model: ${cfg.model}`,
    `- Shell: ${process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || 'sh'}`,
    `- Destructive action approval: ${cfg.approveDestructive ? 'enabled' : 'disabled'}`,
    `- Access outside workspace: ${cfg.allowOutsideWorkspace ? 'enabled' : 'disabled'}`,
    '- Prefer workspace-relative paths for file tools.',
    'PROJECT SNAPSHOT (possibly incomplete; verify with tools):',
    projectMemory,
    mode === 'plan'
      ? '- In PLAN mode, inspect the project and return findings or a concrete plan. Do not modify files.'
      : '- In BUILD mode, use tools to complete requested project work. Do not stop at suggestions or instructions for the user.',
    ...(mode === 'plan'
      ? ['- Use only read-only tools and commands. Never create, edit, delete, or move files.']
      : [
          '- For repository-specific analysis or recommendations, inspect the relevant project files before answering.',
          '- For implementation requests, inspect existing conventions, make the change, read it back, and run relevant checks.',
          '- Never ask the user to inspect or edit files that you can handle with available tools.',
          '- Do not claim completion or verification without successful tool results.'
        ])
  ].join('\n');
  return `${String(base || '').trim()}\n${env}`;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(FLAG_HELP + '\n');
    return;
  }
  if (flags.version) {
    process.stdout.write(`fynext ${pkg.version}\n`);
    return;
  }

  if (!flags.color) process.env.NO_COLOR = '1';

  const cfg = loadConfig();
  if (flags.model) cfg.model = flags.model;
  if (flags.workspace) cfg.workspace = path.resolve(flags.workspace);
  if (flags.restricted) {
    cfg.allowOutsideWorkspace = false;
    cfg.approveDestructive = true;
  }
  if (flags.approve != null) cfg.approveDestructive = flags.approve;

  let stat = null;
  try {
    stat = fs.statSync(cfg.workspace);
  } catch (_) {
    stat = null;
  }
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Çalışma alanı bulunamadı: ${cfg.workspace}`);
  }

  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY && !flags.plain && flags.prompt == null;
  const plainRepl = !interactive && flags.plain && !!process.stdin.isTTY && flags.prompt == null;

  const uiMode = interactive || plainRepl;
  const startupSplash = uiMode && process.stdout.isTTY
    ? startStartupSplash(process.stdout)
    : null;
  const setupLog = uiMode && process.stdout.isTTY
    ? (startupSplash ? () => {} : (line) => process.stdout.write(line + '\n'))
    : (line) => process.stderr.write(line + '\n');
  try {
    await setup.ensureReady(cfg, {
      tty: uiMode && !!process.stdout.isTTY && !startupSplash,
      log: setupLog
    });
  } catch (err) {
    if (startupSplash) startupSplash();
    process.stderr.write(`fynext: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (startupSplash) startupSplash();

  let systemPromptBase = loadSystemPrompt(cfg);
  try {
    cfg.projectContext = projectContext.refreshProjectMemory(cfg);
  } catch (_) {
    cfg.projectContext = projectContext.readProjectMemory(cfg);
  }
  let mode = 'build';
  const sessionUsage = {
    promptTokens: 0,
    outputTokens: 0,
    latestRate: 0,
    latestEstimated: false,
  };
  let systemPrompt = buildSystemPrompt(cfg, systemPromptBase, mode);
  let messages = [{ role: 'system', content: systemPrompt }];

  const presenter = interactive
    ? new Screen({ model: cfg.model, cwd: cfg.workspace, status: mode, mode })
    : new PlainPresenter({
        model: cfg.model,
        cwd: cfg.workspace,
        status: mode,
        color: flags.color && !!process.stdout.isTTY
      });

  let historyFile = null;
  let conversations = [];
  let currentConversation = null;
  if (uiMode) {
    historyFile = chatHistory.historyPath();
  }

  async function loadStartupConversation() {
    if (!historyFile) return;
    try {
      conversations = chatHistory.loadHistory(historyFile);
      conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      const latestConversation = conversations[0];
      if (latestConversation && latestConversation.messages.length) {
        const shouldRestore = await presenter.confirm(
          'Önceki sohbet yüklensin mi?',
          { allowAlways: false, centered: true }
        );
        if (shouldRestore) {
          currentConversation = latestConversation;
          messages = [{ role: 'system', content: systemPrompt }].concat(latestConversation.messages);
          presenter.restoreConversation(messages.slice(1));
          presenter.note('önceki sohbet geçmişten yüklendi. /geçmiş ile diğer sohbetleri açabilirsiniz.');
          return;
        }
      }
      currentConversation = chatHistory.createConversation();
    } catch (err) {
      presenter.error(err.message);
      currentConversation = chatHistory.createConversation();
    }
  }

  let activeController = null;
  let exiting = false;

  function abortRun() {
    if (activeController) activeController.abort();
  }

  function shutdown(code) {
    if (exiting) return;
    exiting = true;
    if (activeController) activeController.abort();
    try {
      presenter.stop();
    } catch (_) {
      /* yoksay */
    }
    process.exitCode = code == null ? 0 : code;
    if (interactive || plainRepl) {
      setTimeout(() => process.exit(process.exitCode), 10);
    }
  }

  tools.setConfirm(async (description) => {
    const answer = await presenter.confirm(description);
    if (answer === 'always') {
      cfg.approveDestructive = false;
      refreshSystem();
    }
    return answer;
  });

  function refreshSystem() {
    cfg.projectContext = cfg.projectContext || projectContext.readProjectMemory(cfg);
    systemPrompt = buildSystemPrompt(cfg, systemPromptBase, mode);
    messages[0] = { role: 'system', content: systemPrompt };
  }

  function persistConversation() {
    if (!historyFile || !currentConversation || messages.length <= 1) return;
    const conversationMessages = messages.slice(1);
    const firstUserMessage = conversationMessages.find((message) => message.role === 'user');
    const title = firstUserMessage ? summarize(sanitize(firstUserMessage.content), 80) : '';
    const updated = Object.assign({}, currentConversation, {
      updatedAt: new Date().toISOString(),
      title,
      messages: conversationMessages
    });
    conversations = chatHistory.saveHistory(historyFile, conversations, updated);
    currentConversation = updated;
  }

  function startNewConversation() {
    persistConversation();
    currentConversation = chatHistory.createConversation();
    messages = [{ role: 'system', content: systemPrompt }];
    presenter.reset();
    presenter.setNotice('yeni sohbet başlatıldı');
  }

  function switchMode(nextMode) {
    if (nextMode !== 'build' && nextMode !== 'plan') return;
    mode = nextMode;
    refreshSystem();
    if (typeof presenter.setMode === 'function') presenter.setMode(mode);
    presenter.setInfo({ status: mode });
  }

  function recordUsage(stats) {
    if (!stats) return;
    sessionUsage.promptTokens += Number(stats.promptTokens) || 0;
    sessionUsage.outputTokens += Number(stats.outputTokens) || 0;
    if (Number(stats.tokensPerMinute) > 0) sessionUsage.latestRate = Number(stats.tokensPerMinute);
    sessionUsage.latestEstimated = !!stats.estimatedTokens;
    const total = sessionUsage.promptTokens + sessionUsage.outputTokens;
    presenter.setInfo({
      usage: `tok ${total.toLocaleString('tr-TR')} · ${sessionUsage.latestEstimated ? '~' : ''}${sessionUsage.latestRate.toLocaleString('tr-TR')} tok/dk`
    });
  }

  function setThinkingStatus(status) {
    if (typeof presenter.thinkingStatus === 'function') presenter.thinkingStatus(status);
  }

  function toolProgress(name) {
    if (['fs_list', 'fs_read', 'fs_glob', 'fs_grep'].includes(name)) return 'Dosyaları inceliyor';
    if (['fs_write', 'fs_edit', 'fs_delete', 'fs_move', 'fs_mkdir'].includes(name)) return 'Dosyaları güncelliyor';
    if (name === 'shell_exec') return 'Komutu çalıştırıyor';
    if (name.startsWith('git_')) return 'Git bilgilerini inceliyor';
    if (name === 'web_search' || name === 'web_fetch') return 'Web’de araştırıyor';
    return 'İlgili işlemi yürütüyor';
  }

  if (typeof presenter.modeHandler === 'function') {
    presenter.modeHandler(() => switchMode(mode === 'build' ? 'plan' : 'build'));
  }
  if (typeof presenter.newConversationHandler === 'function') {
    presenter.newConversationHandler(startNewConversation);
  }

  async function chatWithUsage(history, availableTools, showDeltas = true) {
    let streamedChars = 0;
    const startedAt = Date.now();
    const result = await llm.chat(cfg, history, availableTools, (delta) => {
      streamedChars += String(delta).length;
      if (showDeltas) presenter.assistantDelta(delta);
      const liveTokens = Math.ceil(streamedChars / 4);
      const liveRate = Math.round(liveTokens * 60000 / Math.max(1, Date.now() - startedAt));
      const completedTokens = sessionUsage.promptTokens + sessionUsage.outputTokens;
      presenter.setInfo({
        usage: `tok ${(completedTokens + liveTokens).toLocaleString('tr-TR')} · ~${liveRate.toLocaleString('tr-TR')} tok/dk`
      });
    });
    result.stats = result.stats || {};
    if (!result.stats.outputTokens && streamedChars > 0) {
      result.stats.outputTokens = Math.ceil(streamedChars / 4);
      result.stats.estimatedTokens = true;
      result.stats.tokensPerMinute = Math.round(
        result.stats.outputTokens * 60000 / Math.max(1, result.stats.totalMs || Date.now() - startedAt)
      );
    }
    recordUsage(result.stats);
    return result;
  }

  async function runAgent() {
    activeController = new AbortController();
    cfg.abortSignal = activeController.signal;
    const currentRequest = messages[messages.length - 1];
    const requiresTools = mode === 'build' &&
      currentRequest &&
      currentRequest.role === 'user' &&
      requiresToolFollowThrough(currentRequest.content);
    const seen = new Map();
    let totalCalls = 0;
    let rounds = 0;
    let toolRetries = 0;
    let executedTool = false;
    let retryHistory = null;

    try {
      for (;;) {
        rounds += 1;
        presenter.beginThinking();
        setThinkingStatus(rounds === 1
          ? 'İsteği ve proje bağlamını değerlendiriyor'
          : 'Araç sonuçlarını değerlendirip sonraki adımı belirliyor');
        let out;
        try {
          out = await chatWithUsage(
            retryHistory || messages,
            tools.definitionsForMode(mode),
            !requiresTools || executedTool
          );
        } catch (err) {
          presenter.assistantDone();
          throw err;
        }
        presenter.assistantDone();

        const content = out && out.content ? out.content : '';
        const calls = out && Array.isArray(out.toolCalls) ? out.toolCalls : [];
        calls.forEach((call, index) => {
          if (!call.id) call.id = `fynext_${rounds}_${index}`;
        });
        if (process.env.FYNEXT_DEBUG) {
          process.stderr.write(`[debug] tur ${rounds} calls ${JSON.stringify(calls)}\n`);
        }
        if (calls.length) {
          retryHistory = null;
          const message = { role: 'assistant', content: '' };
          message.tool_calls = calls.map((call) => ({
            id: call.id,
            function: { name: call.name, arguments: call.arguments }
          }));
          messages.push(message);
        }
        if (!calls.length) {
          if (requiresTools && !executedTool) {
            if (toolRetries < 2) {
              toolRetries += 1;
              const retryMessages = retryHistory || messages;
              retryHistory = retryMessages.concat(
                ...(content ? [{ role: 'assistant', content }] : []),
                {
                  role: 'user',
                  content:
                    'SYSTEM: This is an actionable request. Your previous response did not use any tools and did not complete the task. Call the relevant tools now. For repository work, inspect the relevant files, perform the requested work when in BUILD mode, and verify the result. Do not claim completion without tool results.'
                }
              );
              presenter.note(
                `araç çağrısı yapılmadı; isteği araç kullanarak tamamlama yeniden deneniyor (${toolRetries}/2)`
              );
              continue;
            }

            const warning =
              'Bu uygulama isteği için iki kez yeniden denememe rağmen model araç çağrısı üretmedi. Herhangi bir araç çalıştırmadım ve değişiklik yapmadım.';
            messages.push({ role: 'assistant', content: warning });
            return warning;
          }
          if (content) messages.push({ role: 'assistant', content });
          return content;
        }

        let overLimit = false;
        const roundSeen = new Set();
        for (const call of calls) {
          const signature = callSignature(cfg, call);
          if (roundSeen.has(signature)) {
            presenter.note(`yinelenen araç çağrısı atlandı: ${call.name}`);
            messages.push({
              role: 'tool',
              tool_name: call.name,
              tool_call_id: call.id,
              content: 'UYARI: Aynı araç çağrısı bu turda zaten çalıştırıldı. Sonucu kullan.'
            });
            continue;
          }
          roundSeen.add(signature);

          totalCalls += 1;
          if (totalCalls > MAX_CALLS) {
            messages.push({
              role: 'tool',
              tool_name: call.name,
              tool_call_id: call.id,
              content: 'ATLANDI: araç çağrı sınırı aşıldı.'
            });
            overLimit = true;
            continue;
          }

          const count = (seen.get(signature) || 0) + 1;
          seen.set(signature, count);
          if (count > 1) {
            presenter.note(`tekrarlanan araç çağrısı atlandı: ${call.name}`);
            messages.push({
              role: 'tool',
              tool_name: call.name,
              tool_call_id: call.id,
              content:
                'UYARI: Bu aracı aynı argümanlarla zaten çalıştırdın. Sonucu kullan ve nihai yanıtını ver; tekrar çağırma.'
            });
            continue;
          }

          setThinkingStatus(toolProgress(call.name));
          presenter.toolStart(call.name, call.arguments);
          let resultText;
          let ok = true;
          try {
            resultText = await tools.run(cfg, call.name, call.arguments, mode);
            executedTool = true;
          } catch (err) {
            executedTool = true;
            ok = false;
            resultText = 'HATA: ' + (err && err.message ? err.message : String(err));
          }
          presenter.toolEnd(call.name, ok, summarize(resultText, 240));
          messages.push({
            role: 'tool',
            tool_name: call.name,
            tool_call_id: call.id,
            content: String(resultText == null ? '' : resultText)
          });
        }

        if (overLimit) {
          presenter.note('araç çağrı sınırına ulaşıldı; nihai yanıt isteniyor.');
          break;
        }
        if (rounds > Math.max(1, Number(cfg.maxToolRounds) || 10)) {
          presenter.note('araç turu sınırına ulaşıldı; nihai yanıt isteniyor.');
          break;
        }
      }

      presenter.beginThinking();
      setThinkingStatus('Son yanıtı hazırlıyor');
      const guard = {
        role: 'user',
        content:
          'SYSTEM: Do not call tools in this turn. Answer the user using the conversation and verified tool results. Follow the user\'s language and tone; be direct and concise. Clearly distinguish completed work from recommendations and unverified claims. Never say work was completed unless tool results show it.'
      };
      let final;
      try {
        final = await chatWithUsage(messages.concat([guard]), null);
      } catch (err) {
        presenter.assistantDone();
        throw err;
      }
      presenter.assistantDone();
      const finalText = final && final.content ? final.content : '';
      if (finalText) messages.push({ role: 'assistant', content: finalText });
      return finalText;
    } finally {
      activeController = null;
      cfg.abortSignal = null;
    }
  }

  async function installModel(name) {
    const list = await llm.listModels(cfg);
    if (setup.hasModel(list, name)) return true;
    presenter.setBusy(true);
    presenter.setInfo({ status: 'indiriliyor' });
    let lastPct = -1;
    try {
      await setup.pullModel(cfg, name, (event) => {
        if (!event.total || event.completed == null) return;
        const pct = Math.floor((event.completed / event.total) * 100);
        if (pct === lastPct) return;
        lastPct = pct;
        presenter.setInfo({ status: `indiriliyor %${pct}` });
      });
      return true;
    } catch (err) {
      if (typeof presenter.showCommandResult === 'function') {
        presenter.showCommandResult(`model indirilemedi: ${err.message}`, { error: true });
      } else {
        presenter.error(`model indirilemedi: ${err.message}`);
      }
      return false;
    } finally {
      presenter.setBusy(false);
      presenter.setInfo({ status: mode });
    }
  }

  async function handleCommand(input) {
    const commandNote = (text) => {
      if (typeof presenter.showCommandResult === 'function') presenter.showCommandResult(text);
      else presenter.note(text);
    };
    const commandError = (text) => {
      if (typeof presenter.showCommandResult === 'function') presenter.showCommandResult(text, { error: true });
      else presenter.error(text);
    };
    const raw = input.replace(/^\//, '').trim();
    if (!raw) return;
    const parts = raw.split(/\s+/);
    const cmd = parts.shift().toLowerCase();
    const arg = parts.join(' ').trim();

    if (['exit', 'quit', 'q', 'çık', 'çik', 'cik'].includes(cmd)) {
      shutdown(0);
      return;
    }

    if (['help', 'yardım', 'yardim', '?', 'h'].includes(cmd)) {
      commandNote(COMMAND_HELP);
      return;
    }

    if (['new', 'yeni'].includes(cmd)) {
      startNewConversation();
      return;
    }

    if (['history', 'geçmiş', 'gecmis'].includes(cmd)) {
      if (!historyFile) {
        commandNote('sohbet geçmişi yalnızca etkileşimli oturumlarda kullanılabilir.');
        return;
      }
      if (!arg) {
        if (!conversations.length) {
          commandNote('kayıtlı sohbet geçmişi yok.');
          return;
        }
        commandNote(
          'Sohbet geçmişi (en yeni önce):\n' +
            conversations
              .map((conversation, index) => {
                const title = conversation.title || 'başlıksız sohbet';
                const date = new Date(conversation.updatedAt).toLocaleString('tr-TR');
                const current = currentConversation && conversation.id === currentConversation.id ? '  (geçerli)' : '';
                return `${index + 1}. ${date}  ${title}${current}`;
              })
              .join('\n') +
            '\nAçmak için: /geçmiş <numara>'
        );
        return;
      }
      const selection = Number(arg);
      if (!Number.isInteger(selection) || selection < 1 || selection > conversations.length) {
        commandError(`geçerli bir sohbet numarası girin: 1-${conversations.length}`);
        return;
      }
      const selectedId = conversations[selection - 1].id;
      persistConversation();
      conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      currentConversation = conversations.find((conversation) => conversation.id === selectedId);
      messages = [{ role: 'system', content: systemPrompt }].concat(currentConversation.messages);
      presenter.reset();
      presenter.restoreConversation(messages.slice(1));
      commandNote(`sohbet yüklendi: ${currentConversation.title || 'başlıksız sohbet'}`);
      return;
    }

    if (['model', 'models', 'modeller'].includes(cmd)) {
      let requestedModel = arg;
      if (!requestedModel) {
        let availableModels;
        presenter.setBusy(true);
        presenter.setInfo({ status: 'modeller alınıyor' });
        try {
          availableModels = await llm.listAvailableModels(cfg);
        } catch (err) {
          commandError(`model listesi alınamadı: ${err.message}`);
          return;
        } finally {
          presenter.setBusy(false);
          presenter.setInfo({ status: mode });
        }
        if (typeof presenter.selectOption === 'function') {
          requestedModel = await presenter.selectOption(
            'Yerel Ollama modeli seç',
            availableModels,
            cfg.model
          );
          if (!requestedModel) return;
        } else {
          commandNote(
            `Yerel modeller:\n${availableModels.map((name) => `${name === cfg.model ? '* ' : '  '}${name}`).join('\n')}\nSeçmek için /model <ad> yaz.`
          );
          return;
        }
      }
      const installed = await installModel(requestedModel);
      if (!installed) return;
      cfg.model = requestedModel;
      saveSettingsPatch({ model: cfg.model });
      refreshSystem();
      presenter.setInfo({ model: cfg.model });
      commandNote(`model: ${cfg.model}`);
      return;
    }

    if (['project', 'proje', 'memory', 'hafıza'].includes(cmd)) {
      try {
        cfg.projectContext = projectContext.refreshProjectMemory(cfg);
      } catch (_) {
        cfg.projectContext = projectContext.readProjectMemory(cfg);
      }
      refreshSystem();
      commandNote(projectContext.buildProjectMemoryText(cfg.projectContext));
      return;
    }

    if (['git', 'status', 'değişiklikler', 'degisiklikler'].includes(cmd)) {
      try {
        cfg.projectContext = projectContext.refreshProjectMemory(cfg);
      } catch (_) {
        cfg.projectContext = projectContext.readProjectMemory(cfg);
      }
      const gitInfo = cfg.projectContext.git || {};
      const lines = [
        `dal: ${gitInfo.branch || 'bilinmiyor'}`,
        `durum: ${gitInfo.status || 'git bilgisi yok'}`
      ];
      if (Array.isArray(gitInfo.recentCommits) && gitInfo.recentCommits.length) {
        lines.push('son commitler:');
        lines.push(...gitInfo.recentCommits.slice(0, 5).map((entry) => `  ${entry}`));
      }
      commandNote(lines.join('\n'));
      return;
    }

    if (['review', 'incele', 'audit'].includes(cmd)) {
      try {
        cfg.projectContext = projectContext.refreshProjectMemory(cfg);
      } catch (_) {
        cfg.projectContext = projectContext.readProjectMemory(cfg);
      }
      const issues = projectContext.reviewProject(cfg, cfg.projectContext);
      if (!issues.length) {
        commandNote('İnceleme sonucu: belirgin risk veya teknik borç bulunamadı.');
        return;
      }
      commandNote(['Olası riskler:', ...issues.map((issue) => `- ${issue}`)].join('\n'));
      return;
    }

    if (cmd === 'usage' || cmd === 'kullanım' || cmd === 'kullanim') {
      const total = sessionUsage.promptTokens + sessionUsage.outputTokens;
      const tokenText = sessionUsage.latestEstimated ? 'tahmini üretim hızı' : 'son üretim hızı';
      const details = [
        `oturum tokenı: ${total.toLocaleString('tr-TR')} (girdi ${sessionUsage.promptTokens.toLocaleString('tr-TR')} · çıktı ${sessionUsage.outputTokens.toLocaleString('tr-TR')})`,
        `${tokenText}: ${sessionUsage.latestRate.toLocaleString('tr-TR')} token/dk`
      ];
      commandNote(details.join('\n'));
      return;
    }

    if (['tools', 'araçlar', 'araclar'].includes(cmd)) {
      commandNote(
        'araçlar:\n' +
          tools.definitionsForMode(mode)
            .map((entry) => {
              const fn = entry.function;
              return `${fn.name}: ${summarize(fn.description, 110)}`;
            })
            .join('\n')
      );
      return;
    }

    if (['mode', 'mod'].includes(cmd) && !arg) {
      commandNote(`mod: ${mode}`);
      return;
    }

    if (['mode', 'mod', 'plan', 'build'].includes(cmd)) {
      const requested = ['plan', 'build'].includes(cmd) ? cmd : arg.toLowerCase();
      if (!['plan', 'build'].includes(requested)) {
        commandError('kullanım: /mode plan veya /mode build');
        return;
      }
      switchMode(requested);
      return;
    }

    if (['roadmap', 'features', 'özellikler', 'ozellikler'].includes(cmd)) {
      commandNote(featureRoadmap.buildFeatureRoadmapText());
      return;
    }

    if (cmd === 'prompt') {
      commandNote(`# ${cfg.systemPromptPath}\n${systemPromptBase}`);
      return;
    }

    if (['reload', 'yenile'].includes(cmd)) {
      systemPromptBase = loadSystemPrompt(cfg);
      refreshSystem();
      commandNote('sistem promptu yeniden yüklendi.');
      return;
    }

    if (cmd === 'workspace') {
      if (!arg) {
        commandNote(`workspace: ${cfg.workspace}`);
        return;
      }
      const target = path.resolve(cfg.workspace, arg);
      let targetStat = null;
      try {
        targetStat = fs.statSync(target);
      } catch (_) {
        targetStat = null;
      }
      if (!targetStat || !targetStat.isDirectory()) {
        commandError(`dizin bulunamadı: ${target}`);
        return;
      }
      cfg.workspace = target;
      refreshSystem();
      presenter.setInfo({ cwd: cfg.workspace });
      commandNote(`workspace: ${cfg.workspace}`);
      return;
    }

    if (['temp', 'temperature', 'sıcaklık', 'sicaklik'].includes(cmd)) {
      if (!arg) {
        commandNote(`temperature: ${cfg.temperature}`);
        return;
      }
      const value = Number(arg);
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        commandError('geçerli bir değer girin: 0 ile 2 arasında');
        return;
      }
      cfg.temperature = value;
      commandNote(`temperature: ${cfg.temperature}`);
      return;
    }

    if (['approve', 'onay'].includes(cmd)) {
      if (!arg) {
        commandNote(`işlem onayı: ${cfg.approveDestructive ? 'açık' : 'kapalı'}`);
        return;
      }
      const value = arg.toLowerCase();
      cfg.approveDestructive = ['on', '1', 'true', 'açık', 'acik', 'evet', 'e'].includes(value);
      refreshSystem();
      commandNote(
        `yıkıcı işlem onayı: ${cfg.approveDestructive ? 'açık' : 'kapalı'}`
      );
      return;
    }

    if (['clear', 'temizle', 'reset'].includes(cmd)) {
      startNewConversation();
      presenter.setNotice('sohbet temizlendi');
      return;
    }

    commandError(`bilinmeyen komut: /${cmd}`);
  }

  async function handleInput(text) {
    const input = String(text == null ? '' : text).trim();
    if (!input || exiting) return;

    if (input.startsWith('/')) {
      try {
        await handleCommand(input);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (typeof presenter.showCommandResult === 'function') {
          presenter.showCommandResult(message, { error: true });
        } else {
          presenter.error(message);
        }
      }
      return;
    }

    messages.push({ role: 'user', content: input });
    presenter.user(input);
    try {
      persistConversation();
    } catch (err) {
      presenter.error(err.message);
    }
    presenter.setBusy(true);
    presenter.setInfo({ status: 'düşünüyor' });

    try {
      const answer = await runAgent();
      if (!answer) presenter.note('model boş yanıt döndürdü.');
    } catch (err) {
      if (isAbort(err)) presenter.note('durduruldu.');
      else presenter.error(err && err.message ? err.message : String(err));
    } finally {
      try {
        persistConversation();
      } catch (err) {
        presenter.error(err.message);
      }
      presenter.setInfo({ status: mode });
      presenter.setBusy(false);
    }
  }

  presenter.submitHandler((text) => {
    handleInput(text).catch((err) => presenter.error(err && err.stack ? err.stack : String(err)));
  });
  presenter.abortHandler(abortRun);
  presenter.exitHandler(() => shutdown(0));

  process.on('SIGINT', () => {
    if (activeController) abortRun();
    else shutdown(130);
  });
  process.on('SIGTERM', () => shutdown(143));
  process.on('uncaughtException', (err) => {
    try {
      presenter.stop();
    } catch (_) {
      /* yoksay */
    }
    process.stderr.write(`fynext: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    try {
      presenter.stop();
    } catch (_) {
      /* yoksay */
    }
    process.stderr.write(`fynext: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });

  if (interactive || plainRepl) {
    presenter.start();
    await loadStartupConversation();
    llm.warmup(cfg).catch(() => {});
    if (plainRepl) {
      presenter.note(`fynext ${pkg.version}  ·  ${cfg.model}  ·  ${cfg.workspace}`);
      presenter.note('/yardım ile komutları görebilirsiniz.');
    }
    await new Promise(() => {});
    return;
  }

  let prompt = flags.prompt;
  if (prompt == null) prompt = await readStdin();
  if (prompt && prompt.trim()) {
    await handleInput(prompt);
  } else {
    process.exitCode = 0;
  }
  shutdown(process.exitCode || 0);
}

main().catch((err) => {
  try {
    process.stdout.write('\x1b[?25h\x1b[?2004l\x1b[?1049l');
  } catch (_) {
    /* yoksay */
  }
  process.stderr.write(`fynext: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
