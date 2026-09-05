export type AccountKind = "asset" | "liability";

export type AccountType =
  | "Chequing"
  | "Savings"
  | "Cash"
  | "Investment"
  | "Credit card"
  | "Line of credit"
  | "Loan"
  | "Mortgage"
  | "Other";

export type FinancialAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  type: AccountType;
  balance: number;
};

export type SavingsGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
};

export type RecurringFrequency = "Weekly" | "Every two weeks" | "Monthly" | "Yearly";

export type RecurringItem = {
  id: string;
  name: string;
  amount: number;
  category: string;
  frequency: RecurringFrequency;
  nextDate: string;
};

export type FinancialHealth = {
  score: number;
  status: "Strong" | "Steady" | "Needs attention";
  cashFlowScore: number;
  spendingPlanScore: number;
  emergencyFundScore: number | null;
  emergencyMonths: number | null;
  monthlyExpenses: number;
  savingsRate: number;
  message: string;
};

type TransactionLike = {
  merchant: string;
  date: string;
  amount: number;
  category: string;
  postingDate?: string;
};

const transferCategory = "Payments & transfers";
const essentialCategories = new Set(["Housing", "Groceries", "Utilities", "Transportation", "Health"]);
const cashAccountTypes = new Set<AccountType>(["Chequing", "Savings", "Cash"]);

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function transactionFingerprint(transaction: TransactionLike) {
  const date = transaction.postingDate || transaction.date;
  return [normalizeText(date), normalizeText(transaction.merchant), Math.round(transaction.amount * 100)].join("|");
}

export function excludeExistingTransactions<T extends TransactionLike>(existing: TransactionLike[], candidates: T[]) {
  const existingCounts = new Map<string, number>();
  for (const transaction of existing) {
    const fingerprint = transactionFingerprint(transaction);
    existingCounts.set(fingerprint, (existingCounts.get(fingerprint) ?? 0) + 1);
  }

  const unique: T[] = [];
  let duplicateCount = 0;
  for (const transaction of candidates) {
    const fingerprint = transactionFingerprint(transaction);
    const remainingMatches = existingCounts.get(fingerprint) ?? 0;
    if (remainingMatches > 0) {
      existingCounts.set(fingerprint, remainingMatches - 1);
      duplicateCount += 1;
    } else {
      unique.push(transaction);
    }
  }

  return { unique, duplicateCount };
}

export function calculateNetWorth(accounts: FinancialAccount[]) {
  const assets = roundCurrency(accounts
    .filter((account) => account.kind === "asset")
    .reduce((total, account) => total + Math.max(0, account.balance), 0));
  const liabilities = roundCurrency(accounts
    .filter((account) => account.kind === "liability")
    .reduce((total, account) => total + Math.max(0, account.balance), 0));
  return { assets, liabilities, netWorth: roundCurrency(assets - liabilities) };
}

export function monthlyEquivalent(amount: number, frequency: RecurringFrequency) {
  const multiplier = frequency === "Weekly"
    ? 52 / 12
    : frequency === "Every two weeks"
      ? 26 / 12
      : frequency === "Yearly"
        ? 1 / 12
        : 1;
  return roundCurrency(Math.max(0, amount) * multiplier);
}

export function calculateMonthlyRecurringTotal(items: RecurringItem[]) {
  return roundCurrency(items.reduce((total, item) => total + monthlyEquivalent(item.amount, item.frequency), 0));
}

export function suggestedMonthlyContribution(goal: SavingsGoal, today = new Date()) {
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  if (!goal.targetDate || remaining === 0) return 0;
  const target = new Date(`${goal.targetDate}T12:00:00`);
  if (Number.isNaN(target.getTime()) || target <= today) return roundCurrency(remaining);
  const months = Math.max(1,
    (target.getFullYear() - today.getFullYear()) * 12
    + target.getMonth() - today.getMonth()
    + (target.getDate() > today.getDate() ? 1 : 0));
  return roundCurrency(remaining / months);
}

export function calculateFinancialHealth({
  monthlyIncome,
  spendingLimit,
  transactions,
  accounts,
}: {
  monthlyIncome: number;
  spendingLimit: number;
  transactions: TransactionLike[];
  accounts: FinancialAccount[];
}): FinancialHealth {
  const expenses = transactions
    .filter((transaction) => transaction.amount < 0 && transaction.category !== transferCategory)
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
  const essentialSpending = transactions
    .filter((transaction) => transaction.amount < 0 && essentialCategories.has(transaction.category))
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
  const safeIncome = Math.max(0, monthlyIncome);
  const savingsRate = safeIncome ? (safeIncome - expenses) / safeIncome : 0;
  const cashFlowScore = Math.round(clamp(50 + savingsRate * 200));
  const planRatio = spendingLimit > 0 ? expenses / spendingLimit : 1;
  const spendingPlanScore = Math.round(planRatio <= 0.8
    ? 100
    : planRatio <= 1
      ? 100 - ((planRatio - 0.8) / 0.2) * 30
      : clamp(70 - (planRatio - 1) * 140));

  const cashReserve = accounts
    .filter((account) => account.kind === "asset" && cashAccountTypes.has(account.type))
    .reduce((total, account) => total + Math.max(0, account.balance), 0);
  const monthlyEssentials = essentialSpending > 0 ? essentialSpending : Math.max(0, spendingLimit) * 0.6;
  const emergencyMonths = accounts.length && monthlyEssentials > 0 ? cashReserve / monthlyEssentials : null;
  const emergencyFundScore = emergencyMonths === null ? null : Math.round(clamp((emergencyMonths / 3) * 100));
  const knownScores = [cashFlowScore, spendingPlanScore, emergencyFundScore]
    .filter((score): score is number => score !== null);
  const score = Math.round(knownScores.reduce((total, value) => total + value, 0) / Math.max(1, knownScores.length));
  const status = score >= 75 ? "Strong" : score >= 55 ? "Steady" : "Needs attention";

  let message = "Your cash flow and spending plan are moving in a healthy direction.";
  if (!accounts.length) message = "Add your account balances to include net worth and emergency-fund coverage in this score.";
  else if (planRatio > 1) message = "Spending is above your monthly plan. Review the largest categories before adding new commitments.";
  else if ((emergencyMonths ?? 0) < 3) message = "Your monthly plan is on track. Building toward three months of essential expenses would strengthen your buffer.";

  return {
    score,
    status,
    cashFlowScore,
    spendingPlanScore,
    emergencyFundScore,
    emergencyMonths: emergencyMonths === null ? null : Math.round(emergencyMonths * 10) / 10,
    monthlyExpenses: roundCurrency(expenses),
    savingsRate: Math.round(savingsRate * 1000) / 10,
    message,
  };
}

export function isFinancialAccount(value: unknown): value is FinancialAccount {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FinancialAccount>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && (candidate.kind === "asset" || candidate.kind === "liability")
    && typeof candidate.type === "string"
    && typeof candidate.balance === "number"
    && Number.isFinite(candidate.balance)
    && candidate.balance >= 0;
}

export function isSavingsGoal(value: unknown): value is SavingsGoal {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavingsGoal>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.targetAmount === "number"
    && candidate.targetAmount > 0
    && typeof candidate.currentAmount === "number"
    && candidate.currentAmount >= 0
    && typeof candidate.targetDate === "string";
}

export function isRecurringItem(value: unknown): value is RecurringItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecurringItem>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.amount === "number"
    && candidate.amount > 0
    && typeof candidate.category === "string"
    && ["Weekly", "Every two weeks", "Monthly", "Yearly"].includes(candidate.frequency ?? "")
    && typeof candidate.nextDate === "string";
}
