/**
 * WhatsApp TXT Parser for Sylvia's House
 *
 * Parses exported WhatsApp group chat TXT files and extracts:
 *   - Date announcements (meal date headers sent by the concessionaire)
 *   - Individual meal orders (name + DNI + optional food items)
 *   - "Adicionales" (extra/additional meals)
 *   - New worker announcements
 *
 * The parser handles the wide variety of formats found in real WhatsApp exports.
 */

import type {
  ParseResult,
  ParsedOrder,
  DetectedNewWorker,
  ParseErrorEntry,
  UploadConfig,
} from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Patterns for lines that should be completely ignored.
 */
const IGNORE_PATTERNS: RegExp[] = [
  /Se eliminó este mensaje/i,
  /Eliminaste este mensaje/i,
  /<Multimedia omitido>/i,
  /Cambió tu código de seguridad con/i,
  /añadió a ~/i,
  /Se añadió a/i,
  /salió del grupo/i,
  /\*ENTRADAS\*/i,
  /\*PLATOS DE FONDO\*/i,
  // NOTE: REFRESCO and POSTRE are intentionally NOT here — they appear in
  // legitimate order lines like "12. Juan Perez/73008708/refresco" and
  // "16. Orlando Navarro/73008708/postre 🐒". isFoodItem() handles them
  // correctly by stripping them from name extraction without ignoring the line.
  /\*DIETA\*/i,
  /^\s*Total\s+\d+\s+(almuerzos?|cenas?)/i,
  /^\s*\d+\s+(almuerzos?|cenas?)\s*$/i,
  /^\s*\+?\d+\s+gaseosas?\s*$/i,
  /Se validan?\s+\d+/i,
  /^\s*\*?\d+\s+(CENAS?|ALMUERZOS?)\s+HOY\*?\s*\?*$/i,
  /^\s*Cenas?\s+Hoy\s*\?+\s*$/i,
  /^\s*\*?SE AGOTÓ/i,
  /^\s*CHICLE\??\s*$/i,
  /^\s*\*?ES AL VAPOR\*?\s*$/i,
  /^\s*Gracias\s*$/i,
  /^\s*Ok\s*$/i,
  /^\s*Buenos?\s+d[ií]as?\s*$/i,
  /^\s*Buenas?\s+tardes?\s*$/i,
  /^\s*Buenas?\s+noches?\s*$/i,
  /Qui[eé]n valid[oó] eso/i,
  /^\s*\d{1,2}\s*$/,
];

/**
 * Emoji stripping regex — covers the vast majority of emoji ranges.
 */
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE0F}\u{200D}]/gu;

// ─── WhatsApp message line regex ─────────────────────────────────────────────

/**
 * Matches the WhatsApp timestamp header.
 * Format: [DD/MM/YYYY, HH:MM:SS] Sender: message
 * Some exports also use DD/MM/YY or other variations.
 */
const WA_LINE_REGEX =
  /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?)\]?\s*[-–]?\s*(.+?):\s([\s\S]*)$/i;

// ─── Date detection regexes ──────────────────────────────────────────────────

/** Format 1: ALMUERZO DD-MM-YY or DD/MM/YYYY */
const DATE_ALMUERZO = /ALMUERZO\s+(\d{2})\s*[-/]\s*(\d{2})\s*[-/]\s*(\d{2,4})/i;

/** Format 2: ESTIMADOS ... SABADO/DOMINGO DD-MM-YY */
const DATE_ESTIMADOS =
  /ESTIMADOS[\s\S]*?(\d{2})\s*[-/]\s*(\d{2})\s*[-/]\s*(\d{2,4})/i;

/** Format 3: REALICEN ... DD-MM-YYYY or DD/MM/YYYY */
const DATE_REALICEN =
  /REALICEN[\s\S]*?(\d{2})\s*[-/]\s*(\d{2})\s*[-/]\s*(\d{2,4})/i;

/** Generic fallback: any Concesionario/Consecionario message with a date */
const DATE_GENERIC_CONCESIONARIO =
  /(?:Con[cs]e[cs]ionari[oa])\s+Sylvia'?s?\s+House[\s\S]*?(\d{2})\s*[-/]\s*(\d{2})\s*[-/]\s*(\d{2,4})/i;

