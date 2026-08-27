-- Run this once in Supabase Dashboard -> SQL Editor.
create table if not exists public.pdfs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  semester text not null default 'Semester 1',
  description text default '',
  drive_url text not null,
  file_type text not null default 'pdf',
  created_at timestamptz not null default now(),
  views integer not null default 0
);

-- Ensure semester and file_type columns exist if table already created
alter table public.pdfs add column if not exists semester text not null default 'Semester 1';
alter table public.pdfs add column if not exists file_type text not null default 'pdf';

create index if not exists pdfs_subject_idx on public.pdfs(subject);
create index if not exists pdfs_semester_idx on public.pdfs(semester);
create index if not exists pdfs_file_type_idx on public.pdfs(file_type);
create index if not exists pdfs_created_at_idx on public.pdfs(created_at desc);

alter table public.pdfs enable row level security;

-- Public users can read the library.
drop policy if exists "Public can read PDFs" on public.pdfs;
create policy "Public can read PDFs"
on public.pdfs for select
to anon, authenticated
using (true);

-- Public users can upload/insert resources.
drop policy if exists "Public can insert PDFs" on public.pdfs;
create policy "Public can insert PDFs"
on public.pdfs for insert
to anon, authenticated
with check (true);

-- Only authenticated Supabase users can update PDFs.
drop policy if exists "Authenticated can update PDFs" on public.pdfs;
create policy "Authenticated can update PDFs"
on public.pdfs for update
to authenticated
using (true)
with check (true);

-- Only authenticated Supabase users can delete PDFs.
drop policy if exists "Authenticated can delete PDFs" on public.pdfs;
create policy "Authenticated can delete PDFs"
on public.pdfs for delete
to authenticated
using (true);

-- RPC for public view counting without exposing update permission.
create or replace function public.increment_pdf_view(pdf_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pdfs
  set views = views + 1
  where id = pdf_id;
$$;

grant execute on function public.increment_pdf_view(uuid) to anon, authenticated;
