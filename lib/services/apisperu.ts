const BASE_URL = "https://dniruc.apisperu.com/api/v1";

type ApisPeruFetchResult =
  | { ok: true; json: Record<string, unknown> }
  | { ok: false; status: number; error: string };

async function callApisPeru(path: string): Promise<ApisPeruFetchResult> {
  const token = process.env.APIS_PERU_TOKEN;
  if (!token) {
    return { ok: false, status: 500, error: "Token APIS_PERU_TOKEN no configurado en variables de entorno" };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${path}?token=${token}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, status: 503, error: "Sin conexión con el servicio de consulta (APIs Perú)" };
  }

  if (res.status === 401) {
    return { ok: false, status: 401, error: "Token APIS_PERU vencido o inválido" };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    return { ok: false, status: 502, error: "Error al consultar el proveedor (APIs Perú)" };
  }

  return { ok: true, json };
}

export type ProviderFailureKind =
  | "not_found"
  | "auth_error"
  | "network_error"
  | "invalid_response"
  | "config_error";

function apisPeruStatusToKind(status: number): ProviderFailureKind {
  return status === 401 ? "auth_error" : status === 503 ? "network_error" : "invalid_response";
}

// ─── RUC ──────────────────────────────────────────────────────────────────

export interface RucProviderSuccess {
  ok: true;
  provider: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccion: string;
  estado: string | null;
  condicion: string | null;
  raw?: unknown;
}

export interface RucProviderFailure {
  ok: false;
  kind: ProviderFailureKind;
  provider: string;
  status: number;
  error: string;
}

export type RucProviderResult = RucProviderSuccess | RucProviderFailure;

export async function consultarRucApisPeru(ruc: string): Promise<RucProviderResult> {
  const provider = "APIs Peru";
  const result = await callApisPeru(`ruc/${ruc}`);
  if (!result.ok) {
    return { ok: false, kind: apisPeruStatusToKind(result.status), provider, status: result.status, error: result.error };
  }

  const { json } = result;
  if (json.success === false || !json.razonSocial) {
    const msg = typeof json.message === "string" ? json.message : "RUC no encontrado en SUNAT";
    return { ok: false, kind: "not_found", provider, status: 404, error: msg };
  }

  const direccion = [json.direccion, json.distrito, json.provincia, json.departamento]
    .filter(Boolean)
    .join(", ");

  return {
    ok: true,
    provider,
    ruc: String(json.ruc),
    razonSocial: String(json.razonSocial),
    nombreComercial: typeof json.nombreComercial === "string" ? json.nombreComercial : null,
    direccion,
    estado: typeof json.estado === "string" ? json.estado : null,
    condicion: typeof json.condicion === "string" ? json.condicion : null,
    raw: json,
  };
}

// ─── DNI ──────────────────────────────────────────────────────────────────

export interface DniProviderSuccess {
  ok: true;
  fullName: string;
  provider: string;
  raw?: unknown;
}

export interface DniProviderFailure {
  ok: false;
  kind: ProviderFailureKind;
  provider: string;
  status: number;
  error: string;
}

export type DniProviderResult = DniProviderSuccess | DniProviderFailure;

function mapApisPeruDniToFullName(json: Record<string, unknown>): string | null {
  const nombres = (json.nombres ?? json.nombre ?? "") as string;
  const apPaterno = (json.apellidoPaterno ?? json.apellido_paterno ?? "") as string;
  const apMaterno = (json.apellidoMaterno ?? json.apellido_materno ?? "") as string;
  const combined = [nombres, apPaterno, apMaterno].filter(Boolean).join(" ").trim();
  if (combined) return combined.toUpperCase();

  if (typeof json.nombre_completo === "string" && json.nombre_completo.trim()) {
    return json.nombre_completo.trim().toUpperCase();
  }
  if (typeof json.full_name === "string" && json.full_name.trim()) {
    return json.full_name.trim().toUpperCase();
  }
  return null;
}

export async function consultarDniApisPeru(dni: string): Promise<DniProviderResult> {
  const provider = "APIs Peru";
  const result = await callApisPeru(`dni/${dni}`);

  if (!result.ok) {
    return { ok: false, kind: apisPeruStatusToKind(result.status), provider, status: result.status, error: result.error };
  }

  const { json } = result;
  if (json.success === false) {
    const msg = typeof json.message === "string" ? json.message : "DNI no encontrado en RENIEC";
    return { ok: false, kind: "not_found", provider, status: 404, error: msg };
  }

  const fullName = mapApisPeruDniToFullName(json);
  if (!fullName) {
    return { ok: false, kind: "not_found", provider, status: 404, error: "DNI no encontrado en RENIEC" };
  }

  return { ok: true, fullName, provider, raw: json };
}
