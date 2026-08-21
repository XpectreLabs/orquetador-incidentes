// Simuladores de sistemas — Persona C completa/ajusta esto.
// Cada función simula una acción real con un pequeño delay y puede forzarse a fallar
// para poder demostrar el circuit breaker / escalado en la demo.

// Servicios que SIEMPRE fallan las primeras N veces (para el ticket de demo de "falla y escala")
const FORCE_FAIL_UNTIL_ATTEMPT = {
  "notifications-worker": 2 // falla intentos 1 y 2, funciona en el 3
};

const attemptCounters = {}; // service -> cantidad de intentos hechos

function shouldFail(service) {
  const failUntil = FORCE_FAIL_UNTIL_ATTEMPT[service];
  if (!failUntil) return false;
  attemptCounters[service] = (attemptCounters[service] || 0) + 1;
  return attemptCounters[service] <= failUntil;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function restartService({ service_affected }) {
  await delay(500);
  const fail = shouldFail(service_affected);
  return {
    success: !fail,
    new_status: fail ? "down" : "healthy",
    message: fail
      ? `Reinicio de ${service_affected} falló, servicio sigue caído.`
      : `${service_affected} reiniciado correctamente.`
  };
}

export async function rollbackDeployment({ service_affected, target_version }) {
  await delay(700);
  return {
    success: true,
    rolled_back_to: target_version || "version_anterior_estable",
    new_status: "healthy",
    message: `${service_affected} revertido a versión estable.`
  };
}

export async function scaleResource({ service_affected, scale_factor }) {
  await delay(500);
  return {
    success: true,
    new_replica_count: Math.round(3 * (scale_factor || 2)),
    new_status: "healthy",
    message: `${service_affected} escalado correctamente.`
  };
}

export async function checkSystemStatus({ service_affected }) {
  await delay(200);
  return {
    service: service_affected,
    status: "degraded",
    cpu_usage: 87,
    error_rate: 0.12,
    last_deploy_at: new Date(Date.now() - 10 * 60000).toISOString()
  };
}
