-- Administración · IVA en ingresos
-- Las ventas facturadas traen IVA incluido; el IVA no es ingreso. Se guarda el
-- neto en monto y el IVA aparte en la columna iva.
alter table public.admin_ingreso add column if not exists iva numeric(16,2);

-- Ajustes: % de IVA y métodos exentos (sin factura → sin IVA).
insert into public.admin_config (clave, valor) values
  ('iva_pct', '16'),
  ('metodos_sin_iva', 'Zelle, Dólar')
on conflict (clave) do nothing;