// ─── Adicionales detection ───────────────────────────────────────────────────

/** STAFF pattern: "05+01", "05 + 01", "+02 ADICIONALES" */
const ADICIONALES_STAFF_PLUS =
  /\+\s*(\d{1,2})\s*(?:ADICIONAL(?:ES)?)?/i;

/** STAFF pattern: "SE ENTREG[OÓ] ... + NN ADICIONALES" */
const ADICIONALES_ENTREGO =
  /\+\s*(\d{1,2})\s+ADICIONAL(?:ES)?/i;

/** PATIO/APT: "cena adicional", "almuerzo adicional", "menu adicional", "dieta adicional", "pure adicional" */
const ADICIONALES_SINGLE =
  /(?:una?\s+)?(?:cena|almuerzo|men[uú]|dieta|pur[eé]|comida)\s+adicional/i;

/** Numeric adicionales: "3 cenas" when preceded by "SE ENTREGAN" */
const ADICIONALES_SE_ENTREGAN =
  /SE\s+ENTREGAN?\s+(\d{1,2})\s+(?:cenas?|almuerzos?)/i;

/** "AGREGAR UN ADICIONAL" / "AGREGAR COMO ADICIONALES" */
const ADICIONALES_AGREGAR =
  /AGREGAR\s+(?:UN\s+)?(?:COMO\s+)?ADICIONAL(?:ES)?/i;

/** "01 adicional" pattern from APT CENAS */
const ADICIONALES_NUMERIC =
  /(\d{1,2})\s+adicional/i;

// ─── New worker detection ────────────────────────────────────────────────────

const NEW_WORKER_ANNOUNCE = /SE\s+AGREGA\s+NUEVO\s+PERSONAL/i;

// ─── DNI extraction ──────────────────────────────────────────────────────────

/**
 * Finds 8- or 9-digit number sequences that could be a DNI.
 * We look for sequences NOT preceded/followed by other digits.
 */
const DNI_REGEX = /(?<!\d)(\d{8,9})(?!\d)/;

// ─── Main parser function ────────────────────────────────────────────────────

