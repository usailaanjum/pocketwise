export type InstitutionId =
  | "rbc"
  | "td"
  | "scotiabank"
  | "bmo"
  | "cibc"
  | "national-bank"
  | "amex"
  | "unknown";

export type AccountKind = "credit-card" | "deposit-account";

export type TextFragment = {
  text: string;
  x: number;
  width: number;
};

export type StatementLine = {
  text: string;
  page: number;
  y: number;
  items: TextFragment[];
};

export type ParsedStatementTransaction = {
  transactionDate: string;
  postingDate?: string;
  description: string;
  amountCad: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  category: string;
  monthKey: string;
  confidence: number;
};

export type StatementParseResult = {
  institutionId: InstitutionId;
  institutionName: string;
  accountKind: AccountKind;
  statementMonth?: string;
  transactions: ParsedStatementTransaction[];
  confidence: number;
  warnings: string[];
};

type InstitutionRule = {
  id: Exclude<InstitutionId, "unknown">;
  name: string;
  patterns: RegExp[];
};

type ColumnKind = "debit" | "credit" | "amount" | "balance";

type ColumnHints = {
  page: number;
  headerIndex: number;
  date?: number;
  description?: number;
  debit?: number;
  credit?: number;
  amount?: number;
  balance?: number;
};

export const supportedInstitutions: ReadonlyArray<Pick<InstitutionRule, "id" | "name">> = [
  { id: "rbc", name: "RBC Royal Bank" },
  { id: "td", name: "TD Canada Trust" },
  { id: "scotiabank", name: "Scotiabank" },
  { id: "bmo", name: "BMO Bank of Montreal" },
  { id: "cibc", name: "CIBC" },
  { id: "national-bank", name: "National Bank of Canada" },
  { id: "amex", name: "American Express Canada" },
];

const institutionRules: InstitutionRule[] = [
  {
    id: "amex",
    name: "American Express Canada",
    patterns: [/AMERICAN EXPRESS/i, /AMEX BANK OF CANADA/i, /AMERICANEXPRESS\.CA/i],
  },
  {
    id: "rbc",
    name: "RBC Royal Bank",
    patterns: [/RBC ROYAL BANK/i, /ROYAL BANK OF CANADA/i, /RBCROYALBANK\.COM/i, /RBC\.COM/i],
  },
  {
    id: "td",
    name: "TD Canada Trust",
    patterns: [/TD CANADA TRUST/i, /TORONTO[- ]DOMINION/i, /TDCANADATRUST\.COM/i],
  },
  {
    id: "scotiabank",
    name: "Scotiabank",
    patterns: [/SCOTIABANK/i, /BANK OF NOVA SCOTIA/i, /SCOTIAONLINE/i],
  },
  {
    id: "bmo",
    name: "BMO Bank of Montreal",
    patterns: [/BMO BANK OF MONTREAL/i, /BANK OF MONTREAL/i, /BMO\.COM/i],
  },
  {
    id: "cibc",
    name: "CIBC",
    patterns: [/CANADIAN IMPERIAL BANK OF COMMERCE/i, /CIBC\.COM/i, /\bCIBC\b/i],
  },
  {
    id: "national-bank",
    name: "National Bank of Canada",
    patterns: [/NATIONAL BANK OF CANADA/i, /BANQUE NATIONALE DU CANADA/i, /NBC\.CA/i],
  },
];

const englishMonths: Record<string, number> = {
  JAN: 0, JANUARY: 0, FEB: 1, FEBRUARY: 1, MAR: 2, MARCH: 2,
  APR: 3, APRIL: 3, MAY: 4, JUN: 5, JUNE: 5, JUL: 6, JULY: 6,
  AUG: 7, AUGUST: 7, SEP: 8, SEPT: 8, SEPTEMBER: 8, OCT: 9,
  OCTOBER: 9, NOV: 10, NOVEMBER: 10, DEC: 11, DECEMBER: 11,
};

const frenchMonths: Record<string, number> = {
  JANV: 0, JANVIER: 0, FEV: 1, FEVR: 1, FEVRIER: 1, MARS: 2,
  AVR: 3, AVRIL: 3, MAI: 4, JUIN: 5, JUIL: 6, JUILLET: 6,
  AOU: 7, AOUT: 7, SEPT: 8, SEPTEMBRE: 8, OCT: 9, OCTOBRE: 9,
  NOV: 10, NOVEMBRE: 10, DEC: 11, DECEMBRE: 11,
};

