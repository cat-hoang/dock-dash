# 🐳 DockDash

A lightweight web dashboard for tracking all your Docker containers at a glance.

Built with **Vue 3 + Vite** (frontend) and **Fastify + Dockerode** (backend) in a Node.js monorepo.

---

## Features

- **Live container list** — all running and stopped containers, auto-refreshed every 10 seconds
- **Start / Stop** containers directly from the UI
- **Port display** — mapped host ports highlighted, unmapped container ports shown dimly
- **Compose awareness** — shows the Docker Compose project and service for each container
- **Search & filter** — search by name, image, or project; filter by All / Running / Stopped
- **Compose folder scan** — configure a root folder and DockDash will discover all `docker-compose.yml` files in subfolders
- **Persistent settings** — compose folder is saved to disk and restored on restart

---

## Project Structure

```
dock-dash/
├── package.json                  ← npm workspaces root
└── packages/
    ├── backend/                  ← Fastify API server (port 3001)
    │   └── src/
    │       ├── index.ts
    │       ├── routes/           ← containers, settings, compose
    │       └── services/         ← docker.service, compose.service, settings.service
    └── frontend/                 ← Vue 3 + Vite SPA (port 5173)
        └── src/
            ├── App.vue
            ├── api.ts
            ├── stores/           ← Pinia stores
            ├── components/       ← ContainerList, ContainerRow, SettingsModal
            └── tests/            ← Vitest unit tests
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running on your machine
- Docker socket accessible (default on Windows/macOS via Docker Desktop; on Linux ensure your user is in the `docker` group)

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development servers

```bash
npm run dev
```

This starts:
| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:5173  |
| Backend  | http://localhost:3001  |

The frontend proxies all `/api` requests to the backend automatically.

### 3. Open the dashboard

Navigate to **http://localhost:5173** in your browser.

---

## Configuration

Click the **⚙ Settings** button in the top-right corner to set your Docker Compose folder.

DockDash will recursively scan that folder for `docker-compose.yml` / `compose.yml` files and surface the projects at `/api/compose`.

Settings are persisted to `packages/backend/data/settings.json`.

---

## API Endpoints

| Method | Path                        | Description                          |
|--------|-----------------------------|--------------------------------------|
| GET    | `/api/containers`           | List all containers (running + stopped) |
| POST   | `/api/containers/:id/start` | Start a container                    |
| POST   | `/api/containers/:id/stop`  | Stop a container                     |
| GET    | `/api/settings`             | Get current settings                 |
| POST   | `/api/settings`             | Update settings                      |
| GET    | `/api/compose`              | List discovered compose files        |
| GET    | `/api/health`               | Health check                         |

---

## Running Tests

```bash
npm run test
```

Runs 15 Vitest unit tests covering the Pinia stores and `ContainerRow` component.

---

## Docker Deployment

> **How it works:** a single container serves both the API and the compiled Vue frontend on port `3001`.

### Quick start (Linux / macOS)

```bash
docker compose up -d
```

Open **http://localhost:3001** — done.

### Quick start (Windows with Docker Desktop)

Docker Desktop on Windows exposes the daemon via a named pipe, not a Unix socket. Edit `docker-compose.yml` and swap the socket volume for the named pipe option (see the comments inside the file), then run:

```bash
docker compose up -d
```

Alternatively, enable **"Expose daemon on tcp://localhost:2375"** in Docker Desktop → Settings → General, then uncomment the `DOCKER_HOST` environment variable line in `docker-compose.yml` instead.

### Build the image manually

```bash
docker build -t dock-dash .
```

### Persistent data

Settings (compose folder path etc.) are stored in a Docker named volume called `dock-dash-data`, so they survive container restarts and upgrades.

```bash
# Inspect the volume
docker volume inspect dock-dash-data

# Remove all data (reset settings)
docker volume rm dock-dash-data
```

### Update to latest code

```bash
docker compose build --no-cache
docker compose up -d
```

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Vue 3, Vite, Pinia, TypeScript      |
| Testing   | Vitest, @vue/test-utils             |
| Backend   | Fastify, Dockerode, TypeScript, tsx |
| Packaging | npm workspaces (monorepo)           |
