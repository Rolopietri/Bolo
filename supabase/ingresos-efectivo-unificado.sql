-- Unir "Dólar" (efectivo USD) y "Efectivo" bajo una sola etiqueta "Efectivo" en
-- los ingresos ya cargados. Solo cambia el CONCEPTO (la etiqueta visible). El
-- campo `metodo` crudo NO se toca, para que el IVA siga correcto (los "Dólar"
-- siguen exentos vía la config metodos_sin_iva; ver separaIva). El monto y el iva
-- de cada ingreso quedan intactos.
update public.admin_ingreso
set concepto = 'Ventas Efectivo'
where fuente = 'setux'
  and lower(btrim(concepto)) in ('ventas dólar', 'ventas dolar');
