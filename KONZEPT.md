# RoboFight – Konzept & Ideensammlung

> **Stand v1.0:** Umgesetzt sind Phase 0 bis 2 sowie große Teile von Phase 3. Dazu gehören Konten (lokal und Server),
> 16 Missionen, Shop und Werkstatt mit 3D-Modellen, die 3D-Arena mit Training, Rangliste und Elo/Ligen, Replays
> und das Lehrer-Dashboard. Noch offen sind unter anderem Team-PvP, Saisons, Level-Editor, Schul-SSO/LTI,
> der KI-Tutor und App-Store-Versionen.

> Kinder programmieren Roboter in Python, die selbstständig Quests lösen (PvE) und gegen andere Roboter antreten (PvP).
> Neue Fähigkeiten gibt es nicht per Kauf, sondern durch **gelernte Programmierkonzepte**.
> Zielgruppe: Schule (ca. 10–16 Jahre), Lehrkräfte, Eltern.

---

## 1. Kernidee in einem Satz

**„Du kämpfst nicht mit dem Daumen, sondern mit deinem Code.“**
Der Spieler steuert den Roboter nie direkt. Er schreibt ein Programm, drückt „Start“ und schaut zu, wie sein Roboter
die Arena allein meistert – oder scheitert. Danach wird verbessert. Diese Schleife (Code → Zuschauen → Verstehen → Verbessern)
ist das ganze Spiel.

### Was es von bestehenden Spielen abhebt
| Bestehend (Screeps, CodeCombat, Robocode, …) | RoboFight |
|---|---|
| Für Erwachsene oder sehr verspielt-kindlich | Ernsthaft-cool, aber kindgerecht |
| Kein Schulbezug, oder Schulbezug ohne echten Wettbewerb | Lehrplan-Mapping **und** Ligen/Ranglisten |
| Freischalten per Geld/Grind | Freischalten per **gelerntem Konzept** |
| Oft Java/JS | Echtes Python (Teilmenge), später übertragbar |
| Nur Desktop | Web + Mobile (Code am Tablet schreibbar) |

---

## 2. Das zentrale Freischalt-Prinzip: „Konzepte sind Waffen“

Jede Spielmechanik ist an ein Python-Konzept gekoppelt. Wer das Konzept nicht beherrscht, kann die Fähigkeit gar nicht sinnvoll nutzen –
der Lerneffekt ist also *eingebaut*, nicht aufgesetzt.

| Stufe | Python-Konzept | Freigeschaltet im Spiel |
|---|---|---|
| 1 | Funktionsaufrufe | `move()`, `turn_left()`, `shoot()` |
| 2 | Parameter | `move(3)`, `turn(90)` – präzise Bewegung |
| 3 | Variablen | `energie = robot.energy` – Status abfragen |
| 4 | `if / else` | **Sensoren**: `scan()`, `enemy_visible()` – reagieren statt blind laufen |
| 5 | `while`-Schleifen | Dauer-Verhalten: Patrouille, Dauerfeuer |
| 6 | `for` + `range` | **Salven**, Muster-Bewegungen |
| 7 | Eigene Funktionen (`def`) | **Combos / Spezialmanöver** speicherbar und wiederverwendbar |
| 8 | Listen | **Radar**: `scan_all()` liefert Liste aller Gegner → Zielauswahl |
| 9 | Dictionaries | **Gedächtnis**: Karte merken, Gegnerverhalten speichern |
| 10 | Mathe (`math`, Winkel) | **Präzisionswaffen**: Vorhalten beim Zielen, Ballistik |
| 11 | Klassen | **Drohnen** – eigene Unter-Einheiten mit eigenem Verhalten |
| 12 | Events/Callbacks | `on_hit()`, `on_wall()` – reaktive Programmierung |
| 13 | Zustandsautomaten | Profi-KI: Modi „Angriff / Flucht / Reparatur“ |

**Freischaltung = Mini-Prüfung:** Ein neues Modul gibt es erst, wenn eine kurze „Werkstatt-Mission“ mit genau diesem Konzept gelöst ist.
Beispiel: „Baue eine Funktion `zickzack(n)`, die den Roboter n-mal ausweichen lässt“ → Belohnung: Ausweich-Düsen.

---

## 3. Spielmodi

