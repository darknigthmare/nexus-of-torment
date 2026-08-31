# Changelog

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

### UX, accessibilité et PWA

- Ajout des commandes tactiles de déplacement, visée, tir, armes, capacité, grenade, mêlée, interaction, saut, course et pause.
- Ajout d’une reprise explicite du verrouillage du pointeur sur desktop.
- Ajout des réglages d’échelle du HUD, d’intensité des secousses, de mouvement réduit, de contraste UI, de contraste ennemi et de sous-titres.
- Ajout du manifeste installable, de l’icône originale, du service worker et du cache autonome avec fallback hors ligne.
- Ajout de la build statique `dist` et du pipeline CI/release.

### Qualité vérifiée

- Audit statique : **77/77** ; audit de release après preuve navigateur : **83/83**.
- Runtime smoke : **72/72**, dont les 34 contrats précédents préservés.
- HTTP smoke : **5/5**.
- QA Google Chrome réel : **35/35**, couvrant desktop 1280 × 720, mobile tactile émulé 390 × 844, campagne, survie infinie, trois secteurs, quatre difficultés, boss 5/10, checkpoint/reprise, mort, extraction/victoire et PWA hors ligne. Les fixtures et limites de cette couverture sont détaillées dans `docs/QA_REPORT.md`.
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
