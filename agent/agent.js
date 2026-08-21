import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config();

import { tools } from "./tools-schema.js";
import { TRIAGE_PROMPT, PLAN_PROMPT } from "./prompts.js";

// Conectar siempre vía loopback local en el puerto del servidor actual
function getApiBase() {
  const port = process.env.PORT || 3000;
  return `http://127.0.0.1:${port}`;
}

function getApiKey() {
  return process.env.ANTHROPIC_API_KEY;
}

function getModel() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
}

async function callClaude(messages, useTools = false) {
  const apiKey = getApiKey();
  const model = getModel();

  if (!apiKey || apiKey === "tu_api_key_aqui") {
    throw new Error("ANTHROPIC_API_KEY no está configurada en las variables de entorno");
  }

  const body = {
    model: model,
    max_tokens: 1024,
    messages
  };
  if (useTools) body.tools = tools;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API Error (${res.status}): ${errText}`);
  }

  return res.json();
}

function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---------- 1. TRIAGE ----------
export async function triage(incident) {
  const response = await callClaude([
    { role: "user", content: TRIAGE_PROMPT(incident) }
  ]);
  const text = response.content.find(b => b.type === "text")?.text || "{}";
  return extractJSON(text);
}

// ---------- 2. PLAN ----------
export async function planRunbook(incident, triageResult) {
  const apiBase = getApiBase();
  const runbooksRes = await fetch(
    `${apiBase}/tools/runbooks?type=${triageResult.type}&severity=${triageResult.severity}`
  );
  const { runbooks } = await runbooksRes.json();

  if (!runbooks || runbooks.length === 0) {
    return { runbook_id: null, reasoning: "No existe un runbook aplicable para este tipo/severidad en el catálogo." };
  }

  const response = await callClaude([
    { role: "user", content: PLAN_PROMPT(incident, triageResult, runbooks) }
  ]);
  const text = response.content.find(b => b.type === "text")?.text || "{}";
  return extractJSON(text);
}

// ---------- 3. TOOL EXECUTION ----------
async function executeTool(name, input) {
  const apiBase = getApiBase();
  const endpointMap = {
    check_system_status: "/tools/check_status",
    restart_service: "/tools/restart",
    rollback_deployment: "/tools/rollback",
    scale_resource: "/tools/scale",
    notify_human: "/tools/notify_human",
    log_action: "/tools/log",
    close_incident: `/tools/close/${input.incident_id}`
  };
  const endpoint = endpointMap[name];
  const res = await fetch(`${apiBase}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return res.json();
}

