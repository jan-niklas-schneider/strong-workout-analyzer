import argparse
import os
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
from plotly.subplots import make_subplots
from jinja2 import Template

pio.templates.default = "plotly_white"


def safe_mkdir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def parse_datetime_series(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors="coerce", utc=False)


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    colmap = {}
    # German columns
    if "Datum" in df.columns:
        colmap["Datum"] = "date"
    if "Workout-Name" in df.columns:
        colmap["Workout-Name"] = "workout_name"
    if "Name der Übung" in df.columns:
        colmap["Name der Übung"] = "exercise"
    if "Gewicht" in df.columns:
        colmap["Gewicht"] = "weight"
    if "Wiederh." in df.columns:
        colmap["Wiederh."] = "reps"
    if "Sekunden" in df.columns:
        colmap["Sekunden"] = "seconds"
    if "Entfernung" in df.columns:
        colmap["Entfernung"] = "distance"

    # English fallbacks
    if "Date" in df.columns:
        colmap["Date"] = "date"
    if "Workout Name" in df.columns:
        colmap["Workout Name"] = "workout_name"
    if "Exercise Name" in df.columns:
        colmap["Exercise Name"] = "exercise"
    if "Weight" in df.columns:
        colmap["Weight"] = "weight"
    if "Reps" in df.columns:
        colmap["Reps"] = "reps"

    return df.rename(columns=colmap)


def normalize_weight_columns(df: pd.DataFrame) -> pd.DataFrame:
    colmap = {}
    if "Datum" in df.columns:
        colmap["Datum"] = "date"
    if "Measurement Type" in df.columns:
        colmap["Measurement Type"] = "type"
    if "Value" in df.columns:
        colmap["Value"] = "value"
    if "Unit" in df.columns:
        colmap["Unit"] = "unit"
    return df.rename(columns=colmap)


def epley_1rm(weight: float, reps: float) -> float:
    if pd.isna(weight) or pd.isna(reps) or reps <= 0:
        return np.nan
    return float(weight) * (1.0 + float(reps) / 30.0)


def slugify(name: str) -> str:
    keep = []
    for ch in name.lower():
        if ch.isalnum():
            keep.append(ch)
        elif ch in [" ", "-", "_"]:
            keep.append("_")
    s = "".join(keep)
    while "__" in s:
        s = s.replace("__", "_")
    return s.strip("_")[:120] or "exercise"


def make_bar_html(df: pd.DataFrame, x: str, y: str, title: str, y_label: str) -> str:
    if df.empty:
        return "<div>Keine Daten</div>"
    fig = px.bar(df, x=x, y=y, title=title, labels={x: "Woche", y: y_label})
    fig.update_traces(hovertemplate="%{x}<br>%{y:.2f}<extra></extra>")
    fig.update_layout(margin=dict(l=10, r=10, t=50, b=10), height=360)
    return fig.to_html(full_html=False, include_plotlyjs=False)


def make_line_html(df: pd.DataFrame, x: str, y: str, title: str, y_label: str) -> str:
    if df.empty:
        return "<div>Keine Daten</div>"
    fig = px.line(df, x=x, y=y, markers=True, title=title, labels={x: "Datum", y: y_label})
    fig.update_traces(hovertemplate="%{x|%Y-%m-%d}<br>%{y:.2f}<extra></extra>")
    fig.update_layout(margin=dict(l=10, r=10, t=50, b=10), height=360)
    return fig.to_html(full_html=False, include_plotlyjs=False)


