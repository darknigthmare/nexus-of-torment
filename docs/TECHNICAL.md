# Documentation technique — build 1.1.0

## 1. Principes

Le jeu fonctionne sans bundler et sans dépendance d’exécution. Les scripts classiques sont chargés dans un ordre déterministe et enregistrent leurs modules dans `window.NT`. Cette architecture permet :

- une ouverture directe depuis `index.html` ;
- un hébergement statique ;
- une modification sans compilation ;
- un audit simple de toutes les ressources ;
- un package autonome sans CDN.

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
- entrées clavier, souris et verrouillage du pointeur ;
- sauvegarde locale fusionnée avec les valeurs par défaut.

Le fragment shader produit les matières acier, chair, rune et voile à partir de fonctions procédurales. Aucun fichier de texture n’est chargé.

## 3. Mathématiques et collisions

`src/core/math.js` contient :

- `Vec3` ;
- matrices 4 × 4 ;
- interpolation amortie ;
- base de caméra ;
- rayons contre sphères et AABB ;
- résolution cercle/AABB ;
- sélection pondérée et utilitaires aléatoires.

Le joueur et les ennemis utilisent des collisions horizontales adaptées à une arène horde. Les tirs sont des raycasts triés par distance, limités par le premier obstacle du monde et capables de pénétrer plusieurs cibles.

### Hitboxes

Une entité utilise une sphère corporelle et une sphère de tête. L’Archidiacre possède des offsets spécifiques correspondant à son modèle suspendu :

- corps : `position.y + 0.52` ;
- tête : `position.y + 1.55`.

Lorsque la grande sphère corporelle chevauche la tête, une priorité locale permet de conserver les headshots sans réduire artificiellement le volume du boss.

## 4. Entités

### Joueur

`Player` gère :

- déplacement, sprint, saut et collisions ;
- santé, armure et Souillure ;
- recul et tremblement de caméra ;
- doctrines et capacités ;
- modificateurs de run ;
- ralentissement, traction et invulnérabilité.

### Ennemis

`Enemy` est data-driven. Le comportement est sélectionné par caste et fonctionne par petits états : poursuite, maintien de distance, charge, téléportation, slam, invocation et contrôle de zone.

Ajouts 1.1 :

- `_updateFlayed()` : préparation, lunge, impact et ralentissement ;
- `_updateArchdeacon()` : maintien aérien, tirs multi-projectiles, zones de chaîne, Souillure, slow, transitions et invocations ;
- `ignite()` : brûlure avec DPS, durée et tick indépendant ;
- blindage frontal directionnel dans `takeDamage()`.

Les visuels sont des listes de pièces locales rattachées à une matrice racine. L’Archidiacre comporte 22 pièces procédurales.

### Projectiles et pickups

`Projectile` supporte :

- tirs hostiles ;
- crochets ;
- projectiles de corruption ;
- grenades rebondissantes ;
- explosion radiale.

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
  STATIONS
};
```

La build 1.1.0 déclare :

- 3 classes ;
- 6 armes ;
- 11 castes ;
- 7 modificateurs ;
- 20 greffes ;
- 6 améliorations persistantes ;
- 4 difficultés ;
- 7 stations physiques.

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

## 7. Arène

`Arena` construit le décor, les colliders, les spawn points, les dangers et les stations. Les éléments sont générés une seule fois et répartis entre pièces statiques et dynamiques.

La 1.1 ajoute deux armureries :

```text
armory-chainlance  → (-14.5, 0, -4)
armory-exorcist    → ( 14.5, 0, -4)
```

Les frappes de chaînes sont planifiées sous forme de hazards télégraphiés avant impact.

## 8. Directeur de partie

`src/game/game.js` orchestre :

- états menu, jeu, pause, greffe, mort et résultat ;
- directeur de vagues et file d’apparition ;
- sélection de modificateur ;
- économie et récompenses ;
- effets temporaires ;
- progression de carrière ;
- rendu global et éclairage ;
- reprise, redémarrage et retour au menu.

### Sélection des boss

```javascript
wave % 10 === 0 ? 'archdeacon' : 'gatekeeper'
```

La condition n’est évaluée que sur les vagues multiples de 5. Le boss est placé au début de la file, puis les renforts restants sont mélangés.

## 9. Interface

`UIManager` ne dépend pas du moteur de rendu 3D. Le HUD est en HTML/CSS afin de conserver une typographie nette et une mise à l’échelle flexible. La 1.1 expose six slots, le coup de crosse et les descriptions mécaniques de Vesper et du Sanctificateur dans le Codex.

## 10. Audio

`AudioManager` utilise Web Audio : oscillateurs, bruit généré, filtres, enveloppes, panoramique stéréo et bus séparés. Le contexte n’est créé qu’après une interaction. Les sons 1.1 comprennent :

- impulsion métallique et tension de chaîne pour Vesper ;
- faisceau aigu filtré pour le Sanctificateur ;
- impact court pour la mêlée.

## 11. Sauvegarde

`SaveStore` effectue une fusion profonde entre les valeurs par défaut et les données existantes. La clé reste `nexus-of-torment-save-v1`, ce qui conserve les sauvegardes 1.0. Les nouvelles armes sont des achats de run et ne nécessitent aucun nouveau champ persistant.

## 12. Budgets de performance

La version vise :

- 24 à 46 ennemis actifs selon la vague ;
- 2 100 particules au maximum ;
- environ 300 à 500 appels de dessin dans une scène dense ;
- géométries volontairement peu polygonales ;
- résolution interne à 70 %, 100 % ou 135 % ;
- aucune requête réseau pendant la partie.

Le scénario Chromium 1.1 avec l’Archidiacre, deux castes et le Sanctificateur a produit 376 appels de dessin et 12 146 triangles à 1280 × 720.

## 13. Validation

```bash
npm run check
npm run audit
npm run runtime-smoke
npm run http-smoke
npm test
```

- `check` compile syntaxiquement chaque script avec `vm.Script`.
- `audit` contrôle les fichiers, ressources, IDs HTML, versions et inventaires.
- `runtime-smoke` charge le vrai code dans une VM et teste 23 comportements déterministes.
- `http-smoke` lance le serveur sur un port libre et vérifie 5 comportements HTTP.
- la passe Chromium est consignée dans `docs/QA_BROWSER_1.1.json`.

## 14. Hébergement statique

Le dossier peut être déployé tel quel sur un hébergeur statique. Aucun secret, backend, compte, base de données ou variable d’environnement n’est nécessaire. `server.mjs` est uniquement un confort local et applique une protection contre la traversée de répertoire.
