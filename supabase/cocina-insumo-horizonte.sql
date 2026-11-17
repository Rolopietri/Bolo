-- Cocina · Horizonte de planificación por insumo (Fase C — plan por demanda)
-- ════════════════════════════════════════════════════════════════════
-- Cada insumo que se procesa puede tener su propio horizonte de planificación
-- (días hacia adelante que el plan por demanda debe cubrir). Decisión de diseño:
-- "horizonte distinto por insumo". Si queda en null, el cálculo usa 14 por
-- defecto. Aditivo e idempotente, sin pérdida de datos. RLS de insumos intacta.

alter table public.insumos
  add column if not exists horizonte_dias integer;

comment on column public.insumos.horizonte_dias is
  'Horizonte de planificación en días para el plan por demanda (Fase C). null = usar el valor por defecto (14).';

-- No negativo (idempotente).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'insumos_horizonte_dias_positivo'
  ) then
    alter table public.insumos
      add constraint insumos_horizonte_dias_positivo
      check (horizonte_dias is null or horizonte_dias > 0);
  end if;
end $$;
