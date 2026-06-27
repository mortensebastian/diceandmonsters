/* ============================================================
   Dice & Monsters — built-in adventures
   ------------------------------------------------------------
   Original short one-shots (not reproductions of any published
   adventure). Each scene has read-aloud narration + DM notes and a
   monster list, so it can be sent straight to the Encounter Planner
   and read aloud by the narrator. Monster slugs match monsters-data.js.
   ============================================================ */
(function () {
  'use strict';

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
          text: 'Rain hammers the ruined chapel until the whole hillside seems to weep. Past the ' +
            'collapsed altar, a stone stair spirals down into black water that swallows your torchlight ' +
            'whole. The air smells of cold clay and older rot.\n\n' +
            '"You are knee-deep before you know it, and the water is far too warm. Somewhere ahead, ' +
            'something splashes in a slow, deliberate rhythm — as if it has all the time in the world."\n\n' +
            'DM notes: the flooded steps are difficult terrain (waist-deep). The rats nest in a ' +
            'submerged alcove and burst out when the party reaches the halfway landing. A character who ' +
            'searches the alcove (DC 12 Investigation) finds a silver holy symbol worth 25 gp, still warm.',
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
          monsters: [
            { slug: 'goblin', name: 'Goblin', count: 4 }
          ]
        },
        {
          title: "2. Gallows' Bridge",
          text: 'The old toll bridge sags across a deep ravine, its timbers grey and its name carved ' +
            'into the gatepost above a row of very fresh-looking nooses. The goblins have been busy: ' +
            'ropes run to stacked rockfalls at either end, and a wolf the size of a pony paces the far ' +
            'side with a rider on its back.\n\n' +
            '"Halfway across, the planks groan and shift beneath you. On the far bank the wolf-rider ' +
            'grins, raises a rusty hatchet over a taut rope, and the whole bridge seems to hold its breath."\n\n' +
            'DM notes: cutting the rigged ropes (DC 13) drops a rockfall — anyone in the marked squares ' +
            'makes a DC 13 Dexterity save or takes 2d6 and is knocked prone. If the worg is dropped from ' +
            'the bridge, its goblin rider falls with it.',
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
          text: 'The manor\'s front doors swing inward at your approach, though no hand touches them. ' +
            'Dust lies thick on a grand staircase, the chandeliers hang dark, and a single suit of ' +
            'polished armor stands at the foot of the stairs — far too clean for a house this forgotten.\n\n' +
            '"The silence has a weight to it, like held breath. As the last of you steps inside, the ' +
            'doors sigh shut, and the armor by the stairs turns its empty helm to watch you."\n\n' +
            'DM notes: the armor animates if anyone climbs the stairs, touches the silver candlesticks ' +
            '(worth 40 gp), or lingers more than a minute. A torn letter in the hall (DC 10 ' +
            'Investigation) warns: "Do not eat anything here. The house is hungry, and patient."',
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
          monsters: [
            { slug: 'wererat', name: 'Wererat', count: 2 },
            { slug: 'thug', name: 'Thug', count: 2 }
          ]
        }
      ]
    }
  ];
})();
