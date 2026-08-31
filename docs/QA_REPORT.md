# Rapport QA — 1.2.0 « Liturgie nerveuse »

Date : 31 août 2026. Périmètre : jeu solo WebGL 2, Chrome desktop et tactile émulé.

## Résultats locaux

La commande de publication est `npm run qa:release`. Les preuves actives se trouvent dans [QA_BROWSER_1.2.json](QA_BROWSER_1.2.json), et les scénarios restent reproductibles dans `tools/`.

| Suite | Résultat |
|---|---:|
| Scripts de jeu : syntaxe | 10/10 |
| Audit statique | 88/88 |
| Gameplay historique, inchangé | 72/72 |
| Combat, accessibilité ennemie et progression | 41/41 |
| Animation sans dérive | 33/33 |
| Lumières, télégraphes et flashes | 27/27 |
| Sauvegarde, audio, cycle de vie et PWA | 73/73 |
| Interface et transactions | 28/28 |
| Serveur HTTP local | 5/5 |
| Build et intégrité de révision | 9/9 |
| Chrome réel, parcours desktop/mobile/PWA | 60/60 |
| Audit final de la preuve navigateur | 95/95 |

Les six suites comportementales totalisent **274 scénarios déterministes**. Les audits statiques et de release sont séparés : leurs assertions se recoupent et ne sont pas des parties jouées.

## Ce qui est réellement testé

### Gameplay et combat

Le vrai code est chargé dans une VM avec un service de rendu simulé. Les tests préexistants restent inchangés. Les nouvelles régressions reproduisent les têtes intouchables de plusieurs castes, l’entrave résiduelle et la mêlée à travers un couvert, puis vérifient les corrections. Les onze castes et variantes élites gardent une animation bornée, des matériaux réversibles et leurs silhouettes de base. Le cercle du Gardien apparaît avant l’impact, au rayon exact des dégâts.

Douze campagnes couvrent trois secteurs et quatre difficultés : dix vagues, objectifs, deux boss, greffes, stations, checkpoint, extraction et victoire. Les éliminations et déplacements d’objectif sont injectés : ces scénarios prouvent les contrats du directeur, pas une campagne gagnée par un joueur ni une mesure de difficulté.

### Sauvegarde et récupération

Les tests emploient le vrai `SaveStore` : sous-objets invalides, JSON corrompu, champs bornés, version future, identifiants hérités (`constructor`, `toString`, `__proto__`), import/export, reprise et refus d’écriture. L’import ne remplace jamais le dossier en mémoire si la persistance échoue. Les achats échoués rendent les fragments et le rang.

Dans Chrome, un stockage corrompu est réparé avec copie de secours et avertissement visible. Une construction d’AudioContext volontairement refusée n’empêche pas de jouer. L’extension WebGL réelle provoque une perte puis une restauration du contexte : simulation figée, bouton de rechargement conservé, checkpoint intact puis reprise proposée après reconstruction.

### Interface et mobile

Menus, briefing, réglages, export téléchargé, import confirmé/annulé/refusé, focus, confirmation d’abandon/redémarrage, nouveau run et reprise passent par leurs contrôles visibles. Les greffes n’ont plus de délai par défaut ; le chrono est optionnel et suspendu quand l’onglet est caché.

Le tactile est exercé en Chrome à **390 × 844**, puis **844 × 390** : menus secondaires accessibles, tir réellement transmis au système d’arme, stick, pause, greffe, lancement manuel de l’intermission, guidage et perte de focus. Les boutons testés mesurent au moins 44 pixels CSS. Le HUD paysage a été corrigé après inspection des captures réelles.

### PWA et réseau

Le serveur de QA reproduit la redirection Vercel `/index.html → /`. Cela a révélé un vrai `net::ERR_FAILED` lors de la reprise : la réponse HTML redirigée était mise en cache. Le service worker reconstruit désormais cette réponse sans perdre son contenu ni ses en-têtes.

La QA coupe réellement le serveur, recharge la PWA, vérifie WebGL puis un cache-miss contrôlé en 503. Tous les modules connus proviennent de la même révision installée. Le nouveau worker ne prend pas le contrôle des anciens onglets de force ; il faut fermer les onglets du jeu pour appliquer sa mise à jour.

### Build

Dix-huit fichiers statiques, dont l’illustration originale, sont publiés. Les textes sont normalisés en LF ; les binaires restent intacts. L’empreinte SHA-256 du shell inclut chemins, longueurs, contenu et SW source, puis est injectée dans le nom du cache de `dist/sw.js`. Le SW source n’est pas modifié. Deux builds identiques et l’invalidation de révision après changement sont vérifiés.

## Console et performances

Aucune erreur inattendue n’est admise. Deux signaux explicitement provoqués sont archivés à part : le 503 demandé hors ligne et le message exact de la perte WebGL volontaire. Les erreurs d’audio ou de pointeur ne sont plus ignorées par une expression générale.

Les mesures exactes de cadence, GPU, date et empreinte de build sont dans le rapport JSON. La porte matérielle locale exige **1280 × 720 natif**, renderScale 1, trois échantillons ≥24 FPS et médiane ≥30 FPS. Il s’agit d’un scénario court sur Radeon RX 6800 XT, pas d’un benchmark toutes hordes/tous appareils.

La CI Linux utilise explicitement SwANGLE logiciel pour les parcours fonctionnels. Son seuil de cadence adapté ne remplace pas la preuve GPU locale.

## Captures inspectées

![Dossier desktop](screenshots/v1.2-desktop-menu.png)

![Combat desktop](screenshots/v1.2-desktop-gameplay.png)

![Combat tactile paysage](screenshots/v1.2-mobile-landscape.png)

Autres captures : menu mobile, combat portrait, briefing, outils de sauvegarde et choix de greffes dans `docs/screenshots/`.

## Équilibrage : preuve distincte

[Audit analytique du budget](BALANCE_AUDIT.md) : 640 scénarios de tir/achat modélisés. Les 384 scénarios à 25 % / 50 % d’impacts corporels ou 65 % de tirs à la tête sont financés dans les hypothèses déclarées. À faible précision, le premier boss est le principal point de risque.

Ce modèle n’est pas un playtest : il exclut notamment les dégâts reçus en navigation réelle et plusieurs synergies. Il ne justifie pas une promesse de durée, de taux de victoire ou d’absence totale de panne sèche.

## Limites et publication

Le périmètre livré est un jeu solo d’arènes : campagne à dix vagues et extraction, mode sans fin, trois secteurs sélectionnables, six armes, onze castes dont deux boss, progression persistante et sauvegarde locale. Il ne comprend pas réseau multijoueur, manette native, cloud save ni backend de boutique.

Pas de téléphone physique, Safari, test utilisateur externe, session humaine complète ni certification console/store/accessibilité/épilepsie effectués. La création OpenAI est une illustration du dossier, jamais une capture promotionnelle présentée comme gameplay. Ces limites ne doivent pas être masquées par le terme « commercial ».

La production est vérifiée séparément après déploiement avec `npm run qa:production` : octets des 18 fichiers comparés à `dist`, MIME, sécurité HTTP, 404 et nouvelle passe Chrome. Les résultats sont écrits dans `.qa/production/` sans remplacer les preuves locales. Ce rapport local ne présume pas le succès d’un déploiement futur.
