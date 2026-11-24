FROM python:3.13-slim
# Scrapling is locked to one release; bump it on purpose (docs/adr/0001).
RUN pip install --no-cache-dir "scrapling[fetchers]==0.5.1"
WORKDIR /app
COPY app.py .
CMD ["python", "app.py"]
