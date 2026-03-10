# Workout Analyzer

A small web tool to analyze workout data exported from the **Strong App** (CSV export).

The application runs entirely in the browser and visualizes workout statistics using interactive charts.

## Live Demo

The application is deployed with **GitHub Pages**.

Open it here:

https://USERNAME.github.io/strong-workout-analyzer/

## QR Code

Scan this QR code to open the app on your phone.

![QR Code](https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://USERNAME.github.io/strong-workout-analyzer/)

## Features

- Upload **Strong App CSV exports**
- Automatic CSV parsing
- Interactive charts using **Plotly**
- Client-side processing (no server required)
- Works directly in the browser

## How It Works

The app loads a CSV file exported from the **Strong workout tracking app** and processes it directly in the browser.

Libraries used:

- **Plotly.js** for chart visualization
- **PapaParse** for CSV parsing

All processing happens locally in the browser.

## Usage

1. Export your workout history from the **Strong App** as CSV.
2. Open the web app.
3. Upload the CSV file.
4. The app generates charts and statistics automatically.

## Project Structure


.
├── index.html # main page
├── styles.css # styling
├── app.js # application logic
└── .nojekyll # required for GitHub Pages


## Development

To run locally, simply open:


index.html


or start a small local server:


python -m http.server


Then open:


http://localhost:8000


## Deployment

Deployment is done automatically via **GitHub Pages** from the `main` branch.

The live site is available at:


https://USERNAME.github.io/strong-workout-analyzer/


## License

MIT License