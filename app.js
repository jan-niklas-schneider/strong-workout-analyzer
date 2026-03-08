let workoutsData = [];
let weightData = [];
let selectedExercise = null;

document.getElementById("analyzeBtn").addEventListener("click", analyzeFiles);

async function analyzeFiles() {
  const workoutsFile = document.getElementById("workoutsFile").files[0];
  const weightFile = document.getElementById("weightFile").files[0];
  const status = document.getElementById("status");

  if (!workoutsFile) {
    alert("Please upload your workouts CSV.");
    return;
  }

  status.textContent = "Parsing files...";

  workoutsData = await parseCSV(workoutsFile);
  weightData = weightFile ? await parseCSV(weightFile) : [];

  status.textContent = "Building charts...";

  renderOverview();
  renderExerciseTable();

  status.textContent = `Loaded ${workoutsData.length} workout rows${weightData.length ? ` and ${weightData.length} bodyweight rows` : ""}.`;
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: results => resolve(results.data || []),
      error: err => reject(err)
    });
  });
}

function getValue(row, keys, fallback = null) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return fallback;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function weekStartMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function epley(weight, reps) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) return null;
  return weight * (1 + reps / 30);
}

function movingAverage(values, windowSize) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, i + Math.ceil(windowSize / 2));
    const slice = values.slice(start, end).filter(v => Number.isFinite(v));
    out.push(slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null);
  }
  return out;
}

function rollingStd(values, windowSize, minPeriods = 3) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1).filter(v => Number.isFinite(v));
    if (slice.length < minPeriods) {
      out.push(null);
      continue;
    }
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + ((b - mean) ** 2), 0) / Math.max(1, slice.length - 1);
    out.push(Math.sqrt(variance));
  }

  // backfill then apply floor
  let firstFinite = out.find(v => Number.isFinite(v));
  if (!Number.isFinite(firstFinite)) firstFinite = 0.15;
  return out.map(v => Math.max(0.15, Number.isFinite(v) ? v : firstFinite));
}

function linearRegression(yValues) {
  const points = yValues
    .map((y, i) => ({ x: i, y }))
    .filter(p => Number.isFinite(p.y));

  if (points.length < 2) {
    return {
      slope: 0,
      intercept: points.length ? points[points.length - 1].y : 0
    };
  }

  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;

  if (denom === 0) {
    return { slope: 0, intercept: sumY / n };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function renderOverview() {
  const weeklyMap = new Map();

  workoutsData.forEach(row => {
    const date = parseDate(getValue(row, ["Datum", "Date"]));
    if (!date) return;

    const weekKey = formatDate(weekStartMonday(date));
    const dayKey = formatDate(date);
    const workoutName = String(getValue(row, ["Workout-Name", "Workout Name"], dayKey));
    const sessionKey = `${dayKey}||${workoutName}`;

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, { sessions: new Set(), volume: 0 });
    }

    const rec = weeklyMap.get(weekKey);
    rec.sessions.add(sessionKey);

    const weight = Number(getValue(row, ["Gewicht", "Weight"], 0)) || 0;
    const reps = Number(getValue(row, ["Wiederh.", "Reps"], 0)) || 0;
    rec.volume += weight * reps;
  });

  const weeks = Array.from(weeklyMap.keys()).sort();
  const workoutCounts = weeks.map(w => weeklyMap.get(w).sessions.size);
  const volumes = weeks.map(w => weeklyMap.get(w).volume);

  Plotly.newPlot("workoutsPerWeek", [{
    x: weeks,
    y: workoutCounts,
    type: "bar",
    hovertemplate: "%{x}<br>Workouts: %{y}<extra></extra>"
  }], {
    title: "Workouts per Week",
    margin: { l: 40, r: 20, t: 50, b: 40 },
    yaxis: { title: "Workouts" },
    xaxis: { title: "Week" }
  }, { responsive: true });

  Plotly.newPlot("volumePerWeek", [{
    x: weeks,
    y: volumes,
    type: "bar",
    hovertemplate: "%{x}<br>Volume: %{y:.0f}<extra></extra>"
  }], {
    title: "Training Volume per Week",
    margin: { l: 50, r: 20, t: 50, b: 40 },
    yaxis: { title: "kg × reps" },
    xaxis: { title: "Week" }
  }, { responsive: true });

  renderWeightChart();
}

