# Budget analytique de survie — 31 août 2026

## Conclusion bornée

Le diagnostic exécute **640 scénarios analytiques** : huit graines × quatre difficultés × deux politiques d’arsenal × cinq profils de précision × deux hypothèses de récupération. Ce ne sont **ni 640 parties jouées, ni un bot autonome, ni un test de survie humaine**.

- Les 384 scénarios à 25 % ou 50 % d’impacts au corps, ou 65 % d’impacts exclusivement à la tête, financent tous leurs cartouches jusqu’au budget de la vague 10.
- À 15 % au corps : 62/64 scénarios favorables et 44/64 sous pression restent financés.
- À 10 % au corps : 20/64 scénarios favorables et 0/64 sous pression restent financés.
- Sur 130 déficits, 123 apparaissent en vague 5 ; les autres en vagues 7 (1), 9 (2), 10 (4).
- Les sept stations de chacun des trois secteurs sont accessibles depuis le départ sur la grille de collision testée. Aucun verrou spatial d’armurerie n’est trouvé par ce diagnostic.

Le test démontre une fragilité de trésorerie face au premier boss lorsque beaucoup de tirs sont perdus, particulièrement après achat d’une arme. Il **ne démontre pas de softlock inévitable** : un déficit dans cette politique de tir n’exclut pas la mêlée gratuite, les grenades, les greffes, une autre priorité de cible ou une récupération différée. Aucune correction runtime n’est appliquée à partir de ce seul modèle.

## Reproduction

```powershell
node tools/balance-audit.mjs
node tools/balance-audit.mjs --json
node tools/balance-audit.mjs --seeds=1
```

Le programme ne modifie aucun fichier ni aucune sauvegarde. `--json` expose les coûts, déficits et moyennes par vague. Le nombre de graines est borné à 32. Un code de sortie nul indique que le diagnostic s’est exécuté, pas que chaque politique modélisée est viable.

## Origine des chiffres

Les files sont produites par les vraies méthodes `_pickModifier`, `_configureWaveObjective` et `_buildWaveQueue`. Les points de vie et armures viennent de vrais `Enemy`; les impacts analytiques utilisent `takeDamage`, donc les multiplicateurs de tête et l’armure frontale de l’Écorché sont appliqués. `killEnemy`, `_dropPickup`, les réserves/rechargements de `WeaponSystem`, `Arena.activateStation` et la récompense de `_completeWave` exécutent leurs vrais contrats.

Les calendriers des invocations des deux boss passent par leurs méthodes runtime et `spawnBossAdd`, avec les plafonds réels. **Leurs déplacements, attaques et dégâts au joueur sont désactivés dans ce modèle.** Les impacts sont des tirages statistiques appliqués à une cible abstraite : ni raycast de visée, ni contrôle humain, ni combat navigateur.

### Hypothèses explicites

| Dimension | Hypothèse |
|---|---|
| Opérateur | Rempart, sans progression méta et sans greffe offensive |
| Corps | 10 %, 15 %, 25 % ou 50 % des projectiles/plombs touchent ; aucun impact critique |
| Têtes | 65 % touchent et **100 % de ces impacts réussis** sont critiques : borne favorable, pas précision humaine attendue |
| Distance | Fusil à pompe à 8 m ; toutes les autres armes à 20 m ; atténuation issue de leurs données |
| Orientation | Impacts corporels toujours frontaux sur l’Écorché |
| Arsenal de départ | WARD-9 et ABSOLUTION uniquement ; recharge payante quand toutes les réserves sont épuisées |
| Achats | Achats aux débuts de vague dès déverrouillage et fonds suffisants, en conservant 120 essence de sécurité |
| Choix d’arme | Arme disponible au meilleur DPS soutenu estimé, avec changement et rechargement comptabilisés |
| Effets exclus | Grenades, mêlée, brûlures, pénétration multicible, ruptures et greffes : pas de bénéfice gratuit supposé |
| Charge de vague | Toute la file est consommée. Maintien/chasse/extraction peuvent annuler une partie de cette file en jeu |
| Priorité | Entités ordinaires initiales, puis boss concentré, puis ses renforts ; aucune réaction tactique aux attaques |
| Déplacements | Forfait de 8 s par visite munitions/médecine, 6 s par achat ; aucun cheminement réellement parcouru |
| Attentes | Rechargements, cadence, changements de 0,42 s, neuf préparations de 20 s et délais de fin inclus |
| Survie | Aucune blessure, mort, esquive, recharge interrompue, fatigue de visée ou reprise simulée |

La file intégrale ne constitue pas une borne supérieure universelle : un joueur qui quitte longtemps un objectif peut provoquer davantage de renforts. Inversement, une chasse rapide ou un maintien efficace peut supprimer de nombreuses entrées que le modèle fait payer.

### Drops et stations

La probabilité d’un drop est de 16 % pour une entité normale et 40 % pour une élite. Le contenu dépend des vrais seuils santé/armure :

