import type { DniProviderResult, ProviderFailureKind, RucProviderResult } from "./apisperu";

const PROVIDER = "Decolecta";

type DecolectaFetchResult =
  | { ok: true; json: Record<string, unknown> }
  | { ok: false; kind: ProviderFailureKind; status: number; error: string };

async function callDecolecta(path: string): Promise<DecolectaFetchResult> {
  const token = process.env.DECOLECTA_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      kind: "config_error",
      status: 500,
      error: "Token DECOLECTA_API_TOKEN no configurado en variables de entorno",
    };
  }

  let res: Response;
  try {
    res = await fetch(`https://api.decolecta.com/v1/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, kind: "network_error", status: 503, error: "Sin conexión con Decolecta" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, kind: "auth_error", status: res.status, error: "Token Decolecta inválido o vencido" };
  }
  if (res.status === 404 || res.status === 422) {
    return { ok: false, kind: "not_found", status: 404, error: "No encontrado en Decolecta" };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    return { ok: false, kind: "invalid_response", status: 502, error: "Error al consultar Decolecta" };
  }

  return { ok: true, json };
}

export async function consultarDniDecolecta(dni: string): Promise<DniProviderResult> {
  const result = await callDecolecta(`reniec/dni?numero=${dni}`);
  if (!result.ok) {
    return { ok: false, kind: result.kind, provider: PROVIDER, status: result.status, error: result.error };
  }

  const { json } = result;
  // Decolecta devuelve full_name como "APELLIDOS NOMBRES"; se recompone como "NOMBRES APELLIDOS".
  const firstName = typeof json.first_name === "string" ? json.first_name : "";
  const firstLastName = typeof json.first_last_name === "string" ? json.first_last_name : "";
  const secondLastName = typeof json.second_last_name === "string" ? json.second_last_name : "";
  const combined = [firstName, firstLastName, secondLastName].filter(Boolean).join(" ").trim();

  const fullName = combined
    ? combined.toUpperCase()
    : typeof json.full_name === "string" && json.full_name.trim()
      ? json.full_name.trim().toUpperCase()
      : null;
  if (!fullName) {
    return { ok: false, kind: "invalid_response", provider: PROVIDER, status: 502, error: "Respuesta inesperada de Decolecta" };
  }

  return { ok: true, fullName, provider: PROVIDER, raw: json };
}

export async function consultarRucDecolecta(ruc: string): Promise<RucProviderResult> {
  const result = await callDecolecta(`sunat/ruc?numero=${ruc}`);
  if (!result.ok) {
    const error = result.kind === "not_found" ? "RUC no encontrado en SUNAT" : result.error;
    return { ok: false, kind: result.kind, provider: PROVIDER, status: result.status, error };
  }

  const { json } = result;
  if (typeof json.razon_social !== "string" || !json.razon_social) {
    return { ok: false, kind: "not_found", provider: PROVIDER, status: 404, error: "RUC no encontrado en SUNAT" };
  }

  const direccion = [json.direccion, json.distrito, json.provincia, json.departamento]
    .filter(Boolean)
    .join(", ");

  return {
    ok: true,
    provider: PROVIDER,
    ruc: typeof json.numero_documento === "string" ? json.numero_documento : ruc,
    razonSocial: json.razon_social,
    nombreComercial: null,
    direccion,
    estado: typeof json.estado === "string" ? json.estado : null,
    condicion: typeof json.condicion === "string" ? json.condicion : null,
    raw: json,
  };
}
