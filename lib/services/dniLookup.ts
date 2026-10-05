import { consultarDniApisPeru, type DniProviderFailure, type DniProviderResult } from "./apisperu";
import { consultarDniDecolecta } from "./decolecta";

const PROVIDERS = [consultarDniApisPeru, consultarDniDecolecta];

export async function consultarDni(dni: string): Promise<DniProviderResult> {
  const failures: DniProviderFailure[] = [];

  for (const provider of PROVIDERS) {
    const result = await provider(dni);
    if (result.ok) return result;

    failures.push(result);
    if (result.kind === "auth_error" || result.kind === "config_error") {
      console.error(`[dniLookup] ${result.provider} mal configurado (${result.kind}): ${result.error}`);
    } else {
      console.warn(`[dniLookup] ${result.provider} falló (${result.kind}): ${result.error}. Probando siguiente proveedor...`);
    }
  }

  const allNotFound = failures.every((f) => f.kind === "not_found");
  if (allNotFound) {
    return { ok: false, kind: "not_found", provider: "all", status: 404, error: "DNI no encontrado en ningún proveedor" };
  }
  return {
    ok: false,
    kind: "network_error",
    provider: "all",
    status: 502,
    error: "No se pudo consultar el DNI en ningún proveedor disponible",
  };
}
