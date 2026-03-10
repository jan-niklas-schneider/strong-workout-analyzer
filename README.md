# Strong Workout Analyzer (Docker)

Dieses Projekt analysiert deinen **Strong App CSV Export** automatisch
und erzeugt:

-   📊 Trainings-Overview (Workouts & Volumen pro Woche)
-   📈 Interaktive Progress-Plots pro Übung (mit Mouse-Over: Datum +
    Wert)
    -   Max. Gewicht pro Trainingstag
    -   Bestes Set (Gewicht × Wiederholungen)
    -   Geschätztes 1RM (Epley)
    -   Tagesvolumen
-   ⚖️ Körpergewicht-Trend (optional)
-   📄 HTML Report mit interaktiven Charts
-   📁 Aggregierte CSV mit Tagesmetriken

Alles läuft vollständig in Docker – keine lokale Python-Installation
nötig.

------------------------------------------------------------------------

## 📂 Projektstruktur

    strong-analyzer/
    │
    ├── Dockerfile
    ├── requirements.txt
    ├── app.py
    ├── README.md
    ├── .gitignore
    │
    ├── data/
    │   ├── strong_workouts.csv
    │   └── strong_weight.csv   (optional)
    │
    └── out/    (wird automatisch erzeugt)

------------------------------------------------------------------------

## 🏗️ Build

``` bash
docker build -t strong-analyzer .
```

------------------------------------------------------------------------

## ▶️ Run (macOS / Linux)

``` bash
docker run --rm -v "$(pwd)/data:/data:ro" -v "$(pwd)/out:/out" strong-analyzer
```

### Windows (PowerShell)

``` powershell
docker run --rm -v ${PWD}/data:/data:ro -v ${PWD}/out:/out strong-analyzer
```

------------------------------------------------------------------------

## 📊 Output

Nach dem Lauf findest du in `out/`:

-   `report.html` (interaktive Übersicht)
-   `exercise_day_metrics.csv`
-   `pages/` (pro Übung eine eigene HTML-Seite mit 4 interaktiven
    Charts)

Öffne einfach:

    out/report.html

im Browser.

------------------------------------------------------------------------

## 📈 Berechnete Metriken

### Max Gewicht

Höchstes Gewicht pro Übung pro Tag.

### Bestes Set (Tonnage)

    Gewicht × Wiederholungen

### Geschätztes 1RM (Epley)

    1RM = Gewicht × (1 + Wiederholungen / 30)

### Tagesvolumen

Summe aller Sets einer Übung pro Tag:

    Σ (Gewicht × Wiederholungen)

### Wochenvolumen

Summe aller Sets aller Übungen pro Woche.

------------------------------------------------------------------------

## ⚙️ Optional: Nur Top N Übungen rendern

``` bash
docker run --rm -v "$(pwd)/data:/data:ro" -v "$(pwd)/out:/out" strong-analyzer --top 10
```

------------------------------------------------------------------------

## 🔒 Datenschutz

Alle Daten werden ausschließlich lokal verarbeitet.  
Kein Upload, kein Tracking.

------------------------------------------------------------------------

Viel Spaß beim Analysieren 💪