### 3.1 PvE – Kampagne „Die Werkstatt-Welt“
- **Story-Kapitel** mit Missionen, aufsteigend nach Konzepten (siehe Tabelle oben).
- Missionstypen:
  - *Labyrinth*: Weg finden (Schleifen, Bedingungen)
  - *Sammeln*: Kristalle einsammeln in X Zügen (Effizienz)
  - *Verteidigung*: Basis gegen Wellen von NPC-Bots schützen
  - *Boss-Kämpfe*: Bosse mit erkennbaren Mustern – man muss das Muster *im Code* kontern
  - *Debug-Missionen*: Ein kaputter Roboter-Code ist gegeben – repariere ihn (Fehler lesen lernen!)
- **Sterne-System** (1–3): gelöst / unter X Codezeilen / unter X Ticks. Motiviert zum Optimieren statt nur „irgendwie schaffen“.
- **Tägliche Quest**: eine kleine Aufgabe pro Tag, Streak-Belohnung.

### 3.2 PvP – Arena
- **Asynchrones PvP (Kern!)**: Man lädt seinen Bot-Code hoch, der Server lässt ihn gegen die Bots anderer kämpfen – auch wenn beide offline sind.
  Kinder müssen nicht gleichzeitig online sein, keine Echtzeit-Stress, perfekt für Schule.
- **Replays**: Jeder Kampf ist ansehbar, mit Zeitleiste und „welche Codezeile lief gerade?“-Anzeige. *Das* ist der wichtigste Lernmoment.
- **Modi**:
  - 1 gegen 1 (Duell)
  - Free-for-all (4–8 Bots)
  - **Team 2v2 / 3v3**: Bots können Nachrichten austauschen (`radio.send()`), Kooperation programmieren
  - King of the Hill: Zone halten
  - „Gleiche Waffen“-Modus: Alle haben dieselbe Ausrüstung, nur der Code zählt (fair für Neue)
- **Elo/Liga-System**: Bronze → Silber → Gold → Platin → Diamant → „Meister-Coder“.
  Saisons à 4–6 Wochen (passt zu Schulhalbjahren).

### 3.3 Turniere & Events
- **Klassen-Turnier**: Lehrkraft startet Turnier, Ko-System, Live-Übertragung am Beamer.
- **Schul-gegen-Schul-Liga**: Klassen bilden Teams, Durchschnitts-Elo entscheidet.
- **Wochen-Challenge**: Spezielle Regeln („Nur 20 Zeilen erlaubt“, „Keine Waffen – nur Schieben“, „Nebel – Sensor nur 3 Felder“).
- **Familien-Duell**: Eltern-Account kann gegen das eigene Kind antreten (sehr motivierend!).

---

## 4. Progression & Gamification („Hardcore, aber gesund“)

### 4.1 Mehrere Fortschrittsachsen
1. **Coder-Level (XP)** – für gelöste Missionen, gelernte Konzepte. Zeigt *Lernfortschritt*.
2. **Arena-Rang (Elo)** – zeigt *Wettbewerbsstärke*.
3. **Roboter-Ausbau** – Chassis, Waffen, Module (freigeschaltet über Konzepte).
4. **Sammlung/Kosmetik** – Lackierungen, Aufkleber, Sieges-Animationen, Arena-Titel.
5. **Abzeichen/Achievements** – z. B.:
   - „Erste Schleife“, „Rekursions-Magier“, „Bug-Jäger“ (10 Debug-Missionen)
   - „Pazifist“ (Mission ohne Schuss gewonnen)
   - „Minimalist“ (Mission mit ≤ 5 Zeilen)
   - „Comeback“ (mit < 10 % Energie gewonnen)

### 4.2 Ausrüstung mit Budget statt Pay-to-Win
- Jeder Roboter hat ein **Energie-/Gewichtsbudget** (z. B. 100 Punkte).
- Module kosten Budget: schwere Kanone 40, Schild 30, Turbo 20, Radar 15 …
- Freischalten erweitert die *Auswahl*, nicht die *Macht* → Neue können gegen Profis gewinnen, wenn ihr Code besser ist.
- Matchmaking nach Liga, damit Anfänger nicht ständig verlieren.

