let workoutsData = [];
let weightData = [];
let selectedExercise = null;
let tableSort = { key: "count", direction: "desc" };
let overviewRange = { dates: [], startIndex: 0, endIndex: 0, preset: "all" };

const COLORS = {
  primary: "rgb(31,119,180)",
  primarySoft: "rgba(31, 119, 180, 0.2)",

  secondary: "rgb(255,127,14)",

  forecast: "rgb(255,127,14)",
  forecastSoft: "rgba(255,127,14, 0.2)",

  workoutLow: "rgba(31, 119, 180, 0.2)",
  workoutMid: "rgba(31, 119, 180, 0.50)",
  workoutHigh: "rgb(31, 119, 180)"
};

const MUSCLE_GROUP_PATTERNS = [
  { name: "Chest", patterns: ["bench", "drück", "chest", "fly", "press", "bank"] },
  { name: "Back", patterns: ["row", "zug", "pull", "lat", "deadlift", "kreuz", "back"] },
  { name: "Legs", patterns: ["squat", "beinpresse", "beinstreck", "leg", "lunge", "deadlift", "press"] },
  { name: "Shoulders", patterns: ["shoulder", "press", "military", "deltoid", "seitheben", "frontheben", "arnold"] },
  { name: "Arms", patterns: ["curl", "bizeps", "trizeps", "dip", "hammer", "skullcrusher", "triceps", "biceps"] },
  { name: "Core", patterns: ["plank", "situp", "abs", "crunch", "core", "twist", "leg raise"] }
];

function detectMuscleGroup(exercise) {
  const name = String(exercise).toLowerCase();
  for (const group of MUSCLE_GROUP_PATTERNS) {
    if (group.patterns.some(pattern => name.includes(pattern))) {
      return group.name;
    }
  }
  return "Other";
}

function createChartMarkup(plotId, title) {
  return `
    <div class="chart-header">
      <h3>${escapeHtml(title)}</h3>
      <div class="chart-actions">
        <button type="button" data-action="share" data-plotid="${plotId}">Share</button>
      </div>
    </div>
    <div id="${plotId}" class="chart-plot"></div>
  `;
}

function attachChartActions(container) {
  const buttons = container.querySelectorAll("button[data-action]");
  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const plotId = button.dataset.plotid;
      const title = button.closest(".chart-header")?.querySelector("h3")?.textContent || plotId;
      if (action === "share") {
        await handleChartShare(plotId, title);
      }
    });
  });
}

async function handleChartShare(plotId, title) {
  try {
    const blob = await getPlotImageBlob(plotId, "png");
    const file = new File([blob], `${title.replace(/\s+/g, "_").replace(/[^_0-9a-zA-Z-]/g, "")}.png`, {
      type: "image/png"
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title,
        text: `Share this chart: ${title}`
      });
      return;
    }

    downloadBlob(blob, `${title.replace(/\s+/g, "_").replace(/[^_0-9a-zA-Z-]/g, "")}.png`);
  } catch (error) {
    console.error("Share failed", error);
    alert("Sharing is not available. The image will be downloaded instead.");
  }
}

async function getPlotImageBlob(plotId, format = "png") {
  const dataUrl = await Plotly.toImage(plotId, {
    format,
    width: 1200,
    height: 680,
    scale: 2
  });
  return dataURLToBlob(dataUrl);
}

function dataURLToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const contentType = header.split(":")[1].split(";")[0];
  const raw = atob(base64);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buffer[i] = raw.charCodeAt(i);
  }
  return new Blob([buffer], { type: contentType });
}

