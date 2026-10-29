# Arbeitstitel: QWOP² – Kreatur mit Wachstum

## Problem Statement

Wie bringen wir das Gefühl von QWOP (indirekte Steuerung, Physik als Gegner, Scheitern ist lustig) in ein neues Theme, das nach 30 Minuten noch Entscheidungen und Meisterschaft bietet?

## Richtung (entschieden)

Skill-first Kreaturenspiel im Browser. Eine Kreatur mit 2 Körperhälften, bis zu 8 Beinen (ein Finger je Bein) und einem Körpergelenk (beide Daumen, Leertaste). Tiefe kommt aus **Wachstum über Frust** und aus der Strecke, nicht aus Feature-Menge.

## Kernmechanik: Wachstum statt Verlust

- Start mit 2 Beinen (D hinten, K vorn). Wenig Finger, wenig Chaos.
- Nach 10 Läufen ohne neuen Rekord: Angebot mit bis zu 3 Mutationen (Taste 1 bis 3), ablehnbar mit R.
- Mutationen: neues Bein (gezielt mit Taste/Finger), Wirbelsäule (Daumen, erst ab 4 Beinen), Krallenfüße (2 Stufen), starke Muskeln (2 Stufen).
- Wachstum bleibt gespeichert (localStorage), Entf setzt zurück.
- Verworfen: Beine verlieren als Schwierigkeitsrampe. Hat im Test nie ausgelöst, und die Umkehrung ist besser: Komplexität wächst mit der Bereitschaft des Spielers.

## Stand des Prototyps (prototype/)

- Technik: HTML/JS, Planck.js (Box2D, per CDN). Dateien: index.html, sim.js (Physik/Regeln/Mutationen, alle Werte in TUNE), game.js (Rendering/Eingabe/Meta).
- Strecke: 200 m mit flach, Hügeln, Eisfläche und Grube. Ghost des Bestlaufs, Bestweite gespeichert.
- Playtest-Ergebnisse: zwei Beine spielbar, Spaß vorhanden (41 m nach wenigen Läufen), Daumen-Reihenfolge ok. Angebotsschwelle von 5 auf 10 erhöht. Abbruchregeln (Festgefahren/Umgekippt) gelockert.

## Key Assumptions

1. ✅ Physik macht von Anfang an Spaß (bestätigt).
2. ✅ Zwei Beine sind spielbar (bestätigt).
3. ❓ Mehr Beine/Mutationen fühlen sich wie Hilfe an, nicht nur wie mehr Chaos.
4. ❓ Terrain-Vielfalt trägt die Tiefe bis zum Ziel (200 m).
5. ❓ Alle 10 Finger lassen sich in der Endstufe noch sinnvoll nutzen.

## Not Doing (bewusst)

- Kein Multiplayer/Netzwerk (lokaler Co-op frühestens später)
- Kein Beinverlust-System, keine Upgrade-Wirtschaft, keine Story
- Kein Mobile/Touch, kein Leaderboard-Backend
- Kein Asset-Polishing, bevor die Balance steht

## Open Questions

- Welche Kreatur konkret (Salamander, Krake, Käfer) und welcher Look?
- Brauchen die späten Stufen eigene Terrain-Aufgaben (Klettern, Tragen), oder reicht Distanz?
- Sound und Musik: Stil?
- Balance der Mutationen (Beine stark, Krallen schwach?)