const months = { ...englishMonths, ...frenchMonths };
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const monthToken = "(?:JAN(?:UARY|V(?:IER)?)?|F(?:EB(?:RUARY)?|EV(?:R(?:IER)?)?)|MAR(?:CH|S)?|APR(?:IL)?|AVR(?:IL)?|MAY|MAI|JUN(?:E)?|JUIN|JUL(?:Y)?|JUIL(?:LET)?|AUG(?:UST)?|AOU(?:T)?|SEP(?:T(?:EMBER|EMBRE)?)?|OCT(?:OBER|OBRE)?|NOV(?:EMBER|EMBRE)?|DEC(?:EMBER|EMBRE)?)\\.?";
const rowDateToken = `(?:${monthToken}\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}\\s+${monthToken}(?:\\s+\\d{4})?|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|\\d{4}-\\d{1,2}-\\d{1,2})`;
const fullDateRegex = new RegExp(`(?:${monthToken}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+${monthToken}\\s+\\d{4}|\\d{4}-\\d{1,2}-\\d{1,2})`, "gi");
const leadingDateRegex = new RegExp(`^(${rowDateToken})(?:\\s+|$)`, "i");
const moneyToken = "(?:\\(?(?:-\\s*)?(?:CAD\\s*)?\\$?\\s*\\d[\\d,]*\\.\\d{2}\\)?(?:\\s*CR)?|\\$\\s*-\\s*\\d[\\d,]*\\.\\d{2})";
const moneyOnly = new RegExp(`^${moneyToken}$`, "i");
const twoDateRow = new RegExp(`^(${rowDateToken})\\s+(${rowDateToken})\\s+(.+?)\\s+(${moneyToken})(?=\\s|$)`, "i");
const oneDateRow = new RegExp(`^(${rowDateToken})\\s+(.+?)\\s+(${moneyToken})(?=\\s|$)`, "i");

// Remove accents and extra spaces so statement text matches consistently.
function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Read a printed amount, including parentheses or CR markers for credits.
function parseMoney(value: string) {
  const normalized = value.trim();
  const negative = normalized.startsWith("-")
    || normalized.startsWith("(")
    || /\$\s*-/i.test(normalized)
    || /\bCR$/i.test(normalized);
  const amount = Number(normalized.replace(/[^\d.]/g, ""));
  return negative ? -amount : amount;
}

// Count a bank identifier without letting repeated logos dominate detection.
function countMatches(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return Math.min(4, Array.from(text.matchAll(new RegExp(pattern.source, flags))).length);
}

// Choose the institution whose identifying phrases appear most often.
function detectInstitution(text: string) {
  let best = { id: "unknown" as InstitutionId, name: "Unknown institution", score: 0 };
  for (const rule of institutionRules) {
    const score = rule.patterns.reduce((total, pattern) => total + countMatches(text, pattern), 0);
    if (score > best.score) best = { id: rule.id, name: rule.name, score };
  }
  return best;
}

// Distinguish deposit statements from credit card statements by their headings.
function detectAccountKind(text: string): AccountKind {
  const depositSignals = [
    /DETAILS OF YOUR ACCOUNT ACTIVITY/i,
    /ACCOUNT ACTIVITY[\s\S]{0,120}(?:WITHDRAWAL|DEBIT|RETRAIT)[\s\S]{0,80}(?:DEPOSIT|CREDIT|DEPOT)/i,
    /(?:WITHDRAWAL|DEBIT|RETRAIT)[\s\S]{0,80}(?:DEPOSIT|CREDIT|DEPOT)[\s\S]{0,80}(?:BALANCE|SOLDE)/i,
    /(?:CHEQUING|CHECKING|SAVINGS) ACCOUNT/i,
    /OPENING BALANCE[\s\S]{0,200}CLOSING BALANCE/i,
  ];
  const cardSignals = [
    /CREDIT CARD STATEMENT/i,
    /TRANSACTION\s+POSTING/i,
    /MINIMUM (?:AMOUNT )?PAYMENT[\s\S]{0,100}PAYMENT DUE DATE/i,
    /CREDIT LIMIT/i,
    /YOUR TRANSACTIONS/i,
    /NEW CHARGES AND CREDITS/i,
  ];
  const depositScore = depositSignals.filter((pattern) => pattern.test(text)).length;
  const cardScore = cardSignals.filter((pattern) => pattern.test(text)).length;
  return depositScore >= cardScore && depositScore > 0 ? "deposit-account" : "credit-card";
}

