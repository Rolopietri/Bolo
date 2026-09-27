-- Eventos · Campos extra para el formulario completo
-- Agrega: descripción, horario libre, fecha de fin (multi-día), cantidad de personas.
-- Aditivo, idempotente — se puede correr varias veces sin romper nada.

alter table public.eventos
  add column if not exists descripcion text;

alter table public.eventos
  add column if not exists horario text;

-- fecha_fin: si es null, el evento es de un solo día (= fecha).
-- Si tiene valor, el evento va desde `fecha` hasta `fecha_fin` inclusive.
alter table public.eventos
  add column if not exists fecha_fin date;

alter table public.eventos
  add column if not exists cantidad_personas int;
