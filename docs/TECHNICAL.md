# Documentation technique — build 1.2.0

## 1. Principes

Le jeu fonctionne sans bundler et sans dépendance d’exécution. Les scripts classiques sont chargés dans un ordre déterministe et enregistrent leurs modules dans `window.NT`. Cette architecture permet :

- une ouverture directe depuis `index.html` ;
- un hébergement statique ;
- une modification sans compilation ;
- un audit simple de toutes les ressources ;
- un package autonome sans CDN.

`tools/build.mjs` recopie le cœur statique dans `dist`, normalise les fichiers texte en LF et injecte une révision de cache dans le seul `dist/sw.js`. Le SHA-256 porte sur les chemins triés, longueurs et contenus canoniques de tous les fichiers copiés, illustration et SW source compris avant injection. Les binaires et le SW source restent inchangés. Ainsi, deux builds du même contenu sont identiques malgré les fins de ligne Windows/Linux ; une modification du shell renouvelle sa clé de cache.

Ordre de chargement :

```text
math → engine → audio → data → arena → entities → weapons → ui → game → main
```

## 2. Pipeline de rendu

`src/core/engine.js` fournit :

- contexte WebGL 2 ;
- compilation et liaison des shaders ;
- matrices modèle, vue et projection ;
- caméra FPS ;
- éclairage avec quatre sources ponctuelles ;
- brouillard linéaire ;
- matériaux avec couleur, émissif, métal, transparence et motif procédural ;
- géométries générées : cube, plan, cylindres, cônes, sphères, tores et prisme ;
- système de particules en buffer dynamique ;
- résolution interne réglable ;
- entrées clavier, souris, verrouillage du pointeur et commandes tactiles ;
- sauvegarde locale validée selon les valeurs par défaut et les limites du schéma.

Le fragment shader produit les matières acier, chair, rune et voile à partir de fonctions procédurales, sans texture pour la scène 3D. L’illustration `assets/nexus-keyart-v1.png` est un arrière-plan CSS de menu, pas une capture de gameplay ; sa génération originale OpenAI et son prompt sont consignés dans [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md).

Les trois lumières décrites par `SECTORS.lighting` complètent celle du joueur. En combat de boss, le dernier accent suit le boss au lieu d’ajouter une source. Le contraste ennemi utilise des matériaux précalculés à la demande, avec des têtes distinctes ; les matériaux du décor ne sont pas remplacés. Le mode flashs réduits supprime le blanc plein corps des impacts et atténue le flash des armes.

## 3. Mathématiques et collisions

`src/core/math.js` contient :

- `Vec3` ;
- matrices 4 × 4 ;
- interpolation amortie ;
- base de caméra ;
- rayons contre sphères et AABB ;
- résolution cercle/AABB ;
- sélection pondérée et utilitaires aléatoires.

Le joueur et les ennemis utilisent des collisions horizontales adaptées aux secteurs de horde. Les tirs sont des raycasts triés par distance, limités par le premier obstacle du monde et capables de pénétrer plusieurs cibles.

### Hitboxes

Les corps standards utilisent une sphère. Les têtes utilisent des ellipsoïdes alignés sur les positions, dimensions, rotations et échelles des pièces visibles ; les têtes orbitantes du Chœur suivent leur animation. L’Archidiacre teste les ellipsoïdes de son torse et de son cœur : l’ancienne grande sphère masquait les tirs dirigés vers sa tête. La priorité locale de tête reste limitée à ce boss.

## 4. Entités

### Joueur

`Player` gère :

- déplacement, sprint, saut et collisions ;
- santé, armure et Souillure ;
- recul et tremblement de caméra ;
- doctrines et capacités ;
- modificateurs de run ;
- ralentissement, traction et invulnérabilité.

L’expiration du ralentissement remet aussi son intensité à zéro, chez le joueur comme chez les ennemis ; un ralentissement faible ultérieur n’hérite plus de l’ancien maximum.

### Ennemis

`Enemy` est data-driven. Le comportement est sélectionné par caste et fonctionne par petits états : poursuite, maintien de distance, charge, téléportation, slam, invocation et contrôle de zone.

Le socle bestiaire livré en 1.1 comprend :

- `_updateFlayed()` : préparation, lunge, impact et ralentissement ;
- `_updateArchdeacon()` : maintien aérien, tirs multi-projectiles, zones de chaîne, Souillure, slow, transitions et invocations ;
- `ignite()` : brûlure avec DPS, durée et tick indépendant ;
- blindage frontal directionnel dans `takeDamage()`.

La 1.2 complète la robustesse de simulation avec :