### 4.3 Beispiel-Ausrüstung
| Kategorie | Beispiele |
|---|---|
| Chassis | Leicht (schnell, wenig HP), Panzer (langsam, viel HP), Schwebe (ignoriert Gelände) |
| Waffen | Laser (gerade, sofort), Rakete (Bogen, Flächenschaden), Mine (`drop_mine()`), Greifarm |
| Bewegung | Turbo, Sprung, Teleport (Cooldown), Rückwärtsgang |
| Sensoren | Kurzradar, Langradar, Wärmebild (sieht durch Wände), Gegner-Analyse |
| Verteidigung | Schild, Reparatur-Kit, Tarnung, Täusch-Hologramm |
| Spezial | Drohnen (ab Klassen-Konzept), Hacker-Modul (stört gegnerischen Sensor kurz) |

### 4.4 Belohnungen ohne Suchtfalle
- **Keine Lootboxen, keine Echtgeld-Währung im Kinder-Account.**
- Tägliches Energielimit für PvP-Kämpfe (z. B. 20 Ranglisten-Kämpfe/Tag), das schützt vor Endlos-Spielen und zwingt dazu, Code
  *nachzudenken* statt blind neu zu starten.
- Eltern-/Lehrer-Einstellungen: Spielzeitfenster, PvP an/aus, Chat aus.

---

## 5. Die Programmier-Umgebung (das Herzstück)

### 5.1 Editor
- Desktop: **Monaco** oder **CodeMirror 6** mit Python-Syntax, Autovervollständigung für die Roboter-API, Tooltips mit Beispielen.
- Mobile/Tablet: Spezial-Tastaturleiste (`:`, `()`, Einrücken, `if`, `for`, `robot.`), **Snippet-Buttons**, große Schrift.
- **Blocks ↔ Python Umschalter** für Einsteiger (Blockly-Ansicht erzeugt echten Python-Code, man sieht beides nebeneinander).
  Ab Stufe ~5 wird Python-Text Pflicht für Ranglisten.
- Kindgerechte Fehlermeldungen: statt `IndentationError: unexpected indent` →
  „Zeile 4 ist weiter eingerückt als sie sein sollte. Gehört sie wirklich in den `if`-Block darüber?“

### 5.2 Debugging-Werkzeuge (Lernturbo)
- **Zeitlupe & Schrittmodus**: Kampf Tick für Tick, aktuelle Codezeile hervorgehoben.
- **Variablen-Monitor**: Live-Werte von Variablen neben der Arena.
- `robot.say("…")`: Sprechblase über dem Roboter = kindgerechtes `print`-Debugging.
- **Testarena**: Gegen Trainings-Dummies (stehend, kreisend, flüchtend, aggressiv) testen ohne Elo-Risiko.

### 5.3 Beispiel-Code (Stufe ~6)
```python
def kreis_angriff():
    for i in range(4):
        robot.move(2)
        robot.turn(90)
        if robot.enemy_visible():
            robot.shoot()

while robot.alive():
    if robot.energy < 20:
        robot.shield()
    elif robot.enemy_visible():
        robot.aim(robot.nearest_enemy())
        robot.shoot()
    else:
        kreis_angriff()
```

---

## 6. Schul-Features („sauber für die Schule“)

### 6.1 Lehrer-Dashboard
- Klassen anlegen, Kinder per **Klassencode/QR-Code** einladen (keine E-Mail der Kinder nötig).
- Übersicht: Wer steht bei welchem Konzept? Wo hängen viele fest? (Heatmap pro Konzept)
- Code der Schüler ansehen, Kommentar hinterlassen, „Hinweis schicken“.
- Missionen freigeben/sperren passend zum Unterricht.
- **Eigene Missionen bauen** (Level-Editor) und mit anderen Lehrkräften teilen.
- Export für Notengebung/Lernstandsberichte (CSV/PDF), optional.
- **Plagiats-Hinweis**: Ähnlichkeitsprüfung von Bot-Code innerhalb einer Klasse.

### 6.2 Unterrichtsmaterial
- Fertige Unterrichtseinheiten (45/90 min) pro Konzept, mit Arbeitsblatt und Lösung.
- Mapping auf Lehrpläne (z. B. Informatik Sek I, Bundesländer-Lehrpläne, Medienkompetenzrahmen NRW).
- „Turnierstunde“-Vorlage: Am Ende einer Einheit Klassen-Turnier am Beamer.

