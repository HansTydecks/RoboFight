// Command & concept reference shown next to the editor.
// `snippet` is inserted at the cursor; "\n" lines are indented to the cursor's level.
export const COMMANDS = {
  move: {
    sig: "robot.move()", desc: "Fährt ein Feld nach vorn.", snippet: "robot.move()",
  },
  move_n: {
    sig: "robot.move(n)", desc: "Fährt n Felder auf einmal.", snippet: "robot.move(3)",
  },
  turn_left: {
    sig: "robot.turn_left()", desc: "Dreht sich nach links.", snippet: "robot.turn_left()",
  },
  turn_right: {
    sig: "robot.turn_right()", desc: "Dreht sich nach rechts.", snippet: "robot.turn_right()",
  },
  shoot: {
    sig: "robot.shoot()", desc: "Feuert den Laser geradeaus.", snippet: "robot.shoot()",
  },
  at_goal: {
    sig: "robot.at_goal()", desc: "True, wenn du auf dem Ziel stehst.", snippet: "robot.at_goal()", sensor: true,
  },
  front_is_clear: {
    sig: "robot.front_is_clear()", desc: "True, wenn vor dir frei ist.", snippet: "robot.front_is_clear()", sensor: true,
  },
  enemy_ahead: {
    sig: "robot.enemy_ahead()", desc: "True, wenn ein Gegner in Blickrichtung ist.", snippet: "robot.enemy_ahead()", sensor: true,
  },
  enemy_count: {
    sig: "robot.enemy_count()", desc: "Wie viele Gegner sind noch übrig?", snippet: "robot.enemy_count()", sensor: true,
  },
  wait: {
    sig: "robot.wait()", desc: "Wartet einen Zug.", snippet: "robot.wait()",
  },
  energy: {
    sig: "robot.energy", desc: "Deine Laser-Energie (Zahl).", snippet: "robot.energy", sensor: true,
  },
  say: {
    sig: 'robot.say("Hallo")', desc: "Sprechblase – super zum Testen! Kostet keinen Zug.", snippet: 'robot.say("Hallo")',
  },
  report: {
    sig: "robot.report(wert)", desc: "Meldet einen Messwert an die Zentrale.", snippet: "robot.report(schritte)",
  },
  face: {
    sig: 'robot.face("N")', desc: 'Dreht dich direkt nach "N", "O", "S" oder "W".', snippet: 'robot.face("N")',
  },
  scan_directions: {
    sig: "robot.scan_directions()", desc: 'Liste der Richtungen mit Gegnern, z.B. ["N", "W"].', snippet: "robot.scan_directions()", sensor: true,
  },
  scan: {
    sig: "robot.scan()", desc: "Liste von Dictionaries: richtung, distanz, typ.", snippet: "robot.scan()", sensor: true,
  },
  shield: {
    sig: "robot.shield()", desc: "Schild: blockt 2 Züge lang jeden Schaden.", snippet: "robot.shield()",
  },
  ready: {
    sig: 'robot.ready("shield")', desc: "True, wenn ein Teil bereit ist (Abklingzeit & Energie).", snippet: 'robot.ready("shield")', sensor: true,
  },
};

