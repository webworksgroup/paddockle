/*
 * legal.js — sur la page de confidentialité : affiche l'identifiant anonyme
 * du joueur et le bouton "Ne pas compter mes parties".
 */
(function () {
  'use strict';

  var Store = window.PdkStorage;
  var idEl = document.getElementById('player-id');
  var statusEl = document.getElementById('optout-status');
  var btn = document.getElementById('optout-btn');
  if (!idEl || !btn) return;

  idEl.textContent = Store.getPlayerId();

  function render() {
    var out = Store.isOptedOut();
    statusEl.textContent = out
      ? '⛔ Tes parties ne sont pas comptées. / Your games are not counted.'
      : '✅ Tes parties sont comptées (anonymement). / Your games are counted (anonymously).';
    btn.textContent = out
      ? 'Compter à nouveau mes parties / Count my games again'
      : 'Ne pas compter mes parties / Don\'t count my games';
  }

  btn.addEventListener('click', function () {
    Store.setOptOut(!Store.isOptedOut());
    render();
  });

  render();
})();