export function parseWhatsAppTxt(
  content: string,
  groupName: string,
  config?: UploadConfig
): ParseResult {
  const result: ParseResult = {
    orders: [],
    newWorkers: [],
    adicionales: {},
    ignoredLines: [],
    errors: [],
  };

  // Split content into WhatsApp message blocks, then deduplicate edited messages.
  // WhatsApp exports both the original and the edited version of a message (same
  // sender+timestamp, edited copy appears later). Keeping only the last occurrence
  // prevents the same order from being parsed twice under different currentDates.
  const messages = deduplicateMessages(splitIntoMessages(content));

  let currentDate: string | null = null;
  let lineCounter = 0;
  const _WATCH_DNIS = new Set(["76633825", "61471222"]); // Marcos Meza, Carlos Flores

  for (const msg of messages) {
    const { sender, body, timestamp } = msg;
    const fullText = body.trim();

    if (!fullText) continue;

    // ── Check if this is a Sylvia's House message ──
    const isSylvia = isSylviaMessage(sender);

    // ── Try to detect a date announcement (any sender) ──
    // We check every message because in APT ALMUERZOS, PRODUCCION, STAFF and PATIO
    // the "ALMUERZO DD-MM-YY" / "ESTIMADOS..." announcements are sometimes sent by
    // contacts not recognized as Sylvia (e.g. phone numbers, group admins).
    //
    // The previous attempt to restrict this to isSylvia-only was WRONG: it froze
    // currentDate at day 7 for APT ALMUERZOS because day 8+ announcements came from
    // a non-Sylvia sender and were silently ignored.
    //
    // The actual fix for false double-processing is deduplicateMessages() above,
    // which removes the edited-message duplicates that caused the original date bug.
    {
      const detectedDate = detectDate(fullText);
      if (detectedDate) {
        console.log(`[CURRENT-DATE] ts="${timestamp}" sender="${sender}" isSylvia=${isSylvia} prev="${currentDate}" new="${detectedDate}" text="${fullText.replace(/\n/g, " ").slice(0, 100)}"`);
        currentDate = detectedDate;
        if (!isSylvia) {
          // Non-Sylvia date announcement — update currentDate then skip to next message.
          // (A non-Sylvia sender would never have orders in the same message body.)
          continue;
        }
        // Sylvia: fall through — the same message may have an order list below the header.
      } else if (isSylvia && /REALICEN|ALMUERZO|ESTIMADOS/i.test(fullText)) {
        console.log(`[CURRENT-DATE-MISS] ts="${timestamp}" sender="${sender}" NO DATE from: "${fullText.replace(/\n/g, " ").slice(0, 100)}"`);
      }
    }

    if (isSylvia) {
      // ── Check for ADICIONALES ──
      if (currentDate) {
        const adicCount = detectAdicionales(fullText, groupName);
        if (adicCount > 0) {
          result.adicionales[currentDate] =
            (result.adicionales[currentDate] || 0) + adicCount;
          continue;
        }
      }

      // ── Check for new worker announcements ──
      if (NEW_WORKER_ANNOUNCE.test(fullText)) {
        const newWorkers = parseNewWorkers(fullText, body, groupName);
        result.newWorkers.push(...newWorkers);

        // Only fall through to the order pipeline if the message also contains
        // numbered order lines BELOW the announcement header (e.g.
        // "SE AGREGA NUEVO PERSONAL...\n41. Espino/44991002/adicional").
        // Lines like "Espino Ruben/44991002" are new-worker entries, NOT orders,
        // so if none of the body lines look like a numbered order we skip now.
        const bodyAfterHeader = fullText
          .replace(/SE\s+AGREGA\s+NUEVO\s+PERSONAL\s+AL\s+GRUPO\s*:[^\n]*/i, "")
          .trim();
        const hasNumberedOrders = /^\d{1,2}\s*[\.\-\/\*\)\:]/m.test(bodyAfterHeader);
        if (!hasNumberedOrders) {
          result.ignoredLines.push(fullText);
          continue;
        }
        // fall through to looksLikeOrderCompilation for the numbered lines
      }

      // ── Sylvia message that looks like an order compilation (numbered lines / DNIs) ──
      // e.g. "41. Espino Ruben/44991002/adicional" sent by Mary ILM as a list
      if (currentDate && looksLikeOrderCompilation(fullText)) {
        const orderLines = splitOrderLines(fullText);
        for (const line of orderLines) {
          lineCounter++;
          const cleaned = cleanOrderLine(line);
          if (!cleaned || cleaned.length < 2) continue;
          if (shouldIgnore(cleaned)) { result.ignoredLines.push(cleaned); continue; }
          const adicCount = detectAdicionales(cleaned, groupName);
          if (adicCount > 0) {
            result.adicionales[currentDate] = (result.adicionales[currentDate] || 0) + adicCount;
            continue;
          }
          if (!looksLikeOrder(line, cleaned)) { result.ignoredLines.push(cleaned); continue; }
          if (config && !dateMatchesConfig(currentDate, config)) continue;
          const parsed = parseOrderLine(cleaned, currentDate, lineCounter, timestamp);
          if (parsed) {
            if (parsed.isAdditional && /PATIO/i.test(groupName)) {
              result.adicionales[currentDate] = (result.adicionales[currentDate] || 0) + 1;
            } else {
              if (parsed.possibleDni && _WATCH_DNIS.has(parsed.possibleDni)) {
                console.log(`[ORDER-DATE] ts="${timestamp}" dni=${parsed.possibleDni} order_date="${parsed.date}" currentDate="${currentDate}" raw="${cleaned}" (Sylvia compilation)`);
              }
              result.orders.push(parsed);
            }
          }
        }
        continue;
      }

      // ── Ignore other Sylvia messages (menus, counts, etc.) ──
      result.ignoredLines.push(fullText);
      continue;
    }

    // ── Non-Sylvia message ──

    if (shouldIgnore(fullText)) {
      result.ignoredLines.push(fullText);
      continue;
    }

    // ── Check for ADICIONALES from non-Sylvia senders ──
    if (currentDate) {
      const adicCount = detectAdicionales(fullText, groupName);
      if (adicCount > 0) {
        result.adicionales[currentDate] =
          (result.adicionales[currentDate] || 0) + adicCount;
        continue;
      }
    }

    // ── No date set yet? Skip non-date messages ──
    if (!currentDate) {
      result.ignoredLines.push(fullText);
      continue;
    }

    // ── Filter by upload config ──
    if (config && !dateMatchesConfig(currentDate, config)) {
      continue;
    }

    // ── Process potential order lines ──
    // The body may contain multiple order lines (multiline message)
    const orderLines = splitOrderLines(fullText);

    for (const line of orderLines) {
      lineCounter++;
      const cleaned = cleanOrderLine(line);
      if (!cleaned || cleaned.length < 2) continue;

      // Is it a conversational / ignore line?
      if (shouldIgnore(cleaned)) {
        result.ignoredLines.push(cleaned);
        continue;
      }

      // Check if it looks like an adicional from non-Sylvia
      const singleAdic = detectAdicionales(cleaned, groupName);
      if (singleAdic > 0) {
        result.adicionales[currentDate] =
          (result.adicionales[currentDate] || 0) + singleAdic;
        continue;
      }

      // Gate: only treat as an order if the line structurally looks like one.
      // Lines that don't pass are silently ignored — NOT reported as errors.
      if (!looksLikeOrder(line, cleaned)) {
        result.ignoredLines.push(cleaned);
        continue;
      }

      const parsed = parseOrderLine(cleaned, currentDate, lineCounter, timestamp);
      if (parsed) {
        if (parsed.isAdditional && /PATIO/i.test(groupName)) {
          result.adicionales[currentDate] = (result.adicionales[currentDate] || 0) + 1;
        } else {
          if (parsed.possibleDni && _WATCH_DNIS.has(parsed.possibleDni)) {
            console.log(`[ORDER-DATE] ts="${timestamp}" sender="${sender}" dni=${parsed.possibleDni} order_date="${parsed.date}" currentDate="${currentDate}" raw="${cleaned}"`);
          }
          result.orders.push(parsed);
        }
      } else {
        // Could not extract meaningful data even though it looked like an order
        result.errors.push({
          rawText: cleaned,
          date: currentDate,
          errorType: "bad_format",
          message: `No se pudo interpretar la linea: "${cleaned}"`,
        });
      }
    }
  }

  return result;
}

