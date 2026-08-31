# Game Design Document — Nexus of Torment

**Version :** 1.3.0 « Liturgie nerveuse »
**Genre :** FPS 3D / horde survival horror / progression roguelite  
**Mode :** solo  
**Plateforme de cette édition :** navigateur desktop et mobile WebGL 2, PWA hors ligne

## 1. Vision

Le joueur incarne un opérateur de confinement envoyé dans le Nœud 07, une installation industrielle progressivement réécrite par une dimension rituelle. Chaque vague augmente non seulement le nombre d’adversaires, mais aussi la variété des menaces, le contrôle de l’espace et la pression de la Souillure.

Le jeu repose sur quatre piliers :

1. **Gunplay lisible et matériel** : chaque arme possède une cadence, une portée, une dispersion, un recul, une chute de dégâts et une fonction tactique identifiable.
2. **Pression spatiale** : les castes poussent, tirent, attirent, chargent, buffent, encerclent ou contaminent.
3. **Décisions de survie** : l’Essence est limitée et doit être répartie entre soins, munitions, surcharge défensive et nouvelles armes.
4. **Horreur systémique** : Souillure, hallucinations, brouillard, chaînes, architecture organique et boss transforment la perception de chaque secteur.

La violence est stylisée et procédurale. Le jeu privilégie l’identité des silhouettes et le contraste des rôles plutôt qu’une reproduction réaliste d’une licence existante.

## 2. Boucle principale

### 2.1 Déploiement

Le joueur choisit une doctrine, une difficulté et l’un des trois modes :

- **Histoire — Les voix du Nœud** : dix offices dans trois secteurs successifs, deux décisions aux contreparties explicites, six archives facultatives et trois épilogues ;
- **Intervention sectorielle** : dix vagues dans le secteur choisi, deux offices de boss, extraction et victoire ;
- **Survie sans fin** : progression sans extraction finale.

Il commence avec le WARD-9, Absolution, deux grenades et les bonus obtenus par la métaprogression.

### 2.2 Vague

Le directeur reçoit un budget dépendant de la vague et de la difficulté. Il sélectionne les castes déverrouillées selon leur coût et leur poids, ajoute une probabilité de variante élite puis mélange la file d’apparition. Un plafond dynamique limite les entités simultanées afin de conserver la lisibilité et les performances.

Les vagues standards sectorielles alternent trois familles d’objectif :

- **Purge** : éliminer toutes les signatures ;
- **Maintien** : rester dans le sceau jusqu’à stabilisation, puis éliminer les survivants ;
- **Chasse** : abattre en priorité les signatures marquées, puis purger le reste.

Les renforts de maintien et de chasse empêchent l’objectif de se bloquer si une cible disparaît ou reste inaccessible. Les vagues multiples de cinq remplacent cette rotation par un objectif de boss.

L’Histoire utilise une séquence scénarisée : purge, maintien, chasse, relais, Gardien, chasse, transport, maintien, purge, Archidiacre. Le relais de l’office 4 impose trois positions successives (2,5 secondes chacune). Le transport de l’office 7 se prend avec Interagir et se livre à la borne opposée (maintien de 3 secondes), avec une vitesse de déplacement multipliée par 0,78. Les deux objectifs possèdent des renforts limités puis une purge des survivants.

### 2.3 Combat

Le joueur alterne :

- tir à la hanche ou visée ;
- déplacement, sprint et saut ;
- changement d’arme ;
- grenade ;
- capacité de doctrine ;
- coup de crosse ;
- utilisation des stations.

Les ennemis récompensent les tirs à la tête, l’angle d’attaque, la portée adaptée et la priorité de cible.

### 2.4 Intermission

Une vague purgée donne de l’Essence, un soin partiel, de l’armure, une grenade et un choix de greffe. Une intermission jouable de 20 secondes laisse les stations accessibles ; le joueur peut lancer l’office suivant avec `Entrée` ou `F`, sinon le compte à rebours le fait automatiquement.

### 2.5 Boss et continuation

Un boss apparaît toutes les cinq vagues :

- vagues 5, 15, 25… : **Gardien du Seuil** ;
- vagues 10, 20, 30… : **Archidiacre des Nerfs**.

En campagne, la mort de l’Archidiacre à la vague 10 ouvre un sceau d’extraction. Le joueur doit le maintenir pendant 3,2 secondes pour obtenir la victoire. Depuis l’écran de victoire, il peut prolonger la tentative en survie sans fin ; les valeurs continuent alors d’augmenter avec un scaling contrôlé.

### 2.6 Fin de tentative

La mort produit un bilan : vague, éliminations, score et fragments. La victoire produit son propre bilan et un bonus de fragments. L’abandon ne verse aucun fragment. Le joueur peut immédiatement relancer avec la même configuration ou revenir au dossier.

Entre les vagues, un checkpoint conserve l’état de la tentative. Après rechargement, le menu expose une reprise ; les données sont validées et bornées avant restauration.

## 3. Doctrines

### Rempart

- 125 santé, 80 armure.
- Vitesse légèrement réduite.
- Résistance naturelle à la Souillure.
- Réduction des dégâts sous 35 % de santé.
- **Égide cinétique** : armure immédiate et forte réduction des dégâts pendant six secondes.

