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
};

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
};

export const CONCEPT_ORDER = ["for", "while", "if", "elif"];

export const GOAL_TEXT = {
  reach_goal: "Erreiche das Ziel",
  collect_all: "Sammle alle Kristalle",
  destroy_all: "Zerstöre alle Gegner",
};
