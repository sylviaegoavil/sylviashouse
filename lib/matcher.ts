/**
 * Worker Matching Engine for Sylvia's House
 *
 * Matching algorithm (in priority order):
 * 1. Exact DNI match
 * 2. Approximate DNI (8 digits, 1 substitution or transposition) + name corroboration
 * 3. Truncated DNI (7 digits, prefix) + name corroboration
 * 4. All-tokens name match (every token from order present in worker name)
 * 5. Multi-word name match (≥2 matching words)
 * 6. Single-word match
 * 7. Unmatched
 *
 * Rules for (2) and (3):
 *   - Require name corroboration (possibleNames must be present and match)
 *   - Require unique candidate (if >1 worker matches the near-DNI, skip)
 *   - Confidence = 0.70 so they appear in "Requieren revisión"
 */

import type { Worker, ParsedOrder, MatchResult, MatchType } from "./types";

// ─── Text normalization ──────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter((w) => w.length >= 2);
}

// ─── DNI helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if two 8-digit strings differ in exactly 1 position
 * (substitution) or are adjacent-transpositions of each other.
 */
function dniDistance1(a: string, b: string): boolean {
  if (a.length !== b.length || a.length !== 8) return false;
  let diffs = 0;
  for (let i = 0; i < 8; i++) {
    if (a[i] !== b[i]) diffs++;
    if (diffs > 1) return false;
  }
  if (diffs === 1) return true;
  // Check transposition (diffs === 0 already excluded above via early return)
  return false;
}

/**
 * Returns true if two 8-digit strings are a 1-adjacent-transposition apart.
 */
function dniTransposition1(a: string, b: string): boolean {
  if (a.length !== b.length || a.length !== 8) return false;
  for (let i = 0; i < 7; i++) {
    if (a[i] === b[i + 1] && a[i + 1] === b[i]) {
      // Rest must be identical
      const rest = a.slice(0, i) + b[i] + b[i + 1] + a.slice(i + 2);
      if (rest === b) return true;
    }
  }
  return false;
}

function isApproxDni(dni: string, candidate: string): boolean {
  return dniDistance1(dni, candidate) || dniTransposition1(dni, candidate);
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
  if (possibleDni && possibleDni.length === 8) {
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

  // ── Step 2: Approximate DNI (8 digits, 1 substitution/transposition) ──
  // Requires name corroboration and unique candidate.
  if (possibleDni && possibleDni.length === 8 && possibleNames.length > 0) {
    const approxWorker = findByApproxDni(possibleDni, possibleNames, workers);
    if (approxWorker) {
      return {
        parsedOrder: order,
        worker: approxWorker,
        matchType: "approx_dni",
        confidence: 0.70,
        errorType: "wrong_dni",
        errorMessage: `DNI ${possibleDni} → ${approxWorker.doc_number} (1 dígito diferente): ${approxWorker.full_name}`,
      };
    }
  }

  // ── Step 3: Truncated DNI (7 digits, prefix match) ──
  // Requires name corroboration and unique candidate.
  if (possibleDni && possibleDni.length === 7 && possibleNames.length > 0) {
    const truncWorker = findByTruncatedDni(possibleDni, possibleNames, workers);
    if (truncWorker) {
      return {
        parsedOrder: order,
        worker: truncWorker,
        matchType: "incomplete_dni",
        confidence: 0.70,
        errorType: "wrong_dni",
        errorMessage: `DNI incompleto ${possibleDni} → ${truncWorker.doc_number}: ${truncWorker.full_name}`,
      };
    }
  }

  // ── Step 4: Name-based matching ──
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

  // ── Step 5: DNI not found ──
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

  // ── Step 6: Nothing matched ──
  return {
    parsedOrder: order,
    worker: null,
    matchType: "none",
    confidence: 0,
    errorType: "unmatched",
    errorMessage: `No se encontro coincidencia para: "${order.rawText}"`,
  };
}

// ─── Approximate DNI matching ────────────────────────────────────────────────

function findByApproxDni(
  dni: string,
  possibleNames: string[],
  workers: Worker[]
): Worker | null {
  const matches = workers.filter(
    (w) => w.doc_number && w.doc_number.length === 8 && isApproxDni(dni, w.doc_number)
  );
  if (matches.length !== 1) return null; // ambiguous or no match
  const worker = matches[0];
  if (!nameMatchesWorker(possibleNames, worker)) return null;
  return worker;
}

// ─── Truncated DNI matching ──────────────────────────────────────────────────

function findByTruncatedDni(
  shortDni: string,
  possibleNames: string[],
  workers: Worker[]
): Worker | null {
  const matches = workers.filter(
    (w) => w.doc_number && w.doc_number.startsWith(shortDni)
  );
  if (matches.length !== 1) return null;
  const worker = matches[0];
  if (!nameMatchesWorker(possibleNames, worker)) return null;
  return worker;
}

// ─── Name matching ───────────────────────────────────────────────────────────

interface NameMatchResult {
  worker: Worker;
  matchType: MatchType;
  confidence: number;
}

function findByName(
  possibleNames: string[],
  workers: Worker[]
): NameMatchResult | null {
  const orderWords = possibleNames.flatMap((n) => words(n));
  if (orderWords.length === 0) return null;

  // ── Strategy A0: ALL tokens from order appear in worker name (strictest) ──
  // Better than A for compound names like "David Santa Cruz" → ensures all
  // three tokens match, avoiding false positives from partial overlaps.
  if (orderWords.length >= 2) {
    const allMatches = workers.filter((w) => {
      const wWords = words(w.full_name);
      return orderWords.every((ow) =>
        wWords.some((ww) => ww === ow || ww.startsWith(ow) || ow.startsWith(ww))
      );
    });
    if (allMatches.length === 1) {
      return { worker: allMatches[0], matchType: "fuzzy_name", confidence: 0.92 };
    }
    // If 0 or >1 results, fall through to existing strategies
  }

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
    if (scored.length > 1 && scored[0].matchCount > scored[1].matchCount) {
      return { worker: scored[0].worker, matchType: "fuzzy_name", confidence: 0.9 };
    }
  }

  // ── Strategy B: Single-word match ──
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

function nameMatchesWorker(possibleNames: string[], worker: Worker): boolean {
  const orderWords = possibleNames.flatMap((n) => words(n));
  if (orderWords.length === 0) return true;
  const wWords = words(worker.full_name);
  return orderWords.some((ow) =>
    wWords.some((ww) => ww === ow || ww.startsWith(ow) || ow.startsWith(ww))
  );
}
