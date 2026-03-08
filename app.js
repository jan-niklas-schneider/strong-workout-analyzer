let workoutsData = null
let weightData = null

document.getElementById("analyzeBtn").onclick = async () => {

const workoutsFile = document.getElementById("workoutsFile").files[0]
const weightFile = document.getElementById("weightFile").files[0]

if (!workoutsFile) {

alert("Please upload your workouts CSV")
return

}

workoutsData = await parseCSV(workoutsFile)

if (weightFile) {

weightData = await parseCSV(weightFile)

}

renderOverview()
renderExercises()

}

function parseCSV(file) {

return new Promise(resolve => {

Papa.parse(file, {

header: true,
dynamicTyping: true,
skipEmptyLines: true,

complete: results => resolve(results.data)

})

})

}

function renderOverview() {

const weeks = {}

workoutsData.forEach(r => {

const date = new Date(r["Datum"] || r["Date"])

if (!date) return

const weekStart = new Date(date)

weekStart.setDate(date.getDate() - date.getDay())

const key = weekStart.toISOString().slice(0,10)

if (!weeks[key]) {

weeks[key] = { workouts: 0, volume: 0 }

}

weeks[key].workouts += 1

const weight = Number(r["Gewicht"] || r["Weight"] || 0)
const reps = Number(r["Wiederh."] || r["Reps"] || 0)

weeks[key].volume += weight * reps

})

const x = Object.keys(weeks).sort()

const workoutsPerWeek = x.map(w => weeks[w].workouts)
const volumePerWeek = x.map(w => weeks[w].volume)

Plotly.newPlot(

"workoutsPerWeek",

[{

x: x,
y: workoutsPerWeek,
type: "bar"

}],

{ title: "Workouts per Week" }

)

Plotly.newPlot(

"volumePerWeek",

[{

x: x,
y: volumePerWeek,
type: "bar"

}],

{ title: "Training Volume per Week" }

)

if (weightData) renderWeight()

}

function renderWeight() {

const dates = []
const values = []

weightData.forEach(r => {

const d = r["Datum"] || r["Date"]
const v = Number(r["Value"])

if (d && v) {

dates.push(d)
values.push(v)

}

})

const trend = movingAverage(values, 7)

Plotly.newPlot(

"weightChart",

[
{
x: dates,
y: values,
mode: "markers+lines",
name: "Weight"
},

{
x: dates,
y: trend,
mode: "lines",
name: "Trend"
}
],

{ title: "Bodyweight" }

)

}

function movingAverage(arr, window) {

const result = []

for (let i = 0; i < arr.length; i++) {

const start = Math.max(0, i - window)

const subset = arr.slice(start, i + 1)

const avg = subset.reduce((a, b) => a + b, 0) / subset.length

result.push(avg)

}

return result

}

function renderExercises() {

const container = document.getElementById("exerciseList")

container.innerHTML = ""

const exercises = [...new Set(

workoutsData.map(r => r["Name der Übung"] || r["Exercise Name"])

)]

exercises.sort()

exercises.forEach(ex => {

const btn = document.createElement("button")

btn.innerText = ex

btn.onclick = () => renderExerciseCharts(ex)

container.appendChild(btn)

})

}

function renderExerciseCharts(exercise) {

const rows = workoutsData.filter(

r => (r["Name der Übung"] || r["Exercise Name"]) === exercise

)

const dates = []
const weights = []
const reps = []
const volumes = []
const e1rm = []

rows.forEach(r => {

const d = r["Datum"] || r["Date"]

const w = Number(r["Gewicht"] || r["Weight"] || 0)
const rep = Number(r["Wiederh."] || r["Reps"] || 0)

dates.push(d)
weights.push(w)
reps.push(rep)
volumes.push(w * rep)
e1rm.push(w * (1 + rep / 30))

})

const container = document.getElementById("exerciseCharts")

container.innerHTML = ""

container.appendChild(createChart("Max Weight", dates, weights))
container.appendChild(createChart("Reps", dates, reps))
container.appendChild(createChart("Volume", dates, volumes))
container.appendChild(createChart("Estimated 1RM", dates, e1rm))

}

function createChart(title, x, y) {

const div = document.createElement("div")

div.className = "chart"

Plotly.newPlot(

div,

[{

x: x,
y: y,
mode: "lines+markers"

}],

{ title: title }

)

return div

}
