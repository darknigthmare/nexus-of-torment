# Corrections gameplay ciblées — 1.2.1

31 août 2026 · NEXUS OF TORMENT — Liturgie nerveuse

## Périmètre et résultat

Cette passe corrige quatre défauts reproductibles du runtime existant : impacts de charge derrière un couvert, facteur de dégâts manquant sur l’onde du Gardien, achats de fournitures sans bénéfice et orientation altérée à la reprise. Elle ne remplace ni le jeu, ni ses systèmes de progression, ni ses créations originales.

La nouvelle suite [gameplay-polish-contract-smoke.mjs](../tools/gameplay-polish-contract-smoke.mjs) valide **33 contrats sur 33** après correction. Ses 30 contrats initiaux, exécutés avec les fichiers runtime du commit de référence `11076e1` chargés en mémoire, produisent **16 réussites et 14 échecs**. Trois contrats ajoutés après l’inspection Chrome couvrent la précision et les échanges stricts de sauvegarde. Les contrôles positifs vérifient les comportements à préserver.

Cette note décrit des preuves locales de code. Elle n’atteste aucun nouveau parcours Chrome, appareil physique, build, push ou déploiement en production. Elle ne constitue pas une certification commerciale ou un playtest humain.

## 1. P1 — Charges à travers les couverts

Avant correction, les attaques spéciales de l’Ascète Broyeur (`grinder`), de l’Écorché Liturgique (`flayed`) et du Gardien (`gatekeeper`) vérifiaient la distance, mais pas l’obstacle entre l’ennemi et le joueur. La correction antérieure de la mêlée normale ne couvrait pas ces trois branches.

Reproduction dans le Sanctuaire, vague 5, difficulté instable, joueur sans armure : les deux positions sont libres selon `_positionClear`, le segment est bloqué selon `lineBlocked`, puis le vrai `Enemy.update(1/60)` applique malgré tout l’impact.

| Attaque | Joueur x/z | Ennemi x/z | Ancien impact derrière le couvert |
|---|---|---|---|
| Ascète Broyeur | −10,75 / 7,06 | −9,20 / 5,50 | 44,55 santé |
| Écorché | −10,65 / 6,86 | −9,30 / 5,70 | 30,976 santé et 1,1 s de ralentissement |
| Gardien | −10,80 / 7,11 | −8,85 / 5,14 | 50,49 santé |

Correction dans [entities.js](../src/game/entities.js) : `_hasContactLine()` partage le segment déjà utilisé par la mêlée, du buste de l’ennemi au centre du joueur. Les trois charges exigent désormais ce segment libre avant d’infliger leurs dégâts, d’appliquer le ralentissement ou de consommer leur impact. Leur durée continue de s’écouler normalement lorsqu’un couvert les bloque.

Les portées, multiplicateurs de dégâts et délais restent inchangés. La mêlée utilise le même segment qu’avant, sans changement de comportement. L’aura ambiante de Souillure n’est pas une attaque de contact : elle reste active et le test la compare à un ennemi témoin sans attaque, au lieu d’exiger à tort une corruption nulle.

## 2. P1 — Onde du Gardien sans facteur de difficulté

Avant correction, l’onde utilisait seulement sa phase et son atténuation par distance. En phase 1, au centre, elle retirait 31 santé aussi bien en Confinement qu’en Nexus ouvert, aux vagues 5 et 25. Les autres dégâts du Gardien appliquaient déjà les multiplicateurs de difficulté et de vague.

Le vrai Gardien transmet maintenant à `bossSlam` le facteur suivant :

```text
facteur onde = enemy.damage / (enemy.config.damage × 1,1)
dégâts onde = (24 + phase × 7) × facteur onde × atténuation existante
```

Le coefficient `1,1` est la progression de dégâts du Gardien standard en vague 5 : `1 + (5 − 1) × 0,025`. Cette calibration préserve exactement la référence instable vague 5 : 31 / 38 / 45 avant atténuation pour les phases 1 / 2 / 3. Les facteurs difficulté, vague, anomalie et élite déjà présents dans `enemy.damage` ne sont pas multipliés une deuxième fois.

Le rayon, les neuf dixièmes de seconde de préparation, le télégraphe, le recul et les condamnations restent inchangés. L’ancien appel de `bossSlam` à deux arguments conserve un facteur de 1 ; le chemin runtime du Gardien transmet explicitement son facteur calculé. Les modifications se trouvent dans [entities.js](../src/game/entities.js) et [game.js](../src/game/game.js).

Les tests couvrent les quatre difficultés, les trois phases et les vagues 5, 25 et 9995. Ils vérifient la valeur attendue, sa croissance et son caractère fini. Même au centre, la phase 3 conserve un rapport d’environ 1,203 aux dégâts de contact du même Gardien, inférieur au multiplicateur 1,35 de sa charge. Aucun multiplicateur exponentiel ou surcroît de progression propre au slam n’a été ajouté. Cela ne garantit pas qu’un joueur puisse survivre aux dégâts d’une vague très élevée.

## 3. P2 — Fournitures facturées sans effet

Avant correction, une interaction réelle à portée de station pouvait produire les résultats suivants :

- Réserves déjà pleines : essence 500 → 380, inventaire inchangé, cooldown de 4 secondes.
- Santé maximale et Souillure nulle : essence 500 → 360, état vital inchangé, cooldown de 8 secondes.

Dans [arena.js](../src/game/arena.js), `_stationHasBenefit()` est utilisé à la fois par `stationPrompt` et `activateStation`. La station de munitions exige une réserve pouvant recevoir des munitions, avec sa capacité incluant la progression méta. La station médicale exige une santé manquante ou de la Souillure, et un taux de soin positif.

