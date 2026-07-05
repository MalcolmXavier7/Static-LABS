# Static LABS — Feature Roadmap

**The best next additions.** Each feature earns its place by building on infrastructure that already exists.

| # | Feature | Why it belongs here |
|---|---------|---------------------|
| 1 | **Log viewer panel** — tap any running card to see its last 200 lines of stdout/stderr | API already captures logs, just needs a slide-in panel |
| 2 | **Uptime timer** — `↑ 2h 14m` on running cards | You can see at a glance what's been stable vs what just restarted |
| 3 | **Cmd+K project search** — keyboard overlay to jump to any project by name | 29+ projects, you need speed |
| 4 | **Quick scripts** — run `dev`, `build`, `test` from each card without a terminal | Manifest already has `scripts` fields, just needs a UI |
| 5 | **Dark mode toggle** — the Batcave mode from PLAN 88 | One button in the header to flip to the dark glass variant |
| 6 | **Response time badge** — `38ms` chip on running cards at a glance | Already available from health data |
| 7 | **Port conflict warning** — detect when the OS already has a process on a project's assigned port | Prevents "why won't it start" confusion |
| 8 | **One-click Netlify/Vercel deploy** — push a project live from the card | Vercel MCP is already connected |
| 9 | **Notes per project** — quick scratchpad that writes to `static.project.json` notes field | Manifest already has the `notes` field |
| 10 | **Screenshot capture** — auto-screenshot each running project and show as card thumbnail | Replace the building with the actual running UI |
