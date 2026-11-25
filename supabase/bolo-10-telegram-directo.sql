-- ═══════════════════════════════════════════════════════════════════
-- BOLO-10 · Telegram directo: sin aprobación
-- ═══════════════════════════════════════════════════════════════════
-- Lo que el equipo escribe en el grupo se registra al instante:
--   • "Entrando 8 kg lomito"  → sale del almacén y queda un lote EN LA MESA
--                               (procesamientos_abiertos). Marca el insumo
--                               como "se procesa".
--   • "Saliendo 6 kg lomito"  → cierra el lote: 6 kg pasan a EN USO
--                               (stock_procesado), la diferencia queda como
--                               merma y el lote entra al historial
--                               (procesamientos), como antes.
--                               Sin entrada abierta, se rechaza.
--   • "Saliendo 12 plátanos"  → producto que no se procesa: sale del almacén
--                               directo a EN USO (stock_procesado) y queda
--                               marcado como "se usa por lotes".
-- El bot responde en el grupo con lo que hizo (lo arma la ruta del webhook
-- con el resultado de estas funciones).
--
-- Los lotes abiertos van en una tabla aparte porque `procesamientos` exige
-- procesado y merma, y otras pantallas lo leen así.
--
-- Las ventas que no encuentran nada EN USO descuentan del almacén y dejan un
-- aviso para confirmar (avisos_inventario): eso vive en
-- cocina-zzz-motor-canonico.sql.
--
-- Requiere BOLO-06, BOLO-07 (Telegram) y cocina-insumo-dos-estados.
-- Aditivo e idempotente. No borra datos.

-- ─── Columnas y tablas ─────────────────────────────────────────────────
alter table public.insumos
  add column if not exists se_usa_por_lotes boolean not null default false;
comment on column public.insumos.se_usa_por_lotes is
  'Producto que no se procesa pero se saca del almacén por lotes (ej. 12 plátanos). Su stock_procesado es lo que está EN USO.';

create table if not exists public.procesamientos_abiertos (
  id           uuid primary key default gen_random_uuid(),
  insumo_id    uuid not null references public.insumos(id) on delete cascade,
  crudo        numeric not null check (crudo > 0),
  responsable  text,
  origen       text not null default 'telegram',
  pendiente_id uuid references public.produccion_pendientes(id) on delete set null,
  abierto_at   timestamptz not null default now()
);
create index if not exists procesamientos_abiertos_insumo_idx
  on public.procesamientos_abiertos (insumo_id, abierto_at);
alter table public.procesamientos_abiertos enable row level security;
drop policy if exists proca_select on public.procesamientos_abiertos;
create policy proca_select on public.procesamientos_abiertos for select to authenticated using (true);

create table if not exists public.avisos_inventario (
  id           uuid primary key default gen_random_uuid(),
  insumo_id    uuid not null references public.insumos(id) on delete cascade,
  venta_id     uuid,
  tipo         text not null default 'venta_sin_uso' check (tipo in ('venta_sin_uso')),
  cantidad     numeric not null,
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'error')),
  created_at   timestamptz not null default now(),
  resuelto_por uuid,
  resuelto_at  timestamptz
);
create index if not exists avisos_inventario_estado_idx on public.avisos_inventario (estado, created_at);
create index if not exists avisos_inventario_venta_idx on public.avisos_inventario (venta_id);
alter table public.avisos_inventario enable row level security;
drop policy if exists avinv_select on public.avisos_inventario;
drop policy if exists avinv_update on public.avisos_inventario;
create policy avinv_select on public.avisos_inventario for select to authenticated using (true);
create policy avinv_update on public.avisos_inventario for update to authenticated using (true) with check (true);

alter table public.produccion_pendientes add column if not exists resultado jsonb;
alter table public.produccion_pendientes add column if not exists aplicado_at timestamptz;
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.produccion_pendientes'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%estado%'
  loop
    execute format('alter table public.produccion_pendientes drop constraint %I', c);
  end loop;
  alter table public.produccion_pendientes add constraint produccion_pendientes_estado_check
    check (estado in ('pendiente', 'aprobado', 'descartado', 'aplicado', 'rechazado'));
end $$;

