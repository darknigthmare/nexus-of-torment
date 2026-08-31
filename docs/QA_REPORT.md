# Rapport QA — build 1.2.0 « Liturgie nerveuse »

**Date de validation :** 31 août 2026
**Navigateur réel :** Google Chrome, piloté par Playwright Core
**API graphique :** WebGL 2 via ANGLE Direct3D 11
**Desktop :** 1280 × 720
**Mobile tactile émulé dans Chrome :** 390 × 844

## Résultat global

**VALIDÉ LOCALEMENT** — `npm run qa:release` passe intégralement : audit statique **77/77**, runtime **72/72**, HTTP **5/5**, build statique réussie, Chrome **35/35**, puis audit de release **83/83**. Aucune erreur inattendue ne reste après le filtrage documenté ci-dessous.

La preuve structurée active est `docs/QA_BROWSER_1.2.json`. Les preuves 1.1 restent historiques et ne constituent plus la gate de release.

## 1. Pipeline automatisé

Commande finale :

```bash
npm run qa:release
```

Elle enchaîne :

1. vérification syntaxique des dix scripts ;
2. audit du contenu, des inventaires et des contrats UI/PWA, indépendant des anciennes preuves ;
3. 72 tests déterministes du runtime ;
4. 5 tests du serveur HTTP ;
5. génération de `dist` ;
6. 35 contrôles dans une instance réelle de Google Chrome ;
7. audit de release de la preuve locale fraîche : version, parcours critiques, captures, erreurs et performance native matérielle.

### Audit statique — 77/77 ; audit de release — 83/83

L’audit vérifie notamment :

- présence des fichiers et des captures de release 1.2 ;
- alignement des versions ;
- absence de dépendance d’exécution distante ;
- unicité des IDs et contrat complet entre HTML et `UIManager` ;
- manifeste PWA, icône, service worker et cache du cœur statique ;
- 3 doctrines, 6 armes, 11 castes, 2 boss, 4 difficultés, 7 modificateurs, 20 greffes, 6 améliorations persistantes, 7 stations et 3 secteurs ;
- contrat de campagne : 3 objectifs standards et 10 vagues ;
- déclaration du pipeline `qa:release` et preuve Chrome 1.2 réussie.

### Runtime — 72/72

Le code réel est chargé dans une VM JavaScript avec des services graphiques simulés. La suite couvre :

- sept stations physiques, armureries Vesper et Sanctificateur ;
- tir des deux armes rituelles, attraction, entrave, brûlure, mêlée et blindage frontal de l’Écorché ;
- hitbox, projectiles psychiques, zones, ralentissement et phases de l’Archidiacre ;
- enchaînement purge → greffe → préparation → maintien → chasse dans les quatre difficultés ;
- maintien hors du sceau, purge des survivants et chasse avec renfort marqué anti-blocage ;
- Gardien du Seuil à la vague 5 et Archidiacre des Nerfs à la vague 10 ;
- plafond des renforts de boss, invulnérabilité d’apparition et remise en position ;
- intermission manuelle/automatique, délais anti-clic et impossibilité de sauter une vague ;
- checkpoint borné, reprise en position sûre dans la Nef, extraction, victoire et continuation infinie ;
- récompenses distinctes de mort/victoire/abandon, conservation des records et finalisation unique sans double paiement.

Les éliminations des scénarios de progression sont injectées via les méthodes réelles de dégâts. Ces tests ne démontrent ni l’équilibrage de parties intégrales, ni toutes les collisions/grenades, ni les performances graphiques.

### HTTP — 5/5

- page principale servie en HTML ;
- scripts avec le type MIME attendu ;
- CSS servi correctement ;
- ressource absente en 404 ;
- traversée de répertoire bloquée.

## 2. Parcours Google Chrome — 35/35

Le runner sert l’artefact `dist`, lance Chrome headless avec le GPU matériel, exerce les interfaces visibles et inspecte l’état réel du moteur WebGL 2. Les menus, réglages, reprise, nouvelle tentative et entrées tactiles passent par l’UI. Les scénarios de boss, checkpoint, mort et victoire utilisent aussi des fixtures runtime pour atteindre ces états : ce ne sont pas des campagnes intégrales jouées sans assistance. La capture du pointeur ou son écran de reprise est vérifié ; le runner force ensuite le drapeau d’entrée pour les scénarios desktop automatisés.

### Desktop

