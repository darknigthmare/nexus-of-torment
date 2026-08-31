# Nœud 07 — registre narratif original

Ce complément fixe le canon du nouveau mode **Histoire — Les voix du Nœud**. Il ne remplace pas la campagne de dix vagues ni la survie sans fin. La source exécutable des titres, scènes, objectifs, choix et archives est `src/game/story.js` ; ce document explique leur cohérence et leurs limites.

## Intention

La liturgie est le langage d’un système industriel qui a continué à fonctionner après avoir perdu la distinction entre une personne et son numéro de service. Les témoins parlent du travail, de la sécurité et des décisions prises par l’installation. Les monstres ne sont pas une nouvelle mythologie importée : ils prolongent les castes, les armes et le Nœud déjà décrits dans le Codex.

Les annonces d’office restent courtes. Le détail est réservé aux entrées du journal révélées par la progression et aux six archives que le joueur récupère physiquement. Le récit doit accompagner les tirs, le déplacement, le maintien d’une position, la manipulation des relais et le transport d’un objet ; la lecture n’est pas une condition de réussite du combat.

## Faits et personnes

- Le polyèdre biologique était déjà sous la roche vitrifiée avant la construction du Nœud 07. L’institution ne l’a pas fabriqué. Il a appris la notion de seuil en observant les plans, les corps et les exercices d’évacuation.
- Les mesures de douleur ont fourni un signal plus régulier que les déplacements libres. L’installation a poursuivi l’étude au lieu de traiter ce résultat comme une raison d’arrêter.
- **Ilan Sere**, technicien de maintenance, a conservé trois arrêts locaux indépendants. Ses consignes et ses bandes subsistent dans l’installation. Le récit ne promet pas de le retrouver vivant.
- **La docteure Maëlle Vey**, neurophysiologiste, a identifié le réseau nerveux avant sa manifestation complète. Sa recommandation d’évacuer a été séparée de la commande du Sanctificateur. Cette chronologie explique la présence de l’arme avant l’Archidiacre sans attribuer de prescience à l’institution.
- **La Régie 07** est la voix administrative de l’installation, pas une divinité ni une narration omnisciente. Ses relevés et son vocabulaire peuvent masquer une décision humaine, mais les faits appris par le joueur ne dépendent pas de sa bonne foi.
- La voix de Maëlle conservée par le module est une **empreinte de travail**, non une conscience entière que le joueur pourrait ressusciter. La préserver conserve une déposition et des noms ; sa suppression n’efface pas les documents déjà récupérés.
- Le Gardien exécute l’ordre de fermeture. L’Archidiacre en est le dernier organe de commande dans cette opération. La victoire interrompt le réseau local et permet la sortie ; elle ne détruit pas toute la dimension du Nexus.

## Dix offices, trois chapitres

| Office | Chapitre / secteur | Action principale | Révélation de journal |
|---:|---|---|---|
| 1 — Arrêt de travail | Le plan observé / Sanctuaire | Purge | La Régie compare les mouvements à un relevé de personnel vide. |
| 2 — Le plan qui écoute | Sanctuaire | Maintien | Les exercices ont appris au Nœud comment un corps franchit une porte. |
| 3 — Numéros de service | Sanctuaire | Chasse | Les marques sont des identifiants de personnel ; premier raccord à choisir. |
| 4 — Contre-mesure humaine | Les employés du silence / Nef | Trois relais successifs | Une séquence d’arrêt humaine demeure sous la réécriture. |
| 5 — Le responsable du seuil | Nef | Gardien du Seuil | Le Gardien appliquait l’ordre, il n’en était pas l’auteur. |
| 6 — Un nom au lieu d’un numéro | Nef | Chasse | L’empreinte de Maëlle reste attachée au module ; deuxième choix. |
| 7 — Dernier quart | Ce qui franchit le seuil / Ossuaire | Prise et transport du module | Les coordonnées de fermeture atteignent la borne terminale. |
| 8 — Une interruption volontaire | Ossuaire | Maintien | L’interruption tenue volontairement empêche la nouvelle pulsation. |
| 9 — Évacuation sous contrôle | Ossuaire | Purge | L’institution avait financé l’arme et suspendu l’évacuation. |
| 10 — L’ordre qui reste | Ossuaire | Archidiacre puis extraction | L’arrêt ne supprime pas les conséquences des décisions précédentes. |

