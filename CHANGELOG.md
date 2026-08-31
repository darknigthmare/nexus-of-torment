# Changelog

## 1.3.0 — 2026-08-31 — Les voix du Nœud

- Nouveau mode Histoire : dix offices traversant trois secteurs ; les modes sectoriel et sans fin sont préservés.
- Trois interlocuteurs originaux, transmissions progressives, deux décisions avec bénéfices/coûts explicites, trois épilogues et variante de conclusion selon les quatre combinaisons.
- Relais à stabiliser dans l’ordre et transport interactif d’un module ralentissant les déplacements de 22 % ; renforts et phase de purge finale.
- Six archives physiques accessibles avec clavier ou tactile, journal en pause sans spoilers et représentation originale en 3D temps réel.
- Vingt accomplissements persistants, suivi de complétion, prochaines actions et récompenses uniques en fragments.
- Sauvegarde racine v3, checkpoint v2, migration stricte des anciens dossiers ; décisions non résolues reprises sans application automatique ni double bénéfice.
- Choix bloqués sans mutation lors d’un conflit de sauvegarde ou d’une perte graphique ; export du brouillon conservé.
- Contrats narratifs, progression/migrations, campagnes assistées et nouveaux parcours Chrome desktop/mobile ; ressources narratives précachées avec intégrité SRI.

## 1.2.1 — 2026-08-31 — Commandes et continuité protégées

- Personnalisation de vingt actions clavier/souris, validation des conflits, réinitialisation confirmée et indications de HUD/briefing actualisées. Les commandes tactiles restent indépendantes.
- Libération des entrées après changement de focus, clics de menu exclus du combat, maintien tactile correct avec plusieurs doigts.
- Sauvegarde périmée détectée avant écriture et lors d’un événement inter-onglets : pause protégée, export du brouillon et rechargement confirmé. Les formats futurs restent en lecture seule, avec copie originale exportable.
- État hors ligne et disponibilité d’installation visibles dans les réglages ; aucune installation annoncée sur la seule acceptation du dialogue.
- Réparation complète du cache avec empreintes SRI vérifiées par Fetch : un module différent ou un téléchargement incomplet ne produit jamais un mélange de versions.
- Charges du Broyeur, de l’Écorché et du Gardien arrêtées par les couverts ; slam aligné sur difficulté/vague sans double facteur.
- Stations sans achat inutile quand les réserves ou soins sont déjà au maximum ; orientation de reprise conservée après plusieurs tours.
- Contrats supplémentaires de commandes, stockage/PWA et gameplay ; [détail du correctif gameplay](docs/GAMEPLAY_POLISH_1.2.1.md). Les preuves et limites courantes sont dans [le rapport QA](docs/QA_REPORT.md).

## 1.2.0 — 2026-08-31 — Liturgie nerveuse

### Campagne et rythme de survie

- Ajout d’une campagne complète de 10 vagues, d’une extraction finale et d’un écran de victoire permettant de prolonger la tentative en survie sans fin.
- Ajout de trois objectifs de vague : purge, maintien de sceau et chasse de signatures marquées.
- Ajout d’une intermission jouable de 20 secondes avec passage manuel ou automatique à l’office suivant.
- Ajout d’un checkpoint inter-vague et d’une reprise validée après rechargement ; les données restaurées sont bornées avant utilisation.
- Distinction des fins de tentative : mort et victoire attribuent les fragments prévus, l’abandon n’en attribue aucun.

### Secteurs, hordes et combat

- Ajout de trois secteurs complets : **Sanctuaire de Fer**, **Nef des Sutures** et **Ossuaire des Crochets**, avec géométries, couvertures, stations, points d’apparition et ancrages d’objectif distincts.
- Renforcement du directeur de hordes avec renforts anti-blocage, plafond global des renforts de boss et remise en position des ennemis immobilisés.
- Correction des grenades afin que leur explosion respecte les collisions et l’atténuation par les couvertures.
- Protection des apparitions afin que les ennemis encore invulnérables ne puissent pas infliger de dégâts.
- Validation des quatre difficultés et des boss dédiés aux vagues 5 et 10.
- Alignement des raycasts de tête sur les pièces visibles et correction des volumes corporels de l’Archidiacre qui masquaient sa tête.
- Suppression de la dérive cumulative de respiration des silhouettes ; expiration effective des ralentissements et respect des obstacles par la mêlée ennemie.
- Éclairage propre à chaque secteur sans dépasser quatre sources ; avertissement spatial, textuel et cercle de rayon réel avant le slam du Gardien.

### UX, accessibilité et PWA

