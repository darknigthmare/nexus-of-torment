# Roadmap et extensions possibles

## État livré

### 1.0.0 — Fondation

- moteur WebGL 2 autonome ;
- arène de confinement ;
- trois doctrines ;
- quatre armes ;
- Gardien du Seuil ;
- vagues, modificateurs, greffes et métaprogression.

### 1.1.0 — Liturgie nerveuse

- Vesper ;
- Sanctificateur ;
- coup de crosse ;
- L’Écorché Liturgique ;
- Archidiacre des Nerfs ;
- alternance des boss ;
- deux nouvelles armureries ;
- suite de tests fonctionnels et HTTP.

## Axe 1 — Diversité de cartes

- **Chapelle de Chair** : nef étroite, autels destructibles et voies latérales.
- **Atelier du Supplice** : convoyeurs, presses et machines réactivables.
- **Galerie des Crochets** : verticalité, plateformes et zones de suspension.
- **Cœur du Nexus** : géométrie instable et boss final inédit.

Chaque carte devrait conserver les mêmes interfaces de stations et spawn points pour réutiliser le directeur existant.

## Axe 2 — Objectifs de vague

- protéger un générateur ;
- interrompre plusieurs relais ;
- transporter une cellule de confinement ;
- purger une zone sans quitter un cercle ;
- extraction après un temps limité ;
- vagues sans boutique ou avec arsenal imposé.

## Axe 3 — Arsenal

Les deux anciennes pistes « lance-chaînes » et « projecteur exorciste » sont désormais livrées. Les extensions restantes pourraient être :

- scie sanctifiée de mêlée ;
- lance-grenades de confinement ;
- fusil de précision occulte ;
- variantes de munitions ;
- maîtrises propres à chaque arme ;
- rechargements alternatifs ou surchauffe.

## Axe 4 — Accessibilité et contrôles

- support manette natif ;
- remapping complet ;
- réglage de la taille du HUD ;
- mode contraste élevé des ennemis ;
- réglage indépendant des secousses ;
- sous-titrage étendu des signaux audio.

## Axe 5 — Coopération

- autorité serveur sur vagues et dégâts ;
- deux à quatre opérateurs ;
- réanimation et états à terre ;
- scaling par nombre de joueurs ;
- ping contextuel ;
- Essence individuelle ou partagée ;
- synergies de doctrines.

Le réseau demanderait une refonte de la simulation et n’est pas inclus dans le cœur WebGL actuel.

## Axe 6 — Contenu long terme

- défis hors ligne déterministes ;
- contrats de doctrine ;
- mutations hebdomadaires générées par seed ;
- pages de journal ;
- statistiques d’armes ;
- cosmétiques procéduraux sans microtransaction.

## Axe 7 — Port natif

Le modèle data-driven, le directeur de vagues et les états d’IA peuvent servir de référence à un port Unreal Engine 5 ou Godot.

Pour Unreal Engine :

- `data.js` → Data Tables ou Primary Data Assets ;
- `Enemy.update()` → Behavior Trees, State Trees ou composants Blueprint ;
- `Arena` → niveau modulaire et acteurs de station ;
- `WeaponSystem` → composants d’arme, traces et Gameplay Tags ;
- greffes → Gameplay Ability System ou composants de stats ;
- progression → `USaveGame`.

Le port natif remplacerait progressivement les géométries procédurales par des assets haute définition tout en conservant les règles et le tuning de cette build comme référence jouable.