- plafond global des renforts invoqués par les boss ;
- surveillance des ennemis bloqués et repositionnement dans une zone sûre ;
- exclusion offensive des ennemis encore protégés par leur invulnérabilité d’apparition ;
- nettoyage des hostiles, projectiles et dangers lors de la transition victoire → survie infinie.

Les visuels sont des listes de pièces locales rattachées à une matrice racine. Position, rotation et `baseScale` sont réappliquées avant chaque dessin : la respiration ne s’accumule pas entre les frames. L’Archidiacre comporte 22 pièces procédurales. Les attaques de mêlée ennemies vérifient la ligne de vue avant les dégâts.

### Projectiles et pickups

`Projectile` supporte :

- tirs hostiles ;
- crochets ;
- projectiles de corruption ;
- grenades rebondissantes ;
- explosion radiale.

Les explosions de grenade testent les obstacles du monde et atténuent les dégâts lorsque la cible est protégée par une couverture.

`Pickup` gère santé, armure, munitions et Essence avec durée de vie et collecte de proximité.

## 5. Système d’armes

`WeaponSystem` centralise :

- état chargeur/réserve par arme ;
- changement de slot ;
- rechargement ;
- tir automatique ou semi-automatique ;
- dispersion et recul ;
- ADS ;
- raycast et pénétration ;
- traceurs, impacts et hitmarkers ;
- viewmodels procéduraux ;
- grenade ;
- mêlée.

### Mécaniques spéciales

Les armes peuvent définir `special` dans `data.js`.

```javascript
special: 'chain_pull'
special: 'purifier'
```

`chain_pull` applique stun, slow, arc visuel et déplacement contrôlé de la cible. `purifier` augmente les dégâts selon la Souillure, applique un bonus de type et déclenche `Enemy.ignite()`.

### Mêlée

La mêlée cherche la cible vivante la plus proche dans un cône frontal, vérifie la ligne de vue, applique les dégâts puis déclenche une animation du root matrix du viewmodel. Elle est indépendante de l’arme courante et annule le rechargement.

## 6. Données

Tout le tuning est centralisé dans `src/game/data.js` :

```javascript
NT.Data = {
  COLORS,
  CLASSES,
  DIFFICULTIES,
  WEAPONS,
  ENEMIES,
  WAVE_MODIFIERS,
  UPGRADES,
  META_UPGRADES,
  STATIONS,
  SECTORS
};
```

La build 1.2.0 déclare :

- 3 classes ;
- 6 armes ;
- 11 castes ;
- 7 modificateurs ;
- 20 greffes ;
- 6 améliorations persistantes ;
- 4 difficultés ;
- 7 types/instances de stations par secteur ;
- 3 secteurs ;
- 3 objectifs de vague standards ;
- une campagne de 10 vagues.

### Ajouter une caste

1. Ajouter sa définition dans `ENEMIES`.
2. Ajouter ses pièces dans `buildEnemyVisual()`.
3. Raccorder son comportement dans `Enemy.update()` ou réutiliser une famille existante.
4. Vérifier `cost`, `weight`, `unlockWave` et `boss`.
5. Ajouter son entrée narrative dans `docs/CODEX.md`.
6. Étendre `runtime-smoke.mjs` pour sa mécanique particulière.

### Ajouter une arme

1. Définir ses statistiques dans `WEAPONS`.
2. Utiliser un slot unique.
3. Créer son viewmodel dans `_createVisuals()`.
4. Ajouter son son dans `AudioManager.gun()`.
5. Ajouter une station ou une autre condition de déblocage.
6. Vérifier HUD, réserve, chargeur, portée et mécanique spéciale.

### Ajouter une greffe

1. Ajouter l’objet dans `UPGRADES` avec `id`, `name`, `description`, `max` et `effects`.
2. Raccorder les nouveaux effets dans `NexusGame.applyUpgrade()` si nécessaire.
3. Tester le cumul jusqu’au rang maximal.

## 7. Secteurs

`Arena` construit le décor, les colliders, les spawn points, les dangers et les stations depuis l’entrée `SECTORS` sélectionnée. `setSector()` nettoie puis reconstruit l’espace sans conserver les éléments du secteur précédent. Les éléments sont répartis entre pièces statiques et dynamiques.

Les trois espaces livrés sont :

- `sanctum` — Sanctuaire de Fer ;
- `nave` — Nef des Sutures ;
- `ossuary` — Ossuaire des Crochets.

Chaque définition contient limites, sol, géométrie, couvertures, piliers, sept stations, apparitions, position de départ, ancrages d’objectif et trois lumières. `setObjectiveZone()` matérialise les sceaux de maintien et d’extraction. `findSafePosition()` et `repositionSafely()` fournissent une solution contrôlée aux entités immobilisées. Les frappes de chaînes restent planifiées sous forme de hazards télégraphiés avant impact.

