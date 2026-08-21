// Schema de tools que se le pasa a Claude en cada llamada con tool use.
// Coincide 1 a 1 con los endpoints /tools/* del backend (server.js).

export const tools = [
  {
    name: "check_system_status",
    description: "Consulta el estado actual del servicio afectado (salud, cpu, error rate).",
    input_schema: {
      type: "object",
      properties: {
        service_affected: { type: "string" }
      },
      required: ["service_affected"]
    }
  },
  {
    name: "restart_service",
    description: "Reinicia el servicio afectado. Riesgo medio, no requiere aprobación previa.",
    input_schema: {
      type: "object",
      properties: {
        service_affected: { type: "string" },
        incident_id: { type: "string" }
      },
      required: ["service_affected", "incident_id"]
    }
  },
  {
    name: "rollback_deployment",
    description: "Revierte el último despliegue del servicio. Riesgo alto, SIEMPRE requiere aprobación humana antes de ejecutarse.",
    input_schema: {
      type: "object",
      properties: {
        service_affected: { type: "string" },
        incident_id: { type: "string" },
        target_version: { type: "string" }
      },
      required: ["service_affected", "incident_id"]
    }
  },
  {
    name: "scale_resource",
    description: "Escala recursos (réplicas) del servicio afectado. Riesgo medio, no requiere aprobación previa.",
    input_schema: {
      type: "object",
      properties: {
        service_affected: { type: "string" },
        incident_id: { type: "string" },
        scale_factor: { type: "number" }
      },
      required: ["service_affected", "incident_id"]
    }
  },
  {
    name: "notify_human",
    description: "Solicita aprobación o notifica a un humano. Pausa la ejecución hasta que haya respuesta.",
    input_schema: {
      type: "object",
      properties: {
        incident_id: { type: "string" },
        reason: { type: "string" },
        urgency: { type: "string", enum: ["baja", "media", "alta"] }
      },
      required: ["incident_id", "reason"]
    }
  },
  {
    name: "log_action",
    description: "Registra un evento en el timeline del incidente. Se debe llamar en cada paso importante.",
    input_schema: {
      type: "object",
      properties: {
        incident_id: { type: "string" },
        actor: { type: "string", enum: ["agente", "humano", "sistema"] },
        event_type: { type: "string" },
        payload: { type: "object" },
        status_before: { type: "string" },
        status_after: { type: "string" }
      },
      required: ["incident_id", "actor", "event_type", "status_before", "status_after"]
    }
  },
  {
    name: "close_incident",
    description: "Cierra el incidente con un estado final.",
    input_schema: {
      type: "object",
      properties: {
        incident_id: { type: "string" },
        final_status: { type: "string", enum: ["resuelto", "escalado", "fallido"] },
        summary: { type: "string" }
      },
      required: ["incident_id", "final_status", "summary"]
    }
  }
];
