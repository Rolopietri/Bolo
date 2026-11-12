-- Orden de las pastillas de Módulos en el Home de cocina.
-- Una sola fila (id = 1): el orden es del restaurante, compartido entre
-- dispositivos y usuarios de ese local.
--
-- Requiere la tabla public.restaurante_ajustes
-- (supabase/restaurante-ajustes.sql). No borra filas ni columnas.
--
-- orden_modulos es null cuando el local usa la disposición por defecto.
-- Si hay una disposición propia, es un objeto:
--   layout: orden de los bloques del Home. Cada item es { id, col }
--     col 0 = columna izquierda en escritorio, 1 = derecha.
--     En móvil se apilan en el orden del arreglo.
--   pastillas: orden de las pastillas dentro de cada casilla de Módulos.
--   {"layout":[{"id":"anillo","col":1},{"id":"aviso","col":0}],"pastillas":{"inventario":["stock","insumos"]}}
-- Un bloque o pastilla que no esté en la lista se muestra al final.
-- Los ocultos por flag no se muestran.
--
-- Las políticas RLS ya existentes cubren la fila completa, incluida esta
-- columna. No hace falta una política nueva:
--   ajustes_select  (select, authenticated, using true)
--   ajustes_insert  (insert, authenticated, with check true)
--   ajustes_update  (update, authenticated, using true, with check true)

alter table public.restaurante_ajustes
  add column if not exists orden_modulos jsonb;

comment on column public.restaurante_ajustes.orden_modulos is
  'Orden de las pastillas de Módulos en el Home de cocina, por grupo. Null = orden por defecto.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurante_ajustes_orden_modulos_objeto'
      and conrelid = 'public.restaurante_ajustes'::regclass
  ) then
    alter table public.restaurante_ajustes
      add constraint restaurante_ajustes_orden_modulos_objeto
      check (orden_modulos is null or jsonb_typeof(orden_modulos) = 'object');
  end if;
end $$;
