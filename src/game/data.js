(function () {
  'use strict';

  const NT = window.NT = window.NT || {};

  const COLORS = {
    bone: 0xd8c4b5,
    flesh: 0x7c252c,
    fleshBright: 0xc44745,
    iron: 0x34393c,
    ironLight: 0x697277,
    black: 0x09090a,
    amber: 0xd28b46,
    ritual: 0xbd202c,
    cyan: 0x4cabb0,
    violet: 0x8e3f73,
    bile: 0x798348,
    white: 0xf1e8df
  };

  const CLASSES = {
    bulwark: {
      id: 'bulwark', name: 'Rempart', icon: '▰', abilityName: 'Égide cinétique',
      description: 'Opérateur blindé capable d’absorber une rupture brutale.',
      health: 125, armor: 80, speed: 5.15, damage: 1.0, corruptionResist: .12,
      abilityCooldown: 28, abilityDuration: 6,
      passive: 'Les dégâts reçus sous 35 % de santé sont réduits de 18 %.'
    },
    executioner: {
      id: 'executioner', name: 'Exécuteur', icon: '✣', abilityName: 'Frénésie balistique',
      description: 'Spécialiste du démembrement et des enchaînements meurtriers.',
      health: 105, armor: 45, speed: 5.65, damage: 1.15, corruptionResist: .04,
      abilityCooldown: 25, abilityDuration: 7,
      passive: 'Les éliminations rapprochées rendent 3 points d’armure.'
    },
    occultist: {
      id: 'occultist', name: 'Occultiste', icon: '◈', abilityName: 'Nova d’exorcisme',
      description: 'Technicien rituel utilisant la Souillure contre le Nexus.',
      health: 92, armor: 38, speed: 5.45, damage: 1.02, corruptionResist: .38,
      abilityCooldown: 22, abilityDuration: 1.2,
      passive: 'Plus la Souillure est élevée, plus la capacité inflige de dégâts.'
    }
  };

  const DIFFICULTIES = {
    containment: { id:'containment', name:'Confinement local', enemyHealth:.82, enemyDamage:.75, count:.82, speed:.95, reward:1.05, corruption:.8, shardRate:.8 },
    unstable: { id:'unstable', name:'Brèche instable', enemyHealth:1, enemyDamage:1, count:1, speed:1, reward:1, corruption:1, shardRate:1 },
    red: { id:'red', name:'Liturgie rouge', enemyHealth:1.22, enemyDamage:1.25, count:1.15, speed:1.08, reward:1.18, corruption:1.22, shardRate:1.35 },
    nexus: { id:'nexus', name:'Nexus ouvert', enemyHealth:1.52, enemyDamage:1.5, count:1.28, speed:1.15, reward:1.38, corruption:1.5, shardRate:1.8 }
  };

  const WEAPONS = {
    rifle: {
      id:'rifle', slot:1, name:'WARD-9', subtitle:'AUTO · BALISTIQUE', icon:'W9',
      damage:24, fireRate:10.2, pellets:1, spread:.009, movingSpread:.014, range:72,
      magazine:30, reserve:180, reload:1.75, recoil:.024, kick:.075, automatic:true,
      headMultiplier:1.75, penetration:0, falloffStart:30, falloffEnd:68,
      color:0x59656a, emissive:0xb92931, unlockWave:1, price:0
    },
    shotgun: {
      id:'shotgun', slot:2, name:'ABSOLUTION', subtitle:'POMPE · CONCUSSIF', icon:'SG',
      damage:16, fireRate:1.06, pellets:10, spread:.071, movingSpread:.022, range:34,
      magazine:8, reserve:56, reload:2.35, recoil:.085, kick:.19, automatic:false,
      headMultiplier:1.35, penetration:0, falloffStart:8, falloffEnd:30,
      color:0x4d3b34, emissive:0xd47d3e, unlockWave:1, price:0
    },
    smg: {
      id:'smg', slot:3, name:'SPINE RIPPER', subtitle:'AUTO · SUPPRESSION', icon:'SR',
      damage:14, fireRate:15.5, pellets:1, spread:.018, movingSpread:.018, range:52,
      magazine:45, reserve:270, reload:1.55, recoil:.017, kick:.045, automatic:true,
      headMultiplier:1.6, penetration:0, falloffStart:22, falloffEnd:50,
      color:0x4e5257, emissive:0x8b3f70, unlockWave:3, price:420
    },
    nailgun: {
      id:'nailgun', slot:4, name:'CLOUEUR RITUEL', subtitle:'SEMI · PERFORANT', icon:'CR',
      damage:88, fireRate:2.25, pellets:1, spread:.004, movingSpread:.008, range:90,
      magazine:12, reserve:72, reload:2.15, recoil:.055, kick:.13, automatic:false,
      headMultiplier:2.05, penetration:2, falloffStart:48, falloffEnd:90,
      color:0x363c3f, emissive:0x4caab0, tracerColor:0x65e4e8,
      mechanic:'Traverse plusieurs corps et récompense les tirs de précision.',
      unlockWave:5, price:760
    },
    chainlance: {
      id:'chainlance', slot:5, name:'VESPER', subtitle:'LANCE-CHAÎNES · ENTRAVE', icon:'VS',
      damage:132, fireRate:1.35, pellets:1, spread:.0035, movingSpread:.007, range:58,
      magazine:6, reserve:36, reload:2.55, recoil:.072, kick:.18, automatic:false,
      headMultiplier:1.65, penetration:1, falloffStart:34, falloffEnd:58,
      color:0x3c3438, emissive:0xb94f86, tracerColor:0xe268b1, special:'chain_pull',
      mechanic:'Harponne les castes non boss, les attire et ralentit leur fuite.',
      unlockWave:7, price:1080
    },
    exorcist: {
      id:'exorcist', slot:6, name:'SANCTIFICATEUR', subtitle:'FAISCEAU · PURIFICATEUR', icon:'SX',
      damage:18, fireRate:12.5, pellets:1, spread:.006, movingSpread:.011, range:66,
      magazine:52, reserve:260, reload:2.05, recoil:.012, kick:.035, automatic:true,
      headMultiplier:1.45, penetration:0, falloffStart:40, falloffEnd:66,
      color:0x273f42, emissive:0x65e6df, tracerColor:0x7ffbf1, special:'purifier',
      mechanic:'Convertit la Souillure en dégâts et brûle les entités psychiques.',
      unlockWave:9, price:1420
    }
  };

  const ENEMIES = {
    sutured: {
      id:'sutured', name:'Le Suturé', icon:'☷', role:'Meute', description:'Ouvrier de chair recousu, rapide et presque dépourvu d’instinct de conservation.',
      unlockWave:1, cost:1, weight:10, health:82, speed:2.85, radius:.42, height:1.68,
      damage:10, attackRange:1.15, attackCooldown:1.05, reward:16, score:100,
      color:0x7c2a2e, emissive:0x320006, pattern:2, corruptionAura:0
    },
    hookbearer: {
      id:'hookbearer', name:'Le Porte-Crochet', icon:'⌁', role:'Contrôle', description:'Geôlier émacié qui arrache les opérateurs à leur position par une chaîne vivante.',
      unlockWave:2, cost:3, weight:5, health:205, speed:1.95, radius:.48, height:2.25,
      damage:15, attackRange:1.5, attackCooldown:1.4, reward:42, score:260,
      color:0x6f3435, emissive:0x6d151d, pattern:2, corruptionAura:.012,
      abilityCooldown:5.3, abilityRange:14
    },
    cherub: {
      id:'cherub', name:'Chérubin de Chair', icon:'♢', role:'Harceleur aérien', description:'Petite entité ailée dont les aiguilles osseuses saturent les lignes de tir.',
      unlockWave:3, cost:2, weight:6, health:72, speed:3.35, radius:.34, height:.8,
      damage:8, attackRange:16, attackCooldown:1.65, reward:28, score:180,
      color:0x9d5b58, emissive:0x8c2731, pattern:2, corruptionAura:.02, flying:true
    },
    confessor: {
      id:'confessor', name:'Le Confesseur', icon:'▥', role:'Tireur rituel', description:'Liturgiste masqué qui projette des sentences perforantes à longue portée.',
      unlockWave:4, cost:4, weight:4, health:250, speed:1.35, radius:.46, height:2.18,
      damage:17, attackRange:24, attackCooldown:2.55, reward:55, score:360,
      color:0x373a3c, emissive:0xa22d39, pattern:1, corruptionAura:.018
    },
    grinder: {
      id:'grinder', name:'Ascète Broyeur', icon:'▰', role:'Brute', description:'Masse blindée soudée à un mécanisme d’écrasement. Sa charge rompt les formations.',
      unlockWave:5, cost:7, weight:2.7, health:820, speed:1.28, radius:.78, height:2.65,
      damage:30, attackRange:1.75, attackCooldown:1.85, reward:120, score:800,
      color:0x3c3333, emissive:0x7b2028, pattern:1, corruptionAura:.025,
      abilityCooldown:7.5, abilityRange:15
    },
    flayed: {
      id:'flayed', name:'L’Écorché Liturgique', icon:'◫', role:'Avant-garde blindée', description:'Guerrier sans peau portant un reliquaire frontal. Son plastron détourne les tirs qui ne visent pas ses points faibles.',
      unlockWave:5, cost:5, weight:3.8, health:460, speed:1.72, radius:.58, height:2.32,
      damage:22, attackRange:1.55, attackCooldown:1.25, reward:76, score:510,
      color:0x8d3034, emissive:0xa01827, pattern:2, corruptionAura:.018,
      abilityCooldown:5.8, abilityRange:11, frontalArmor:.58
    },
    bell: {
      id:'bell', name:'La Cloche Vivante', icon:'◒', role:'Support', description:'Reliquaire ambulant dont la résonance accélère et renforce les entités voisines.',
      unlockWave:6, cost:6, weight:2.4, health:510, speed:.95, radius:.66, height:2.5,
      damage:13, attackRange:1.4, attackCooldown:1.6, reward:105, score:700,
      color:0x443a36, emissive:0xd08a44, pattern:1, corruptionAura:.045,
      abilityCooldown:6.2, abilityRange:12
    },
    twin: {
      id:'twin', name:'Jumelle du Voile', icon:'⋈', role:'Assassin', description:'Prédateur synchronisé qui traverse brièvement le voile pour frapper dans le dos.',
      unlockWave:7, cost:5, weight:3, health:285, speed:4.15, radius:.4, height:1.85,
      damage:19, attackRange:1.25, attackCooldown:.9, reward:78, score:520,
      color:0x59334f, emissive:0xad4d88, pattern:4, corruptionAura:.025,
      abilityCooldown:4.7, abilityRange:10
    },
    choir: {
      id:'choir', name:'Chœur des Plaies', icon:'◉', role:'Psychique', description:'Agrégat vocal semi-immatériel qui nourrit la Souillure et crée des signatures trompeuses.',
      unlockWave:8, cost:6, weight:2.1, health:390, speed:1.6, radius:.62, height:2.1,
      damage:11, attackRange:18, attackCooldown:2.1, reward:96, score:660,
      color:0x553040, emissive:0xc0578b, pattern:4, corruptionAura:.09, flying:true
    },
    gatekeeper: {
      id:'gatekeeper', name:'Gardien du Seuil', icon:'♜', role:'Boss', description:'Geôlier cardinal couronné de clous, envoyé pour garantir l’ouverture permanente du Nœud.',
      unlockWave:5, cost:0, weight:0, health:3900, speed:1.48, radius:1.15, height:3.9,
      damage:34, attackRange:2.2, attackCooldown:1.4, reward:700, score:6000,
      color:0x312f31, emissive:0xc12632, pattern:1, corruptionAura:.12,
      abilityCooldown:5.2, abilityRange:24, boss:true
    },
    archdeacon: {
      id:'archdeacon', name:'Archidiacre des Nerfs', icon:'☿', role:'Boss psychique', description:'Prélat suspendu à un réseau de tendons conducteurs. Il condamne des zones entières avant de siphonner la Souillure des survivants.',
      unlockWave:10, cost:0, weight:0, health:4750, speed:1.18, radius:1.05, height:3.55,
      damage:29, attackRange:26, attackCooldown:1.75, reward:900, score:8200,
      color:0x54233e, emissive:0xd54b9a, pattern:4, corruptionAura:.16,
      abilityCooldown:5.7, abilityRange:28, boss:true, flying:true
    }
  };

  const WAVE_MODIFIERS = [
    { id:'standard', name:'STANDARD', minWave:1, weight:8, description:'Aucune anomalie supplémentaire.', enemySpeed:1, enemyDamage:1, corruption:1 },
    { id:'blackout', name:'EXTINCTION', minWave:3, weight:2.7, description:'Le brouillard se resserre et la lumière du casque devient vitale.', enemySpeed:1.04, enemyDamage:1, corruption:1.12, fogNear:13, fogFar:43 },
    { id:'frenzy', name:'FRÉNÉSIE', minWave:4, weight:2.2, description:'Les entités se déplacent et attaquent plus vite.', enemySpeed:1.27, enemyDamage:1.08, corruption:1.05 },
    { id:'hemorrhage', name:'HÉMORRAGIE', minWave:5, weight:1.8, description:'Les morts violentes peuvent provoquer une rupture organique.', enemySpeed:1, enemyDamage:1.08, corruption:1.1, volatileDeaths:.22 },
    { id:'chains', name:'PLUIE DE CHAÎNES', minWave:6, weight:1.5, description:'Le plafond du Nexus marque périodiquement une zone d’impact.', enemySpeed:1, enemyDamage:1, corruption:1.1, chainStorm:true },
    { id:'sacrament', name:'SACREMENT NOIR', minWave:7, weight:1.4, description:'Les castes d’élite reçoivent une onction supplémentaire.', enemySpeed:1.08, enemyDamage:1.18, corruption:1.22, eliteHealth:1.3 },
    { id:'silence', name:'SILENCE LITURGIQUE', minWave:8, weight:1.2, description:'Les capacités se rechargent plus lentement et les soins sont réduits.', enemySpeed:1, enemyDamage:1.12, corruption:1.18, abilityRate:.65, healingRate:.65 }
  ];

  const UPGRADES = [
    { id:'ballistic_oath', name:'Serment balistique', icon:'✦', rarity:'GREFFE OFFENSIVE', description:'+12 % de dégâts avec toutes les armes.', max:5, effects:{ damageMul:.12 } },
    { id:'deep_mag', name:'Chargeur profond', icon:'▥', rarity:'MODIFICATION D’ARME', description:'+20 % de capacité de chargeur et recharge immédiate.', max:3, effects:{ magazineMul:.20, refill:true } },
    { id:'rapid_cycle', name:'Cycle accéléré', icon:'»', rarity:'MODIFICATION D’ARME', description:'+10 % de cadence de tir.', max:4, effects:{ fireRateMul:.10 } },
    { id:'quick_hands', name:'Mains de greffeur', icon:'⌁', rarity:'GREFFE NEURALE', description:'Temps de rechargement réduit de 15 %.', max:4, effects:{ reloadMul:-.15 } },
    { id:'steady_hands', name:'Ligaments stabilisés', icon:'⌖', rarity:'GREFFE NEURALE', description:'Dispersion et recul réduits de 14 %.', max:4, effects:{ spreadMul:-.14, recoilMul:-.14 } },
    { id:'field_surgery', name:'Sutures de campagne', icon:'+', rarity:'GREFFE VITALE', description:'+24 santé maximale et rend 24 santé.', max:4, effects:{ maxHealth:24, heal:24 } },
    { id:'plate_graft', name:'Plaques sous-cutanées', icon:'▰', rarity:'GREFFE DÉFENSIVE', description:'+22 armure maximale et rend 22 armure.', max:4, effects:{ maxArmor:22, armor:22 } },
    { id:'fleet_foot', name:'Tendons de fuite', icon:'↟', rarity:'GREFFE MOTRICE', description:'+8 % de vitesse de déplacement.', max:3, effects:{ speedMul:.08 } },
    { id:'salvage', name:'Dîme du récupérateur', icon:'◆', rarity:'PROTOCOLE LOGISTIQUE', description:'+18 % d’essence gagnée.', max:3, effects:{ essenceMul:.18 } },
    { id:'blood_tithe', name:'Dîme sanguine', icon:'♥', rarity:'PACTE INTERDIT', description:'Les dégâts infligés rendent 1,5 % de santé.', max:3, effects:{ lifesteal:.015 } },
    { id:'chain_arc', name:'Arc de condamnation', icon:'ϟ', rarity:'MUNITIONS RITUELLES', description:'12 % de chance d’arc électrique vers une cible proche.', max:3, effects:{ chainChance:.12, chainDamage:.38 } },
    { id:'rupture', name:'Rupture posthume', icon:'✹', rarity:'MUNITIONS RITUELLES', description:'10 % de chance qu’une élimination explose et blesse les proches.', max:3, effects:{ ruptureChance:.10, ruptureDamage:62 } },
    { id:'head_hunter', name:'Doctrine céphalique', icon:'◎', rarity:'PROTOCOLE OFFENSIF', description:'+22 % aux multiplicateurs de point faible.', max:3, effects:{ headMul:.22 } },
    { id:'purity', name:'Filtre de pureté', icon:'◇', rarity:'GREFFE OCCULTE', description:'Gain de Souillure réduit de 18 %.', max:4, effects:{ corruptionResist:.18 } },
    { id:'overcharge', name:'Nerf surchargé', icon:'Q', rarity:'GREFFE OCCULTE', description:'Recharge de capacité accélérée de 15 %.', max:4, effects:{ abilityRate:.15 } },
    { id:'grenadier', name:'Ceinture d’exorciste', icon:'●', rarity:'PROTOCOLE EXPLOSIF', description:'+1 grenade maximale et remplit les charges.', max:2, effects:{ maxGrenades:1, refillGrenades:true } },
    { id:'elite_plates', name:'Plaques de trophée', icon:'♜', rarity:'PACTE DE CHASSE', description:'Une élimination d’élite rend 18 armure.', max:3, effects:{ armorOnElite:18 } },
    { id:'penetrator', name:'Pieux à âme creuse', icon:'⇥', rarity:'MODIFICATION D’ARME', description:'+1 cible traversée par les projectiles.', max:2, effects:{ penetration:1 } },
    { id:'last_rite', name:'Dernier rite', icon:'†', rarity:'GREFFE UNIQUE', description:'Une fois par vague, un coup fatal vous laisse à 1 santé.', max:1, unique:true, effects:{ lastRite:true } },
    { id:'execution_protocol', name:'Protocole d’agonie', icon:'!', rarity:'PACTE INTERDIT', description:'+28 % de dégâts lorsque votre santé est sous 35 %.', max:1, unique:true, effects:{ lowHealthDamage:.28 } }
  ];

  const META_UPGRADES = {
    vitalSeal: { id:'vitalSeal', name:'Sceau vital', icon:'+', max:5, baseCost:3, description:'+5 % de santé maximale par rang.' },
    ordinance: { id:'ordinance', name:'Doctrine d’ordonnance', icon:'✦', max:5, baseCost:4, description:'+3 % de dégâts par rang.' },
    reinforced: { id:'reinforced', name:'Plaque mémorielle', icon:'▰', max:5, baseCost:3, description:'+8 armure de départ par rang.' },
    scavenger: { id:'scavenger', name:'Droit de récupération', icon:'◆', max:5, baseCost:3, description:'+35 essence au départ par rang.' },
    ward: { id:'ward', name:'Paroi mentale', icon:'◇', max:5, baseCost:4, description:'Souillure reçue réduite de 4 % par rang.' },
    munitions: { id:'munitions', name:'Réserve scellée', icon:'▥', max:5, baseCost:3, description:'+6 % de munitions de réserve par rang.' }
  };

  const STATIONS = {
    shock: { id:'shock', name:'SURCHARGER LE RÉSEAU', cost:180, cooldown:28, description:'Électrocute les entités proches du noyau.' },
    ammo: { id:'ammo', name:'RÉQUISITIONNER DES MUNITIONS', cost:120, cooldown:4, description:'Rend 55 % des réserves de toutes les armes.' },
    med: { id:'med', name:'PURIFICATION MÉDICALE', cost:140, cooldown:8, description:'Rend 55 santé et retire de la Souillure.' },
    armory: { id:'armory', name:'DÉVERROUILLER L’ARME', cost:0, cooldown:0, instances:4, description:'Ajoute l’arme au cycle de sélection.' }
  };

  NT.Data = { COLORS, CLASSES, DIFFICULTIES, WEAPONS, ENEMIES, WAVE_MODIFIERS, UPGRADES, META_UPGRADES, STATIONS };
})();
