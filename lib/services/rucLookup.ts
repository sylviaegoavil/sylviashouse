import { consultarRucApisPeru, type RucProviderFailure, type RucProviderResult } from "./apisperu";
import { consultarRucDecolecta } from "./decolecta";

const PROVIDERS = [consultarRucApisPeru, consultarRucDecolecta];

export async function consultarRuc(ruc: string): Promise<RucProviderResult> {
  const failures: RucProviderFailure[] = [];

  for (const provider of PROVIDERS) {
    const result = await provider(ruc);
    if (result.ok) return result;

    failures.push(result);
    if (result.kind === "auth_error" || result.kind === "config_error") {
      console.error(`[rucLookup] ${result.provider} mal configurado (${result.kind}): ${result.error}`);
    } else {
      console.warn(`[rucLookup] ${result.provider} falló (${result.kind}): ${result.error}. Probando siguiente proveedor...`);
    }
  }

  const allNotFound = failures.every((f) => f.kind === "not_found");
  if (allNotFound) {
    return { ok: false, kind: "not_found", provider: "all", status: 404, error: "RUC no encontrado en ningún proveedor" };
  }
  return {
    ok: false,
    kind: "network_error",
    provider: "all",
    status: 502,
    error: "No se pudo consultar el RUC en ningún proveedor disponible",
  };
}
