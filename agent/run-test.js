// Prueba rápida: node run-test.js inc_001
import { runIncident } from "./agent.js";

const incidentId = process.argv[2];
if (!incidentId) {
  console.error("Uso: node run-test.js <incident_id>  (ej: inc_001, inc_002, inc_003)");
  process.exit(1);
}

console.log(`Ejecutando agente sobre ${incidentId}...`);
const result = await runIncident(incidentId);
console.log("Resultado final:", result);