// Reject impossible calendar dates instead of letting JavaScript roll them over.
function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : undefined;
}

// Parse statement dates that include a year in common English, French, and numeric forms.
function parseExplicitDate(value: string) {
  const clean = normalizedText(value).replace(/,/g, "").replace(/\./g, "").toUpperCase();
  const iso = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const numeric = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return validDate(year, Number(numeric[1]) - 1, Number(numeric[2]));
  }

  const monthFirst = clean.match(/^([A-Z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (monthFirst && months[monthFirst[1]] !== undefined && monthFirst[3]) {
    return validDate(Number(monthFirst[3]), months[monthFirst[1]], Number(monthFirst[2]));
  }
  const dayFirst = clean.match(/^(\d{1,2})\s+([A-Z]+)(?:\s+(\d{4}))?$/);
  if (dayFirst && months[dayFirst[2]] !== undefined && dayFirst[3]) {
    return validDate(Number(dayFirst[3]), months[dayFirst[2]], Number(dayFirst[1]));
  }
  return undefined;
}

// Use the latest full date on the statement to infer years on shorter row dates.
function findReferenceDate(text: string) {
  const candidates = Array.from(text.matchAll(fullDateRegex))
    .map((match) => parseExplicitDate(match[0]))
    .filter((date): date is Date => Boolean(date));
  return candidates.sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date();
}

// Resolve a row date, including year rollover near a statement boundary.
function resolveTransactionDate(value: string, referenceDate: Date) {
  const explicit = parseExplicitDate(value);
  if (explicit) return explicit;

  const clean = normalizedText(value).replace(/\./g, "").toUpperCase();
  const monthFirst = clean.match(/^([A-Z]+)\s+(\d{1,2})$/);
  const dayFirst = clean.match(/^(\d{1,2})\s+([A-Z]+)$/);
  let month: number | undefined;
  let day: number | undefined;
  if (monthFirst && months[monthFirst[1]] !== undefined) {
    month = months[monthFirst[1]];
    day = Number(monthFirst[2]);
  }
  if (dayFirst && months[dayFirst[2]] !== undefined) {
    month = months[dayFirst[2]];
    day = Number(dayFirst[1]);
  }
  if (month === undefined || day === undefined) {
    const numeric = clean.match(/^(\d{1,2})[/-](\d{1,2})$/);
    if (numeric) {
      month = Number(numeric[1]) - 1;
      day = Number(numeric[2]);
    }
  }
  if (month === undefined || day === undefined) return undefined;
  const year = month > referenceDate.getMonth() + 1
    ? referenceDate.getFullYear() - 1
    : referenceDate.getFullYear();
  return validDate(year, month, day);
}

// Store parsed transaction dates as local YYYY-MM-DD values.
function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Create the month label used to group imported transactions in the UI.
function monthKey(date: Date) {
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

// Suggest a category from merchant text and amount direction.
function categoryFor(description: string, amount: number) {
  const value = description.toLowerCase();
  if (/payroll|salary|direct deposit|freelance|interest paid/.test(value)) return "Income";
  if (/payment received|payment - thank|paiement - merci|refund|reversal|e-transfer received|transfer from/.test(value)) return "Payments & transfers";
  if (/rent|mortgage|property management|housing/.test(value)) return "Housing";
  if (/grocery|market|superstore|sobeys|loblaws|metro |costco|walmart/.test(value)) return "Groceries";
  if (/restaurant|cafe|coffee|doordash|uber ?eats|skipthe|food/.test(value)) return "Dining";
  if (/transit|uber|lyft|taxi|parking|petro|esso|shell|gas station/.test(value)) return "Transportation";
  if (/hydro|energy|utility|internet|mobile|wireless|telecom|bell |rogers|telus/.test(value)) return "Utilities";
  if (/apple\.com|netflix|spotify|cinema|theatre|ticketmaster|disney/.test(value)) return "Entertainment";
  if (/pharmacy|drug mart|clinic|dental|medical|hospital/.test(value)) return "Health";
  if (/amazon|shop|store|retail|canadian tire|home depot/.test(value)) return "Shopping";
  if (amount > 0) return "Income";
  return "Other";
}

// Exclude balance and summary rows that are not individual transactions.
function skipDescription(description: string) {
  return /^(?:TOTAL|SUBTOTAL)|OPENING BALANCE|CLOSING BALANCE|PREVIOUS (?:ACCOUNT )?BALANCE|NEW BALANCE|AVAILABLE (?:CREDIT|BALANCE)|MINIMUM PAYMENT|CREDIT LIMIT|TOTAL ACCOUNT BALANCE|TOTAL OF /i.test(description);
}

// Assign an expense or credit sign using account type and column position.
function normalizeAmount(
  rawAmount: number,
  description: string,
  accountKind: AccountKind,
  columnKind?: Exclude<ColumnKind, "balance">,
) {
  if (accountKind === "credit-card") {
    const creditLike = /PAYMENT|PAIEMENT|REFUND|REVERSAL|CREDIT|MERCI|RETURN/i.test(description);
    return rawAmount < 0 || creditLike ? Math.abs(rawAmount) : -Math.abs(rawAmount);
  }
  if (columnKind === "debit") return -Math.abs(rawAmount);
  if (columnKind === "credit") return Math.abs(rawAmount);
  if (rawAmount < 0) return rawAmount;
  return /DEPOSIT|PAYROLL|SALARY|INTEREST PAID|E-?TRANSFER RECEIVED|TRANSFER FROM|REFUND/i.test(description)
    ? Math.abs(rawAmount)
    : -Math.abs(rawAmount);
}

// Find the horizontal centre of a PDF text fragment for column matching.
function itemCentre(item: TextFragment) {
  return item.x + item.width / 2;
}

// Locate transaction table columns from their printed headers.
function findHeaderHints(lines: StatementLine[]) {
  const hints: ColumnHints[] = [];
  lines.forEach((line, headerIndex) => {
    const normalized = normalizedText(line.text);
    const hasDateOrDescription = /\bDATE\b|DESCRIPTION|DETAILS/i.test(normalized);
    const hasFinancialColumn = /WITHDRAWAL|DEBIT|RETRAIT|DEPOSIT|CREDIT|DEPOT|AMOUNT|MONTANT|BALANCE|SOLDE/i.test(normalized);
    if (!hasDateOrDescription || !hasFinancialColumn) return;

    // Read the printed horizontal position of each matching table heading.
    const findX = (pattern: RegExp) => {
      const item = line.items.find((fragment) => pattern.test(normalizedText(fragment.text)));
      return item ? itemCentre(item) : undefined;
    };
    const candidate: ColumnHints = {
      page: line.page,
      headerIndex,
      date: findX(/^(?:TRANSACTION )?DATE$|^DATE DE/i),
      description: findX(/DESCRIPTION|DETAILS/i),
      debit: findX(/WITHDRAWAL|DEBIT|RETRAIT/i),
      credit: findX(/DEPOSIT|CREDIT|DEPOT/i),
      amount: findX(/^AMOUNT|MONTANT/i),
      balance: findX(/BALANCE|SOLDE/i),
    };
    if (candidate.debit !== undefined || candidate.credit !== undefined || candidate.amount !== undefined) {
      hints.push(candidate);
    }
  });
  return hints;
}

// Classify an amount by the closest header while rejecting distant matches.
function nearestColumn(item: TextFragment, hints: ColumnHints) {
  const x = itemCentre(item);
  const columns = (["debit", "credit", "amount", "balance"] as ColumnKind[])
    .map((kind) => [kind, hints[kind]] as const)
    .filter((entry): entry is readonly [ColumnKind, number] => entry[1] !== undefined)
    .sort((a, b) => Math.abs(a[1] - x) - Math.abs(b[1] - x));
  const nearest = columns[0];
  if (!nearest) return undefined;
  const spacing = columns.length > 1
    ? Math.min(...columns.slice(1).map((entry) => Math.abs(entry[1] - nearest[1])))
    : 100;
  const tolerance = Math.max(35, Math.min(80, spacing * 0.46));
  return Math.abs(nearest[1] - x) <= tolerance ? nearest[0] : undefined;
}

// Collect original currency and exchange details printed beside a transaction.
function foreignDetails(lines: StatementLine[], index: number) {
  const nearby = [lines[index].text];
  for (let nextIndex = index + 1; nextIndex < Math.min(lines.length, index + 3); nextIndex += 1) {
    if (lines[nextIndex].page !== lines[index].page || leadingDateRegex.test(normalizedText(lines[nextIndex].text))) break;
    nearby.push(lines[nextIndex].text);
  }
  const text = nearby.join(" ");
  const currencies = "USD|EUR|GBP|JPY|AUD|NZD|CHF|MXN|HKD|CNY|INR";
  const currencyFirst = text.match(new RegExp(`\\b(${currencies})\\s*\\$?\\s*(-?\\d[\\d,]*\\.\\d{2})\\b`, "i"));
  const amountFirst = text.match(new RegExp(`\\b(-?\\d[\\d,]*\\.\\d{2})\\s*(${currencies})\\b`, "i"));
  const rate = text.match(/(?:EXCHANGE\s+RATE|FX\s+RATE|RATE|@)\s*[:=]?\s*(\d+\.\d{3,8})/i);
  if (currencyFirst) {
    return {
      originalCurrency: currencyFirst[1].toUpperCase(),
      originalAmount: Math.abs(parseMoney(currencyFirst[2])),
      exchangeRate: rate ? Number(rate[1]) : undefined,
    };
  }
  if (amountFirst) {
    return {
      originalCurrency: amountFirst[2].toUpperCase(),
      originalAmount: Math.abs(parseMoney(amountFirst[1])),
      exchangeRate: rate ? Number(rate[1]) : undefined,
    };
  }
  return {};
}

// Read credit card rows with one or two dates and normalize charge direction.
function parseCreditCardLines(lines: StatementLine[], referenceDate: Date) {
  const transactions: ParsedStatementTransaction[] = [];
  lines.forEach((line, index) => {
    const normalized = normalizedText(line.text);
    const twoDates = normalized.match(twoDateRow);
    const oneDate = twoDates ? undefined : normalized.match(oneDateRow);
    const transactionDateValue = twoDates?.[1] ?? oneDate?.[1];
    const postingDateValue = twoDates?.[2];
    const description = normalizedText(twoDates?.[3] ?? oneDate?.[2] ?? "");
    const amountValue = twoDates?.[4] ?? oneDate?.[3];
    if (!transactionDateValue || !description || !amountValue || skipDescription(description)) return;

    const transactionDate = resolveTransactionDate(transactionDateValue, referenceDate);
    const postingDate = postingDateValue ? resolveTransactionDate(postingDateValue, referenceDate) : undefined;
    if (!transactionDate) return;
    const rawAmount = parseMoney(amountValue);
    if (!Number.isFinite(rawAmount) || rawAmount === 0) return;
    const amountCad = normalizeAmount(rawAmount, description, "credit-card");
    transactions.push({
      transactionDate: isoDate(transactionDate),
      postingDate: postingDate ? isoDate(postingDate) : undefined,
      description,
      amountCad,
      category: categoryFor(description, amountCad),
      monthKey: monthKey(transactionDate),
      confidence: twoDates ? 0.94 : 0.8,
      ...foreignDetails(lines, index),
    });
  });
  return transactions;
}

// Join the text fragments before the money columns into a description.
function descriptionsFromLine(line: StatementLine, hints: ColumnHints, dateValue?: string) {
  const financialColumns = [hints.debit, hints.credit, hints.amount, hints.balance]
    .filter((value): value is number => value !== undefined);
  const financialStart = financialColumns.length ? Math.min(...financialColumns) : Number.POSITIVE_INFINITY;
  const fragments = line.items
    .filter((item) => itemCentre(item) < financialStart - 8)
    .filter((item) => !moneyOnly.test(normalizedText(item.text)))
    .map((item) => normalizedText(item.text))
    .filter(Boolean);
  let description = normalizedText(fragments.join(" "));
  if (dateValue) description = normalizedText(description.replace(leadingDateRegex, ""));
  return description;
}

// Read deposit account tables, carrying dates and descriptions across wrapped rows.
function parseDepositLines(lines: StatementLine[], referenceDate: Date, headers: ColumnHints[]) {
  const transactions: ParsedStatementTransaction[] = [];
  const headersByPage = new Map(headers.map((header) => [header.page, header]));
  const fallbackHeader = headers[0];
  let activePage = 0;
  let tableActive = false;
  // Some banks print the date only on the first line of a wrapped transaction.
  let currentDate: Date | undefined;
  let descriptionParts: string[] = [];

  lines.forEach((line, index) => {
    if (line.page !== activePage) {
      activePage = line.page;
      tableActive = false;
      descriptionParts = [];
    }
    const pageHeader = headersByPage.get(line.page) ?? fallbackHeader;
    if (!pageHeader) return;
    if (index === pageHeader.headerIndex || (line.page === pageHeader.page && /WITHDRAWAL|DEBIT|RETRAIT/i.test(line.text) && /DEPOSIT|CREDIT|DEPOT/i.test(line.text))) {
      tableActive = true;
      descriptionParts = [];
      return;
    }
    if (!headersByPage.has(line.page) && line.page !== pageHeader.page) tableActive = true;
    if (/CLOSING BALANCE|SOLDE DE FERMETURE|END OF (?:ACCOUNT )?ACTIVITY/i.test(line.text)) {
      tableActive = false;
      descriptionParts = [];
      return;
    }
    if (!tableActive) return;

    const normalized = normalizedText(line.text);
    const dateMatch = normalized.match(leadingDateRegex);
    const dateValue = dateMatch?.[1];
    if (dateValue) {
      const resolved = resolveTransactionDate(dateValue, referenceDate);
      if (!resolved) return;
      currentDate = resolved;
      descriptionParts = [];
    }
    if (!currentDate) return;

    const descriptionPart = descriptionsFromLine(line, pageHeader, dateValue);
    if (descriptionPart && !skipDescription(descriptionPart)) descriptionParts.push(descriptionPart);

    const amountCandidate = line.items
      .filter((item) => moneyOnly.test(normalizedText(item.text)))
      .map((item) => ({ item, column: nearestColumn(item, pageHeader) }))
      .find((candidate) => candidate.column && candidate.column !== "balance");
    if (!amountCandidate || !amountCandidate.column || amountCandidate.column === "balance") return;

    const description = normalizedText(descriptionParts.join(" "));
    descriptionParts = [];
    if (!description || skipDescription(description)) return;
    const rawAmount = parseMoney(amountCandidate.item.text);
    if (!Number.isFinite(rawAmount) || rawAmount === 0) return;
    const amountCad = normalizeAmount(
      rawAmount,
      description,
      "deposit-account",
      amountCandidate.column,
    );
    transactions.push({
      transactionDate: isoDate(currentDate),
      description,
      amountCad,
      category: categoryFor(description, amountCad),
      monthKey: monthKey(currentDate),
      confidence: amountCandidate.column === "amount" ? 0.76 : 0.92,
      ...foreignDetails(lines, index),
    });
  });
  return transactions;
}

// Choose the month represented by the most parsed transactions.
function mostCommonMonth(transactions: ParsedStatementTransaction[]) {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    counts.set(transaction.monthKey, (counts.get(transaction.monthKey) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Coordinate detection, row parsing, confidence, and warnings for one statement.
export function parseStatementLines(lines: StatementLine[], filename = "statement.pdf"): StatementParseResult {
  const orderedLines = [...lines].sort((a, b) => a.page - b.page || b.y - a.y);
  const text = normalizedText(orderedLines.map((line) => line.text).join("\n"));
  const institution = detectInstitution(text);
  const accountKind = detectAccountKind(text);
  const referenceDate = findReferenceDate(text);
  const headers = findHeaderHints(orderedLines);
  const transactions = accountKind === "deposit-account"
    ? parseDepositLines(orderedLines, referenceDate, headers)
    : parseCreditCardLines(orderedLines, referenceDate);

  const warnings: string[] = [];
  if (institution.id === "unknown") warnings.push("Institution could not be identified; review every imported line.");
  if (!transactions.length) warnings.push(`No transaction rows were recognized in ${filename}.`);
  if (accountKind === "deposit-account" && !headers.length) {
    warnings.push("Debit and credit columns were not identified; no deposit-account amounts were guessed.");
  }
  const lowConfidenceCount = transactions.filter((transaction) => transaction.confidence < 0.85).length;
  if (lowConfidenceCount) warnings.push(`${lowConfidenceCount} line item${lowConfidenceCount === 1 ? "" : "s"} need amount-direction review.`);
  const averageConfidence = transactions.length
    ? transactions.reduce((total, transaction) => total + transaction.confidence, 0) / transactions.length
    : 0;
  const confidence = Math.max(
    0,
    Math.min(1, averageConfidence + (institution.id === "unknown" ? -0.15 : 0.05)),
  );
  return {
    institutionId: institution.id,
    institutionName: institution.name,
    accountKind,
    statementMonth: mostCommonMonth(transactions),
    transactions,
    confidence,
    warnings,
  };
}
