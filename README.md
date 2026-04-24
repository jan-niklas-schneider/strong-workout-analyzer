# Strong Workout Analyzer

A lightweight web tool for analyzing CSV exports from the **Strong App**.  
The application runs entirely in the browser and creates interactive visualizations for workout data and optional bodyweight tracking.

## Live Demo

The app is available on GitHub Pages:

https://jan-niklas-schneider.github.io/strong-workout-analyzer/

## QR Code

Scan the QR code to open the app on your phone.

![QR Code](https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://jan-niklas-schneider.github.io/strong-workout-analyzer/)

## Features

- Import **Strong workout CSV** exports
- Optional import of **bodyweight CSV** data
- Interactive charts powered by **Plotly**
- Weekly overview of workout frequency and training volume
- Exercise-specific insights for:
  - max weight
  - best set
  - estimated 1RM
  - total daily volume
- Fully client-side analysis with no backend required
- Responsive layout for desktop and mobile

## Privacy

All data is processed locally in the browser.  
Your workout data is not uploaded to a server.

## Supported Data

The app currently supports two CSV inputs:

1. `Workouts CSV` exported from the Strong App
2. Optional `Bodyweight CSV` for weight tracking

The parser supports both German and English column names used in the exports.

## Usage

1. Export your workout history from the Strong App as CSV.
2. Open the web app in your browser.
3. Upload the `Workouts CSV`.
4. Optionally upload the `Bodyweight CSV`.
5. Click `Analyze` to generate the charts.

## What You Get

### Overview

- **Workouts per Week** shows the number of workout sessions per week
- **Training Volume per Week** shows the total training volume per week
- **Bodyweight** shows measurements, a trend line, and a short forecast when weight data is available

### Exercises

For each exercise, the app provides a summary table and detail charts for:

- max weight per day
- best set (`weight x reps`)
- estimated 1RM based on the **Epley formula**
- total daily volume

## Tech Stack

- `HTML`
- `CSS`
- `JavaScript`
- `Plotly.js` for charting
- `PapaParse` for CSV parsing

## Project Structure

```text
.
|-- index.html
|-- styles.css
|-- app.js
|-- assets/
|   `-- favicon/
`-- .nojekyll
```

## Local Development

For a quick local test, you can open `index.html` directly in your browser.

Alternatively, start a local server:

```bash
python -m http.server
```

Then open:

http://localhost:8000

## Deployment

The project is deployed via **GitHub Pages**.

The live version is available at:

https://jan-niklas-schneider.github.io/strong-workout-analyzer/

## License

MIT License