Sans bénéfice, le prompt affiche « RÉSERVES DÉJÀ PLEINES » ou « ÉTAT VITAL STABLE », sans prix. L’activation refuse l’achat sans débit, cooldown, dépense statistique ou écriture de checkpoint. Un chargeur vide ne suffit pas à justifier une réquisition lorsque les réserves sont pleines : il faut d’abord recharger depuis ces réserves.

Les achats utiles restent disponibles : une seule réserve vide, santé manquante seule, Souillure seule ou les deux. Le soin réduit sous Silence liturgique, les coûts de 120/140 essence et les refus pour cooldown ou fonds insuffisants sont conservés. Cette correction ne réduit pas le prix des armes, ne donne pas de munitions gratuites et ne remanie pas l’économie globale.

## 4. P2 — Orientation modifiée par le checkpoint

Le yaw de caméra s’accumule pendant les rotations. L’ancienne validation le saturait à ±4π ; une valeur valide `4π + 0,73` devenait `4π`, soit un changement d’orientation de −41,826 degrés. Le cas négatif produisait l’erreur opposée.

Dans [game.js](../src/game/game.js), le helper partagé par le snapshot et sa validation conserve exactement les angles déjà dans [−π, π] ; seuls les angles hors intervalle passent par `atan2(sin(yaw), cos(yaw))`. Cela conserve la direction et rend la normalisation idempotente. Réappliquer les fonctions trigonométriques à un angle valide pouvait modifier un dernier bit et déclencher à tort une réparation ou un refus d’import strict. Ce défaut a été observé dans le parcours Chrome tactile puis reproduit sur l’angle 0,1.

Les anciennes valeurs numériques sérialisées en texte restent acceptées. Une valeur absente, invalide, `NaN` ou infinie conserve le fallback historique π. La suite appelle également le vrai `resumeSavedRun`, puis vérifie la caméra et le checkpoint réécrit ; elle ne teste pas seulement une formule isolée.

## Couverture du noyau initial de 30 contrats

| Famille | Contrats | Référence `11076e1` | Runtime corrigé |
|---|---:|---|---|
| Charges : trois couverts, trois impacts libres, trois hors portée | 9 | 6 réussis / 3 échoués | 9 réussis |
| Onde : trois références de phase, quatre matrices difficulté/vague, facteurs uniques, ancien appel | 9 | 4 réussis / 5 échoués | 9 réussis |
| Stations : deux achats inutiles, deux cas munitions, trois cas médicaux, fonds/cooldown | 8 | 5 réussis / 3 échoués | 8 réussis |
| Orientation : angles finis, texte numérique, valeurs invalides, vraie reprise | 4 | 1 réussi / 3 échoués | 4 réussis |
| **Total** | **30** | **16 réussis / 14 échoués** | **30 réussis / 0 échoué** |

Les contrats contiennent plusieurs assertions et cas paramétrés ; leur nombre n’est pas un nombre de parties. Reproduction depuis la racine du dépôt :

```powershell
node tools/gameplay-polish-contract-smoke.mjs
```

La comparaison avant/après des 30 contrats initiaux a utilisé les modules obtenus par `git show 11076e1:<chemin>` à la place des lectures des fichiers actuels. Cette comparaison en mémoire n’a ni restauré le checkout, ni modifié une sauvegarde.

Les trois contrôles supplémentaires vérifient 1000 angles en Float64 bit pour bit et cinq normalisations JSON successives, les angles exacts observés dans Chrome, puis le vrai SaveStore : checkpoint, export/import strict répété, rechargement et reprise après plusieurs tours sans réparation ni alerte. Le stockage de ces contrats reste simulé en mémoire ; la preuve de persistance Chrome est distincte.

## Limites et articulation avec les audits précédents

- Les classes `Player`, `Enemy`, `Arena`, `WeaponSystem` et les méthodes de `NexusGame` sont celles du runtime ; rendu, audio, interface et persistance sont remplacés par des stubs. Les entrées et états initiaux sont contrôlés, avec un aléatoire déterministe.
- Les charges sont placées dans un état d’attaque précis puis mises à jour. Ce n’est pas un bot qui repère un ennemi, esquive sa préparation et rejoint la position de test.
- Pour la vague 9995, le test construit un Gardien à cette vague, prépare une phase et laisse son vrai `update` déclencher l’onde. **Aucune campagne de 9995 vagues n’est jouée.** Cette preuve ne mesure ni longévité, ni performances prolongées, ni viabilité humaine en endless.
- Les achats testent les méthodes de station et d’interaction ; ils ne prouvent pas l’accès sûr à une station au milieu d’une horde. La reprise vérifie les valeurs et la transition en mémoire, pas le rendu caméra ni la persistance sur disque.
- L’[audit économique antérieur](BALANCE_AUDIT.md) reste un modèle analytique avec ses hypothèses de précision, de drops et de déplacements. Ses 640 scénarios ne sont pas 640 parties. Cette passe documentaire ne réexécute pas ce modèle et ne certifie pas ses chiffres pour une nouvelle release.
- L’[audit produit](PRODUCT_AUDIT.md) et le [rapport QA](QA_REPORT.md) consignent séparément la validation visuelle, navigateur et les limites de publication de la version courante.

Ces corrections traitent des défauts concrets et renforcent leurs régressions. Elles n’établissent ni taux de victoire, ni durée de campagne, ni plaisir ou tension prolongée, ni conformité de boutique, ni absence générale de bugs. Les parcours navigateur et les preuves de publication doivent être consignés séparément lorsqu’ils sont réellement exécutés.
