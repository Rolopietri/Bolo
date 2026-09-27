-- Plantilla "Evento estándar Quinta Mamá"
-- Basada en el spreadsheet de Beatriz: checklist por fases + cronograma del día.
-- Idempotente: se puede correr varias veces sin duplicar (se borra y reinserta
-- el contenido de la plantilla).
--
-- Para crear nuevas plantillas, copia este patrón cambiando el nombre y los datos.

do $$
declare
  pl_id uuid;
begin
  -- ── 1) Cabecera (insertar si no existe; obtener id) ──────────────
  select id into pl_id
    from public.evento_plantillas
   where nombre = 'Evento estándar Quinta Mamá'
   limit 1;

  if pl_id is null then
    insert into public.evento_plantillas (nombre, descripcion, activa)
    values (
      'Evento estándar Quinta Mamá',
      'Checklist y cronograma típicos basados en el flujo de Beatriz. Editable después de aplicar.',
      true
    )
    returning id into pl_id;
  end if;

  -- ── 2) Tareas del checklist (por fase) ───────────────────────────
  -- dias_offset = días ANTES del evento. 0 = mismo día. Negativo = después.
  delete from public.evento_plantilla_tareas where plantilla_id = pl_id;

  insert into public.evento_plantilla_tareas
    (plantilla_id, fase, titulo, responsable, notas, dias_offset, orden)
  values
    -- Pre-producción
    (pl_id, 'pre-pro', 'Confirmación de fecha y detalles del cliente', 'Colaborador', null, 14, 10),
    (pl_id, 'pre-pro', 'Solicitar servicio de catering', 'Quinta Mamá', 'Confirmar si el evento requiere catering', 10, 20),
    (pl_id, 'pre-pro', 'Solicitar servicio de valet parking', 'Quinta Mamá', 'Coordinar con Evenseg si aplica', 10, 30),
    (pl_id, 'pre-pro', 'Convocar personal de apoyo', 'Quinta Mamá', 'Anfitriona, limpieza, mesoneros', 7, 40),
    (pl_id, 'pre-pro', 'Definir horas de montaje y desmontaje', 'Quinta Mamá', null, 5, 50),
    (pl_id, 'pre-pro', 'Confirmar lista de contratistas y proveedores', 'Quinta Mamá', null, 3, 60),
    (pl_id, 'pre-pro', 'Enviar recordatorio al cliente', 'Quinta Mamá', null, 2, 70),
    -- Montaje
    (pl_id, 'montaje', 'Confirmación de requerimientos finales', 'Quinta Mamá', null, 1, 10),
    (pl_id, 'montaje', 'Decoración y preparación de espacios comunes', 'Colaborador', 'Limpieza, flores, otros', 1, 20),
    (pl_id, 'montaje', 'Revisión técnica (luces, sonido, WiFi)', 'Quinta Mamá', null, 0, 30),
    -- Ejecución
    (pl_id, 'ejecucion', 'Supervisión en campo', 'Quinta Mamá', null, 0, 10),
    (pl_id, 'ejecucion', 'Atención al cliente y contingencias', 'Quinta Mamá', null, 0, 20),
    -- Desmontaje
    (pl_id, 'desmontaje', 'Supervisión de retiro de proveedores', 'Quinta Mamá', null, -1, 10),
    (pl_id, 'desmontaje', 'Revisión de la casa (daños / faltantes)', 'Quinta Mamá', null, -1, 20),
    -- Cierre
    (pl_id, 'cierre', 'Enviar encuesta de satisfacción', 'Quinta Mamá', null, -2, 10),
    (pl_id, 'cierre', 'Cobrar saldo pendiente', 'Quinta Mamá', null, -3, 20),
    (pl_id, 'cierre', 'Realizar informe final del evento', 'Quinta Mamá', null, -5, 30);

  -- ── 3) Cronograma del día (run of show) ──────────────────────────
  delete from public.evento_plantilla_actividades where plantilla_id = pl_id;

  insert into public.evento_plantilla_actividades
    (plantilla_id, hora, actividad, responsable, ubicacion, observaciones, critica, orden)
  values
    (pl_id, '09:00', 'Apertura de Quinta Mamá y check de servicios', 'Staff Quinta', 'Toda la casa', 'Revisar baños, luces, limpieza y WiFi.', true, 10),
    (pl_id, '10:00', 'Llegada de proveedores de montaje (mobiliario / flores)', 'Colaborador externo', 'Acceso de carga', 'Supervisar que no se golpeen paredes ni marcos.', true, 20),
    (pl_id, '12:00', 'Montaje técnico (sonido e iluminación)', 'Técnico audio', 'Área principal', 'Verificar tomas de corriente y cableado oculto.', false, 30),
    (pl_id, '14:00', 'Llegada de catering y montaje de estación', 'Chef / Catering', 'Cocina / Área social', 'Check de potencia eléctrica para hornos y cafeteras.', true, 40),
    (pl_id, '16:00', 'Ready for Guest (RFG): todo listo', 'Staff Quinta', 'Toda la casa', 'Música ambiente, velas encendidas, staff cambiado.', true, 50),
    (pl_id, '17:00', 'Recepción de invitados', 'Host / Quinta', 'Entrada', 'Lista de invitados en mano y bienvenida.', true, 60),
    (pl_id, '18:30', 'Momento cumbre (charla, brindis o actividad)', 'Organizador', 'Área principal', 'Bajar volumen de música ambiente, ajustar luces.', true, 70),
    (pl_id, '21:00', 'Cierre de estaciones de comida y bebida', 'Catering', 'Área social', 'Retiro discreto de platos y copas.', false, 80),
    (pl_id, '22:00', 'Fin del evento y salida de invitados', 'Staff Quinta', 'Entrada', 'Despedida y chequeo de objetos olvidados.', false, 90),
    (pl_id, '22:30', 'Desmontaje express y limpieza básica', 'Proveedores', 'Toda la casa', 'Supervisar retiro de basura y cuidado de la casa.', false, 100),
    (pl_id, '23:30', 'Cierre total y entrega de llaves', 'Staff Quinta', 'Puerta principal', 'Inventario final de daños o faltantes.', false, 110);
end$$;
