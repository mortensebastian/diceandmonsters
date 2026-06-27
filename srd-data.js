/* ============================================================
   Dice & Monsters — 5e SRD reference data (character building)
   ------------------------------------------------------------
   What classes, races and backgrounds confer to a character.
   Used by the Character Sheet to auto-apply ability score
   increases, saving-throw and skill proficiencies, speed and
   hit dice. Game rules from the 5e SRD (CC-licensed).
   Skill keys match the SKILLS list in character.js.
   ============================================================ */
(function () {
  'use strict';

  var SRD = {};

  // Class: hit die + the two saving-throw proficiencies it grants.
  SRD.classes = {
    'Barbarian': { hitDie: 12, saves: ['str', 'con'] },
    'Bard':      { hitDie: 8,  saves: ['dex', 'cha'] },
    'Cleric':    { hitDie: 8,  saves: ['wis', 'cha'] },
    'Druid':     { hitDie: 8,  saves: ['int', 'wis'] },
    'Fighter':   { hitDie: 10, saves: ['str', 'con'] },
    'Monk':      { hitDie: 8,  saves: ['str', 'dex'] },
    'Paladin':   { hitDie: 10, saves: ['wis', 'cha'] },
    'Ranger':    { hitDie: 10, saves: ['str', 'dex'] },
    'Rogue':     { hitDie: 8,  saves: ['dex', 'int'] },
    'Sorcerer':  { hitDie: 6,  saves: ['con', 'cha'] },
    'Warlock':   { hitDie: 8,  saves: ['wis', 'cha'] },
    'Wizard':    { hitDie: 6,  saves: ['int', 'wis'] }
  };

  // Race: ability score increases + walking speed (+ note for choices).
  SRD.races = {
    'Dragonborn':           { abilities: { str: 2, cha: 1 }, speed: 30 },
    'Dwarf (Hill)':         { abilities: { con: 2, wis: 1 }, speed: 25 },
    'Dwarf (Mountain)':     { abilities: { con: 2, str: 2 }, speed: 25 },
    'Elf (High)':           { abilities: { dex: 2, int: 1 }, speed: 30 },
    'Elf (Wood)':           { abilities: { dex: 2, wis: 1 }, speed: 35 },
    'Elf (Drow)':           { abilities: { dex: 2, cha: 1 }, speed: 30 },
    'Gnome (Forest)':       { abilities: { int: 2, dex: 1 }, speed: 25 },
    'Gnome (Rock)':         { abilities: { int: 2, con: 1 }, speed: 25 },
    'Half-Elf':             { abilities: { cha: 2 }, speed: 30,
                              note: '+1 to two other abilities of your choice' },
    'Half-Orc':             { abilities: { str: 2, con: 1 }, speed: 30 },
    'Halfling (Lightfoot)': { abilities: { dex: 2, cha: 1 }, speed: 25 },
    'Halfling (Stout)':     { abilities: { dex: 2, con: 1 }, speed: 25 },
    'Human':                { abilities: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30 },
    'Human (Variant)':      { abilities: {}, speed: 30,
                              note: '+1 to two abilities of your choice, one skill, and a feat' },
    'Tiefling':             { abilities: { int: 1, cha: 2 }, speed: 30 }
  };

  // Background: the two skill proficiencies it grants.
  SRD.backgrounds = {
    'Acolyte':        { skills: ['insight', 'religion'] },
    'Charlatan':      { skills: ['deception', 'sleightOfHand'] },
    'Criminal':       { skills: ['deception', 'stealth'] },
    'Entertainer':    { skills: ['acrobatics', 'performance'] },
    'Folk Hero':      { skills: ['animalHandling', 'survival'] },
    'Guild Artisan':  { skills: ['insight', 'persuasion'] },
    'Hermit':         { skills: ['medicine', 'religion'] },
    'Noble':          { skills: ['history', 'persuasion'] },
    'Outlander':      { skills: ['athletics', 'survival'] },
    'Sage':           { skills: ['arcana', 'history'] },
    'Sailor':         { skills: ['athletics', 'perception'] },
    'Soldier':        { skills: ['athletics', 'intimidation'] },
    'Urchin':         { skills: ['sleightOfHand', 'stealth'] }
  };

  SRD.alignments = [
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'
  ];

  window.SRD = SRD;
})();
