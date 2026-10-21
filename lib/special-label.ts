/**
 * Special-price orders are grouped (Excel consolidado + billing) ONLY by group type,
 * never by orders.special_label — that field is just a free-text note shown as a
 * tooltip in the Pedidos grid.
 */

/** Row name for special-price orders of a group: CENAS groups vs everything else (ALMUERZOS, PRODUCCION, STAFF). */
export function specialRowLabel(groupName: string | null | undefined): string {
  return (groupName ?? "").toUpperCase().includes("CENA")
    ? "CENAS ESPECIALES"
    : "ALMUERZOS ESPECIALES";
}