## 8. Directeur de partie

`src/game/game.js` orchestre :

- états menu, jeu, pause, greffe, mort, résultat et victoire ;
- directeur de vagues et file d’apparition ;
- sélection de modificateur ;
- économie et récompenses ;
- effets temporaires ;
- progression de carrière ;
- rendu global et éclairage ;
- objectifs purge/maintien/chasse, intermission et extraction ;
- checkpoint, reprise, redémarrage et retour au menu ;
- conversion contrôlée de la victoire en survie sans fin.

### Sélection des boss

```javascript
wave % 10 === 0 ? 'archdeacon' : 'gatekeeper'
```

La condition n’est évaluée que sur les vagues multiples de 5. Le boss est placé au début de la file, puis les renforts restants sont mélangés.

Pendant `slamWindup`, `_drawBossTelegraphs()` trace un cercle stable dont le rayon vient du même `bossSlamRadius()` que les dégâts. L’entrée de cet état appelle `telegraphBossSlam()` pour le son spatial et le sous-titre. Ce signal coûte un dessin pendant la préparation, sans timer ou collection à nettoyer après la mort du boss.

## 9. Interface

`UIManager` ne dépend pas du moteur de rendu 3D. Le HUD est en HTML/CSS afin de conserver une typographie nette et une mise à l’échelle flexible. La 1.2 expose les sélecteurs de mode et de secteur, la reprise d’un run, l’écran de victoire, la reprise explicite du pointeur et les contrôles tactiles.

Les réglages appliquent échelle du HUD, intensité des secousses, mouvement réduit, contrastes UI/ennemi et sous-titres. Le briefing est accessible au menu et depuis la pause, y compris sur petit écran. `guidedHints` active l’aide initiale et la direction/distance du sceau ou de la cible marquée vivante la plus proche.

`timedUpgrades` vaut `false` par défaut : choisir une greffe n’impose aucune limite de lecture. L’option active le choix automatique après 24 secondes, dont le compteur ne diminue pas lorsque `document.hidden` est vrai. L’intermission jouable conserve séparément ses 20 secondes et son lancement manuel/tactile.

Les modales piègent le focus et le restituent, y compris après une confirmation imbriquée. Redémarrage, abandon et remplacement de checkpoint sont confirmés puis exécutés une seule fois. La lecture de fichier vérifie l’état menu avant et après l’attente asynchrone, puis encore lors de la confirmation d’import.

Dans `main.js`, perte de focus ou onglet caché suspendent le combat, effacent les entrées maintenues et suspendent l’audio. Une perte WebGL bloque simulation et rendu dans `graphics-lost`. Une restauration du contexte ne reconstitue pas les buffers : le bouton de rechargement reste nécessaire, sans réécriture du checkpoint.

## 10. Audio

`AudioManager` utilise Web Audio : oscillateurs, bruit généré, filtres, enveloppes, panoramique stéréo et bus séparés. Le contexte n’est créé qu’après une interaction. Le socle sonore comprend notamment :

- impulsion métallique et tension de chaîne pour Vesper ;
- faisceau aigu filtré pour le Sanctificateur ;
- impact court pour la mêlée.

Un compresseur modéré sur le bus final limite les superpositions lorsqu’il est disponible. Construction, suspension et reprise du contexte gèrent les erreurs/refus sans interrompre le gameplay ; le jeu peut continuer sans sortie audio. Il ne s’agit pas d’une mesure de niveau sonore ni d’une certification du mix.

## 11. Sauvegarde

`SaveStore._normalize()` valide types, bornes, identifiants, profondeur et taille des données selon le schéma ; les clés de prototype et champs inconnus sont refusés ou réparés selon le mode. La clé reste `nexus-of-torment-save-v1`. `activeRun` porte le checkpoint inter-vague ; `_validateActiveRun()` contrôle les identifiants, positions, inventaires et statistiques avant reprise. Mort, victoire et abandon suppriment ce checkpoint.

Un chargement corrompu préserve la valeur d’origine en mémoire et tente une copie sous `nexus-of-torment-save-v1:recovery`. Les états `available`, `dirty`, `recovered` et `error` sont communiqués à l’UI par `nt-save-status` ; une écriture échouée ne vaut jamais confirmation de sauvegarde.

`exportJSON()` fournit un dossier canonique. `importJSON()` rejette les données invalides et les contenus supérieurs à 262 144 caractères ; l’UI limite aussi le fichier à 256 Kio. L’écriture du candidat précède son remplacement en mémoire, donc un échec conserve le dossier précédent. Les achats de greffes persistantes restaurent fragments et rang si `save()` échoue ; cette méthode conserve l’identité de la racine pour permettre le rollback. Aucun stockage cloud n’intervient.

