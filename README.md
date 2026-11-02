# ⚔️ QuestFlow

Ta to-do devient un jeu. QuestFlow est une app Mac qui transforme tes journées en **quêtes** : objectifs du jour, XP, niveaux, séries… et qui lit tes **mails Gmail** et ton **Google Chat** pour y trouver les vraies missions (« ajoute des nouvelles ads sur Facebook, Instagram et TikTok » → une quête avec 3 étapes), classées par urgence. Ton **Google Agenda** est intégré : tu le vois, tu crées, modifies et supprimes tes événements sans quitter l'app.

## Installer

1. Télécharge **[QuestFlow-Setup.pkg](../../releases/latest/download/QuestFlow-Setup.pkg)** (toujours la dernière version).
2. Double-clique dessus. La première fois, macOS affiche « Apple ne peut pas vérifier… » : clique sur **Terminé**, puis ouvre **Réglages Système → Confidentialité et sécurité**, descends jusqu'à « QuestFlow-Setup.pkg a été bloqué » et clique **Ouvrir quand même** (mot de passe du Mac).
3. Suis l'installateur : QuestFlow s'installe dans Applications et s'ouvre tout seul.

Ensuite, plus rien à faire : à chaque lancement, QuestFlow vérifie s'il existe une nouvelle version sur GitHub, la télécharge et redémarre dessus.

> L'avertissement de l'étape 2 disparaît si l'app est signée avec un certificat Apple Developer (99 €/an) : ajoute les secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` au dépôt GitHub et la signature + notarisation se font automatiquement.

## Connecter Google (une seule fois, sans clé)

Aucune clé API, aucun projet Google Cloud. QuestFlow passe par **Google Chrome** :

1. Au premier lancement (ou Réglages → Google → **Se connecter avec Chrome**), QuestFlow regarde d'abord si tu es déjà connectée : si oui, rien ne s'ouvre.
2. Sinon, une fenêtre Chrome s'ouvre sur la page de connexion Google. Tu te connectes toi-même, comme d'habitude (mot de passe, validation sur le téléphone…).
3. QuestFlow détecte la connexion et referme Chrome **proprement** (comme ⌘Q), pour que Chrome enregistre bien ta session (ou clique sur « J'ai terminé »).
4. Ensuite, à chaque scan, QuestFlow relance ce même Chrome, sans fenêtre à l'écran, lit Gmail, Google Agenda et Google Chat comme tu le ferais, puis le referme proprement. La session reste enregistrée : pas besoin de retaper ton mot de passe.

Détails :

- **Profil Chrome à part**, rangé dans `~/Library/Application Support/QuestFlow/chrome-profile` : ton Chrome habituel, tes favoris et tes mots de passe ne sont pas touchés. « Déconnecter » efface ce profil.
- **Compte professionnel (Google Workspace)** : Chrome range souvent la connexion dans un profil séparé pour l'organisation (« Profile 1 »). QuestFlow repère le profil qui porte ta session et lit celui-là.
- La fenêtre de connexion est un Chrome normal, sans aucun pilotage : QuestFlow ne voit ni ne tape ton mot de passe.
- Pour lire, QuestFlow utilise ce même Chrome, normal (pas de mode « headless »), avec sa fenêtre placée hors de l'écran : Google voit toujours le même navigateur. Une icône Chrome peut apparaître quelques secondes dans le Dock pendant la lecture.
- Les cookies de ce profil sont chiffrés par Chrome comme d'habitude (trousseau macOS).
- **Gmail** : boîte de réception (onglet Principal), lecture du message d'origine (« Afficher l'original »), sans marquer les mails comme lus.
- **Google Agenda** : lecture via l'export officiel (Paramètres → Exporter) avec les récurrences ; création, renommage et suppression par les mêmes clics que toi. Si Google change son interface, Google Agenda s'ouvre sur la bonne page dans une fenêtre Chrome et se referme dès que tu as enregistré.
- **Google Chat (bêta)** : messages directs et mentions des derniers jours. Les conversations ouvertes par QuestFlow passent en « lu ».
- Si la connexion échoue, la fenêtre affiche un « Détail technique » (page atteinte, nombre de cookies Google, jamais leur contenu) : une capture d'écran suffit pour comprendre.
- Si l'interface de Google change, QuestFlow écrit un fichier `diagnostic-*.txt` dans ses journaux (Réglages → Mises à jour → Journal de diagnostic). Il ne contient que la structure de la page, jamais le contenu de tes mails.

## Fonctionnalités

- **Bonjour {prénom}** en plein écran à chaque ouverture (prénom modifiable dans les Réglages).
- **Quêtes du jour** : en retard, à faire aujourd'hui, urgentes, épinglées. Clique pour tout voir et tout modifier.
- **To-do triée automatiquement** : retard → aujourd'hui (ce soir passe devant la semaine prochaine) → demain → semaine → plus tard.
- **Libellés de provenance** : ✉️ Mail, 💬 Chat, ✏️ Perso — distincts du logo de la quête.
- **Logo et couleur** de chaque quête : clique sur le logo pour choisir parmi 60 icônes et 16 couleurs.
- **Difficulté** (Facile → Épique) et **XP** gagnée, niveaux, rangs, série de jours 🔥.
- **Victoire plein écran** : le nom s'allume en vert puis part en fumée, la quête rejoint « Terminées ».
- **Croix ✕** pour supprimer, avec confirmation.
- **Recherche** : texte libre + `#tag`, `prio:haute`, `date:demain`, `date:retard`, `source:mail`, `diff:epique`, `de:jean`, `statut:tout`.
- **Notifications** : quête prioritaire bientôt due, échéance atteinte, réunion dans 10 min, récap du matin.
- **Coche !** : mini-jeu de course pendant les scans, dessiné comme une page Notion (une case à cocher saute les mails et les réunions, attrape les coches), avec record ; retour direct à l'onglet dès que c'est fini.
- **Coller un texte** (Slack, WhatsApp, notes…) pour en extraire des quêtes.

## L'algorithme de détection des missions

`src/shared/extract.js`, 100 % local (aucune IA externe, rien n'est envoyé) :

1. filtre les newsletters, no-reply, invitations, réponses automatiques, réactions, mes propres mails ;
2. coupe les réponses citées, signatures (même sans « -- »), coordonnées, mentions légales ;
3. repère les demandes (« peux-tu… », « merci de… », impératifs, « il faudrait que tu… », « n'oublie pas… », anglais aussi) et ignore politesses, remerciements, engagements de l'expéditeur, infos « pour info » ;
4. réécrit en titre à l'infinitif (« Peux-tu m'envoyer les chiffres ? » → « Envoyer les chiffres à Jean ») ;
5. détecte échéance, priorité, difficulté, sous-tâches (énumérations, listes) et tags ;
6. comprend les demandes implicites (avis, dispo, aide, validation) et ignore les mails où tu es seulement en copie d'une demande adressée à quelqu'un d'autre.

Plus de 100 tests (`tests/`), dont des cas reproduits à partir de vrais mails (contenus anonymisés).

## Développement

```bash
npm install
npm test            # tests
npm run dev         # aperçu de l'interface dans le navigateur (données de démo)
npm start           # app Electron
npm run dist:mac    # build macOS (sur un Mac)
```

Publier une version : changer `version` dans `package.json`, ajouter une section au `CHANGELOG.md`, puis pousser sur `main`. GitHub Actions construit le Setup sur un Mac et publie la Release (aussi possible : un tag `vX.Y.Z`, ou le bouton « Run workflow » de l'onglet Actions). Les apps installées se mettent à jour toutes seules.