// ─── Message splitting ───────────────────────────────────────────────────────

interface WaMessage {
  timestamp: string;
  sender: string;
  body: string;
}

/**
 * Matches any line that starts with a WhatsApp timestamp, regardless of
 * whether it has a sender:message format. Used to detect system messages
 * (e.g. "Cambió tu código de seguridad") that don't match WA_LINE_REGEX
 * but still mark the boundary of a new event.
 */
const WA_TIMESTAMP_ONLY =
  /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/;

/**
 * Splits the raw WhatsApp export into individual messages.
 * Each message starts with a timestamp line; continuation lines
 * (no timestamp) belong to the previous message.
 *
 * System messages (timestamp present but no sender:message colon) are
 * treated as message boundaries — they end the previous message without
 * starting a new one, preventing their text from contaminating the
 * previous message's body.
 */
function splitIntoMessages(content: string): WaMessage[] {
  const messages: WaMessage[] = [];
  const lines = content.split(/\r?\n/);

  let current: WaMessage | null = null;

  for (const line of lines) {
    const match = WA_LINE_REGEX.exec(line);
    if (match) {
      // Full sender:message line — start a new message
      if (current) messages.push(current);
      current = {
        timestamp: `${match[1]} ${match[2]}`,
        sender: match[3].trim(),
        body: match[4] ?? "",
      };
    } else if (WA_TIMESTAMP_ONLY.test(line)) {
      // Timestamp-only line (system message, no sender colon) — close the
      // current message without appending this line to its body
      if (current) messages.push(current);
      current = null;
    } else if (current) {
      // Genuine continuation line (no timestamp at all)
      current.body += "\n" + line;
    }
    // Lines before the first timestamp are ignored
  }

  if (current) messages.push(current);

  return messages;
}

/** Matches the WhatsApp edit annotation appended to edited message bodies. */
const EDIT_TAG_REGEX = /<Se edit[oó] este mensaje\.?>/i;

