# Journal des versions

## 1.7.0
- Slack des agences (Roads, Datashake…) : les notifications Slack reçues par mail (mentions, messages directs, récaps quotidiens) sont découpées message par message et les demandes deviennent des quêtes, sans clé API Slack.
- Ces notifications sont trouvées même si Gmail les range dans l'onglet « Notifications » (recherche dédiée).
- Les quêtes Slack portent la source « Slack », le tag de l'agence (#roads, #datashake) et arrivent dans la To-do Ads.
- Réglages → Google : interrupteur « Slack des agences » et astuce pour recevoir les notifications Slack par mail toutes les 15 minutes.
- Filtre et recherche : « source:slack ».

## 1.6.0
- Fils de discussion lus en entier : le premier message (la demande d'origine), le dernier, et les messages intermédiaires retrouvés dans l'historique cité. Avant, seul le dernier message était lu, souvent ta propre réponse ou ta réaction ♥️, et la demande passait à la trappe.
- Mails qui répartissent les tâches avec « @Prénom Nom <adresse> peux-tu… » : seules les demandes qui te sont adressées sont gardées (pas celles de Lara, Sarah…), même quand la phrase est coupée sur deux lignes.
- Plans de priorités (« Priorité 1 (d'ici le 13/11) : Black friday », « Priorité 2 : … ») : une quête par priorité, avec ses points en sous-étapes et son échéance.
- Nouvelle page « To-do Ads » dans la barre latérale : toutes tes quêtes publicitaires.
- Moins de bruit : réponses aux invitations d'agenda, rapports de caisse automatiques et « See the call agenda below » ne deviennent plus des quêtes.
- Alertes d'outils (paiement échoué, action requise, compte suspendu) : elles deviennent des quêtes, quel que soit l'outil.
- « Il faudra que tu l'envoies à Sarah » : le titre reprend l'objet du mail (« Envoyer à Sarah (Soirée top clients…) »).

## 1.5.0
- Les demandes qui manquaient arrivent dans ta to-do :
  - « @Stella Augusto peux-tu… » (mention avec prénom et nom) dans un mail ou dans Chat ;
  - « On peut lancer … aujourd'hui ? », « Est-ce qu'on peut … ? » dans un canal Chat ;
  - mails d'équipe envoyés à une adresse de groupe (ex. marketing@…) : ils ne sont plus pris pour des newsletters.
- Google Chat : lecture refaite avec le vrai balisage de Chat (canaux et messages privés) ; tes propres messages et ceux adressés à quelqu'un d'autre sont ignorés.
- Ads : les alertes des régies (Meta, Google Ads, TikTok, LinkedIn…) qui demandent une action deviennent des quêtes (pub refusée, paiement refusé, compte suspendu, action requise). Les simples informations (pub en ligne, rapports) restent ignorées.
- Juste après la connexion, QuestFlow scanne automatiquement tes mails, ton agenda et Chat.
- Nouveau : « Relire mes mails et Chat de la semaine » (Réglages → Google ou Synchronisation) pour repasser sur toute la période, sans créer de doublons.

## 1.4.0
- Google Agenda se lit à nouveau : l'export demande désormais un jeton que Google donne sur le bouton « Exporter » des paramètres. QuestFlow passe par ce bouton, comme toi. Si l'export n'est pas disponible, il lit les événements directement dans les pages « semaine » de Google Agenda.
- Gmail : le message d'origine est lu par l'adresse « Télécharger le message » de Gmail (la plus fiable), puis « Afficher l'original » en secours.
- Après chaque scan, QuestFlow affiche ce qu'il a lu (mails, événements) et, s'il y en a, les erreurs par source.
- Agenda vide : un encadré explique pourquoi et propose « Lire mon agenda ».
- Réglages → Google : « Dernier scan » (mails lus, événements et méthode utilisée) et « Copier le rapport » (diagnostic technique, sans le contenu de tes mails).

## 1.3.0
- Comptes professionnels (Google Workspace) : quand Chrome range ta connexion dans un profil séparé pour ton organisation (« Profile 1 »), QuestFlow le suit au lieu de lire le profil vide. C'était la cause du message « La connexion n'a pas abouti ».
- La connexion est détectée dans tous les profils de Chrome, la fenêtre se ferme toute seule comme prévu.
- Si Chrome enregistre la connexion sans pouvoir la relire, QuestFlow change automatiquement de méthode de chiffrement et te demande de te reconnecter une seule fois.
- Messages d'erreur plus précis, et détail technique enrichi (profils Chrome, règles imposées par l'entreprise), toujours sans adresse ni contenu.

## 1.2.0
- Connexion Google qui reste enregistrée : plus besoin de retaper ton mot de passe.
- La fenêtre de connexion se ferme proprement (comme ⌘Q) : Chrome enregistre bien ta session avant de quitter. Avant, il quittait en urgence et pouvait perdre les derniers cookies Google, ce qui faisait tomber la connexion.
- La lecture utilise le même Chrome, normal (plus de mode « headless »), avec sa fenêtre hors de l'écran : Google voit toujours le même navigateur.
- « Se connecter » vérifie d'abord si tu es déjà connectée : dans ce cas, aucune fenêtre ne s'ouvre.
- Si Google refuse une ancienne session, QuestFlow repart d'une connexion propre.
- En cas d'échec, la fenêtre affiche un détail technique (page atteinte, nombre de cookies, jamais leur contenu).
- QuestFlow garde le premier plan quand Chrome démarre en arrière-plan, et laisse Chrome se fermer proprement quand tu quittes.

## 1.1.0
- Connexion Google sans aucune clé : QuestFlow ouvre Google Chrome une seule fois pour que tu te connectes, détecte la connexion et referme la fenêtre. Ensuite, Gmail, Agenda et Chat sont lus en arrière-plan, sans fenêtre.
- Plus de projet Google Cloud ni d'identifiants à copier.
- Google Agenda : lecture de tous tes agendas avec les événements récurrents ; création, renommage et suppression directement dans Google Agenda.
- Bouton « Tester la lecture » dans Réglages → Google.
- Nouveau logo et nouvelle icône d'app, sobres, façon Notion.
- Nouveau mini-jeu « Coche ! » dans le même style (clair et sombre).
- Titres de quêtes plus propres : « demain 17h », « à 17h » ne restent plus dans le titre.

## 1.0.0
- Première version de QuestFlow.
- Quêtes du jour, to-do triée par urgence, XP, niveaux, séries de jours.
- Détection automatique des missions dans Gmail et Google Chat (algorithme local testé sur plus de 100 cas).
- Google Agenda intégré : voir, créer, modifier, supprimer des événements.
- Design inspiré de Notion : couvertures, icônes emoji, vues Liste / Tableau / Kanban, fiche en panneau latéral, recherche ⌘K.
- Personnalisation : thème clair/sombre/auto, couleur d'accent, police Défaut/Serif/Mono, petit texte, pleine largeur, pages (nom, emoji, couverture, ordre), couleurs des tags, mode jeu.
- Animations : Bonjour plein écran, victoire avec le nom qui s'allume en vert puis part en fumée.
- Mini-jeu « Quest Runner » avec record pendant les chargements.
- Notifications des quêtes prioritaires, recherche avancée, personnalisation des logos et couleurs.
- Mises à jour automatiques depuis GitHub.