def make_bodyweight_html(
    bw_day: pd.DataFrame,
    forecast_days: int = 14,
    trend_window: int = 7,
    regression_window: int = 21,
) -> str:
    """
    Create a weather-like bodyweight chart with:
    - actual measurements
    - smoothed trend line
    - historical uncertainty band
    - 14-day forecast with widening uncertainty cone
    """
    if bw_day.empty:
        return "<div>Keine Daten</div>"

    bw_day = bw_day.copy().sort_values("day").reset_index(drop=True)
    bw_day["value"] = pd.to_numeric(bw_day["value"], errors="coerce")
    bw_day = bw_day.dropna(subset=["day", "value"])
    if bw_day.empty:
        return "<div>Keine Daten</div>"

    # Smooth trend: centered rolling mean with fallback to expanding mean for short series.
    bw_day["trend"] = (
        bw_day["value"]
        .rolling(window=min(trend_window, max(len(bw_day), 1)), center=True, min_periods=1)
        .mean()
    )

    residuals = bw_day["value"] - bw_day["trend"]

    bw_day["rolling_std"] = (
        residuals
        .rolling(window=14, min_periods=3)
        .std()
        .bfill()
    )

    bw_day["rolling_std"] = bw_day["rolling_std"].fillna(0.15)
    bw_day["rolling_std"] = bw_day["rolling_std"].clip(lower=0.15)

    # Historisches Band: laufende Standardabweichung
    bw_day["unc_lower"] = bw_day["trend"] - bw_day["rolling_std"]
    bw_day["unc_upper"] = bw_day["trend"] + bw_day["rolling_std"]

    # Für die Prognose nur den letzten verfügbaren Unsicherheitswert nehmen
    last_std = float(bw_day["rolling_std"].iloc[-1])

    # Forecast based on recent trend points.
    hist_for_reg = bw_day.dropna(subset=["trend"]).tail(max(2, regression_window)).copy()
    hist_for_reg["x"] = np.arange(len(hist_for_reg), dtype=float)

    if len(hist_for_reg) >= 2:
        slope, intercept = np.polyfit(hist_for_reg["x"], hist_for_reg["trend"], 1)
    else:
        slope = 0.0
        intercept = float(hist_for_reg["trend"].iloc[-1]) if not hist_for_reg.empty else float(bw_day["value"].iloc[-1])

    last_day = bw_day["day"].max()
    future_days = pd.date_range(last_day + pd.Timedelta(days=1), periods=forecast_days, freq="D")
    start_x = len(hist_for_reg)
    future_x = np.arange(start_x, start_x + forecast_days, dtype=float)
    forecast_trend = intercept + slope * future_x

    # Uncertainty widens over forecast horizon like a simple forecast cone.
    horizon = np.arange(1, forecast_days + 1, dtype=float)
    forecast_std = last_std * np.sqrt(1.0 + horizon / 2.0)

    forecast_df = pd.DataFrame(
        {
            "day": future_days,
            "trend": forecast_trend,
            "unc_lower": forecast_trend - forecast_std,
            "unc_upper": forecast_trend + forecast_std,
        }
    )

    band_x_hist = pd.concat([bw_day["day"], bw_day["day"].iloc[::-1]], ignore_index=True)
    band_y_hist = pd.concat([bw_day["unc_upper"], bw_day["unc_lower"].iloc[::-1]], ignore_index=True)

    band_x_fore = pd.concat([forecast_df["day"], forecast_df["day"].iloc[::-1]], ignore_index=True)
    band_y_fore = pd.concat([forecast_df["unc_upper"], forecast_df["unc_lower"].iloc[::-1]], ignore_index=True)

    fig = go.Figure()

    fig.add_trace(
        go.Scatter(
            x=band_x_hist,
            y=band_y_hist,
            fill="toself",
            name="Unsicherheit (historisch)",
            line=dict(color="rgba(31, 119, 180, 0)"),
            fillcolor="rgba(31, 119, 180, 0.14)",
            hoverinfo="skip",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=bw_day["day"],
            y=bw_day["value"],
            mode="markers+lines",
            name="Gemessen",
            line=dict(width=1),
            marker=dict(size=7),
            hovertemplate="%{x|%Y-%m-%d}<br>Gemessen: %{y:.2f} kg<extra></extra>",
        )
    )

    fig.add_trace(
    go.Scatter(
        x=bw_day["day"],
        y=bw_day["trend"],
        mode="lines",
        name=f"Trend ({trend_window} Tage)",
        line=dict(width=3),
        customdata=bw_day["rolling_std"],
        hovertemplate="%{x|%Y-%m-%d}<br>Trend: %{y:.2f} kg ± %{customdata:.2f}<extra></extra>",
    )
)

    fig.add_shape(
        type="line",
        x0=last_day,
        x1=last_day,
        y0=0,
        y1=1,
        xref="x",
        yref="paper",
        line=dict(width=1, dash="dash", color="rgba(80,80,80,0.6)"),
    )
    fig.add_annotation(
        x=last_day,
        y=1,
        xref="x",
        yref="paper",
        text="Heute / letzter Messpunkt",
        showarrow=False,
        xanchor="right",
        yanchor="bottom",
        bgcolor="rgba(255,255,255,0.8)",
    )

    fig.add_trace(
        go.Scatter(
            x=band_x_fore,
            y=band_y_fore,
            fill="toself",
            name="Unsicherheit (Prognose)",
            line=dict(color="rgba(214, 39, 40, 0)"),
            fillcolor="rgba(214, 39, 40, 0.16)",
            hoverinfo="skip",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=forecast_df["day"],
            y=forecast_df["trend"],
            mode="lines",
            name=f"Prognose ({forecast_days} Tage)",
            line=dict(width=3, dash="dash"),
            hovertemplate="%{x|%Y-%m-%d}<br>Prognose: %{y:.2f} kg<extra></extra>",
        )
    )

    fig.update_layout(
        title="Körpergewicht – Trend, Unsicherheit & Prognose",
        height=460,
        margin=dict(l=10, r=10, t=60, b=10),
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
        xaxis_title="Datum",
        yaxis_title="kg",
    )

    return fig.to_html(full_html=False, include_plotlyjs=False)

