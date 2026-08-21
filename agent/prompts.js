// Prompts base del Agente Orquestador (Claude)

export const TRIAGE_PROMPT = (incident) => `
Eres el módulo de triage de un sistema de gestión de incidentes (AIOps).
Analiza el siguiente incidente de producción y clasifícalo. Responde ÚNICAMENTE con un JSON válido,
sin texto adicional, sin markdown, con este formato exacto:

{
  "severity": "SEV1" | "SEV2" | "SEV3" | "SEV4",
  "type": "infraestructura" | "aplicacion" | "despliegue" | "red" | "desconocido",
  "confidence": <número entre 0 y 1>,
  "justification": "<explicación breve, máximo 2 líneas>"
}

Criterios de Severidad:
- SEV1 = Servicio crítico completamente caído, indisponibilidad total o impacto financiero severo.
- SEV2 = Degradación severa, alta tasa de errores en endpoints clave tras despliegues o picos.
- SEV3 = Degradación moderada, latencia incrementada o saturación de recursos sin caída total.
- SEV4 = Impacto bajo, tareas en segundo plano o advertencias no críticas.

Criterios de Tipo:
- "despliegue" = Ocurre poco después de un release/deploy reciente con fallos de regresión.
- "infraestructura" = Saturación de CPU/RAM, fallos de pods, falta de réplicas.
- "aplicacion" = Excepciones no controladas, fallos 500/503 internos.
- "red" = Timeouts de conexión, latencia entre servicios.

Incidente a analizar:
ID: ${incident.id}
Título: ${incident.title}
Descripción: ${incident.description}
Servicio afectado: ${incident.service_affected}
`;

export const PLAN_PROMPT = (incident, triage, runbooksDisponibles) => `
Eres el módulo de planificación de remediación de un sistema de gestión de incidentes.
Dado el resultado del triage y el catálogo de runbooks disponibles, elige el runbook
más adecuado para solucionar el problema. NO inventes pasos ni runbooks que no estén en la lista.

Responde ÚNICAMENTE con un JSON válido:

{
  "runbook_id": "<id del runbook elegido, o null si ninguno aplica>",
  "reasoning": "<por qué este runbook es el adecuado, máximo 2 líneas>"
}

Reglas de selección:
- Si el incidente fue causado por un despliegue reciente con errores ("despliegue"), selecciona el runbook de rollback.
- Si el incidente es por saturación de CPU/recursos con tráfico alto ("infraestructura"), selecciona el runbook de escalado.
- Si el servicio está caído sin despliegue reciente ("aplicacion" o "infraestructura"), selecciona el runbook de reinicio.
- Si ningún runbook aplica o la confianza es menor a 0.6, responde con "runbook_id": null.

Triage:
${JSON.stringify(triage, null, 2)}

Runbooks disponibles:
${JSON.stringify(runbooksDisponibles, null, 2)}
`;
