/* ============================================================
   Dice & Monsters — 5e level-up reference
   ------------------------------------------------------------
   For each class, the features gained at each level, plus the
   CHOICES a level can offer (subclass, Ability Score Improvement
   vs. feat, Fighting Style, Metamagic, Eldritch Invocations…) and
   plain-language descriptions so you can read what each option
   does before you pick it. Used by the character builder's
   Level Up panel.

   Shape:
     SRD_LEVELING.classes[Class][level]  -> [featureName, …]
     SRD_LEVELING.features[featureName]  -> description string
     SRD_LEVELING.subclasses[Class]      -> [{ name, desc }, …]
     SRD_LEVELING.fightingStyles         -> [{ name, desc }, …]
     SRD_LEVELING.feats                  -> [{ name, desc }, …]
     SRD_LEVELING.metamagic              -> [{ name, desc }, …]
     SRD_LEVELING.invocations            -> [{ name, desc }, …]
     SRD_LEVELING.choiceFor(featureName, cls) -> choice descriptor
   ============================================================ */
(function () {
  'use strict';

  var classes = {
    Barbarian: {
      1: ['Rage', 'Unarmored Defense'],
      2: ['Reckless Attack', 'Danger Sense'],
      3: ['Primal Path (subclass)'],
      4: ['Ability Score Improvement'],
      5: ['Extra Attack', 'Fast Movement'],
      6: ['Path feature'],
      7: ['Feral Instinct'],
      8: ['Ability Score Improvement'],
      9: ['Brutal Critical (1 die)'],
      10: ['Path feature'],
      11: ['Relentless Rage'],
      12: ['Ability Score Improvement'],
      13: ['Brutal Critical (2 dice)'],
      14: ['Path feature'],
      15: ['Persistent Rage'],
      16: ['Ability Score Improvement'],
      17: ['Brutal Critical (3 dice)'],
      18: ['Indomitable Might'],
      19: ['Ability Score Improvement'],
      20: ['Primal Champion']
    },
    Bard: {
      1: ['Spellcasting', 'Bardic Inspiration (d6)'],
      2: ['Jack of All Trades', 'Song of Rest (d6)'],
      3: ['Bard College (subclass)', 'Expertise'],
      4: ['Ability Score Improvement'],
      5: ['Bardic Inspiration (d8)', 'Font of Inspiration'],
      6: ['Countercharm', 'College feature'],
      8: ['Ability Score Improvement'],
      9: ['Song of Rest (d8)'],
      10: ['Bardic Inspiration (d10)', 'Expertise', 'Magical Secrets'],
      12: ['Ability Score Improvement'],
      13: ['Song of Rest (d10)'],
      14: ['Magical Secrets', 'College feature'],
      15: ['Bardic Inspiration (d12)'],
      16: ['Ability Score Improvement'],
      17: ['Song of Rest (d12)'],
      18: ['Magical Secrets'],
      19: ['Ability Score Improvement'],
      20: ['Superior Inspiration']
    },
    Cleric: {
      1: ['Spellcasting', 'Divine Domain (subclass)'],
      2: ['Channel Divinity (1/rest)', 'Domain feature'],
      4: ['Ability Score Improvement'],
      5: ['Destroy Undead (CR 1/2)'],
      6: ['Channel Divinity (2/rest)', 'Domain feature'],
      8: ['Ability Score Improvement', 'Destroy Undead (CR 1)', 'Domain feature'],
      10: ['Divine Intervention'],
      11: ['Destroy Undead (CR 2)'],
      12: ['Ability Score Improvement'],
      14: ['Destroy Undead (CR 3)'],
      16: ['Ability Score Improvement'],
      17: ['Destroy Undead (CR 4)', 'Domain feature'],
      18: ['Channel Divinity (3/rest)'],
      19: ['Ability Score Improvement'],
      20: ['Divine Intervention improvement']
    },
    Druid: {
      1: ['Druidic', 'Spellcasting'],
      2: ['Wild Shape', 'Druid Circle (subclass)'],
      4: ['Ability Score Improvement', 'Wild Shape improvement'],
      6: ['Circle feature'],
      8: ['Ability Score Improvement', 'Wild Shape improvement'],
      10: ['Circle feature'],
      12: ['Ability Score Improvement'],
      14: ['Circle feature'],
      16: ['Ability Score Improvement'],
      18: ['Timeless Body', 'Beast Spells'],
      19: ['Ability Score Improvement'],
      20: ['Archdruid']
    },
    Fighter: {
      1: ['Fighting Style', 'Second Wind'],
      2: ['Action Surge (one use)'],
      3: ['Martial Archetype (subclass)'],
      4: ['Ability Score Improvement'],
      5: ['Extra Attack'],
      6: ['Ability Score Improvement'],
      7: ['Archetype feature'],
      8: ['Ability Score Improvement'],
      9: ['Indomitable (one use)'],
      10: ['Archetype feature'],
      11: ['Extra Attack (2)'],
      12: ['Ability Score Improvement'],
      13: ['Indomitable (two uses)'],
      14: ['Ability Score Improvement'],
      15: ['Archetype feature'],
      16: ['Ability Score Improvement'],
      17: ['Action Surge (two uses)', 'Indomitable (three uses)'],
      18: ['Archetype feature'],
      19: ['Ability Score Improvement'],
      20: ['Extra Attack (3)']
    },
    Monk: {
      1: ['Unarmored Defense', 'Martial Arts'],
      2: ['Ki', 'Unarmored Movement'],
      3: ['Monastic Tradition (subclass)', 'Deflect Missiles'],
      4: ['Ability Score Improvement', 'Slow Fall'],
      5: ['Extra Attack', 'Stunning Strike'],
      6: ['Ki-Empowered Strikes', 'Tradition feature'],
      7: ['Evasion', 'Stillness of Mind'],
      8: ['Ability Score Improvement'],
      9: ['Unarmored Movement improvement'],
      10: ['Purity of Body'],
      11: ['Tradition feature'],
      12: ['Ability Score Improvement'],
      13: ['Tongue of the Sun and Moon'],
      14: ['Diamond Soul'],
      15: ['Timeless Body'],
      16: ['Ability Score Improvement'],
      17: ['Tradition feature'],
      18: ['Empty Body'],
      19: ['Ability Score Improvement'],
      20: ['Perfect Self']
    },
    Paladin: {
      1: ['Divine Sense', 'Lay on Hands'],
      2: ['Fighting Style', 'Spellcasting', 'Divine Smite'],
      3: ['Divine Health', 'Sacred Oath (subclass)'],
      4: ['Ability Score Improvement'],
      5: ['Extra Attack'],
      6: ['Aura of Protection'],
      7: ['Oath feature'],
      8: ['Ability Score Improvement'],
      10: ['Aura of Courage'],
      11: ['Improved Divine Smite'],
      12: ['Ability Score Improvement'],
      14: ['Cleansing Touch'],
      15: ['Oath feature'],
      16: ['Ability Score Improvement'],
      18: ['Aura improvements'],
      19: ['Ability Score Improvement'],
      20: ['Oath feature']
    },
    Ranger: {
      1: ['Favored Enemy', 'Natural Explorer'],
      2: ['Fighting Style', 'Spellcasting'],
      3: ['Ranger Archetype (subclass)', 'Primeval Awareness'],
      4: ['Ability Score Improvement'],
      5: ['Extra Attack'],
      6: ['Favored Enemy & Natural Explorer improvements'],
      7: ['Archetype feature'],
      8: ['Ability Score Improvement', "Land's Stride"],
      10: ['Natural Explorer improvement', 'Hide in Plain Sight'],
      11: ['Archetype feature'],
      12: ['Ability Score Improvement'],
      14: ['Favored Enemy improvement', 'Vanish'],
      15: ['Archetype feature'],
      16: ['Ability Score Improvement'],
      18: ['Feral Senses'],
      19: ['Ability Score Improvement'],
      20: ['Foe Slayer']
    },
    Rogue: {
      1: ['Expertise', 'Sneak Attack', "Thieves' Cant"],
      2: ['Cunning Action'],
      3: ['Roguish Archetype (subclass)'],
      4: ['Ability Score Improvement'],
      5: ['Uncanny Dodge'],
      6: ['Expertise'],
      7: ['Evasion'],
      8: ['Ability Score Improvement'],
      9: ['Archetype feature'],
      10: ['Ability Score Improvement'],
      11: ['Reliable Talent'],
      12: ['Ability Score Improvement'],
      13: ['Archetype feature'],
      14: ['Blindsense'],
      15: ['Slippery Mind'],
      16: ['Ability Score Improvement'],
      17: ['Archetype feature'],
      18: ['Elusive'],
      19: ['Ability Score Improvement'],
      20: ['Stroke of Luck']
    },
    Sorcerer: {
      1: ['Spellcasting', 'Sorcerous Origin (subclass)'],
      2: ['Font of Magic'],
      3: ['Metamagic'],
      4: ['Ability Score Improvement'],
      6: ['Origin feature'],
      8: ['Ability Score Improvement'],
      10: ['Metamagic'],
      12: ['Ability Score Improvement'],
      14: ['Origin feature'],
      16: ['Ability Score Improvement'],
      17: ['Metamagic'],
      18: ['Origin feature'],
      19: ['Ability Score Improvement'],
      20: ['Sorcerous Restoration']
    },
    Warlock: {
      1: ['Otherworldly Patron (subclass)', 'Pact Magic'],
      2: ['Eldritch Invocations'],
      3: ['Pact Boon'],
      4: ['Ability Score Improvement'],
      6: ['Patron feature'],
      8: ['Ability Score Improvement'],
      10: ['Patron feature'],
      11: ['Mystic Arcanum (6th level)'],
      12: ['Ability Score Improvement'],
      13: ['Mystic Arcanum (7th level)'],
      14: ['Patron feature'],
      15: ['Mystic Arcanum (8th level)'],
      16: ['Ability Score Improvement'],
      17: ['Mystic Arcanum (9th level)'],
      19: ['Ability Score Improvement'],
      20: ['Eldritch Master']
    },
    Wizard: {
      1: ['Spellcasting', 'Arcane Recovery'],
      2: ['Arcane Tradition (subclass)'],
      4: ['Ability Score Improvement'],
      6: ['Tradition feature'],
      8: ['Ability Score Improvement'],
      10: ['Tradition feature'],
      12: ['Ability Score Improvement'],
      14: ['Tradition feature'],
      16: ['Ability Score Improvement'],
      18: ['Spell Mastery'],
      19: ['Ability Score Improvement'],
      20: ['Signature Spells']
    }
  };

  /* Plain-language descriptions of the features you gain. Anything not
     listed here shows just its name in the panel. */
  var features = {
    'Ability Score Improvement': 'Increase one ability score by 2, or two ability scores by 1 each (max 20) — or instead take a feat.',
    'Rage': 'As a bonus action, enter a rage for advantage on Strength checks/saves, bonus melee damage, and resistance to bludgeoning, piercing and slashing damage. Limited uses per long rest.',
    'Unarmored Defense': 'While wearing no armor your AC equals 10 + Dex modifier + (Con modifier for Barbarian / Wis modifier for Monk). You can still use a shield (Barbarian).',
    'Reckless Attack': 'On your first attack of your turn you can attack recklessly: advantage on Strength melee attacks this turn, but attacks against you have advantage until your next turn.',
    'Danger Sense': 'Advantage on Dexterity saving throws against effects you can see, such as traps and spells.',
    'Extra Attack': 'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
    'Fast Movement': 'Your speed increases by 10 feet while you are not wearing heavy armor.',
    'Feral Instinct': 'Advantage on initiative. If surprised, you can still act normally on your first turn if you rage first.',
    'Brutal Critical (1 die)': 'Roll one extra weapon damage die when you score a critical hit with a melee attack (more dice at higher levels).',
    'Relentless Rage': 'If you drop to 0 HP while raging and don’t die outright, you can make a DC 10 Constitution save to drop to 1 HP instead (DC rises each use).',
    'Persistent Rage': 'Your rage ends early only if you fall unconscious or choose to end it.',
    'Indomitable Might': 'If your total for a Strength check is less than your Strength score, use your Strength score instead.',
    'Primal Champion': 'Your Strength and Constitution scores increase by 4, to a maximum of 24.',
    'Spellcasting': 'You can cast spells. Prepare/know spells and expend spell slots per your class table; your spellcasting ability sets save DC and attack bonus.',
    'Bardic Inspiration (d6)': 'As a bonus action, give a creature a Bardic Inspiration die it can add to one ability check, attack roll or save. Die grows with level.',
    'Jack of All Trades': 'Add half your proficiency bonus (round down) to any ability check that doesn’t already include it.',
    'Song of Rest (d6)': 'During a short rest, allies who spend Hit Dice regain extra HP (die grows with level).',
    'Expertise': 'Double your proficiency bonus on two chosen skills (or one skill + thieves’ tools) you are proficient with.',
    'Font of Inspiration': 'You regain all expended uses of Bardic Inspiration on a short or long rest, not just a long rest.',
    'Countercharm': 'As an action, start a performance that gives you and allies within 30 ft advantage on saves vs. being frightened or charmed.',
    'Magical Secrets': 'Learn spells from any class’s spell list; they count as bard spells for you.',
    'Superior Inspiration': 'When you roll initiative and have no Bardic Inspiration left, you regain one use.',
    'Channel Divinity (1/rest)': 'Channel divine energy for Turn Undead and a domain-specific effect. Regain uses on a short or long rest.',
    'Destroy Undead (CR 1/2)': 'When you Turn Undead, weak undead (up to the listed CR) are instantly destroyed instead of turned.',
    'Divine Intervention': 'Call on your deity for aid: roll d100; if you roll your cleric level or lower, your deity intervenes.',
    'Druidic': 'You know Druidic, the secret language of druids, and can leave hidden messages in it.',
    'Wild Shape': 'As an action, magically transform into a beast you have seen (limits by CR and movement type improve with level).',
    'Timeless Body': 'Age slows: you take no penalties for aging and can’t be aged magically.',
    'Beast Spells': 'You can cast many druid spells while in Wild Shape, using only somatic and verbal components.',
    'Archdruid': 'Unlimited Wild Shape, and you can ignore verbal/somatic/material components of your druid spells.',
    'Fighting Style': 'Adopt a particular style of fighting as your specialty (choose one). See the options.',
    'Second Wind': 'On your turn, use a bonus action to regain 1d10 + your fighter level HP. Recharges on a short or long rest.',
    'Action Surge (one use)': 'On your turn, take one additional action. Recharges on a short or long rest.',
    'Indomitable (one use)': 'Reroll a saving throw you fail; you must use the new roll. Recharges on a long rest.',
    'Martial Arts': 'Use Dexterity for unarmed strikes and monk weapons, roll a Martial Arts die for their damage, and make one unarmed strike as a bonus action when you Attack.',
    'Ki': 'You have ki points (equal to your monk level) to fuel Flurry of Blows, Patient Defense and Step of the Wind. Regain on a short or long rest.',
    'Unarmored Movement': 'Your speed increases while you wear no armor and use no shield (bonus grows with level; later lets you move across liquids and walls).',
    'Deflect Missiles': 'Use your reaction to reduce ranged weapon damage; if you reduce it to 0 you can catch and throw the missile back.',
    'Slow Fall': 'Use your reaction to reduce falling damage by five times your monk level.',
    'Stunning Strike': 'Spend 1 ki when you hit with a melee attack to force a Constitution save or stun the target until the end of your next turn.',
    'Evasion': 'On a Dexterity save for half damage, take no damage on a success and half on a failure.',
    'Stillness of Mind': 'Use your action to end one effect on yourself that is causing you to be charmed or frightened.',
    'Divine Sense': 'As an action, sense celestials, fiends and undead within 60 ft, and consecrated/desecrated places. Limited uses per long rest.',
    'Lay on Hands': 'A pool of healing (5 × paladin level) you can touch to restore, or spend 5 points to cure a disease or neutralize a poison.',
    'Divine Smite': 'When you hit with a melee weapon, expend a spell slot to deal +2d8 radiant damage (more vs. undead/fiends), rising with slot level.',
    'Divine Health': 'You are immune to disease.',
    'Aura of Protection': 'You and allies within 10 ft add your Charisma modifier to all saving throws.',
    'Aura of Courage': 'You and allies within 10 ft can’t be frightened while you are conscious.',
    'Improved Divine Smite': 'Your melee weapon hits deal an extra 1d8 radiant damage.',
    'Cleansing Touch': 'Use an action to end one spell on yourself or a willing creature you touch. Limited uses per long rest.',
    'Favored Enemy': 'You have advantage on Survival checks to track chosen enemy types and on Intelligence checks to recall info about them.',
    'Natural Explorer': 'You are a master of one type of terrain: benefits to travel, foraging, tracking and navigation there.',
    'Primeval Awareness': 'Spend a spell slot to sense whether certain creature types are within a range around you.',
    "Land's Stride": 'Nonmagical difficult terrain costs no extra movement, and you have advantage vs. plants that impede movement.',
    'Hide in Plain Sight': 'Spend 1 minute camouflaging to gain a large bonus to Stealth checks while you stay still against a solid surface.',
    'Vanish': 'You can Hide as a bonus action, and can’t be tracked by nonmagical means unless you choose to leave a trail.',
    'Feral Senses': 'You gain limited ability to fight and pinpoint invisible creatures near you.',
    'Foe Slayer': 'Once per turn add your Wisdom modifier to the attack or damage of an attack against a favored enemy.',
    'Sneak Attack': 'Once per turn, deal extra damage (scales with level) to a target you hit with a finesse/ranged weapon when you have advantage or an ally is adjacent to the target.',
    "Thieves' Cant": 'A secret mix of dialect, jargon and code that lets you hide messages in seemingly normal conversation.',
    'Cunning Action': 'Use a bonus action on each of your turns to Dash, Disengage or Hide.',
    'Uncanny Dodge': 'Use your reaction to halve the damage of one attack that hits you.',
    'Reliable Talent': 'When you make an ability check with a skill you’re proficient in, treat a d20 roll of 9 or lower as a 10.',
    'Blindsense': 'You are aware of the location of hidden or invisible creatures within 10 ft that you can hear.',
    'Slippery Mind': 'You gain proficiency in Wisdom saving throws.',
    'Elusive': 'No attack roll has advantage against you while you aren’t incapacitated.',
    'Stroke of Luck': 'Turn a missed attack into a hit, or a failed ability check into a 20, once per short or long rest.',
    'Font of Magic': 'You gain sorcery points and can convert them into spell slots (and back) as a Flexible Casting resource.',
    'Metamagic': 'Learn ways to twist your spells using sorcery points (choose from the options).',
    'Sorcerous Restoration': 'You regain 4 expended sorcery points whenever you finish a short rest.',
    'Pact Magic': 'You cast spells using a small number of slots that are all your highest level and recharge on a short rest.',
    'Eldritch Invocations': 'Fragments of forbidden knowledge that grant abilities or improve your eldritch blast (choose from the options).',
    'Pact Boon': 'Your patron grants a gift: Pact of the Chain (familiar), Pact of the Blade (summon a weapon) or Pact of the Tome (extra cantrips).',
    'Mystic Arcanum (6th level)': 'Choose one 6th-level spell you can cast once per long rest without a spell slot.',
    'Eldritch Master': 'Spend 1 minute entreating your patron to regain all expended Pact Magic spell slots, once per long rest.',
    'Arcane Recovery': 'Once per day on a short rest, recover expended spell slots totaling up to half your wizard level.',
    'Spell Mastery': 'Choose a 1st- and a 2nd-level spell you can cast at will, at their lowest level, without a slot.',
    'Signature Spells': 'Choose two 3rd-level spells you always have prepared and can each cast once per short rest without a slot.'
  };

  /* Subclasses per class (name + one-line summary). SRD ships one each;
     the common PHB choices are listed so there’s a real decision to make. */
  var subclasses = {
    Barbarian: [
      { name: 'Path of the Berserker', desc: 'Frenzy for an extra bonus-action attack each turn — at the cost of exhaustion. Pure aggression.' },
      { name: 'Path of the Totem Warrior', desc: 'Choose animal spirits (Bear, Eagle, Wolf) for resistances, mobility and pack tactics.' }
    ],
    Bard: [
      { name: 'College of Lore', desc: 'Extra skill proficiencies, Cutting Words to sap enemy rolls, and early access to Magical Secrets.' },
      { name: 'College of Valor', desc: 'A martial bard: armor and weapon training, Extra Attack, and inspiration that boosts damage and AC.' }
    ],
    Cleric: [
      { name: 'Life Domain', desc: 'The premier healer: bonus healing on every cure spell, heavy armor, and reviving Channel Divinity.' },
      { name: 'Light Domain', desc: 'Radiant blaster: Warding Flare to blind attackers, and control-the-battlefield fire spells.' },
      { name: 'War Domain', desc: 'A frontline priest: bonus attacks via Channel Divinity, martial weapons and heavy armor.' }
    ],
    Druid: [
      { name: 'Circle of the Land', desc: 'A caster druid: bonus spells by terrain, recover spell slots, and natural defenses.' },
      { name: 'Circle of the Moon', desc: 'A shapeshifter brawler: Wild Shape as a bonus action into tougher combat beasts.' }
    ],
    Fighter: [
      { name: 'Champion', desc: 'Simple and deadly: improved critical hits, extra fighting style, and athletic prowess.' },
      { name: 'Battle Master', desc: 'Tactical maneuvers fueled by superiority dice — trip, disarm, riposte and command allies.' },
      { name: 'Eldritch Knight', desc: 'A fighter who casts wizard spells, bonds weapons, and blends steel with abjuration/evocation magic.' }
    ],
    Monk: [
      { name: 'Way of the Open Hand', desc: 'The classic martial artist: knock down, push or stun with Flurry of Blows, plus self-healing.' },
      { name: 'Way of Shadow', desc: 'A ninja: darkness, silence, pass without trace, and teleporting between shadows.' },
      { name: 'Way of the Four Elements', desc: 'Bend ki into elemental spell-like disciplines — fire, water, wind and stone.' }
    ],
    Paladin: [
      { name: 'Oath of Devotion', desc: 'The paragon knight: a sacred weapon, turn the unholy, and protection against evil.' },
      { name: 'Oath of the Ancients', desc: 'A green knight of light and life: resistance to spell damage and protective auras.' },
      { name: 'Oath of Vengeance', desc: 'A relentless avenger: mark a foe, gain extra attacks and movement to hunt it down.' }
    ],
    Ranger: [
      { name: 'Hunter', desc: 'A monster-slayer: pick tricks like Colossus Slayer, Horde Breaker and defensive reactions.' },
      { name: 'Beast Master', desc: 'Bond with an animal companion that fights alongside you at your command.' }
    ],
    Rogue: [
      { name: 'Thief', desc: 'Fast hands and second-story work: use objects/tools as a bonus action and climb anything.' },
      { name: 'Assassin', desc: 'Deadly ambusher: automatic crits on surprised foes and disguise/infiltration expertise.' },
      { name: 'Arcane Trickster', desc: 'A magical burglar: enchantment/illusion spells and a mage hand you can steal with.' }
    ],
    Sorcerer: [
      { name: 'Draconic Bloodline', desc: 'Dragon-blooded toughness: bonus HP, natural armor, and an elemental damage affinity.' },
      { name: 'Wild Magic', desc: 'Chaotic power: a Wild Magic surge table and Tides of Chaos for advantage.' }
    ],
    Warlock: [
      { name: 'The Fiend', desc: 'A devilish patron: temporary HP on kills, fire and command magic, and cheat-death luck.' },
      { name: 'The Archfey', desc: 'A fey patron: escape into invisibility, charm/frighten foes, and misty tricks.' },
      { name: 'The Great Old One', desc: 'A cosmic horror patron: telepathy, mind-domination, and psychic defenses.' }
    ],
    Wizard: [
      { name: 'School of Evocation', desc: 'The blaster: sculpt spells to spare allies and squeeze extra damage from your evocations.' },
      { name: 'School of Abjuration', desc: 'The warder: an Arcane Ward that soaks damage and strong counters to hostile magic.' },
      { name: 'School of Divination', desc: 'The seer: Portent lets you replace rolls with foreseen dice; cheaper divination magic.' }
    ]
  };

  var fightingStyles = [
    { name: 'Archery', desc: '+2 bonus to attack rolls you make with ranged weapons.' },
    { name: 'Defense', desc: '+1 bonus to AC while you are wearing armor.' },
    { name: 'Dueling', desc: '+2 to damage when wielding a single one-handed melee weapon and no other weapon.' },
    { name: 'Great Weapon Fighting', desc: 'Reroll 1s and 2s on damage dice of a two-handed or versatile melee weapon.' },
    { name: 'Protection', desc: 'Use a shield and your reaction to impose disadvantage on an attack against a nearby ally.' },
    { name: 'Two-Weapon Fighting', desc: 'Add your ability modifier to the damage of your off-hand attack.' }
  ];

  var metamagic = [
    { name: 'Careful Spell', desc: 'Spend 1 sorcery point so chosen creatures automatically succeed on the spell’s save.' },
    { name: 'Distant Spell', desc: 'Spend 1 point to double a spell’s range (or make a touch spell reach 30 ft).' },
    { name: 'Empowered Spell', desc: 'Spend 1 point to reroll a number of damage dice up to your Charisma modifier.' },
    { name: 'Extended Spell', desc: 'Spend 1 point to double a spell’s duration (up to 24 hours).' },
    { name: 'Heightened Spell', desc: 'Spend 3 points to give one target disadvantage on its first save against the spell.' },
    { name: 'Quickened Spell', desc: 'Spend 2 points to cast a 1-action spell as a bonus action.' },
    { name: 'Subtle Spell', desc: 'Spend 1 point to cast without verbal or somatic components.' },
    { name: 'Twinned Spell', desc: 'Spend points equal to the spell’s level to target a second creature with a single-target spell.' }
  ];

  var invocations = [
    { name: 'Agonizing Blast', desc: 'Add your Charisma modifier to eldritch blast’s damage. (Requires eldritch blast.)' },
    { name: 'Armor of Shadows', desc: 'Cast mage armor on yourself at will, without a spell slot.' },
    { name: 'Devil’s Sight', desc: 'See normally in darkness, magical and nonmagical, out to 120 ft.' },
    { name: 'Eldritch Spear', desc: 'Eldritch blast’s range increases to 300 ft. (Requires eldritch blast.)' },
    { name: 'Repelling Blast', desc: 'Push a Large-or-smaller creature 10 ft away when you hit it with eldritch blast.' },
    { name: 'Mask of Many Faces', desc: 'Cast disguise self at will, without a spell slot.' },
    { name: 'Fiendish Vigor', desc: 'Cast false life on yourself at will as a 1st-level spell.' },
    { name: 'Beguiling Influence', desc: 'Gain proficiency in Deception and Persuasion.' },
    { name: 'Book of Ancient Secrets', desc: 'Inscribe and cast ritual spells from a book. (Requires Pact of the Tome.)' },
    { name: 'Thirsting Blade', desc: 'Attack twice with your pact weapon when you take the Attack action. (Requires Pact of the Blade, level 5.)' },
    { name: 'Voice of the Chain Master', desc: 'Communicate telepathically with and perceive through your familiar. (Requires Pact of the Chain.)' },
    { name: 'Misty Visions', desc: 'Cast silent image at will, without a spell slot.' }
  ];

  var feats = [
    { name: 'Alert', desc: '+5 to initiative, you can’t be surprised while conscious, and hidden attackers get no advantage on you.' },
    { name: 'Athlete', desc: '+1 Str or Dex; stand up from prone cheaply, climb at full speed, and jump from a short run-up.' },
    { name: 'Actor', desc: '+1 Cha; advantage on Deception/Performance to pass as someone else, and mimic speech or sounds.' },
    { name: 'Charger', desc: 'When you Dash then attack, add +5 damage or shove the target 10 ft.' },
    { name: 'Crossbow Expert', desc: 'Ignore loading, no disadvantage in melee, and a bonus hand-crossbow shot after a one-handed attack.' },
    { name: 'Defensive Duelist', desc: 'With a finesse weapon, use your reaction to add your proficiency bonus to AC vs. one melee attack.' },
    { name: 'Dual Wielder', desc: '+1 AC while wielding two melee weapons, use non-light weapons, and draw/stow two at once.' },
    { name: 'Great Weapon Master', desc: 'Bonus attack on a crit/kill, and an optional −5 to hit for +10 damage with a heavy weapon.' },
    { name: 'Lucky', desc: '3 luck points per long rest: reroll an attack, ability check or save, or an attack made against you.' },
    { name: 'Mage Slayer', desc: 'Reaction attack when a nearby creature casts, impose disadvantage on their concentration, and advantage vs. their spells.' },
    { name: 'Magic Initiate', desc: 'Learn two cantrips and one 1st-level spell (once/long rest) from a chosen class.' },
    { name: 'Mobile', desc: '+10 ft speed, ignore difficult terrain when you Dash, and no opportunity attacks from a foe you’ve struck.' },
    { name: 'Observant', desc: '+1 Int or Wis; read lips, and +5 to passive Perception and Investigation.' },
    { name: 'Polearm Master', desc: 'Bonus-action butt-end attack, and opportunity attacks when foes enter your reach with a polearm.' },
    { name: 'Resilient', desc: '+1 to one ability score and gain proficiency in its saving throws.' },
    { name: 'Savage Attacker', desc: 'Once per turn, reroll your melee weapon damage dice and use either total.' },
    { name: 'Sentinel', desc: 'Stop foes you hit with opportunity attacks, and punish enemies who attack your allies.' },
    { name: 'Sharpshooter', desc: 'Ignore cover and long-range penalties, and an optional −5 to hit for +10 damage on ranged attacks.' },
    { name: 'Shield Master', desc: 'Bonus-action shove with your shield, and use it to reduce or avoid Dexterity-save damage.' },
    { name: 'Spell Sniper', desc: 'Double the range of attack-roll spells, ignore cover, and learn an attack cantrip.' },
    { name: 'Tough', desc: 'Your hit point maximum increases by 2 per character level.' },
    { name: 'War Caster', desc: 'Advantage on concentration saves, cast with hands full, and cast a spell as an opportunity attack.' }
  ];

  /* Given a feature name (and the class), return a choice descriptor the
     level-up panel can render, or null for a plain informational feature. */
  function choiceFor(name, cls) {
    if (name === 'Ability Score Improvement') return { type: 'asi' };
    if (name === 'Fighting Style') return { type: 'pick', key: 'style', label: 'Choose a Fighting Style', options: fightingStyles };
    if (name === 'Metamagic') return { type: 'pick', key: 'metamagic', label: 'Choose a Metamagic option', options: metamagic };
    if (name === 'Eldritch Invocations') return { type: 'pick', key: 'invocation', label: 'Choose an Eldritch Invocation', options: invocations };
    if (/\(subclass\)/.test(name)) {
      return { type: 'pick', key: 'subclass', label: 'Choose a ' + name.replace(/\s*\(subclass\)/, ''), options: (subclasses[cls] || []) };
    }
    return null;
  }

  window.SRD_LEVELING = {
    classes: classes,
    features: features,
    subclasses: subclasses,
    fightingStyles: fightingStyles,
    metamagic: metamagic,
    invocations: invocations,
    feats: feats,
    choiceFor: choiceFor
  };
})();
