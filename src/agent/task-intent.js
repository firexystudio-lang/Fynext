'use strict';

const ACTION_REQUEST =
  /\b(?:build|implement|add|fix|edit|update|change|remove|delete|rename|move|create|generate|write|run|execute|test|install|configure|refactor|migrate|search|inspect|review|analyze|analyse|summarize|summarise|check|verify|open|read|list|fetch|scan|debug|solve|reproduce|optimize|profile|audit|look\s+(?:at|into))\b/;

const TURKISH_ACTION_REQUEST =
  /\b(?:yap(?:abilir|abilirsin|abiliriz|ar|arim|in|alim|iver)?|olustur(?:abilir|alim|un|ur\s+musun)?|ekle(?:yebilir|yin|r\s+misin|yelim)?|duzelt(?:ebilir|ir|in|ir\s+misin|elim)?|degistir(?:ebilir|ir|in|ir\s+misin|elim)?|duzenle(?:yebilir|yin|r\s+misin|yelim)?|sil(?:ebilir|in|er\s+misin|elim)?|tasi(?:yabilir|yin|r\s+misin|yalim)?|kur(?:abilir|ar|un|ar\s+misin|alim)?|calistir(?:abilir|alim|in|ir\s+misin)?|test\s+(?:et|eder|edebilir|edelim|eder\s+misin)|kontrol\s+(?:et|eder|edebilir|edelim|eder\s+misin)|ara(?:r|yabilir|yalim|r\s+misin)?|tara(?:yabilir|yabilirsin|yabiliriz|yalim)?|arastir(?:abilir|ir|alim|ir\s+misin)?|incele(?:yebilir|yebilirsin|yabiliriz|ir|yelim|r\s+misin)?|bak(?:abilir|ar|alim|ar\s+misin|sana)?|bul(?:abilir|ur|alim|ur\s+musun)?|goster(?:ebilir|ir|elim|ir\s+misin)?|listele(?:yebilir|yin|yelim)?|uygula(?:yabilir|yalim|r\s+misin)?|coz(?:ebilir|er|elim|er\s+misin)?|hallet(?:ebilir|ebilirsin|ebiliriz|elim|er\s+misin)?|oner(?:i|iler)?\s+ver|optimize\s+et|refactor\s+et|entegre\s+et)\b/;

const INFORMATION_REQUEST =
  /^(?:how\b|what\b|why\b|when\b|where\b|who\b|which\b|nasil\b|neden\b|niye\b|ne\b|hangi\b|acikla\b|anlat\b|explain\b|describe\b|teach\b|show\s+me\s+how\b|walk\s+me\s+through\b|should\s+i\b|should\s+we\b|can\s+i\b|could\s+i\b)|^(?:can|could|would)\s+you\s+(?:explain|describe|teach|show\s+me\s+how)\b/;

const WORKSPACE_REFERENCE =
  /\b(?:(?:this|these|my|our|the)\s+(?:project|repo|repository|workspace|codebase|code|files?|tests?|bug|error|issue|app|application|component|function|module|script|api|endpoint|server)|(?:in|within|from)\s+(?:this|my|the)\s+(?:project|repo|repository|workspace|codebase|code|files?|tests?|component|module)|(?:bu|su)\s+(?:proje|repo|kod|dosya|test|hata|uygulama|fonksiyon|bilesen|modul|endpoint|api)\w*|(?:projemi|projeyi|projemde|projeme|projem|repomu|repoyu|repoda|kodumu|kodda|dosyalarimi|dosyalari|dosyada|testleri|testlerde|hatayi|hatalar|hatalari|fonksiyonu|bileseni))\b/;

const DEEP_INSPECTION_REQUEST =
  /\b(?:summari[sz](?:e|ation|ing)?|summar(?:y|ies)|overview|review|audit|analy[sz](?:e|ing|is)?|inspect|scan|read|explain|describe|understand|ozet(?:le|i|ini)?|incele(?:me|mek)?|tara|oku(?:mak)?|analiz(?:le|i)?|acikla|degerlendir)\b/;

const IMPLEMENTATION_REQUEST =
  /\b(?:build|implement|add|fix|edit|update|change|remove|delete|rename|move|create|generate|write|refactor|migrate|configure|install|upgrade|improve|enhance|optimize|patch|repair|rewrite|convert|debug)\b/;

const TURKISH_IMPLEMENTATION_REQUEST =
  /\b(?:yap(?:abilir|abilirsin|abiliriz|ar|arim|in|alim)?|olustur(?:abilir|alim|un|ur\s+musun)?|ekle(?:yebilir|yin|r\s+misin|yelim)?|duzelt(?:ebilir|ir|in|ir\s+misin|elim)?|degistir(?:ebilir|ir|in|ir\s+misin|elim)?|duzenle(?:yebilir|yin|r\s+misin|yelim)?|sil(?:ebilir|in|er\s+misin|elim)?|tasi(?:yabilir|yin|r\s+misin|yalim)?|kur(?:abilir|ar|un|ar\s+misin|alim)?|guncelle(?:ebilir|ir|yelim)?|yaz(?:abilir|in|mak|ar\s+misin)?|coz(?:ebilir|er|elim|er\s+misin)?|hallet(?:ebilir|ebilirsin|ebiliriz|elim|er\s+misin)?|gelistir(?:ebilir|ir|elim)?|iyilestir(?:ebilir|ir|elim)?|onar(?:abilir|ir|alim)?|kodla(?:yabilir|yalim)?|entegre\s+et|refactor\s+et|optimize\s+et)\b/;