function renderWeightChart() {
  const container = document.getElementById("weightChart");

  const rows = weightData
    .map(row => {
      const date = parseDate(getValue(row, ["Datum", "Date"]));
      const value = Number(getValue(row, ["Value", "value"], NaN));
      return { date, value };
    })
    .filter(r => r.date && Number.isFinite(r.value))
    .sort((a, b) => a.date - b.date);

  if (!rows.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");

  // last weight per day
  const byDay = new Map();
  rows.forEach(r => byDay.set(formatDate(r.date), r.value));

  const dates = Array.from(byDay.keys()).sort();
  const values = dates.map(d => byDay.get(d));
  const trend = movingAverage(values, 7);
  const residuals = values.map((v, i) => Number.isFinite(trend[i]) ? v - trend[i] : null);
  const stds = rollingStd(residuals, 14, 3);

  const lower = trend.map((t, i) => Number.isFinite(t) ? t - stds[i] : null);
  const upper = trend.map((t, i) => Number.isFinite(t) ? t + stds[i] : null);

  const horizonDays = 14;
  const recentTrend = trend.slice(Math.max(0, trend.length - 21));
  const reg = linearRegression(recentTrend);
  const lastDate = parseDate(dates[dates.length - 1]);
  const lastStd = stds[stds.length - 1];

  const forecastDates = [];
  const forecastTrend = [];
  const forecastStd = [];

  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i);
    forecastDates.push(formatDate(d));

    const x = recentTrend.length - 1 + i;
    const t = reg.intercept + reg.slope * x;
    forecastTrend.push(t);

    const s = lastStd * Math.sqrt(1 + i / 2);
    forecastStd.push(s);
  }

  const forecastLower = forecastTrend.map((t, i) => t - forecastStd[i]);
  const forecastUpper = forecastTrend.map((t, i) => t + forecastStd[i]);

  const traces = [
    {
      x: [...dates, ...[...dates].reverse()],
      y: [...upper, ...[...lower].reverse()],
      fill: "toself",
      fillcolor: "rgba(31,119,180,0.14)",
      line: { color: "rgba(0,0,0,0)" },
      hoverinfo: "skip",
      name: "Historical uncertainty"
    },
    {
      x: dates,
      y: values,
      mode: "markers+lines",
      name: "Measured",
      hovertemplate: "%{x}<br>Measured: %{y:.2f} kg<extra></extra>"
    },
    {
      x: dates,
      y: trend,
      mode: "lines",
      line: { width: 3 },
      name: "Trend (7 days)",
      customdata: stds,
      hovertemplate: "%{x}<br>Trend: %{y:.2f} kg ± %{customdata:.2f}<extra></extra>"
    },
    {
      x: [...forecastDates, ...[...forecastDates].reverse()],
      y: [...forecastUpper, ...[...forecastLower].reverse()],
      fill: "toself",
      fillcolor: "rgba(214,39,40,0.16)",
      line: { color: "rgba(0,0,0,0)" },
      hoverinfo: "skip",
      name: "Forecast uncertainty"
    },
    {
      x: forecastDates,
      y: forecastTrend,
      mode: "lines",
      line: { width: 3, dash: "dash" },
      name: "Forecast (14 days)",
      customdata: forecastStd,
      hovertemplate: "%{x}<br>Forecast: %{y:.2f} kg ± %{customdata:.2f}<extra></extra>"
    }
  ];

  Plotly.newPlot(container, traces, {
    title: "Bodyweight – Trend, Uncertainty & Forecast",
    margin: { l: 50, r: 20, t: 50, b: 40 },
    hovermode: "x unified",
    xaxis: {
      title: "Date",
      range: [dates[0], forecastDates[forecastDates.length - 1]]
    },
    yaxis: { title: "kg" },
    legend: { orientation: "h" },
    shapes: [{
      type: "line",
      x0: dates[dates.length - 1],
      x1: dates[dates.length - 1],
      y0: 0,
      y1: 1,
      xref: "x",
      yref: "paper",
      line: { dash: "dash", width: 1, color: "rgba(80,80,80,0.7)" }
    }],
    annotations: [{
      x: dates[dates.length - 1],
      y: 1,
      xref: "x",
      yref: "paper",
      text: "Latest measurement",
      showarrow: false,
      xanchor: "right",
      yanchor: "bottom",
      bgcolor: "rgba(255,255,255,0.8)"
    }]
  }, { responsive: true });
}

