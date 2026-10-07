-- documents 테이블 생성 (A/B 격리 검증용)
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text,
  created_at timestamptz not null default now()
);

-- RLS 활성화
alter table public.documents enable row level security;

-- 정책 1: 본인 것만 SELECT
create policy "select own documents"
  on public.documents
  for select
  to authenticated
  using (auth.uid() = owner_id);

-- 정책 2: 본인 소유로만 INSERT
create policy "insert own documents"
  on public.documents
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

-- 정책 3: 본인 것만 UPDATE
create policy "update own documents"
  on public.documents
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 정책 4: 본인 것만 DELETE
create policy "delete own documents"
  on public.documents
  for delete
  to authenticated
  using (auth.uid() = owner_id);