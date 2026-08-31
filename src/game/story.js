(function () {
  'use strict';

  const NT = window.NT = window.NT || {};

  // Registre narratif pur : aucune scène, sauvegarde, entrée ou minuterie ici.
  // Le runtime copie les descripteurs pour créer ses objectifs et archives mutables.
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const CHAPTERS = freeze([
    { id:'threshold', number:1, title:'Le plan observé', sectorId:'sanctum', firstWave:1, lastWave:3,
      text:'Le Sanctuaire devait enfermer une porte. Ses plans ont servi au Nœud pour apprendre à en fabriquer une.' },
    { id:'sutures', number:2, title:'Les employés du silence', sectorId:'nave', firstWave:4, lastWave:6,
      text:'Les relais portent des numéros de personnel. Quelqu’un a classé les voix restantes comme du matériel de confinement.' },
    { id:'testimony', number:3, title:'Ce qui franchit le seuil', sectorId:'ossuary', firstWave:7, lastWave:10,
      text:'Il reste un module de fermeture et une sortie. Ce que vous emporterez dépend de ce que vous avez accepté de conserver.' }
  ]);

  const MISSIONS = freeze([
    { id:'office_01', wave:1, chapterId:'threshold', sectorId:'sanctum', title:'Arrêt de travail', speaker:'RÉGIE 07',
      text:'Aucun salarié n’est déclaré présent dans le Sanctuaire. Reprenez la cour et supprimez les signatures qui contredisent ce relevé.',
      objective:{ type:'purge' },
      journal:{ id:'office_01', title:'Un relevé vide', text:'La Régie ne recherche personne. Elle compare des mouvements à une liste vide, puis appelle la différence une intrusion. Les portes portent encore des consignes d’évacuation adressées à ceux qui travaillaient ici.' } },
    { id:'office_02', wave:2, chapterId:'threshold', sectorId:'sanctum', title:'Le plan qui écoute', speaker:'ILAN SERE · MAINTENANCE',
      text:'Le sceau utilise toujours notre circuit d’arrêt. Tenez sa position : chaque seconde stable lui retire une mesure de nos déplacements.',
      objective:{ type:'hold' },
      journal:{ id:'office_02', title:'Une porte apprise', text:'Ilan avait remarqué que les angles du plan changeaient après chaque exercice d’évacuation. Le polyèdre n’a pas forcé la porte de confinement : les exercices lui ont appris ce qu’était une porte et comment un corps la franchissait.' } },
    { id:'office_03', wave:3, chapterId:'threshold', sectorId:'sanctum', title:'Numéros de service', speaker:'DR MAËLLE VEY · NEUROPHYSIOLOGIE',
      text:'Les marques ne sont pas des grades : ce sont nos anciens numéros de service. Abattez leurs porteurs pour libérer le circuit, puis choisissez ce qui restera branché sur vous.',
      objective:{ type:'hunt' },
      journal:{ id:'office_03', title:'Le branchement', text:'L’installation distingue encore les badges, mais plus les personnes. Le circuit peut renforcer le blindage de l’opérateur ou lui laisser entendre les impulsions qui précèdent une attaque. Aucune de ces adaptations n’est sans coût.' } },
    { id:'office_04', wave:4, chapterId:'sutures', sectorId:'nave', title:'Contre-mesure humaine', speaker:'ILAN SERE · MAINTENANCE',
      text:'Trois relais entretiennent la cadence de la Nef. Stabilisez-les l’un après l’autre : leur séquence d’arrêt est restée humaine.',
      objective:{ type:'relay', positions:[[-8,0,17],[8,0,5],[-8,0,-13]], radius:2.6, duration:2.5 },
      journal:{ id:'office_04', title:'Les trois relais', text:'Les relais cessent de répondre dans l’ordre choisi par la maintenance, pas dans celui du rite. Une procédure humaine subsiste sous la réécriture. Le Nœud reproduit nos mécanismes ; il ne comprend pas encore pourquoi nous avions prévu de les arrêter.' } },
    { id:'office_05', wave:5, chapterId:'sutures', sectorId:'nave', title:'Le responsable du seuil', speaker:'RÉGIE 07',
      text:'Le Gardien applique toujours la fermeture des accès, sans distinguer un employé d’une menace. Brisez sa couronne et sortez de ses cercles d’impact.',
      objective:{ type:'boss', boss:'gatekeeper' },
      journal:{ id:'office_05', title:'Un ordre sans destinataire', text:'La couronne distribuait une consigne de fermeture aux geôliers. Le Gardien n’était pas l’auteur du protocole : il en était devenu l’organe. Le détruire ouvre le passage, mais ne retire pas l’ordre qui circule plus loin.' } },
    { id:'office_06', wave:6, chapterId:'sutures', sectorId:'nave', title:'Un nom au lieu d’un numéro', speaker:'DR MAËLLE VEY · NEUROPHYSIOLOGIE',
      text:'Les dernières signatures marquées verrouillent le module de fermeture. Rompez-les ; mon empreinte y restera attachée tant que vous ne l’aurez pas effacée.',
      objective:{ type:'hunt' },
      journal:{ id:'office_06', title:'L’empreinte de Maëlle', text:'La voix n’est pas une personne que l’on peut ramener intacte. C’est une empreinte de travail, avec ses hésitations et ses noms propres, utilisée comme horloge par le réseau. La préserver conserve un témoignage ; la purger rend le module plus facile à alimenter.' } },
    { id:'office_07', wave:7, chapterId:'testimony', sectorId:'ossuary', title:'Dernier quart', speaker:'ILAN SERE · MAINTENANCE',
      text:'Le module porte les coordonnées d’arrêt jusqu’à l’Ossuaire. Prenez-le et convoyez-le vers la borne opposée ; sa masse réduira votre vitesse de 22 %.',
      objective:{ type:'transport', pickup:[0,0,18], delivery:[0,0,-16], radius:2.8, duration:3, speedMultiplier:.78 },
      journal:{ id:'office_07', title:'Le module a traversé', text:'Le réseau a tenté de reprendre le module pendant le transfert. Les coordonnées de fermeture sont maintenant dans la borne terminale. Selon votre décision, elles voyagent avec une empreinte humaine ou avec l’espace vide laissé par sa suppression.' } },
    { id:'office_08', wave:8, chapterId:'testimony', sectorId:'ossuary', title:'Une interruption volontaire', speaker:'DR MAËLLE VEY · ARCHIVE LOCALE',
      text:'L’ordre de fermeture doit durer plus longtemps qu’une pulsation. Maintenez le sceau : cette fois, c’est nous qui décidons quand le réseau s’arrête.',
      objective:{ type:'hold' },
      journal:{ id:'office_08', title:'L’arrêt appartient aux vivants', text:'Le Nœud sait répéter une douleur et reconnaître une fuite. Le maintien du sceau lui impose autre chose : une interruption volontaire, tenue malgré son invitation à recommencer. La borne terminale peut désormais refuser sa prochaine pulsation.' } },
    { id:'office_09', wave:9, chapterId:'testimony', sectorId:'ossuary', title:'Évacuation sous contrôle', speaker:'RÉGIE 07',
      text:'L’accès terminal est prêt, mais les signatures restantes alimentent encore ses nerfs. Purgez l’Ossuaire et préparez vos réserves avant d’appeler la fermeture.',
      objective:{ type:'purge' },
      journal:{ id:'office_09', title:'Le Sanctificateur attendait', text:'Le projecteur de purification avait été commandé avant l’apparition de l’Archidiacre. Maëlle avait détecté le réseau qui formerait son corps ; l’institution a conservé son arme et classé son avertissement. Elle avait anticipé un adversaire, pas organisé l’évacuation.' } },
    { id:'office_10', wave:10, chapterId:'testimony', sectorId:'ossuary', title:'L’ordre qui reste', speaker:'ILAN SERE · MAINTENANCE',
      text:'L’Archidiacre porte l’ordre qui maintient tout le monde au travail. Abattez-le, puis tenez le sceau d’extraction pour sortir avec les conséquences de vos choix.',
      objective:{ type:'boss', boss:'archdeacon' },
      journal:{ id:'office_10', title:'Fin de service', text:'La chute du prélat retire au réseau son dernier organe de commande. Elle ne change pas les décisions prises avant lui. La fermeture et ce qui franchit le seuil sont désormais inscrits dans le bilan de l’opérateur.' } }
  ]);

  // Effets chiffrés et coûts toujours praticables par les trois doctrines de départ.
  // damageMul/abilityRate sont des bonus multiplicatifs (1 + valeur), comme les greffes.
  // corruptionDelta est un delta direct borné à [0,1], pas un nouvel impact hostile.
  const CHOICES = freeze([
    { id:'protocol', afterWave:3, title:'Que laissez-vous entrer ?', speaker:'DR MAËLLE VEY', timed:false,
      text:'Le raccord rejoint vos implants. Vous pouvez fermer le signal derrière une nouvelle plaque ou le laisser guider vos tirs.',
      options:[
        { id:'seal', title:'Réarmer le confinement', benefit:'+30 armure maximale et rend 30 armure.', cost:'−15 santé maximale ; la santé actuelle est bornée au nouveau maximum.',
          text:'Le signal restera derrière le blindage. L’installation retrouve un opérateur plus protégé, au prix d’une greffe invasive.', effects:{ maxArmor:30, armor:30, maxHealth:-15 } },
        { id:'listen', title:'Ouvrir l’écoute', benefit:'+10 % de dégâts avec toutes les armes.', cost:'+15 points de Souillure, dans la limite de 100 %.',
          text:'Vous entendez la commande avant le mouvement. Ce savoir entre avec une part du signal que les filtres étaient censés arrêter.', effects:{ damageMul:.10, corruptionDelta:.15 } }
      ] },
    { id:'testimony', afterWave:6, title:'Que restera-t-il des voix ?', speaker:'ILAN SERE', timed:false,
      text:'Le module peut garder l’empreinte de Maëlle ou utiliser sa place pour les réserves de fermeture. La décision ne pourra pas être annulée dans cette tentative.',
      options:[
        { id:'preserve', title:'Conserver le témoin', benefit:'+20 % de vitesse de recharge de la capacité.', cost:'−20 armure maximale ; l’armure actuelle est bornée au nouveau maximum.',
          text:'Vous raccordez l’empreinte à vos implants pour qu’elle traverse avec vous. Sa place est prise sur la couche de blindage, pas sur les armes.', effects:{ abilityRate:.20, maxArmor:-20 } },
        { id:'purge', title:'Purger l’empreinte', benefit:'Remplit les réserves de toutes les armes possédées.', cost:'−1 grenade maximale ; les grenades actuelles sont bornées au nouveau maximum.',
          text:'Une charge efface l’empreinte et libère les réserves de secours. Le module de fermeture demeure utilisable, mais il ne pourra plus témoigner de sa voix.', effects:{ reserveFraction:1, maxGrenades:-1 } }
      ] }
  ]);

  const ARCHIVES = freeze([
    { id:'shift_07', chapterId:'threshold', sectorId:'sanctum', position:[-9,0,15], radius:2.4, title:'Feuille de quart 07', speaker:'ILAN SERE · MAINTENANCE',
      hint:'Sanctuaire · côté gauche de l’entrée, entre les couvertures et les piliers.',
      text:'Nous avons fermé trois fois le même accès cette nuit. La deuxième fois, les gonds étaient du mauvais côté. La troisième, le plan de sécurité montrait notre trajet de la veille. J’ai demandé que les exercices cessent. La Régie a répondu qu’un plan fidèle améliorait nos chances d’évacuation.' },
    { id:'threshold_plan', chapterId:'threshold', sectorId:'sanctum', position:[9,0,-14], radius:2.4, title:'Plan en négatif', speaker:'DR MAËLLE VEY · NEUROPHYSIOLOGIE',
      hint:'Sanctuaire · à droite du portail, devant la couverture du fond.',
      text:'L’objet était sous la roche avant l’installation. Il a appris de nos couloirs, puis des écarts entre nos corps et les murs. Les réactions à la douleur ont fourni une mesure plus régulière que les déplacements libres. Ce résultat aurait dû arrêter l’étude ; il a été inscrit comme amélioration du protocole.' },
    { id:'maintenance_tape', chapterId:'sutures', sectorId:'nave', position:[-7,0,17], radius:2.4, title:'Bande de maintenance', speaker:'ILAN SERE · MAINTENANCE',
      hint:'Nef · allée gauche, derrière la première couverture.',
      text:'Les relais possèdent toujours un arrêt local, trois bornes indépendantes. Je les ai gardées hors du circuit de la Régie. On m’a demandé de retirer les noms du personnel des étiquettes : ils provoquaient des hésitations chez les opérateurs. J’ai gravé les initiales dessous. Il fallait que quelqu’un hésite.' },
    { id:'sanctifier_order', chapterId:'sutures', sectorId:'nave', position:[7,0,-15], radius:2.4, title:'Bon de commande cyan', speaker:'RÉGIE 07 · ANNEXE BUDGÉTAIRE',
      hint:'Nef · allée droite, entre les deux dernières couvertures.',
      text:'Le projecteur Sanctificateur est approuvé sur la base des signaux nerveux décrits par la docteure Vey. Sa recommandation d’évacuer le Nœud est disjointe de la présente demande. Le matériel doit être livré avant la manifestation complète du réseau. Les crédits de déplacement du personnel restent suspendus.' },
    { id:'names_ledger', chapterId:'testimony', sectorId:'ossuary', position:[-16,0,10], radius:2.4, title:'Registre des noms', speaker:'DR MAËLLE VEY · EMPREINTE',
      hint:'Ossuaire · anneau gauche, entre l’entrée et le croisement.',
      text:'Ce n’est plus une conscience entière qui parle. Je retrouve pourtant les noms avant les chiffres, et je sais encore lequel est celui d’Ilan. Ne promettez pas de nous reconstruire. Emportez de quoi empêcher qu’un prochain rapport dise seulement : aucune personne présente, aucune personne perdue.' },
    { id:'evacuation_copy', chapterId:'testimony', sectorId:'ossuary', position:[16,0,-10], radius:2.4, title:'Copie d’évacuation', speaker:'ILAN SERE · DERNIÈRE CONSIGNE',
      hint:'Ossuaire · anneau droit, du côté du portail terminal.',
      text:'Le module n’efface pas ce lieu. Il retire au dernier relais le droit de recommencer sa commande et rend la sortie à ceux qui peuvent encore marcher. Si les voix sont toujours dedans, ne les remettez pas à la Régie. Si elles ont disparu, notez qui a demandé leur suppression. Un silence a aussi un auteur.' }
  ]);

  const ENDINGS = freeze({
    sealed:{ id:'sealed', title:'Confinement sans témoin', speaker:'RÉGIE 07',
      text:'Le Nœud est fermé et l’opérateur a franchi le seuil. Votre blindage a tenu, mais l’empreinte humaine a été purgée. La Régie classe les voix comme une anomalie corrigée ; le lieu reste condamné sans leur déposition.',
      journal:'Le choix de fermer l’écoute, puis de purger l’empreinte, accomplit le protocole institutionnel. La menace immédiate est confinée et l’opérateur survit. Les archives éventuellement recueillies restent des pièces écrites, pas la voix effacée.' },
    witness:{ id:'witness', title:'Les noms sortent', speaker:'EMPREINTE DE MAËLLE VEY',
      text:'La dernière commande s’interrompt et vous sortez avec le module. L’écoute ouverte a permis de lire le réseau ; l’empreinte conservée porte les noms de ceux qu’il utilisait. Le Nœud est fermé, et son histoire ne dépend plus seulement de la Régie.',
      journal:'Vous ne ramenez pas les disparus à la vie. Vous rapportez une empreinte vérifiable et le chemin par lequel leurs réactions sont devenues un instrument de confinement. La sortie met fin à l’opération et empêche que sa conclusion soit rédigée sans eux.' },
    scar:{ id:'scar', title:'La preuve incomplète', speaker:'DOSSIER DE SORTIE',
      text:'Vous quittez le Nœud après l’interruption du réseau. Une partie de son histoire a traversé avec vous, et une autre reste derrière le scellement. Le bilan ne peut plus être déclaré vierge, mais il ne dit pas tout.',
      journal:'Une décision a préservé une trace et l’autre en a limité la portée. Le confinement est effectif ; la transmission humaine demeure partielle. Les archives collectées complètent le dossier sans remplacer ce qui a été effacé.',
      variants:{
        'seal:preserve':{ text:'Le Nœud est fermé et l’empreinte de Maëlle sort sous votre blindage. Vous avez gardé sa voix sans ouvrir complètement l’écoute qui aurait permis de lire le réseau. Les noms demeurent ; une partie de leur fonctionnement restera à prouver.' },
        'listen:purge':{ text:'Le Nœud est fermé et vous en avez compris les impulsions. La charge utilisée pour libérer les réserves a effacé l’empreinte de Maëlle. Vous pouvez décrire le protocole, mais la voix qui aurait témoigné avec vous ne franchira pas le seuil.' }
      } }
  });

  function getMission(wave) {
    return Number.isInteger(wave) && wave >= 1 && wave <= MISSIONS.length ? MISSIONS[wave-1] : null;
  }
  function getChapter(wave) {
    const mission=getMission(wave);
    return mission ? CHAPTERS.find(chapter=>chapter.id===mission.chapterId) : null;
  }
  function getChoice(waveOrId) {
    return CHOICES.find(choice=>choice.afterWave===waveOrId || choice.id===waveOrId) || null;
  }
  function getOption(choiceId,optionId) {
    return getChoice(choiceId)?.options.find(option=>option.id===optionId) || null;
  }
  function getArchives(chapterId) {
    return ARCHIVES.filter(archive=>archive.chapterId===chapterId);
  }
  function getEnding(choices) {
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) return null;
    if (!Object.hasOwn(choices,'protocol') || !Object.hasOwn(choices,'testimony')) return null;
    if (!getOption('protocol',choices.protocol) || !getOption('testimony',choices.testimony)) return null;
    const signature=choices.protocol+':'+choices.testimony;
    const id=signature==='seal:purge'?'sealed':signature==='listen:preserve'?'witness':'scar';
    const ending=ENDINGS[id],variant=ending.variants?.[signature];
    return variant ? freeze({ ...ending,...variant }) : ending;
  }

  NT.Story = freeze({ VERSION:1,CHAPTERS,MISSIONS,CHOICES,ARCHIVES,ENDINGS,getMission,getChapter,getChoice,getOption,getArchives,getEnding });
})();