- Ajout des commandes tactiles de déplacement, visée, tir, armes, capacité, grenade, mêlée, interaction, saut, course et pause.
- Ajout d’une reprise explicite du verrouillage du pointeur sur desktop.
- Ajout des réglages d’échelle du HUD, d’intensité des secousses, de mouvement réduit, de contraste UI, de contraste ennemi et de sous-titres.
- Ajout du manifeste installable, de l’icône originale, du service worker et du cache autonome avec fallback hors ligne.
- Ajout de la build statique `dist` et du pipeline CI/release.
- Ajout d’un briefing accessible au menu et en pause, d’un guidage d’objectif désactivable et du lancement tactile de l’office suivant.
- Greffes sans chrono par défaut ; délai de 24 secondes optionnel et suspendu lorsque l’onglet est caché.
- Confirmations avant abandon, redémarrage ou remplacement d’un checkpoint, avec annulation et restitution du focus, y compris depuis les réglages.
- Export JSON et import confirmé réservé au menu, limité à 256 Ko ; validation des données, signalement des erreurs de stockage et copie de récupération. Import et achat persistants n’annoncent plus un succès lorsque l’écriture échoue.
- Contraste appliqué aux matériaux ennemis ; suppression du flash blanc plein corps et atténuation du flash d’arme avec l’option dédiée.
- Suspension des entrées et de l’audio lors d’une perte de focus ; tolérance aux refus Web Audio et compression du bus final. Perte WebGL : gel du rendu et de la simulation, rechargement explicite sans suppression du checkpoint.
- Illustration de menu originale OpenAI Image Generation, accompagnée de sa provenance ; image d’ambiance distincte des captures de gameplay.
- Révision du cache dérivée du SHA-256 des fichiers triés, assets et SW source compris ; textes de build normalisés en LF, source SW inchangée. Le shell installé ne mélange pas les modules de révisions différentes.

### Qualité vérifiée

- Audit statique et audit de release distincts ; le second contrôle la preuve navigateur courante.
- Runtime smoke : **72/72**, dont les 34 contrats précédents préservés.
- HTTP smoke : **5/5**.
- Suites de contrats supplémentaires : combat, stabilité du rendu, présentation, sauvegarde/audio, UI et déterminisme de deux builds successifs.
- Parcours Google Chrome desktop, tactile émulé, campagne, survie infinie, secteurs, difficultés, boss, sauvegarde, menus et PWA. Le décompte et les mesures actifs sont dans [la preuve navigateur](docs/QA_BROWSER_1.2.json), avec les fixtures et limites dans [le rapport QA](docs/QA_REPORT.md).
- Ces contrôles ne remplacent pas une campagne humaine sans assistance, des essais sur téléphone physique/Safari ou une certification commerciale.
- Porte de performance locale : rendu matériel 1280 × 720 natif, médiane ≥30 FPS et minimum ≥24 FPS ; mesures exactes conservées dans `docs/QA_BROWSER_1.2.json`.
- Captures de preuve : `docs/screenshots/v1.2-desktop-menu.png`, `docs/screenshots/v1.2-desktop-gameplay.png` et `docs/screenshots/v1.2-mobile-gameplay.png`.

## 1.1.0 — 2026-08-11 — Liturgie nerveuse

### Gameplay

- Ajout du **coup de crosse sur `V`** avec animation, recul, dégâts, ralentissement et étourdissement.
- Ajout de **Vesper**, lance-chaînes à forte puissance capable d’attirer et d’entraver les cibles non boss.
- Ajout du **Sanctificateur**, projecteur automatique convertissant la Souillure en dégâts et appliquant une brûlure purificatrice.
- Extension des commandes et des emplacements d’armes de `1–4` à `1–6`.
- Ajout de deux nouvelles armureries physiques dans l’arène.

### Bestiaire

- Ajout de **L’Écorché Liturgique**, avant-garde à charge et blindage frontal directionnel.
- Ajout de **l’Archidiacre des Nerfs**, second boss à trois phases : projectiles psychiques, condamnations de zone, Souillure, ralentissement et invocations.
- Alternance des boss : Gardien du Seuil aux multiples de 5 impairs, Archidiacre aux multiples de 10.
- Alignement spécifique de la hitbox de tête de l’Archidiacre avec son modèle suspendu.

### Présentation

- Nouveaux viewmodels procéduraux, matériaux, animations, traceurs et sons synthétiques pour les armes rituelles.
- Codex d’arsenal enrichi avec la mécanique propre de chaque arme avancée.
- HUD et aide des commandes mis à jour.
- Nouvelles captures vérifiées en 1280 × 720.

### Qualité

- Audit étendu aux nouveaux contenus, aux slots d’armes, au roster de boss et aux mécaniques spéciales.
- Ajout de **23 tests fonctionnels déterministes** couvrant l’arène, les armes, la mêlée, le directeur, l’Écorché et l’Archidiacre.
- Ajout de **5 tests HTTP** couvrant les ressources, les types MIME, les 404 et la protection contre la traversée de répertoire.
- Validation Chromium 144/WebGL 2 sans exception JavaScript pendant le scénario 1.1.

## 1.0.0 — 2026-08-10

- Première édition jouable complète.
- Moteur WebGL 2 autonome et rendu procédural.
- Arène industrielle rituelle avec collisions, stations et dangers.
- Trois doctrines, quatre armes et quatre difficultés.
- Neuf castes au total, variantes élites et Gardien du Seuil à trois phases.
- Directeur de vagues, sept modificateurs et boss toutes les cinq vagues.
- Vingt greffes de run et six améliorations persistantes.
- HUD, menus, Codex, réglages, pause, résultats et sauvegarde locale.
- Audio Web Audio généré en temps réel.
