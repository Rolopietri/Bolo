-- IVA por registro en CXC y RPP (cortesías).
-- El importador por factura guarda las CXC y las cortesías en BRUTO (el "Total
-- Venta" del reporte = lo que el cliente realmente paga). Para conciliar con
-- Cocina —que va en NETO— se guarda además el IVA de cada registro, y así el
-- neto = monto − iva es EXACTO (no un ÷1+IVA aproximado que falla en facturas
-- con 0 IVA, como alquileres). Idempotente.
alter table public.admin_cuenta_cobrar add column if not exists iva numeric(16,2);
alter table public.admin_egreso        add column if not exists iva numeric(16,2);