- Favorable : santé/armure pleines, tous les drops récupérés. Un drop a 86 % de chances d’être des munitions.
- Sous pression : ratios santé 50 % et armure 40 % pour la sélection du drop, 60 % des drops récupérés. La distribution conditionnelle devient 42 % santé, 24 % armure, 20 % munitions, 14 % essence. Ces ratios sont imposés statistiquement avant chaque impact, pas produits par des blessures simulées.
- La probabilité de récupérer des munitions par élimination normale passe ainsi de 13,76 % à 1,92 %. Le facteur de récupération absorbe abstraitement les pertes de drops ; leur expiration de 20 secondes n’est pas simulée spatialement.
- Sous pression, une visite médicale payante est prévue après les vagues 2, 4, 6 et 8, soit 560 essence lorsqu’elle est finançable. Cette dépense ne prouve pas que les soins suffisent à survivre.
- Une station de munitions coûte 120 essence et ajoute 55 % de la réserve maximale **de chaque arme possédée**, sous leurs plafonds. C’est pourquoi un arsenal étendu peut réduire le coût global des réquisitions.
- Les quatre armes payantes totalisent 3 680 essence. Les 120 essence préservées avant chaque achat ne garantissent pas le financement de tout un boss à très faible précision.

## Résultats utiles : 50 % corps, drops sous pression

Intervalles min–max sur huit graines. Les « tirs » comptent une cartouche ou une pression de détente, y compris pour le fusil à pompe ; ils ne sont pas des unités balistiques équivalentes entre armes. Les minutes sont du **temps de service analytique**, jamais une durée de partie prédite.

| Difficulté | Arsenal | Tirs | Minutes modélisées | Essence munitions | Essence restante |
|---|---|---:|---:|---:|---:|
| Confinement | Départ | 1 615–1 804 | 16,3–17,2 | 1 080–1 320 | 6 792–7 300 |
| Confinement | Achats | 2 288–2 760 | 15,5–17,0 | 360–480 | 3 952–4 334 |
| Instable | Départ | 2 178–2 331 | 20,7–22,2 | 1 560–1 800 | 6 647–7 098 |
| Instable | Achats | 3 177–3 547 | 19,6–21,9 | 600–720 | 4 071–4 361 |
| Rouge | Départ | 2 914–3 184 | 26,9–29,2 | 2 280–2 640 | 8 008–8 597 |
| Rouge | Achats | 4 107–4 617 | 25,8–28,6 | 840–1 080 | 5 958–6 477 |
| Nexus | Départ | 3 615–4 171 | 32,6–37,3 | 2 760–3 480 | 9 657–10 375 |
| Nexus | Achats | 5 141–5 994 | 31,2–35,4 | 1 080–1 320 | 8 051–8 653 |

Les lignes « achats » incluent les 3 680 essence d’armes ; toutes ces lignes incluent aussi les 560 essence médicales. Les factures de munitions n’incluent pas ces deux dépenses.

### Borne favorable : 65 % d’impacts, tous critiques, achats et pression

| Difficulté | Tirs | Minutes modélisées | Essence munitions |
|---|---:|---:|---:|
| Confinement | 1 053–1 328 | 8,8–9,3 | 0–120 |
| Instable | 1 355–1 573 | 10,6–11,2 | 120 |
| Rouge | 1 697–1 900 | 12,6–13,8 | 120–360 |
| Nexus | 2 278–2 573 | 15,4–16,7 | 240–480 |

Ce profil est particulièrement optimiste pour les plombs du fusil à pompe et les petites cibles en mouvement. Il sert à mesurer la valeur théorique des points faibles, pas à fixer un objectif de performance pour le joueur.

### Répartition des dix vagues

Moyennes de tirs dans le profil 50 % corps, achats, pression, sur huit graines. Cette répartition inclut la file entière et les renforts de boss comptabilisés ; elle ne prétend pas refléter le nombre d’ennemis qu’un objectif rapide laisse effectivement apparaître.

| Vague | Confinement | Instable | Rouge | Nexus |
|---:|---:|---:|---:|---:|
| 1 | 45 | 71 | 111 | 147 |
| 2 | 79 | 109 | 116 | 109 |
| 3 | 78 | 63 | 122 | 346 |
| 4 | 155 | 278 | 251 | 117 |
| 5 | 432 | 478 | 507 | 684 |
| 6 | 117 | 210 | 387 | 507 |
| 7 | 129 | 191 | 343 | 475 |
| 8 | 219 | 300 | 453 | 542 |
| 9 | 442 | 554 | 804 | 1 014 |
| 10 | 758 | 1 020 | 1 283 | 1 547 |

Les sauts non monotones viennent du tirage des castes, des achats et du choix de calibre, pas d’un nombre constant d’ennemis ou d’une unité de dégâts constante par cartouche.

## Accès et suites recommandées

Le graphe de navigation discret utilise un pas de 0,75 m, un rayon de joueur de 0,42 m, les collisions runtime et trois échantillons supplémentaires sur chaque segment. Il atteint les sept stations du Sanctuaire (3 577 nœuds), de la Nef (3 393) et de l’Ossuaire (4 248). C’est un contrôle de connectivité hors ennemis, pas une preuve d’accès sûr sous pression.

La prochaine preuve de gameplay utile est un parcours réel de la vague 5 avec stocks/faible essence, puis une vague 10 avec drops manqués. Vérifier notamment le coût d’un achat juste avant le boss, la lisibilité de la station de munitions et la viabilité des solutions de secours. Ne pas augmenter les ressources globalement ni annoncer une durée de campagne sur la base de ce seul modèle : les greffes, objectifs, tirs ratés réels et dégâts reçus peuvent changer fortement le résultat.