Le passage Sanctuaire → Nef a lieu après le choix de l’office 3. Le passage Nef → Ossuaire a lieu après celui de l’office 6. Le mode Histoire ne propose pas de secteur d’entrée alternatif : cette suite constitue son trajet causal. Les deux modes historiques conservent leur choix de secteur.

### Objectifs nouveaux

À l’office 4, trois relais sont stabilisés dans l’ordre. Le descripteur demande 2,5 secondes par relais dans un rayon de 2,6 unités. Ce ne sont pas trois boutons de texte : la cible active se déplace entre trois positions de la Nef.

À l’office 7, le module est pris dans l’Ossuaire puis livré à une borne distincte. Le portage multiplie la vitesse de déplacement par 0,78, soit une réduction de 22 %. La livraison demande 3 secondes dans un rayon de 2,8 unités. Les coordonnées d’arrêt existent dans les deux branches ; supprimer l’empreinte ne rend donc jamais le module inutilisable.

Ces valeurs sont les contrats des données. Le runtime et ses tests dédiés restent responsables de l’interaction, des conditions de maintien, des renforts, du dégagement final des ennemis et de l’absence d’impasse.

## Décisions non chronométrées

Chaque décision est proposée entre les combats. Elle possède exactement deux options, un bénéfice et un coût affichés séparément. Une option ne se rachète pas à chaque reprise.

| Moment | Option | Bénéfice | Coût |
|---|---|---|---|
| Après 3 | Réarmer le confinement (`seal`) | +30 armure maximale et +30 armure actuelle, bornée au maximum | −15 santé maximale ; santé actuelle bornée au nouveau maximum |
| Après 3 | Ouvrir l’écoute (`listen`) | Multiplicateur de dégâts des armes ×1,10 | +15 points de Souillure, bornés à 100 % |
| Après 6 | Conserver le témoin (`preserve`) | Vitesse de recharge de capacité ×1,20 | −20 armure maximale ; armure actuelle bornée au nouveau maximum |
| Après 6 | Purger l’empreinte (`purge`) | Réserves de toutes les armes possédées remplies | −1 grenade maximale ; grenades actuelles bornées au nouveau maximum |

Le bonus de recharge est une augmentation du taux, pas une promesse de réduire exactement le temps restant de 20 %. Le delta de Souillure est un effet de décision direct, pas un projectile hostile auquel appliquer une seconde résistance de doctrine. Le remplissage concerne les réserves, sans achat d’arme, remplissage de chargeur ni Essence gratuite.

La borne analytique des coûts est positive pour les trois doctrines sans métaprogression et les quatre combinaisons : au moins 77 santé maximale, 18 armure maximale et une grenade maximale. Cela vérifie la praticabilité arithmétique des coûts, pas la difficulté réelle de la campagne ni la capacité d’un joueur à survivre au portage.

## Archives récupérables

| ID persistant | Pièce | Chapitre | Fonction du témoignage |
|---|---|---|---|
| `shift_07` | Feuille de quart 07 | Le plan observé | Ilan remarque que le plan reproduit les trajets précédents. |
| `threshold_plan` | Plan en négatif | Le plan observé | Maëlle décrit pourquoi l’étude aurait dû être arrêtée. |
| `maintenance_tape` | Bande de maintenance | Les employés du silence | Les arrêts locaux et les noms gravés sous les étiquettes. |
| `sanctifier_order` | Bon de commande cyan | Les employés du silence | La commande de l’arme et le refus de financer le départ. |
| `names_ledger` | Registre des noms | Ce qui franchit le seuil | L’empreinte demande un témoignage, pas une résurrection. |
| `evacuation_copy` | Copie d’évacuation | Ce qui franchit le seuil | Le module arrête la commande ; un silence a aussi un auteur. |

Chaque pièce a une position dans son secteur, un rayon d’interaction et un indice de localisation lisible. Les indications gauche/droite sont données en regardant depuis l’entrée vers le portail du secteur. Les données de collecte persistantes appartiennent à la progression, pas au registre immuable et pas à une copie divergente dans la tentative.

Ces archives sont des preuves complémentaires. Aucune n’est nécessaire pour activer un objectif ou obtenir une fin. Une pièce manquée reste recherchable dans une prochaine tentative Histoire ; une collecte déjà acquise ne doit pas reverser sa récompense.

## Trois conclusions, quatre combinaisons

| Protocole | Témoin | Fin |
|---|---|---|
| `seal` | `purge` | `sealed` — Confinement sans témoin |
| `listen` | `preserve` | `witness` — Les noms sortent |
| `seal` | `preserve` | `scar` — La preuve incomplète : voix conservée, réseau partiellement lu |
| `listen` | `purge` | `scar` — La preuve incomplète : réseau compris, empreinte effacée |

