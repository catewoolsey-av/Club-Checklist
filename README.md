# AV Clubs — Club Assignment Tracker

Single-page web app for tracking the 9-deliverable launch checklist for each AV Club in Wave 3 (Apr 6 – Aug 31, 2026). Live data is stored in Supabase. Hosted on Netlify.

## Live site

Deployed automatically by Netlify from this repo's `main` branch. Push to `main` → live within ~30 seconds.

## File layout

This is intentionally simple. There is no framework or bundler. A tiny Node script generates browser-readable env config before deploy.

```
index.html        ← the entire app: HTML, CSS, JS, all in one file
netlify.toml      ← tells Netlify to publish the repo root as-is
env-config.js     ← generated from env vars; ignored by git
.env.local        ← local Supabase config; ignored by git
lib/              ← (optional) local jsPDF + autotable fallback files
README.md         ← this file
```

If a `lib/` folder is missing, the app still works and the PDF report button loads jsPDF from a CDN.

## How it's wired

- **Frontend:** Vanilla JS + the `@supabase/supabase-js` CDN bundle. No framework, no bundler.
- **Backend:** Supabase config is read from generated `env-config.js`, which is created from `.env.local` locally or Netlify environment variables in deploys. Row-level security (RLS) policies in Supabase decide who can read/write.

## Environment setup

Create `.env.local` from `.env.local.example`:

```sh
cp .env.local.example .env.local
```

Then fill in:

```sh
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

Generate the browser config before previewing locally:

```sh
node scripts/generate-env-config.mjs
```

Or start the local dev server, which generates the config first:

```sh
npm run dev
```

Then open `http://localhost:5173`.

On Netlify, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Site configuration → Environment variables. The configured build command generates `env-config.js` during deploy.

Because the app allows editing without sign-in, run `supabase-anon-write-policies.sql` once in the Supabase SQL Editor so anonymous browser writes are allowed for the tracker tables.

## Supabase schema

Two tables in the `public` schema power the tracker:

### `club_tracker_clubs`
| column | type | notes |
|---|---|---|
| `id` | bigint PK | |
| `position` | int | display order |
| `name` | text | club name |
| `type` | text | e.g. "Sector", "Geo/Identity" |
| `materials_date` | text | free-form date label, e.g. "Apr 6" |
| `first_meeting` | text | free-form date label |
| `collapsed` | bool | UI state |
| `archived_at` | timestamptz nullable | soft-delete |

### `club_tracker_assignments`
| column | type | notes |
|---|---|---|
| `id` | bigint PK | |
| `club_id` | bigint FK → clubs.id | |
| `position` | int | order within club |
| `name` | text | e.g. "One-Pager" |
| `description` | text | |
| `status` | text | "Not started" / "In progress" / "Done" |
| `rp` | text | responsible party |
| `due` | text | free-form ("Pre-launch") or `YYYY-MM-DD` |
| `done` | bool | |
| `notes` | text | |

## Common modifications

All edits happen in `index.html`. Search for the section header in comments.

| I want to… | Search for | What to change |
|---|---|---|
| Change the page title | `<title>` | Top of file |
| Change the subtitle | `class="subtitle"` | Line ~127 |
| Add a toolbar button | `class="toolbar"` | Line ~134; copy an existing `<button>` and wire to a new function |
| Change brand colors | `:root {` | CSS custom properties at the top of `<style>` |
| Add a new column to assignments | `mapAssignmentFromDb` + `render()` | Also add the column to Supabase via SQL Editor |
| Reset / re-seed clubs | `DEFAULT_CLUBS` | Used by `seedData()` only when DB is empty |

## Deploying changes

1. Edit `index.html` (or any file).
2. `git add -A && git commit -m "describe change" && git push`
3. Netlify auto-builds and deploys. Watch progress at app.netlify.com.

To preview locally before pushing: open `index.html` directly in your browser. Everything works without a server (Supabase is hit over HTTPS).

## Troubleshooting

- **"Loading data from server…" forever:** Supabase URL/key is wrong, or RLS is blocking reads. Open the browser console.
- **Edits don't save:** Supabase RLS is blocking anonymous writes, or the Supabase URL/key is wrong. Open the browser console.
- **PDF button errors:** The browser could not load jsPDF from the CDN. Add `lib/jspdf.umd.min.js` and `lib/jspdf.plugin.autotable.min.js` for a local fallback.
