-- ═══════════════════════════════════════════════════════════════════
-- Prueba de bolo-01-negocio.sql
-- ═══════════════════════════════════════════════════════════════════
-- Pegar en Supabase → SQL Editor → Run, DESPUÉS de aplicar
-- bolo-01-negocio.sql. Todo corre en un solo bloque que termina siempre con
-- un error intencional: no deja ningún cambio en la base.
--
-- Resultado esperado: un error rojo que dice "BOLO-01 OK: n casos superados". Si un caso falla,
-- se detiene con "BOLO-01 FALLA: <caso>".
-- ═══════════════════════════════════════════════════════════════════


do $$
declare
  n int := 0;
  v_area uuid;
  v_user uuid;
  v_persona uuid;
  v_txt text;

begin
  -- 1. La fila de configuración existe y es única.
  if (select count(*) from public.negocio_config) <> 1 then
    raise exception 'BOLO-01 FALLA: negocio_config debe tener exactamente 1 fila';
  end if;
  n := n + 1;

  -- 2. No se puede crear una segunda fila.
  begin
    insert into public.negocio_config (id) values (2);
    raise exception 'BOLO-01 FALLA: se pudo insertar id=2';
  exception when check_violation then null;
  end;
  n := n + 1;

  -- 3. Zona horaria por defecto: America/Caracas (si nadie la cambió).
  select zona_horaria into v_txt from public.negocio_config where id = 1;
  if v_txt is null then raise exception 'BOLO-01 FALLA: sin zona horaria'; end if;
  n := n + 1;

  -- 4. negocio_hoy() = fecha de Caracas, no UTC.
  update public.negocio_config set zona_horaria = 'America/Caracas' where id = 1;
  if public.negocio_hoy() <> (now() at time zone 'America/Caracas')::date then
    raise exception 'BOLO-01 FALLA: negocio_hoy() no usa America/Caracas';
  end if;
  n := n + 1;

  -- 5. Cambiar la zona horaria cambia "hoy" (Tokio va 13 h por delante de Caracas).
  update public.negocio_config set zona_horaria = 'Asia/Tokyo' where id = 1;
  if public.negocio_hoy() <> (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'BOLO-01 FALLA: negocio_hoy() no sigue la zona configurada';
  end if;
  n := n + 1;

  -- 6. Zona horaria inválida se rechaza.
  begin
    update public.negocio_config set zona_horaria = 'Caracas/Inventada' where id = 1;
    raise exception 'BOLO-01 FALLA: aceptó una zona horaria inválida';
  exception when invalid_parameter_value then null;
  end;
  n := n + 1;

  -- 7. Sin módulos se rechaza.
  begin
    update public.negocio_config set modulos = '{}' where id = 1;
    raise exception 'BOLO-01 FALLA: aceptó quedarse sin módulos';
  exception when invalid_parameter_value then null;
  end;
  n := n + 1;

  -- 8. Áreas: no se repiten aunque cambien mayúsculas o espacios.
  insert into public.negocio_area (nombre) values ('Pastelería prueba') returning id into v_area;
  begin
    insert into public.negocio_area (nombre) values ('  PASTELERÍA prueba ');
    raise exception 'BOLO-01 FALLA: aceptó un área repetida';
  exception when unique_violation then null;
  end;
  n := n + 1;

  -- 9. Persona sin login puede ser responsable, pero no tener rol.
  insert into public.negocio_persona (nombre, area_id) values ('Cocinero sin cuenta', v_area);
  begin
    insert into public.negocio_persona (nombre, rol) values ('Rol sin login', 'cocina');
    raise exception 'BOLO-01 FALLA: aceptó un rol sin login';
  exception when check_violation then null;
  end;
  n := n + 1;

  -- 10. Borrar un área no borra a sus personas (quedan sin área).
  delete from public.negocio_area where id = v_area;
  if exists (select 1 from public.negocio_persona where nombre = 'Cocinero sin cuenta' and area_id is not null) then
    raise exception 'BOLO-01 FALLA: la persona quedó apuntando a un área borrada';
  end if;
  if not exists (select 1 from public.negocio_persona where nombre = 'Cocinero sin cuenta') then
    raise exception 'BOLO-01 FALLA: borrar el área borró a la persona';
  end if;
  n := n + 1;

  -- 11-12. Protección del último gerente (solo si existe algún usuario en auth.users
  --        que todavía no sea persona del negocio).
  select u.id into v_user
  from auth.users u
  where not exists (select 1 from public.negocio_persona p where p.user_id = u.id)
  limit 1;

  if v_user is null then
    null; -- casos 11-12 omitidos: no hay usuario libre en auth.users
  elsif exists (select 1 from public.negocio_persona where rol = 'gerente' and activo and user_id is not null) then
    null; -- casos 11-12 omitidos: ya hay un gerente
  else
    insert into public.negocio_persona (nombre, user_id, rol)
    values ('Gerente prueba', v_user, 'gerente') returning id into v_persona;

    begin
      update public.negocio_persona set rol = 'cocina' where id = v_persona;
      raise exception 'BOLO-01 FALLA: dejó al negocio sin gerente (cambio de rol)';
    exception when check_violation then null;
    end;
    n := n + 1;

    begin
      delete from public.negocio_persona where id = v_persona;
      raise exception 'BOLO-01 FALLA: dejó al negocio sin gerente (borrado)';
    exception when check_violation then null;
    end;
    n := n + 1;
  end if;

  -- Error a propósito: aborta la transacción y deshace TODO lo que hizo la prueba.
  raise exception 'BOLO-01 OK: % casos superados (este "error" es intencional: deshace los cambios de la prueba)', n;
end;
$$;

