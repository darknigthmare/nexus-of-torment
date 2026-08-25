# Changelog

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
