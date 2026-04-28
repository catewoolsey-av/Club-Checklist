# AV Clubs — Club Assignment Tracker

Single-page web app for tracking the 9-deliverable launch checklist for each AV Club in Wave 3 (Apr 6 – Aug 31, 2026). Live data is stored in Supabase. Hosted on Netlify.

## Live site

Deployed automatically by Netlify from this repo's `main` branch. Push to `main` → live within ~30 seconds.

## File layout

This is intentionally simple. There is no build step.

```
index.html        ← the entire app: HTML, CSS, JS, all in one file
netlify.toml      ← tells Netlify to publish the repo root as-is
lib/              ← (optional) jsPDF + autotable for PDF report generation
README.md         ← this file
```

If a `lib/` folder is missing, the app still works — only the "Generate Report (PDF)" button needs it.

## How it's wired

- **Frontend:** Vanilla JS + the `@supabase/supabase-js` CDN bundle. No framework, no bundler.
- **Backend:** Supabase project `bcqmkuyzaaxpacjmpygv` (URL hardcoded in `index.html`). The anon/publishable key is also hardcoded — this is safe; row-level security (RLS) policies in Supabase decide who can read/write.
- **Auth:** Supabase magic-link email OTP. Anyone can view; only emails listed in `ALLOWED_EDITORS` (in `index.html`) can edit. Currently: `mike@av.vc`, `emily@av.vc`.

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

### `suggestions` (added for the Suggestion Log feature)
| column | type | notes |
|---|---|---|
| `id` | bigserial PK | |
| `created_at` | timestamptz default now() | |
| `body` | text | the suggestion |
| `category` | text nullable | e.g. "bug", "idea" |
| `author_email` | text nullable | optional |
| `status` | text default `'new'` | `new` / `triaged` / `done` / `wontfix` |

See the **Suggestion Log** section below for the SQL to create this table.

## Common modifications

All edits happen in `index.html`. Search for the section header in comments.

| I want to… | Search for | What to change |
|---|---|---|
| Add/remove an editor | `ALLOWED_EDITORS` | Edit the array of emails (line ~1286) |
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

## Suggestion Log

Users can submit suggestions/bugs/ideas via the **💡 Suggest** button in the toolbar. Submissions are written to the `public.suggestions` table in Supabase. Editors (logged-in `ALLOWED_EDITORS`) can view all suggestions via the **View Suggestions** button.

### One-time setup: create the table

Open the Supabase SQL Editor for project `bcqmkuyzaaxpacjmpygv` and run:

```sql
create table if not exists public.suggestions (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  body text not null,
  category text,
  author_email text,
  status text not null default 'new'
);

alter table public.suggestions enable row level security;

-- Anyone (anon or signed-in) can submit a suggestion
create policy "anyone can insert suggestions"
  on public.suggestions for insert
  to anon, authenticated
  with check (true);

-- Only signed-in users can read suggestions
create policy "authenticated can read suggestions"
  on public.suggestions for select
  to authenticated
  using (true);

-- Only signed-in users can update status
create policy "authenticated can update suggestions"
  on public.suggestions for update
  to authenticated
  using (true)
  with check (true);
```

Once the table exists, the buttons in the app start working immediately. No deploy needed.

## Troubleshooting

- **"Loading data from server…" forever:** Supabase URL/key is wrong, or RLS is blocking reads. Open the browser console.
- **Edits don't save:** You're not signed in as an editor. Check the auth pill in the toolbar.
- **PDF button errors:** `lib/jspdf.umd.min.js` and `lib/jspdf.plugin.autotable.min.js` are missing.
- **Suggestion submit fails:** The `suggestions` table doesn't exist yet, or its insert policy is missing. Run the SQL above.
