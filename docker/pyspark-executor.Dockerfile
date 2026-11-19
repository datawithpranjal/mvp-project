FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

COPY backend/requirements-pyspark-executor.txt /opt/requirements.txt
RUN pip install --no-cache-dir -r /opt/requirements.txt

COPY backend/pyspark_executor.py /opt/pyspark_executor.py
COPY backend/app/services/pyspark_environment.py /opt/pyspark_environment.py

ENTRYPOINT ["python", "/opt/pyspark_executor.py"]
