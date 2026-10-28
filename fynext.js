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
  const projectMemory = cfg.projectContext ? projectContext.buildProjectMemoryText(cfg.projectContext) : 'Proje hafızası henüz oluşturulmadı.';
  const env = [
    '',
    'ORTAM:',
    `- Mod: ${mode === 'plan' ? 'PLAN (salt okunur; hata duzeltmelerini yalnizca oner, uygulama)' : `BUILD (gorevi uygula; ${cfg.approveDestructive ? 'yikici islemlerden once onay al' : 'onaylar kapali'})`}`,
    `- Çalışma alanı: ${cfg.workspace}`,
    `- Platform: ${process.platform} ${process.arch}`,
    `- Tarih: ${new Date().toISOString()}`,
    `- Model: ${cfg.model}`,
    `- Kabuk: ${process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || 'sh'}`,
    `- Onay: ${cfg.approveDestructive ? 'açık' : 'kapalı'}`,
    `- Çalışma alanı dışı erişim: ${cfg.allowOutsideWorkspace ? 'açık' : 'kapalı'}`,
    '- Dosya yollarında mümkün olduğunda çalışma alanına göreli yollar kullan.',
    'PROJE HAFIZASI:',
    projectMemory,
    mode === 'plan'
      ? '- PLAN modunda incele ve oner; degisiklik yapma.'
      : '- BUILD modunda kullanicinin istedigi kod ve dosya islemlerini araclari kullanarak gercekten tamamla; nasil yapilacagini tarif edip birakma.',
    ...(mode === 'plan'
      ? [
          '- PLAN modunda hiçbir dosya oluşturma, yazma, düzenleme, silme veya taşıma; hata düzeltmelerini yalnızca uygulanabilir öneri olarak sun.',
          '- PLAN modunda dosya okuma, git inceleme, web araştırması ve yalnızca salt-okunur shell komutlarını kullan. Shell komut zinciri, yönlendirme veya dosya değiştirebilecek komut çalıştırma.'
        ]
      : []),
    ...(mode === 'build'
      ? [
          '- Kullanici kod yazmani, dosya olusturmani veya projeyi degistirmeni istiyorsa, kullanicidan dosyayi kendisinin olusturmasini ya da kodu elle kopyalamasini ASLA isteme. Uygun dosya yolunu projeyi inceleyerek sec ve fs_write/fs_edit araclariyla kendin uygula.',
          '- Her istekte once kullanicinin bilgi mi istedigini, yoksa bir isi uygulamani mi istedigini ayirt et. "X yap/olustur/ekle/duzelt" gibi uygulama isteklerini genel nasil-yapilir cevabina cevirme.',
          '- Ornek: "Blog web sitesi yap" denirse hosting veya HTML hakkinda tavsiye verip durma. Once fs_list ile calisma alanini incele; mevcut yapiya uy. Proje bossa kucuk, calisir ve mobil uyumlu bir blog baslangici olusturmak icin fs_write araclarini kullan; sonra dosyalari dogrula.',
          '- Arac gerektiren bir istege, araci cagirip sonucunu almadan yalnizca nasil yapilacagini anlatarak veya tamamlanmis gibi yanit vererek sonlandirma.',
          '- Yeni dosya icin fs_write kullan; ust klasorler otomatik olusturulur. Var olan dosyayi ezmek onay gerektiriyorsa onay iste ve sonucu bekle.',
          '- Dosya veya kodla ilgili bir görevde dosya içeriğini tahmin etme; dosya araçlarını kullan.',
          '- Önce fs_list veya fs_glob ile ilgili dosyayı bul, sonra fs_read ile içeriğini oku.',
          '- Uygula, ardından fs_read veya uygun salt-okunur komutla degisikligi dogrula. Uygun test/build/lint varsa calistir.',
          '- Arac hata verirse hatayi acikca bildir; yapilmamis isi tamamlanmis gibi gosterme.',
          '- Dosya aracı yollarını çalışma alanına göreli ver; çalışma alanının kökünü listelemek için fs_list yolunu "." kullan.'
        ]
      : [])
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
                    '[SİSTEM] Bu bir uygulama isteği. Önceki yanıtın hiçbir araç çağrısı içermedi ve işi tamamlamadı. Mevcut araçlardan uygun olanları şimdi çağır; kod/proje görevi ise önce ilgili dosyaları incele, ardından istenen değişikliği uygula ve doğrula. Araç sonucu almadan tamamlandığını söyleme.'
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
          '[SİSTEM] Bu turda araç çağırma. Elindeki bağlam ve araç sonuçlarına dayanarak kullanıcının isteğini gerçekten yanıtla. Kullanıcının dilini ve konuşmanın tonunu koru; doğrudan başla, gerektiği kadar ayrıntı ver ve yararlı olduğunda kısa başlıklar veya adımlar kullan. Yapılmamış bir işi tamamlandı gibi gösterme; belirsizlikleri ve doğrulanmamış noktaları açıkça belirt. Gereksiz yetenek tanıtımı, genel tavsiye ve tekrar ekleme.'
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
      presenter.error(`model indirilemedi: ${err.message}`);
      return false;
    } finally {
      presenter.setBusy(false);
      presenter.setInfo({ status: mode });
    }
  }

  async function handleCommand(input) {
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
      presenter.note(COMMAND_HELP);
      return;
    }

    if (['new', 'yeni'].includes(cmd)) {
      startNewConversation();
      return;
    }

    if (['history', 'geçmiş', 'gecmis'].includes(cmd)) {
      if (!historyFile) {
        presenter.note('sohbet geçmişi yalnızca etkileşimli oturumlarda kullanılabilir.');
        return;
      }
      if (!arg) {
        if (!conversations.length) {
          presenter.note('kayıtlı sohbet geçmişi yok.');
          return;
        }
        presenter.note(
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
        presenter.error(`geçerli bir sohbet numarası girin: 1-${conversations.length}`);
        return;
      }
      const selectedId = conversations[selection - 1].id;
      persistConversation();
      conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      currentConversation = conversations.find((conversation) => conversation.id === selectedId);
      messages = [{ role: 'system', content: systemPrompt }].concat(currentConversation.messages);
      presenter.reset();
      presenter.restoreConversation(messages.slice(1));
      presenter.note(`sohbet yüklendi: ${currentConversation.title || 'başlıksız sohbet'}`);
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
          presenter.error(`model listesi alınamadı: ${err.message}`);
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
          presenter.note(
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
      presenter.note(`model: ${cfg.model}`);
      return;
    }

    if (['project', 'proje', 'memory', 'hafıza'].includes(cmd)) {
      try {
        cfg.projectContext = projectContext.refreshProjectMemory(cfg);
      } catch (_) {
        cfg.projectContext = projectContext.readProjectMemory(cfg);
      }
      refreshSystem();
      presenter.note(projectContext.buildProjectMemoryText(cfg.projectContext));
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
      presenter.note(lines.join('\n'));
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
        presenter.note('İnceleme sonucu: belirgin risk veya teknik borç bulunamadı.');
        return;
      }
      presenter.note(['Olası riskler:', ...issues.map((issue) => `- ${issue}`)].join('\n'));
      return;
    }

    if (cmd === 'usage' || cmd === 'kullanım' || cmd === 'kullanim') {
      const total = sessionUsage.promptTokens + sessionUsage.outputTokens;
      const tokenText = sessionUsage.latestEstimated ? 'tahmini üretim hızı' : 'son üretim hızı';
      const details = [
        `oturum tokenı: ${total.toLocaleString('tr-TR')} (girdi ${sessionUsage.promptTokens.toLocaleString('tr-TR')} · çıktı ${sessionUsage.outputTokens.toLocaleString('tr-TR')})`,
        `${tokenText}: ${sessionUsage.latestRate.toLocaleString('tr-TR')} token/dk`
      ];
      presenter.note(details.join('\n'));
      return;
    }

    if (['tools', 'araçlar', 'araclar'].includes(cmd)) {
      presenter.note(
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
      presenter.note(`mod: ${mode}`);
      return;
    }

    if (['mode', 'mod', 'plan', 'build'].includes(cmd)) {
      const requested = ['plan', 'build'].includes(cmd) ? cmd : arg.toLowerCase();
      if (!['plan', 'build'].includes(requested)) {
        presenter.error('kullanım: /mode plan veya /mode build');
        return;
      }
      switchMode(requested);
      return;
    }

    if (cmd === 'prompt') {
      presenter.note(`# ${cfg.systemPromptPath}\n${systemPromptBase}`);
      return;
    }

    if (['reload', 'yenile'].includes(cmd)) {
      systemPromptBase = loadSystemPrompt(cfg);
      refreshSystem();
      presenter.note('sistem promptu yeniden yüklendi.');
      return;
    }

    if (cmd === 'workspace') {
      if (!arg) {
        presenter.note(`workspace: ${cfg.workspace}`);
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
        presenter.error(`dizin bulunamadı: ${target}`);
        return;
      }
      cfg.workspace = target;
      refreshSystem();
      presenter.setInfo({ cwd: cfg.workspace });
      presenter.note(`workspace: ${cfg.workspace}`);
      return;
    }

    if (['temp', 'temperature', 'sıcaklık', 'sicaklik'].includes(cmd)) {
      if (!arg) {
        presenter.note(`temperature: ${cfg.temperature}`);
        return;
      }
      const value = Number(arg);
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        presenter.error('geçerli bir değer girin: 0 ile 2 arasında');
        return;
      }
      cfg.temperature = value;
      presenter.note(`temperature: ${cfg.temperature}`);
      return;
    }

    if (['approve', 'onay'].includes(cmd)) {
      if (!arg) {
        presenter.note(`işlem onayı: ${cfg.approveDestructive ? 'açık' : 'kapalı'}`);
        return;
      }
      const value = arg.toLowerCase();
      cfg.approveDestructive = ['on', '1', 'true', 'açık', 'acik', 'evet', 'e'].includes(value);
      refreshSystem();
      presenter.note(
        `yıkıcı işlem onayı: ${cfg.approveDestructive ? 'açık' : 'kapalı'}`
      );
      return;
    }

    if (['clear', 'temizle', 'reset'].includes(cmd)) {
      startNewConversation();
      presenter.setNotice('sohbet temizlendi');
      return;
    }

    presenter.error(`bilinmeyen komut: /${cmd}`);
  }

  async function handleInput(text) {
    const input = String(text == null ? '' : text).trim();
    if (!input || exiting) return;

    if (input.startsWith('/')) {
      await handleCommand(input);
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
