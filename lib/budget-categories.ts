export type BudgetCategory = {
  id: string;
  name: string;
  limit: number;
  color: string;
  icon: string;
  custom: boolean;
};

type CategorizedAmount = {
  category: string;
  amount: number;
};

const defaultBlueprints = [
  { id: "housing", name: "Housing", share: 0.55, color: "#a99bf7", icon: "⌂" },
  { id: "groceries", name: "Groceries", share: 0.14, color: "#f2b866", icon: "✣" },
  { id: "utilities", name: "Utilities", share: 0.1, color: "#83c8f1", icon: "⌁" },
  { id: "dining", name: "Dining", share: 0.06, color: "#f18eaa", icon: "♨" },
  { id: "transportation", name: "Transportation", share: 0.07, color: "#83d4ba", icon: "↝" },
  { id: "shopping", name: "Shopping", share: 0.03, color: "#e9a4d2", icon: "◇" },
  { id: "entertainment", name: "Entertainment", share: 0.02, color: "#8db0e8", icon: "♪" },
  { id: "health", name: "Health", share: 0.02, color: "#ef9a8d", icon: "+" },
  { id: "other", name: "Other", share: 0.01, color: "#aaa4a8", icon: "…" },
] as const;

export const customCategoryColors = [
  "#7f9cf5",
  "#d68bc2",
  "#65b9a6",
  "#e6a15c",
  "#9a8be8",
  "#df7f76",
] as const;

// Round category limits and totals to cents.
function currencyAmount(value: number) {
  return Math.round(value * 100) / 100;
}

// Split a spending limit across the built-in category percentages.
export function createDefaultCategories(spendingLimit: number): BudgetCategory[] {
  const safeLimit = Math.max(0, Number.isFinite(spendingLimit) ? spendingLimit : 0);
  let allocated = 0;
  return defaultBlueprints.map((blueprint, index) => {
    const limit = index === defaultBlueprints.length - 1
      ? currencyAmount(safeLimit - allocated)
      : currencyAmount(safeLimit * blueprint.share);
    allocated += limit;
    return {
      id: blueprint.id,
      name: blueprint.name,
      limit,
      color: blueprint.color,
      icon: blueprint.icon,
      custom: false,
    };
  });
}

// Detect edits so a later budget change does not overwrite custom limits.
export function hasCustomCategoryPlan(categories: BudgetCategory[], spendingLimit: number): boolean {
  const defaults = createDefaultCategories(spendingLimit);
  return categories.length !== defaults.length || categories.some((category, index) =>
    category.id !== defaults[index].id || category.limit !== defaults[index].limit || category.custom);
}

// Validate a category loaded from storage or a backup.
export function isBudgetCategory(value: unknown): value is BudgetCategory {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BudgetCategory>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && candidate.name.trim().length > 0
    && typeof candidate.limit === "number"
    && Number.isFinite(candidate.limit)
    && candidate.limit >= 0
    && typeof candidate.color === "string"
    && typeof candidate.icon === "string"
    && typeof candidate.custom === "boolean";
}

// Sum expense amounts per category, sending unknown categories to Other.
export function calculateCategorySpending(
  categories: BudgetCategory[],
  transactions: CategorizedAmount[],
) {
  const spending = Object.fromEntries(categories.map((category) => [category.name, 0])) as Record<string, number>;
  const categoryNames = new Set(categories.map((category) => category.name));
  const fallback = categoryNames.has("Other") ? "Other" : undefined;
  for (const transaction of transactions) {
    if (transaction.amount >= 0 || transaction.category === "Payments & transfers") continue;
    const category = categoryNames.has(transaction.category) ? transaction.category : fallback;
    if (!category) continue;
    spending[category] = currencyAmount((spending[category] ?? 0) + Math.abs(transaction.amount));
  }
  return spending;
}
