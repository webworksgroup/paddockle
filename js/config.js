/*
 * ============================================================
 *  RÉGLAGES DU SITE — le seul fichier que tu dois modifier
 * ============================================================
 *  Remplace les valeurs entre guillemets, puis enregistre.
 *  Ne touche pas aux autres fichiers JavaScript.
 */
window.PADDOCKLE_CONFIG = {
  // Nom du jeu, affiché partout (logo, titre, texte de partage).
  GAME_NAME: 'PADDOCKLE',

  // Adresse publique du site (sert dans le texte de partage).
  // Exemple : 'https://paddockle.com'
  SITE_URL: 'https://paddockle.com',

  // Adresse de ton projet Supabase.
  // Supabase > Project Settings > Data API > Project URL
  // Exemple : 'https://abcdefghijkl.supabase.co'
  SUPABASE_URL: 'https://VOTRE-PROJET.supabase.co',

  // Clé PUBLIQUE de ton projet Supabase (elle peut être visible de tous).
  // Supabase > Project Settings > API Keys > "Publishable key" (commence par sb_publishable_)
  // ou, sur un ancien projet, la clé "anon public" (commence par eyJ).
  // NE JAMAIS mettre ici la clé "secret" ou "service_role".
  SUPABASE_KEY: 'VOTRE-CLE-PUBLIQUE',

  // Langues proposées, dans l'ordre du sélecteur. Pour ajouter
  // l'espagnol : créer lang/es.json puis ajouter 'es' ici.
  LANGUAGES: ['fr', 'en'],

  // Langue utilisée si celle du téléphone n'est pas dans la liste.
  FALLBACK_LANGUAGE: 'en',

  // En dessous de ce nombre de joueurs dans la journée, on n'affiche pas
  // de pourcentage (il ne voudrait rien dire).
  MIN_PLAYERS_FOR_PERCENT: 10
};
