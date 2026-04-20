/**
 * Worker Matching Engine for Sylvia's House
 *
 * Matches parsed order data (name + DNI fragments) against the workers
 * database to identify who placed each order.
 *
 * Matching algorithm (in priority order):
 * 1. Exact DNI match
 * 2. Multi-word name match: ≥2 words from the order appear in the worker's full_name
 * 3. Single-word match: the one word is contained in the worker's full_name
 * 6. Unmatched
 */

import type { Worker, ParsedOrder, MatchResult, MatchType } from "./types";

// ─── Text normalization ──────────────────────────────────────────────────────

/**
 * Normalizes a string for fuzzy comparison:
 *   - Lowercase
 *   - Remove diacritics (á→a, é→e, í→i, ó→o, ú→u)
 *   - Collapse whitespace
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a normalized string into individual words (min length 2). */
function words(text: string): string[] {
  return normalize(text).split(" ").filter((w) => w.length >= 2);
}

// ─── Main matching function ──────────────────────────────────────────────────

export function matchWorkers(
  parsedOrders: ParsedOrder[],
  workers: Worker[]
): MatchResult[] {
  const dniMap = new Map<string, Worker>();
  for (const w of workers) {
    if (w.doc_number) dniMap.set(w.doc_number, w);
  }
  return parsedOrders.map((order) => matchSingleOrder(order, workers, dniMap));
}

const _DIAG_DNIS = new Set(["75851560", "75330636"]);

function matchSingleOrder(
  order: ParsedOrder,
  workers: Worker[],
  dniMap: Map<string, Worker>
): MatchResult {
  const { possibleDni, possibleNames } = order;
  const _isDiag = possibleDni ? _DIAG_DNIS.has(possibleDni) : false;
  if (_isDiag) console.log(`[DIAG-MATCH] order dni=${possibleDni} names=${JSON.stringify(possibleNames)} date=${order.date}`);

  // ── Step 1: Exact DNI match ──
  if (possibleDni) {
    const dniWorker = dniMap.get(possibleDni);
    if (_isDiag) console.log(`[DIAG-MATCH] dniMap lookup for ${possibleDni}: found=${!!dniWorker}${dniWorker ? ` (${dniWorker.full_name})` : ""}`);
    if (dniWorker) {
      if (possibleNames.length > 0 && !nameMatchesWorker(possibleNames, dniWorker)) {
        return {
          parsedOrder: order,
          worker: dniWorker,
          matchType: "exact_dni",
          confidence: 0.9,
          errorType: "wrong_name",
          errorMessage: `DNI ${possibleDni} corresponde a ${dniWorker.full_name}, pero el texto dice "${possibleNames.join(" ")}"`,
        };
      }
      return {
        parsedOrder: order,
        worker: dniWorker,
        matchType: "exact_dni",
        confidence: 1.0,
        errorType: null,
        errorMessage: null,
      };
    }
  }

  // ── Step 2: Name-based matching ──
  if (possibleNames.length > 0) {
    const nameResult = findByName(possibleNames, workers);
    if (nameResult) {
      const { worker, matchType, confidence } = nameResult;

      if (possibleDni && worker.doc_number && possibleDni !== worker.doc_number) {
        return {
          parsedOrder: order,
          worker,
          matchType,
          confidence: confidence * 0.8,
          errorType: "wrong_dni",
          errorMessage: `Nombre coincide con ${worker.full_name} (DNI: ${worker.doc_number}), pero el texto tiene DNI ${possibleDni}`,
        };
      }

      const errorType = possibleDni ? null : "missing_dni";
      const errorMessage = possibleDni
        ? null
        : `Pedido sin DNI, emparejado por nombre con ${worker.full_name}`;

      return { parsedOrder: order, worker, matchType, confidence, errorType, errorMessage };
    }
  }

  // ── Step 3: DNI not found ──
  if (possibleDni && !dniMap.has(possibleDni)) {
    return {
      parsedOrder: order,
      worker: null,
      matchType: "none",
      confidence: 0,
      errorType: "unmatched",
      errorMessage: `DNI ${possibleDni} no encontrado en la base de datos`,
    };
  }

  // ── Step 4: Nothing matched ──
  return {
    parsedOrder: order,
    worker: null,
    matchType: "none",
    confidence: 0,
    errorType: "unmatched",
    errorMessage: `No se encontro coincidencia para: "${order.rawText}"`,
  };
}

// ─── Name matching ───────────────────────────────────────────────────────────

interface NameMatchResult {
  worker: Worker;
  matchType: MatchType;
  confidence: number;
}

/**
 * Finds a worker by name. All strategies operate on worker.full_name.
 *
 * Strategy A: ≥2 words from the order match words in the worker's full_name.
 *   Handles "Carlos Padilla" vs "PADILLA CARLOS" — order doesn't matter.
 *
 * Strategy B: Single word — find workers where that word is contained in full_name.
 *   If exactly 1 match → return it.
 */
function findByName(
  possibleNames: string[],
  workers: Worker[]
): NameMatchResult | null {
  const orderWords = possibleNames.flatMap((n) => words(n));
  if (orderWords.length === 0) return null;

  // ── Strategy A: Multi-word match (≥2 matching words) ──
  if (orderWords.length >= 2) {
    const scored = workers
      .map((w) => {
        const wWords = words(w.full_name);
        const matchCount = orderWords.filter((ow) =>
          wWords.some((ww) => ww === ow || ww.startsWith(ow) || ow.startsWith(ww))
        ).length;
        return { worker: w, matchCount };
      })
      .filter((s) => s.matchCount >= 2)
      .sort((a, b) => b.matchCount - a.matchCount);

    if (scored.length === 1) {
      return { worker: scored[0].worker, matchType: "fuzzy_name", confidence: 0.95 };
    }
    // Multiple workers with same score — try to break tie with more matches
    if (scored.length > 1 && scored[0].matchCount > scored[1].matchCount) {
      return { worker: scored[0].worker, matchType: "fuzzy_name", confidence: 0.9 };
    }
  }

  // ── Strategy B: Single-word match ──
  // Also used as fallback when multi-word had 0 or tied results
  for (const ow of orderWords) {
    if (ow.length < 3) continue;
    const matches = workers.filter((w) =>
      words(w.full_name).some(
        (ww) => ww === ow || ww.startsWith(ow) || ow.startsWith(ww)
      )
    );
    if (matches.length === 1) {
      return { worker: matches[0], matchType: "single_name", confidence: 0.7 };
    }
  }

  return null;
}

/**
 * Checks whether the possibleNames from the parsed order plausibly
 * match the worker's full_name.
 */
function nameMatchesWorker(possibleNames: string[], worker: Worker): boolean {
  const orderWords = possibleNames.flatMap((n) => words(n));
  if (orderWords.length === 0) return true;
  const wWords = words(worker.full_name);
  return orderWords.some((ow) =>
    wWords.some((ww) => ww === ow || ww.startsWith(ow) || ow.startsWith(ww))
  );
}
