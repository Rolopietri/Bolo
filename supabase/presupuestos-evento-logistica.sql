-- Presupuestos — campos de logística del evento
-- Ejecuta este SQL en: Supabase → SQL Editor → New query
-- Aditivo e idempotente: NO toca datos existentes.
--
-- Agrega:
--   cantidad_personas  → nº de personas esperadas en el evento
--   montaje_fecha/hora → fecha y horario de montaje (T&C del PDF)
--   desmontaje_fecha/hora → fecha y horario de desmontaje (T&C del PDF)
-- Si montaje/desmontaje quedan en NULL, el PDF cae a la fecha/hora del evento.

alter table public.presupuestos
  add column if not exists cantidad_personas int,
  add column if not exists montaje_fecha date,
  add column if not exists montaje_hora text,
  add column if not exists desmontaje_fecha date,
  add column if not exists desmontaje_hora text;