/**
 * Removes duplicate messages caused by WhatsApp's edit history.
 *
 * When a user edits a message, WhatsApp exports the original AND the edited
 * version as separate entries — both with the exact same (sender, timestamp).
 * The edited entry appears later in the file. Processing both causes the same
 * order to be parsed twice, often under different currentDate values.
 *
 * IMPORTANT: In some groups (e.g. APT ALMUERZOS) a sender legitimately sends
 * multiple DIFFERENT messages within the same minute — for example the main menu
 * and a separate diet menu. These are NOT duplicates and must both be kept.
 *
 * Strategy:
 *   - If the newer body contains "<Se editó>" or the bodies are identical
 *     → replace the earlier occurrence in-place (true duplicate / edit).
 *   - Otherwise → keep both messages (different content, coincident timestamp).
 */
function deduplicateMessages(messages: WaMessage[]): WaMessage[] {
  const seen = new Map<string, number>(); // key → index of first occurrence in result[]
  const result: WaMessage[] = [];

  for (const msg of messages) {
    const key = `${msg.sender}\x00${msg.timestamp}`;
    if (seen.has(key)) {
      const prevIdx = seen.get(key)!;
      const prev = result[prevIdx];
      const isEdit =
        EDIT_TAG_REGEX.test(msg.body) ||
        EDIT_TAG_REGEX.test(prev.body) ||
        msg.body === prev.body;

      if (isEdit) {
        // True duplicate or edited message — replace earlier with newer in-place
        result[prevIdx] = msg;
      } else {
        // Different bodies, same (sender, timestamp) — legitimately separate
        // messages sent within the same minute. Keep both.
        result.push(msg);
        // Don't update seen — keep pointing to the first occurrence so future
        // collisions with this key are compared against the original, not this one.
      }
    } else {
      seen.set(key, result.length);
      result.push(msg);
    }
  }

  return result;
}

// ─── Sender identification ───────────────────────────────────────────────────

function isSylviaMessage(sender: string): boolean {
  const s = sender.toLowerCase();
  return (
    s.includes("consecionario") ||
    s.includes("concesionario") ||
    s.includes("sylvia") ||
    s.includes("mary ilm")
  );
}

// ─── Date detection ──────────────────────────────────────────────────────────

/**
 * Tries to extract a date from a Sylvia's House announcement message.
 * Returns an ISO date string (YYYY-MM-DD) or null.
 *
 * Pre-cleans the text (removes asterisks and edit tags) so that formats like
 * "*REALICEN SUS PEDIDOS DE CENA | APT - 08/03/2026* <Se editó este mensaje.>"
 * are matched correctly regardless of WhatsApp formatting decorators.
 */
function detectDate(text: string): string | null {
  // Strip WhatsApp formatting before matching
  const clean = text
    .replace(/<Se editó este mensaje\.?>/gi, "")
    .replace(/\*/g, "")
    .trim();

  let m: RegExpExecArray | null;

  m = DATE_ALMUERZO.exec(clean);
  if (m) return buildDate(m[1], m[2], m[3]);

  m = DATE_REALICEN.exec(clean);
  if (m) return buildDate(m[1], m[2], m[3]);

  m = DATE_ESTIMADOS.exec(clean);
  if (m) return buildDate(m[1], m[2], m[3]);

  m = DATE_GENERIC_CONCESIONARIO.exec(clean);
  if (m) return buildDate(m[1], m[2], m[3]);

  return null;
}

/**
 * Builds a YYYY-MM-DD string from DD, MM, YY/YYYY parts.
 */
function buildDate(dd: string, mm: string, yy: string): string {
  const day = dd.padStart(2, "0");
  const month = mm.padStart(2, "0");
  let year = yy;
  if (year.length === 2) {
    year = "20" + year;
  }
  return `${year}-${month}-${day}`;
}

// ─── Upload config filtering ─────────────────────────────────────────────────

function dateMatchesConfig(date: string, config: UploadConfig): boolean {
  switch (config.mode) {
    case "full_file":
      return true;
    case "specific_day":
      return date === config.specificDate;
    case "date_range":
      return date >= (config.startDate ?? "") && date <= (config.endDate ?? "");
    default:
      return true;
  }
}

// ─── Order gate ──────────────────────────────────────────────────────────────

