# Arbeitstitel: QWOP² – "Kreatur"-Variante

## Problem Statement
Wie bringen wir das Gefühl von QWOP (indirekte Steuerung, Physik als Gegner, Scheitern ist lustig) in ein neues Theme, das nach 30 Minuten noch Entscheidungen und Meisterschaft bietet?

## Empfohlene Richtung
**Skill-first Kreatur-Spiel im Browser.** Eine Kreatur mit mehreren Gliedmaßen, gesteuert über Tasten-Paare, die jeweils Gelenke kontrollieren. Ziel ist Distanz über wechselnde Terrains. Tiefe entsteht aus Terrain-Vielfalt und Meisterschaft, nicht aus Feature-Menge.

Verworfene Richtungen:
- **Mutant-Run (Roguelite):** Upgrades nach jedem Sturz. Verwässert den Skill-Kern und braucht viel Balancing. Später als Erweiterung denkbar.
- **Zwei Köpfe (Co-op):** Ein Körper, zwei Spieler. Witzig, aber Netzwerk/Input-Sync sprengt ein Wochenende. Lokal wäre günstig, aber erst nach dem Kern.

## Key Assumptions (zu validieren)
1. Die Physik macht in den ersten 10 Sekunden Spaß, auch wenn man scheitert. Das Kill-Kriterium des Projekts.
2. Eine Kreatur mit 4+ Gliedmaßen ist mit Tastatur noch lernbar (nicht nur frustrierend).
3. Terrain-Wechsel (Hügel, Lücken, Eis) reichen als Tiefe, bevor Upgrades nötig sind.
4. Ghost-Replay der besten Runde ersetzt vorerst echten Wettbewerb.

## MVP Scope (ca. 1 Wochenende)
- Stack: TypeScript + Vite, Canvas 2D, Planck.js (Box2D) für stabile Ragdoll-Physik
- 1 Kreatur (Placeholder-Optik, Strich-Stil), Steuerung über 4 bis 6 Tasten
- 3 kurze Terrain-Abschnitte: flach, Hügel, Lücke/Eis
- Distanzanzeige, Sturzerkennung, Sofort-Neustart (R)
- Bestweite in localStorage, Ghost der besten Runde
- Greybox zuerst. Erst wenn das Stolpern Spaß macht, kommen Optik und Sound.

## Not Doing (bewusst)
- Kein Multiplayer/Netzwerk (höchstens lokaler Co-op später)
- Kein Roguelite-/Upgrade-System
- Keine Story, kein Menü-Overhead, kein Account/Leaderboard-Backend
- Kein Mobile/Touch
- Kein Asset-Polishing vor dem Spaß-Check

## Open Questions
- Wie viele Gliedmaßen und welches Tastenschema genau (z. B. 4 Beine = 4 Tasten + Shift)?
- Welche Kreatur konkret (Salamander, Krake, Käfer)? Das bestimmt Silhouette und Humor.
- Soll Scheitern ein Ende sein (Ziel) oder ein Mechanismus (z. B. Beine verlieren)?
- Ghost: nur eigener Bestlauf oder auch teilbar?
