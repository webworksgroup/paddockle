/*
 * i18n.js — gestion des langues.
 *
 * Les textes sont dans lang/fr.json, lang/en.json...
 * Dans le HTML, un élément avec data-i18n="cle" reçoit le texte de "cle".
 * data-i18n-attr="placeholder:cle1;aria-label:cle2" traduit des attributs.
 */
(function () {
  'use strict';

  var config = window.PADDOCKLE_CONFIG;
  var current = null;
  var dict = {};
  var cache = {};

  function detectLang() {
    var saved = window.PdkStorage.getLang();
    if (saved && config.LANGUAGES.indexOf(saved) !== -1) return saved;
    var prefs = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < prefs.length; i++) {
      var code = String(prefs[i]).slice(0, 2).toLowerCase();
      if (config.LANGUAGES.indexOf(code) !== -1) return code;
    }
    return config.FALLBACK_LANGUAGE;
  }

  function load(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);
    return fetch('lang/' + lang + '.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('lang ' + lang);
        return r.json();
      })
      .then(function (data) {
        cache[lang] = data;
        return data;
      });
  }

  // Remplace {variable} par sa valeur. {name} = nom du jeu, toujours dispo.
  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, function (m, name) {
      if (vars && Object.prototype.hasOwnProperty.call(vars, name)) return String(vars[name]);
      if (name === 'name') return config.GAME_NAME;
      return m;
    });
  }

  function t(key, vars) {
    var text = dict[key];
    if (text === undefined) text = key;
    return fill(text, vars);
  }

  // Singulier / pluriel : cherche "cle_one" ou "cle_other".
  function tCount(key, count, vars) {
    var rule = 'other';
    try { rule = new Intl.PluralRules(current).select(count); } catch (e) { /* ignoré */ }
    var k = dict[key + '_' + rule] !== undefined ? key + '_' + rule : key + '_other';
    var all = { count: formatNumber(count) };
    if (vars) Object.keys(vars).forEach(function (v) { all[v] = vars[v]; });
    return t(k, all);
  }

  function formatNumber(n) {
    try { return new Intl.NumberFormat(current).format(n); } catch (e) { return String(n); }
  }

  function apply(root) {
    var scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        if (parts.length === 2) el.setAttribute(parts[0].trim(), t(parts[1].trim()));
      });
    });
    scope.querySelectorAll('[data-game-name]').forEach(function (el) {
      el.textContent = config.GAME_NAME;
    });
    document.documentElement.lang = current;
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang') === current ? 'true' : 'false');
    });
  }

  function setLang(lang) {
    if (config.LANGUAGES.indexOf(lang) === -1) lang = config.FALLBACK_LANGUAGE;
    return load(lang).then(function (data) {
      current = lang;
      dict = data;
      window.PdkStorage.setLang(lang);
      apply();
      document.dispatchEvent(new CustomEvent('pdk:lang', { detail: lang }));
      return lang;
    });
  }

  function init() {
    var lang = detectLang();
    return setLang(lang).catch(function () {
      return setLang(config.FALLBACK_LANGUAGE);
    });
  }

  window.PdkI18n = {
    init: init,
    t: t,
    tCount: tCount,
    setLang: setLang,
    apply: apply,
    formatNumber: formatNumber,
    lang: function () { return current; }
  };
})();
