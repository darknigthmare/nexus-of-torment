# Rapport QA — build 1.1.0 « Liturgie nerveuse »

**Date de validation :** 11 août 2026  
**Cible navigateur :** Chromium 144  
**API graphique :** WebGL 2.0 / OpenGL ES 3.0 Chromium  
**Résolution :** 1280 × 720

## Résultat global

**VALIDÉ** — les nouveaux contenus sont intégrés au code réel, les mécaniques déterministes passent, le serveur local répond correctement et le scénario Chromium s’exécute sans exception JavaScript détectée.

## 1. Suite automatisée locale

Commande :

```bash
npm test
```

La commande enchaîne quatre niveaux de contrôle.

### Vérification syntaxique

Les dix scripts du moteur et du jeu sont compilés avec `vm.Script` :

- `src/core/math.js`
- `src/core/engine.js`
- `src/core/audio.js`
- `src/game/data.js`
- `src/game/arena.js`
- `src/game/entities.js`
- `src/game/weapons.js`
- `src/game/ui.js`
- `src/game/game.js`
- `src/main.js`

### Audit de structure

L’audit contrôle :

- présence et taille des fichiers requis ;
- alignement des versions ;
- résolution des ressources HTML ;
- absence de scripts ou styles distants ;
- unicité des identifiants HTML ;
- inventaires de classes, armes, castes, vagues, greffes, difficultés et stations ;
- slots d’armes uniques ;
- présence de deux boss ;
- compatibilité des castes standards avec le directeur ;
- présence des mécaniques spéciales des armes rituelles ;
- documentation des commandes 1–6 et de la mêlée.

### Runtime smoke — 23 comportements

Le code réel est chargé dans une VM JavaScript avec des services de rendu simulés. Sont validés :

| Domaine | Contrôles principaux |
|---|---|
| Arène | 7 stations, armurerie Vesper, armurerie Sanctificateur |
| Directeur | Gardien vague 5, Archidiacre vague 10, types résolus |
| Écorché | réduction frontale exacte et vulnérabilité arrière |
| Vesper | tir, dégâts, traction, slow et arc de chaîne |
| Sanctificateur | tir, brûlure, DPS persistant |
| Mêlée | action, dégâts et étourdissement |
| Archidiacre | hitbox tête, projectile, zones, Souillure, slow, transition phase 3 et renforts |
| Viewmodels | assemblage des deux nouvelles armes et traceurs |

### HTTP smoke — 5 comportements

Un serveur temporaire est démarré sur un port libre puis arrêté automatiquement.

- page principale servie en HTML ;
- scripts servis avec le bon type MIME ;
- CSS servi correctement ;
- ressource absente renvoyée en 404 ;
- tentative de traversée de répertoire bloquée.

## 2. Parcours Chromium 1.1

La politique administrateur du Chromium de l’environnement bloque toute navigation HTTP et `file://`. Pour ne pas confondre cette restriction avec un défaut du jeu, la validation est séparée en deux parties :

1. `http-smoke.mjs` vérifie le vrai serveur et ses fichiers.
2. Les contenus exacts de `index.html`, `styles.css` et des dix scripts sont injectés dans un document Chromium vierge autorisé, puis exécutés dans le moteur réel du navigateur.

Cette méthode utilise le vrai DOM, le vrai WebGL 2, les shaders, les buffers, la boucle `requestAnimationFrame`, le HUD et le rendu du jeu. Le verrouillage réel du pointeur n’est pas demandé par le harness injecté ; l’état d’entrée est activé directement pour les tirs de contrôle.

### État du menu

| Test | Résultat |
|---|---|
| Création du jeu | Réussi |
| Contexte WebGL 2 | Réussi |
| Écran de fallback masqué | Réussi |
| Menu principal visible | Réussi |
| 6 armes chargées | Réussi |
| 11 castes chargées | Réussi |
| 7 stations construites | Réussi |

### Scénario fonctionnel

| Test | Mesure |
|---|---:|
| Vesper — dégâts | 134,64 |
| Vesper — attraction | environ 0,91 unité |
| Vesper — entrave | 1,65 seconde |
| Sanctificateur — brûlure | 2,25 secondes |
| Sanctificateur — DPS de brûlure | 35,2 |
| Coup de crosse — dégâts | 67 |
| Coup de crosse — stun | 0,62 seconde |
| Boss de vague 5 | Gardien du Seuil |
| Boss de vague 10 | Archidiacre des Nerfs |
| Pièces du modèle Archidiacre | 22 |

### État de rendu final

- état de jeu : `playing` ;
- barre de boss visible ;
- HUD de l’arme : `SANCTIFICATEUR` ;
- trois entités actives ;
- 376 appels de dessin ;
- 12 146 triangles ;
- canvas 1280 × 720 ;
- fallback WebGL masqué ;
- **aucune exception ou erreur console**.

Le résultat structuré est conservé dans `docs/QA_BROWSER_1.1.json`.

## 3. Défaut découvert pendant la passe

Le premier test de hitbox a révélé que la grande sphère corporelle de l’Archidiacre interceptait certains tirs dirigés vers sa tête. La build a été corrigée en :

- alignant les offsets sur le modèle suspendu ;
- ajoutant une priorité de tête limitée lorsque les deux sphères se chevauchent ;
- ajoutant un test de non-régression dédié.

## 4. Captures produites

- `screenshots/menu-1.1.png`
- `screenshots/gameplay-1.1.png`

Les anciennes captures 1.0 sont conservées à titre de comparaison.

## 5. Périmètre et limites connues

Cette build cible le solo clavier/souris sur navigateur de bureau. Elle ne comprend pas :

- multijoueur réseau ;
- support manette natif ;
- exécutable Unreal Engine ou Steam ;
- plusieurs arènes ;
- campagne scénarisée ;
- sauvegarde cloud.

Le rendu est volontairement procédural et facetté afin de rester autonome, léger et entièrement modifiable sans pipeline d’assets externe.

## 6. Checklist de régression

Après toute modification majeure :

1. lancer `npm test` ;
2. lancer le jeu par `start-game.bat` ;
3. vérifier le verrouillage du pointeur ;
4. tester ZQSD et WASD ;
5. tirer avec les six armes ;
6. tester `V`, `G`, `Q` et `E` ;
7. vider une vague et choisir une greffe ;
8. atteindre ou forcer les vagues 5 et 10 ;
9. vérifier la sauvegarde après rechargement ;
10. tester les qualités 70 %, 100 % et 135 %.
