-- ============================================================
-- S30 Cosmic Companion — Supabase Schema
-- Cole isso no SQL Editor do Supabase e execute
-- ============================================================

-- Tabela de objetos celestes (catálogo do usuário)
create table if not exists objects (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  data        jsonb not null,  -- todo o objeto serializado
  updated_at  timestamptz default now()
);
alter table objects enable row level security;
create policy "users own objects" on objects
  for all using (auth.uid() = user_id);

-- Tabela de fotos/sessões (metadados sem o blob)
create table if not exists photos (
  id            bigserial primary key,
  local_id      bigint,         -- id do IndexedDB local (pra deduplicar)
  user_id       uuid references auth.users(id) on delete cascade not null,
  object_id     text not null,
  storage_path  text,           -- path no Supabase Storage (null se só sessão)
  data          jsonb not null, -- metadados (date, exposure, location, etc.)
  added_at      timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table photos enable row level security;
create policy "users own photos" on photos
  for all using (auth.uid() = user_id);

-- Índices úteis
create index if not exists photos_user_object on photos(user_id, object_id);
create index if not exists photos_local_id on photos(user_id, local_id);

-- Storage bucket (privado, acesso só via RLS)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict do nothing;

create policy "users own photo files" on storage.objects
  for all using (
    bucket_id = 'photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
