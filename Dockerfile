# Stage 1: Build the React Instructor Dashboard bundle
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend/instructor-dashboard

COPY frontend/instructor-dashboard/package.json frontend/instructor-dashboard/package-lock.json ./
RUN npm ci

COPY frontend/instructor-dashboard/ ./
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build


# Stage 2: Build the React Student Dashboard bundle
FROM node:22-alpine AS student-builder

WORKDIR /app/frontend/student-dashboard

COPY frontend/student-dashboard/package.json frontend/student-dashboard/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY frontend/student-dashboard/ ./
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build


# Stage 3: FastAPI backend + templates + 3D simulator modules (.mjs) + /vendor/three + built Instructor & Student SPAs
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY frontend ./frontend
COPY --from=frontend-builder /app/frontend/instructor-dashboard/dist ./frontend/instructor-dashboard/dist
COPY --from=student-builder /app/frontend/student-dashboard/dist ./frontend/student-dashboard/dist
COPY --from=frontend-builder /app/frontend/instructor-dashboard/node_modules/three/build ./frontend/static/vendor/three/build
COPY --from=frontend-builder /app/frontend/instructor-dashboard/node_modules/three/examples/jsm ./frontend/static/vendor/three/addons

# Verify built Instructor & Student SPAs, 3D simulator ES modules, and vendored Three.js runtime exist in the final image
RUN test -f /app/frontend/instructor-dashboard/dist/index.html \
    && test -f /app/frontend/student-dashboard/dist/index.html \
    && test -f /app/frontend/static/js/sim3d/SimulatorApp.mjs \
    && test -f /app/frontend/static/vendor/three/build/three.module.js

WORKDIR /app/backend

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"APP_PORT\", \"5000\")}/api/health', timeout=3)" || exit 1

CMD ["python", "scripts/docker_entrypoint.py"]
