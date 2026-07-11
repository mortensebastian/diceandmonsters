/* ============================================================
   Dice & Monsters — SRD spell descriptions + lookup
   ------------------------------------------------------------
   Adds readable details to the bare name/level/class list in
   srd-spells.js so a spell can be understood BEFORE it is picked
   — in the character editor, the read-only sheet, and the live
   Game Session. Pure data + a tiny lookup API (window.SpellInfo).

   Descriptions are concise, original summaries of the 5e SRD
   (CC-licensed) spells: enough to know what the spell does and its
   key numbers, not full rules text. Level and class come from
   window.SRD_SPELLS; this file owns school / casting time / range /
   components / duration / summary.
   ============================================================ */
(function () {
  'use strict';

  var MAP = {};
  // d(name, school, castingTime, range, components, duration, summary)
  function d(name, school, time, range, comp, dur, desc) {
    MAP[name.toLowerCase()] = {
      name: name, school: school, time: time, range: range,
      comp: comp, dur: dur, conc: /conc/i.test(dur), desc: desc
    };
  }

  /* ---- Cantrips ---- */
  d('Acid Splash', 'Conjuration', '1 action', '60 ft', 'V, S', 'Instant', 'Hurl a bubble of acid at one creature, or two within 5 ft of each other; each makes a Dex save or takes 1d6 acid (scales with level).');
  d('Chill Touch', 'Necromancy', '1 action', '120 ft', 'V, S', '1 round', 'A ghostly hand: ranged spell attack for 1d10 necrotic, and the target can’t regain HP until your next turn.');
  d('Dancing Lights', 'Evocation', '1 action', '120 ft', 'V, S, M', 'Conc, 1 min', 'Create up to four torch-bright floating lights (or a vaguely humanoid glow) that you move each turn.');
  d('Druidcraft', 'Transmutation', '1 action', '30 ft', 'V, S', 'Instant', 'A minor nature effect: predict the weather, bloom a flower, make a harmless sensory effect, or light/snuff a small flame.');
  d('Eldritch Blast', 'Evocation', '1 action', '120 ft', 'V, S', 'Instant', 'A beam of crackling energy; ranged spell attack for 1d10 force. Gains extra beams at higher levels.');
  d('Fire Bolt', 'Evocation', '1 action', '120 ft', 'V, S', 'Instant', 'Hurl a mote of fire; ranged spell attack for 1d10 fire. Ignites flammable objects.');
  d('Guidance', 'Divination', '1 action', 'Touch', 'V, S', 'Conc, 1 min', 'A willing creature adds 1d4 to one ability check of its choice before the spell ends.');
  d('Light', 'Evocation', '1 action', 'Touch', 'V, M', '1 hour', 'An object sheds bright light in a 20-ft radius. A creature holding it can make a Dex save to avoid the effect.');
  d('Mage Hand', 'Conjuration', '1 action', '30 ft', 'V, S', '1 min', 'A spectral hand manipulates objects, opens containers, and carries up to 10 lb.');
  d('Mending', 'Transmutation', '1 min', 'Touch', 'V, S, M', 'Instant', 'Repair a single break or tear in an object, such as a torn cloak or a broken chain link.');
  d('Message', 'Transmutation', '1 action', '120 ft', 'V, S, M', '1 round', 'Whisper a message to a creature you point at; it alone hears you and can whisper a reply.');
  d('Minor Illusion', 'Illusion', '1 action', '30 ft', 'S, M', '1 min', 'Create a sound or an image of an object; an Investigation check reveals it as false.');
  d('Poison Spray', 'Conjuration', '1 action', '10 ft', 'V, S', 'Instant', 'A puff of toxic gas; the target makes a Con save or takes 1d12 poison.');
  d('Prestidigitation', 'Transmutation', '1 action', '10 ft', 'V, S', 'Up to 1 hour', 'A harmless magical trick: clean or soil, chill/warm/flavor, make a sensory effect, or create a trinket.');
  d('Produce Flame', 'Conjuration', '1 action', 'Self', 'V, S', '10 min', 'A flame in your hand sheds light; you may hurl it as a ranged spell attack for 1d8 fire.');
  d('Ray of Frost', 'Evocation', '1 action', '60 ft', 'V, S', 'Instant', 'A frigid beam; ranged spell attack for 1d8 cold, and the target’s speed drops by 10 ft.');
  d('Resistance', 'Abjuration', '1 action', 'Touch', 'V, S, M', 'Conc, 1 min', 'A willing creature adds 1d4 to one saving throw of its choice before the spell ends.');
  d('Sacred Flame', 'Evocation', '1 action', '60 ft', 'V, S', 'Instant', 'Radiant flame descends on a target (ignores cover); Dex save or 1d8 radiant.');
  d('Shillelagh', 'Transmutation', '1 bonus action', 'Touch', 'V, S, M', '1 min', 'Your club or quarterstaff uses your spellcasting ability for attacks and deals 1d8 damage.');
  d('Shocking Grasp', 'Evocation', '1 action', 'Touch', 'V, S', 'Instant', 'Melee spell attack (advantage vs metal armor) for 1d8 lightning; the target can’t take reactions.');
  d('Spare the Dying', 'Necromancy', '1 action', 'Touch', 'V, S', 'Instant', 'Stabilize a creature that has 0 HP without needing a Medicine check.');
  d('Thaumaturgy', 'Transmutation', '1 action', '30 ft', 'V', 'Up to 1 min', 'A minor divine wonder: a booming voice, flickering flames, tremors, or other harmless signs.');
  d('True Strike', 'Divination', '1 action', '30 ft', 'S', 'Conc, 1 round', 'You gain advantage on your first attack roll against the target on your next turn.');
  d('Vicious Mockery', 'Enchantment', '1 action', '60 ft', 'V', 'Instant', 'Hurl a magical insult; Wis save or 1d4 psychic and disadvantage on its next attack roll.');

  /* ---- Level 1 ---- */
  d('Alarm', 'Abjuration', '1 min', '30 ft', 'V, S, M', '8 hours', 'Ward a door, window, or area; you’re alerted (mental ping or audible) when a creature enters it.');
  d('Animal Friendship', 'Enchantment', '1 action', '30 ft', 'V, S, M', '24 hours', 'A beast makes a Wis save or is charmed and treats you as friendly.');
  d('Bane', 'Enchantment', '1 action', '30 ft', 'V, S, M', 'Conc, 1 min', 'Up to three creatures make a Cha save or subtract 1d4 from their attack rolls and saving throws.');
  d('Bless', 'Enchantment', '1 action', '30 ft', 'V, S, M', 'Conc, 1 min', 'Up to three creatures add 1d4 to their attack rolls and saving throws.');
  d('Burning Hands', 'Evocation', '1 action', 'Self (15-ft cone)', 'V, S', 'Instant', 'Flames sheet from your fingertips; Dex save or 3d6 fire (half on a success).');
  d('Charm Person', 'Enchantment', '1 action', '30 ft', 'V, S', '1 hour', 'A humanoid makes a Wis save or is charmed toward you; it knows afterward and the charm ends if you harm it.');
  d('Color Spray', 'Illusion', '1 action', 'Self (15-ft cone)', 'V, S, M', '1 round', 'A dazzling spray blinds creatures totaling 6d10 HP in a cone (lowest current HP first).');
  d('Command', 'Enchantment', '1 action', '60 ft', 'V', '1 round', 'A creature makes a Wis save or obeys a one-word command such as approach, drop, flee, grovel, or halt.');
  d('Comprehend Languages', 'Divination', '1 action', 'Self', 'V, S, M', '1 hour', 'You understand any spoken language you hear and any written language you touch.');
  d('Create or Destroy Water', 'Transmutation', '1 action', '30 ft', 'V, S, M', 'Instant', 'Create up to 10 gallons of clean water (or rain in a cube), or destroy the same amount.');
  d('Cure Wounds', 'Evocation', '1 action', 'Touch', 'V, S', 'Instant', 'A creature you touch regains 1d8 + your spellcasting modifier HP (no effect on undead/constructs).');
  d('Detect Magic', 'Divination', '1 action', 'Self (30 ft)', 'V, S', 'Conc, 10 min', 'Sense the presence and school of any magic within 30 ft.');
  d('Detect Poison and Disease', 'Divination', '1 action', 'Self (30 ft)', 'V, S, M', 'Conc, 10 min', 'Sense poisons, poisonous creatures, and disease within 30 ft.');
  d('Disguise Self', 'Illusion', '1 action', 'Self', 'V, S', '1 hour', 'Change your appearance and clothing; physical inspection (Investigation) can reveal the illusion.');
  d('Divine Favor', 'Evocation', '1 bonus action', 'Self', 'V, S', 'Conc, 1 min', 'Your weapon attacks deal an extra 1d4 radiant damage.');
  d('Entangle', 'Conjuration', '1 action', '90 ft', 'V, S', 'Conc, 1 min', 'Grasping weeds fill a 20-ft square; creatures there make a Str save or are restrained.');
  d('Expeditious Retreat', 'Transmutation', '1 bonus action', 'Self', 'V, S', 'Conc, 10 min', 'You may take the Dash action as a bonus action on each of your turns.');
  d('Faerie Fire', 'Evocation', '1 action', '60 ft', 'V', 'Conc, 1 min', 'A 20-ft cube is outlined in light (Dex save negates); attacks against affected targets have advantage.');
  d('False Life', 'Necromancy', '1 action', 'Self', 'V, S, M', '1 hour', 'You gain 1d4 + 4 temporary hit points.');
  d('Feather Fall', 'Transmutation', '1 reaction', '60 ft', 'V, M', '1 min', 'Up to five falling creatures descend slowly and take no damage from the fall.');
  d('Find Familiar', 'Conjuration', '1 hour', '10 ft', 'V, S, M', 'Instant', 'Summon a spirit that takes an animal form to scout, deliver touch spells, and aid you.');
  d('Fog Cloud', 'Conjuration', '1 action', '120 ft', 'V, S', 'Conc, 1 hour', 'A 20-ft-radius sphere of fog heavily obscures its area.');
  d('Goodberry', 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Instant', 'Create up to 10 berries; eating one restores 1 HP and provides a day’s nourishment.');
  d('Grease', 'Conjuration', '1 action', '60 ft', 'V, S, M', '1 min', 'A 10-ft square becomes slick; creatures there make a Dex save or fall prone.');
  d('Guiding Bolt', 'Evocation', '1 action', '120 ft', 'V, S', '1 round', 'Ranged spell attack for 4d6 radiant; the next attack against the target has advantage.');
  d('Healing Word', 'Evocation', '1 bonus action', '60 ft', 'V', 'Instant', 'A creature you can see regains 1d4 + your spellcasting modifier HP at range.');
  d('Hellish Rebuke', 'Evocation', '1 reaction', '60 ft', 'V, S', 'Instant', 'As a reaction to being damaged, engulf the attacker in flames; Dex save or 2d10 fire (half on success).');
  d('Heroism', 'Enchantment', '1 action', 'Touch', 'V, S', 'Conc, 1 min', 'A creature is immune to being frightened and gains temp HP equal to your modifier at the start of each of its turns.');
  d("Hunter's Mark", 'Divination', '1 bonus action', '90 ft', 'V', 'Conc, 1 hour', 'Mark a creature; your weapon attacks against it deal an extra 1d6, and you have advantage to track it.');
  d('Identify', 'Divination', '1 min', 'Touch', 'V, S, M', 'Instant', 'Learn an item’s magical properties and how to use them, and any spells affecting a creature.');
  d('Inflict Wounds', 'Necromancy', '1 action', 'Touch', 'V, S', 'Instant', 'Melee spell attack for 3d10 necrotic.');
  d('Jump', 'Transmutation', '1 action', 'Touch', 'V, S, M', '1 min', 'A creature’s jump distance is tripled.');
  d('Longstrider', 'Transmutation', '1 action', 'Touch', 'V, S, M', '1 hour', 'A creature’s speed increases by 10 ft.');
  d('Mage Armor', 'Abjuration', '1 action', 'Touch', 'V, S, M', '8 hours', 'An unarmored, willing creature’s base AC becomes 13 + its Dex modifier.');
  d('Magic Missile', 'Evocation', '1 action', '120 ft', 'V, S', 'Instant', 'Three glowing darts each automatically hit a target for 1d4 + 1 force (more darts at higher levels).');
  d('Protection from Evil and Good', 'Abjuration', '1 action', 'Touch', 'V, S, M', 'Conc, 10 min', 'Aberrations, celestials, elementals, fey, fiends, and undead have disadvantage to hit the warded creature and can’t charm, frighten, or possess it.');
  d('Purify Food and Drink', 'Transmutation', '1 action', '10 ft', 'V, S', 'Instant', 'Food and drink in a 5-ft sphere become free of poison and disease.');
  d('Sanctuary', 'Abjuration', '1 bonus action', '30 ft', 'V, S, M', '1 min', 'Anyone attacking the warded creature must make a Wis save or choose a new target.');
  d('Shield', 'Abjuration', '1 reaction', 'Self', 'V, S', '1 round', 'An invisible barrier gives you +5 AC until your next turn, including against the triggering attack, and blocks Magic Missile.');
  d('Shield of Faith', 'Abjuration', '1 bonus action', '60 ft', 'V, S, M', 'Conc, 10 min', 'A shimmering field gives a creature +2 AC.');
  d('Silent Image', 'Illusion', '1 action', '60 ft', 'V, S, M', 'Conc, 10 min', 'Create a purely visual illusion up to a 15-ft cube that you can move; Investigation reveals it.');
  d('Sleep', 'Enchantment', '1 action', '90 ft', 'V, S, M', '1 min', 'Roll 5d8; that many HP of creatures fall unconscious, starting with the lowest current HP.');
  d('Speak with Animals', 'Divination', '1 action', 'Self', 'V, S', '10 min', 'You can comprehend and verbally communicate with beasts.');
  d('Thunderwave', 'Evocation', '1 action', 'Self (15-ft cube)', 'V, S', 'Instant', 'A wave of force; Con save or 2d8 thunder and pushed 10 ft (half and no push on a success).');
  d('Unseen Servant', 'Conjuration', '1 action', '60 ft', 'V, S, M', '1 hour', 'An invisible, mindless force performs simple tasks like fetching, cleaning, and carrying.');
  d('Witch Bolt', 'Evocation', '1 action', '30 ft', 'V, S, M', 'Conc, 1 min', 'Ranged spell attack for 1d12 lightning; each later turn you may use an action to deal 1d12 again.');

  /* ---- Level 2 ---- */
  d('Acid Arrow', 'Evocation', '1 action', '90 ft', 'V, S, M', 'Instant', 'Ranged spell attack for 4d4 acid plus 2d4 at the end of its next turn (half the initial damage on a miss).');
  d('Aid', 'Abjuration', '1 action', '30 ft', 'V, S, M', '8 hours', 'Up to three creatures each gain +5 to their current and maximum HP.');
  d('Alter Self', 'Transmutation', '1 action', 'Self', 'V, S', 'Conc, 1 hour', 'Change your form: adapt to water, grow natural weapons, or alter your appearance.');
  d('Animal Messenger', 'Enchantment', '1 action', '30 ft', 'V, S, M', '24 hours', 'Send a Tiny beast to carry a short message to a place you describe.');
  d('Augury', 'Divination', '1 min', 'Self', 'V, S, M', 'Instant', 'Learn whether a planned action within 30 minutes leads to weal, woe, both, or nothing.');
  d('Barkskin', 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Conc, 1 hour', 'A willing creature’s AC can’t be lower than 16, regardless of armor.');
  d('Blindness/Deafness', 'Necromancy', '1 action', '30 ft', 'V', '1 min', 'A creature makes a Con save or becomes blinded or deafened (your choice), retrying each turn.');
  d('Blur', 'Illusion', '1 action', 'Self', 'V', 'Conc, 1 min', 'Your form blurs; attackers have disadvantage unless they don’t rely on sight.');
  d('Calm Emotions', 'Enchantment', '1 action', '60 ft', 'V, S', 'Conc, 1 min', 'Humanoids in a 20-ft sphere make a Cha save; you suppress fear/charm or make them indifferent.');
  d('Continual Flame', 'Evocation', '1 action', 'Touch', 'V, S, M', 'Until dispelled', 'A flame that gives off heatless light burns on an object indefinitely.');
  d('Darkness', 'Evocation', '1 action', '60 ft', 'V, M', 'Conc, 10 min', 'A 15-ft-radius sphere of magical darkness that even darkvision cannot see through.');
  d('Darkvision', 'Transmutation', '1 action', 'Touch', 'V, S, M', '8 hours', 'A willing creature gains darkvision out to 60 ft.');
  d('Detect Thoughts', 'Divination', '1 action', 'Self', 'V, S, M', 'Conc, 1 min', 'Read a creature’s surface thoughts, or probe deeper (Wis save to resist and notice).');
  d('Enhance Ability', 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Conc, 1 hour', 'Grant advantage on one ability’s checks, plus a themed bonus (extra HP, no fall damage, carry capacity, etc.).');
  d('Enlarge/Reduce', 'Transmutation', '1 action', '30 ft', 'V, S, M', 'Conc, 1 min', 'Double or halve a creature or object’s size, changing its damage dice and Str checks (Con save to resist).');
  d('Find Traps', 'Divination', '1 action', '120 ft', 'V, S', 'Instant', 'Sense whether any trap is present within range (but not its location).');
  d('Flaming Sphere', 'Conjuration', '1 action', '60 ft', 'V, S, M', 'Conc, 1 min', 'A 5-ft sphere of fire you can move 30 ft each turn; Dex save or 2d6 fire to creatures near it.');
  d('Gentle Repose', 'Necromancy', '1 action', 'Touch', 'V, S, M', '10 days', 'Preserve a corpse from decay and prevent it from becoming undead.');
  d('Gust of Wind', 'Evocation', '1 action', 'Self (60-ft line)', 'V, S, M', 'Conc, 1 min', 'A strong wind pushes creatures (Str save), disperses gas, and hampers movement against it.');
  d('Heat Metal', 'Transmutation', '1 action', '60 ft', 'V, S, M', 'Conc, 1 min', 'A metal object glows red-hot for 2d8 fire; a creature touching it may drop it (Con save or disadvantage).');
  d('Hold Person', 'Enchantment', '1 action', '60 ft', 'V, S, M', 'Conc, 1 min', 'A humanoid makes a Wis save or is paralyzed, retrying at the end of each of its turns.');
  d('Invisibility', 'Illusion', '1 action', 'Touch', 'V, S, M', 'Conc, 1 hour', 'A creature (and its gear) turns invisible until it attacks or casts a spell.');
  d('Knock', 'Transmutation', '1 action', '60 ft', 'V', 'Instant', 'Loudly unlock a door, chest, or other lock (or unstick/unbar it).');
  d('Lesser Restoration', 'Abjuration', '1 action', 'Touch', 'V, S', 'Instant', 'End one disease or the blinded, deafened, paralyzed, or poisoned condition on a creature.');
  d('Levitate', 'Transmutation', '1 action', '60 ft', 'V, S, M', 'Conc, 10 min', 'A creature or object rises up to 20 ft and floats (Con save to resist an unwilling target).');
  d('Locate Object', 'Divination', '1 action', 'Self', 'V, S, M', 'Conc, 10 min', 'Sense the direction to a familiar or described object within 1,000 ft.');
  d('Magic Weapon', 'Transmutation', '1 bonus action', 'Touch', 'V, S', 'Conc, 1 hour', 'A nonmagical weapon becomes a magic weapon with a +1 bonus.');
  d('Mirror Image', 'Illusion', '1 action', 'Self', 'V, S', '1 min', 'Three illusory duplicates may each intercept an attack aimed at you.');
  d('Misty Step', 'Conjuration', '1 bonus action', 'Self', 'V', 'Instant', 'Teleport up to 30 ft to an unoccupied space you can see.');
  d('Moonbeam', 'Evocation', '1 action', '120 ft', 'V, S, M', 'Conc, 1 min', 'A 5-ft beam of moonlight you move each turn; Con save or 2d10 radiant.');
  d('Pass without Trace', 'Abjuration', '1 action', 'Self', 'V, S, M', 'Conc, 1 hour', 'You and nearby allies gain +10 to Stealth checks and leave no tracks.');
  d('Prayer of Healing', 'Evocation', '10 min', '30 ft', 'V', 'Instant', 'Up to six creatures each regain 2d8 + your spellcasting modifier HP.');
  d('Protection from Poison', 'Abjuration', '1 action', 'Touch', 'V, S', '1 hour', 'Neutralize one poison, then grant advantage on saves against poison and resistance to poison damage.');
  d('Ray of Enfeeblement', 'Necromancy', '1 action', '60 ft', 'V, S', 'Conc, 1 min', 'Ranged spell attack; the target deals only half damage with Strength-based weapons (Con save ends).');
  d('Scorching Ray', 'Evocation', '1 action', '120 ft', 'V, S', 'Instant', 'Three rays of fire, each a ranged spell attack for 2d6 fire.');
  d('See Invisibility', 'Divination', '1 action', 'Self', 'V, S, M', '1 hour', 'You see invisible creatures and objects and can see into the Ethereal Plane.');
  d('Silence', 'Illusion', '1 action', '120 ft', 'V, S', 'Conc, 10 min', 'No sound can be created or pass within a 20-ft sphere, preventing verbal spellcasting.');
  d('Spider Climb', 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Conc, 1 hour', 'A creature can walk on walls and ceilings, gaining a climb speed.');
  d('Spiritual Weapon', 'Evocation', '1 bonus action', '60 ft', 'V, S', '1 min', 'A floating spectral weapon makes a melee spell attack for 1d8 + your modifier force; move it 20 ft each turn.');
  d('Suggestion', 'Enchantment', '1 action', '30 ft', 'V, M', 'Conc, 8 hours', 'A creature makes a Wis save or follows a reasonable course of action you suggest.');
  d('Web', 'Conjuration', '1 action', '60 ft', 'V, S, M', 'Conc, 1 hour', 'Fill a 20-ft cube with sticky webbing (difficult terrain); Dex save or restrained.');
  d('Zone of Truth', 'Enchantment', '1 action', '60 ft', 'V, S', '10 min', 'In a 15-ft sphere, creatures can’t knowingly lie (Cha save negates but they don’t know it failed).');

  /* ---- Level 3 ---- */
  d('Animate Dead', 'Necromancy', '1 min', '10 ft', 'V, S, M', 'Instant', 'Raise a skeleton or zombie from bones or a corpse to obey your commands.');
  d('Beacon of Hope', 'Abjuration', '1 action', '30 ft', 'V, S', 'Conc, 1 min', 'Chosen creatures gain advantage on Wis and death saves and regain the maximum from any healing.');
  d('Bestow Curse', 'Necromancy', '1 action', 'Touch', 'V, S', 'Conc, 1 min', 'Curse a creature (Wis save): disadvantage on a chosen ability, wasted turns, or +1d8 necrotic from your attacks.');
  d('Blink', 'Transmutation', '1 action', 'Self', 'V, S', '1 min', 'At each turn’s end, roll a d20; on 11+ you vanish to the Ethereal until your next turn, dodging attacks.');
  d('Call Lightning', 'Conjuration', '1 action', '120 ft', 'V, S', 'Conc, 10 min', 'A storm cloud forms; each turn call a bolt for 3d10 lightning (Dex save for half) in a 5-ft column.');
  d('Clairvoyance', 'Divination', '10 min', '1 mile', 'V, S, M', 'Conc, 10 min', 'Create an invisible sensor at a known location to see or hear from it.');
  d('Counterspell', 'Abjuration', '1 reaction', '60 ft', 'S', 'Instant', 'Interrupt a creature casting a spell; automatically stops spells of 3rd level or lower (a check for higher).');
  d('Create Food and Water', 'Conjuration', '1 action', '30 ft', 'V, S', 'Instant', 'Create enough food and water to sustain up to 15 humanoids for a day.');
  d('Daylight', 'Evocation', '1 action', '60 ft', 'V, S', '1 hour', 'A 60-ft-radius sphere of bright daylight that can dispel magical darkness of lower level.');
  d('Dispel Magic', 'Abjuration', '1 action', '120 ft', 'V, S', 'Instant', 'End one spell on a creature, object, or area; automatic for spells of 3rd level or lower.');
  d('Fear', 'Illusion', '1 action', 'Self (30-ft cone)', 'V, S, M', 'Conc, 1 min', 'Creatures in a cone make a Wis save or drop what they hold and flee, frightened.');
  d('Fireball', 'Evocation', '1 action', '150 ft', 'V, S, M', 'Instant', 'A roaring blast fills a 20-ft-radius sphere; Dex save or 8d6 fire (half on a success).');
  d('Fly', 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Conc, 10 min', 'A willing creature gains a flying speed of 60 ft.');
  d('Gaseous Form', 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Conc, 1 hour', 'A willing creature becomes a misty cloud that can slip through narrow gaps and resists physical damage.');
  d('Haste', 'Transmutation', '1 action', '30 ft', 'V, S, M', 'Conc, 1 min', 'A target gains +2 AC, advantage on Dex saves, doubled speed, and one extra limited action (lethargic when it ends).');
  d('Hypnotic Pattern', 'Illusion', '1 action', '120 ft', 'S, M', 'Conc, 1 min', 'A twisting pattern in a 30-ft cube; creatures make a Wis save or are charmed and incapacitated.');
  d('Lightning Bolt', 'Evocation', '1 action', 'Self (100-ft line)', 'V, S, M', 'Instant', 'A 100-ft line of lightning; Dex save or 8d6 lightning (half on a success).');
  d('Magic Circle', 'Abjuration', '1 min', '10 ft', 'V, S, M', '1 hour', 'A cylinder that keeps a chosen creature type from crossing in or out and hampers them.');
  d('Major Image', 'Illusion', '1 action', '120 ft', 'V, S, M', 'Conc, 10 min', 'Create a detailed illusion with sound, smell, and temperature, movable each turn.');
  d('Mass Healing Word', 'Evocation', '1 bonus action', '60 ft', 'V', 'Instant', 'Up to six creatures each regain 1d4 + your spellcasting modifier HP.');
  d('Meld into Stone', 'Transmutation', '1 action', 'Touch', 'V, S', '8 hours', 'Step into a stone surface large enough to hold you and remain hidden within it.');
  d('Nondetection', 'Abjuration', '1 action', 'Touch', 'V, S, M', '8 hours', 'A creature, object, or area is hidden from divination magic.');
  d('Plant Growth', 'Transmutation', '1 action', '150 ft', 'V, S', 'Instant', 'Overgrow an area into difficult terrain, or (over 8 hours) enrich crops for a season.');
  d('Protection from Energy', 'Abjuration', '1 action', 'Touch', 'V, S', 'Conc, 1 hour', 'A creature gains resistance to one damage type: acid, cold, fire, lightning, or thunder.');
  d('Remove Curse', 'Abjuration', '1 action', 'Touch', 'V, S', 'Instant', 'End all curses affecting a creature or a cursed item it wears.');
  d('Revivify', 'Necromancy', '1 action', 'Touch', 'V, S, M', 'Instant', 'Return a creature that died within the last minute to life with 1 HP (needs 300 gp of diamonds).');
  d('Sleet Storm', 'Conjuration', '1 action', '150 ft', 'V, S, M', 'Conc, 1 min', 'Freezing rain: difficult terrain, heavily obscured, and Dex save or fall prone; breaks concentration.');
  d('Slow', 'Transmutation', '1 action', '120 ft', 'V, S, M', 'Conc, 1 min', 'Up to six creatures make a Wis save or have halved speed, −2 AC, and lose actions.');
  d('Speak with Dead', 'Necromancy', '1 action', '10 ft', 'V, S, M', '10 min', 'Ask a corpse up to five questions; it answers briefly and may not know or wish to answer.');
  d('Spirit Guardians', 'Conjuration', '1 action', 'Self (15 ft)', 'V, S, M', 'Conc, 10 min', 'Protective spirits swirl around you; enemies make a Wis save or take 3d8 radiant/necrotic and are slowed.');
  d('Stinking Cloud', 'Conjuration', '1 action', '90 ft', 'V, S, M', 'Conc, 1 min', 'A 20-ft sphere of reeking gas; Con save or a creature loses its action retching.');
  d('Tongues', 'Divination', '1 action', 'Touch', 'V, M', '1 hour', 'A creature understands any spoken language it hears and is understood by those who share a language.');
  d('Vampiric Touch', 'Necromancy', '1 action', 'Self', 'V, S', 'Conc, 1 min', 'Melee spell attack for 3d6 necrotic; you regain half the damage dealt.');
  d('Water Breathing', 'Transmutation', '1 action', '30 ft', 'V, S, M', '24 hours', 'Up to ten willing creatures can breathe underwater.');
  d('Water Walk', 'Transmutation', '1 action', '30 ft', 'V, S, M', '1 hour', 'Up to ten creatures can move across liquid surfaces as if they were solid ground.');
  d('Wind Wall', 'Evocation', '1 action', '120 ft', 'V, S, M', 'Conc, 1 min', 'A wall of strong wind deflects arrows and small flyers; Str save or 3d8 bludgeoning to those in it.');

  /* ---- Level 4 ---- */
  d('Banishment', 'Abjuration', '1 action', '60 ft', 'V, S, M', 'Conc, 1 min', 'A creature makes a Cha save or is banished to a harmless demiplane (or its home plane).');
  d('Blight', 'Necromancy', '1 action', '30 ft', 'V, S', 'Instant', 'Draining necrotic energy; Con save or 8d8 necrotic (extra harmful to plants).');
  d('Confusion', 'Enchantment', '1 action', '90 ft', 'V, S, M', 'Conc, 1 min', 'Creatures in a 10-ft sphere make a Wis save or behave randomly each turn.');
  d('Conjure Woodland Beings', 'Conjuration', '1 action', '60 ft', 'V, S, M', 'Conc, 1 hour', 'Summon fey creatures (such as pixies or sprites) to fight alongside you.');
  d('Control Water', 'Transmutation', '1 action', '300 ft', 'V, S, M', 'Conc, 10 min', 'Raise, part, redirect, or whirl a large body of water.');
  d('Death Ward', 'Abjuration', '1 action', 'Touch', 'V, S', '8 hours', 'The first time the warded creature would drop to 0 HP, it drops to 1 instead (or negates an instant-death effect).');
  d('Dimension Door', 'Conjuration', '1 action', '500 ft', 'V', 'Instant', 'Teleport yourself and one willing creature to a spot you can see or precisely describe.');
  d('Divination', 'Divination', '1 action', 'Self', 'V, S, M', 'Instant', 'A truthful reply about a goal, event, or activity within seven days.');
  d('Dominate Beast', 'Enchantment', '1 action', '60 ft', 'V, S', 'Conc, 1 min', 'A beast makes a Wis save or you command its actions; it repeats the save when it takes damage.');
  d('Fire Shield', 'Evocation', '1 action', 'Self', 'V, S, M', '10 min', 'A warm or chill shield: resistance to cold or fire, and 2d8 damage to creatures that hit you in melee.');
  d('Freedom of Movement', 'Abjuration', '1 action', 'Touch', 'V, S, M', '1 hour', 'A creature ignores difficult terrain and can’t be restrained, paralyzed, or grappled by magic.');
  d('Greater Invisibility', 'Illusion', '1 action', 'Touch', 'V, S', 'Conc, 1 min', 'A creature is invisible even while it attacks and casts spells.');
  d('Guardian of Faith', 'Conjuration', '1 action', '30 ft', 'V', '8 hours', 'A spectral guardian deals 20 radiant (Dex save for half) to enemies that enter its 10-ft space, up to 60 total.');
  d('Ice Storm', 'Evocation', '1 action', '300 ft', 'V, S, M', 'Instant', 'Hail pounds a 20-ft cylinder; Dex save or 2d8 bludgeoning + 4d6 cold, leaving difficult terrain.');
  d('Locate Creature', 'Divination', '1 action', 'Self', 'V, S, M', 'Conc, 1 hour', 'Sense the direction to a known creature or a kind of creature within 1,000 ft.');
  d('Polymorph', 'Transmutation', '1 action', '60 ft', 'V, S, M', 'Conc, 1 hour', 'A creature makes a Wis save or is transformed into a beast of equal or lower CR with new HP.');
  d('Stone Shape', 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Instant', 'Reshape a Medium-or-smaller stone object into any form you like (a door, weapon, or passage).');
  d('Stoneskin', 'Abjuration', '1 action', 'Touch', 'V, S, M', 'Conc, 1 hour', 'A willing creature gains resistance to nonmagical bludgeoning, piercing, and slashing.');
  d('Wall of Fire', 'Evocation', '1 action', '120 ft', 'V, S, M', 'Conc, 1 min', 'A wall of flame; Dex save or 5d8 fire to creatures on the side you choose (and to those passing through).');

  /* ---- Level 5 ---- */
  d('Animate Objects', 'Transmutation', '1 action', '120 ft', 'V, S', 'Conc, 1 min', 'Bring up to ten objects to life to attack at your command.');
  d('Cloudkill', 'Conjuration', '1 action', '120 ft', 'V, S', 'Conc, 10 min', 'A 20-ft sphere of poison fog; Con save or 5d8 poison, and it drifts away from you each turn.');
  d('Commune', 'Divination', '1 min', 'Self', 'V, S, M', '1 min', 'Ask your deity up to three yes-or-no questions.');
  d('Cone of Cold', 'Evocation', '1 action', 'Self (60-ft cone)', 'V, S, M', 'Instant', 'A blast of frigid air; Dex save or 8d8 cold (half on a success).');
  d('Contact Other Plane', 'Divination', '1 min', 'Self', 'V', '1 min', 'Contact an extraplanar entity for cryptic answers; Int save or take psychic damage and be stunned.');
  d('Dispel Evil and Good', 'Abjuration', '1 action', 'Self', 'V, S, M', 'Conc, 1 min', 'Celestials, elementals, fey, fiends, and undead have disadvantage against you; you can break enchantments or dismiss them.');
  d('Dominate Person', 'Enchantment', '1 action', '60 ft', 'V, S', 'Conc, 1 min', 'A humanoid makes a Wis save or you control it; it repeats the save when it takes damage.');
  d('Flame Strike', 'Evocation', '1 action', '60 ft', 'V, S, M', 'Instant', 'A column of divine fire; Dex save or 4d6 fire + 4d6 radiant (half on a success).');
  d('Geas', 'Enchantment', '1 min', '60 ft', 'V', '30 days', 'A creature makes a Wis save or must carry out your command, taking 5d10 psychic when it disobeys.');
  d('Greater Restoration', 'Abjuration', '1 action', 'Touch', 'V, S, M', 'Instant', 'End one: charm, petrification, a curse, a reduced ability score or HP maximum, or one level of exhaustion.');
  d('Hold Monster', 'Enchantment', '1 action', '90 ft', 'V, S, M', 'Conc, 1 min', 'Any creature (not undead) makes a Wis save or is paralyzed, retrying each turn.');
  d('Insect Plague', 'Conjuration', '1 action', '300 ft', 'V, S, M', 'Conc, 10 min', 'A 20-ft sphere of biting insects (difficult terrain); Con save or 4d10 piercing.');
  d('Legend Lore', 'Divination', '10 min', 'Self', 'V, S, M', 'Instant', 'Recall significant lore about a famous person, place, or notable object.');
  d('Mass Cure Wounds', 'Evocation', '1 action', '60 ft', 'V, S', 'Instant', 'Up to six creatures in a 30-ft sphere each regain 3d8 + your spellcasting modifier HP.');
  d('Raise Dead', 'Necromancy', '1 hour', 'Touch', 'V, S, M', 'Instant', 'Return a creature dead up to 10 days to life with 1 HP (needs a 500 gp diamond); penalties fade over days.');
  d('Scrying', 'Divination', '10 min', 'Self', 'V, S, M', 'Conc, 10 min', 'A sensor lets you see and hear a specific creature (Wis save to resist, harder for strangers).');
  d('Telekinesis', 'Transmutation', '1 action', '60 ft', 'V, S', 'Conc, 10 min', 'Move or manipulate a creature (Str contest) or object weighing up to 1,000 lb with your mind.');
  d('Tree Stride', 'Conjuration', '1 action', 'Self', 'V, S', 'Conc, 1 min', 'Step into one living tree and emerge from another of the same kind within 500 ft.');
  d('Wall of Force', 'Evocation', '1 action', '120 ft', 'V, S, M', 'Conc, 10 min', 'An invisible wall of force that nothing physical can pass and most spells can’t breach.');
  d('Wall of Stone', 'Evocation', '1 action', '120 ft', 'V, S, M', 'Conc, 10 min', 'Create a stone wall or bridge that becomes permanent if you concentrate the full duration.');

  /* ---- Level 6–9 staples ---- */
  d('Heal', 'Evocation', '1 action', '60 ft', 'V, S', 'Instant', 'A creature regains 70 HP and is cured of blindness, deafness, and any diseases.');
  d('Harm', 'Necromancy', '1 action', '60 ft', 'V, S', 'Instant', 'A creature makes a Con save or takes 14d6 necrotic (its HP maximum is reduced to match until healed).');
  d('Chain Lightning', 'Evocation', '1 action', '150 ft', 'V, S, M', 'Instant', 'A bolt strikes one target and leaps to up to three more; each makes a Dex save or takes 10d8 lightning (half).');
  d('Disintegrate', 'Transmutation', '1 action', '60 ft', 'V, S, M', 'Instant', 'A thin green ray; Dex save or 10d6 + 40 force. A creature reduced to 0 HP is turned to dust.');
  d('Sunbeam', 'Evocation', '1 action', 'Self (60-ft line)', 'V, S, M', 'Conc, 1 min', 'A line of brilliant light; Con save or 6d8 radiant and blinded, repeatable as an action each turn.');
  d('True Seeing', 'Divination', '1 action', 'Touch', 'V, S, M', '1 hour', 'For 1 hour a creature sees through illusions and invisibility and into the Ethereal, out to 120 ft.');
  d('Finger of Death', 'Necromancy', '1 action', '60 ft', 'V, S', 'Instant', 'Con save or 7d8 + 30 necrotic; a humanoid it kills rises as an obedient zombie.');
  d('Plane Shift', 'Conjuration', '1 action', 'Touch', 'V, S, M', 'Instant', 'Transport up to eight willing creatures to another plane, or banish one unwilling creature (Cha save).');
  d('Resurrection', 'Necromancy', '1 hour', 'Touch', 'V, S, M', 'Instant', 'Return a creature dead up to a century (with a whole body) to life at full HP.');
  d('Teleport', 'Conjuration', '1 action', '10 ft', 'V', 'Instant', 'Instantly transport yourself and up to eight companions to a distant destination you know.');
  d('Fire Storm', 'Evocation', '1 action', '150 ft', 'V, S', 'Instant', 'Roaring flames fill up to ten 10-ft cubes; Dex save or 7d10 fire (half on a success).');
  d('Earthquake', 'Evocation', '1 action', '500 ft', 'V, S, M', 'Conc, 1 min', 'The ground shakes in a 100-ft radius: fissures open, structures collapse, and creatures fall prone.');
  d('Power Word Stun', 'Enchantment', '1 action', '60 ft', 'V', 'Instant', 'A creature with 150 HP or fewer is stunned; it then makes Con saves to end the effect.');
  d('Sunburst', 'Evocation', '1 action', '150 ft', 'V, S, M', 'Instant', 'Brilliant light bursts in a 60-ft radius; Con save or 12d6 radiant and blinded.');
  d('Foresight', 'Divination', '1 min', 'Touch', 'V, S, M', '8 hours', 'For 8 hours a creature has advantage on all attack rolls, ability checks, and saves, and can’t be surprised.');
  d('Mass Heal', 'Evocation', '1 action', '60 ft', 'V, S', 'Instant', 'Restore up to 700 HP divided among any creatures, ending blindness, deafness, and diseases.');
  d('Meteor Swarm', 'Evocation', '1 action', '1 mile', 'V, S', 'Instant', 'Blazing meteors strike four points; each 40-ft sphere deals 20d6 fire + 20d6 bludgeoning (Dex save half).');
  d('Power Word Kill', 'Enchantment', '1 action', '60 ft', 'V', 'Instant', 'A creature with 100 HP or fewer simply dies, with no saving throw.');
  d('Time Stop', 'Transmutation', '1 action', 'Self', 'V', 'Instant', 'Take 1d4 + 1 turns in a row while time stops for everyone else (ends if you affect others).');
  d('Wish', 'Conjuration', '1 action', 'Self', 'V', 'Instant', 'The mightiest spell: duplicate any 8th-level-or-lower spell, or bend reality (with risk) to your will.');

  /* ---- Lookup API ---- */
  var byName = null;
  function indexSpells() {
    byName = {};
    var list = window.SRD_SPELLS || [];
    for (var i = 0; i < list.length; i++) byName[list[i].n.toLowerCase()] = list[i];
  }
  function levelInfo(name) {
    if (!byName) indexSpells();
    return byName[String(name).toLowerCase()] || null;
  }

  // Merge the details table with the level/class info from SRD_SPELLS.
  function get(name) {
    if (name == null) return null;
    var key = String(name).toLowerCase();
    var det = MAP[key], lvl = levelInfo(key);
    if (!det && !lvl) return null;
    return {
      name: (det && det.name) || (lvl && lvl.n) || name,
      level: lvl ? lvl.l : null,
      classes: (lvl && lvl.c) || [],
      school: det ? det.school : '',
      time: det ? det.time : '',
      range: det ? det.range : '',
      comp: det ? det.comp : '',
      dur: det ? det.dur : '',
      conc: det ? det.conc : false,
      desc: det ? det.desc : ''
    };
  }

  function has(name) { return !!MAP[String(name).toLowerCase()]; }

  function levelLabel(l) {
    if (l === 0) return 'Cantrip';
    if (l == null) return '';
    return 'Level ' + l;
  }

  // A compact one-line meta string, e.g.
  // "Evocation cantrip · 1 action · 120 ft · V, S · Instant".
  function meta(name) {
    var s = get(name);
    if (!s) return '';
    var head = s.school
      ? (s.school + (s.level === 0 ? ' cantrip' : (s.level != null ? ' · ' + levelLabel(s.level) : '')))
      : levelLabel(s.level);
    var parts = [head, s.time, s.range, s.comp, s.dur].filter(Boolean);
    return parts.join(' · ');
  }

  function desc(name) { var s = get(name); return s ? s.desc : ''; }

  // Combined text for a title="" tooltip.
  function tooltip(name) {
    var m = meta(name), d2 = desc(name);
    if (!m && !d2) return '';
    return (m ? m + '\n' : '') + d2;
  }

  window.SpellInfo = {
    get: get, has: has, meta: meta, desc: desc, tooltip: tooltip, levelLabel: levelLabel
  };
})();
