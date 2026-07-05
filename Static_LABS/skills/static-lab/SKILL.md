---
name: static-lab
description: >
  Register any project into Static LABS — the local port management and health
  monitoring system. Detects the tech stack, generates a clean name, assigns a
  port, and confirms registration. Use this skill whenever the user says "add to
  static", "register project", "add to lab", "static lab", "register in static
  labs", "add this project to static labs", "give this a port", "add to the
  lab", "register this", "hook this up to static", "put this in the dashboard",
  or any request to register a project directory with Static LABS for port
  management. Also trigger when the user is in a new project directory and wants
  it tracked, monitored, or given a port assignment.
---

# Static Lab — Project Registration Skill

Register the current working directory as a project in Static LABS, the
centralized port management and health monitoring dashboard.

## What this skill does

1. Detects the project's tech stack from indicator files
2. Generates a clean kebab-case project name from the folder name
3. Registers the project with the Static LABS API
4. Auto-assigns the next available port
5. Reports the assigned port and links to the dashboard

## Step-by-step workflow

### Step 1: Detect tech stack

Check the current working directory for these indicator files (in priority order):

| File                | Stack     |
|---------------------|-----------|
| `package.json`      | node      |
| `requirements.txt`  | python    |
| `Pipfile`           | python    |
| `pyproject.toml`    | python    |
| `go.mod`            | golang    |
| `Cargo.toml`        | rust      |
| `*.sln`             | dotnet    |
| `pom.xml`           | java      |
| `build.gradle`      | java      |
| `mix.exs`           | elixir    |
| `Gemfile`           | ruby      |
| `index.html` (only) | static    |

If multiple indicators are found, use `mixed`. If none are found, use `other`.

If `package.json` exists, read it to check for framework hints:
- If it has `next` in dependencies → the project is a Next.js app
- If it has `vite` or `@vitejs/plugin-react` → React/Vite app
- If it has `express` → Express server (likely has a health endpoint)

### Step 2: Generate project name

Take the current directory's folder name and convert it to a clean kebab-case
slug:

- Lowercase everything
- Replace spaces, underscores, and special characters with hyphens
- Collapse multiple hyphens into one
- Trim leading/trailing hyphens

Examples:
- `My Cool App` → `my-cool-app`
- `VideoColorTool` → `video-color-tool` (split on camelCase boundaries)
- `stashhouse-gallery` → `stashhouse-gallery` (already clean)
- `ROGER V001` → `roger-v001`

If the user provides a preferred name, use that instead.

### Step 3: Detect health check URL

If the project has an Express server or a `server.js`/`server/index.js` file,
assume a health endpoint exists. Construct the health check URL using the port
that will be assigned:

- Default pattern: `http://localhost:<port>/health`
- For Next.js apps: `http://localhost:<port>/api/health`
- If no server is detected, leave healthCheckUrl empty

You can also ask the user if they have a health endpoint, but don't block on it
— an empty health check URL is fine, the project just won't get health
monitoring.

### Step 4: Register the project

**Static LABS API base:** `http://localhost:3001`

First, check that the Static LABS backend is running:

```bash
curl -s http://localhost:3001/api/dashboard
```

If it's not running, tell the user:
> Static LABS backend isn't running. Start it with:
> ```
> cd C:\Users\malco\Documents\Static_LABS\Static_LABS\port-manager && npm run dev
> ```

If it is running, register the project:

```bash
curl -s -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<project-name>",
    "techStack": "<detected-stack>",
    "folderPath": "<absolute-path-to-project>",
    "healthCheckUrl": "<health-url-or-empty>"
  }'
```

The response gives you the `projectId` in `data.id`.

### Step 5: Assign a port

```bash
curl -s -X POST http://localhost:3001/api/ports/assign \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<project-id>",
    "preferredPort": null
  }'
```

If the user asked for a specific port, pass it as `preferredPort` instead of
null. The response gives you the assigned port in `data.assignedPort`.

### Step 6: Report back

After successful registration, report to the user in this format:

```
Project registered in Static LABS:

  Name:      <project-name>
  Stack:     <tech-stack>
  Port:      :<assigned-port>
  Folder:    <folder-path>
  Health:    <health-url or "not configured">

  Dashboard: http://localhost:5173
  Direct:    http://localhost:<assigned-port>
```

## Handling edge cases

- **Project already registered:** If the POST returns an error about a duplicate
  name, tell the user the project is already in Static LABS and offer to open the
  dashboard or update it instead.
- **No ports available:** If port assignment fails with "No available ports",
  tell the user the port pool (3100-3199) is full and suggest releasing unused
  ports from the dashboard.
- **User wants a specific port:** If the user says something like "give it port
  3150", pass that as `preferredPort`.
- **User wants to name it:** If the user says "call it my-app", use that name
  instead of auto-generating.
- **Backend not running:** Guide the user to start it (see Step 4).

## API Reference

| Endpoint                        | Method | Purpose                    |
|---------------------------------|--------|----------------------------|
| `/api/projects`                 | POST   | Register a new project     |
| `/api/ports/assign`             | POST   | Assign a port to a project |
| `/api/ports/next-available`     | GET    | Preview next available port|
| `/api/projects`                 | GET    | List all projects          |
| `/api/dashboard`                | GET    | Full dashboard data        |
| `/api/projects/:id`             | PATCH  | Update project details     |
