// Alertas de merma (Fase E): comprueba el módulo puro. `npm run test:merma`.
import {
  umbralDesviacion,
  evaluarMerma,
  UMBRAL_PUNTUAL_PTS,
} from "../src/lib/merma-alertas.ts";

let fallas = 0;
function ok(nombre, cond) {
  if (cond) console.log(`  ✓ ${nombre}`);
  else {
    fallas++;
    console.error(`  ✕ ${nombre}`);
  }
}

console.log("── Umbral ──");
ok("estándar 25 → 3.75 pts (15%)", Math.abs(umbralDesviacion(25) - 3.75) < 1e-9);
ok("estándar 10 → 3 pts (piso)", Math.abs(umbralDesviacion(10) - UMBRAL_PUNTUAL_PTS) < 1e-9);

console.log("── Desviación puntual (estándar 25%) ──");
ok("en línea (27%) → sin alerta", evaluarMerma(25, [27]).puntual === null);
ok("alta (40%) → alerta 'alta'", evaluarMerma(25, [40]).puntual?.sentido === "alta");
ok("baja (18%) → alerta 'baja'", evaluarMerma(25, [18]).puntual?.sentido === "baja");
ok("delta correcto (40 → +15)", evaluarMerma(25, [40]).puntual?.delta === 15);

console.log("── Deriva (estándar 25%) ──");
ok("3 altas [30,31,29] → deriva alta", evaluarMerma(25, [30, 31, 29]).deriva?.sentido === "alta");
ok("estables [26,24,25] → sin deriva", evaluarMerma(25, [26, 24, 25]).deriva === null);
ok("solo 2 eventos → sin deriva (faltan datos)", evaluarMerma(25, [40, 40]).deriva === null);
ok("2 eventos igual detecta puntual", evaluarMerma(25, [40, 40]).puntual?.sentido === "alta");

console.log("── Casos borde ──");
ok("sin estándar → null", evaluarMerma(null, [40]) === null);
ok("sin datos → null", evaluarMerma(25, []) === null);

if (fallas > 0) {
  console.error(`\n✕ Alertas de merma: ${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\n✓ Alertas de merma: todos los casos cuadran.");
