FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app.py /app/app.py

ENTRYPOINT ["python", "/app/app.py", "--workouts", "/data/strong_workouts.csv", "--weight", "/data/strong_weight.csv", "--out", "/out"]