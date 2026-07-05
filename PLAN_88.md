# PLAN 88 — Static LABS Visual Redesign

> Apple meets Nike meets Cyberpunk meets Batcave.  
> Clean glass. Dark panels. Electric precision.  
> This is what a local dev dashboard looks like when it means business.

---

## The Feeling

When someone opens Static LABS for the first time, they should feel like they just walked into a operations center that nobody else has.

Not a dev tool. A **command deck**.

Dark like a cockpit. Sharp like a blade. Glowing like something is always alive inside it.

Think:
- **Apple** → spacing that breathes, every element earns its place, nothing extra
- **Nike** → bold. confident. doesn't explain itself.
- **Cyberpunk** → electric neon lines, scan-line texture, HUD energy
- **Batcave** → you're looking at something that knows more than you do

---

## Color System

### Base (The Dark)
```
Background deep:    #050810   ← almost black, cold blue tint
Background panel:   #0C1120   ← dark navy glass
Background card:    #111827   ← slate dark
Border subtle:      #1E2D45   ← barely visible grid
Border glow:        #1F4ED8   ← electric blue on hover
```

### Neon Accents (The Pulse)
```
Electric Blue:      #3B82F6   ← primary accent, ports, links
Neon Cyan:          #06B6D4   ← running status, health OK
Neon Green:         #10B981   ← start button, active
Electric Purple:    #8B5CF6   ← skills, scan pulse
Neon Red:           #EF4444   ← stop, unhealthy, danger
Amber Warning:      #F59E0B   ← slow, warning states
```

### Glass Surface
```
Glass light:        rgba(255,255,255,0.03)
Glass border:       rgba(255,255,255,0.06)
Glass hover:        rgba(255,255,255,0.06)
Glass active:       rgba(59,130,246,0.08)
```

### Text
```
Primary:     #F8FAFC   ← near white
Secondary:   #94A3B8   ← cool slate
Muted:       #475569   ← dim, background labels
Accent:      #60A5FA   ← blue labels, port numbers
```

---

## Typography

No system fonts. We own the voice.

```
Display / Logo:    "Space Grotesk" — geometric, technical, confident
Body / UI:         "Inter" — clean, readable at small sizes
Mono / Ports:      "JetBrains Mono" — port numbers, paths, IDs
```

Sizes follow a tight scale — nothing larger than it needs to be.  
Port numbers get the mono treatment at `text-2xl font-black` — they're the headline of each card.

---

## Layout

### Top Bar — The Command Strip
```
┌────────────────────────────────────────────────────────────────────┐
│  ⚡ STATIC LABS          ○ 12 ports  ◈ 4 skills  ◎ last scan 2m   │
│                          [+ ADD]  [▶ RUN ALL]  [■ STOP]  [◎ SCAN] │
└────────────────────────────────────────────────────────────────────┘
```

- Sticky, `backdrop-blur-xl`, barely-there border bottom (`border-[#1E2D45]`)
- Logo: `⚡` icon in a gradient chip (green → cyan), "STATIC LABS" in Space Grotesk bold
- Stats float in pill chips — port count, skill count, last scan time
- Buttons are **icon-first**, small, no wasted chrome

### Grid — Icon-Forward Cards
Cards become **icon-forward**. The project icon is the star.

```
┌─────────────────────────────────┐
│  ┌───────┐   warlord        ●  │  ← running dot (neon cyan pulse)
│  │  🎨   │   node           ─  │  ← stack badge right
│  │  PNG  │                     │
│  └───────┘  :3101               │  ← port number, mono, bold, blue
│─────────────────────────────────│
│  C:\Users\malco\Documents\...   │  ← path, truncated, dim mono
│─────────────────────────────────│
│  [ ▶ START ]  [ ✎ ]  [ ⚙ ]  [ 🗑 ]  │
└─────────────────────────────────┘
```

- Card background: `glass panel` with subtle inner glow on hover
- Icon: `80×80` rounded-xl with a soft shadow halo matching stack color
- Running state: neon cyan dot pulses (CSS animation)
- Port number: `JetBrains Mono`, `text-2xl`, `text-blue-400` — the biggest text on the card
- Hover: entire card lifts slightly (`translateY(-2px)`), border shifts to electric blue glow

### Status Indicators — HUD Style
Replace text status badges with **dot + glow**:

```
● running    →  neon cyan dot, pulse animation
● unhealthy  →  neon red dot, fast pulse
● slow       →  amber dot, slow pulse  
○ idle       →  dim white dot, no animation
```

---

## Glass Effect — The Signature Move