const WEB_CONTEXT =
  /\b(?:web|webde|internet|internette|online|website|sites?|sources?|kaynak(?:lar)?|url|link|docs|dokuman|dokumantasyon|changelog|surum|version)\b/;

const WEB_SEARCH_ACTION =
  /\b(?:search\w*|look\s+up|research\w*|find\w*|ara\w*|arastir\w*|bul\w*|fetch\w*|open\w*|visit\w*|oku\w*|ac\w*)\b/;

// Detects unfulfilled tool promises in AI response text (e.g. "Web araması yapacağım", "Let me search the web")
const UNFULFILLED_WEB_SEARCH_PROMISE =
  /\b(?:(?:web(?:de)?\s*(?:arama|ara\w*)|internette?\s*(?:arastir\w*|ara\w*))\s*(?:yap\w*|ed\w*|bak\w*)|(?:web\s*aramasi|internette\s*arastirma)\s*(?:yap\w*|ed\w*)|(?:arastir\w*|bak\w*)\s*(?:donecegim|soyleyecegim|geleyim|yapacagim)|(?:i\s+will|let\s+me|going\s+to)\s+(?:search\s+(?:the\s+)?web|look\s+up\s+online|search\s+online|check\s+(?:the\s+)?docs|browse\s+(?:the\s+)?web)|searching\s+(?:the\s+)?web|looking\s+up\s+online)\b/i;

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0131\u0130]/g, 'i')
    .toLowerCase()
    .trim();
}

function requiresToolFollowThrough(text) {
  const normalized = normalize(text);
  if (!normalized) return false;
  if (requiresWebSearch(text)) return true;
  if (requiresWorkspaceInspection(text)) return true;
  if (INFORMATION_REQUEST.test(normalized)) {
    const hasFailingOrErrorContext = /\b(?:failing|fails|failed|error|broken|crash|patliyor|calismiyor|hata|patladi|coktu)\b/.test(normalized);
    const hasCodeContext = /\b(?:tests?|kod|dosya|file|function|fonksiyon|build|server|api)\b/.test(normalized);
    if (hasFailingOrErrorContext && hasCodeContext) {
      return true;
    }
    return false;
  }
  return ACTION_REQUEST.test(normalized) || TURKISH_ACTION_REQUEST.test(normalized);
}

function requiresWebSearch(text) {
  const normalized = normalize(text);
  if (!normalized) return false;
  if (/^explain\s+what\s+web\s+search\s+is\b/i.test(normalized)) return false;

  // Explicit search actions with web context always trigger web search
  const hasWebContext = WEB_CONTEXT.test(normalized);
  const hasSearchAction = WEB_SEARCH_ACTION.test(normalized);
  if (hasWebContext && hasSearchAction) {
    if (INFORMATION_REQUEST.test(normalized)) {
      // If it's a pure definitional question like "what is a website?", don't search
      if (/^(?:what\s+is|what\s+are|nedir)\s+(?:a\s+|an\s+|the\s+)?(?:web|website|internet)\b/i.test(normalized)) {
        return false;
      }
      return true;
    }
    return true;
  }
  return false;
}

function promisesWebSearch(text) {
  if (!text || typeof text !== 'string') return false;
  // If the model already produced substantial code or markdown fences, it's not an empty announcement
  if (text.includes('```') || text.length > 400) return false;
  const normalized = normalize(text);
  // Guard against coding tasks that mention web components, UI, pages, or search bars
  if (/\b(?:bilesen|component|sayfa|page|form|buton|button|arayuz|ui|input|kod|file|dosya|html|css|react)\b/.test(normalized)) {
    return false;
  }
  return UNFULFILLED_WEB_SEARCH_PROMISE.test(normalized);
}

function requiresWorkspaceInspection(text) {
  return WORKSPACE_REFERENCE.test(normalize(text));
}

function minimumInspectionReads(text) {
  return DEEP_INSPECTION_REQUEST.test(normalize(text)) ? 3 : 1;
}

function requiresImplementation(text) {
  const normalized = normalize(text);
  if (!normalized || INFORMATION_REQUEST.test(normalized)) {
    return false;
  }

  const asksToImplement = IMPLEMENTATION_REQUEST.test(normalized) || TURKISH_IMPLEMENTATION_REQUEST.test(normalized);
  if (!asksToImplement) {
    return false;
  }

  return !DEEP_INSPECTION_REQUEST.test(normalized);
}

module.exports = {
  requiresToolFollowThrough,
  requiresWebSearch,
  promisesWebSearch,
  requiresWorkspaceInspection,
  minimumInspectionReads,
  requiresImplementation
};
