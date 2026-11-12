# RoboFight

Lernspiel: Kinder programmieren einen Roboter in **echtem Python**. In der Kampagne löst er selbstständig Missionen,
in der **3D-Arena** kämpft er gegen KI-Gegner und andere Spieler. Neue Waffen und Module gibt es nicht für Geld,
sondern **für gelernte Programmierkonzepte**.

Spielen: **https://hanstydecks.github.io/RoboFight/** · Ideen & Hintergründe: [KONZEPT.md](KONZEPT.md)

## Was drin ist

| Bereich | Inhalt |
|---|---|
| **Konten** | Registrieren, Anmelden, Abmelden. Zwei Modi: *Auf diesem Gerät* (mehrere Kinder pro Browser, funktioniert ohne Server, auch auf GitHub Pages) oder *Online/Schule* über den RoboFight-Server (geräteübergreifend, gemeinsame Rangliste, Klassen). |
| **Kampagne** | 16 Missionen in 2 Kapiteln: Befehle → Parameter → `for` → `while` → `if/else` → `elif` → Variablen → `def` → Parameter → Listen → Dictionaries → `update()`. Mehrere Kartenvarianten verhindern Hardcoding. 2D- und 3D-Ansicht. |
| **Fortschritt** | Sterne (gelöst / wenig Zeilen / wenig Züge), XP und 12 Level, 13 Abzeichen, Schrauben als Währung. |
| **Werkstatt & Shop** | 4 Chassis, 4 Waffen (Laser, Minen, Raketen, Railgun), 6 Module (Turbo, Panzerplatten, Akku, Schild, Reparatur, Radar), 7 Lackierungen, 5 Aufsätze. Alle Teile als 3D-Modelle, mit Gewichtsbudget pro Chassis. Teile werden über Missionen (also Konzepte) freigeschaltet. |
| **3D-Arena** (three.js) | Bots programmiert man mit `def update(robot):`. Alle Roboter handeln gleichzeitig und deterministisch. Training gegen 5 KI-Stufen, Ranglistenkämpfe mit Elo und Ligen (Bronze bis Meister-Coder), Kampf-Historie mit Wiederholung, tägliches Kampflimit. |
| **Schule** | Lehrkräfte legen Klassen mit Klassen-Code an, sehen eine Fortschritts-Matrix (Schüler × Missionen), lesen den Code der Schüler und setzen das Tageslimit für Ranglistenkämpfe. |
| **Kindgerecht** | Deutsche Fehlermeldungen, Erkennung von Endlosschleifen, nur `math` und `random` als Imports, kein Chat, Sounds per WebAudio (abschaltbar), läuft auf Tablet und Handy (Tastenleiste, Befehlskarten zum Antippen). |
| **Datenschutz** | Alles selbst gehostet: Pyodide, CodeMirror und three.js kommen aus `web/vendor`, keine Drittanbieter-CDNs. |

## Schnellstart (nur Browser, ohne Server)

```bash
npm install      # lädt Pyodide, CodeMirror und three.js nach web/vendor
npm start        # http://localhost:8000
```

Konten werden dann im Browser gespeichert. So läuft auch die GitHub-Pages-Version.

## Mit Server (Konten auf allen Geräten, Klassen, gemeinsame Rangliste)

```bash
npm install
pip install -r server/requirements.txt
ROBOFIGHT_TEACHER_KEY=geheim123 python -m server --host 0.0.0.0 --port 8000
```

Der Server liefert das Spiel unter `http://<server>:8000/` gleich mit aus und erkennt sich dort selbst.
Läuft das Spiel woanders (z. B. auf GitHub Pages), tragt die Server-Adresse in `web/config.js` ein
oder gebt sie beim Login unter „Online / Schule“ ein.

| Umgebungsvariable | Bedeutung |
|---|---|
| `ROBOFIGHT_TEACHER_KEY` | Schlüssel, den Lehrkräfte bei der Registrierung angeben müssen. Ohne diese Variable kann sich jeder als Lehrkraft registrieren (nur zum Testen). |
| `ROBOFIGHT_DB` | Pfad der SQLite-Datenbank (Standard: `robofight.db`). |
| `ROBOFIGHT_CORS` | Erlaubte Herkunft(en) für Browser-Anfragen, z. B. `https://hanstydecks.github.io` (Standard: `*`). |

