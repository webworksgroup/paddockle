/*
 * globe.js — le globe 3D (librairie globe.gl).
 *
 * Choix pour rester léger et fluide sur un petit téléphone :
 *  - la librairie et les frontières sont chargées seulement quand on en a
 *    besoin, puis gardées en mémoire par le navigateur ;
 *  - pas de photo satellite : une sphère unie + les pays dessinés ;
 *  - résolution limitée sur les écrans très denses ;
 *  - le globe arrête de se redessiner quand personne ne le touche.
 *
 * Toucher court = réponse. Glisser / pincer = tourner / zoomer.
 */
(function () {
  'use strict';

  var LIB_URL = 'vendor/globe.gl.min.js';
  var BORDERS_URL = 'vendor/countries-110m.geojson';

  var COLORS = {
    ocean: '#0b1d33',
    land: '#2f4258',
    border: '#9fb4cc',
    atmosphere: '#4da3ff',
    arcFrom: '#ffd21f',
    arcTo: '#2ee27a'
  };

  // Un "toucher" = doigt qui bouge de moins de 10 px, en moins de 0,6 s.
  var TAP_MAX_MOVE_PX = 10;
  var TAP_MAX_DURATION_MS = 600;
  var IDLE_PAUSE_MS = 3000;
  var START_VIEW = { lat: 30, lng: 10, altitude: 2.3 };

  var libPromise = null;
  var bordersPromise = null;
  var globe = null;
  var container = null;
  var tapHandler = null;
  var idleTimer = null;
  var paused = false;
  var guessEl = null;
  var answerEl = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('script ' + src)); };
      document.head.appendChild(s);
    });
  }

  // Lance le téléchargement en avance (appelé dès l'écran d'accueil).
  function preload() {
    if (!libPromise) {
      libPromise = window.Globe ? Promise.resolve() : loadScript(LIB_URL);
    }
    if (!bordersPromise) {
      bordersPromise = fetch(BORDERS_URL).then(function (r) {
        if (!r.ok) throw new Error('borders');
        return r.json();
      });
    }
    return Promise.all([libPromise, bordersPromise]);
  }

  function makeMarker(className) {
    var el = document.createElement('div');
    el.className = 'globe-marker ' + className;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  // ---- Économie de batterie : on met en pause quand rien ne bouge ----
  function wake(ms) {
    if (!globe) return;
    if (paused) {
      globe.resumeAnimation();
      paused = false;
    }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (globe) {
        globe.pauseAnimation();
        paused = true;
      }
    }, (ms || 0) + IDLE_PAUSE_MS);
  }

  // ---- Différence entre un toucher (réponse) et un glissement ----
  function setupTapDetection(el) {
    var pointers = {};
    var count = 0;
    var start = null;
    var multi = false;

    el.addEventListener('pointerdown', function (e) {
      wake();
      pointers[e.pointerId] = true;
      count = Object.keys(pointers).length;
      if (count === 1) {
        start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
        multi = false;
      } else {
        multi = true;
      }
    }, true);

    el.addEventListener('pointermove', function (e) {
      if (count > 0) wake();
      if (start && e.pointerId === start.id) {
        var dx = e.clientX - start.x;
        var dy = e.clientY - start.y;
        if (dx * dx + dy * dy > TAP_MAX_MOVE_PX * TAP_MAX_MOVE_PX) start.moved = true;
      }
    }, true);

    function end(e, cancelled) {
      delete pointers[e.pointerId];
      count = Object.keys(pointers).length;
      if (!start || e.pointerId !== start.id) return;
      var s = start;
      start = null;
      if (cancelled || multi || s.moved) return;
      if (e.button !== undefined && e.button > 0) return;
      if (Date.now() - s.t > TAP_MAX_DURATION_MS) return;
      var dx = e.clientX - s.x;
      var dy = e.clientY - s.y;
      if (dx * dx + dy * dy > TAP_MAX_MOVE_PX * TAP_MAX_MOVE_PX) return;
      var rect = el.getBoundingClientRect();
      var coords = globe.toGlobeCoords(e.clientX - rect.left, e.clientY - rect.top);
      if (coords && tapHandler) tapHandler({ lat: coords.lat, lng: coords.lng });
    }

    el.addEventListener('pointerup', function (e) { end(e, false); }, true);
    el.addEventListener('pointercancel', function (e) { end(e, true); }, true);
    el.addEventListener('wheel', function () { wake(); }, { capture: true, passive: true });
  }

  function resize() {
    if (!globe || !container) return;
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (w > 0 && h > 0) {
      globe.width(w).height(h);
      wake();
    }
  }

  // Crée le globe dans l'élément donné (une seule fois).
  function mount(el) {
    if (globe) return Promise.resolve();
    container = el;
    return preload().then(function (results) {
      var borders = results[1];
      var dpr = window.devicePixelRatio || 1;

      globe = new window.Globe(el, {
        animateIn: false,
        rendererConfig: {
          antialias: dpr < 2,
          alpha: false,
          powerPreference: 'low-power'
        }
      });

      globe.renderer().setPixelRatio(Math.min(dpr, 1.75));
      globe
        .backgroundColor('#06090d')
        .showAtmosphere(true)
        .atmosphereColor(COLORS.atmosphere)
        .atmosphereAltitude(0.12)
        .showGraticules(false)
        .enablePointerInteraction(false);

      // Sphère unie à la place d'une photo satellite.
      var sea = globe.globeMaterial();
      sea.color.set(COLORS.ocean);
      if (sea.emissive) sea.emissive.set('#030a14');
      if ('shininess' in sea) sea.shininess = 4;

      // Un seul matériau partagé par tous les pays (moins de travail pour
      // le téléphone qu'un matériau par pays).
      var landMaterial = sea.clone();
      landMaterial.color.set(COLORS.land);
      if (landMaterial.emissive) landMaterial.emissive.set('#0c1622');

      globe
        .polygonsData(borders.features)
        .polygonCapMaterial(function () { return landMaterial; })
        .polygonSideColor(function () { return 'rgba(0,0,0,0)'; })
        .polygonStrokeColor(function () { return COLORS.border; })
        .polygonAltitude(0.004)
        .polygonCapCurvatureResolution(4)
        .polygonsTransitionDuration(0);

      guessEl = makeMarker('globe-marker--guess');
      answerEl = makeMarker('globe-marker--answer');
      globe
        .htmlElementsData([])
        .htmlElement(function (d) { return d.el; })
        .htmlAltitude(0.01)
        .htmlTransitionDuration(0)
        .arcsData([])
        .arcColor(function () { return [COLORS.arcFrom, COLORS.arcTo]; })
        .arcStroke(0.45)
        .arcAltitudeAutoScale(0.35)
        .arcCurveResolution(48)
        .arcCircularResolution(4)
        .arcsTransitionDuration(0);

      var controls = globe.controls();
      controls.minDistance = 100 * 1.04;
      controls.maxDistance = 100 * 4.5;

      globe.pointOfView(START_VIEW, 0);

      setupTapDetection(el);
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', function () { setTimeout(resize, 300); });
      resize();
      wake();
    });
  }

  function onTap(fn) {
    tapHandler = fn;
  }

  // Point au milieu de deux positions (pour cadrer la caméra).
  function midpoint(a, b) {
    function vec(p) {
      var la = p.lat * Math.PI / 180;
      var lo = p.lng * Math.PI / 180;
      return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    }
    var v1 = vec(a);
    var v2 = vec(b);
    var x = v1[0] + v2[0];
    var y = v1[1] + v2[1];
    var z = v1[2] + v2[2];
    var n = Math.sqrt(x * x + y * y + z * z);
    if (n < 1e-6) return { lat: a.lat, lng: a.lng };
    return {
      lat: Math.asin(z / n) * 180 / Math.PI,
      lng: Math.atan2(y, x) * 180 / Math.PI
    };
  }

  // Affiche : marqueur joueur, marqueur bonne réponse, ligne entre les deux.
  function showResult(guess, answer, distanceKm) {
    if (!globe) return;
    globe.htmlElementsData([
      { lat: guess.lat, lng: guess.lng, el: guessEl },
      { lat: answer.lat, lng: answer.lng, el: answerEl }
    ]);
    globe.arcsData([{
      startLat: guess.lat, startLng: guess.lng,
      endLat: answer.lat, endLng: answer.lng
    }]);
    var center = midpoint(guess, answer);
    var altitude = Math.max(0.35, Math.min(2.6, 0.3 + distanceKm / 3500));
    globe.pointOfView({ lat: center.lat, lng: center.lng, altitude: altitude }, 900);
    wake(900);
  }

  // Efface les marqueurs et recule la caméra (sans recentrer : aucun indice).
  function clear() {
    if (!globe) return;
    globe.htmlElementsData([]);
    globe.arcsData([]);
    var pov = globe.pointOfView();
    globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: START_VIEW.altitude }, 600);
    wake(600);
  }

  // Centre le globe dans la zone vraiment visible (entre le bandeau de la
  // question en haut et le panneau de résultat en bas).
  function frame(visibleTop, visibleBottom) {
    if (!globe || !container) return;
    var h = container.clientHeight;
    var offset = Math.round((visibleTop + visibleBottom) / 2 - h / 2);
    globe.globeOffset([0, offset]);
    wake();
  }

  function sleep() {
    if (globe && !paused) {
      if (idleTimer) clearTimeout(idleTimer);
      globe.pauseAnimation();
      paused = true;
    }
  }

  window.PdkGlobe = {
    preload: preload,
    mount: mount,
    onTap: onTap,
    showResult: showResult,
    clear: clear,
    resize: resize,
    frame: frame,
    sleep: sleep
  };
})();
