/**
 * Soda (Gaseosa) auto-assignment configuration — Phase 2
 *
 * These workers in the PRODUCCIÓN group receive an automatic soda (gaseosa 500ml)
 * counted in the CONSOLIDADO PRODUCCIÓN sheet.
 *
 * Rule (implement in Phase 2 when generating the Excel):
 *   - Mon–Fri: for each of these workers who ordered an almuerzo that day,
 *     add 1 to the GASEOSAS 500ml count for that day.
 *   - Saturdays: use the cenas count for that day instead.
 *   - Sundays: use the almuerzos count for that day.
 *
 * Names are stored in uppercase to match the full_name column in the DB.
 * Replace with actual doc_numbers once workers are imported.
 */
export const WORKERS_WITH_AUTO_SODA = {
  group: "PRODUCCIÓN",
  // Identified by full_name — replace with doc_numbers after worker import
  workerNames: [
    "PEDRO CORREA",
    "SAMUEL CAMAYO",
    "JOSIAS VASQUEZ",
    "GEAN FRANCO TORRES",
  ],
} as const;