### Exécuteur

- 105 santé, 45 armure.
- Dégâts de base supérieurs.
- Vitesse élevée.
- Les éliminations rapprochées restaurent de l’armure.
- **Frénésie balistique** : dégâts, cadence et recharge amplifiés pendant sept secondes.
- Bonus de 22 % aux dégâts du coup de crosse.

### Occultiste

- 92 santé, 38 armure.
- Forte résistance à la Souillure.
- Synergie directe avec le Sanctificateur.
- **Nova d’exorcisme** : dégâts de zone dépendant de la Souillure, étourdissement, soin et purification.

## 4. Arsenal

| Slot | Arme | Rôle | Chargeur | Particularité |
|---:|---|---|---:|---|
| 1 | WARD-9 | Fusil polyvalent | 30 | Automatique et stable à moyenne portée |
| 2 | Absolution | Fusil à pompe | 8 | Dix projectiles et impact rapproché |
| 3 | Spine Ripper | Mitraillette | 45 | Très forte cadence et suppression |
| 4 | Cloueur Rituel | Semi-auto lourd | 12 | Pénétration et multiplicateur de tête élevé |
| 5 | Vesper | Lance-chaînes | 6 | Attraction, ralentissement et pénétration |
| 6 | Sanctificateur | Projecteur purificateur | 52 | Brûlure, bonus psychique et scaling Souillure |

### 4.1 Paramètres communs

Chaque arme est définie par :

- dégâts ;
- cadence ;
- projectiles par tir ;
- dispersion immobile et en mouvement ;
- portée ;
- chargeur et réserve ;
- temps de recharge ;
- recul et kick visuel ;
- multiplicateur de tête ;
- pénétration ;
- début et fin de chute de dégâts ;
- prix et vague de déblocage.

### 4.2 Vesper

Vesper est une arme de contrôle à faible cadence. Un impact :

- applique un court étourdissement ;
- ralentit la cible pendant 1,65 seconde ;
- attire une cible non boss vers l’opérateur ;
- traverse une cible supplémentaire ;
- génère un arc de chaîne visible.

Elle est conçue pour isoler un Confesseur, une Cloche ou un Écorché sans neutraliser entièrement les boss.

### 4.3 Sanctificateur

Le Sanctificateur est un hitscan automatique énergique. Ses dégâts augmentent avec la Souillure du joueur. Il reçoit un bonus contre :

- Chœur des Plaies ;
- Archidiacre des Nerfs ;
- castes volantes.

Un impact applique une brûlure persistante. L’arme crée un choix risque/récompense : rester contaminé augmente sa puissance, mais dégrade la perception et la sécurité du joueur.

### 4.4 Mêlée

Le coup de crosse sur `V` possède :

- une portée de 2,65 unités ;
- un cône frontal ;
- 78 dégâts de base ;
- un étourdissement de 0,62 seconde ;
- un ralentissement bref ;
- un cooldown de 0,62 seconde ;
- une animation de déplacement du viewmodel.

La mêlée est une solution d’urgence, pas un substitut à l’arsenal.

## 5. Bestiaire et fonctions tactiques

| Caste | Vague | Fonction |
|---|---:|---|
| Le Suturé | 1 | Meute de mêlée et saturation |
| Le Porte-Crochet | 2 | Traction et rupture de position |
| Chérubin de Chair | 3 | Harcèlement aérien |
| Le Confesseur | 4 | Tir rituel longue portée |
| Ascète Broyeur | 5 | Charge lourde et ouverture de ligne |
| L’Écorché Liturgique | 5 | Avant-garde blindée et lunge |
| La Cloche Vivante | 6 | Buff des castes proches |
| Jumelle du Voile | 7 | Assassin mobile et téléportation |
| Chœur des Plaies | 8 | Souillure et pression psychique |
| Gardien du Seuil | 5 | Boss terrestre, slam, charge et invocations |
| Archidiacre des Nerfs | 10 | Boss volant, zones, corruption et relais |

### 5.1 L’Écorché Liturgique

Son reliquaire frontal réduit de 58 % les dégâts corporels reçus de face. Le blindage ne protège pas la tête et ne s’applique pas aux tirs latéraux ou arrière. Il peut préparer une charge courte, infliger des dégâts augmentés et ralentir la cible.

### 5.2 Gardien du Seuil

- **Phase 1** : poursuite, mêlée, charge ou slam.
- **Phase 2** : invocation de Porte-Crochet et renforts périodiques.
- **Phase 3** : frénésie, Jumelles du Voile et fréquence accrue des rites.

### 5.3 Archidiacre des Nerfs

Le boss reste suspendu entre environ 4,1 et 5,5 unités de hauteur et maintient une distance moyenne.

- **Phase 1** : projectile de corruption et deux zones de chaînes.
- **Phase 2** : tirs triples, trois zones, Chœur des Plaies et Écorché élite.
- **Phase 3** : cadence accélérée, quatre zones, ralentissement renforcé, Jumelle et Confesseur élite.

