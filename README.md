# PADDOCKLE

Jeu quotidien gratuit sur les sports mécaniques : 5 lieux à retrouver sur un globe 3D, chaque jour.

Site statique (HTML, CSS, JavaScript), sans étape de construction : les fichiers sont publiés tels quels sur Cloudflare Pages.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page du jeu |
| `mentions-legales.html`, `confidentialite.html` | Pages légales (FR + EN) |
| `js/config.js` | **Le seul fichier à remplir** : adresse du site, adresse et clé publique Supabase |
| `js/app.js` | Enchaîne les écrans |
| `js/globe.js` | Globe 3D, différence toucher / glisser, marqueurs |
| `js/score.js` | Distance, points, pastilles |
| `js/api.js` | Échanges avec Supabase |
| `js/storage.js` | Mémoire du téléphone (série, meilleur score, partie en cours) |
| `js/i18n.js`, `lang/*.json` | Langues et textes |
| `js/legal.js` | Bouton « Ne pas compter mes parties » |
| `css/style.css` | Design |
| `vendor/` | Librairie globe.gl (MIT) et frontières Natural Earth 1:110m |
| `fonts/` | Police Barlow Condensed (SIL OFL) |
| `_headers` | Réglages de sécurité et de cache pour Cloudflare Pages |

## Ajouter une langue

1. Copier `lang/en.json` en `lang/es.json` et traduire les textes à droite des `:`.
2. Dans `js/config.js`, ajouter `'es'` à `LANGUAGES`.
3. Dans `index.html`, ajouter un bouton `<button type="button" data-lang="es" aria-pressed="false">ES</button>` dans le sélecteur.
4. Dans Supabase, ajouter les colonnes `texte_es` et `anecdote_es` (sinon l'anglais est utilisé).
