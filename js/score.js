/*
 * score.js — distance, points et pastilles.
 * Aucun accès réseau ici : uniquement des calculs.
 */
(function () {
  'use strict';

  var EARTH_RADIUS_KM = 6371;

  // Repères imposés : [distance en km, points sur 100].
  var ANCHORS = [
    [25, 100],
    [800, 70],
    [3000, 40],
    [8000, 15],
    [20000, 0]
  ];

  // Multiplicateur de chaque question (Q1 à Q5). Total max = 1000.
  var MULTIPLIERS = { 1: 1, 2: 1.5, 3: 2, 4: 2.5, 5: 3 };

  function toRad(deg) { return deg * Math.PI / 180; }

  // Distance "à vol d'oiseau" sur la Terre (formule de haversine).
  function distanceKm(lat1, lng1, lat2, lng2) {
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Courbe lisse qui passe exactement par les repères, sans jamais remonter
  // (interpolation "monotone" de Fritsch-Carlson). Calculée une seule fois.
  var slopes = (function () {
    var n = ANCHORS.length;
    var d = [];
    var m = [];
    var i;
    for (i = 0; i < n - 1; i++) {
      d.push((ANCHORS[i + 1][1] - ANCHORS[i][1]) / (ANCHORS[i + 1][0] - ANCHORS[i][0]));
    }
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) {
        m[i] = 0;
      } else {
        var h0 = ANCHORS[i][0] - ANCHORS[i - 1][0];
        var h1 = ANCHORS[i + 1][0] - ANCHORS[i][0];
        var w1 = 2 * h1 + h0;
        var w2 = h1 + 2 * h0;
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    return m;
  })();

  // Points de base (0 à 100, nombre entier) pour une distance donnée.
  function basePoints(km) {
    if (km <= ANCHORS[0][0]) return 100;
    var last = ANCHORS[ANCHORS.length - 1];
    if (km >= last[0]) return 0;
    for (var i = 0; i < ANCHORS.length - 1; i++) {
      var x0 = ANCHORS[i][0];
      var x1 = ANCHORS[i + 1][0];
      if (km <= x1) {
        var h = x1 - x0;
        var t = (km - x0) / h;
        var t2 = t * t;
        var t3 = t2 * t;
        var y = (2 * t3 - 3 * t2 + 1) * ANCHORS[i][1] +
          (t3 - 2 * t2 + t) * h * slopes[i] +
          (-2 * t3 + 3 * t2) * ANCHORS[i + 1][1] +
          (t3 - t2) * h * slopes[i + 1];
        return Math.max(0, Math.min(100, Math.round(y)));
      }
    }
    return 0;
  }

  function multiplier(questionNumber) {
    return MULTIPLIERS[questionNumber] || 1;
  }

  // Points réellement gagnés = points de base × multiplicateur, arrondis.
  function questionPoints(base, questionNumber) {
    return Math.round(base * multiplier(questionNumber));
  }

  // Pastille selon les points de base (sur 100).
  function badge(base) {
    if (base >= 90) return '🟢';
    if (base >= 60) return '🟡';
    if (base >= 30) return '🟠';
    if (base >= 1) return '🔴';
    return '⚫';
  }

  window.PdkScore = {
    distanceKm: distanceKm,
    basePoints: basePoints,
    multiplier: multiplier,
    questionPoints: questionPoints,
    badge: badge,
    MAX_SCORE: 1000
  };
})();
