/* ============================================================
   Dice & Monsters — built-in adventures
   ------------------------------------------------------------
   Original short one-shots (not reproductions of any published
   adventure). Each scene can list monsters by slug so it can be
   sent straight to the Encounter Planner. Monster slugs match
   monsters-data.js.
   ============================================================ */
(function () {
  'use strict';

  window.ADVENTURES = [
    {
      id: 'builtin-sunken-crypt',
      title: 'The Sunken Crypt',
      levels: '1–2',
      summary: 'A flooded tomb beneath an old chapel has begun spitting up bones. ' +
        'The villagers want it sealed for good. A short dungeon crawl for 3–5 new heroes.',
      scenes: [
        {
          title: '1. The Drowned Stair',
          text: 'Rain hammers the ruined chapel. A stone stair descends into black water that ' +
            'laps at your knees. Something skitters in the dark. Read-aloud: "The cold bites, ' +
            'and the splashing ahead is far too rhythmic to be the rain." \n\n' +
            'DM notes: difficult terrain (waist-deep water). The rats burst from a submerged alcove.',
          monsters: [
            { slug: 'giant-rat', name: 'Giant Rat', count: 4 },
            { slug: 'swarm-of-rats', name: 'Swarm of Rats', count: 1 }
          ]
        },
        {
          title: '2. The Gallery of Names',
          text: 'A long hall lined with name-plaques, each scratched out. The water is shallow ' +
            'here, and the dead do not like to be read. As the party studies the wall, the ' +
            'skeletons of forgotten priests pull themselves free.\n\n' +
            'DM notes: a successful DC 12 Religion check reveals one un-scratched name — the key ' +
            'to the vault in scene 3.',
          monsters: [
            { slug: 'skeleton', name: 'Skeleton', count: 5 }
          ]
        },
        {
          title: '3. The Sealed Vault',
          text: 'A bronze door, warm to the touch. Beyond it waits the thing that has been ' +
            'gnawing the crypt awake — and the chill of a spirit it could never quite digest.\n\n' +
            'DM notes: speaking the name from scene 2 opens the door without a fight. Treasure: ' +
            'a +1 weapon and 120 gp in waterlogged coin.',
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
      summary: 'Caravans keep vanishing at the old toll bridge. A goblin band has moved in, ' +
        'and something bigger is giving the orders. A wilderness-to-warren one-shot.',
      scenes: [
        {
          title: '1. The Broken Caravan',
          text: 'A wrecked wagon blocks the road, its oxen gone, its strongbox pried open. ' +
            'Arrows whistle from the treeline. Read-aloud: "The ambushers are small, quick, ' +
            'and laughing."\n\n' +
            'DM notes: a wounded merchant hidden under the wagon (DC 10 Perception) can point ' +
            'the party to the warren.',
          monsters: [
            { slug: 'goblin', name: 'Goblin', count: 4 }
          ]
        },
        {
          title: "2. Gallows' Bridge",
          text: 'The toll bridge sags over a ravine. Goblins have rigged it with rockfalls and ' +
            'keep a wolf-rider as a sentry. Cut the ropes and the whole span — and whoever is ' +
            'on it — goes down.\n\n' +
            'DM notes: the worg can be ridden; if it falls, a goblin plummets with it.',
          monsters: [
            { slug: 'goblin', name: 'Goblin', count: 3 },
            { slug: 'worg', name: 'Worg', count: 1 }
          ]
        },
        {
          title: '3. The Warren Boss',
          text: 'Inside the hillside warren, firelight throws a huge shadow on the wall. The ' +
            'bugbear who has been bullying the goblins into raiding rises, cracking its knuckles.\n\n' +
            'DM notes: defeating the bugbear scatters the survivors. Treasure: the stolen ' +
            'strongbox (300 gp) and a map to scene-hook your next session.',
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
      summary: 'A merchant prince offers gold to anyone who can explain why his country manor ' +
        'stopped sending letters. The house, it turns out, has started eating its guests.',
      scenes: [
        {
          title: '1. The Welcome Hall',
          text: 'The front doors swing open on their own. Dust, silence, and a suit of armor ' +
            'that stands a little too attentively by the stair.\n\n' +
            'DM notes: the armor attacks if anyone climbs the stair or touches the silver.',
          monsters: [
            { slug: 'animated-armor', name: 'Animated Armor', count: 1 }
          ]
        },
        {
          title: '2. The Pantry',
          text: 'Shelves of rotted preserves — and a single, gleaming, untouched chest. ' +
            'Read-aloud: "It smells of fresh bread in here. Your mouth waters. The chest seems ' +
            'to lean toward you." A reeking ooze drips from the rafters above.\n\n' +
            'DM notes: the chest is the mimic; the ooze drops on the second round.',
          monsters: [
            { slug: 'mimic', name: 'Mimic', count: 1 },
            { slug: 'gray-ooze', name: 'Gray Ooze', count: 1 }
          ]
        },
        {
          title: '3. The Cellar',
          text: 'Down where the family was dragged, shadows peel from the walls and a ghoul ' +
            'looks up from its meal. Free the last surviving servant to complete the contract.\n\n' +
            'DM notes: light sources matter — the shadows lurk just past the lantern\'s reach. ' +
            'Reward: 500 gp from the merchant prince, plus his lasting favor.',
          monsters: [
            { slug: 'ghoul', name: 'Ghoul', count: 1 },
            { slug: 'shadow', name: 'Shadow', count: 2 }
          ]
        }
      ]
    }
  ];
})();