Les deux variantes de `scar` ont un texte différent mais le même ID de complétion. Les fins dépendent des choix validés, pas d’un compteur caché d’archives, de la difficulté ou de la doctrine. Un choix incomplet ou inconnu ne reçoit pas de fin par défaut. La scène de l’office 8 est explicitement une **archive locale** : elle peut être entendue même après la purge de l’empreinte transportée.

## Contrat technique et vérifications de ce registre

`NT.Story` est un module autonome profondément gelé. Il ne charge aucun média externe, n’accède ni au DOM ni au stockage et ne déclenche aucune minuterie. Le runtime copie ses descripteurs avant de créer un état mutable. Les accès publics sont `getMission(wave)`, `getChapter(wave)`, `getChoice(waveOrId)`, `getOption(choiceId, optionId)`, `getArchives(chapterId)` et `getEnding(choices)`.

La tentative Histoire utilise `{version:1, choices:{protocol:'', testimony:''}, pendingChoiceId:''}`. Les tentatives des deux modes historiques ont `story:null`. Le stockage de progression, sa migration et la sauvegarde stricte du checkpoint sont des contrats d’intégration distincts de ce fichier de données.

`node tools/story-data-smoke.mjs` a exécuté **36 contrats de données**, sans échec : chargement isolé, immutabilité, sérialisation, dix offices, liens chapitre/secteur, objectifs, décisions et coûts exacts, douze combinaisons doctrine/choix, six archives, fins et rejet des entrées invalides. Les onze ancrages sont également dans les limites des secteurs et éloignés des bornes payantes. Un contrôle séparé utilisant `Arena._positionClear` et `nearestStation` a trouvé les onze points libres pour un rayon de 0,42 et sans station immédiatement activable.

Le diagnostic `node tools/balance-audit.mjs --json` a ensuite été remis en service : son ancien double d’Arena ne raccordait plus `_stationHasBenefit` depuis la protection contre les achats sans bénéfice. Le banc appelle maintenant cette méthode réelle ainsi que `stationPrompt`, sans recopier leurs règles. Le runtime et les prix ne sont pas modifiés par cette réparation.

Le rejeu complet retrouve exactement les résultats historiques de `BALANCE_AUDIT.md` : 640 modèles analytiques, 510 budgets financés, 130 déficits selon les politiques de tir testées. Les 384 scénarios à 25 % ou 50 % d’impacts au corps, ou 65 % d’impacts exclusivement à la tête, restent financés. Les autres déficits concernent les profils de 10 % ou 15 % au corps, dont 123 au premier boss. Cela ne prouve pas une impossibilité de survie : mêlée, grenades, greffes, visée et déplacement réels ne sont pas simulés.

Trois contrôles supplémentaires du même outil portent précisément sur l’extension :

- **320 compositions initiales** : huit graines × quatre difficultés × dix offices. Types ennemis, élites et modificateurs restent identiques aux budgets historiques ; la suite d’objectifs correspond au registre Histoire. Les marques de chasse sont volontairement exclues de cette comparaison de composition, puisque la famille d’objectif change.
- **Douze combinaisons doctrine/choix** exécutent la vraie méthode `chooseStoryOption`, avec la transition suivante neutralisée dans le banc. Les tests vérifient capacités maximales, multiplicateurs, Souillure bornée, remplissage des réserves, absence de création d’Essence et refus d’une seconde application. Ce n’est pas une simulation de tentative complète.
- **Connectivité spatiale** : une exploration de grille de 0,75 unité sur les vrais colliders d’Arena trouve les 21 stations historiques et les onze ancrages Histoire depuis les départs des trois secteurs. Les ancrages testés sont ceux produits par le placement sûr réel. Une position atteignable doit être dans le rayon d’interaction et disposer d’une ligne de vue libre. Des points intermédiaires vérifient les déplacements de grille, mais aucun personnage ne parcourt ces trajets en navigateur.

La comparaison des files initiales n’évalue pas les renforts supplémentaires dus à un relais délaissé ou à un portage prolongé. Elle ne démontre ni une difficulté humaine inchangée, ni un temps de campagne, ni une survie sous attaque. Ce document ne certifie pas de QA navigateur, de build ou de déploiement. Les intégrations et la validation de livraison sont suivies séparément.