/**
 * Returns true if a Sylvia message body contains numbered order lines with DNIs
 * (e.g. a compilation list sent back by the concessionaire).
 *
 * Lines that are themselves date-announcement headers (e.g.
 * "REALICEN SUS PEDIDOS DE CENA | APT - 08/03/2026") are skipped so that the
 * "/" in a date like "08/03/2026" does not trigger the slash-separator check in
 * looksLikeOrder and cause a pure date announcement to be misclassified as an
 * order compilation.
 */
function looksLikeOrderCompilation(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.some((line) => {
    // If this line is a date header itself, don't count it as an order line
    if (detectDate(line)) return false;
    const cleaned = cleanOrderLine(line);
    return looksLikeOrder(line, cleaned);
  });
}

/**
 * Returns true only if a line structurally looks like a meal order.
 * Lines that fail this check are silently ignored — never reported as errors.
 *
 * A line qualifies as a potential order if it meets at least ONE of:
 *   1. Contains an 8- or 9-digit DNI
 *   2. Starts with a numbered entry (e.g. "1.", "2-", "3 NOMBRE")
 *   3. Contains a slash separator (structured format: "NOMBRE/DNI", "NOMBRE/COMIDA")
 *
 * @param rawLine   — the line as it came out of splitOrderLines (number prefix intact)
 * @param cleaned   — the line after cleanOrderLine (number prefix stripped)
 */
function looksLikeOrder(rawLine: string, cleaned: string): boolean {
  // 1. Has an 8-9 digit DNI (check both forms — cleaning doesn't remove digits)
  if (DNI_REGEX.test(cleaned)) return true;

  // 2. Raw line starts with a numbered entry followed by a separator or a name
  //    Covers: "1. ", "2- ", "3/ ", "1*", "1)" and "3 NOMBRE"
  if (/^\*?\d{1,2}\s*([\.\-\/\*\)]|\s+[A-ZÁÉÍÓÚÑ])/i.test(rawLine.trim())) return true;

  // 3. Contains slash separators (field-delimited format: "NOMBRE/DNI/COMIDA")
  if (cleaned.includes("/")) return true;

  return false;
}

// ─── Ignore rules ────────────────────────────────────────────────────────────

function shouldIgnore(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // Pure emoji messages
  const withoutEmoji = trimmed.replace(EMOJI_REGEX, "").trim();
  if (!withoutEmoji) return true;

  return false;
}

// ─── Adicionales detection ───────────────────────────────────────────────────

function detectAdicionales(text: string, groupName: string): number {
  const upper = text.toUpperCase();

  // Numbered adicional sent by a worker: "36. ADICIONAL." / "37. ADICIONAL"
  // Each such line represents exactly 1 adicional.
  if (/^\d{1,2}\s*[\.\-]\s*ADICIONAL\.?\s*$/i.test(text.trim())) {
    return 1;
  }

  // "SE ENTREGAN N cenas/almuerzos" combined with AGREGAR/ADICIONAL
  if (ADICIONALES_AGREGAR.test(text)) {
    const seEntreganMatch = ADICIONALES_SE_ENTREGAN.exec(text);
    if (seEntreganMatch) return parseInt(seEntreganMatch[1], 10);

    const numericMatch = ADICIONALES_NUMERIC.exec(text);
    if (numericMatch) return parseInt(numericMatch[1], 10);

    return 1;
  }

  // STAFF: "+NN ADICIONALES" or "NN+NN"
  if (
    groupName.toUpperCase().includes("STAFF") ||
    groupName.toUpperCase().includes("PRODUCCIÓN") ||
    groupName.toUpperCase().includes("PRODUCCION")
  ) {
    if (ADICIONALES_ENTREGO.test(text)) {
      const m = ADICIONALES_ENTREGO.exec(text);
      if (m) return parseInt(m[1], 10);
    }
    // "05+01" pattern or "05 + 01" at start of Sylvia message
    const plusMatch = /(\d{1,2})\s*\+\s*(\d{1,2})/.exec(text);
    if (plusMatch && upper.includes("ADICIONAL")) {
      return parseInt(plusMatch[2], 10);
    }
    if (plusMatch && !upper.includes("ADICIONAL")) {
      // "05+01 @..." pattern — the second number is adicionales
      // Only if it looks like a count line (short message)
      if (text.length < 80) {
        return parseInt(plusMatch[2], 10);
      }
    }
  }

  // Single adicional patterns (any group)
  if (ADICIONALES_SINGLE.test(text)) {
    return 1;
  }

  // "N adicional(es)"
  if (ADICIONALES_NUMERIC.test(text) && upper.includes("ADICIONAL")) {
    const m = ADICIONALES_NUMERIC.exec(text);
    if (m) return parseInt(m[1], 10);
  }

  return 0;
}