-- ─── Pasos del registro (internos) ─────────────────────────────────────
create or replace function public._prod_hoy()
returns date language sql stable as $$ select (now() at time zone 'America/Caracas')::date $$;

-- Entrada: sale del almacén y abre un lote en la mesa.
create or replace function public._prod_entrada(
  p_insumo uuid, p_crudo numeric, p_responsable text, p_origen text, p_pendiente uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.insumos; v_lote uuid;
begin
  if p_crudo is null or p_crudo <= 0 then
    return jsonb_build_object('ok', false, 'tipo', 'entrada', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'entrada', 'error', 'insumo'); end if;
  perform set_config('bolo.motivo', 'procesamiento_entrada', true);
  update public.insumos
     set stock_actual = greatest(0, coalesce(stock_actual, 0) - p_crudo),
         se_procesa = true
   where id = p_insumo;
  insert into public.procesamientos_abiertos (insumo_id, crudo, responsable, origen, pendiente_id)
  values (p_insumo, p_crudo, nullif(btrim(coalesce(p_responsable, '')), ''), coalesce(p_origen, 'telegram'), p_pendiente)
  returning id into v_lote;
  return jsonb_build_object(
    'ok', true, 'tipo', 'entrada', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'crudo', p_crudo, 'almacen_antes', coalesce(r.stock_actual, 0),
    'faltaba', p_crudo > coalesce(r.stock_actual, 0) + 0.00005,
    'marcado_procesa', not coalesce(r.se_procesa, false), 'lote_id', v_lote);
end $$;

-- Salida: cierra el lote abierto más antiguo del insumo.
create or replace function public._prod_salida(
  p_insumo uuid, p_procesado numeric, p_responsable text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.insumos; lo public.procesamientos_abiertos; v_merma numeric; v_porc numeric; v_fecha date := public._prod_hoy();
begin
  if p_procesado is null or p_procesado < 0 then
    return jsonb_build_object('ok', false, 'tipo', 'salida', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'salida', 'error', 'insumo'); end if;
  select * into lo from public.procesamientos_abiertos
   where insumo_id = p_insumo order by abierto_at asc limit 1 for update;
  if not found then
    return jsonb_build_object('ok', false, 'tipo', 'salida', 'error', 'sin_entrada',
      'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base, 'procesado', p_procesado);
  end if;
  if p_procesado > lo.crudo + 0.00005 then
    return jsonb_build_object('ok', false, 'tipo', 'salida', 'error', 'mas_que_entrada',
      'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base, 'procesado', p_procesado, 'crudo', lo.crudo);
  end if;
  v_merma := lo.crudo - p_procesado;
  v_porc := case when lo.crudo > 0 then v_merma / lo.crudo * 100 else 0 end;
  perform set_config('bolo.motivo', 'procesamiento', true);
  update public.insumos set stock_procesado = coalesce(stock_procesado, 0) + p_procesado where id = p_insumo;
  if v_merma > 0 then
    insert into public.stock_movimientos (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values (p_insumo, 'merma', 'total', -v_merma, 'Procesamiento', v_fecha,
            'Lote ' || case when lo.origen = 'telegram' then 'desde Telegram' else 'de producción' end);
  end if;
  insert into public.procesamientos (insumo_id, fecha, crudo, procesado, merma_porc, nota, responsable, origen, created_by)
  values (p_insumo, v_fecha, lo.crudo, p_procesado, v_porc, null,
          coalesce(lo.responsable, nullif(btrim(coalesce(p_responsable, '')), '')),
          case when lo.origen in ('manual', 'escaneo', 'telegram') then lo.origen else 'telegram' end, auth.uid());
  delete from public.procesamientos_abiertos where id = lo.id;
  return jsonb_build_object(
    'ok', true, 'tipo', 'salida', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'crudo', lo.crudo, 'procesado', p_procesado, 'merma', v_merma, 'merma_porc', round(v_porc, 1),
    'estandar', r.merma_coccion_porc);
end $$;

-- Uso por unidad: del almacén directo a EN USO.
create or replace function public._prod_uso(
  p_insumo uuid, p_cantidad numeric
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.insumos;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'tipo', 'uso', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'uso', 'error', 'insumo'); end if;
  perform set_config('bolo.motivo', 'en_uso', true);
  update public.insumos
     set stock_actual = greatest(0, coalesce(stock_actual, 0) - p_cantidad),
         stock_procesado = coalesce(stock_procesado, 0) + p_cantidad,
         se_usa_por_lotes = true
   where id = p_insumo;
  return jsonb_build_object(
    'ok', true, 'tipo', 'uso', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'cantidad', p_cantidad, 'almacen_antes', coalesce(r.stock_actual, 0),
    'faltaba', p_cantidad > coalesce(r.stock_actual, 0) + 0.00005);
end $$;

-- Aplica una lista de acciones y deja el resultado en el mensaje.
-- p_acciones: [{tipo: entrada|salida|completo|uso, insumo_id, crudo?, procesado?, cantidad?}]
-- (cantidades en la unidad base del insumo).
create or replace function public._prod_aplicar(
  p_pendiente uuid, p_acciones jsonb, p_responsable text, p_origen text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a jsonb; res jsonb := '[]'::jsonb; r jsonb; r1 jsonb; v_ins uuid; hubo_ok boolean := false;
begin
  for a in select * from jsonb_array_elements(coalesce(p_acciones, '[]'::jsonb)) loop
    v_ins := nullif(a ->> 'insumo_id', '')::uuid;
    case a ->> 'tipo'
      when 'entrada' then
        r := public._prod_entrada(v_ins, (a ->> 'crudo')::numeric, p_responsable, p_origen, p_pendiente);
      when 'salida' then
        r := public._prod_salida(v_ins, (a ->> 'procesado')::numeric, p_responsable);
      when 'completo' then
        r1 := public._prod_entrada(v_ins, (a ->> 'crudo')::numeric, p_responsable, p_origen, p_pendiente);
        if (r1 ->> 'ok')::boolean then
          r := public._prod_salida(v_ins, (a ->> 'procesado')::numeric, p_responsable)
               || jsonb_build_object('tipo', 'completo', 'faltaba', r1 -> 'faltaba',
                                     'almacen_antes', r1 -> 'almacen_antes', 'marcado_procesa', r1 -> 'marcado_procesa');
          if not (r ->> 'ok')::boolean then
            -- La salida no pasó (más que la entrada): se deshace la entrada recién abierta.
            perform set_config('bolo.motivo', 'procesamiento_revertido', true);
            update public.insumos set stock_actual = coalesce(stock_actual, 0) + (a ->> 'crudo')::numeric where id = v_ins;
            delete from public.procesamientos_abiertos where id = (r1 ->> 'lote_id')::uuid;
          end if;
        else
          r := r1;
        end if;
      when 'uso' then
        r := public._prod_uso(v_ins, (a ->> 'cantidad')::numeric);
      else
        r := jsonb_build_object('ok', false, 'tipo', a ->> 'tipo', 'error', 'tipo');
    end case;
    if (r ->> 'ok')::boolean then hubo_ok := true; end if;
    res := res || jsonb_build_array(r);
  end loop;
  if p_pendiente is not null then
    update public.produccion_pendientes
       set estado = case when hubo_ok then 'aplicado' else 'rechazado' end,
           resultado = res, aplicado_at = now()
     where id = p_pendiente;
  end if;
  return res;
end $$;

-- ─── Entradas públicas ─────────────────────────────────────────────────
-- Para el bot (sin sesión): valida la clave secreta del webhook.
create or replace function public.telegram_contexto(p_secreto text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.produccion_telegram;
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  return jsonb_build_object('insumos', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'unidadBase', unidad_base,
                                        'seProcesa', coalesce(se_procesa, false)))
      from public.insumos where activo), '[]'::jsonb));
end $$;

create or replace function public.telegram_aplicar(
  p_secreto text, p_pendiente uuid, p_acciones jsonb, p_responsable text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.produccion_telegram;
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  return public._prod_aplicar(p_pendiente, p_acciones, p_responsable, 'telegram');
end $$;

-- Para la app (con sesión): aplicar mensajes que quedaron de antes del cambio.
create or replace function public.produccion_aplicar(
  p_pendiente uuid, p_acciones jsonb, p_responsable text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  return public._prod_aplicar(p_pendiente, p_acciones, p_responsable, 'telegram');
end $$;

-- Marca un mensaje que no llevó a ningún movimiento (no se reconoció nada).
create or replace function public.telegram_marcar(
  p_secreto text, p_pendiente uuid, p_estado text, p_resultado jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.produccion_telegram;
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  update public.produccion_pendientes
     set estado = case when p_estado in ('rechazado', 'descartado') then p_estado else 'rechazado' end,
         resultado = p_resultado, aplicado_at = now()
   where id = p_pendiente;
end $$;

-- ─── telegram_recibir_interno: ahora devuelve el mensaje guardado ──────
-- Igual que en BOLO-07, pero al guardar devuelve id, texto, remitente, foto y
-- message_id, para que la ruta lo aplique y responda en el grupo.
create or replace function public.telegram_recibir_interno(p_secreto text, p_update jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c produccion_telegram;
  m jsonb;
  txt text;
  foto text;
  chat bigint;
  nombre text;
  v_id uuid;
begin
  select * into c from produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    return jsonb_build_object('accion', 'rechazado');
  end if;
  m := p_update -> 'message';
  if m is null then return jsonb_build_object('accion', 'ignorado'); end if;
  chat := (m -> 'chat' ->> 'id')::bigint;
  txt := coalesce(m ->> 'text', m ->> 'caption');

  if m ? 'migrate_to_chat_id' and chat = c.chat_id then
    update produccion_telegram set chat_id = (m ->> 'migrate_to_chat_id')::bigint, actualizado = now() where id = 1;
    return jsonb_build_object('accion', 'migrado');
  end if;

  if txt ~* '^/vincular(@\S+)?(\s|$)' then
    if upper(btrim(regexp_replace(txt, '^/vincular(@\S+)?', '', 'i'))) = c.codigo then
      update produccion_telegram
         set chat_id = chat,
             chat_titulo = coalesce(m -> 'chat' ->> 'title', m -> 'from' ->> 'first_name'),
             actualizado = now()
       where id = 1;
      return jsonb_build_object('accion', 'vinculado', 'token', c.bot_token, 'chat_id', chat);
    end if;
    return jsonb_build_object('accion', 'codigo_invalido', 'token', c.bot_token, 'chat_id', chat);
  end if;

  if c.chat_id is null or chat <> c.chat_id or not c.activo then
    return jsonb_build_object('accion', 'ignorado');
  end if;

  if jsonb_typeof(m -> 'photo') = 'array' then
    foto := m -> 'photo' -> (jsonb_array_length(m -> 'photo') - 1) ->> 'file_id';
  elsif (m -> 'document' ->> 'mime_type') like 'image/%' then
    foto := m -> 'document' ->> 'file_id';
  end if;
  if foto is null and (txt is null or txt !~ '\d') then
    return jsonb_build_object('accion', 'ignorado');
  end if;

  nombre := nullif(btrim(coalesce(m -> 'from' ->> 'first_name', '') || ' ' || coalesce(m -> 'from' ->> 'last_name', '')), '');
  insert into produccion_pendientes (chat_id, message_id, enviado_at, remitente, texto, foto_file_id)
  values (chat, (m ->> 'message_id')::bigint, to_timestamp((m ->> 'date')::bigint), nombre, txt, foto)
  on conflict (chat_id, message_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('accion', 'duplicado');
  end if;
  return jsonb_build_object(
    'accion', 'guardado', 'id', v_id, 'texto', txt, 'remitente', nombre, 'foto', foto is not null,
    'message_id', (m ->> 'message_id')::bigint, 'token', c.bot_token, 'chat_id', chat);
end;
$$;

-- ─── Permisos ──────────────────────────────────────────────────────────
revoke execute on function public._prod_entrada(uuid, numeric, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._prod_salida(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public._prod_uso(uuid, numeric) from public, anon, authenticated;
revoke execute on function public._prod_aplicar(uuid, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.telegram_recibir_interno(text, jsonb) from public, anon, authenticated;
grant execute on function public.telegram_contexto(text) to anon, authenticated;
grant execute on function public.telegram_aplicar(text, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.telegram_marcar(text, uuid, text, jsonb) to anon, authenticated;
revoke execute on function public.produccion_aplicar(uuid, jsonb, text) from public, anon;
grant execute on function public.produccion_aplicar(uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