### 6.3 Datenschutz & Sicherheit (DSGVO, Kinder)
- **Datensparsam**: Kinder-Accounts nur mit Pseudonym + Avatar, keine Klarnamen öffentlich.
- Anmeldung über Schul-SSO möglich (z. B. IServ, Microsoft 365 Education, Google Workspace for Education, Moodle/LTI).
- Eltern-Einwilligung für unter 16-Jährige (Art. 8 DSGVO) bei privater Registrierung.
- **Kein freier Chat**. Nur vordefinierte Reaktionen („GG!“, „Starker Bot!“, Emojis). Bot-Namen werden gefiltert.
- Hosting in der EU, Auftragsverarbeitungsvertrag für Schulen.
- Schulweite oder klassenweite „geschlossene Ligen“ möglich – ganz ohne öffentliches Internet-PvP.

---

## 7. Accounts & Rollen

| Rolle | Kann |
|---|---|
| Schüler/Kind | Spielen, Bots bauen, PvE/PvP, Kosmetik |
| Eltern | Kind-Accounts verwalten, Zeitlimits, Fortschritt sehen, selbst mitspielen |
| Lehrkraft | Klassen, Missionen, Turniere, Auswertung |
| Schul-Admin | Lehrkräfte verwalten, SSO, Lizenzen |
| Moderator/Betreiber | Meldungen prüfen, Namen moderieren |

Login-Varianten: Klassencode + Bild-Passwort (für Jüngere), Benutzername/Passwort, Schul-SSO, Eltern-E-Mail.

---

## 8. Technische Architektur (Vorschlag)

### 8.1 Grundprinzip: Deterministische Simulation
Die Kampf-Engine ist **tick-basiert und deterministisch** (fester Seed). Das ermöglicht:
- Identische Replays überall (Server speichert nur Code-Versionen + Seed, nicht das Video).
- Faires asynchrones PvP.
- Gleiches Ergebnis im Browser (Training) und auf dem Server (Rangliste).

### 8.2 Wo läuft der Python-Code?
| Option | Vorteil | Nachteil |
|---|---|---|
| **Pyodide (Python→WebAssembly) im Browser** | Kein Server-Aufwand fürs Training, offline-fähig | Startzeit ~ein paar Sekunden, auf alten Tablets langsam |
| **Server-Sandbox** (z. B. Python in gVisor/Firecracker, oder WASM-Runtime wie wasmtime) | Sicher & fair für Ranglisten | Infrastrukturkosten |
| **Eigener Mini-Interpreter für eine Python-Teilmenge** (z. B. auf Basis von Skulpt/Brython oder selbst gebaut) | Volle Kontrolle: Schritt-Limits, Zeilen-Tracking, kinderfreundliche Fehler | Kein „volles“ Python |

**Empfehlung:** Training im Browser mit **Pyodide**, Ranglistenkämpfe auf dem Server in einer **WASM-Sandbox** mit derselben Engine.
Jeder Bot bekommt pro Tick ein **Aktionsbudget** (z. B. max. 1 Aktion + 1000 Rechenschritte) → Endlosschleifen sind kein Problem,
und „effizienter Code“ wird belohnt.

Alternative, die das Determinismus-Problem elegant löst: Der Bot-Code läuft als **Generator** – jede Aktion (`move`, `shoot`) ist ein
`yield`, die Engine holt pro Tick genau eine Aktion ab.

### 8.3 Stack-Vorschlag
- **Frontend**: TypeScript + React (oder Svelte), Arena-Rendering mit **PixiJS** (2D) oder Phaser.
- **Mobile**: zuerst **PWA** (installierbar, ein Codebase), später **Capacitor** für App-Stores.
- **Backend**: Python (FastAPI) – passt thematisch, Engine-Code kann geteilt werden.
- **Datenbank**: PostgreSQL (Accounts, Bots, Matches, Fortschritt), Redis (Matchmaking-Queue, Ranglisten).
- **Match-Worker**: Queue (z. B. Celery/RQ oder einfache Postgres-Queue) → Worker simulieren Kämpfe in der Sandbox.
- **Auth**: eigene Auth + OIDC für Schul-SSO, LTI 1.3 für Moodle.
- **Hosting**: EU-Cloud (z. B. Hetzner), Container (Docker), später Kubernetes nur wenn nötig.

