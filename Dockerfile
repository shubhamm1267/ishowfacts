FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    python3 \
    python3-venv \
    ffmpeg \
    fonts-dejavu-core \
    tesseract-ocr \
    tesseract-ocr-hin \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY studio/package.json studio/package-lock.json studio/
RUN npm ci --prefix studio --omit=dev --no-audit --no-fund

COPY studio/requirements-cutout.txt studio/requirements-cutout.txt

RUN python3 -m venv /opt/facts-venv

RUN /opt/facts-venv/bin/pip install \
    --no-cache-dir \
    -r studio/requirements-cutout.txt

COPY . .

ENV PATH="/opt/facts-venv/bin:$PATH"
ENV PYTHON="/opt/facts-venv/bin/python"
ENV HOST=0.0.0.0
ENV PORT=10000

EXPOSE 10000

CMD ["node", "studio/server.mjs"]
