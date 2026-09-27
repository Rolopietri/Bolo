-- Mobiliario de alquiler — seed inicial
-- Carga el inventario de mesas, sillas, combos y paneles que tiene
-- Quinta Mamá para ofrecer a clientes en eventos.
--
-- Idempotente: solo inserta si el nombre no existe todavía. Re-corre
-- sin duplicar.

with nuevos (nombre, categoria, cantidad_disponible, precio_alquiler_usd, descripcion) as (
  values
    -- ── Mesas individuales ────────────────────────────────────
    ('1 mesa redonda',                 'Mesas',   1::int, 20.00::numeric, null::text),
    ('Mesa redonda de madera',         'Mesas',   1,      25.00,           null),

    -- ── Sillas (lotes completos) ──────────────────────────────
    ('10 sillas altas',                'Sillas',  1,      50.00,           'Lote completo de 10 sillas altas'),
    ('22 sillas marrones',             'Sillas',  1,     100.00,           'Lote completo de 22 sillas marrones'),
    ('36 sillas blancas',              'Sillas',  1,     150.00,           'Lote completo de 36 sillas blancas'),

    -- ── Combos (mesa + sillas) ────────────────────────────────
    ('1 mesa coctelera con 5 sillas altas',                'Combos',  1, 25.00,  'Combo: 1 mesa coctelera + 5 sillas altas'),
    ('Combo 2 mesas cocteleras con 10 sillas altas',       'Combos',  1, 50.00,  'Combo: 2 mesas cocteleras + 10 sillas altas'),
    ('Combo 5 mesas redondas con 22 sillas marrones',      'Combos',  1, 150.00, 'Combo: 5 mesas redondas + 22 sillas marrones'),

    -- ── Paneles ───────────────────────────────────────────────
    ('Paneles móviles',                'Paneles', 1,      20.00,           null)
)
insert into public.inventario_alquiler
  (nombre, categoria, cantidad_disponible, precio_alquiler_usd, descripcion, estado, activo)
select
  n.nombre,
  n.categoria,
  n.cantidad_disponible,
  n.precio_alquiler_usd,
  n.descripcion,
  'disponible',
  true
from nuevos n
where not exists (
  select 1 from public.inventario_alquiler ia where ia.nombre = n.nombre
);