def make_exercise_plot_html(ex_df: pd.DataFrame, ex_name: str, y_col: str, title: str, y_label: str) -> str:
    if ex_df.empty:
        return "<div>Keine Daten</div>"

    fig = px.line(
        ex_df,
        x="day",
        y=y_col,
        markers=True,
        title=title,
        labels={"day": "Datum", y_col: y_label},
    )
    fig.update_traces(hovertemplate="%{x|%Y-%m-%d}<br>%{y:.2f}<extra></extra>")
    fig.update_layout(
        margin=dict(l=10, r=10, t=50, b=10),
        height=360,
    )
    return fig.to_html(full_html=False, include_plotlyjs=False)

def make_exercise_4in1_html(ex_df: pd.DataFrame, ex_name: str) -> str:
    """
    One figure with 4 stacked charts, shared X axis, unified hover.
    Hovering anywhere shows all 4 values for the same date.
    """
    if ex_df.empty:
        return "<div>Keine Daten</div>"

    fig = make_subplots(
        rows=4,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.06,
        subplot_titles=(
            "Max Gewicht pro Tag (kg)",
            "Bestes Set (Gewicht*Wdh.)",
            "geschätztes 1RM (Epley) (kg)",
            "Tagesvolumen (Summe Gewicht*Wdh.)",
        ),
    )

    x = ex_df["day"]

    fig.add_trace(
        go.Scatter(x=x, y=ex_df["max_weight"], mode="lines+markers", name="Max Gewicht"),
        row=1, col=1
    )
    fig.add_trace(
        go.Scatter(x=x, y=ex_df["best_tonnage_set"], mode="lines+markers", name="Bestes Set"),
        row=2, col=1
    )
    fig.add_trace(
        go.Scatter(x=x, y=ex_df["best_e1rm"], mode="lines+markers", name="1RM (Epley)"),
        row=3, col=1
    )
    fig.add_trace(
        go.Scatter(x=x, y=ex_df["total_volume"], mode="lines+markers", name="Tagesvolumen"),
        row=4, col=1
    )

    fig.update_traces(hovertemplate="%{x|%Y-%m-%d}<br>%{y:.2f}<extra></extra>")
    fig.update_layout(
        title=f"{ex_name} – Progress",
        hovermode="x unified",
        height=1200,
        margin=dict(l=10, r=10, t=60, b=10),
    )

    return fig.to_html(full_html=False, include_plotlyjs=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workouts", required=True, help="Path to strong_workouts.csv")
    ap.add_argument("--weight", required=False, help="Path to strong_weight.csv")
    ap.add_argument("--out", required=True, help="Output directory")
    ap.add_argument("--top", type=int, default=20, help="How many exercises to render")
    args = ap.parse_args()

    out_dir = Path(args.out)
    safe_mkdir(out_dir)
    pages_dir = out_dir / "pages"
    safe_mkdir(pages_dir)

    # ---------- load workouts ----------
    w = pd.read_csv(args.workouts)
    w = normalize_columns(w)

    required = {"date", "exercise", "weight", "reps"}
    missing = [c for c in required if c not in w.columns]
    if missing:
        raise SystemExit(f"Missing required columns in workouts CSV: {missing}. Found: {list(w.columns)}")

    w["date"] = parse_datetime_series(w["date"])
    w = w.dropna(subset=["date", "exercise"])
    w["day"] = w["date"].dt.floor("D")
    w["weight"] = pd.to_numeric(w["weight"], errors="coerce")
    w["reps"] = pd.to_numeric(w["reps"], errors="coerce")

    w["tonnage_set"] = w["weight"].fillna(0) * w["reps"].fillna(0)
    w["e1rm_set"] = [epley_1rm(a, b) for a, b in zip(w["weight"], w["reps"])]

    # keep rows with meaningful strength data (filter out pure cardio rows)
    w = w[(w["reps"].fillna(0) > 0) | (w["weight"].fillna(0) > 0)].copy()

    # ---------- weekly overview ----------
    if "workout_name" in w.columns:
        session_key = w["day"].astype(str) + "||" + w["workout_name"].astype(str)
    else:
        session_key = w["day"].astype(str)
    w["_session"] = session_key

    weekly = w.copy()
    weekly["week"] = weekly["day"].dt.to_period("W-MON").dt.start_time
    weekly_sessions = weekly.groupby("week")["_session"].nunique().rename("workouts")
    weekly_volume = weekly.groupby("week")["tonnage_set"].sum().rename("volume")
    weekly_df = pd.concat([weekly_sessions, weekly_volume], axis=1).reset_index()

    overview_workouts_html = make_bar_html(
        weekly_df.assign(week=weekly_df["week"].dt.strftime("%Y-%m-%d")),
        "week",
        "workouts",
        "Workouts pro Woche",
        "Workouts",
    )
    overview_volume_html = make_bar_html(
        weekly_df.assign(week=weekly_df["week"].dt.strftime("%Y-%m-%d")),
        "week",
        "volume",
        "Trainingsvolumen pro Woche (Summe Gewicht*Wdh.)",
        "Volumen (kg*Wdh.)",
    )

    # ---------- bodyweight (optional) ----------
    bodyweight_html = None
    if args.weight and os.path.exists(args.weight):
        bw = pd.read_csv(args.weight)
        bw = normalize_weight_columns(bw)
        if {"date", "value"}.issubset(set(bw.columns)):
            bw["date"] = parse_datetime_series(bw["date"])
            bw["value"] = pd.to_numeric(bw["value"], errors="coerce")
            bw = bw.dropna(subset=["date", "value"]).sort_values("date")
            bw["day"] = bw["date"].dt.floor("D")
            bw_day = bw.groupby("day")["value"].last().reset_index()
            bodyweight_html = make_bodyweight_html(bw_day)

    # ---------- per exercise/day metrics ----------
    agg = w.groupby(["exercise", "day"]).agg(
        max_weight=("weight", "max"),
        best_tonnage_set=("tonnage_set", "max"),
        best_e1rm=("e1rm_set", "max"),
        total_volume=("tonnage_set", "sum"),
        sets=("tonnage_set", "count"),
    ).reset_index().sort_values(["exercise", "day"])

    (out_dir / "exercise_day_metrics.csv").write_text(agg.to_csv(index=False), encoding="utf-8")

    # ---------- exercise ranking (most frequent first) ----------
    exercise_rank = w.groupby("exercise").size().sort_values(ascending=False)
    top_exercises = list(exercise_rank.head(args.top).index)

    # ---------- per-exercise pages (4-in-1 unified hover) ----------
    exercise_links = []

    exercise_template = Template(
        """
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{ name }} – Progress</title>
  <script src="https://cdn.plot.ly/plotly-2.30.0.min.js"></script>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }
    .meta { color: #555; margin-bottom: 12px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 14px; }
    a { color: inherit; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 1100px) { .grid { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
  <h1>{{ name }}</h1>
  <div class="meta">
    <a href="../report.html">← zurück zur Übersicht</a><br>
    Sets gesamt: {{ count }}<br>
    Letzter Eintrag: {{ last_date }} · Letztes Max: {{ last_max }}
  </div>

   <div class="grid">
    <div class="card">{{ plot_max | safe }}</div>
    <div class="card">{{ plot_best_set | safe }}</div>
    <div class="card">{{ plot_e1rm | safe }}</div>
    <div class="card">{{ plot_volume | safe }}</div>
   </div>
</body>
</html>
"""
    )

    for ex in top_exercises:
        ex_df = agg[agg["exercise"] == ex].copy()
        if ex_df.empty:
            continue

        ex_slug = slugify(ex)
        page_path = pages_dir / f"{ex_slug}.html"
        ex_count = int(exercise_rank.loc[ex])

        last_row = ex_df.dropna(subset=["max_weight"]).tail(1)
        last_date = last_row["day"].iloc[0].date().isoformat() if not last_row.empty else ""
        last_max = f"{float(last_row['max_weight'].iloc[0]):.1f} kg" if not last_row.empty else "—"

        plot_max = make_exercise_plot_html(
            ex_df, ex, "max_weight", f"{ex} – Max Gewicht pro Tag", "kg"
        )
        plot_best_set = make_exercise_plot_html(
            ex_df, ex, "best_tonnage_set", f"{ex} – Bestes Set (Gewicht×Wdh.)", "kg*Wdh."
        )
        plot_e1rm = make_exercise_plot_html(
            ex_df, ex, "best_e1rm", f"{ex} – geschätztes 1RM (Epley)", "kg"
        )
        plot_volume = make_exercise_plot_html(
            ex_df, ex, "total_volume", f"{ex} – Tagesvolumen", "kg*Wdh."
        )

        page_html = exercise_template.render(
            name=ex,
            count=ex_count,
            last_date=last_date,
            last_max=last_max,
            plot_max=plot_max,
            plot_best_set=plot_best_set,
            plot_e1rm=plot_e1rm,
            plot_volume=plot_volume,
        )
        page_path.write_text(page_html, encoding="utf-8")

        exercise_links.append(
            {
                "name": ex,
                "href": f"pages/{ex_slug}.html",
                "last_date": last_date,
                "last_max": last_max,
                "count": ex_count,
            }
        )

    # Ensure report list is sorted by frequency
    exercise_links.sort(key=lambda d: d["count"], reverse=True)

    # ---------- main report ----------
    report_template = Template(
        """
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Strong – Progress Report</title>
  <script src="https://cdn.plot.ly/plotly-2.30.0.min.js"></script>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }
    h1,h2 { margin: 0.2em 0; }
    .meta { color: #555; margin-bottom: 12px; }
    .two { display: grid; grid-template-columns: 1fr; gap: 14px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 14px; }
    @media (min-width: 900px) { .two { grid-template-columns: 1fr 1fr; } }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; }
    a { color: inherit; }
  </style>
</head>
<body>
  <h1>Strong – Progress Report</h1>
  <div class="meta">Generiert am: {{ generated_at }} · Übungen: {{ n_exercises }}</div>

  <h2>Overview</h2>
  <div class="two">
    <div class="card">{{ overview_workouts | safe }}</div>
    <div class="card">{{ overview_volume | safe }}</div>
    {% if bodyweight %}
      <div class="card" style="grid-column: 1 / -1;">{{ bodyweight | safe }}</div>
    {% endif %}
  </div>

  <h2>Übungen (nach Häufigkeit)</h2>
  <div class="card">
    <table>
      <thead><tr><th>Übung</th><th>Sets</th><th>Letzter Eintrag</th><th>Letztes Max</th></tr></thead>
      <tbody>
      {% for ex in exercises %}
        <tr>
          <td><a href="{{ ex.href }}">{{ ex.name }}</a></td>
          <td>{{ ex.count }}</td>
          <td>{{ ex.last_date }}</td>
          <td>{{ ex.last_max }}</td>
        </tr>
      {% endfor %}
      </tbody>
    </table>
  </div>

  <div class="meta">Export: <code>exercise_day_metrics.csv</code></div>
</body>
</html>
"""
    )

    report_html = report_template.render(
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        n_exercises=len(exercise_links),
        overview_workouts=overview_workouts_html,
        overview_volume=overview_volume_html,
        bodyweight=bodyweight_html,
        exercises=exercise_links,
    )
    (out_dir / "report.html").write_text(report_html, encoding="utf-8")

    print("Done.")
    print(f"- Report: {out_dir / 'report.html'}")
    print(f"- Exercise pages: {pages_dir}")
    print(f"- CSV: {out_dir / 'exercise_day_metrics.csv'}")


if __name__ == "__main__":
    main()