## 12. Budgets de performance

La version vise :

- 24 à 46 ennemis actifs selon la vague ;
- 2 100 particules au maximum ;
- environ 300 à 500 appels de dessin dans une scène dense ;
- géométries volontairement peu polygonales ;
- résolution interne à 70 %, 100 % ou 135 % ;
- aucun appel API ni ressource distante obligatoire pendant la partie.

La porte locale exige 1280 × 720 natif, un renderer matériel, trois échantillons d’au moins 24 FPS et une médiane d’au moins 30 FPS. Les mesures exactes et le binaire réellement utilisé sont conservés dans `docs/QA_BROWSER_1.2.json` ; elles ne constituent pas une garantie pour d’autres appareils.

## 13. Validation

```bash
npm run check
npm run audit
npm run runtime-smoke
npm run contracts
npm run http-smoke
npm test
npm run build
node tools/build-smoke.mjs
npm run qa:browser
npm run qa:release
```

- `check` compile syntaxiquement chaque script avec `vm.Script`.
- `audit` contrôle les fichiers, ressources, IDs HTML, versions, inventaires et contrats PWA sans dépendre d’une ancienne preuve navigateur.
- `runtime-smoke` charge le vrai code dans une VM et teste 72 comportements déterministes ; les éliminations de progression sont injectées, sans prétention de mesure d’équilibrage.
- `contracts` complète ce socle par les comportements de combat, transformations de rendu, présentation, sauvegarde/audio et UI. Les tests UI exécutent les vrais `UIManager`/`SaveStore` sur un DOM minimal construit depuis `index.html`, sans prétendre vérifier la mise en page.
- `http-smoke` lance le serveur sur un port libre et vérifie 5 comportements HTTP.
- `build` produit l’artefact statique `dist`.
- `build-smoke.mjs` exécute deux builds et vérifie leur identité octet par octet, le SHA-256, LF/CRLF, les assets, le shell complet et l’absence de modification du SW source.
- `qa:browser` exécute les parcours Google Chrome desktop, mobile tactile émulé, menus, import/export, reprise graphique, PWA et hors-ligne. Le décompte courant vient du rapport JSON, pas d’une valeur figée dans la documentation.
- `qa:release` enchaîne les contrôles locaux, la build, Chrome, puis `audit:release` sur la preuve fraîche (parcours critiques, captures, absence d’erreurs et performance matérielle native).
- la preuve structurée active est consignée dans `docs/QA_BROWSER_1.2.json`.

Les scénarios de progression injectent des états/éliminations pour couvrir les transitions. Ils ne constituent ni une campagne humaine sans assistance, ni un essai sur téléphone physique/Safari, ni une certification commerciale.

La CI installe le lockfile avec `npm ci`, vérifie le manifeste du checkout et exécute les parcours fonctionnels desktop/mobile/PWA ; ses preuves sont conservées comme artefact depuis `.qa/ci/`. `NEXUS_QA_SOFTWARE_RENDERER=1` y sélectionne explicitement le driver CPU SwANGLE de Chrome, sans modifier le lancement GPU par défaut. Son seuil de cadence est explicitement relâché pour ce renderer logiciel ; elle ne remplace pas la porte matérielle locale. Une QA sur URL explicite écrit dans `.qa/production/`, sans écraser la preuve locale. Après la dernière QA, `npm run manifest` puis `npm run manifest:check` figent et vérifient l’intégrité des seuls fichiers suivis ou destinés au commit ; les fichiers ignorés et secrets `.env*` sont exclus. Les empreintes portent sur les contenus Git canoniques : textes déclarés dans `.gitattributes` en LF et binaires inchangés, indépendamment des fins de ligne du checkout Windows.

## 14. Hébergement statique

Le déploiement publie `dist` sur un hébergeur statique. Aucun secret, backend, compte, base de données ou variable d’environnement n’est nécessaire. `server.mjs` est uniquement un confort local et applique une protection contre la traversée de répertoire.

`manifest.webmanifest` décrit l’installation autonome. Le service worker produit utilise `nexus-of-torment-build-<sha256>` comme nom de cache. `cache.addAll(APP_SHELL)` installe ensemble HTML, CSS, scripts, icône et illustration. Sans `skipWaiting`, les onglets existants conservent leur révision ; fermer tous les onglets puis rouvrir en ligne permet l’activation suivante.

Les navigations et ressources connues viennent du shell installé, même en ligne. Un cache-miss renvoie un 503 textuel contrôlé plutôt que de mélanger un module distant plus récent. Les requêtes hors shell restent réseau avec fallback 503. Le SW est servi sans cache HTTP ; HTTPS ou localhost est requis pour son enregistrement, pas l’ouverture directe en `file://`.