// ─── New worker parsing ──────────────────────────────────────────────────────

function parseNewWorkers(
  text: string,
  fullBody: string,
  groupName: string
): DetectedNewWorker[] {
  const workers: DetectedNewWorker[] = [];

  // Get everything after "SE AGREGA NUEVO PERSONAL AL GRUPO:"
  const afterAnnounce = fullBody.split(/SE\s+AGREGA\s+NUEVO\s+PERSONAL\s+AL\s+GRUPO\s*:\s*/i);
  if (afterAnnounce.length < 2) return workers;

  const rest = afterAnnounce[1];
  // Each worker on its own line: "Name/DNI" or "Name DNI"
  const lines = rest.split(/\r?\n/).filter((l) => l.trim());

  for (const line of lines) {
    const cleaned = line.trim();
    if (!cleaned) continue;

    // Skip WhatsApp system notification lines
    if (/añadió a ~/i.test(cleaned)) continue;
    if (/Se añadió a/i.test(cleaned)) continue;
    if (/salió del grupo/i.test(cleaned)) continue;
    // Skip lines that look like a WhatsApp timestamp
    if (/^\[?\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cleaned)) continue;
    // Skip lines that look like numbered orders (e.g. "41. Espino/44991002/adicional")
    // — those are orders, not new worker entries; they're handled by the order pipeline
    if (/^\d{1,2}\s*[\.\-\/\*\)\:]/.test(cleaned)) continue;

    // Try to extract name and DNI
    const dniMatch = DNI_REGEX.exec(cleaned);
    const dni = dniMatch ? dniMatch[1] : "";
    const namePart = cleaned
      .replace(DNI_REGEX, "")
      .replace(/[/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (namePart) {
      workers.push({
        name: namePart,
        docNumber: dni,
        groupName,
      });
    }
  }

  return workers;
}

// ─── Order line splitting ────────────────────────────────────────────────────

/**
 * A single WhatsApp message body may contain:
 *   - One order (possibly multiline with \n for food items)
 *   - Multiple orders (numbered list)
 *
 * We split on lines that start with a new order number.
 */
function splitOrderLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line starts a new numbered order
    // Pattern: optional "*", digits, optional separator (. - / *), then content
    if (/^\*?\d{1,2}\s*[\.\-\/\*)\s]/.test(trimmed) || /^\*?\d{1,2}[A-Za-zÁ-Úá-ú]/.test(trimmed)) {
      if (current) result.push(current);
      current = trimmed;
    } else if (current) {
      // Continuation of previous order (food items on new line)
      current += " " + trimmed;
    } else {
      // Non-numbered line that starts a new entry
      current = trimmed;
    }
  }

  if (current) result.push(current);

  return result;
}

// ─── Order line cleaning ─────────────────────────────────────────────────────

/**
 * Cleans an order line by removing:
 *   - Leading order number and separator
 *   - Asterisks (bold markers)
 *   - Emojis
 *   - "<Se edito este mensaje.>" tags
 *   - Trailing periods
 *   - "Bns Ds" / "Buenos dias" prefixes
 */
function cleanOrderLine(line: string): string {
  let s = line.trim();

  // Remove "<Se editó este mensaje.>" but keep rest
  s = s.replace(/<Se editó este mensaje\.?>/gi, "");

  // Remove leading asterisks
  s = s.replace(/^\*+/, "").replace(/\*+$/, "");

  // Remove leading order number + separator
  // Patterns: "1.", "1-", "1/", "1 ", "1*", "12-.", etc.
  s = s.replace(/^\d{1,2}\s*[\.\-\/\*)\:]?\s*[\.\-]?\s*/, "");

  // Remove emojis
  s = s.replace(EMOJI_REGEX, "");

  // Remove "Bns Ds" / "Bns Dias" / "Buenos dias" prefix
  s = s.replace(/^Bns\s+D[ias]*\s*/i, "");
  s = s.replace(/^Buenos?\s+d[ií]as?\s*/i, "");

  // Remove trailing periods and asterisks
  s = s.replace(/[\.\*]+$/, "");

  // Normalize whitespace
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

