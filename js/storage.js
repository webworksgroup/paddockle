/*
 * storage.js — ce que le site retient sur le téléphone du joueur
 * (stockage local du navigateur, aucun cookie, rien n'est envoyé).
 *
 *  - identifiant anonyme aléatoire
 *  - langue choisie
 *  - refus d'être compté dans les statistiques
 *  - série de jours joués et meilleur score
 *  - partie du jour en cours (pour reprendre après un rechargement)
 */
(function () {
  'use strict';

  var PREFIX = 'pdk_';
  var KEY_PLAYER = PREFIX + 'player_id';
  var KEY_LANG = PREFIX + 'lang';
  var KEY_OPTOUT = PREFIX + 'optout';
  var KEY_STATS = PREFIX + 'stats';
  var KEY_GAME = PREFIX + 'game_';

  // Le stockage peut être bloqué (navigation privée, réglages...) :
  // on ne doit jamais planter pour autant.
  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignoré */ }
  }
  function remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignoré */ }
  }
  function readJson(key) {
    var raw = read(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function writeJson(key, value) {
    write(key, JSON.stringify(value));
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function getPlayerId() {
    var id = read(KEY_PLAYER);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = randomId();
      write(KEY_PLAYER, id);
    }
    return id;
  }

  // Dates au format AAAA-MM-JJ, toujours en heure UTC.
  function addDays(isoDate, days) {
    var d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function todayUtc() {
    return new Date().toISOString().slice(0, 10);
  }

  function getStats() {
    var s = readJson(KEY_STATS) || {};
    return {
      lastDate: s.lastDate || null,
      streak: s.streak || 0,
      bestStreak: s.bestStreak || 0,
      bestScore: s.bestScore || 0,
      played: s.played || 0
    };
  }

  // Série affichée : elle tombe à 0 si le joueur a raté un jour.
  function currentStreak(referenceDate) {
    var s = getStats();
    if (!s.lastDate) return 0;
    var ref = referenceDate || todayUtc();
    if (s.lastDate === ref || s.lastDate === addDays(ref, -1)) return s.streak;
    return 0;
  }

  // À appeler une seule fois, quand une partie du jour est terminée.
  function recordFinishedGame(challengeDate, score) {
    var s = getStats();
    if (s.lastDate === challengeDate) return s;
    if (s.lastDate && s.lastDate === addDays(challengeDate, -1)) {
      s.streak += 1;
    } else {
      s.streak = 1;
    }
    s.lastDate = challengeDate;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.bestScore = Math.max(s.bestScore, score);
    s.played += 1;
    writeJson(KEY_STATS, s);
    return s;
  }

  function getGame(challengeDate) {
    return readJson(KEY_GAME + challengeDate);
  }

  function saveGame(challengeDate, game) {
    writeJson(KEY_GAME + challengeDate, game);
    cleanOldGames(challengeDate);
  }

  // On ne garde que la partie du jour et celle de la veille.
  function cleanOldGames(challengeDate) {
    var keep = [KEY_GAME + challengeDate, KEY_GAME + addDays(challengeDate, -1)];
    try {
      var toRemove = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(KEY_GAME) === 0 && keep.indexOf(k) === -1) toRemove.push(k);
      }
      toRemove.forEach(remove);
    } catch (e) { /* ignoré */ }
  }

  window.PdkStorage = {
    getPlayerId: getPlayerId,
    getLang: function () { return read(KEY_LANG); },
    setLang: function (lang) { write(KEY_LANG, lang); },
    isOptedOut: function () { return read(KEY_OPTOUT) === '1'; },
    setOptOut: function (value) { if (value) write(KEY_OPTOUT, '1'); else remove(KEY_OPTOUT); },
    getStats: getStats,
    currentStreak: currentStreak,
    recordFinishedGame: recordFinishedGame,
    getGame: getGame,
    saveGame: saveGame,
    addDays: addDays,
    todayUtc: todayUtc
  };
})();
