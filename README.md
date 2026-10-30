# ⚔️ QuestFlow

Ta to-do devient un jeu. QuestFlow est une app Mac qui transforme tes journées en **quêtes** : objectifs du jour, XP, niveaux, séries… et qui lit tes **mails Gmail** et ton **Google Chat** pour y trouver les vraies missions (« ajoute des nouvelles ads sur Facebook, Instagram et TikTok » → une quête avec 3 étapes), classées par urgence. Ton **Google Agenda** est intégré : tu le vois, tu crées, modifies et supprimes tes événements sans quitter l'app.

## Installer

1. Télécharge **[QuestFlow-Setup.pkg](../../releases/latest/download/QuestFlow-Setup.pkg)** (toujours la dernière version).
2. Double-clique dessus. La première fois, macOS affiche « Apple ne peut pas vérifier… » : clique sur **Terminé**, puis ouvre **Réglages Système → Confidentialité et sécurité**, descends jusqu'à « QuestFlow-Setup.pkg a été bloqué » et clique **Ouvrir quand même** (mot de passe du Mac).
3. Suis l'installateur : QuestFlow s'installe dans Applications et s'ouvre tout seul.

Ensuite, plus rien à faire : à chaque lancement, QuestFlow vérifie s'il existe une nouvelle version sur GitHub, la télécharge et redémarre dessus.

> L'avertissement de l'étape 2 disparaît si l'app est signée avec un certificat Apple Developer (99 €/an) : ajoute les secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` au dépôt GitHub et la signature + notarisation se font automatiquement.

## Connecter Google (une seule fois)

QuestFlow utilise la connexion officielle de Google (OAuth). Dans l'app : **Réglages → Compte Google → Ouvrir le guide**. Il faut créer un petit projet Google Cloud (≈ 10 min, uniquement des clics) :

1. Créer un projet « QuestFlow » sur console.cloud.google.com.
2. Activer Google Calendar API, Gmail API et (facultatif) Google Chat API.
3. Google Auth Platform → Commencer → Audience **Interne**.
4. Clients → Créer un client → **Application de bureau** → copier l'ID client et le code secret dans QuestFlow.
5. (Chat) Onglet Configuration de l'API Chat : nom, avatar, description.

Ton navigateur s'ouvre, tu autorises, c'est fini. Le jeton est chiffré dans le trousseau macOS.

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
- **Quest Runner** : mini-jeu de course (original) avec record, pendant les scans ; retour direct à l'onglet dès que c'est fini.
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

Publier une version : changer `version` dans `package.json`, ajouter une section au `CHANGELOG.md`, puis pousser un tag `vX.Y.Z`. GitHub Actions construit le Setup et publie la Release ; les apps installées se mettent à jour toutes seules.