Every surface is glass. Nothing is solid.

```css
.glass-card {
  background: rgba(12, 17, 32, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    0 0 0 1px rgba(59, 130, 246, 0.0),      /* base */
    inset 0 1px 0 rgba(255,255,255,0.05);   /* top edge catch */
}

.glass-card:hover {
  border-color: rgba(59, 130, 246, 0.3);
  box-shadow:
    0 0 20px rgba(59, 130, 246, 0.1),
    0 0 0 1px rgba(59, 130, 246, 0.2),
    inset 0 1px 0 rgba(255,255,255,0.08);
  transform: translateY(-2px);
}
```

The background behind the grid gets a very subtle radial gradient — like a soft light source coming from behind the screen.

---

## Neon Glow Buttons

Buttons glow. Not brightly. Subtly. Like they're powered.

```css
/* Run All */
.btn-run {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #10B981;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);
}
.btn-run:hover {
  background: rgba(16, 185, 129, 0.25);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
}

/* Stop All */
.btn-stop {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #EF4444;
}

/* Scan */
.btn-scan {
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.35);
  color: #8B5CF6;
}
```

No solid color fills. Light from within.

---

## Background Treatment

The page background is not just black. It has:

1. **Deep navy base** — `#050810`
2. **Radial glow behind the grid** — very subtle, centered, like a dim spotlight
3. **Grid lines** — 1px grid at `rgba(255,255,255,0.02)`, barely visible, gives the Batcave computer panel feel
4. **Scan line texture** — optional `0.5%` opacity repeating horizontal lines for the CRT terminal vibe

```css
body {
  background: #050810;
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.08), transparent),
    linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
  background-size: 100% 100%, 40px 40px, 40px 40px;
}
```

---

## Icon Treatment

Each project gets its AI-generated clay icon displayed large and centered at the top of the card.

- Size: `80×80` (up from current 40×40)
- Border radius: `16px` (rounded-2xl)
- Shadow: soft halo in the stack's accent color
- On hover: subtle scale `1.05`

Stack color halos:
```
node     →  rgba(34, 197, 94, 0.3)   green glow
python   →  rgba(234, 179, 8, 0.3)   yellow glow
golang   →  rgba(6, 182, 212, 0.3)   cyan glow
rust     →  rgba(249, 115, 22, 0.3)  orange glow
other    →  rgba(99, 102, 241, 0.25) purple glow
```

---

## Micro-Interactions

| Trigger | Animation |
|---|---|
| Card hover | `translateY(-2px)` + border glow fade in |
| Running dot | `pulse` keyframe, 2s loop, neon cyan |
| Scan button pressed | `Radar` icon spins + purple glow expands |
| Scan banner appears | Slides down from toolbar, `ease-out` 200ms |
| New project added | Card fades + scales in from `0.95` to `1.0` |
| Health check flash | Cards flash border briefly on result |

---

## Component Updates Needed

### 1. `App.tsx` — Global Background + Toolbar
- Replace `bg-gradient-to-br from-slate-900` with the grid + radial treatment
- Toolbar: increase blur, add bottom neon line `border-b border-[#1E2D45]`
- Buttons: swap to neon glow style

### 2. `ProjectGrid.tsx` — Card Redesign
- Glass card CSS
- Icon: `80×80`, halo shadow
- Port: `text-2xl font-black font-mono text-blue-400`
- Status: dot + pulse instead of badge
- Hover lift transition

### 3. `StatusSummary.tsx` — HUD Stats Strip
- Replace current summary cards with horizontal pill chips
- Each chip: dark glass, one number bold, one label dim

### 4. `EditProjectModal.tsx` / `AddProjectModal.tsx` — Glass Modals
- Backdrop: `bg-black/60 backdrop-blur-md`
- Modal surface: glass card treatment
- Inputs: `bg-[#0C1120] border-[#1E2D45] focus:border-blue-500/50`

---

## Fonts to Add

In `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

In `tailwind.config.js`:
```js
fontFamily: {
  sans: ['Inter', 'sans-serif'],
  display: ['Space Grotesk', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
```

---

## What Stays the Same

- React 18 + Vite + Tailwind CSS — no framework swap
- TanStack Query + auto-refresh — unchanged
- All API endpoints — unchanged
- All modal logic — unchanged
- All button actions — unchanged

Only the **skin** changes. The bones stay.

---

## What People Will Say

> "What is this?"  
> "Is this public?"  
> "This doesn't look like a dev tool."

That's the goal.

---

<!-- Malcolm — drop your notes below -->

---

*PLAN 88 — Static LABS visual direction.*