function buildExerciseSummary() {
  const perExercise = new Map();

  workoutsData.forEach(row => {
    const exercise = String(getValue(row, ["Name der Übung", "Exercise Name"], "")).trim();
    const date = parseDate(getValue(row, ["Datum", "Date"]));
    if (!exercise || !date) return;

    const weight = Number(getValue(row, ["Gewicht", "Weight"], 0)) || 0;
    const reps = Number(getValue(row, ["Wiederh.", "Reps"], 0)) || 0;
    const tonnage = weight * reps;
    const e1rm = epley(weight, reps);

    if (!perExercise.has(exercise)) {
      perExercise.set(exercise, {
        count: 0,
        lastDate: null,
        lastMax: null,
        dayMap: new Map()
      });
    }

    const item = perExercise.get(exercise);
    item.count += 1;

    if (!item.lastDate || date > item.lastDate) {
      item.lastDate = date;
    }

    const dayKey = formatDate(date);
    if (!item.dayMap.has(dayKey)) {
      item.dayMap.set(dayKey, {
        date: dayKey,
        maxWeight: null,
        bestSet: null,
        bestE1rm: null,
        totalVolume: 0
      });
    }

    const dayRec = item.dayMap.get(dayKey);
    dayRec.maxWeight = Math.max(dayRec.maxWeight ?? -Infinity, weight);
    dayRec.bestSet = Math.max(dayRec.bestSet ?? -Infinity, tonnage);
    dayRec.bestE1rm = Math.max(dayRec.bestE1rm ?? -Infinity, e1rm ?? -Infinity);
    dayRec.totalVolume += tonnage;
  });

  const summary = Array.from(perExercise.entries()).map(([name, item]) => {
    const rows = Array.from(item.dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const latest = rows.length ? rows[rows.length - 1] : null;
    return {
      name,
      count: item.count,
      lastDate: item.lastDate ? formatDate(item.lastDate) : "",
      lastMax: latest && Number.isFinite(latest.maxWeight) ? latest.maxWeight : null,
      rows
    };
  });

  summary.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return summary;
}

function renderExerciseTable() {
  const container = document.getElementById("exerciseTable");
  const summary = buildExerciseSummary();

  if (!summary.length) {
    container.innerHTML = '<p class="muted">No exercises found.</p>';
    document.getElementById("exerciseCharts").innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="exercise-table">
        <thead>
          <tr>
            <th>Exercise</th>
            <th>Sets</th>
            <th>Last entry</th>
            <th>Latest max</th>
          </tr>
        </thead>
        <tbody>
          ${summary.map((ex, idx) => `
            <tr data-exercise="${escapeHtml(ex.name)}" class="${idx === 0 ? 'active' : ''}">
              <td>${escapeHtml(ex.name)}</td>
              <td>${ex.count}</td>
              <td>${escapeHtml(ex.lastDate)}</td>
              <td>${ex.lastMax !== null ? `${ex.lastMax.toFixed(1)} kg` : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  const rows = container.querySelectorAll("tbody tr");
  rows.forEach(row => {
    row.addEventListener("click", () => {
      rows.forEach(r => r.classList.remove("active"));
      row.classList.add("active");
      const exercise = row.getAttribute("data-exercise");
      renderExerciseCharts(exercise);
    });
  });

  selectedExercise = summary[0].name;
  renderExerciseCharts(selectedExercise);
}

function renderExerciseCharts(exercise) {
  const summary = buildExerciseSummary();
  const item = summary.find(x => x.name === exercise);
  const container = document.getElementById("exerciseCharts");

  if (!item) {
    container.innerHTML = "";
    return;
  }

  const x = item.rows.map(r => r.date);
  const maxWeight = item.rows.map(r => safeMetric(r.maxWeight));
  const bestSet = item.rows.map(r => safeMetric(r.bestSet));
  const bestE1rm = item.rows.map(r => safeMetric(r.bestE1rm));
  const totalVolume = item.rows.map(r => safeMetric(r.totalVolume));

  container.innerHTML = `
    <div id="chart-max" class="card chart"></div>
    <div id="chart-best-set" class="card chart"></div>
    <div id="chart-e1rm" class="card chart"></div>
    <div id="chart-volume" class="card chart"></div>
  `;

  plotMetric("chart-max", `${exercise} – Max Weight per Day`, x, maxWeight, "kg");
  plotMetric("chart-best-set", `${exercise} – Best Set (weight × reps)`, x, bestSet, "kg × reps");
  plotMetric("chart-e1rm", `${exercise} – Estimated 1RM (Epley)`, x, bestE1rm, "kg");
  plotMetric("chart-volume", `${exercise} – Total Daily Volume`, x, totalVolume, "kg × reps");
}

function safeMetric(value) {
  return Number.isFinite(value) ? value : null;
}

function plotMetric(elementId, title, x, y, yLabel) {
  Plotly.newPlot(elementId, [{
    x,
    y,
    mode: "lines+markers",
    hovertemplate: "%{x}<br>%{y:.2f}<extra></extra>"
  }], {
    title,
    margin: { l: 50, r: 20, t: 50, b: 40 },
    xaxis: { title: "Date" },
    yaxis: { title: yLabel }
  }, { responsive: true });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