// ─── Order line parsing ──────────────────────────────────────────────────────

/**
 * Parses a cleaned order line to extract possible DNI and name parts.
 *
 * Order lines have highly variable format. The strategy:
 * 1. Find any 8-9 digit sequence (DNI)
 * 2. Split the remaining text by separators (/ : - & space)
 * 3. Identify name-like tokens vs food-like tokens
 * 4. Return what we find
 */
function parseOrderLine(
  cleaned: string,
  date: string,
  lineNumber: number,
  messageTimestamp: string | null = null
): ParsedOrder | null {
  if (!cleaned || cleaned.length < 2) return null;

  // Extract DNI
  const dniMatch = DNI_REGEX.exec(cleaned);
  const possibleDni = dniMatch ? dniMatch[1] : null;

  // Remove DNI from text for name extraction
  let textWithoutDni = cleaned;
  if (possibleDni) {
    textWithoutDni = cleaned.replace(possibleDni, "").trim();
  }

  // Split by common separators
  const parts = textWithoutDni
    .split(/[\/\:\&\|]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Identify name parts vs food parts
  const possibleNames: string[] = [];
  let isAdditional = false;

  for (const part of parts) {
    const lower = part.toLowerCase().trim();

    // Check for "adicional" keyword
    if (/adicional/i.test(lower)) {
      isAdditional = true;
    }

    // Food-related keywords — these are NOT names
    if (isFoodItem(lower)) {
      // Check for "cena" or "cen" which is also a valid order indicator
      continue;
    }

    // If the part contains mostly alphabetic characters, it could be a name
    const alphaChars = part.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "").trim();
    if (alphaChars.length >= 2) {
      possibleNames.push(alphaChars);
    }
  }

  // If we have neither DNI nor name, this is not a valid order
  if (!possibleDni && possibleNames.length === 0) return null;

  return {
    rawText: cleaned,
    possibleDni,
    possibleNames,
    date,
    isAdditional,
    lineNumber,
    messageTimestamp,
  };
}

// ─── Food detection ──────────────────────────────────────────────────────────

/**
 * Common food items and related words that should NOT be treated as names.
 */
const FOOD_KEYWORDS = [
  "papa",
  "huanca[ií]na",
  "arroz",
  "pollo",
  "sopa",
  "lentejas",
  "lomo",
  "trigo",
  "broster",
  "menestron",
  "menestra",
  "pure",
  "pur[eé]",
  "ceviche",
  "tallarines",
  "frijoles",
  "payares",
  "pallares",
  "estofado",
  "guiso",
  "fideos",
  "chanfainita",
  "bisteck",
  "bistec",
  "lenteja",
  "frejol",
  "tacu",
  "vapor",
  "saltado",
  "escabeche",
  "chaufa",
  "aguadito",
  "adobo",
  "sudado",
  "pescado",
  "cau",
  "olluquito",
  "carapulcra",
  "aji",
  "aj[ií]",
  "gallina",
  "mon?donguito",
  "refresco",
  "gaseosa",
  "postre",
  "ensalada",
  "con",
];

const FOOD_EXACT = [
  "cena",
  "cenas",
  "cen",
  "almuerzo",
  "almuerzos",
  "dieta",
  "dieta blanda",
  "dieta normal",
  "men[uú]",
  "menu",
  "adicional",
];

function isFoodItem(text: string): boolean {
  const lower = text
    .toLowerCase()
    .replace(/[^a-záéíóúñ\s]/g, "")
    .trim();

  // Exact matches
  for (const exact of FOOD_EXACT) {
    if (new RegExp(`^${exact}$`, "i").test(lower)) return true;
  }

  // Keyword containment
  for (const kw of FOOD_KEYWORDS) {
    if (new RegExp(kw, "i").test(lower)) return true;
  }

  return false;
}
