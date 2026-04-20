// ─── Database entity types ───────────────────────────────────────────────────

export interface Group {
  id: string;
  name: string;
  excel_group: string;
  excel_tab: string;
  created_at: string;
}

export interface Worker {
  id: string;
  group_id: string;
  full_name: string;
  doc_number: string;
  doc_type: "DNI" | "CE";
  is_active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  worker_id: string | null;
  group_id: string;
  order_date: string; // YYYY-MM-DD
  source: "whatsapp" | "manual";
  notes: string | null;
  is_additional: boolean;
  special_price: number | null;
  special_label: string | null;
  created_at: string;
}

export interface ProcessingLog {
  id: string;
  group_id: string;
  file_name: string | null;
  total_orders: number;
  matched: number;
  unmatched: number;
  new_workers_added: number;
  processed_at: string;
}

export interface ParsingError {
  id: string;
  processing_log_id: string;
  group_id: string;
  worker_id: string | null;
  order_date: string;
  raw_text: string;
  error_type:
    | "wrong_dni"
    | "wrong_name"
    | "missing_dni"
    | "missing_name"
    | "unmatched"
    | "bad_format";
  expected_value: string | null;
  actual_value: string | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  role: "admin" | "client";
  created_at: string;
}

// ─── Parser types ────────────────────────────────────────────────────────────

export interface ParsedOrder {
  rawText: string;
  possibleDni: string | null;
  possibleNames: string[]; // words that look like name parts
  date: string; // YYYY-MM-DD
  isAdditional: boolean;
  lineNumber: number;
  messageTimestamp: string | null; // WhatsApp message timestamp, e.g. "2/3/2026 8:35 a. m."
}

export interface RepeatedOrderGroup {
  workerId: string;
  workerName: string;
  docNumber: string;
  date: string;
  count: number;
  orders: { rawText: string; timestamp: string | null }[];
}

export interface DetectedNewWorker {
  name: string;
  docNumber: string;
  groupName: string;
}

export interface ParseResult {
  orders: ParsedOrder[];
  newWorkers: DetectedNewWorker[];
  adicionales: Record<string, number>; // date -> count
  ignoredLines: string[];
  errors: ParseErrorEntry[];
}

export interface ParseErrorEntry {
  rawText: string;
  date: string;
  errorType: ParsingError["error_type"];
  message: string;
}

// ─── Matcher types ───────────────────────────────────────────────────────────

export type MatchType =
  | "exact_dni"
  | "fuzzy_name"
  | "partial_lastname"
  | "partial_firstname"
  | "single_name"
  | "none";

export interface MatchResult {
  parsedOrder: ParsedOrder;
  worker: Worker | null;
  matchType: MatchType;
  confidence: number; // 0-1
  errorType: ParsingError["error_type"] | null;
  errorMessage: string | null;
}

// ─── Preview types (sent to frontend) ────────────────────────────────────────

export interface ParsePreviewResult {
  groupId: string;
  groupName: string;
  fileName: string;
  matched: MatchResult[];
  unmatched: MatchResult[];
  newWorkers: DetectedNewWorker[];
  adicionales: Record<string, number>;
  errors: ParseErrorEntry[];
  duplicates: DuplicateInfo[];
  repeated: RepeatedOrderGroup[];
  summary: {
    totalOrders: number;
    matchedCount: number;
    unmatchedCount: number;
    adicionalesTotal: number;
    newWorkersCount: number;
    errorsCount: number;
    duplicatesCount: number;
    repeatedCount: number; // number of worker+date groups with >1 order
  };
}

export interface DuplicateInfo {
  workerId: string;
  workerName: string;
  date: string;
  existingOrderId: string;
}

// ─── Process orders request ──────────────────────────────────────────────────

export interface ProcessOrdersRequest {
  groupId: string;
  fileName: string;
  confirmedOrders: ConfirmedOrder[];
  newWorkers: DetectedNewWorker[];
  adicionales: Record<string, number>;
  replaceDuplicates: boolean;
}

export interface ConfirmedOrder {
  workerId: string;
  date: string;
  source: "whatsapp" | "manual";
  notes: string | null;
  rawText: string;
}

export interface ProcessOrdersResult {
  ordersCreated: number;
  ordersReplaced: number;
  newWorkersAdded: number;
  processingLogId: string;
  errors: ParseErrorEntry[];
}

// ─── Worker import types ─────────────────────────────────────────────────────

export interface WorkerImportRow {
  docNumber: string;
  fullName: string;
  rowNumber: number;
}

export interface WorkerImportPreview {
  groupId: string;
  workers: WorkerImportRow[];
  duplicates: WorkerImportRow[];
  newWorkers: WorkerImportRow[];
  totalRows: number;
}

// ─── Upload mode ─────────────────────────────────────────────────────────────

export type UploadMode = "full_file" | "specific_day" | "date_range";

export interface UploadConfig {
  mode: UploadMode;
  specificDate?: string;
  startDate?: string;
  endDate?: string;
}
