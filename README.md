# RoboFight

Lernspiel: Kinder programmieren einen Roboter in **Python**. Der Roboter löst dann selbstständig Missionen,
später kämpft er auch in der Arena gegen andere. Neue Fähigkeiten gibt es nicht zu kaufen, sondern
**für gelernte Programmierkonzepte**.

Ideen, Spielmechaniken und Roadmap: [KONZEPT.md](KONZEPT.md)

## Stand: Prototyp (Phase 0)

- 10 Missionen von `robot.move()` bis zum Boss-Kampf. Konzepte: Befehle, Parameter, `for`, `while`, `if/else`, `elif`
- Echtes Python im Browser (Pyodide), Ausführung in einem Web Worker, damit nichts einfriert
- Replays mit Zeitlupe, Schrittmodus und Zeitleiste; die gerade laufende Codezeile wird im Editor hervorgehoben
- Kindgerechte Fehlermeldungen auf Deutsch, z. B. „Hier fehlt ein Doppelpunkt“ oder „Meintest du `robot.move()`?“
- Erkennung von Endlosschleifen und Hinweise auf typische Fehler, z. B. `robot.move` ohne Klammern
- Varianten-Missionen: Der Code muss auf mehreren Karten funktionieren, Hardcoding fällt auf
- Sterne (gelöst / wenige Zeilen / wenige Züge), XP, Level, freischaltbare Module und Abzeichen
- Fortschritt wird lokal im Browser gespeichert (noch kein Login)
- Läuft auf Desktop, Tablet und Handy, mit einer Tastenleiste und Befehlskarten zum Antippen
- Komplett selbst gehostet, ohne Drittanbieter-CDN (wichtig für den Datenschutz an Schulen)

## Starten

```bash
npm install      # lädt Pyodide + CodeMirror und kopiert sie nach web/vendor
npm start        # http://localhost:8000
```

Tests der Spiel-Engine:

```bash
pip install pytest
npm test
```

## Aufbau

```
web/
  index.html, css/, img/
  missions.json          ← alle Missionen (Karten als ASCII, Sterne-Ziele, Belohnungen)
  py/robofight/          ← Spiel-Engine in Python (läuft im Browser UND später auf dem Server)
    world.py             ← deterministische, tick-basierte Simulation
    robot_api.py         ← das `robot`-Objekt + Freischalt-Sperren
    runner.py            ← führt Kindercode aus, zeichnet Replay-Frames auf
    errors.py            ← kindgerechte Fehlermeldungen
  js/
    main.js              ← Screens, Ablauf, Belohnungen
    worker.js            ← Pyodide im Web Worker
    renderer.js          ← Arena-Zeichnung (Canvas)
    sprites.js           ← alle Grafiken (austauschbar, siehe unten)
    player.js            ← Replay-Steuerung
    progress.js          ← XP, Level, Abzeichen (localStorage)
tests/                   ← pytest: alle Missionen lösbar, Fehlertexte, Endlosschleifen …
```

### Kartenzeichen in `missions.json`

| Zeichen | Bedeutung |
|---|---|
| `#` | Wand |
| `.` | Boden |
| `> < ^ v` | Start des Roboters mit Blickrichtung |
| `G` | Ziel |
| `C` | Kristall |
| `T` | Zielscheibe (1 Treffer) |
| `E` | Wachposten (schießt, wenn man direkt daneben steht) |
| `B` | Boss (patrouilliert, schießt mit Abklingzeit) |

Neue Missionen: Eintrag in `missions.json` ergänzen und eine Musterlösung in `tests/test_missions.py` hinzufügen.
Der Test prüft dann automatisch, dass die Mission mit 3 Sternen lösbar ist.

### Eigene Sprites einbauen

Alle Grafiken werden aktuell per Code gezeichnet. Ein Bild ersetzt die gezeichnete Variante, zum Beispiel in `main.js`:

```js
import { registerSprite } from "./sprites.js";
registerSprite("robot", "img/robot.png");   // schaut nach rechts (Osten), wird automatisch gedreht
registerSprite("wall", "img/wall.png");
```

Verfügbare Namen: `robot`, `wall`, `floor`, `goal`, `crystal`, `target`, `sentry`, `boss`.

## Online stellen

Der Workflow `.github/workflows/ci.yml` testet jeden Push. Pushes auf `main` deployt er auf GitHub Pages
(einmalig aktivieren: *Settings → Pages → Source: GitHub Actions*). Danach ist das Spiel auch auf Tablets
und Handys erreichbar und lässt sich als App zum Startbildschirm hinzufügen.