| Parcours | Résultat vérifié |
|---|---|
| Boot | HTTP 200, WebGL 2 actif, fallback masqué |
| Menu | 3 classes, 4 difficultés, 2 modes, 3 secteurs |
| Accessibilité | mouvement réduit, contrastes, sous-titres et focus appliqués |
| Déploiement UI | campagne, Nef des Sutures, difficulté Liturgie rouge |
| Entrée | verrouillage du pointeur ou reprise explicite |
| Difficultés | santé et dégâts croissants sur les quatre niveaux |
| Secteurs | trois espaces instanciés avec départs distincts |
| Boss | Gardien vague 5, Archidiacre vague 10 |
| Sauvegarde | checkpoint écrit, bouton de reprise après rechargement, état restauré |
| Mort | écran de résultats puis nouvelle tentative |
| Victoire | boss final, extraction, résultat et nettoyage de la sauvegarde active |
| Continuation | passage propre de la victoire à la survie sans fin |

### Mobile tactile

Le parcours 390 × 844 vérifie :

- menu sans débordement horizontal ;
- démarrage par l’UI en mode infini, difficulté Nexus ouvert, Ossuaire des Crochets ;
- commandes tactiles visibles ;
- cible FEU d’au moins 44 px et tir transmis au système d’arme ;
- stick de déplacement opérationnel ;
- pause tactile ;
- capture du combat.

### PWA et vraie coupure réseau

La suite attend le service worker, confirme son contrôle et le cache `nexus-of-torment-v1.2.0`, coupe réellement le serveur local, puis recharge le jeu. Le menu redémarre hors ligne avec WebGL 2 actif. Une ressource non mise en cache reçoit le fallback contrôlé **503** « hors ligne ».

### Console

Après exclusion des restrictions attendues liées à l’activation utilisateur de l’audio ou du verrouillage du pointeur, aucune erreur console, `pageerror`, erreur mobile ou requête réseau inattendue n’est enregistrée.

## 3. Mesures du scénario desktop

| Mesure | Valeur |
|---|---:|
| Médiane | 60 FPS |
| Échantillons | 60 / 60 / 60 FPS |
| Appels de dessin | 284 |
| Triangles | 8 800 |
| Viewport | 1280 × 720 |
| GPU exposé | AMD Radeon RX 6800 XT |
| Backend | ANGLE Direct3D 11 |

Ces valeurs décrivent ce run de QA précis ; elles ne constituent pas une promesse universelle pour d’autres appareils.

La porte de publication exige une médiane ≥30 FPS, chaque échantillon ≥24 FPS, une échelle de rendu de 1 et un buffer 1280 × 720 sur renderer matériel. La CI GitHub exécute les parcours fonctionnels avec seuils adaptés à son renderer logiciel ; elle ne remplace pas cette mesure locale.

## 4. Captures produites

- `docs/screenshots/v1.2-desktop-menu.png`
- `docs/screenshots/v1.2-desktop-gameplay.png`
- `docs/screenshots/v1.2-mobile-gameplay.png`

## 5. Périmètre restant

La release couvre le solo desktop/mobile, la campagne, le mode infini, trois secteurs, la sauvegarde locale, l’accessibilité et le hors-ligne. Elle ne comprend pas le multijoueur réseau, la manette native, la sauvegarde cloud, le matchmaking, un backend ou une boutique en ligne. Le tactile est vérifié en émulation Chrome, pas sur un téléphone physique ou Safari. L’équilibrage ressenti sur de longues sessions reste distinct des contrats automatisés vérifiés ici.

Les vérifications d’URL de production écrivent dans `.qa/production/`, sans remplacer cette preuve locale. Ce rapport ne présume pas le résultat d’un déploiement futur.

## 6. Checklist de régression

Après toute modification majeure :

1. lancer `npm run qa:release` ;
2. vérifier que les quatre sous-suites locales et Chrome restent sans échec ;
3. contrôler les trois captures de release ;
4. jouer au moins une vague de chaque objectif ;
5. vérifier les boss 5/10, la mort/reprise et l’extraction ;
6. tester desktop et mobile tactile ;
7. confirmer le redémarrage PWA après coupure réelle du serveur ;
8. régénérer `MANIFEST.sha256` avec `npm run manifest`, puis exécuter `npm run manifest:check` ;
9. après publication, contrôler HTTP et relancer `npm run qa:browser -- https://nexus-of-torment.vercel.app/`.