Der Server führt jedes eingereichte Programm selbst noch einmal aus, und zwar in einem eigenen Prozess mit Zeitlimit.
Sterne, Schrauben und Elo lassen sich deshalb nicht fälschen. Für einen öffentlichen Betrieb sollte der Server
zusätzlich in einem abgeschotteten Container ohne Netzwerkzugriff laufen.

## Tests

```bash
pip install pytest fastapi uvicorn httpx
npm test
```

85 Tests decken Folgendes ab: Musterlösungen aller Missionen mit 3 Sternen, typische Fehler und Abkürzungen,
Arena-Regeln (Laser, Raketen, Minen, Schild, Bewegungskonflikte, Determinismus), KI-Stufen, Ökonomie
(Shop, Ausrüstung, Elo, Tageslimit, Abzeichen) und die komplette Server-API inklusive Klassen.

## Aufbau

```
web/                         ← das Spiel (statisch, läuft so auf GitHub Pages)
  index.html, config.js, css/, img/
  missions.json  parts.json  arenas.json  ai_bots.json  badges.json  bots/*.py
  py/robofight/              ← Spiel-Engine in Python – läuft im Browser (Pyodide) UND auf dem Server
    world.py       Kampagnen-Simulation (Raster, Ticks, Gegner)
    robot_api.py   das robot-Objekt der Kampagne + Freischalt-Sperren
    arena.py       Arena: mehrere Bots, update(robot), gleichzeitige Züge, Waffen & Module
    runner.py      führt Kindercode aus, zeichnet Replays auf
    economy.py     Sterne, XP, Level, Schrauben, Shop, Ausrüstung, Elo, Abzeichen
    sandbox.py     erlaubte Builtins/Imports, Schrittlimit
    errors.py      kindgerechte Fehlermeldungen
  js/
    app.js         Start, Router, Topbar
    api.js         LocalBackend (Browser) / RemoteBackend (Server) – gleiche Schnittstelle
    worker.js      Pyodide im Web Worker
    screens/       login, map, mission, garage, shop, arena, profile, teacher, help
    three/         models.js (3D-Modelle aller Teile), scene3d.js (3D-Arena, Turntable)
    renderer.js, sprites.js   2D-Ansicht
    replay-view.js, player.js Replay-Steuerung (2D/3D)
server/                      ← FastAPI + SQLite (Konten, Prüfung, Rangliste, Klassen)
tests/                       ← pytest
```

### Eigene Missionen

Trage eine neue Mission in `web/missions.json` ein und ergänze eine Musterlösung in `tests/test_missions.py`.
Die Kartenzeichen sind: `#` Wand, `.` Boden, `> < ^ v` Start, `G` Ziel, `C` Kristall, `T` Zielscheibe, `E` Wachposten,
`B` Boss, `F` Freund, `1`–`4` Arena-Startplätze. Missionen mit `"type": "arena"` laufen in der Arena-Engine.

### Eigene Grafiken

- **2D:** `registerSprite("robot", "img/robot.png")` in `web/js/sprites.js` ersetzt die gezeichnete Figur.
- **3D:** Jedes Teil wird in `web/js/three/models.js` von einer eigenen Funktion gebaut (`CHASSIS`, `WEAPONS`, `MODULES`, `HATS`).
  Dort lässt sich jedes Teil einzeln durch ein GLTF-Modell ersetzen. Die Position und die Blickrichtung +X bleiben dabei gleich.

### Neue Teile

Ergänze das Teil in `web/parts.json` (Gewicht, Preis, Freischalt-Mission, Werte), die Logik in `web/py/robofight/arena.py`
und das 3D-Modell in `models.js`.

## Online stellen

`.github/workflows/ci.yml` testet jeden Push. Pushes auf `main` veröffentlicht der Workflow auf GitHub Pages.
