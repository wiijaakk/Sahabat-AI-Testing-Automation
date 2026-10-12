# Sahabat sanity

Black-box helpers for `chat.sahabat-ai.com`. The site is Flutter Web, so we do not trust DOM ids. Helpers OCR the canvas, click by box, and keep screenshots so a human can review a run later.

## First slice

- Headed Chrome at 1440x900
- Login once into a local Chrome profile (`storage/chrome-profile`)
- Smoke: dashboard → Library → assert "AI Creations"
- Operator UI on localhost: sign in once, build and run cases, browse evidence shots

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Gemini is optional for this smoke. Library is a text label.

```bash
npm run dev
```

Open `http://localhost:5173`. Click **Sign in to Sahabat-AI** in the sidebar, finish login in the Chrome window, then open a case and **Run this case**. The library smoke is still available from the terminal with `npm run test:smoke`.

## Operator UI

React + Vite with Tailwind v4 (`@tailwindcss/vite`), `lucide-react` icons and Plus Jakarta Sans from Google Fonts. Logos in `src/operator/assets` are the Sahabat-AI mark from chat.sahabat-ai.com and the IOH logo from ioh.co.id. The look follows the Sahabat-AI product family: magenta accent, teal for pass, amber for warnings. Semantic colour tokens live in `src/operator/styles.css` as CSS variables mapped through `@theme inline`; dark mode keys off `html[data-theme]`, which follows the OS unless you pick a theme in the sidebar toggle.

- `src/operator/App.tsx` is the shell (status polling, job start, banners).
- `src/operator/views/` holds Catalog, Cases and Runs.
- `src/operator/components/` has the sidebar and small shared pieces.
- `src/operator/lib/` has API helpers, types, the step action table and the theme hook.

Or from the terminal:

```bash
npm run login
npm run test:smoke
```

## How a check is written

```ts
await sahabat.tap("Library");
await sahabat.see("AI Creations");
```

`tap` / `see` rescan the screen when the URL or pixels actually changed. `see` always saves a PNG for the gallery.
