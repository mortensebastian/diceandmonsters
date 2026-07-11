/* ============================================================
   Dice & Monsters — built-in adventures
   ------------------------------------------------------------
   Original short one-shots (not reproductions of any published
   adventure). Each scene has story text + DM notes, optional traps
   and a monster list that can be sent straight to the Encounter
   Planner. Monster slugs match monsters-data.js.
   ============================================================ */
(function () {
  'use strict';

  // Build a battlemap from ASCII art so the pre-made maps stay readable.
  // Each string is a row; legend maps a character to a terrain type.
  // Any other char (space) = open floor. `areas` is an optional list of
  // numbered pins { n, x, y, title, read, dm } (read-aloud + secret DM notes).
  var LEGEND = {
    '#': 'wall', '~': 'water', ':': 'rapids', '"': 'grass', '=': 'wood',
    '&': 'briars', 'A': 'stalagmite', 'S': 'steps', '.': 'difficult', '^': 'lava'
  };
  function bmap(grid, rows, areas) {
    var cols = 0, terrain = {};
    rows.forEach(function (line, r) {
      if (line.length > cols) cols = line.length;
      for (var c = 0; c < line.length; c++) {
        var type = LEGEND[line.charAt(c)];
        if (type) terrain[c + ',' + r] = type;
      }
    });
    return { v: 1, grid: grid, cols: cols, rows: rows.length, terrain: terrain, areas: areas || [], bg: null };
  }

  window.ADVENTURES = [
    {
      id: 'builtin-sunken-crypt',
      title: 'The Sunken Crypt',
      levels: '1–2',
      summary: 'A flooded tomb beneath an old hill-chapel has begun spitting up bones, and the ' +
        'folk of Mallow Dell have stopped sleeping. The priest is gone, the well runs grey, and ' +
        'something down in the dark is counting the dead out loud. Seal it — or end it.',
      scenes: [
        {
          title: '1. The Drowned Stair',
          battlemap: bmap('square', [
            '##############',
            '#SS.......AA.#',
            '#SS...~~...A..',
            '#....~~~~....#',
            '#..~~~~~~~~..#',
            '#.:~~~~~~~~:.#',
            '#.:~~~~~~~~:.#',
            '#..~~~~~~~~..#',
            '#..A.~~~~..A.#',
            '#.AA......AA.#',
            '#SS........SS#',
            '##############'
          ], [
            { n: 1, x: 1, y: 1, title: 'The Drowned Stair',
              read: 'A stone stair spirals down into black water that swallows your torchlight whole.',
              dm: 'Flooded steps are difficult terrain (waist-deep). Submerged pit at the halfway landing: DC 12 Dex or drop 10 ft (1d6, start drowning).' },
            { n: 2, x: 11, y: 8, title: 'Submerged Alcove',
              read: 'A niche lies just under the surface, something pale glinting within.',
              dm: 'DC 12 Investigation: a silver holy symbol worth 25 gp, still oddly warm. The rats burst out when the party reaches here.' }
          ]),
          text: 'Rain hammers the ruined chapel until the whole hillside seems to weep. Past the ' +
            'collapsed altar, a stone stair spirals down into black water that swallows your torchlight ' +
            'whole. The air smells of cold clay and older rot.\n\n' +
            '"You are knee-deep before you know it, and the water is far too warm. Somewhere ahead, ' +
            'something splashes in a slow, deliberate rhythm — as if it has all the time in the world."\n\n' +
            'DM notes: the flooded steps are difficult terrain (waist-deep). The rats nest in a ' +
            'submerged alcove and burst out when the party reaches the halfway landing. A character who ' +
            'searches the alcove (DC 12 Investigation) finds a silver holy symbol worth 25 gp, still warm.',
          traps: [
            { name: 'Submerged Pit', detect: '12', disarm: '—', effect: 'A flooded shaft hidden beneath the water. DC 12 Dexterity save or drop 10 ft into deeper water (1d6 and start drowning).' }
          ],
          treasure: 'A silver holy symbol (25 gp) lies in the submerged alcove, still oddly warm.',
          monsters: [
            { slug: 'giant-rat', name: 'Giant Rat', count: 4 },
            { slug: 'swarm-of-rats', name: 'Swarm of Rats', count: 1 }
          ]
        },
        {
          title: '2. The Gallery of Names',
          text: 'The stair opens into a long hall of burial niches, each sealed with a name-plaque — ' +
            'and every name has been scratched out, gouged so deep the stone has split. The water is only ' +
            'ankle-deep here, but it lies dead still, like glass that does not want to be disturbed.\n\n' +
            '"As your light crosses the wall, the scratching starts again — dry bone on dry stone — and ' +
            'one by one, the niches answer. The forgotten priests of this place are sitting up."\n\n' +
            'DM notes: a successful DC 12 Religion check finds the single plaque that was never defaced — ' +
            'the name "Brother Aldous." Speaking it aloud at the vault door in Scene 3 opens it peacefully ' +
            'and the ghoul does not attack until the party takes the treasure.',
          npcs: [
            { name: 'Brother Aldous', role: 'Restless spirit', line: 'Speak my name at the door, and it will know you as a friend.' }
          ],
          monsters: [
            { slug: 'skeleton', name: 'Skeleton', count: 5 }
          ]
        },
        {
          title: '3. The Sealed Vault',
          text: 'At the hall\'s end stands a bronze door, sweating and faintly warm, carved with a ' +
            'sleeping face. Behind it lies the thing that has been gnawing this crypt awake — and the ' +
            'cold, patient ghost of the one priest it could devour everything but.\n\n' +
            '"The door breathes. You feel it through your boots more than hear it: a long, hungry sigh, ' +
            'and then a voice like wet gravel asking, very politely, to be let in."\n\n' +
            'DM notes: speaking "Brother Aldous" (Scene 2) opens the door without a fight; otherwise it ' +
            'must be forced (DC 15 Strength) and the ghoul ambushes. Treasure: a +1 weapon of the old ' +
            'order, 120 gp in waterlogged coin, and Aldous\'s journal, which hooks your next adventure.',
          treasure: 'A +1 weapon of the old order, 120 gp in waterlogged coin, and the journal of Brother Aldous (a hook for your next adventure).',
          monsters: [
            { slug: 'ghoul', name: 'Ghoul', count: 1 },
            { slug: 'specter', name: 'Specter', count: 1 }
          ]
        }
      ]
    },
    {
      id: 'builtin-gallows-bridge',
      title: "Goblins at Gallows' Bridge",
      levels: '1–3',
      summary: 'Three caravans have vanished on the Toll Road in a fortnight, all near the old ' +
        "Gallows' Bridge. The merchant guild is offering good coin and asking no hard questions. A " +
        'goblin band has claimed the crossing — but goblins do not plan this well on their own.',
      scenes: [
        {
          title: '1. The Broken Caravan',
          text: 'A wrecked wagon lies across the road where the forest leans in close. Its oxen are ' +
            'gone, its strongbox pried open and empty, and its canvas flaps in a wind that carries the ' +
            'smell of woodsmoke and something gamier underneath.\n\n' +
            '"The first arrow buries itself in the wagon a hand\'s width from your face. The second is ' +
            'followed by laughter — high, yipping, and far too pleased with itself — from the treeline ' +
            'on both sides."\n\n' +
            'DM notes: the goblins fight from cover (half cover among the trees). A wounded merchant ' +
            'hides beneath the wagon bed (DC 10 Perception); if rescued, he describes the warren and the ' +
            '"big shaggy one" giving the orders, granting the party advantage on the Scene 3 surprise.',
          npcs: [
            { name: 'Tobben Marsh', role: 'Wounded merchant', line: 'The big shaggy one gives the orders. Spare me and I will tell you where the warren is.' }
          ],
          monsters: [
            { slug: 'goblin', name: 'Goblin', count: 4 }
          ]
        },
        {
          title: "2. Gallows' Bridge",
          battlemap: bmap('square', [
            '"""""&&""""""&"""',
            '""&""""""""""""""',
            '"""""""===""""&""',
            '::::::=====:::::::',
            '~~~~~~~===~~~~~~~~',
            '~~~~~~~===~~~~~~~~',
            '~~~~~~~===~~~~~~~~',
            '~~~~~~~===~~~~~~~~',
            '::::::=====::::::.',
            '"""&"""===""""""."',
            '""""""""""""&""..',
            '"""""&"""""""""""'
          ], [
            { n: 1, x: 8, y: 2, title: 'North Approach',
              read: 'The old toll bridge sags across a deep ravine, its timbers grey and its name carved into a leaning post.',
              dm: 'Goblins wait in ambush at the far bank. The middle planks are rotten: DC 10 Dex if you run across, or fall prone.' },
            { n: 2, x: 8, y: 9, title: 'South Bank',
              read: 'White water roars through the rapids far below.',
              dm: 'A worg is chained here as a guard. Anyone knocked off the bridge lands in the rapids: DC 12 Str or swept 20 ft downstream.' }
          ]),
          text: 'The old toll bridge sags across a deep ravine, its timbers grey and its name carved ' +
            'into the gatepost above a row of very fresh-looking nooses. The goblins have been busy: ' +
            'ropes run to stacked rockfalls at either end, and a wolf the size of a pony paces the far ' +
            'side with a rider on its back.\n\n' +
            '"Halfway across, the planks groan and shift beneath you. On the far bank the wolf-rider ' +
            'grins, raises a rusty hatchet over a taut rope, and the whole bridge seems to hold its breath."\n\n' +
            'DM notes: cutting the rigged ropes (DC 13) drops a rockfall — anyone in the marked squares ' +
            'makes a DC 13 Dexterity save or takes 2d6 and is knocked prone. If the worg is dropped from ' +
            'the bridge, its goblin rider falls with it.',
          traps: [
            { name: 'Rigged Rockfall', detect: '13', disarm: '13', effect: 'Tripwires release stacked boulders at each end. DC 13 Dexterity save or 2d6 bludgeoning and knocked prone.' }
          ],
          monsters: [
            { slug: 'goblin', name: 'Goblin', count: 3 },
            { slug: 'worg', name: 'Worg', count: 1 }
          ]
        },
        {
          title: '3. The Warren Boss',
          text: 'Beyond the bridge, a hill-tunnel reeks of smoke, wet fur, and stolen food. Firelight ' +
            'throws an enormous shadow across the back wall — far too big for any goblin. The bugbear who ' +
            'has been bullying this whole band into raiding rises from a throne of broken crates and ' +
            'cracks its knuckles, one at a time.\n\n' +
            '"It does not roar. It simply looks at you, hefts a morningstar that has clearly seen a lot ' +
            'of use, and says in broken Common: \'You came all this way. Good. Saves me the walk.\'"\n\n' +
            'DM notes: kill or drive off the bugbear and the surviving goblins scatter into the woods. ' +
            'Treasure: the guild\'s stolen strongbox (300 gp), a fine dagger, and a crude map marking ' +
            '"the deep place" — a hook for a longer campaign.',
          npcs: [
            { name: 'Grosh', role: 'Bugbear slaver', line: 'You came all this way. Good. Saves me the walk.' }
          ],
          treasure: 'The stolen guild strongbox (300 gp), a fine dagger, and a crude map marking the deep place.',
          monsters: [
            { slug: 'bugbear', name: 'Bugbear', count: 1 },
            { slug: 'goblin', name: 'Goblin', count: 3 }
          ]
        }
      ]
    },
    {
      id: 'builtin-mimics-larder',
      title: "The Mimic's Larder",
      levels: '2–4',
      summary: 'Merchant-prince Calden Vey will pay handsomely to learn why his country manor stopped ' +
        'sending letters three months ago. The servants are silent, the larder is full, and the house ' +
        'itself has developed an appetite. Bring proof — and, if you can, survivors.',
      scenes: [
        {
          title: '1. The Welcome Hall',
          battlemap: bmap('square', [
            '##############',
            '#....####....#',
            '#....#..#....#',
            '#.SS.#..#.SS.#',
            '#.SS.####.SS.#',
            '#............#',
            '#....##.##...#',
            '#............#',
            '#####....#####',
            '#####....#####'
          ], [
            { n: 1, x: 6, y: 3, title: 'The Statue',
              read: 'A suit of ancient armor stands on a dais at the hall\'s centre, visor down.',
              dm: 'Animated Armor. It attacks when anyone steps onto the dais (row with the ## pillars) or touches the far door.' },
            { n: 2, x: 6, y: 9, title: 'The Doors',
              read: 'The manor\'s front doors swing inward at your approach, though no hand touches them.',
              dm: 'The doors slam and lock (DC 15 Str to force) once the last character is inside — the house wants them to stay.' }
          ]),
          text: 'The manor\'s front doors swing inward at your approach, though no hand touches them. ' +
            'Dust lies thick on a grand staircase, the chandeliers hang dark, and a single suit of ' +
            'polished armor stands at the foot of the stairs — far too clean for a house this forgotten.\n\n' +
            '"The silence has a weight to it, like held breath. As the last of you steps inside, the ' +
            'doors sigh shut, and the armor by the stairs turns its empty helm to watch you."\n\n' +
            'DM notes: the armor animates if anyone climbs the stairs, touches the silver candlesticks ' +
            '(worth 40 gp), or lingers more than a minute. A torn letter in the hall (DC 10 ' +
            'Investigation) warns: "Do not eat anything here. The house is hungry, and patient."',
          traps: [
            { name: 'Alarm Tripwire', detect: '12', disarm: '10', effect: 'A wire across the threshold rings bells deeper in the house. Missing it (DC 12) costs the party surprise in the next room.' }
          ],
          npcs: [
            { name: 'Calden Vey', role: 'Merchant-prince (patron)', line: 'Bring me proof of what happened. And if anyone in there still lives, bring them too.' }
          ],
          monsters: [
            { slug: 'animated-armor', name: 'Animated Armor', count: 1 }
          ]
        },
        {
          title: '2. The Pantry',
          text: 'The kitchen pantry should reek of three months\' rot — yet it smells of warm bread and ' +
            'cinnamon. Shelves sag with mouldered preserves, but in the center, untouched and gleaming, ' +
            'sits a single travelling chest with a fine brass lock.\n\n' +
            '"Your mouth waters without your permission. The chest seems to lean toward you, just ' +
            'slightly, the way a dog leans toward a dropped plate — and from the rafters above, something ' +
            'wet and grey begins, very slowly, to drip."\n\n' +
            'DM notes: the chest is the mimic (it grabs and grapples the first creature to touch it). The ' +
            'gray ooze drops from the ceiling at the start of round two. Inside the real cupboard (DC 13 ' +
            'Investigation) is a potion of healing and the cook\'s diary naming the cellar as the source.',
          treasure: 'A potion of healing waits in the real cupboard, behind the false one.',
          monsters: [
            { slug: 'mimic', name: 'Mimic', count: 1 },
            { slug: 'gray-ooze', name: 'Gray Ooze', count: 1 }
          ]
        },
        {
          title: '3. The Cellar',
          text: 'A narrow stair descends past claw-marks gouged into the stone — the marks of people ' +
            'dragged down who did not want to go. The cellar is black and close, and the lantern-light ' +
            'seems to shrink from the corners, where the dark is somehow darker than it should be.\n\n' +
            '"At the edge of your light, a ghoul looks up from its meal with mild, awful patience. And ' +
            'all around it, the shadows on the walls peel free and stand."\n\n' +
            'DM notes: light matters — the shadows lurk just past the lantern\'s reach and gain surprise ' +
            'on anyone who advances without a light source. Chained in the back is the last surviving ' +
            'servant; freeing her completes Calden Vey\'s contract for 500 gp and his lasting favor.',
          treasure: '500 gp from Calden Vey on completion, plus his lasting favor at court.',
          monsters: [
            { slug: 'ghoul', name: 'Ghoul', count: 1 },
            { slug: 'shadow', name: 'Shadow', count: 2 }
          ]
        }
      ]
    },
    {
      id: 'builtin-mistmarsh',
      title: 'The Reek of Mistmarsh',
      levels: '2–3',
      summary: 'The river trade has dried up: barges that enter the Mistmarsh do not come out. The ' +
        'reeve blames the fog, the fishermen blame the rats, and the truth is a nest of were-rat ' +
        'smugglers who have learned that a swamp keeps secrets very, very well.',
      scenes: [
        {
          title: '1. The Sinking Path',
          text: 'The causeway into the marsh is half-drowned, a line of rotting planks vanishing into ' +
            'reeds taller than a tall man. Clouds of biting insects hang in the warm, green light, and ' +
            'the whole world smells of stagnant water and old blood.\n\n' +
            '"Something rises from the reeds on leathery wings — a knot of them, needle-beaked and ' +
            'thirsty — and the droning you took for insects resolves, far too late, into the sound of ' +
            'wings the size of your hand."\n\n' +
            'DM notes: the stirges attack and try to attach (latch on and drain blood each round). The ' +
            'planks are difficult terrain; a creature reduced to dragging a latched stirge may fall ' +
            'prone in the muck (DC 11 Dexterity save).',
          traps: [
            { name: 'Hidden Sinkhole', detect: '12', disarm: '—', effect: 'Soft muck under the rotted planks. DC 12 Survival to spot; otherwise DC 13 Strength or be restrained until pulled free.' }
          ],
          monsters: [
            { slug: 'stirge', name: 'Stirge', count: 5 }
          ]
        },
        {
          title: '2. The Black Pool',
          text: 'The path widens onto a still, tar-dark pool ringed by the ribs of sunken boats. ' +
            'Dragonflies skate the surface. Nothing else moves — which, in a swamp this loud, is the ' +
            'most dangerous sign of all.\n\n' +
            '"The log you were about to step onto opens one yellow eye. Then the water erupts, and a ' +
            'maw lined with old teeth comes up out of the dark fast enough to take a leg."\n\n' +
            'DM notes: the crocodile fights from the water (it has advantage while submerged and can drag ' +
            'a grappled victim under). A capsized barge here holds a waterproofed strongbox (DC 14 ' +
            'Strength to haul up) with 200 gp in smuggled salt-coin.',
          treasure: 'A capsized barge hides a waterproofed strongbox: 200 gp in smuggled salt-coin.',
          monsters: [
            { slug: 'crocodile', name: 'Crocodile', count: 1 }
          ]
        },
        {
          title: '3. The Smugglers\' Stilt-House',
          text: 'Deep in the marsh squats a house on stilts, lantern-lit and busy, its underside ' +
            'crusted with cages and crates. These are the ones moving stolen goods through the fog — and ' +
            'when the moon is right, they move on four legs as easily as two.\n\n' +
            '"The smugglers reach for blades; their leader simply smiles, and the smile keeps widening, ' +
            'teeth crowding forward, fur rippling up the backs of his hands. \'Should\'ve stayed on the ' +
            'river,\' he says, and his voice is already changing."\n\n' +
            'DM notes: the wererat leader and a second wererat fight alongside human muscle. Silvered or ' +
            'magic weapons matter here. The cages hold two kidnapped bargemen; their rescue, plus the ' +
            'ledger of buyers, earns the reeve\'s reward of 400 gp and reopens the river.',
          npcs: [
            { name: 'Reeve Halden', role: 'Town reeve (patron)', line: 'Open the river again and the gold is yours. No questions about the salt.' }
          ],
          treasure: 'The reeve reward of 400 gp, and the smuggler ledger naming every buyer.',
          monsters: [
            { slug: 'wererat', name: 'Wererat', count: 2 },
            { slug: 'thug', name: 'Thug', count: 2 }
          ]
        }
      ]
    }
  ];
})();