// Everything the arena robot can do (shown in the arena editor).
export const ARENA_COMMANDS = [
  { group: "Bewegen (1 Aktion)", items: [
    ["robot.move()", "Ein Feld vorwärts."],
    ["robot.turn_left() / robot.turn_right()", "Um 90° drehen."],
    ['robot.face("N")', 'Direkt in eine Richtung drehen: "N", "O", "S", "W".'],
    ["robot.dash()", "Turbo: 2 Felder springen. Braucht Turbo-Düsen."],
    ["robot.wait()", "Einen Zug nichts tun."],
  ] },
  { group: "Kämpfen (1 Aktion)", items: [
    ["robot.shoot()", "Laser: 1 Schaden, geradeaus."],
    ["robot.fire_rocket()", "Rakete: 3 Schaden + Flächenschaden. Braucht Raketenwerfer."],
    ["robot.fire_railgun()", "Durchschlägt alle in einer Linie. Braucht Railgun."],
    ["robot.drop_mine()", "Mine auf dein Feld legen. Braucht Minenleger."],
    ["robot.shield()", "Schild für 2 Züge. Braucht Schildgenerator."],
    ["robot.repair()", "+2 Lebenspunkte. Braucht Reparatur-Arm."],
  ] },
  { group: "Sensoren (kosten keinen Zug)", items: [
    ["robot.enemy_ahead()", "True, wenn ein Gegner in Schussrichtung ist."],
    ["robot.front_is_clear()", "True, wenn das Feld vor dir frei ist."],
    ["robot.scan()", 'Liste der Gegner in Reichweite: {"name", "x", "y", "distanz", "richtung", "hp", "schild"}.'],
    ["robot.nearest_enemy()", "Der nächste Gegner (Dictionary) oder None."],
    ["robot.path_to(x, y)", "Richtung für den kürzesten Weg um Wände herum."],
    ["robot.direction_to(x, y)", "Grobe Richtung zu einem Punkt."],
    ["robot.distance_to(x, y)", "Anzahl Felder bis zu einem Punkt."],
    ['robot.ready("rocket")', "True, wenn das Teil bereit ist."],
    ['robot.cooldown("rocket")', "Wie viele Züge noch Abklingzeit?"],
    ['robot.has("radar")', "True, wenn das Teil eingebaut ist."],
  ] },
  { group: "Werte", items: [
    ["robot.x, robot.y, robot.dir", "Deine Position und Blickrichtung."],
    ["robot.hp, robot.max_hp", "Lebenspunkte."],
    ["robot.energy, robot.max_energy", "Energie für Waffen und Module."],
    ["robot.tick", "Der wievielte Zug ist gerade?"],
    ["robot.shield_active", "True, wenn dein Schild gerade an ist."],
    ["robot.arena_width, robot.arena_height", "Größe der Arena."],
    ['robot.say("Hallo")', "Sprechblase (kostet nichts)."],
  ] },
];

export const CONCEPTS = {
  for: {
    sig: "for i in range(n):", desc: "Wiederholt die eingerückten Zeilen n-mal.",
    snippet: "for i in range(3):\n    robot.move()",
  },
  while: {
    sig: "while bedingung:", desc: "Wiederholt, solange die Bedingung True ist.",
    snippet: "while not robot.at_goal():\n    robot.move()",
  },
  if: {
    sig: "if … else:", desc: "Entscheidet: wenn – sonst.",
    snippet: "if robot.front_is_clear():\n    robot.move()\nelse:\n    robot.turn_right()",
  },
  elif: {
    sig: "elif bedingung:", desc: "Noch eine Bedingung prüfen, wenn die erste nicht stimmt.",
    snippet: "elif robot.front_is_clear():\n    robot.move()",
  },
  variables: {
    sig: "zahl = 0", desc: "Variable: ein Merkzettel für einen Wert.", snippet: "schritte = 0",
  },
  def: {
    sig: "def name():", desc: "Eigener Befehl: die eingerückten Zeilen laufen beim Aufruf.",
    snippet: "def manoever():\n    robot.turn_left()\n    robot.shoot()",
  },
  def_param: {
    sig: "def name(n):", desc: "Eigener Befehl mit Parameter.",
    snippet: "def treppe(n):\n    for i in range(n):\n        robot.move()",
  },
  lists: {
    sig: "for x in liste:", desc: "Geht jedes Element einer Liste durch.",
    snippet: "for richtung in robot.scan_directions():\n    robot.face(richtung)",
  },
  dicts: {
    sig: 'ding["typ"]', desc: "Einen Wert aus einem Dictionary holen.",
    snippet: 'if ding["typ"] == "feind":\n    robot.shoot()',
  },
  update: {
    sig: "def update(robot):", desc: "Wird in der Arena jeden Zug aufgerufen – genau eine Aktion!",
    snippet: "def update(robot):\n    robot.shoot()",
  },
};

export const CONCEPT_ORDER = ["for", "while", "if", "elif", "variables", "def", "def_param", "lists", "dicts", "update"];

export const GOAL_TEXT = {
  reach_goal: "Erreiche das Ziel",
  collect_all: "Sammle alle Kristalle",
  destroy_all: "Zerstöre alle Gegner",
  report: "Melde den richtigen Messwert",
  win: "Gewinne den Kampf",
};
