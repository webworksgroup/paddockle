/*
 * app.js — le "chef d'orchestre" : enchaîne les écrans du jeu.
 *
 *  chargement → accueil → 5 questions sur le globe → écran de fin
 *  (ou "pas de défi aujourd'hui", ou "erreur de connexion")
 */
(function () {
  'use strict';

  var config = window.PADDOCKLE_CONFIG;
  var Score = window.PdkScore;
  var Store = window.PdkStorage;
  var Api = window.PdkApi;
  var Globe = window.PdkGlobe;
  var I18n = window.PdkI18n;
  var t = I18n.t;

  var state = {
    screen: null,
    questions: [],
    date: null,
    game: null,          // { answers: [...], finished, submitted }
    index: 0,            // question en cours (0 à 4)
    phase: 'idle',       // 'question' = attend un toucher, 'result' = réponse affichée
    percentile: null,    // { players, percent } ou 'loading' / 'error'
    errorKind: 'network',
    loadedOn: null       // date UTC (AAAA-MM-JJ) du chargement du défi
  };

  // ---------- Petits outils ----------
  function $(id) { return document.getElementById(id); }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function show(screenId) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.hidden = s.id !== screenId;
    });
    state.screen = screenId;
    document.body.setAttribute('data-screen', screenId);
    window.scrollTo(0, 0);
  }

  function localized(q, field) {
    var lang = I18n.lang();
    return q[field + '_' + lang] || q[field + '_en'] || q[field + '_fr'] || '';
  }

  function formatKm(km) {
    return I18n.formatNumber(km < 10 ? Math.round(km * 10) / 10 : Math.round(km));
  }

  function longDate(iso) {
    try {
      return new Intl.DateTimeFormat(I18n.lang(), {
        day: 'numeric', month: 'long', timeZone: 'UTC'
      }).format(new Date(iso + 'T00:00:00Z'));
    } catch (e) {
      return iso;
    }
  }

  function shareDate(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    var monthShort = '';
    try {
      monthShort = new Intl.DateTimeFormat(I18n.lang(), { month: 'short', timeZone: 'UTC' }).format(d);
    } catch (e) { /* ignoré */ }
    return t('share_date_format', {
      d: d.getUTCDate(),
      dd: ('0' + d.getUTCDate()).slice(-2),
      mm: ('0' + (d.getUTCMonth() + 1)).slice(-2),
      monthShort: monthShort.replace('.', '')
    });
  }

  function totalScore() {
    return state.game.answers.reduce(function (sum, a) { return sum + a.points; }, 0);
  }

  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ---------- Compte à rebours jusqu'à minuit UTC ----------
  function nextMidnightUtc() {
    var now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  }

  function tickCountdown() {
    var ms = nextMidnightUtc() - Date.now();
    // Après minuit UTC, on propose de recharger pour le nouveau défi.
    var ready = state.loadedOn && state.loadedOn < Store.todayUtc();
    var s = Math.max(0, Math.floor(ms / 1000));
    var text = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(function (n) {
      return ('0' + n).slice(-2);
    }).join(':');
    document.querySelectorAll('[data-countdown]').forEach(function (el) {
      el.textContent = text;
    });
    document.querySelectorAll('[data-new-challenge]').forEach(function (el) {
      el.hidden = !ready;
    });
  }

  // ---------- Écrans simples ----------
  function showError(kind) {
    state.errorKind = kind || 'network';
    renderError();
    show('screen-error');
  }

  function renderError() {
    var k = state.errorKind;
    setText('error-title', t(k === 'config' ? 'config_title' : k === 'webgl' ? 'webgl_title' : 'error_title'));
    setText('error-text', t(k === 'config' ? 'config_text' : k === 'webgl' ? 'webgl_text' : 'error_text'));
    $('btn-retry').hidden = k === 'config';
  }

  function renderHome() {
    setText('home-date', t('home_kicker', { date: longDate(state.date) }));
    var started = state.game && state.game.answers.length > 0;
    setText('btn-play', t(started ? 'resume_button' : 'play_button'));
    var streak = Store.currentStreak(state.date);
    var streakEl = $('home-streak');
    streakEl.hidden = streak < 1;
    if (streak >= 1) streakEl.textContent = '🔥 ' + I18n.tCount('home_streak', streak);
  }

  // ---------- Partie ----------
  function startGame() {
    show('screen-game');
    var loader = $('globe-loading');
    loader.hidden = false;
    Globe.mount($('globe')).then(function () {
      loader.hidden = true;
      Globe.resize();
      showQuestion(state.game.answers.length);
    }).catch(function () {
      loader.hidden = true;
      showError('webgl');
    });
  }

  // Indique au globe quelle partie de l'écran n'est pas cachée.
  function frameGlobe() {
    var box = $('globe').getBoundingClientRect();
    var top = $('hud').getBoundingClientRect().bottom - box.top;
    var bottomEl = $('result').hidden ? $('tap-hint') : $('result');
    var bottom = bottomEl.getBoundingClientRect().top - box.top;
    if (bottom > top) Globe.frame(top, bottom);
  }

  function renderProgress() {
    var box = $('progress');
    box.textContent = '';
    state.questions.forEach(function (q, i) {
      var dot = document.createElement('span');
      dot.className = 'progress-dot';
      var a = state.game.answers[i];
      if (a) {
        dot.textContent = Score.badge(a.base);
        dot.classList.add('is-done');
      } else if (i === state.index) {
        dot.classList.add('is-current');
      }
      box.appendChild(dot);
    });
  }

  function renderQuestion() {
    var q = state.questions[state.index];
    if (!q) return;
    setText('q-number', t('q_label', { n: state.index + 1, total: state.questions.length }));
    setText('q-multiplier', '×' + I18n.formatNumber(Score.multiplier(q.numero)));
    setText('q-discipline', t('disc_' + q.discipline) === 'disc_' + q.discipline ? q.discipline : t('disc_' + q.discipline));
    setText('q-text', localized(q, 'texte'));
    setText('q-score', t('score_running', { score: I18n.formatNumber(totalScore()) }));
    renderProgress();
  }

  function showQuestion(i) {
    state.index = i;
    state.phase = 'question';
    $('result').hidden = true;
    $('tap-hint').hidden = false;
    renderQuestion();
    frameGlobe();
    if (i > 0) Globe.clear();
  }

  function onGlobeTap(coords) {
    if (state.screen !== 'screen-game' || state.phase !== 'question') return;
    var q = state.questions[state.index];
    if (!q) return;
    state.phase = 'result';

    var km = Score.distanceKm(coords.lat, coords.lng, q.latitude, q.longitude);
    var base = Score.basePoints(km);
    var answer = {
      lat: Math.round(coords.lat * 1000) / 1000,
      lng: Math.round(coords.lng * 1000) / 1000,
      km: Math.round(km * 10) / 10,
      base: base,
      points: Score.questionPoints(base, q.numero)
    };
    state.game.answers[state.index] = answer;
    Store.saveGame(state.date, state.game);

    if (navigator.vibrate) {
      try { navigator.vibrate(15); } catch (e) { /* ignoré */ }
    }

    Globe.showResult(coords, { lat: q.latitude, lng: q.longitude }, km);
    $('tap-hint').hidden = true;
    renderResult();
    $('result').hidden = false;
    renderQuestion();
    frameGlobe();
  }

  function renderResult() {
    var q = state.questions[state.index];
    var a = state.game.answers[state.index];
    if (!q || !a) return;
    setText('r-badge', Score.badge(a.base));
    setText('r-points', t('result_points', { points: I18n.formatNumber(a.points) }));
    setText('r-distance', t('result_distance', { km: formatKm(a.km) }));
    setText('r-place', q.lieu || '');
    setText('r-anecdote', localized(q, 'anecdote'));
    var last = state.index >= state.questions.length - 1;
    setText('btn-next', t(last ? 'see_score_button' : 'next_button'));
  }

  function next() {
    if (state.phase !== 'result') return;
    if (state.index < state.questions.length - 1) {
      showQuestion(state.index + 1);
    } else {
      finishGame();
    }
  }

  function finishGame() {
    state.phase = 'idle';
    state.game.finished = true;
    Store.saveGame(state.date, state.game);
    Store.recordFinishedGame(state.date, totalScore());
    showEnd();
  }

  // ---------- Écran de fin ----------
  function sendAndRank() {
    var score = totalScore();
    var send = Promise.resolve();
    if (!state.game.submitted && !Store.isOptedOut()) {
      send = Api.submitGame({
        playerId: Store.getPlayerId(),
        date: state.date,
        score: score,
        lang: I18n.lang()
      }).then(function () {
        state.game.submitted = true;
        Store.saveGame(state.date, state.game);
      }).catch(function () { /* on réessaiera à la prochaine visite */ });
    }
    state.percentile = 'loading';
    renderPercentile();
    send.then(function () {
      return Api.getPercentile(state.date, score);
    }).then(function (res) {
      state.percentile = res;
      renderPercentile();
    }).catch(function () {
      state.percentile = 'error';
      renderPercentile();
    });
  }

  function renderPercentile() {
    var p = state.percentile;
    var text;
    if (p === 'loading' || p === null) text = t('percent_loading');
    else if (p === 'error') text = t('percent_error');
    else if (p.players < config.MIN_PLAYERS_FOR_PERCENT || p.percent === null) text = t('percent_few');
    else text = t('percent_text', { percent: I18n.formatNumber(p.percent) });
    setText('end-percent', text);
  }

  function renderEnd() {
    var score = totalScore();
    setText('end-date', t('home_kicker', { date: longDate(state.date) }));
    setText('end-score', I18n.formatNumber(score));
    setText('end-badges', state.game.answers.map(function (a) { return Score.badge(a.base); }).join(''));
    renderPercentile();

    var stats = Store.getStats();
    setText('stat-streak', I18n.formatNumber(Store.currentStreak(state.date)));
    setText('stat-best', I18n.formatNumber(stats.bestScore));
    setText('stat-played', I18n.formatNumber(stats.played));

    var list = $('recap');
    list.textContent = '';
    state.questions.forEach(function (q, i) {
      var a = state.game.answers[i];
      if (!a) return;
      var li = document.createElement('li');
      var badge = document.createElement('span');
      badge.className = 'recap-badge';
      badge.textContent = Score.badge(a.base);
      var main = document.createElement('span');
      main.className = 'recap-main';
      var place = document.createElement('strong');
      place.textContent = q.lieu || '';
      var meta = document.createElement('small');
      meta.textContent = t('q_label', { n: i + 1, total: state.questions.length }) + ' · ' +
        t('result_distance', { km: formatKm(a.km) });
      main.appendChild(place);
      main.appendChild(meta);
      var pts = document.createElement('span');
      pts.className = 'recap-points';
      pts.textContent = t('result_points', { points: I18n.formatNumber(a.points) });
      li.appendChild(badge);
      li.appendChild(main);
      li.appendChild(pts);
      list.appendChild(li);
    });
  }

  function showEnd() {
    Globe.sleep();
    renderEnd();
    show('screen-end');
    sendAndRank();
  }

  // ---------- Partage ----------
  function shareText() {
    return t('share_text', {
      date: shareDate(state.date),
      badges: state.game.answers.map(function (a) { return Score.badge(a.base); }).join(''),
      score: totalScore(),
      url: config.SITE_URL
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(area);
      if (ok) resolve(); else reject(new Error('copy'));
    });
  }

  function share() {
    var text = shareText();
    // Les deux sont lancés tout de suite, pendant le toucher du joueur :
    // certains téléphones refusent le partage s'il arrive plus tard.
    var copied = copyText(text);
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () { /* fenêtre fermée */ });
    }
    copied.then(function () {
      toast(t('share_copied'));
    }).catch(function () {
      if (!navigator.share) window.prompt(t('share_manual'), text);
    });
  }

  // ---------- Fenêtre "Pro" ----------
  function openPro() {
    var dialog = $('pro-dialog');
    $('pro-form').hidden = false;
    $('pro-success').hidden = true;
    $('pro-error').hidden = true;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closePro() {
    var dialog = $('pro-dialog');
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function submitPro(e) {
    e.preventDefault();
    var email = $('pro-email').value.trim();
    var consent = $('pro-consent').checked;
    var error = $('pro-error');
    error.hidden = true;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      error.textContent = t('pro_error_email');
      error.hidden = false;
      return;
    }
    if (!consent) {
      error.textContent = t('pro_error_consent');
      error.hidden = false;
      return;
    }
    var btn = $('pro-submit');
    btn.disabled = true;
    Api.joinProList(email, I18n.lang()).then(function () {
      $('pro-form').hidden = true;
      $('pro-success').hidden = false;
      $('pro-email').value = '';
      $('pro-consent').checked = false;
    }).catch(function () {
      error.textContent = t('pro_error_network');
      error.hidden = false;
    }).finally(function () {
      btn.disabled = false;
    });
  }

  // ---------- Changement de langue : on redessine l'écran visible ----------
  function rerender() {
    if (state.screen === 'screen-home') renderHome();
    if (state.screen === 'screen-error') renderError();
    if (state.screen === 'screen-game') {
      renderQuestion();
      if (state.phase === 'result') renderResult();
      frameGlobe();
    }
    if (state.screen === 'screen-end') renderEnd();
    document.title = t('meta_title');
  }

  // ---------- Chargement du défi du jour ----------
  function loadChallenge() {
    show('screen-loading');
    if (!Api.isConfigured()) {
      showError('config');
      return;
    }
    Globe.preload().catch(function () { /* réessayé au lancement de la partie */ });
    Api.getTodayQuestions().then(function (questions) {
      state.loadedOn = Store.todayUtc();
      if (!questions.length) {
        state.date = null;
        show('screen-empty');
        return;
      }
      state.questions = questions;
      state.date = questions[0].date_diffusion;
      state.game = Store.getGame(state.date) || { answers: [], finished: false, submitted: false };
      state.game.answers = (state.game.answers || []).filter(Boolean);

      if (state.game.finished || state.game.answers.length >= questions.length) {
        state.game.finished = true;
        showEnd();
      } else {
        renderHome();
        show('screen-home');
      }
    }).catch(function () {
      showError('network');
    });
  }

  // ---------- Démarrage ----------
  function bindEvents() {
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        I18n.setLang(btn.getAttribute('data-lang'));
      });
    });
    document.addEventListener('pdk:lang', rerender);

    $('btn-play').addEventListener('click', startGame);
    $('btn-retry').addEventListener('click', loadChallenge);
    $('btn-next').addEventListener('click', next);
    $('btn-share').addEventListener('click', share);
    document.querySelectorAll('[data-open-pro]').forEach(function (b) {
      b.addEventListener('click', openPro);
    });
    document.querySelectorAll('[data-close-pro]').forEach(function (b) {
      b.addEventListener('click', closePro);
    });
    document.querySelectorAll('[data-new-challenge]').forEach(function (b) {
      b.addEventListener('click', function () { window.location.reload(); });
    });
    $('pro-dialog').addEventListener('click', function (e) {
      if (e.target === this) closePro();
    });
    $('pro-form').addEventListener('submit', submitPro);

    Globe.onTap(onGlobeTap);
  }

  function start() {
    bindEvents();
    I18n.init().catch(function () { /* textes indisponibles : on continue */ }).then(function () {
      document.title = t('meta_title');
      tickCountdown();
      setInterval(tickCountdown, 1000);
      loadChallenge();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
