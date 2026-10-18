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

## Scan screens

**Scan screens** in the Catalog tab walks the pages the cases use and harvests every control Flutter exposes on each one. The list of screens lives in `vocab/scan-plan.json`. Each screen is a few case steps run from the dashboard (tap Library, tap Your Uploads, …), so a screen you need can be added without touching code. Dialogs and menus count as screens too: Create Project, the project menu, Edit Project, the Project Files sheet.

After the walk the catalog is retagged: every saved control gets a `screens` list with the screen ids it was found on. The Catalog tab shows one tab per screen, and pinning from a screen tags the control with it. The control picker in Cases groups by those screens.

A screen the scan cannot reach is **skipped**, not failed. The tab turns amber and tells you what the screen needs. Rescan just that screen with the small refresh button next to its tab, or from the terminal. A rescan only replaces the screens it visits; the rest keep their last result, and a scan that dies because Chrome was closed stops right there instead of marking every remaining screen skipped.

```bash
npm run scan                      # every screen
npm run scan -- library aistorage # only these screen ids
```

### Scan account setup

The scan logs in with the saved Chrome profile, so that account has to hold a few things or the deeper screens are skipped. Names come from `fixtures` in `vocab/scan-plan.json`.

| Needed by | What the account must hold | How to make it |
| --- | --- | --- |
| AiStorage project, project menu, Edit Project, Project Files sheet | A project named `SANITY_SCAN_PROJECT` | Run the **scan-setup** case |
| AiStorage Project Files sheet with a file row | A file `SANITY_SCAN_FILE` inside that project | Run the **scan-setup** case, or **scan-setup-file** if the project already exists |
| Library AI creation open | An AI creation named `SANITY-SCAN-CREATION` under Library › AI Creations | Run the **scan-setup** case. It asks the chat for a CSV called SANITY_SCAN_CREATION; the product saves it as `SANITY-SCAN-CREATION.csv` with hyphens, which is why the plan uses the hyphen form. If the chat names the file differently, change `creation` in the plan |
| Library upload open, upload menu | An upload named `SANITY_SCAN_UPLOAD` under Library › Your Uploads | Run the **scan-setup-upload** case. It attaches the file through the chat `+` button; if that button opens a menu instead of a file picker, attach `test-data/SANITY_SCAN_UPLOAD.pdf` by hand once |

Leave these items in the account. The scan only opens them; no scan screen creates, renames or deletes anything. The run cases use their own names (`SANITY_P`, `SANITY_DELETE_LIBRARY`, …) so they never touch the scan fixtures.

One screen stays skipped until a human pins an unnamed icon on the screen before it: **Library · upload menu** needs `Asset Menu` pinned from **Library · upload open**. Pin, then rescan that one screen. There is no file menu in the Project Files sheet: the only control on a file row is **Delete File**, a trash icon that deletes without confirmation, so no scan screen taps it.

### What the run cases need in the account

The scan fixtures above are separate from what the cases themselves consume. Before a full case run the account also needs:

- **favorite-project** a project named `testing` (favorite is toggled on it, nothing else changes).
- **open-library-assets** an AI creation `SANITY-SCAN-CREATION` under Library › AI Creations.
- **project-chat-summary** nothing; it creates its own project `new_aurora` and uploads `test-data/project-aurora.txt`. The project is never deleted, so clear it by hand before a rerun.

## Evidence screenshots

Locators work on 1440x900 CSS pixels. Two optional `.env` settings only change what gets saved:

- `SAHABAT_SHOT_DPR=2` launches Chrome at 2x and saves evidence PNGs at 2880x1800, so the gallery stays sharp on Retina screens. Boxes in `manifest.json` are in image pixels.
- `SAHABAT_REDACT=x,y,w,h;x,y,w,h` paints those page areas white in every saved screenshot. Use it for the account phone number in the profile card, so shared evidence does not leak it.

## How a check is written

```ts
await sahabat.tap("Library");
await sahabat.see("AI Creations");
```

`tap` / `see` rescan the screen when the URL or pixels actually changed. `see` always saves a PNG for the gallery.