function getWorkoutInterval() {
  const dates = workoutsData
    .map(row => parseDate(getValue(row, ["Datum", "Date"])))
    .filter(date => date)
    .sort((a, b) => a - b);

  if (!dates.length) {
    return "no date range";
  }

  const start = formatDate(dates[0]);
  const end = formatDate(dates[dates.length - 1]);
  return start === end ? start : `${start} – ${end}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function initFilePickers() {
  const workoutsFileInput = document.getElementById("workoutsFile");
  const weightFileInput = document.getElementById("weightFile");
  const workoutsFileBtn = document.getElementById("workoutsFileBtn");
  const weightFileBtn = document.getElementById("weightFileBtn");
  const workoutsFileName = document.getElementById("workoutsFileName");
  const weightFileName = document.getElementById("weightFileName");

  workoutsFileBtn.addEventListener("click", () => workoutsFileInput.click());
  weightFileBtn.addEventListener("click", () => weightFileInput.click());

  workoutsFileInput.addEventListener("change", () => {
    workoutsFileName.textContent = workoutsFileInput.files.length
      ? workoutsFileInput.files[0].name
      : "No file selected";
  });

  weightFileInput.addEventListener("change", () => {
    weightFileName.textContent = weightFileInput.files.length
      ? weightFileInput.files[0].name
      : "No file selected";
  });
}

document.getElementById("analyzeBtn").addEventListener("click", analyzeFiles);
initFilePickers();

function countWorkouts(rows) {
  const sessions = new Set();

  rows.forEach(row => {
    const date = parseDate(getValue(row, ["Datum", "Date"]));
    if (!date) return;

    const dayKey = formatDate(date);
    const workoutName = String(getValue(row, ["Workout-Name", "Workout Name"], dayKey));
    const sessionKey = `${dayKey}||${workoutName}`;

    sessions.add(sessionKey);
  });

  return sessions.size;
}

async function analyzeFiles() {
  const workoutsFile = document.getElementById("workoutsFile").files[0];
  const weightFile = document.getElementById("weightFile").files[0];
  const status = document.getElementById("status");

  if (!workoutsFile) {
    alert("Please upload your workouts CSV.");
    return;
  }

  status.textContent = "Parsing files...";

  workoutsData = normalizeWorkoutsData(await parseCSV(workoutsFile));
  weightData = weightFile ? await parseCSV(weightFile) : [];
  initializeOverviewRange();

  status.textContent = "Building charts...";

  renderOverview();
  renderExerciseTable();

  const workoutCount = countWorkouts(workoutsData);

  status.textContent = `Loaded ${workoutsData.length} workout rows (${workoutCount} workouts)${
    weightData.length ? ` and ${weightData.length} bodyweight rows` : ""
  }.`;
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

function normalizeWorkoutsData(rows) {
  return rows.map(row => {
    const normalizedRow = { ...row };
    const exercise = String(getValue(normalizedRow, ["Name der Übung", "Name der Ãœbung", "Exercise Name"], "")).trim();
    const weightKey = normalizedRow["Gewicht"] !== undefined ? "Gewicht" : normalizedRow["Weight"] !== undefined ? "Weight" : null;

    if (!weightKey || !isAssistedExercise(exercise)) {
      return normalizedRow;
    }

    const weight = Number(normalizedRow[weightKey]);
    if (Number.isFinite(weight)) {
      normalizedRow[weightKey] = -Math.abs(weight);
    }

    return normalizedRow;
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

function getUniqueWorkoutDates() {
  return Array.from(new Set(
    workoutsData
      .map(row => formatDate(parseDate(getValue(row, ["Datum", "Date"]))))
      .filter(Boolean)
  )).sort();
}

function initializeOverviewRange() {
  overviewRange.dates = getUniqueWorkoutDates();
  overviewRange.startIndex = 0;
  overviewRange.endIndex = Math.max(0, overviewRange.dates.length - 1);
  overviewRange.preset = "all";
  syncOverviewRangeControls();
}

function syncOverviewRangeControls() {
  const panel = document.getElementById("overviewFilterPanel");
  const presetSelect = document.getElementById("overviewPresetSelect");
  const startInput = document.getElementById("overviewStartRange");
  const endInput = document.getElementById("overviewEndRange");
  const startLabel = document.getElementById("overviewStartLabel");
  const endLabel = document.getElementById("overviewEndLabel");

  if (!overviewRange.dates.length) {
    panel.classList.add("hidden");
    return;
  }

  const maxIndex = overviewRange.dates.length - 1;
  panel.classList.remove("hidden");
  presetSelect.value = overviewRange.preset;

  [startInput, endInput].forEach(input => {
    input.min = "0";
    input.max = String(maxIndex);
    input.step = "1";
  });

  startInput.value = String(overviewRange.startIndex);
  endInput.value = String(overviewRange.endIndex);
  startLabel.textContent = `Start: ${overviewRange.dates[overviewRange.startIndex]}`;
  endLabel.textContent = `End: ${overviewRange.dates[overviewRange.endIndex]}`;

  presetSelect.onchange = event => {
    setOverviewRangePreset(event.target.value);
  };

  startInput.oninput = event => {
    overviewRange.startIndex = Math.min(Number(event.target.value), overviewRange.endIndex);
    startInput.value = String(overviewRange.startIndex);
    syncOverviewRangePreset();
    syncOverviewRangeControls();
    rerenderForOverviewRange();
  };

  endInput.oninput = event => {
    overviewRange.endIndex = Math.max(Number(event.target.value), overviewRange.startIndex);
    endInput.value = String(overviewRange.endIndex);
    syncOverviewRangePreset();
    syncOverviewRangeControls();
    rerenderForOverviewRange();
  };

  updateOverviewRangeLabel();
}

function rerenderForOverviewRange() {
  renderOverview();
  renderExerciseTable();
}

function setOverviewRangePreset(preset) {
  if (!overviewRange.dates.length) return;

  const nextRange = getPresetRangeIndices(preset);
  overviewRange.preset = preset;
  overviewRange.startIndex = nextRange.startIndex;
  overviewRange.endIndex = nextRange.endIndex;

  syncOverviewRangeControls();
  rerenderForOverviewRange();
}

function syncOverviewRangePreset() {
  const maxIndex = overviewRange.dates.length - 1;
  if (overviewRange.startIndex === 0 && overviewRange.endIndex === maxIndex) {
    overviewRange.preset = "all";
    return;
  }

  const presetOptions = ["30", "90", "180", "365"];
  const matchedPreset = presetOptions.find(option => {
    const expected = getPresetRangeIndices(option);
    return expected.startIndex === overviewRange.startIndex && expected.endIndex === overviewRange.endIndex;
  });

  overviewRange.preset = matchedPreset || "all";
}

function getPresetRangeIndices(preset) {
  const maxIndex = overviewRange.dates.length - 1;
  if (preset === "all") {
    return { startIndex: 0, endIndex: maxIndex };
  }

  const latestDate = parseDate(overviewRange.dates[maxIndex]);
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - Number(preset));

  const startIndex = overviewRange.dates.findIndex(date => {
    const parsed = parseDate(date);
    return parsed && parsed >= cutoff;
  });

  return {
    startIndex: startIndex === -1 ? 0 : startIndex,
    endIndex: maxIndex
  };
}

function updateOverviewRangeLabel() {
  const label = document.getElementById("overviewRangeLabel");
  const bounds = getOverviewDateBounds();
  if (!bounds) {
    label.textContent = "";
    return;
  }

  const presetText = {
    all: "All time",
    30: "Last 30 days",
    90: "Last 90 days",
    180: "Last 6 months",
    365: "Last 12 months"
  }[overviewRange.preset] || "Manual range";

  const datesText = bounds.start === bounds.end
    ? bounds.start
    : `${bounds.start} - ${bounds.end}`;

  label.textContent = `${presetText}: ${datesText}`;
}

function getOverviewDateBounds() {
  if (!overviewRange.dates.length) return null;
  return {
    start: overviewRange.dates[overviewRange.startIndex],
    end: overviewRange.dates[overviewRange.endIndex]
  };
}

function filterRowsByDateBounds(rows, bounds, dateKeys = ["Datum", "Date"]) {
  if (!bounds) return rows;

  return rows.filter(row => {
    const date = formatDate(parseDate(getValue(row, dateKeys)));
    return date && date >= bounds.start && date <= bounds.end;
  });
}

function getProgressRangeLabel() {
  const bounds = getOverviewDateBounds();
  if (!bounds) return "the selected date range";
  return bounds.start === bounds.end
    ? bounds.start
    : `${bounds.start} to ${bounds.end}`;
}

function weekStartMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function epley(weight, reps) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) return null;
  return weight * (1 + reps / 30);
}

function isAssistedExercise(name) {
  return /\(assisted\)/i.test(String(name));
}

function pickPerformanceValue(currentValue, nextValue) {
  if (!Number.isFinite(nextValue)) return currentValue;
  if (!Number.isFinite(currentValue)) return nextValue;
  return Math.max(currentValue, nextValue);
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

function isMobile() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function getBasePlotLayout(title, yLabel) {
  const mobile = isMobile();

  return {
    title: {
      text: title,
      font: { size: mobile ? 14 : 16 }
    },
    autosize: true,
    dragmode: false,
    hovermode: "x unified",
    margin: mobile
      ? { l: 50, r: 20, t: 50, b: 80 }
      : { l: 60, r: 30, t: 60, b: 100 },
    xaxis: {
      title: mobile ? "" : "Date",
      automargin: true,
      tickangle: -45
    },
    yaxis: {
      title: yLabel,
      automargin: true
    },
    legend: {
      orientation: "h"
    }
  };
}

function getPlotConfig() {
  return {
    responsive: true,
    scrollZoom: false,
    doubleClick: false,
    displayModeBar: false
  };
}

function renderOverview() {
  const bounds = getOverviewDateBounds();
  const overviewRows = filterRowsByDateBounds(workoutsData, bounds);
  const weeklyMap = new Map();

  overviewRows.forEach(row => {
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
  const targetWorkouts = 3;

  const colors = workoutCounts.map(v => {
    if (v <= 1) return COLORS.workoutLow;
    if (v === 2) return COLORS.workoutMid;
    return COLORS.workoutHigh;
  });

  const workoutsCard = document.getElementById("workoutsPerWeek");
  workoutsCard.innerHTML = createChartMarkup("workoutsPerWeekPlot", "Workouts per Week");
  Plotly.newPlot("workoutsPerWeekPlot", [{
    x: weeks,
    y: workoutCounts,
    type: "bar",
    marker: { color: colors },
    hovertemplate: "%{x}<br>Workouts: %{y}<extra></extra>"
  }], {
    ...getBasePlotLayout("Workouts per Week", "Workouts"),
    xaxis: {
      title: isMobile() ? "" : "Week",
      automargin: true,
      tickangle: -45
    },
    shapes: weeks.length ? [
      {
        type: "line",
        x0: weeks[0],
        x1: weeks[weeks.length - 1],
        y0: targetWorkouts,
        y1: targetWorkouts,
        line: {
          color: COLORS.primary,
          width: 2,
          dash: "dash"
        }
      }
    ] : [],
    annotations: weeks.length ? [
      {
        x: weeks[weeks.length - 1],
        y: targetWorkouts,
        text: "Goal: 3x/week",
        showarrow: false,
        xanchor: "right",
        yanchor: "bottom"
      }
    ] : []
  }, getPlotConfig());
  attachChartActions(workoutsCard);

  const volumeCard = document.getElementById("volumePerWeek");
  volumeCard.innerHTML = createChartMarkup("volumePerWeekPlot", "Training Volume per Week");
  Plotly.newPlot("volumePerWeekPlot", [{
    x: weeks,
    y: volumes,
    type: "bar",
    hovertemplate: "%{x}<br>Volume: %{y:.0f}<extra></extra>"
  }], {
    ...getBasePlotLayout("Training Volume per Week", "kg × reps"),
    xaxis: {
      title: isMobile() ? "" : "Week",
      automargin: true,
      tickangle: -45
    }
  }, getPlotConfig());
  attachChartActions(volumeCard);

  renderWeightChart(bounds);
  renderMuscleGroupChart(overviewRows);
}

function buildMuscleGroupSummary(rows = workoutsData) {
  const groups = new Map();

  rows.forEach(row => {
    const exercise = String(getValue(row, ["Name der Übung", "Exercise Name"], "")).trim();
    if (!exercise) return;

    const weight = Number(getValue(row, ["Gewicht", "Weight"], 0)) || 0;
    const reps = Number(getValue(row, ["Wiederh.", "Reps"], 0)) || 0;
    const volume = weight * reps;
    const groupName = detectMuscleGroup(exercise);

    if (!groups.has(groupName)) {
      groups.set(groupName, { volume: 0, count: 0 });
    }

    const group = groups.get(groupName);
    group.volume += volume;
    group.count += 1;
  });

  return Array.from(groups.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.volume - a.volume);
}

function renderMuscleGroupChart(rows = workoutsData) {
  const container = document.getElementById("muscleGroupVolume");
  const summary = buildMuscleGroupSummary(rows);

  if (!summary.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = createChartMarkup("muscleGroupVolumePlot", "Muscle Groups: Total Volume");

  const x = summary.map(item => item.name);
  const y = summary.map(item => item.volume);

  Plotly.newPlot("muscleGroupVolumePlot", [{
    x,
    y,
    type: "bar",
    marker: { color: COLORS.primary }
  }], {
    ...getBasePlotLayout("Muscle Groups: Total Volume", "kg × reps"),
    xaxis: {
      title: isMobile() ? "" : "Muscle Group",
      automargin: true,
      tickangle: -45
    }
  }, getPlotConfig());

  attachChartActions(container);
}

function renderWeightChart(bounds) {
  const container = document.getElementById("weightChart");

  const rows = filterRowsByDateBounds(weightData, bounds)
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
  container.innerHTML = createChartMarkup("weightChartPlot", "Bodyweight");

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
      fillcolor: COLORS.primarySoft,
      line: { color: "rgba(0,0,0,0)" },
      hoverinfo: "skip",
      name: "Historical uncertainty"
    },
    {
      x: dates,
      y: values,
      mode: "markers+lines",
      name: "Measured",
      line: { color: COLORS.secondary },
      marker: { color: COLORS.secondary },
      hovertemplate: "%{x}<br>Measured: %{y:.2f} kg<extra></extra>"
    },
    {
      x: dates,
      y: trend,
      mode: "lines",
      line: { width: 2 },
      name: "Trend (7 days)",
      line: { color: COLORS.primary },
      marker: { color: COLORS.primary },
      customdata: stds,
      hovertemplate: "%{x}<br>Trend: %{y:.2f} kg ± %{customdata:.2f}<extra></extra>"
    },
    {
      x: [...forecastDates, ...[...forecastDates].reverse()],
      y: [...forecastUpper, ...[...forecastLower].reverse()],
      fill: "toself",
      fillcolor: COLORS.forecastSoft,
      line: { color: "rgba(0,0,0,0)" },
      hoverinfo: "skip",
      name: "Forecast uncertainty"
    },
    {
      x: forecastDates,
      y: forecastTrend,
      mode: "lines",
      line: { width: 2, dash: "dash", color: COLORS.forecast },
      name: "Forecast (14 days)",
      customdata: forecastStd,
      hovertemplate: "%{x}<br>Forecast: %{y:.2f} kg ± %{customdata:.2f}<extra></extra>"
    }
  ];

  Plotly.newPlot("weightChartPlot", traces, {
    ...getBasePlotLayout("Bodyweight", "kg"),
    xaxis: {
      title: isMobile() ? "" : "Date",
      automargin: true,
      tickangle: isMobile() ? -30 : 0,
      range: [dates[0], forecastDates[forecastDates.length - 1]]
    },
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
  }, getPlotConfig());

  attachChartActions(container);
}

function compareSummaryValues(a, b, key) {
  const valueA = a[key];
  const valueB = b[key];

  if (valueA === valueB) return 0;

  if (valueA === null || valueA === undefined) return 1;
  if (valueB === null || valueB === undefined) return -1;

  if (key === "name") {
    return String(valueA).localeCompare(String(valueB));
  }

  if (key === "lastDate") {
    return String(valueA).localeCompare(String(valueB));
  }

  return Number(valueA) < Number(valueB) ? -1 : 1;
}

function sortSummary(summary) {
  summary.sort((a, b) => {
    const direction = tableSort.direction === "asc" ? 1 : -1;
    const comparison = compareSummaryValues(a, b, tableSort.key);
    if (comparison !== 0) {
      return comparison * direction;
    }
    return String(a.name).localeCompare(String(b.name));
  });
}

function buildExerciseSummary() {
  const progressBounds = getOverviewDateBounds();
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
    dayRec.maxWeight = pickPerformanceValue(dayRec.maxWeight, weight);
    dayRec.bestSet = pickPerformanceValue(dayRec.bestSet, tonnage);
    dayRec.bestE1rm = pickPerformanceValue(dayRec.bestE1rm, e1rm);
    dayRec.totalVolume += tonnage;
  });

  const summary = Array.from(perExercise.entries()).map(([name, item]) => {
    const rows = Array.from(item.dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const latest = rows.length ? rows[rows.length - 1] : null;

    const progression = computeExerciseProgress(rows, progressBounds);
    const progressText = progression !== null
      ? `${progression > 0 ? "+" : ""}${progression.toFixed(1)}% over ${getProgressRangeLabel()}`
      : `No progress data for ${getProgressRangeLabel()}`;

    return {
      name,
      count: item.count,
      lastDate: item.lastDate ? formatDate(item.lastDate) : "",
      lastMax: latest && Number.isFinite(latest.maxWeight) ? latest.maxWeight : null,
      progress: progression,
      progressText,
      rows
    };
  });

  sortSummary(summary);
  return summary;
}

function updateSort(key) {
  if (tableSort.key === key) {
    tableSort.direction = tableSort.direction === "asc" ? "desc" : "asc";
  } else {
    tableSort.key = key;
    tableSort.direction = key === "name" ? "asc" : "desc";
  }
}

function getSortIndicator(key) {
  if (tableSort.key !== key) return "";
  return tableSort.direction === "asc" ? " ▲" : " ▼";
}

function computeExerciseProgress(rows, bounds = null) {
  if (!rows.length) return null;

  const relevantRows = bounds
    ? rows.filter(row => row.date >= bounds.start && row.date <= bounds.end)
    : rows;

  const metricValues = relevantRows
    .map(r => Number.isFinite(r.bestE1rm) ? r.bestE1rm : Number.isFinite(r.maxWeight) ? r.maxWeight : null)
    .filter(Number.isFinite);

  if (metricValues.length < 2) return null;

  const firstValue = metricValues[0];
  const lastValue = metricValues[metricValues.length - 1];
  if (!Number.isFinite(firstValue) || firstValue === 0) return null;

  return ((lastValue / firstValue) - 1) * 100;
}

function renderExerciseTable() {
  const container = document.getElementById("exerciseTable");
  const select = document.getElementById("exerciseSelect");
  const summary = buildExerciseSummary();

  if (!summary.length) {
    container.innerHTML = '<p class="muted">No exercises found.</p>';
    document.getElementById("exerciseCharts").innerHTML = "";
    select.innerHTML = "";
    return;
  }

  selectedExercise = selectedExercise && summary.some(x => x.name === selectedExercise)
    ? selectedExercise
    : summary[0].name;

  select.innerHTML = summary.map(ex => `
    <option value="${escapeHtml(ex.name)}" ${ex.name === selectedExercise ? "selected" : ""}>
      ${escapeHtml(ex.name)}
    </option>
  `).join("");

  select.onchange = (event) => {
    selectedExercise = event.target.value;
    updateActiveExerciseRow();
    renderExerciseCharts(selectedExercise);
  };

  container.innerHTML = `
    <div class="table-wrap">
      <table class="exercise-table">
        <thead>
          <tr>
            <th data-sort-key="name">Exercise${getSortIndicator("name")}</th>
            <th data-sort-key="count">Sets${getSortIndicator("count")}</th>
            <th data-sort-key="lastDate">Last entry${getSortIndicator("lastDate")}</th>
            <th data-sort-key="lastMax">Latest max${getSortIndicator("lastMax")}</th>
            <th data-sort-key="progress">Progress${getSortIndicator("progress")}</th>
          </tr>
        </thead>
        <tbody>
          ${summary.map((ex) => `
            <tr data-exercise="${escapeHtml(ex.name)}" class="${ex.name === selectedExercise ? "active" : ""}">
              <td>${escapeHtml(ex.name)}</td>
              <td>${ex.count}</td>
              <td>${escapeHtml(ex.lastDate)}</td>
              <td>${ex.lastMax !== null ? `${ex.lastMax.toFixed(1)} kg` : "—"}</td>
              <td>${ex.progress !== null ? `${ex.progress > 0 ? "+" : ""}${ex.progress.toFixed(1)}%` : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("th[data-sort-key]").forEach(th => {
    th.addEventListener("click", () => {
      updateSort(th.dataset.sortKey);
      renderExerciseTable();
    });
  });

  const rows = container.querySelectorAll("tbody tr");
  rows.forEach((row) => {
    row.addEventListener("click", () => {
      selectedExercise = row.getAttribute("data-exercise");
      select.value = selectedExercise;
      updateActiveExerciseRow();
      renderExerciseCharts(selectedExercise);

      if (isMobile()) {
        document.getElementById("exerciseCharts").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    });
  });

  renderExerciseCharts(selectedExercise);
}

function updateActiveExerciseRow() {
  const rows = document.querySelectorAll("#exerciseTable tbody tr");
  rows.forEach(row => {
    row.classList.toggle("active", row.getAttribute("data-exercise") === selectedExercise);
  });
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
  const container = document.getElementById(elementId);
  if (!container) return;

  const plotId = `${elementId}-plot`;
  container.innerHTML = createChartMarkup(plotId, title);

  const isKgChart = yLabel === "kg";

  Plotly.newPlot(plotId, [{
    x,
    y,
    mode: "lines+markers",
    hovertemplate: "%{x}<br>%{y:.2f}<extra></extra>"
  }], {
    ...getBasePlotLayout(title, yLabel),
    yaxis: {
      ...getBasePlotLayout(title, yLabel).yaxis,
      tickmode: isKgChart ? "linear" : undefined,
      dtick: isKgChart ? 5 : undefined
    }
  }, getPlotConfig());

  attachChartActions(container);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.addEventListener("resize", () => {
  const plotIds = [
    "workoutsPerWeekPlot",
    "volumePerWeekPlot",
    "weightChartPlot",
    "muscleGroupVolumePlot",
    "chart-max-plot",
    "chart-best-set-plot",
    "chart-e1rm-plot",
    "chart-volume-plot"
  ];

  plotIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      Plotly.Plots.resize(el);
    }
  });
});