Sa hitbox de tête est alignée avec la couronne supérieure du modèle et obtient une priorité contrôlée lorsque la sphère corporelle la chevauche.

## 6. Souillure

La Souillure progresse par :

- aura de certaines castes ;
- projectiles psychiques ;
- rites de boss ;
- modificateurs de vague.

Conséquences :

- overlay visuel ;
- hallucinations ;
- distorsions audio et pression d’ambiance ;
- vulnérabilité tactique.

Contreparties :

- résistance de doctrine ;
- purification médicale ;
- Nova de l’Occultiste ;
- scaling offensif du Sanctificateur.

## 7. Économie et stations

| Installation | Fonction |
|---|---|
| Surcharge électrique | Dégâts de zone sur les signatures proches, cooldown important |
| Réquisition de munitions | Restaure une fraction des réserves des armes possédées |
| Purification médicale | Santé et réduction de Souillure ; ne restaure pas l’armure |
| Armurerie Spine Ripper | Déblocage à partir de la vague 3 |
| Armurerie Cloueur | Déblocage à partir de la vague 5 |
| Armurerie Vesper | Déblocage à partir de la vague 7 |
| Armurerie Sanctificateur | Déblocage à partir de la vague 9 |

Les achats utilisent l’Essence de la tentative et ne sont pas persistants.

### 7.1 Secteurs

| Secteur | Topologie | Pression principale |
|---|---|---|
| Sanctuaire de Fer | Cour de confinement autour d’un autel mécanique | Encerclement et alternance courte/moyenne portée |
| Nef des Sutures | Axe long, piliers-côtes et couvertures latérales | Tirs croisés et progression longitudinale |
| Ossuaire des Crochets | Anneau funéraire et croisements centraux | Fermeture des lignes de fuite et attaques convergentes |

Chaque secteur instancie ses propres limites, géométries, colliders, couvertures, piliers, stations, points d’apparition, position de départ et ancrages de maintien/extraction. Le directeur conserve les mêmes contrats de données entre les trois espaces.

## 8. Progression roguelite

### Greffes de run

Le pool contient 20 greffes. Elles peuvent modifier :

- dégâts ;
- cadence ;
- recharge ;
- chargeur ;
- pénétration ;
- soins ;
- vitesse ;
- économie ;
- capacité ;
- effets de chaîne ou de rupture.

Les greffes possèdent un rang maximal et sont retirées du choix lorsqu’elles sont complètes.

### Métaprogression

Depuis la 1.3, vingt accomplissements suivent les cinq objectifs, les deux boss, les extractions par secteur/doctrine/difficulté, les six archives, les trois fins et l’office 20 sans fin. Les 41 fragments de récompense au total sont attribués une seule fois par accomplissement. Aucun ancien score ne reconstitue une victoire inconnue. Une Histoire gagnée constitue une extraction de l’Ossuaire, pas trois extractions sectorielles fictives.

Six améliorations persistent : santé, dégâts, armure, Essence de départ, résistance à la Souillure et réserve de munitions. Leur coût croît avec le niveau afin de maintenir une progression longue sans supprimer la difficulté initiale.

## 9. Modificateurs de vague

- **Standard** : aucune anomalie.
- **Extinction** : brouillard resserré et visibilité réduite.
- **Frénésie** : vitesse et dégâts ennemis augmentés.
- **Hémorragie** : morts susceptibles de provoquer une rupture organique.
- **Pluie de chaînes** : zones d’impact périodiques.
- **Sacrement noir** : élites renforcées.
- **Silence liturgique** : capacités et soins affaiblis.

Les vagues de boss utilisent Standard afin que le comportement du boss demeure lisible.

## 10. Feedback et lisibilité

- hitmarker distinct pour corps, tête et élimination ;
- barre de boss et nom de phase ;
- annonce plein écran pour nouvelle vague ou transition ;
- code couleur des ressources et armes ;
- son spatial simplifié selon la direction de la menace ;
- points faibles cohérents avec les silhouettes ;
- option de gore et flashs réduits ;
- échelle du HUD et intensité des secousses ;
- mouvement réduit et respect de la préférence système ;
- contrastes renforcés pour l’interface et les ennemis ;
- sous-titres et alertes textuelles ;
- focus contenu dans les écrans modaux ;
- commandes tactiles avec cibles d’action dimensionnées pour le mobile.

## 11. Condition de réussite et d’échec

La tentative échoue lorsque la santé atteint zéro. En campagne, elle réussit après l’Archidiacre de la vague 10 et le maintien du sceau d’extraction. Le joueur peut alors accepter le bilan de victoire ou convertir la tentative en survie sans fin. Dans ce second mode, il n’existe pas de victoire définitive ; le score et la meilleure vague servent d’objectif de maîtrise.

## 12. Périmètre de la build

Inclus : boucle solo complète, campagne de dix vagues, survie sans fin, trois secteurs, trois objectifs standards, six armes, onze castes, deux boss, progression locale, checkpoint/reprise, commandes tactiles, accessibilité, PWA hors ligne et tests automatisés.

Non inclus : coopération réseau, support manette natif, sauvegarde cloud, matchmaking, backend ou boutique en ligne.
