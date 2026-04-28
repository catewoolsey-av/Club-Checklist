alter table public.club_tracker_clubs enable row level security;
alter table public.club_tracker_assignments enable row level security;

drop policy if exists "public can read club tracker clubs" on public.club_tracker_clubs;
drop policy if exists "public can insert club tracker clubs" on public.club_tracker_clubs;
drop policy if exists "public can update club tracker clubs" on public.club_tracker_clubs;
drop policy if exists "public can delete club tracker clubs" on public.club_tracker_clubs;

create policy "public can read club tracker clubs"
  on public.club_tracker_clubs for select
  to anon, authenticated
  using (true);

create policy "public can insert club tracker clubs"
  on public.club_tracker_clubs for insert
  to anon, authenticated
  with check (true);

create policy "public can update club tracker clubs"
  on public.club_tracker_clubs for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "public can delete club tracker clubs"
  on public.club_tracker_clubs for delete
  to anon, authenticated
  using (true);

drop policy if exists "public can read club tracker assignments" on public.club_tracker_assignments;
drop policy if exists "public can insert club tracker assignments" on public.club_tracker_assignments;
drop policy if exists "public can update club tracker assignments" on public.club_tracker_assignments;
drop policy if exists "public can delete club tracker assignments" on public.club_tracker_assignments;

create policy "public can read club tracker assignments"
  on public.club_tracker_assignments for select
  to anon, authenticated
  using (true);

create policy "public can insert club tracker assignments"
  on public.club_tracker_assignments for insert
  to anon, authenticated
  with check (true);

create policy "public can update club tracker assignments"
  on public.club_tracker_assignments for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "public can delete club tracker assignments"
  on public.club_tracker_assignments for delete
  to anon, authenticated
  using (true);

