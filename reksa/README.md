# Sahabat sanity (reksa)

Black-box helpers for `chat.sahabat-ai.com`. The site is Flutter Web, so we do not trust DOM ids. Helpers OCR the canvas, click by box, and keep screenshots so a human can review a run later.

## First slice

- Headed Chrome at 1440x900
- Login once into a local Chrome profile (`storage/chrome-profile`)
- Smoke: dashboard → Library → assert "AI Creations"
- Operator UI on localhost: save login, run smoke, browse evidence shots

## Setup

```bash
cd reksa
npm install
npx playwright install chromium
cp .env.example .env
```

Gemini is optional for this smoke. Library is a text label.

```bash
npm run dev
```

Open `http://localhost:5173`. Click **Save login**, finish login in the Chrome window, then **Run library smoke**.

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
