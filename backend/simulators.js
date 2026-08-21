// Simuladores de sistemas de infraestructura (Kubernetes / Cloud Ops)

const FORCE_FAIL_UNTIL_ATTEMPT = {
  "notifications-worker": 2 // Falla los primeros 2 intentos para probar Circuit Breaker / Escalado
};

const attemptCounters = {};

function shouldFail(service) {
  const failUntil = FORCE_FAIL_UNTIL_ATTEMPT[service];
  if (!failUntil) return false;
  attemptCounters[service] = (attemptCounters[service] || 0) + 1;
  return attemptCounters[service] <= failUntil;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function checkSystemStatus({ service_affected }) {
  await delay(400);
  const fail = shouldFail(service_affected);
  
  if (service_affected === "payments-gateway") {
    return {
      service: service_affected,
      status: "degraded",
      current_version: "v2.4.0",
      previous_stable_version: "v2.3.9",
      p99_latency_ms: 4200,
      error_rate_pct: 18.5,
      cpu_usage_pct: 64,
      last_deploy_at: new Date(Date.now() - 12 * 60000).toISOString()
    };
  }

  if (service_affected === "catalog-api") {
    return {
      service: service_affected,
      status: "degraded",
      current_replicas: 3,
      cpu_usage_pct: 96,
      memory_usage_pct: 88,
      rps: 1450,
      last_deploy_at: new Date(Date.now() - 48 * 3600000).toISOString()
    };
  }

  if (service_affected === "checkout-service") {
    return {
      service: service_affected,
      status: "down",
      http_status: 503,
      healthz_responding: false,
      active_connections: 0,
      last_deploy_at: new Date(Date.now() - 24 * 3600000).toISOString()
    };
  }

  return {
    service: service_affected,
    status: fail ? "down" : "healthy",
    cpu_usage_pct: 75,
    error_rate_pct: fail ? 45.0 : 0.2,
    last_deploy_at: new Date(Date.now() - 30 * 60000).toISOString()
  };
}

export async function restartService({ service_affected }) {
  await delay(700);
  const fail = shouldFail(service_affected);
  return {
    success: !fail,
    new_status: fail ? "down" : "healthy",
    restarted_pods: 3,
    message: fail
      ? `Error en reinicio de ${service_affected}: deadlock persistente en base de datos. Pods en CrashLoopBackOff.`
      : `Reinicio exitoso de ${service_affected}. 3/3 réplicas en estado Running y health check en verde.`
  };
}

export async function rollbackDeployment({ service_affected, target_version }) {
  await delay(1000);
  const target = target_version || "v2.3.9";
  return {
    success: true,
    rolled_back_to: target,
    previous_version: "v2.4.0",
    new_status: "healthy",
    message: `Rollback ejecutado con éxito en ${service_affected}. Tráfico enrutado a ${target}. Latencia restablecida a 180ms y tasa de error en 0.1%.`
  };
}

export async function scaleResource({ service_affected, scale_factor }) {
  await delay(600);
  const factor = scale_factor || 2;
  const newReplicas = Math.round(3 * factor);
  return {
    success: true,
    previous_replicas: 3,
    new_replica_count: newReplicas,
    new_status: "healthy",
    cpu_usage_pct: 42,
    message: `Horizontal Pod Autoscaling aplicado a ${service_affected}: réplicas incrementadas de 3 a ${newReplicas}. Carga distribuida y CPU normalizado al 42%.`
  };
}