### 8.4 Grobe Datenmodelle
- `User` (Rolle, Pseudonym, Eltern-/Klassenbezug)
- `Robot` (Name, Chassis, Loadout, aktive Code-Version)
- `CodeVersion` (Quelltext, Zeitstempel – Versionsgeschichte zum Zurückspringen!)
- `Unlock` (User × Modul/Konzept)
- `Mission`, `MissionResult` (Sterne, Zeilen, Ticks)
- `Match` (Teilnehmer-Code-Versionen, Seed, Ergebnis, Elo-Änderung)
- `Class`, `Tournament`, `Season`

---

## 9. Ideen-Pool für später (Wow-Faktor)

- **Bot-Evolution**: Bots sammeln Kampfstatistiken; das Kind kann mit Dictionaries eigene „Lernlogik“ bauen (Einstieg in KI-Denken).
- **Gegner-Analyse-Bericht** nach jedem Kampf: „Dein Bot hat 70 % seiner Zeit an der Wand verbracht.“
- **Ghost-Modus**: Gegen die eigene alte Code-Version kämpfen – zeigt Fortschritt schwarz auf weiß.
- **Code-Bibliothek**: Eigene Funktionen als „Module“ speichern und in anderen Bots importieren (`from meine_tricks import zickzack`).
- **Community-Missionen** (moderiert) mit Bewertungen.
- **Echte Hardware-Brücke**: Derselbe Code steuert einen echten Lernroboter (z. B. Calliope mini, micro:bit, LEGO Spike) – für Projektwochen.
- **KI-Tutor**: Ein Hilfe-Button erklärt den eigenen Fehler, *ohne* die Lösung zu verraten (sokratisch, Lehrkraft kann ihn deaktivieren).
- **Zuschauer-Modus / Liga-Finale**: Live-Kommentar, Statistiken, „Spiel der Woche“.
- **Sprache**: Deutsch/Englisch umschaltbar, API-Befehle immer Englisch (wie echtes Programmieren), Erklärungen auf Deutsch.
- **Weitere Sprachen später**: JavaScript, Lua – gleiche Arena.

---

## 10. Monetarisierung / Betrieb (falls gewünscht)

- **Kostenlos für Kinder privat** mit Basis-Kampagne.
- **Schul-Lizenz** pro Schule/Jahr: Lehrer-Dashboard, Turniere, eigene Missionen, SSO.
- **Optionale Eltern-„Supporter“-Stufe**: nur Kosmetik, keine Spielvorteile.
- Alternativ: **Open Source** + Förderprogramme (z. B. Bildungsstiftungen, Prototype Fund, Digitalpakt-Kontext).

---

## 11. Roadmap-Vorschlag

### Phase 0 – Prototyp (2–4 Wochen) – „Macht es Spaß?“
- Browser-only, kein Login.
- Grid-Arena, 1 Roboter, 5 Befehle, Pyodide, 10 PvE-Missionen.
- Testen mit den eigenen Kids. **Wichtigste Frage: Wollen sie freiwillig weitermachen?**

### Phase 1 – MVP (2–3 Monate)
- Accounts (Benutzername/Passwort, Eltern-Rolle).
- Kampagne Stufe 1–7, Freischalt-System, Sterne.
- Asynchrones 1v1-PvP mit Elo, Replays.
- PWA für Tablet.

### Phase 2 – Schule (3 Monate)
- Lehrer-Dashboard, Klassencodes, Klassen-Turniere, Beamer-Modus.
- Datenschutzkonzept, EU-Hosting, AV-Vertrag.
- Pilot mit 1–2 Klassen.

### Phase 3 – Ausbau
- Team-PvP, Drohnen/Klassen, Saisons, Schul-Ligen, Level-Editor, SSO/LTI, App-Stores.

---

## 12. Offene Entscheidungen

1. **Arena-Typ**: Raster (einfacher, Schachgefühl) oder frei/kontinuierlich (actionreicher, mehr Mathe)?
   → Vorschlag: mit Raster starten, später „Freie Arena“ als Profi-Modus freischalten.
2. **Grafikstil**: Pixel-Art, cleanes Vektor-/Neon-Design oder 3D-light?
3. **Altersspanne**: Ab 8 (dann Blocks nötig) oder ab 10/11 (direkt Python)?
4. **Offen oder geschlossen**: Weltweites PvP oder zunächst nur Freundes-/Klassen-Ligen?
5. **Name**: RoboFight, CodeBots, Botcademy, PyArena, ByteBrawl …