// ---------- 4. LOOP DE EJECUCIÓN SUPERVISADA ----------
export async function runIncident(incidentId) {
  const apiBase = getApiBase();
  
  // 1. Obtener contexto actual
  const contextRes = await fetch(`${apiBase}/tools/context/${incidentId}`);
  if (!contextRes.ok) {
    throw new Error(`Incidente ${incidentId} no encontrado en backend`);
  }
  const incident = await contextRes.json();

  let triageResult;
  let plan;

  // Si es un incidente nuevo, hacemos triage y plan inicial
  if (incident.status === "nuevo" || !incident.severity) {
    console.log(`[Agente] Iniciando Triage con Claude para ${incidentId}...`);
    triageResult = await triage(incident);

    await executeTool("log_action", {
      incident_id: incidentId,
      actor: "agente",
      event_type: "triage",
      payload: triageResult,
      status_before: "nuevo",
      status_after: "en_triage"
    });

    // Validar umbral de confianza
    const threshold = Number(process.env.CONFIDENCE_THRESHOLD || 0.6);
    if (triageResult.confidence < threshold) {
      await executeTool("notify_human", {
        incident_id: incidentId,
        reason: `Confianza de triage (${Math.round(triageResult.confidence * 100)}%) por debajo del umbral mínimo (${Math.round(threshold * 100)}%).`,
        urgency: "media"
      });
      await executeTool("log_action", {
        incident_id: incidentId,
        actor: "sistema",
        event_type: "escalado",
        payload: { motivo: "baja_confianza_triage", triage: triageResult },
        status_before: "en_triage",
        status_after: "pendiente_aprobacion"
      });
      return { status: "escalado_por_confianza" };
    }

    console.log(`[Agente] Planificando Runbook para ${incidentId}...`);
    plan = await planRunbook(incident, triageResult);

    await executeTool("log_action", {
      incident_id: incidentId,
      actor: "agente",
      event_type: "plan_generado",
      payload: plan,
      status_before: "en_triage",
      status_after: plan.runbook_id ? "en_triage" : "pendiente_aprobacion"
    });

    if (!plan.runbook_id) {
      await executeTool("notify_human", {
        incident_id: incidentId,
        reason: "Ningún runbook del catálogo es aplicable al incidente.",
        urgency: "alta"
      });
      return { status: "escalado_sin_runbook" };
    }
  } else {
    console.log(`[Agente] Reanudando ejecución para ${incidentId} (Estado: ${incident.status})...`);
    plan = { runbook_id: incident.runbook_id || "rollback_deployment_v1" };
  }

  // 5. Cargar runbook a ejecutar
  const runbooksRes = await fetch(`${apiBase}/tools/runbooks`);
  const { runbooks } = await runbooksRes.json();
  const runbook = runbooks.find(r => r.id === plan.runbook_id);

  if (!runbook) {
    throw new Error(`Runbook ${plan.runbook_id} no encontrado en catálogo`);
  }

  console.log(`[Agente] Ejecutando pasos de runbook '${runbook.name}'...`);

  // 6. Ejecutar cada paso del runbook
  for (const step of runbook.steps) {
    if (step.tool_name === "notify_human" || (step.tool_name === "rollback_deployment" && runbook.requires_approval)) {
      const statusRes = await fetch(`${apiBase}/api/incidents/${incidentId}/status`);
      const { status } = await statusRes.json();

      if (status !== "ejecutando" && status !== "resuelto") {
        if (step.tool_name === "notify_human") {
          await executeTool("notify_human", {
            incident_id: incidentId,
            reason: `Runbook '${runbook.name}' contiene acciones de alto riesgo (Rollback) y requiere autorización de un operador.`,
            urgency: "alta"
          });
          await executeTool("log_action", {
            incident_id: incidentId,
            actor: "agente",
            event_type: "solicitud_aprobacion",
            payload: { runbook: runbook.id, riesgo: runbook.risk_level, step: step.step_name },
            status_before: status,
            status_after: "pendiente_aprobacion"
          });
        }
        console.log(`[Agente] Pausado: esperando aprobación humana para ${incidentId}.`);
        return { status: "esperando_aprobacion" };
      }
      
      if (step.tool_name === "notify_human") {
        continue;
      }
    }

    console.log(`[Agente] Ejecutando tool: ${step.tool_name} (${step.step_name})...`);
    
    const result = await executeTool(step.tool_name, {
      incident_id: incidentId,
      service_affected: incident.service_affected
    });

    await executeTool("log_action", {
      incident_id: incidentId,
      actor: "agente",
      event_type: "tool_result",
      tool_name: step.tool_name,
      payload: result,
      status_before: "ejecutando",
      status_after: result.success === false ? "fallido" : "ejecutando",
      success: result.success !== false
    });

    // Circuit Breaker
    if (result.success === false) {
      console.warn(`[Agente] Tool ${step.tool_name} falló. Activando Circuit Breaker y escalando...`);
      await executeTool("close_incident", {
        incident_id: incidentId,
        final_status: "escalado",
        summary: `Paso "${step.step_name}" falló con error: ${result.message}. Escalado a guardia SRE humano.`
      });
      return { status: "fallido_escalado", error: result.message };
    }
  }

  // 7. Cierre exitoso
  console.log(`[Agente] Incidente ${incidentId} resuelto exitosamente.`);
  await executeTool("close_incident", {
    incident_id: incidentId,
    final_status: "resuelto",
    summary: `Runbook '${runbook.name}' ejecutado exitosamente. Servicio restablecido a estado healthy.`
  });

  return { status: "resuelto" };
}
