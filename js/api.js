/*
 * api.js — échanges avec la base de données Supabase.
 *
 * On utilise de simples requêtes web (fetch) au lieu de la librairie
 * Supabase : c'est ~150 Ko de moins à charger pour le joueur.
 * Les règles d'accès (qui peut lire / écrire quoi) sont appliquées
 * par Supabase lui-même, pas ici.
 */
(function () {
  'use strict';

  var config = window.PADDOCKLE_CONFIG;
  var TIMEOUT_MS = 10000;

  function isConfigured() {
    return /^https:\/\/.+/.test(config.SUPABASE_URL) &&
      config.SUPABASE_URL.indexOf('VOTRE-PROJET') === -1 &&
      config.SUPABASE_KEY && config.SUPABASE_KEY.indexOf('VOTRE-CLE') === -1;
  }

  function headers(extra) {
    var h = {
      'apikey': config.SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
    // Les anciennes clés "anon" (format JWT, commencent par eyJ) doivent
    // aussi être envoyées dans l'en-tête Authorization.
    if (config.SUPABASE_KEY.indexOf('eyJ') === 0) {
      h['Authorization'] = 'Bearer ' + config.SUPABASE_KEY;
    }
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  function request(path, options) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    var opts = options || {};
    if (controller) opts.signal = controller.signal;
    var base = config.SUPABASE_URL.replace(/\/+$/, '');
    return fetch(base + path, opts).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  // Questions du jour. Supabase ne renvoie QUE celles de la date UTC du
  // jour (règle d'accès côté base). Liste vide = pas de défi aujourd'hui.
  function getTodayQuestions() {
    var fields = 'date_diffusion,numero,discipline,texte_fr,texte_en,latitude,longitude,lieu,anecdote_fr,anecdote_en';
    return request('/rest/v1/questions?select=' + fields + '&order=numero.asc', {
      method: 'GET',
      headers: headers()
    }).then(function (r) {
      if (!r.ok) throw new Error('questions ' + r.status);
      return r.json();
    }).then(function (rows) {
      return (rows || []).filter(function (q) {
        return q && q.numero >= 1 && q.numero <= 5 &&
          isFinite(q.latitude) && isFinite(q.longitude);
      });
    });
  }

  // Enregistre une partie terminée. Un même joueur ne peut enregistrer
  // qu'une partie par jour : un doublon (code 409) est considéré comme OK.
  function submitGame(game) {
    return request('/rest/v1/parties', {
      method: 'POST',
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        joueur_id: game.playerId,
        date_defi: game.date,
        score: game.score,
        langue: game.lang
      })
    }).then(function (r) {
      if (r.ok || r.status === 409) return true;
      throw new Error('parties ' + r.status);
    });
  }

  // Demande à Supabase "combien de joueurs ont fait moins que ce score
  // aujourd'hui", sans jamais recevoir les scores des autres.
  function getPercentile(date, score) {
    return request('/rest/v1/rpc/pourcentage_battus', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_date: date, p_score: score })
    }).then(function (r) {
      if (!r.ok) throw new Error('percentile ' + r.status);
      return r.json();
    }).then(function (data) {
      // La fonction renvoie { joueurs: N, pourcentage: X }.
      var row = Array.isArray(data) ? data[0] : data;
      return {
        players: row && row.joueurs ? Number(row.joueurs) : 0,
        percent: row && row.pourcentage !== null && row.pourcentage !== undefined ? Number(row.pourcentage) : null
      };
    });
  }

  // Inscription à la liste "Pro". Un email déjà inscrit (409) = succès,
  // pour ne pas révéler qui est déjà dans la liste.
  function joinProList(email, lang) {
    return request('/rest/v1/liste_pro', {
      method: 'POST',
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ email: email, langue: lang, consentement: true })
    }).then(function (r) {
      if (r.ok || r.status === 409) return true;
      throw new Error('liste_pro ' + r.status);
    });
  }

  window.PdkApi = {
    isConfigured: isConfigured,
    getTodayQuestions: getTodayQuestions,
    submitGame: submitGame,
    getPercentile: getPercentile,
    joinProList: joinProList
  };
})();
