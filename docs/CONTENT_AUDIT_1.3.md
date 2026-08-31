# Audit de contenu — 1.3 « Les voix du Nœud »

## Point de départ réel

La reprise part du commit `1783b5d` (1.2.1), pas d’un nouveau projet. Une passe Chrome locale de référence a terminé 97 contrôles sans échec avant l’extension. Le jeu possédait déjà six armes, onze castes dont deux boss, trois secteurs, trois doctrines, quatre difficultés, des greffes, une campagne sectorielle, la survie infinie et la sauvegarde locale. Ces éléments sont conservés ; ce ne sont pas des nouveautés 1.3.

Les lacunes de contenu portaient surtout sur le fil narratif jouable, les conséquences des décisions, la traversée des secteurs, la variété d’action et les objectifs de carrière. Ajouter une autre image de menu ne corrigeait pas ces lacunes.

## Corrections livrables et priorités

| Priorité | Écart observé | Réponse implémentée |
|---|---|---|
| P1 | Le lore du Codex ne formait pas une histoire parcourue | Un troisième mode : dix offices en trois chapitres, Sanctuaire → Nef → Ossuaire, avec transmissions et journal progressif. |
| P1 | Les décisions ne changeaient ni la construction du personnage ni la conclusion | Deux décisions non chronométrées, bénéfices/coûts explicites, quatre combinaisons et trois issues. |
| P1 | Les objectifs se limitaient à purge, maintien et chasse | Trois relais successifs puis transport d’un module : prise explicite, vitesse réduite, livraison sous pression et purge des survivants. |
| P1 | L’exploration n’avait pas de récompense narrative persistante | Six archives physiques facultatives, indices de localisation, attribution des témoignages et conservation après la mort. |
| P1 | La carrière ne donnait pas de critères de complétion | Vingt accomplissements, pourcentage, prochaine action et 41 fragments de récompense unique au total. Aucun bonus de combat caché. |
| P1 | Les informations déjà recueillies devaient rester consultables au moment de décider | Journal accessible depuis la pause et les deux décisions ; fermeture sans reprise de combat ni sélection implicite. |
| P1 | Les nouveautés risquaient de casser des dossiers existants | Migration de racine v2 vers v3 et checkpoint v1 vers v2, anciennes tentatives conservées sans accomplissements inventés. |
| P1 | Un conflit de stockage pouvait arriver entre greffe et décision | Gardes avant mutation et accès au brouillon exportable ; les choix refusés ne doivent pas donner leurs effets. |
| P2 | Le récit transporté pouvait contredire une empreinte purgée | Le module conserve les coordonnées d’arrêt dans les deux branches ; l’office 8 est une archive locale, pas une voix ressuscitée. |
| P2 | Le journal omettait des attributions et bilans déjà écrits | Auteurs des archives et bilans des fins affichés ; les deux variantes mixtes partagent explicitement une synthèse de carrière. |

## Profondeur et rejouabilité

Les deux choix créent des arbitrages de construction, pas quatre campagnes entièrement différentes. Le trajet, les boss et les budgets initiaux de hordes restent communs. Les transmissions sont écrites ; aucun doublage ou dialogue audio enregistré n’est annoncé.

Le joueur peut rejouer pour d’autres issues, chercher les pièces manquées, terminer les trois interventions sectorielles, essayer les doctrines et difficultés, ou atteindre l’office 20 en survie infinie. Le journal masque les transmissions et les issues non encore découvertes. Aucune archive cachée n’est imposée pour gagner.

Le récit et ses limites sont détaillés dans [STORY_CANON.md](STORY_CANON.md). Les nouvelles géométries de reliquaires et du module s’intègrent au rendu existant. L’illustration originale OpenAI déjà présente est conservée ; aucune nouvelle génération d’image n’est revendiquée pour cette passe.

## Preuves et portée

Les contrats de données, progression, UI, sauvegarde et gameplay sont exécutables dans `tools/`. Le banc narratif utilise le vrai code avec dégâts et déplacements injectés, en VM puis dans Chrome : il établit les transitions et les résultats, pas la difficulté humaine ni la durée d’une partie. Les nombres finaux de contrôles et les captures inspectées appartiennent à [QA_REPORT.md](QA_REPORT.md) et au rapport JSON de la même build.

L’audit analytique couvre les budgets existants, 320 compositions initiales Histoire, les douze combinaisons doctrine/choix et l’accessibilité de onze nouveaux ancrages. Il ne simule pas les dommages reçus ni le temps passé sous les renforts de transport. Il ne remplace pas des playtests externes.

La porte de publication exige une QA complète, pas le raccourci de diagnostic `NEXUS_QA_ONLY=story` : quatre branches, quatre difficultés, trois fins, collecte clavier/tactile, choix/reprise, conflits, parcours historiques, rendu matériel natif, cache et redémarrage hors ligne. Sept captures narratives sont obligatoires en plus des preuves historiques.

## Limites commerciales explicites

Le résultat demeure un jeu solo d’arènes WebGL 2. Cette extension n’ajoute ni nouveaux secteurs physiques, ni nouvelles armes, ni boss inédit, multijoueur, manette native, sauvegarde cloud, boutique ou certification de plateforme. Aucun téléphone physique, Safari, test utilisateur externe, campagne humaine complète ou certification d’accessibilité n’a été vérifié dans cette passe. Un vocabulaire de « version professionnelle » ne doit pas masquer ces limites.

La publication n’est acquise qu’après commit sélectif, push, CI, Vercel Ready, comparaison HTTP des fichiers et nouvelle QA Chrome sur la production. Ce document de contenu ne constitue pas à lui seul une preuve de déploiement.
