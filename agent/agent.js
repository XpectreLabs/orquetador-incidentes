import "dotenv/config";
import { tools } from "./tools-schema.js";
import { TRIAGE_PROMPT, PLAN_PROMPT, EXECUTION_SYSTEM_PROMPT } from "./prompts.js";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

async function callClaude(messages, useTools = false) {
  const body = {
    model: MODEL,
    max_tokens: 1024,
    messages
  };
  if (useTools) body.tools = tools;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

function extractJSON(text) {
  // Los prompts piden JSON puro, pero por si acaso limpiamos posibles fences.
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
  const runbooksRes = await fetch(
    `${API_BASE}/tools/runbooks?type=${triageResult.type}&severity=${triageResult.severity}`
  );
  const { runbooks } = await runbooksRes.json();

  if (runbooksRes.status !== 200 || runbooks.length === 0) {
    return { runbook_id: null, reasoning: "No hay runbook aplicable en el catálogo." };
  }

  const response = await callClaude([
    { role: "user", content: PLAN_PROMPT(incident, triageResult, runbooks) }
  ]);
  const text = response.content.find(b => b.type === "text")?.text || "{}";
  return extractJSON(text);
}

// ---------- 3. TOOL EXECUTION (llama al backend real) ----------
async function executeTool(name, input) {
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
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return res.json();
}

// ---------- 4. LOOP DE EJECUCIÓN SUPERVISADA ----------
export async function runIncident(incidentId) {
  // 1. Obtener contexto
  const contextRes = await fetch(`${API_BASE}/tools/context/${incidentId}`);
  const incident = await contextRes.json();

  // 2. Triage
  const triageResult = await triage(incident);
  await executeTool("log_action", {
    incident_id: incidentId,
    actor: "agente",
    event_type: "triage",
    payload: triageResult,
    status_before: "nuevo",
    status_after: "en_triage"
  });

  // 3. Umbral de confianza -> revisión humana si es baja
  if (triageResult.confidence < Number(process.env.CONFIDENCE_THRESHOLD || 0.6)) {
    await executeTool("notify_human", {
      incident_id: incidentId,
      reason: "Confianza de triage insuficiente para auto-remediar.",
      urgency: "media"
    });
    await executeTool("log_action", {
      incident_id: incidentId,
      actor: "sistema",
      event_type: "escalado",
      payload: { motivo: "baja_confianza" },
      status_before: "en_triage",
      status_after: "pendiente_aprobacion"
    });
    return { status: "escalado_por_confianza" };
  }

  // 4. Plan de runbook
  const plan = await planRunbook(incident, triageResult);
  await executeTool("log_action", {
    incident_id: incidentId,
    actor: "agente",
    event_type: "plan_generado",
    payload: plan,
    status_before: "en_triage",
    status_after: plan.runbook_id ? "ejecutando" : "pendiente_aprobacion"
  });

  if (!plan.runbook_id) {
    await executeTool("notify_human", {
      incident_id: incidentId,
      reason: "Ningún runbook del catálogo aplica.",
      urgency: "media"
    });
    return { status: "escalado_sin_runbook" };
  }

  // 5. Ejecución vía tool-use loop con Claude
  // (versión simplificada para 2 horas: loop directo, sin function-calling completo de Claude,
  //  usando el runbook como guía determinística — más rápido de asegurar en poco tiempo)
  const runbooksRes = await fetch(`${API_BASE}/tools/runbooks`);
  const { runbooks } = await runbooksRes.json();
  const runbook = runbooks.find(r => r.id === plan.runbook_id);

  for (const step of runbook.steps) {
    if (step.tool_name === "rollback_deployment" && runbook.requires_approval) {
      // Verificar que ya fue aprobado antes de continuar (si no, se detiene aquí)
      const statusRes = await fetch(`${API_BASE}/api/incidents/${incidentId}/status`);
      const { status } = await statusRes.json();
      if (status !== "ejecutando") {
        return { status: "esperando_aprobacion" };
      }
    }

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

    if (result.success === false) {
      await executeTool("close_incident", {
        incident_id: incidentId,
        final_status: "escalado",
        summary: `Paso "${step.step_name}" falló. Escalado a revisión humana.`
      });
      return { status: "fallido_escalado" };
    }
  }

  await executeTool("close_incident", {
    incident_id: incidentId,
    final_status: "resuelto",
    summary: `Runbook ${runbook.id} ejecutado exitosamente.`
  });

  return { status: "resuelto" };
}
