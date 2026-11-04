'use strict';

const ACTION_REQUEST =
  /\b(?:build|implement|add|fix|edit|update|change|remove|delete|rename|move|create|generate|write|run|execute|test|install|configure|refactor|migrate|search|inspect|review|analyze|analyse|summarize|summarise|check|verify|open|read|list|fetch|scan|look\s+(?:at|into))\b/;
const TURKISH_ACTION_REQUEST =
  /\b(?:yap(?:abilir|abilirsin|abiliriz|ar|arim|in)?|olustur(?:abilir|alim|un)?|ekle(?:yebilir|yin)?|duzelt(?:ebilir|ir|in)?|degistir(?:ebilir|ir|in)?|duzenle(?:yebilir|yin)?|sil(?:ebilir|in)?|tasi(?:yabilir|yin)?|kur(?:abilir|ar|un)?|calistir(?:abilir|alim|in)?|test\s+(?:et|eder)|kontrol\s+(?:et|eder)|ara(?:r|yabilir)?|tara(?:yabilir|yabilirsin|yabiliriz)?|arastir(?:abilir|ir)?|incele(?:yebilir|yebilirsin|yabiliriz|ir)?|bak(?:abilir|ar)?|bul(?:abilir|ur)?|goster(?:ebilir|ir)?|listele(?:yebilir|yin)?|uygula(?:yabilir)?|coz(?:ebilir|er)?|hallet(?:ebilir|ebilirsin|ebiliriz)?|oner(?:i|iler)?\s+ver)\b/;
const INFORMATION_REQUEST =
  /^(?:how\b|what\b|why\b|when\b|where\b|who\b|which\b|nasil\b|neden\b|niye\b|ne\b|hangi\b|acikla\b|anlat\b|explain\b|describe\b|teach\b|show\s+me\s+how\b|walk\s+me\s+through\b|should\s+i\b|should\s+we\b|can\s+i\b|could\s+i\b)|^(?:can|could|would)\s+you\s+(?:explain|describe|teach|show\s+me\s+how)\b/;
const WORKSPACE_REFERENCE =
  /\b(?:(?:this|these|my|our|the)\s+(?:project|repo|repository|workspace|codebase|code|files?|tests?|bug|error|issue|app|application)|(?:in|within|from)\s+(?:this|my|the)\s+(?:project|repo|repository|workspace|codebase|code|files?|tests?)|(?:bu|su)\s+(?:proje|repo|kod|dosya|test|hata|uygulama)\w*|(?:projemi|projeyi|projemde|projeme|projem|repomu|repoyu|repoda|kodumu|dosyalarimi))\b/;
const DEEP_INSPECTION_REQUEST =
  /\b(?:summari[sz](?:e|ation|ing)?|summar(?:y|ies)|overview|review|audit|analy[sz](?:e|ing|is)?|inspect|scan|read|explain|describe|understand|ozet(?:le|i|ini)?|incele(?:me|mek)?|tara|oku(?:mak)?|analiz(?:le|i)?|acikla|degerlendir)\b/;
const IMPLEMENTATION_REQUEST =
  /\b(?:build|implement|add|fix|edit|update|change|remove|delete|rename|move|create|generate|write|refactor|migrate|configure|install|upgrade|improve|enhance|optimize|patch|repair|rewrite|convert|debug)\b/;
const TURKISH_IMPLEMENTATION_REQUEST =
  /\b(?:yap(?:abilir|abilirsin|abiliriz|ar|arim|in)?|olustur(?:abilir|alim|un)?|ekle(?:yebilir|yin)?|duzelt(?:ebilir|ir|in)?|degistir(?:ebilir|ir|in)?|duzenle(?:yebilir|yin)?|sil(?:ebilir|in)?|tasi(?:yabilir|yin)?|kur(?:abilir|ar|un)?|guncelle(?:ebilir|ir)?|yaz(?:abilir|in|mak)?|coz(?:ebilir|er)?|hallet(?:ebilir|ebilirsin|ebiliriz)?|gelistir(?:ebilir|ir)?|iyilestir(?:ebilir|ir)?|onar(?:abilir|ir)?|duzenle(?:yebilir|yin)?)\b/;
const WEB_CONTEXT =
  /\b(?:web|webde|internet|internette|online|website|sites?|sources?|kaynak(?:lar)?|url|link)\b/;
const WEB_SEARCH_ACTION =
  /\b(?:search\w*|look\s+up|research\w*|find\w*|ara\w*|arastir\w*|bul\w*|fetch\w*|open\w*|visit\w*|oku\w*|ac\w*)\b/;

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
  return Boolean(normalized) &&
    (requiresWebSearch(text) ||
      requiresWorkspaceInspection(text) ||
      (!INFORMATION_REQUEST.test(normalized) &&
        (ACTION_REQUEST.test(normalized) || TURKISH_ACTION_REQUEST.test(normalized))));
}

function requiresWebSearch(text) {
  const normalized = normalize(text);
  return Boolean(normalized) &&
    !INFORMATION_REQUEST.test(normalized) &&
    WEB_CONTEXT.test(normalized) &&
    WEB_SEARCH_ACTION.test(normalized);
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
  requiresWorkspaceInspection,
  minimumInspectionReads,
  requiresImplementation
};
