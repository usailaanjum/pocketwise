"use client";

import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculateCategorySpending,
  createDefaultCategories,
  customCategoryColors,
  isBudgetCategory,
} from "../lib/budget-categories";
import type { BudgetCategory } from "../lib/budget-categories";
import {
  calculateFinancialHealth,
  calculateMonthlyRecurringTotal,
  calculateNetWorth,
  excludeExistingTransactions,
  isFinancialAccount,
  isRecurringItem,
  isSavingsGoal,
  monthlyEquivalent,
  suggestedMonthlyContribution,
} from "../lib/financial-tracker";
import type {
  AccountKind,
  AccountType,
  FinancialAccount,
  RecurringFrequency,
  RecurringItem,
  SavingsGoal,
} from "../lib/financial-tracker";
import { parsePdfStatement, StatementPdfError } from "../lib/statement-parser";

type Tab = "Overview" | "Transactions" | "Categories" | "Plan" | "Reports";
type Transaction = {
  id: number;
  merchant: string;
  note: string;
  date: string;
  amount: number;
  category: string;
  initials: string;
  tone: string;
  review?: boolean;
  monthKey?: string;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  sourceInstitution?: string;
  postingDate?: string;
  confidence?: number;
};

type BudgetSettings = {
  monthlyIncome: number;
  spendingLimit: number;
  currency: "CAD";
};

type TransactionDraft = {
  merchant: string;
  amount: string;
  category: string;
  note: string;
  date: string;
  kind: "expense" | "income";
};

type PlannerEditor = "account" | "goal" | "recurring" | null;

const defaultSettings: BudgetSettings = { monthlyIncome: 6000, spendingLimit: 3200, currency: "CAD" };
const storageKeys = {
  settings: "pocketwise.settings.v1",
  transactions: "pocketwise.transactions.v1",
  categories: "pocketwise.categories.v1",
  accounts: "pocketwise.accounts.v1",
  goals: "pocketwise.goals.v1",
  recurring: "pocketwise.recurring.v1",
};

const emptyTransactionDraft: TransactionDraft = { merchant: "", amount: "", category: "Groceries", note: "", date: "", kind: "expense" };
const accountTypes: AccountType[] = ["Chequing", "Savings", "Cash", "Investment", "Credit card", "Line of credit", "Loan", "Mortgage", "Other"];
const recurringFrequencies: RecurringFrequency[] = ["Weekly", "Every two weeks", "Monthly", "Yearly"];

const initialTransactions: Transaction[] = [
  { id: 1, merchant: "Metro Market", note: "Groceries", date: "Today, 10:24 AM", amount: -86.42, category: "Groceries", initials: "M", tone: "pink", monthKey: "August 2026" },
  { id: 2, merchant: "Northline Energy", note: "Utilities", date: "Yesterday, 4:18 PM", amount: -124.8, category: "Utilities", initials: "N", tone: "blue", monthKey: "August 2026" },
  { id: 3, merchant: "Alder & Co.", note: "Coffee & lunch", date: "Aug 16, 12:42 PM", amount: -18.75, category: "Dining", initials: "A", tone: "gold", monthKey: "August 2026" },
  { id: 4, merchant: "Harborview Studio", note: "Monthly rent", date: "Aug 15, 9:00 AM", amount: -1850, category: "Housing", initials: "H", tone: "purple", monthKey: "August 2026" },
  { id: 5, merchant: "Willow Freelance", note: "Invoice #1048", date: "Aug 14, 8:31 AM", amount: 2400, category: "Income", initials: "W", tone: "green", monthKey: "August 2026" },
  { id: 6, merchant: "Fresh Basket", note: "Weekly shop", date: "Aug 13, 6:05 PM", amount: -64.2, category: "Groceries", initials: "F", tone: "mint", review: true, monthKey: "August 2026" },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h3" /></>,
    tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3.4 13.4a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.4 7.4a2 2 0 0 1 0 2.4Z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="m7 15 3-4 3 2 5-7" /><path d="M18 6h2v2" /></>,
    settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.4 1.4-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.57V21h-2v-.09a1.7 1.7 0 0 0-1.03-1.57 1.7 1.7 0 0 0-1.88.34l-.06.06-1.4-1.4.06-.06A1.7 1.7 0 0 0 9.4 15a1.7 1.7 0 0 0-1.57-1.03H7v-2h.83A1.7 1.7 0 0 0 9.4 11a1.7 1.7 0 0 0-.34-1.88L9 9.06l1.4-1.4.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 13.37 6.5V6h2v.5a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.4 1.4-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.57 1.03H21v2h-.09A1.7 1.7 0 0 0 19.4 15Z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    more: <><circle cx="5" cy="12" r=".8" fill="currentColor" /><circle cx="12" cy="12" r=".8" fill="currentColor" /><circle cx="19" cy="12" r=".8" fill="currentColor" /></>,
    download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M22 12h-3" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>,
    backup: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v6h7V4M8 20v-6h8v6" /></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

function money(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(Math.abs(value));
}

function formatStatementDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [transactions, setTransactions] = useState(initialTransactions);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [month, setMonth] = useState("August 2026");
  const [showModal, setShowModal] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showBudgetSetup, setShowBudgetSetup] = useState(false);
  const [budgetSetupRequired, setBudgetSetupRequired] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [pendingImport, setPendingImport] = useState<Transaction[]>([]);
  const [importCounts, setImportCounts] = useState({ found: 0, review: 0, duplicates: 0 });
  const [settings, setSettings] = useState<BudgetSettings>(defaultSettings);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>(() => createDefaultCategories(defaultSettings.spendingLimit));
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [budgetDraft, setBudgetDraft] = useState({ monthlyIncome: "6000", spendingLimit: "3200" });
  const [categoryEditorMode, setCategoryEditorMode] = useState<"add" | "edit" | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<{ name: string; limit: string; color: string }>({ name: "", limit: "", color: customCategoryColors[0] });
  const [categoryError, setCategoryError] = useState("");
  const [plannerEditor, setPlannerEditor] = useState<PlannerEditor>(null);
  const [plannerEditingId, setPlannerEditingId] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState<{ name: string; kind: AccountKind; type: AccountType; balance: string }>({ name: "", kind: "asset", type: "Chequing", balance: "" });
  const [goalDraft, setGoalDraft] = useState({ name: "", targetAmount: "", currentAmount: "", targetDate: "" });
  const [recurringDraft, setRecurringDraft] = useState<{ name: string; amount: string; category: string; frequency: RecurringFrequency; nextDate: string }>({ name: "", amount: "", category: "Utilities", frequency: "Monthly", nextDate: "" });
  const [plannerError, setPlannerError] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [form, setForm] = useState<TransactionDraft>(emptyTransactionDraft);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const categoriesCustomizedRef = useRef(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const savedSettings = window.localStorage.getItem(storageKeys.settings);
        const savedTransactions = window.localStorage.getItem(storageKeys.transactions);
        const savedCategories = window.localStorage.getItem(storageKeys.categories);
        const savedAccounts = window.localStorage.getItem(storageKeys.accounts);
        const savedGoals = window.localStorage.getItem(storageKeys.goals);
        const savedRecurring = window.localStorage.getItem(storageKeys.recurring);
        let categoryLimit = defaultSettings.spendingLimit;
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings) as BudgetSettings;
          setSettings(parsedSettings);
          categoryLimit = parsedSettings.spendingLimit;
          setBudgetDraft({ monthlyIncome: String(parsedSettings.monthlyIncome), spendingLimit: String(parsedSettings.spendingLimit) });
        } else {
          setShowBudgetSetup(true);
          setBudgetSetupRequired(true);
        }
        if (savedTransactions) setTransactions(JSON.parse(savedTransactions) as Transaction[]);
        if (savedCategories) {
          const parsedCategories = JSON.parse(savedCategories) as unknown;
          const validCategories = Array.isArray(parsedCategories) ? parsedCategories.filter(isBudgetCategory) : [];
          setBudgetCategories(validCategories.length ? validCategories : createDefaultCategories(categoryLimit));
          categoriesCustomizedRef.current = validCategories.length > 0;
        } else {
          setBudgetCategories(createDefaultCategories(categoryLimit));
          categoriesCustomizedRef.current = false;
        }
        if (savedAccounts) {
          const parsed = JSON.parse(savedAccounts) as unknown;
          if (Array.isArray(parsed)) setAccounts(parsed.filter(isFinancialAccount));
        }
        if (savedGoals) {
          const parsed = JSON.parse(savedGoals) as unknown;
          if (Array.isArray(parsed)) setGoals(parsed.filter(isSavingsGoal));
        }
        if (savedRecurring) {
          const parsed = JSON.parse(savedRecurring) as unknown;
          if (Array.isArray(parsed)) setRecurringItems(parsed.filter(isRecurringItem));
        }
      } catch {
        setShowBudgetSetup(true);
        setBudgetSetupRequired(true);
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKeys.settings, JSON.stringify(settings));
    window.localStorage.setItem(storageKeys.transactions, JSON.stringify(transactions));
    window.localStorage.setItem(storageKeys.categories, JSON.stringify(budgetCategories));
    window.localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
    window.localStorage.setItem(storageKeys.goals, JSON.stringify(goals));
    window.localStorage.setItem(storageKeys.recurring, JSON.stringify(recurringItems));
  }, [settings, transactions, budgetCategories, accounts, goals, recurringItems, storageReady]);

  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    const matchesSearch = `${transaction.merchant} ${transaction.note}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (categoryFilter === "All categories" || transaction.category === categoryFilter);
  }), [transactions, search, categoryFilter]);

  const categoryOptions = useMemo(() => {
    const names = new Set(budgetCategories.map((category) => category.name));
    names.add("Income");
    names.add("Payments & transfers");
    for (const transaction of transactions) names.add(transaction.category);
    return Array.from(names);
  }, [budgetCategories, transactions]);

  function openAddTransaction() {
    setEditingTransactionId(null);
    setForm({ ...emptyTransactionDraft, date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function openEditTransaction(transaction: Transaction) {
    setEditingTransactionId(transaction.id);
    setForm({
      merchant: transaction.merchant,
      amount: String(Math.abs(transaction.amount)),
      category: transaction.category,
      note: transaction.note,
      date: transaction.date,
      kind: transaction.amount >= 0 ? "income" : "expense",
    });
    setShowModal(true);
  }

  function saveTransaction(event: FormEvent) {
    event.preventDefault();
    if (!form.merchant || !form.amount) return;
    const magnitude = Math.abs(Number(form.amount));
    if (!Number.isFinite(magnitude) || magnitude === 0) return;
    const amount = form.kind === "income" ? magnitude : -magnitude;
    const parsedDate = new Date(form.date);
    const monthKey = Number.isNaN(parsedDate.getTime())
      ? month
      : new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(parsedDate);
    if (editingTransactionId !== null) {
      setTransactions((current) => current.map((transaction) => transaction.id === editingTransactionId
        ? {
          ...transaction,
          merchant: form.merchant.trim(),
          note: form.note.trim() || "Manual entry",
          date: form.date || transaction.date,
          amount,
          category: form.category,
          initials: form.merchant.trim().slice(0, 1).toUpperCase(),
          monthKey,
          review: false,
        }
        : transaction));
    } else {
      setTransactions((current) => [{
        id: Date.now(),
        merchant: form.merchant.trim(),
        note: form.note.trim() || "Manual entry",
        date: form.date ? formatStatementDate(form.date) : "Just now",
        amount,
        category: form.category,
        initials: form.merchant.trim().slice(0, 1).toUpperCase(),
        tone: amount > 0 ? "green" : "mint",
        monthKey,
      }, ...current]);
    }
    setForm(emptyTransactionDraft);
    setEditingTransactionId(null);
    setShowModal(false);
  }

  function deleteTransaction() {
    if (editingTransactionId === null) return;
    const transaction = transactions.find((item) => item.id === editingTransactionId);
    if (!transaction || !window.confirm(`Delete ${transaction.merchant} from your transactions?`)) return;
    setTransactions((current) => current.filter((item) => item.id !== editingTransactionId));
    setEditingTransactionId(null);
    setShowModal(false);
  }

  function inferCategory(merchant: string) {
    const value = merchant.toLowerCase();
    if (value.includes("rent") || value.includes("housing") || value.includes("studio")) return "Housing";
    if (value.includes("market") || value.includes("grocery") || value.includes("basket")) return "Groceries";
    if (value.includes("energy") || value.includes("hydro") || value.includes("internet")) return "Utilities";
    if (value.includes("cafe") || value.includes("coffee") || value.includes("restaurant")) return "Dining";
    if (value.includes("uber") || value.includes("transit") || value.includes("gas")) return "Transportation";
    if (value.includes("apple.com") || value.includes("netflix") || value.includes("spotify")) return "Entertainment";
    if (value.includes("pharmacy") || value.includes("clinic") || value.includes("dental")) return "Health";
    if (value.includes("payroll") || value.includes("freelance") || value.includes("deposit")) return "Income";
    return "Other";
  }

  function parseCsvRow(row: string) {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < row.length; index += 1) {
      const character = row[index];
      if (character === '"' && row[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (character === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
      else cell += character;
    }
    cells.push(cell.trim());
    return cells;
  }

  function openImport() {
    setPendingImport([]);
    setImportCounts({ found: 0, review: 0, duplicates: 0 });
    setImportMessage("");
    setImportWarnings([]);
    setShowImport(true);
  }

  function saveBudget(event: FormEvent) {
    event.preventDefault();
    const monthlyIncome = Number(budgetDraft.monthlyIncome);
    const spendingLimit = Number(budgetDraft.spendingLimit);
    if (monthlyIncome <= 0 || spendingLimit <= 0) return;
    setSettings({ monthlyIncome, spendingLimit, currency: "CAD" });
    if (!categoriesCustomizedRef.current) setBudgetCategories(createDefaultCategories(spendingLimit));
    setBudgetSetupRequired(false);
    setShowBudgetSetup(false);
  }

  function openAddCategory() {
    const customCount = budgetCategories.filter((category) => category.custom).length;
    setCategoryDraft({
      name: "",
      limit: "",
      color: customCategoryColors[customCount % customCategoryColors.length],
    });
    setEditingCategoryId(null);
    setCategoryError("");
    setCategoryEditorMode("add");
  }

  function openEditCategory(category: BudgetCategory) {
    setCategoryDraft({ name: category.name, limit: String(category.limit), color: category.color });
    setEditingCategoryId(category.id);
    setCategoryError("");
    setCategoryEditorMode("edit");
  }

  function closeCategoryEditor() {
    setCategoryEditorMode(null);
    setEditingCategoryId(null);
    setCategoryError("");
  }

  function saveCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryDraft.name.trim().replace(/\s+/g, " ");
    const limit = Number(categoryDraft.limit);
    const editingCategory = editingCategoryId
      ? budgetCategories.find((category) => category.id === editingCategoryId)
      : undefined;
    const nextName = editingCategory && !editingCategory.custom ? editingCategory.name : name;
    const reservedNames = ["Income", "Payments & transfers"];
    const duplicate = [...budgetCategories.map((category) => category.name), ...reservedNames]
      .some((categoryName) => categoryName.toLowerCase() === nextName.toLowerCase() && categoryName.toLowerCase() !== editingCategory?.name.toLowerCase());

    if (!nextName) {
      setCategoryError("Enter a category name.");
      return;
    }
    if (duplicate) {
      setCategoryError("That category already exists.");
      return;
    }
    if (categoryDraft.limit.trim() === "" || !Number.isFinite(limit) || limit < 0) {
      setCategoryError("Enter a monthly limit of CAD 0 or more.");
      return;
    }

    categoriesCustomizedRef.current = true;
    if (editingCategory) {
      setBudgetCategories((current) => current.map((category) => category.id === editingCategory.id
        ? { ...category, name: nextName, limit, icon: category.custom ? nextName.slice(0, 1).toUpperCase() : category.icon }
        : category));
      if (editingCategory.name !== nextName) {
        setTransactions((current) => current.map((transaction) => transaction.category === editingCategory.name
          ? { ...transaction, category: nextName }
          : transaction));
        setForm((current) => current.category === editingCategory.name ? { ...current, category: nextName } : current);
        setCategoryFilter((current) => current === editingCategory.name ? nextName : current);
      }
    } else {
      const slug = nextName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category";
      setBudgetCategories((current) => [...current, {
        id: `custom-${slug}-${Date.now()}`,
        name: nextName,
        limit,
        color: categoryDraft.color,
        icon: nextName.slice(0, 1).toUpperCase(),
        custom: true,
      }]);
    }
    closeCategoryEditor();
  }

  function closePlannerEditor() {
    setPlannerEditor(null);
    setPlannerEditingId(null);
    setPlannerError("");
  }

  function openAccountEditor(account?: FinancialAccount) {
    setPlannerEditingId(account?.id ?? null);
    setAccountDraft(account
      ? { name: account.name, kind: account.kind, type: account.type, balance: String(account.balance) }
      : { name: "", kind: "asset", type: "Chequing", balance: "" });
    setPlannerError("");
    setPlannerEditor("account");
  }

  function openGoalEditor(goal?: SavingsGoal) {
    setPlannerEditingId(goal?.id ?? null);
    setGoalDraft(goal
      ? { name: goal.name, targetAmount: String(goal.targetAmount), currentAmount: String(goal.currentAmount), targetDate: goal.targetDate }
      : { name: "", targetAmount: "", currentAmount: "", targetDate: "" });
    setPlannerError("");
    setPlannerEditor("goal");
  }

  function openRecurringEditor(item?: RecurringItem) {
    setPlannerEditingId(item?.id ?? null);
    setRecurringDraft(item
      ? { name: item.name, amount: String(item.amount), category: item.category, frequency: item.frequency, nextDate: item.nextDate }
      : { name: "", amount: "", category: "Utilities", frequency: "Monthly", nextDate: "" });
    setPlannerError("");
    setPlannerEditor("recurring");
  }

  function saveAccount(event: FormEvent) {
    event.preventDefault();
    const name = accountDraft.name.trim();
    const balance = Number(accountDraft.balance);
    if (!name || !Number.isFinite(balance) || balance < 0) {
      setPlannerError("Enter an account name and a balance of CAD 0 or more.");
      return;
    }
    const account: FinancialAccount = {
      id: plannerEditingId ?? `account-${Date.now()}`,
      name,
      kind: accountDraft.kind,
      type: accountDraft.type,
      balance,
    };
    setAccounts((current) => plannerEditingId
      ? current.map((item) => item.id === plannerEditingId ? account : item)
      : [...current, account]);
    closePlannerEditor();
  }

  function saveGoal(event: FormEvent) {
    event.preventDefault();
    const name = goalDraft.name.trim();
    const targetAmount = Number(goalDraft.targetAmount);
    const currentAmount = Number(goalDraft.currentAmount || 0);
    if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount) || currentAmount < 0) {
      setPlannerError("Enter a goal name, a target above CAD 0, and a valid saved amount.");
      return;
    }
    const goal: SavingsGoal = {
      id: plannerEditingId ?? `goal-${Date.now()}`,
      name,
      targetAmount,
      currentAmount,
      targetDate: goalDraft.targetDate,
    };
    setGoals((current) => plannerEditingId
      ? current.map((item) => item.id === plannerEditingId ? goal : item)
      : [...current, goal]);
    closePlannerEditor();
  }

  function saveRecurring(event: FormEvent) {
    event.preventDefault();
    const name = recurringDraft.name.trim();
    const amount = Number(recurringDraft.amount);
    if (!name || !Number.isFinite(amount) || amount <= 0) {
      setPlannerError("Enter a recurring item name and an amount above CAD 0.");
      return;
    }
    const item: RecurringItem = {
      id: plannerEditingId ?? `recurring-${Date.now()}`,
      name,
      amount,
      category: recurringDraft.category,
      frequency: recurringDraft.frequency,
      nextDate: recurringDraft.nextDate,
    };
    setRecurringItems((current) => plannerEditingId
      ? current.map((existing) => existing.id === plannerEditingId ? item : existing)
      : [...current, item]);
    closePlannerEditor();
  }

  function deletePlannerItem() {
    if (!plannerEditingId || !plannerEditor) return;
    const labels = { account: "account", goal: "goal", recurring: "recurring item" } as const;
    if (!window.confirm(`Delete this ${labels[plannerEditor]}?`)) return;
    if (plannerEditor === "account") setAccounts((current) => current.filter((item) => item.id !== plannerEditingId));
    if (plannerEditor === "goal") setGoals((current) => current.filter((item) => item.id !== plannerEditingId));
    if (plannerEditor === "recurring") setRecurringItems((current) => current.filter((item) => item.id !== plannerEditingId));
    closePlannerEditor();
  }

  function downloadLocalFile(filename: string, contents: string, type: string) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportTransactions(items = transactions) {
    const escapeCsv = (value: string | number | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const headers = ["Date", "Merchant", "Note", "Category", "Amount CAD", "Original amount", "Original currency", "Institution"];
    const rows = items.map((transaction) => [
      transaction.date,
      transaction.merchant,
      transaction.note,
      transaction.category,
      transaction.amount.toFixed(2),
      transaction.originalAmount,
      transaction.originalCurrency,
      transaction.sourceInstitution,
    ].map(escapeCsv).join(","));
    downloadLocalFile("pocketwise-transactions.csv", [headers.map(escapeCsv).join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
  }

  function exportReport() {
    const health = calculateFinancialHealth({
      monthlyIncome: settings.monthlyIncome,
      spendingLimit: settings.spendingLimit,
      transactions: monthTransactions,
      accounts,
    });
    const netWorth = calculateNetWorth(accounts);
    const rows = [
      ["Pocketwise report", month],
      ["Monthly income baseline", settings.monthlyIncome.toFixed(2)],
      ["Spending", health.monthlyExpenses.toFixed(2)],
      ["Savings rate", `${health.savingsRate.toFixed(1)}%`],
      ["Financial health score", `${health.score}/100`],
      ["Assets", netWorth.assets.toFixed(2)],
      ["Liabilities", netWorth.liabilities.toFixed(2)],
      ["Net worth", netWorth.netWorth.toFixed(2)],
      ["Recurring monthly commitments", calculateMonthlyRecurringTotal(recurringItems).toFixed(2)],
    ];
    downloadLocalFile(`pocketwise-report-${month.toLowerCase().replaceAll(" ", "-")}.csv`, rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function downloadBackup() {
    const backup = {
      format: "pocketwise-local-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      settings,
      transactions,
      categories: budgetCategories,
      accounts,
      goals,
      recurringItems,
    };
    downloadLocalFile(`pocketwise-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), "application/json");
    setBackupMessage("Backup downloaded. Keep the JSON file somewhere private.");
  }

  async function restoreBackup(file: File) {
    setBackupMessage("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Backup files must be smaller than 5 MB.");
      const backup = JSON.parse(await file.text()) as Record<string, unknown>;
      const nextSettings = backup.settings as Partial<BudgetSettings> | undefined;
      const nextTransactions = backup.transactions;
      const nextCategories = backup.categories;
      const nextAccounts = backup.accounts;
      const nextGoals = backup.goals;
      const nextRecurring = backup.recurringItems;
      const validTransaction = (value: unknown): value is Transaction => {
        if (!value || typeof value !== "object") return false;
        const candidate = value as Partial<Transaction>;
        return typeof candidate.id === "number"
          && typeof candidate.merchant === "string"
          && typeof candidate.date === "string"
          && typeof candidate.amount === "number"
          && Number.isFinite(candidate.amount)
          && typeof candidate.category === "string";
      };
      if (backup.format !== "pocketwise-local-backup"
        || !nextSettings
        || typeof nextSettings.monthlyIncome !== "number"
        || typeof nextSettings.spendingLimit !== "number"
        || nextSettings.currency !== "CAD"
        || !Array.isArray(nextTransactions) || !nextTransactions.every(validTransaction)
        || !Array.isArray(nextCategories) || !nextCategories.every(isBudgetCategory)
        || !Array.isArray(nextAccounts) || !nextAccounts.every(isFinancialAccount)
        || !Array.isArray(nextGoals) || !nextGoals.every(isSavingsGoal)
        || !Array.isArray(nextRecurring) || !nextRecurring.every(isRecurringItem)) {
        throw new Error("That file is not a valid Pocketwise backup.");
      }
      if (!window.confirm("Restore this backup and replace the data currently stored in this browser?")) return;
      const restoredSettings = nextSettings as BudgetSettings;
      setSettings(restoredSettings);
      setBudgetDraft({ monthlyIncome: String(restoredSettings.monthlyIncome), spendingLimit: String(restoredSettings.spendingLimit) });
      setTransactions(nextTransactions);
      setBudgetCategories(nextCategories);
      setAccounts(nextAccounts);
      setGoals(nextGoals);
      setRecurringItems(nextRecurring);
      categoriesCustomizedRef.current = true;
      setBudgetSetupRequired(false);
      setBackupMessage("Backup restored successfully.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "The backup could not be restored.");
    }
  }

  async function handleFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isPdf = lowerName.endsWith(".pdf");
    setShowImport(true);
    setPendingImport([]);
    setImportCounts({ found: 0, review: 0, duplicates: 0 });
    setImportWarnings([]);
    setImportMessage(`Reading ${file.name} locally…`);

    if (!isCsv && !isPdf) {
      setImportMessage("Choose a CSV or PDF statement.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportMessage("Choose a file smaller than 10 MB.");
      return;
    }

    try {
      if (isCsv) {
        const rows = (await file.text()).split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
        const headers = parseCsvRow(rows[0] || "").map((header) => header.toLowerCase());
        const indexOf = (...names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)));
        const dateIndex = indexOf("transaction date", "date");
        const merchantIndex = indexOf("description", "merchant", "payee", "activity");
        const amountIndex = indexOf("amount", "cad amount");
        const debitIndex = indexOf("debit");
        const creditIndex = indexOf("credit");
        const originalAmountIndex = indexOf("original amount", "foreign amount");
        const originalCurrencyIndex = indexOf("original currency", "foreign currency", "currency");
        const exchangeRateIndex = indexOf("exchange rate", "fx rate");
        const parsed = rows.slice(1).map((row, index) => {
          const columns = parseCsvRow(row);
          const merchant = columns[merchantIndex] || columns[1] || columns[0] || `Imported item ${index + 1}`;
          const debit = Number((columns[debitIndex] || "0").replace(/[$,]/g, ""));
          const credit = Number((columns[creditIndex] || "0").replace(/[$,]/g, ""));
          const rawAmount = Number((columns[amountIndex] || columns[2] || "0").replace(/[$,]/g, ""));
          const amount = debit ? -Math.abs(debit) : credit ? Math.abs(credit) : rawAmount;
          const originalAmount = Number((columns[originalAmountIndex] || "0").replace(/[$,]/g, "")) || undefined;
          const originalCurrency = columns[originalCurrencyIndex]?.toUpperCase() || undefined;
          const exchangeRate = Number(columns[exchangeRateIndex] || "0") || undefined;
          const date = columns[dateIndex] || columns[0] || "Imported";
          const parsedDate = new Date(date);
          const monthKey = Number.isNaN(parsedDate.getTime()) ? month : new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(parsedDate);
          const category = inferCategory(merchant);
          return { id: Date.now() + index, merchant, note: "Imported from CSV", date, amount, category, initials: merchant.slice(0, 1).toUpperCase(), tone: "mint", originalAmount, originalCurrency, exchangeRate, monthKey, review: category === "Other" };
        }).filter((item) => item.amount !== 0);
        const { unique, duplicateCount } = excludeExistingTransactions(transactions, parsed);
        const review = unique.filter((item) => item.review).length;
        setPendingImport(unique);
        setImportCounts({ found: unique.length, review, duplicates: duplicateCount });
        setImportMessage(`${file.name} · ${unique.length} new line items ready to review`);
        const warnings: string[] = [];
        if (!parsed.length) warnings.push("No non-zero transaction rows were found. Check the CSV column names.");
        if (duplicateCount) warnings.push(`${duplicateCount} matching ${duplicateCount === 1 ? "transaction was" : "transactions were"} already in Pocketwise and skipped.`);
        setImportWarnings(warnings);
        return;
      }

      const result = await parsePdfStatement(file);
      const imported: Transaction[] = result.transactions.map((transaction, index) => {
        const review = result.institutionId === "unknown" || transaction.confidence < 0.85 || transaction.category === "Other";
        return {
          id: Date.now() + index,
          merchant: transaction.description,
          note: `${result.institutionName} · ${result.accountKind === "credit-card" ? "Credit card" : "Bank account"}`,
          date: formatStatementDate(transaction.transactionDate),
          amount: transaction.amountCad,
          category: transaction.category,
          initials: transaction.description.slice(0, 1).toUpperCase(),
          tone: transaction.amountCad > 0 ? "green" : "purple",
          review,
          monthKey: transaction.monthKey,
          originalAmount: transaction.originalAmount,
          originalCurrency: transaction.originalCurrency,
          exchangeRate: transaction.exchangeRate,
          sourceInstitution: result.institutionName,
          postingDate: transaction.postingDate,
          confidence: transaction.confidence,
        };
      });
      const { unique, duplicateCount } = excludeExistingTransactions(transactions, imported);
      const review = unique.filter((transaction) => transaction.review).length;
      setPendingImport(unique);
      setImportCounts({ found: unique.length, review, duplicates: duplicateCount });
      setImportWarnings([
        ...result.warnings,
        ...(duplicateCount ? [`${duplicateCount} matching ${duplicateCount === 1 ? "transaction was" : "transactions were"} already in Pocketwise and skipped.`] : []),
      ]);
      setImportMessage(unique.length
        ? `${file.name} · ${result.institutionName} · ${unique.length} new line items found`
        : `${file.name} · no transaction rows recognized`);
      if (result.statementMonth) setMonth(result.statementMonth);
    } catch (error) {
      setPendingImport([]);
      setImportCounts({ found: 0, review: 0, duplicates: 0 });
      const message = error instanceof StatementPdfError
        ? error.message
        : "This statement could not be read. Try a searchable PDF or CSV export.";
      setImportMessage(`${file.name} · ${message}`);
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleFile(file);
    event.target.value = "";
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const navItems: { label: Tab; icon: string }[] = [
    { label: "Overview", icon: "grid" }, { label: "Transactions", icon: "card" }, { label: "Categories", icon: "tag" }, { label: "Plan", icon: "target" }, { label: "Reports", icon: "chart" },
  ];
  const monthTransactions = transactions.filter((transaction) => !transaction.monthKey || transaction.monthKey === month);
  const financialHealth = calculateFinancialHealth({ monthlyIncome: settings.monthlyIncome, spendingLimit: settings.spendingLimit, transactions: monthTransactions, accounts });
  const monthRemaining = settings.spendingLimit - financialHealth.monthlyExpenses;
  const activeEditingCategory = editingCategoryId
    ? budgetCategories.find((category) => category.id === editingCategoryId)
    : undefined;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">↗</span><span>pocketwise</span></div>
        <div className="workspace-label">PERSONAL SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => <button key={item.label} className={`nav-item ${activeTab === item.label ? "active" : ""}`} onClick={() => setActiveTab(item.label)}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.label === "Transactions" && <span className="nav-count">{transactions.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="tip-card"><div className="tip-spark">✦</div><p><strong>{financialHealth.status} monthly pulse.</strong><br />{monthRemaining >= 0 ? `${money(monthRemaining)} remains in your spending plan.` : `${money(monthRemaining)} over your spending plan.`}</p><button onClick={() => setActiveTab("Reports")}>View insights <Icon name="arrow" size={14} /></button></div>
          <button className="nav-item" onClick={() => { setBudgetSetupRequired(false); setBackupMessage(""); setBudgetDraft({ monthlyIncome: String(settings.monthlyIncome), spendingLimit: String(settings.spendingLimit) }); setShowBudgetSetup(true); }}><Icon name="settings" size={17} /><span>Settings & backup</span></button>
          <div className="profile"><div className="avatar">JS</div><div><strong>Jamie Smith</strong><span>Personal account</span></div><Icon name="more" size={17} /></div>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar"><div className="breadcrumb">Personal space <span>/</span> <strong>{activeTab}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search"><Icon name="search" size={18} /></button><button className="icon-button notification" aria-label="Notifications"><Icon name="bell" size={18} /><i /></button><div className="top-avatar">JS</div></div></header>

        <div className="content-inner">
          {activeTab === "Overview" && <Overview month={month} setMonth={setMonth} onImport={openImport} onAdd={openAddTransaction} onOpenTransactions={() => setActiveTab("Transactions")} onOpenCategories={() => setActiveTab("Categories")} onReports={() => setActiveTab("Reports")} transactions={monthTransactions} settings={settings} categories={budgetCategories} accounts={accounts} onEditTransaction={openEditTransaction} />}
          {activeTab === "Transactions" && <TransactionsPage transactions={filteredTransactions} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} onImport={openImport} onAdd={openAddTransaction} categoryOptions={categoryOptions} onEdit={openEditTransaction} onExport={() => exportTransactions(filteredTransactions)} />}
          {activeTab === "Categories" && <CategoriesPage settings={settings} categories={budgetCategories} transactions={monthTransactions} onAdd={openAddCategory} onEdit={openEditCategory} />}
          {activeTab === "Plan" && <PlanPage accounts={accounts} goals={goals} recurringItems={recurringItems} onAddAccount={() => openAccountEditor()} onEditAccount={openAccountEditor} onAddGoal={() => openGoalEditor()} onEditGoal={openGoalEditor} onAddRecurring={() => openRecurringEditor()} onEditRecurring={openRecurringEditor} />}
          {activeTab === "Reports" && <ReportsPage transactions={monthTransactions} settings={settings} categories={budgetCategories} accounts={accounts} goals={goals} recurringItems={recurringItems} month={month} onDownload={exportReport} onOpenPlan={() => setActiveTab("Plan")} />}
        </div>
      </section>

      {showBudgetSetup && <div className="modal-backdrop">{!budgetSetupRequired && <button className="modal-backdrop-close" type="button" aria-label="Close settings" onClick={() => setShowBudgetSetup(false)} />}<div className="modal setup-modal">{!budgetSetupRequired && <button className="modal-close" type="button" onClick={() => setShowBudgetSetup(false)}>×</button>}<div className="modal-icon budget-icon">$</div><h2>Budget settings & backup</h2><p className="modal-sub">These numbers power your available-to-spend, savings rate, and forecast. Everything stays on this device.</p><form onSubmit={saveBudget}><label>Monthly take-home income<div className="money-input"><span>CAD</span><input value={budgetDraft.monthlyIncome} onChange={(event) => setBudgetDraft({ ...budgetDraft, monthlyIncome: event.target.value })} type="number" min="1" step="50" /></div></label><label>Monthly spending limit<div className="money-input"><span>CAD</span><input value={budgetDraft.spendingLimit} onChange={(event) => setBudgetDraft({ ...budgetDraft, spendingLimit: event.target.value })} type="number" min="1" step="50" /></div></label><div className="local-note"><span>✓</span><p><strong>Local for now</strong>Your financial data is saved only in this browser.</p></div><button className="primary-button full" type="submit">Save budget settings <Icon name="arrow" size={16} /></button></form>{!budgetSetupRequired && <div className="backup-actions"><div><strong>Portable local backup</strong><span>Download all Pocketwise data, or restore it on this device.</span></div><div><button className="secondary-button small" type="button" onClick={downloadBackup}><Icon name="backup" size={14} /> Download</button><button className="secondary-button small" type="button" onClick={() => backupRef.current?.click()}><Icon name="upload" size={14} /> Restore</button></div><input ref={backupRef} className="hidden-input" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); event.target.value = ""; }} />{backupMessage && <p className="backup-message" role="status">{backupMessage}</p>}</div>}</div></div>}
      {showImport && <div className="modal-backdrop"><button className="modal-backdrop-close" type="button" aria-label="Close statement import" onClick={() => setShowImport(false)} /><div className="modal import-modal"><button className="modal-close" onClick={() => setShowImport(false)}>×</button><div className="modal-icon"><Icon name="upload" size={22} /></div><h2>Import a statement</h2><p className="modal-sub">Searchable PDFs from RBC, TD, Scotiabank, BMO, CIBC, National Bank, and Amex are analyzed locally by their contents. The file name does not matter.</p><div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={dropFile}><div className="drop-icon"><Icon name="upload" size={18} /></div><div><strong>{importMessage || "Drop a statement here"}</strong><span>CSV or PDF · up to 10 MB</span></div><button className="text-button" onClick={() => fileRef.current?.click()}>Choose file</button></div><input ref={fileRef} className="hidden-input" type="file" accept=".csv,.pdf" onChange={chooseFile} />{importWarnings.length > 0 && <div className="import-warnings" role="status">{importWarnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}</div>}{(importCounts.found > 0 || importCounts.duplicates > 0) && <div className="import-summary"><div><span className="summary-number">{importCounts.found}</span><span>new line items</span></div><div><span className="summary-number peach">{importCounts.review}</span><span>need your review</span></div>{importCounts.duplicates > 0 && <div><span className="summary-number muted">{importCounts.duplicates}</span><span>duplicates skipped</span></div>}</div>}<button className="primary-button full" disabled={!pendingImport.length} onClick={() => { setTransactions((current) => [...pendingImport, ...current]); setActiveTab("Transactions"); setShowImport(false); }}>Add new transactions <Icon name="arrow" size={16} /></button></div></div>}
      {categoryEditorMode && <div className="modal-backdrop"><button className="modal-backdrop-close" type="button" aria-label="Close category editor" onClick={closeCategoryEditor} /><div className="modal category-modal"><button className="modal-close" type="button" onClick={closeCategoryEditor}>×</button><div className="modal-icon category-modal-icon"><Icon name="tag" size={20} /></div><h2>{categoryEditorMode === "add" ? "Add a custom category" : "Edit category limit"}</h2><p className="modal-sub">Set the monthly amount you want to reserve for this category. Changes stay on this device.</p><form onSubmit={saveCategory}><label>Category name<input value={categoryDraft.name} disabled={categoryEditorMode === "edit" && !activeEditingCategory?.custom} maxLength={40} onChange={(event) => { setCategoryDraft({ ...categoryDraft, name: event.target.value }); setCategoryError(""); }} placeholder="e.g. Travel" /></label><label>Monthly limit<div className="money-input"><span>CAD</span><input value={categoryDraft.limit} onChange={(event) => { setCategoryDraft({ ...categoryDraft, limit: event.target.value }); setCategoryError(""); }} type="number" min="0" step="1" placeholder="0" /></div></label>{categoryError && <p className="form-error" role="alert">{categoryError}</p>}<button className="primary-button full" type="submit">{categoryEditorMode === "add" ? "Add category" : "Save limit"} <Icon name="arrow" size={16} /></button></form></div></div>}
      {showModal && <div className="modal-backdrop"><button className="modal-backdrop-close" type="button" aria-label="Close transaction form" onClick={() => { setShowModal(false); setEditingTransactionId(null); }} /><div className="modal"><button className="modal-close" type="button" onClick={() => { setShowModal(false); setEditingTransactionId(null); }}>×</button><h2>{editingTransactionId === null ? "Add transaction" : "Edit transaction"}</h2><p className="modal-sub">{editingTransactionId === null ? "Record something that isn’t in a statement." : "Correct the merchant, amount, date, or category used in your reports."}</p><form onSubmit={saveTransaction}><label>Merchant<input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} placeholder="e.g. Corner store" required /></label><div className="form-row"><label>Type<select value={form.kind} onChange={(event) => { const kind = event.target.value as TransactionDraft["kind"]; setForm({ ...form, kind, category: kind === "income" ? "Income" : form.category === "Income" ? "Other" : form.category }); }}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Amount (CAD)<input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" type="number" min="0.01" step="0.01" required /></label></div><div className="form-row"><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label><label>Date<input value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} placeholder="YYYY-MM-DD" /></label></div><label>Note <span className="optional">optional</span><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Add a note" /></label><div className="modal-actions">{editingTransactionId !== null && <button className="danger-button" type="button" onClick={deleteTransaction}><Icon name="trash" size={14} /> Delete</button>}<button className="primary-button" type="submit">Save transaction <Icon name="arrow" size={16} /></button></div></form></div></div>}
      {plannerEditor && <div className="modal-backdrop"><button className="modal-backdrop-close" type="button" aria-label="Close planning form" onClick={closePlannerEditor} /><div className="modal planner-modal"><button className="modal-close" type="button" onClick={closePlannerEditor}>×</button><div className="modal-icon category-modal-icon"><Icon name="target" size={20} /></div><h2>{plannerEditingId ? "Edit" : "Add"} {plannerEditor === "account" ? "account balance" : plannerEditor === "goal" ? "savings goal" : "recurring item"}</h2><p className="modal-sub">This information stays in your browser and feeds your plan, net worth, and financial-health report.</p>
        {plannerEditor === "account" && <form onSubmit={saveAccount}><label>Account name<input value={accountDraft.name} onChange={(event) => { setAccountDraft({ ...accountDraft, name: event.target.value }); setPlannerError(""); }} placeholder="e.g. Emergency savings" required /></label><div className="form-row"><label>Balance type<select value={accountDraft.kind} onChange={(event) => { const kind = event.target.value as AccountKind; setAccountDraft({ ...accountDraft, kind, type: kind === "asset" ? "Chequing" : "Credit card" }); }}><option value="asset">Asset — I own it</option><option value="liability">Debt — I owe it</option></select></label><label>Account type<select value={accountDraft.type} onChange={(event) => setAccountDraft({ ...accountDraft, type: event.target.value as AccountType })}>{accountTypes.filter((type) => accountDraft.kind === "asset" ? !["Credit card", "Line of credit", "Loan", "Mortgage"].includes(type) : !["Chequing", "Savings", "Cash", "Investment"].includes(type)).map((type) => <option key={type}>{type}</option>)}</select></label></div><label>Current balance<div className="money-input"><span>CAD</span><input value={accountDraft.balance} onChange={(event) => { setAccountDraft({ ...accountDraft, balance: event.target.value }); setPlannerError(""); }} type="number" min="0" step="0.01" placeholder="0.00" required /></div></label>{plannerError && <p className="form-error" role="alert">{plannerError}</p>}<PlannerModalActions editing={Boolean(plannerEditingId)} onDelete={deletePlannerItem} label="Save account" /></form>}
        {plannerEditor === "goal" && <form onSubmit={saveGoal}><label>Goal name<input value={goalDraft.name} onChange={(event) => { setGoalDraft({ ...goalDraft, name: event.target.value }); setPlannerError(""); }} placeholder="e.g. Emergency fund" required /></label><div className="form-row"><label>Target amount<input value={goalDraft.targetAmount} onChange={(event) => setGoalDraft({ ...goalDraft, targetAmount: event.target.value })} type="number" min="0.01" step="0.01" placeholder="0.00" required /></label><label>Already saved<input value={goalDraft.currentAmount} onChange={(event) => setGoalDraft({ ...goalDraft, currentAmount: event.target.value })} type="number" min="0" step="0.01" placeholder="0.00" /></label></div><label>Target date <span className="optional">optional</span><input value={goalDraft.targetDate} onChange={(event) => setGoalDraft({ ...goalDraft, targetDate: event.target.value })} type="date" /></label>{plannerError && <p className="form-error" role="alert">{plannerError}</p>}<PlannerModalActions editing={Boolean(plannerEditingId)} onDelete={deletePlannerItem} label="Save goal" /></form>}
        {plannerEditor === "recurring" && <form onSubmit={saveRecurring}><label>Name<input value={recurringDraft.name} onChange={(event) => { setRecurringDraft({ ...recurringDraft, name: event.target.value }); setPlannerError(""); }} placeholder="e.g. Internet bill" required /></label><div className="form-row"><label>Amount (CAD)<input value={recurringDraft.amount} onChange={(event) => setRecurringDraft({ ...recurringDraft, amount: event.target.value })} type="number" min="0.01" step="0.01" placeholder="0.00" required /></label><label>Frequency<select value={recurringDraft.frequency} onChange={(event) => setRecurringDraft({ ...recurringDraft, frequency: event.target.value as RecurringFrequency })}>{recurringFrequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label></div><div className="form-row"><label>Category<select value={recurringDraft.category} onChange={(event) => setRecurringDraft({ ...recurringDraft, category: event.target.value })}>{categoryOptions.filter((category) => category !== "Income").map((category) => <option key={category}>{category}</option>)}</select></label><label>Next date <span className="optional">optional</span><input value={recurringDraft.nextDate} onChange={(event) => setRecurringDraft({ ...recurringDraft, nextDate: event.target.value })} type="date" /></label></div>{plannerError && <p className="form-error" role="alert">{plannerError}</p>}<PlannerModalActions editing={Boolean(plannerEditingId)} onDelete={deletePlannerItem} label="Save recurring item" /></form>}
      </div></div>}
    </main>
  );
}

function PlannerModalActions({ editing, onDelete, label }: { editing: boolean; onDelete: () => void; label: string }) {
  return <div className="modal-actions">{editing && <button className="danger-button" type="button" onClick={onDelete}><Icon name="trash" size={14} /> Delete</button>}<button className="primary-button" type="submit">{label} <Icon name="arrow" size={16} /></button></div>;
}

function Overview({ month, setMonth, onImport, onAdd, onOpenTransactions, onOpenCategories, onReports, transactions, settings, categories, accounts, onEditTransaction }: { month: string; setMonth: (value: string) => void; onImport: () => void; onAdd: () => void; onOpenTransactions: () => void; onOpenCategories: () => void; onReports: () => void; transactions: Transaction[]; settings: BudgetSettings; categories: BudgetCategory[]; accounts: FinancialAccount[]; onEditTransaction: (transaction: Transaction) => void }) {
  const expenses = transactions.filter((item) => item.amount < 0 && item.category !== "Payments & transfers").reduce((total, item) => total + Math.abs(item.amount), 0);
  const fixedSpending = transactions.filter((item) => item.amount < 0 && ["Housing", "Utilities"].includes(item.category)).reduce((total, item) => total + Math.abs(item.amount), 0);
  const variableSpending = Math.max(0, expenses - fixedSpending);
  const [selectedMonthName, selectedYearText] = month.split(" ");
  const selectedMonthIndex = new Date(`${selectedMonthName} 1, ${selectedYearText}`).getMonth();
  const selectedYear = Number(selectedYearText);
  const daysInMonth = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate() || 30;
  const today = new Date();
  const elapsedDays = today.getFullYear() === selectedYear && today.getMonth() === selectedMonthIndex ? Math.max(1, today.getDate()) : daysInMonth;
  const projectedSpending = fixedSpending + (variableSpending / elapsedDays) * daysInMonth;
  const available = settings.spendingLimit - expenses;
  const savingsRate = Math.max(0, ((settings.monthlyIncome - projectedSpending) / settings.monthlyIncome) * 100);
  const health = calculateFinancialHealth({ monthlyIncome: settings.monthlyIncome, spendingLimit: settings.spendingLimit, transactions, accounts });
  const categorySpending = calculateCategorySpending(categories, transactions);
  const categoryBreakdown = categories
    .map((category) => ({ ...category, amount: categorySpending[category.name] ?? 0 }))
    .filter((category) => category.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  let donutCursor = 0;
  const donutBackground = categoryBreakdown.length
    ? `conic-gradient(${categoryBreakdown.map((category) => {
      const start = expenses ? (donutCursor / expenses) * 100 : 0;
      donutCursor += category.amount;
      const end = expenses ? (donutCursor / expenses) * 100 : 0;
      return `${category.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    }).join(", ")})`
    : "#f0edeb";
  const categoryLegend = categoryBreakdown.length <= 4
    ? categoryBreakdown
    : [
      ...categoryBreakdown.slice(0, 3),
      {
        id: "remaining-categories",
        name: "Other categories",
        amount: categoryBreakdown.slice(3).reduce((total, category) => total + category.amount, 0),
        color: "#aaa4a8",
        icon: "…",
        limit: 0,
        custom: false,
      },
    ];
  return <>
    <div className="page-heading"><div><p className="eyebrow">GOOD EVENING, JAMIE</p><h1>Here’s your money story.</h1><p className="heading-sub">A clear view of where you are, and where you’re headed.</p></div><div className="heading-actions"><label className="month-select"><span>{month}</span><Icon name="chevron" size={14} /><select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Select month"><option>August 2026</option><option>July 2026</option><option>June 2026</option><option>December 2025</option></select></label><button className="primary-button" onClick={onAdd}><Icon name="plus" size={16} /> Add transaction</button></div></div>
    <div className="import-banner"><div className="import-art"><span>CSV</span><span>PDF</span><i /></div><div className="import-copy"><strong>Bring in your latest statement</strong><span>Drop a CSV or PDF here and we’ll sort the line items for you.</span></div><button className="secondary-button" onClick={onImport}><Icon name="upload" size={15} /> Import statement</button></div>
    <div className="metric-grid"><MetricCard label="Available to spend" value={`${available < 0 ? "−" : ""}${money(available)}`} detail={`of ${money(settings.spendingLimit)} monthly plan`} trend={available >= 0 ? "On plan" : "Over plan"} trendType={available >= 0 ? "positive" : "warning"} icon="wallet" /><MetricCard label="Spent this month" value={money(expenses)} detail="Across imported and manual entries" trend={`${Math.round((expenses / settings.spendingLimit) * 100)}%`} trendType="neutral" icon="trend" /><MetricCard label="Projected month-end" value={money(projectedSpending)} detail="Recurring costs + recent daily average" trend={projectedSpending <= settings.spendingLimit ? "Within limit" : "Above limit"} trendType={projectedSpending <= settings.spendingLimit ? "positive" : "warning"} icon="forecast" /><MetricCard label="Projected savings rate" value={`${savingsRate.toFixed(1)}%`} detail={`Based on ${money(settings.monthlyIncome)} income`} trend="Forecast" trendType="neutral" icon="leaf" /></div>
    <div className="main-grid"><section className="panel spending-panel"><div className="panel-heading"><div><h2>Spending over time</h2><p>{month} · live from your transactions</p></div><button className="ghost-button" onClick={onReports}>View report <Icon name="arrow" size={14} /></button></div><div className="chart-legend"><span><i className="legend-dot purple" /> Spent</span><span><i className="legend-dot peach" /> Planned pace</span></div><SpendingChart month={month} transactions={transactions} spendingLimit={settings.spendingLimit} /></section><section className="panel health-panel"><div className="panel-heading"><div><h2>Financial health</h2><p>Calculated from this month</p></div><span className={`health-badge ${health.status === "Needs attention" ? "warning" : ""}`}>{health.status}</span></div><div className="health-ring" style={{ background: `conic-gradient(#82c8ac 0 ${health.score}%, #f0edeb ${health.score}% 100%)` }}><div><strong>{health.score}</strong><span>/ 100</span></div></div><p className="health-copy">{health.message}</p><div className="health-breakdown"><div><span className="health-line mint" /><span>Cash flow</span><strong>{health.cashFlowScore}</strong></div><div><span className="health-line purple" /><span>Spending plan</span><strong>{health.spendingPlanScore}</strong></div><div><span className="health-line peach" /><span>Emergency fund</span><strong>{health.emergencyFundScore ?? "—"}</strong></div></div></section></div>
    <div className="lower-grid"><section className="panel transactions-panel"><div className="panel-heading"><div><h2>Recent transactions</h2><p>Latest activity across your accounts</p></div><button className="ghost-button" onClick={onOpenTransactions}>See all <Icon name="arrow" size={14} /></button></div><TransactionList transactions={transactions.slice(0, 4)} onEdit={onEditTransaction} /></section><section className="panel category-panel"><div className="panel-heading"><div><h2>Where it’s going</h2><p>Spend by category</p></div><button className="ghost-button" onClick={onOpenCategories}>Edit limits <Icon name="arrow" size={14} /></button></div><div className="donut-wrap"><div className="donut" style={{ background: donutBackground }}><div className="donut-hole"><strong>{money(expenses)}</strong><span>total spent</span></div></div><div className="donut-legend">{categoryLegend.length ? categoryLegend.map((category) => <span key={category.id}><i style={{ background: category.color }} /> {category.name} <strong>{expenses ? Math.round((category.amount / expenses) * 100) : 0}%</strong></span>) : <span className="empty-category-copy">No spending yet</span>}</div></div><div className="category-foot"><span>Monthly budget</span><strong>{money(settings.spendingLimit)} <small>· {settings.spendingLimit ? Math.round((expenses / settings.spendingLimit) * 100) : 0}% used</small></strong></div></section></div>
  </>;
}

function MetricCard({ label, value, detail, trend, trendType, icon }: { label: string; value: string; detail: string; trend: string; trendType: string; icon: string }) {
  return <div className="metric-card"><div className={`metric-icon ${icon}`}>{icon === "wallet" ? "▰" : icon === "trend" ? "↗" : "✦"}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail"><span className={`trend ${trendType}`}>{trendType === "positive" && "↘ "}{trend}</span> {detail}</div></div>;
}

function SpendingChart({ month, transactions, spendingLimit }: { month: string; transactions: Transaction[]; spendingLimit: number }) {
  const [monthName, yearText] = month.split(" ");
  const monthIndex = new Date(`${monthName} 1, ${yearText}`).getMonth();
  const year = Number(yearText);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate() || 30;
  const today = new Date();
  const shortMonth = monthName.slice(0, 3);
  const checkpoints = [1, 8, 15, 22, daysInMonth];
  const transactionDay = (transaction: Transaction) => {
    const source = transaction.postingDate || transaction.date;
    const isoMatch = source.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) return Number(isoMatch[3]);
    if (/^today/i.test(source)) return today.getDate();
    if (/^yesterday/i.test(source)) return Math.max(1, today.getDate() - 1);
    const namedMatch = source.match(/\b[A-Z][a-z]{2,8}\s+(\d{1,2})\b/);
    return namedMatch ? Math.min(daysInMonth, Number(namedMatch[1])) : daysInMonth;
  };
  const spendAt = checkpoints.map((day) => transactions
    .filter((transaction) => transaction.amount < 0 && transaction.category !== "Payments & transfers" && transactionDay(transaction) <= day)
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0));
  const plannedAt = checkpoints.map((day) => spendingLimit * (day / daysInMonth));
  const maximum = Math.max(spendingLimit, ...spendAt, 1);
  const xPositions = [0, 190, 380, 570, 760];
  const yFor = (value: number) => 190 - (value / maximum) * 165;
  const spendPoints = spendAt.map((value, index) => `${xPositions[index]},${yFor(value).toFixed(1)}`).join(" ");
  const planPoints = plannedAt.map((value, index) => `${xPositions[index]},${yFor(value).toFixed(1)}`).join(" ");
  return <div className="chart"><div className="y-labels"><span>{money(maximum)}</span><span>{money(maximum * 0.66)}</span><span>{money(maximum * 0.33)}</span><span>$0</span></div><div className="chart-main"><div className="grid-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 760 210" preserveAspectRatio="none" role="img" aria-label={`Cumulative spending for ${month}`}><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#9a87f7" stopOpacity=".23" /><stop offset="1" stopColor="#9a87f7" stopOpacity="0" /></linearGradient></defs><polygon points={`${spendPoints} 760,210 0,210`} fill="url(#area)" /><polyline points={spendPoints} fill="none" stroke="#9884f4" strokeWidth="3" vectorEffect="non-scaling-stroke" /><polyline points={planPoints} fill="none" stroke="#f2b866" strokeWidth="2" strokeDasharray="6 8" vectorEffect="non-scaling-stroke" /></svg><div className="x-labels">{checkpoints.map((day) => <span key={day}>{shortMonth} {day}</span>)}</div></div></div>;
}

function TransactionList({ transactions, onEdit }: { transactions: Transaction[]; onEdit?: (transaction: Transaction) => void }) {
  return <div className="transaction-list">{transactions.length ? transactions.map((transaction) => <div className="transaction-row" key={transaction.id}><div className={`merchant-mark ${transaction.tone}`}>{transaction.initials}</div><div className="transaction-info"><strong>{transaction.merchant}{transaction.review && <span className="review-chip">Review</span>}</strong><span>{transaction.note} · {transaction.date}{transaction.originalAmount && transaction.originalCurrency ? ` · Originally ${transaction.originalCurrency} ${transaction.originalAmount.toFixed(2)}${transaction.exchangeRate ? ` at ${transaction.exchangeRate}` : ""}` : ""}</span></div><span className="transaction-category">{transaction.category}</span><strong className={transaction.amount > 0 ? "income" : "expense"}>{transaction.amount > 0 ? "+" : "−"}{money(transaction.amount)}</strong><button className="row-more" type="button" aria-label={`Edit ${transaction.merchant}`} onClick={() => onEdit?.(transaction)}><Icon name="more" size={16} /></button></div>) : <div className="empty-list">No transactions match this view.</div>}</div>;
}

function TransactionsPage({ transactions, search, setSearch, categoryFilter, setCategoryFilter, onImport, onAdd, categoryOptions, onEdit, onExport }: { transactions: Transaction[]; search: string; setSearch: (value: string) => void; categoryFilter: string; setCategoryFilter: (value: string) => void; onImport: () => void; onAdd: () => void; categoryOptions: string[]; onEdit: (transaction: Transaction) => void; onExport: () => void }) {
  return <><div className="page-heading"><div><p className="eyebrow">ACTIVITY</p><h1>Transactions</h1><p className="heading-sub">Every purchase, bill, and deposit in one place. Use the row menu to correct or delete an entry.</p></div><div className="heading-actions"><button className="secondary-button" onClick={onImport}><Icon name="upload" size={15} /> Import</button><button className="primary-button" onClick={onAdd}><Icon name="plus" size={16} /> Add transaction</button></div></div><div className="panel table-panel"><div className="table-toolbar"><div className="search-field"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions" /></div><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select><button className="secondary-button small" type="button" onClick={onExport}><Icon name="download" size={15} /> Export CSV</button></div><div className="table-head"><span aria-hidden="true" /><span>Merchant</span><span>Category</span><span>Amount</span><span aria-hidden="true" /></div><TransactionList transactions={transactions} onEdit={onEdit} /><div className="table-footer">Showing {transactions.length} transactions <span>Saved locally</span></div></div></>;
}

function CategoriesPage({ settings, categories, transactions, onAdd, onEdit }: { settings: BudgetSettings; categories: BudgetCategory[]; transactions: Transaction[]; onAdd: () => void; onEdit: (category: BudgetCategory) => void }) {
  const spending = calculateCategorySpending(categories, transactions);
  const cards = categories.map((category) => ({ ...category, amount: spending[category.name] ?? 0 }));
  const totalPlanned = categories.reduce((total, category) => total + category.limit, 0);
  const totalSpent = cards.reduce((total, category) => total + category.amount, 0);
  const housing = cards.find((category) => category.name === "Housing");
  const flexibleLimit = Math.max(0, totalPlanned - (housing?.limit ?? 0));
  const flexibleSpent = Math.max(0, totalSpent - (housing?.amount ?? 0));
  const planDifference = settings.spendingLimit - totalPlanned;
  const attentionCount = cards.filter((category) => category.limit === 0 ? category.amount > 0 : category.amount / category.limit >= 0.8).length;
  const plannedPercent = settings.spendingLimit ? Math.round((totalPlanned / settings.spendingLimit) * 100) : 0;
  const flexiblePercent = flexibleLimit ? Math.round((flexibleSpent / flexibleLimit) * 100) : 0;

  return <><div className="page-heading"><div><p className="eyebrow">YOUR PLAN</p><h1>Categories</h1><p className="heading-sub">Set monthly limits and see actual spending from {transactions.length} transactions.</p></div><button className="secondary-button" onClick={onAdd}><Icon name="plus" size={16} /> Add custom category</button></div><div className="category-summary"><div className="panel category-total"><span>Total planned</span><strong>{money(totalPlanned)}</strong><div className="mini-progress"><i style={{ width: `${Math.min(100, plannedPercent)}%` }} /></div><small>{planDifference >= 0 ? `${money(planDifference)} unassigned from ${money(settings.spendingLimit)}` : `${money(planDifference)} over your ${money(settings.spendingLimit)} plan`}</small></div><div className="panel category-total"><span>Flexible categories</span><strong>{money(flexibleLimit)}</strong><div className="mini-progress blue"><i style={{ width: `${Math.min(100, flexiblePercent)}%` }} /></div><small>{money(flexibleSpent)} spent outside Housing</small></div><div className="panel category-total"><span>Needs attention</span><strong>{attentionCount}</strong><div className={attentionCount ? "attention-copy" : "attention-copy calm"}>{attentionCount ? "At or above 80% of their limits" : "Every category still has room"}</div></div></div><div className="category-cards">{cards.map((category) => {
    const percent = category.limit ? Math.round((category.amount / category.limit) * 100) : category.amount > 0 ? 100 : 0;
    const remaining = category.limit - category.amount;
    return <div className="panel category-card" key={category.id}><div className="category-card-top"><span className="category-icon" style={{ background: `${category.color}33`, color: category.color }}>{category.icon}</span><button className="category-edit-button" onClick={() => onEdit(category)}>Edit limit</button></div><div className="category-title"><h3>{category.name}</h3>{category.custom && <span>Custom</span>}</div><div className="category-amount"><strong>{money(category.amount)}</strong><span>of {money(category.limit)}</span></div><div className="progress-track"><i style={{ width: `${Math.min(100, percent)}%`, background: category.color }} /></div><div className="category-card-foot"><span>{percent}% used</span><span className={remaining < 0 ? "over-limit" : ""}>{remaining >= 0 ? `${money(remaining)} left` : `${money(remaining)} over`}</span></div></div>;
  })}</div></>;
}

function PlanPage({ accounts, goals, recurringItems, onAddAccount, onEditAccount, onAddGoal, onEditGoal, onAddRecurring, onEditRecurring }: { accounts: FinancialAccount[]; goals: SavingsGoal[]; recurringItems: RecurringItem[]; onAddAccount: () => void; onEditAccount: (account: FinancialAccount) => void; onAddGoal: () => void; onEditGoal: (goal: SavingsGoal) => void; onAddRecurring: () => void; onEditRecurring: (item: RecurringItem) => void }) {
  const totals = calculateNetWorth(accounts);
  const monthlyRecurring = calculateMonthlyRecurringTotal(recurringItems);
  const goalTarget = goals.reduce((total, goal) => total + goal.targetAmount, 0);
  const goalSaved = goals.reduce((total, goal) => total + Math.min(goal.currentAmount, goal.targetAmount), 0);
  const goalPercent = goalTarget ? Math.round((goalSaved / goalTarget) * 100) : 0;
  const sortedRecurring = [...recurringItems].sort((left, right) => (left.nextDate || "9999").localeCompare(right.nextDate || "9999"));

  return <><div className="page-heading"><div><p className="eyebrow">LOOKING AHEAD</p><h1>Financial plan</h1><p className="heading-sub">Track what you own and owe, known bills, and the goals your monthly budget is working toward.</p></div><div className="heading-actions"><button className="secondary-button" onClick={onAddRecurring}><Icon name="plus" size={15} /> Recurring item</button><button className="primary-button" onClick={onAddAccount}><Icon name="plus" size={16} /> Account balance</button></div></div>
    <div className="plan-summary"><div className="panel plan-metric"><span>Net worth</span><strong className={totals.netWorth < 0 ? "over-limit" : ""}>{totals.netWorth < 0 ? "−" : ""}{money(totals.netWorth)}</strong><small>{money(totals.assets)} assets · {money(totals.liabilities)} debt</small></div><div className="panel plan-metric"><span>Known monthly commitments</span><strong>{money(monthlyRecurring)}</strong><small>{recurringItems.length} recurring {recurringItems.length === 1 ? "item" : "items"}</small></div><div className="panel plan-metric"><span>Savings goals</span><strong>{money(goalSaved)}</strong><div className="mini-progress blue"><i style={{ width: `${Math.min(100, goalPercent)}%` }} /></div><small>{goalPercent}% of {money(goalTarget)} saved</small></div></div>
    <div className="plan-grid"><section className="panel plan-panel accounts-panel"><div className="panel-heading"><div><h2>Accounts & debts</h2><p>Manual balance snapshots used to calculate net worth</p></div><button className="ghost-button" onClick={onAddAccount}><Icon name="plus" size={13} /> Add</button></div><div className="planner-list">{accounts.length ? accounts.map((account) => <button className="planner-row" type="button" key={account.id} onClick={() => onEditAccount(account)}><span className={`planner-mark ${account.kind}`}>{account.kind === "asset" ? "↗" : "↘"}</span><span><strong>{account.name}</strong><small>{account.type} · {account.kind === "asset" ? "Asset" : "Liability"}</small></span><strong className={account.kind === "liability" ? "expense" : "income"}>{account.kind === "liability" ? "−" : "+"}{money(account.balance)}</strong><Icon name="more" size={15} /></button>) : <PlannerEmpty title="No balances added yet" copy="Add chequing, savings, investments, credit cards, and loans to see your net worth." action="Add account" onAction={onAddAccount} />}</div></section>
      <section className="panel plan-panel"><div className="panel-heading"><div><h2>Recurring bills & subscriptions</h2><p>Expected costs before they appear on a statement</p></div><button className="ghost-button" onClick={onAddRecurring}><Icon name="plus" size={13} /> Add</button></div><div className="planner-list">{sortedRecurring.length ? sortedRecurring.map((item) => <button className="planner-row" type="button" key={item.id} onClick={() => onEditRecurring(item)}><span className="planner-mark recurring">↻</span><span><strong>{item.name}</strong><small>{item.frequency} · {item.category}{item.nextDate ? ` · next ${formatStatementDate(item.nextDate)}` : ""}</small></span><strong>{money(monthlyEquivalent(item.amount, item.frequency))}<small>/mo</small></strong><Icon name="more" size={15} /></button>) : <PlannerEmpty title="No recurring costs yet" copy="Add rent, utilities, subscriptions, and other known commitments for a clearer forecast." action="Add recurring item" onAction={onAddRecurring} />}</div></section>
      <section className="panel plan-panel"><div className="panel-heading"><div><h2>Savings goals</h2><p>Emergency funds, travel, debt payoff, and large purchases</p></div><button className="ghost-button" onClick={onAddGoal}><Icon name="plus" size={13} /> Add</button></div><div className="goal-list">{goals.length ? goals.map((goal) => { const percent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)); const monthly = suggestedMonthlyContribution(goal); return <button className="goal-row" type="button" key={goal.id} onClick={() => onEditGoal(goal)}><span><strong>{goal.name}</strong><small>{money(goal.currentAmount)} of {money(goal.targetAmount)}{goal.targetDate ? ` · ${formatStatementDate(goal.targetDate)}` : ""}</small></span><span>{percent}%</span><div className="progress-track"><i style={{ width: `${percent}%`, background: "#83d4ba" }} /></div><small>{monthly > 0 ? `${money(monthly)} per month to stay on pace` : "Goal funded"}</small></button>; }) : <PlannerEmpty title="No savings goals yet" copy="Name a goal, set a target amount and date, and Pocketwise will show the monthly pace." action="Add savings goal" onAction={onAddGoal} />}</div></section></div>
  </>;
}

function PlannerEmpty({ title, copy, action, onAction }: { title: string; copy: string; action: string; onAction: () => void }) {
  return <div className="planner-empty"><span>✦</span><strong>{title}</strong><p>{copy}</p><button className="secondary-button small" type="button" onClick={onAction}>{action}</button></div>;
}

function ReportsPage({ transactions, settings, categories, accounts, goals, recurringItems, month, onDownload, onOpenPlan }: { transactions: Transaction[]; settings: BudgetSettings; categories: BudgetCategory[]; accounts: FinancialAccount[]; goals: SavingsGoal[]; recurringItems: RecurringItem[]; month: string; onDownload: () => void; onOpenPlan: () => void }) {
  const health = calculateFinancialHealth({ monthlyIncome: settings.monthlyIncome, spendingLimit: settings.spendingLimit, transactions, accounts });
  const netWorth = calculateNetWorth(accounts);
  const recurringTotal = calculateMonthlyRecurringTotal(recurringItems);
  const remaining = settings.spendingLimit - health.monthlyExpenses;
  const reviewCount = transactions.filter((transaction) => transaction.review).length;
  const categorySpending = calculateCategorySpending(categories, transactions);
  const categoryRows = categories
    .map((category) => ({ ...category, spent: categorySpending[category.name] ?? 0 }))
    .filter((category) => category.spent > 0 || category.limit > 0)
    .sort((left, right) => right.spent - left.spent)
    .slice(0, 5);
  const biggestCategory = categoryRows.find((category) => category.spent > 0);
  const fundedGoals = goals.filter((goal) => goal.currentAmount >= goal.targetAmount).length;
  const healthLabel = health.score >= 75 ? "Your plan has a solid foundation." : health.score >= 55 ? "Your plan is steady, with room to strengthen." : "A few focused changes would improve your buffer.";

  return <><div className="page-heading"><div><p className="eyebrow">THE BIGGER PICTURE</p><h1>Financial reports</h1><p className="heading-sub">Live calculations from {month}; transfers are excluded from spending.</p></div><button className="secondary-button" onClick={onDownload}><Icon name="download" size={15} /> Download report</button></div>
    <div className="metric-grid"><MetricCard label="Monthly spending" value={money(health.monthlyExpenses)} detail={`of ${money(settings.spendingLimit)} plan`} trend={`${settings.spendingLimit ? Math.round((health.monthlyExpenses / settings.spendingLimit) * 100) : 0}% used`} trendType={remaining >= 0 ? "neutral" : "warning"} icon="trend" /><MetricCard label="Remaining to spend" value={`${remaining < 0 ? "−" : ""}${money(remaining)}`} detail="Based on your spending limit" trend={remaining >= 0 ? "Available" : "Over plan"} trendType={remaining >= 0 ? "positive" : "warning"} icon="wallet" /><MetricCard label="Net worth" value={`${netWorth.netWorth < 0 ? "−" : ""}${money(netWorth.netWorth)}`} detail={`${money(netWorth.assets)} assets · ${money(netWorth.liabilities)} debt`} trend={accounts.length ? "Current snapshot" : "Add balances"} trendType="neutral" icon="forecast" /><MetricCard label="Recurring commitments" value={money(recurringTotal)} detail={`${recurringItems.length} known recurring items`} trend="Monthly equivalent" trendType="neutral" icon="leaf" /></div>
    <div className="report-grid"><div className="panel report-highlight"><div className="report-kicker">{month.toUpperCase()} SIGNAL</div><h2>{healthLabel}</h2><p>{health.message} Your current baseline leaves <strong>{remaining >= 0 ? money(remaining) : `${money(remaining)} over plan`}</strong> before month end.</p><div className="report-number"><strong>{health.score}/100</strong><span>{health.status} financial-health score · {health.savingsRate.toFixed(1)}% current savings rate</span></div></div><div className="panel report-bars"><div className="panel-heading"><div><h2>Category budget use</h2><p>Actual spending versus your limits</p></div></div>{categoryRows.map((category) => { const percent = category.limit ? Math.round((category.spent / category.limit) * 100) : category.spent > 0 ? 100 : 0; return <div className="bar-row" key={category.id}><span>{category.name}</span><div><i style={{ width: `${Math.min(100, percent)}%`, background: category.color }} /></div><strong className={percent > 100 ? "over-limit" : ""}>{percent}%</strong></div>; })}</div></div>
    <div className="panel insight-list"><div className="panel-heading"><div><h2>Helpful nudges</h2><p>Specific observations from the data you have entered</p></div></div><div className="insight"><span className="insight-icon mint">✦</span><div><strong>{reviewCount ? `${reviewCount} imported ${reviewCount === 1 ? "transaction needs" : "transactions need"} review` : "Imported transactions are categorized"}</strong><p>{reviewCount ? "Confirming merchants and categories keeps forecasts and reports accurate." : "Nothing in this month is currently flagged for category review."}</p></div></div><div className="insight"><span className="insight-icon peach">↘</span><div><strong>{biggestCategory ? `${biggestCategory.name} is your largest spending category` : "Add transactions to reveal spending patterns"}</strong><p>{biggestCategory ? `${money(biggestCategory.spent)} spent against a ${money(biggestCategory.limit)} monthly category limit.` : "Your category report will update as soon as statement or manual entries are added."}</p></div></div><button className="insight insight-button" type="button" onClick={onOpenPlan}><span className="insight-icon purple">⌁</span><div><strong>{accounts.length ? `${health.emergencyMonths ?? 0} months of essential expenses in cash accounts` : "Add balances for net worth and emergency coverage"}</strong><p>{accounts.length ? "Canadian guidance commonly uses three to six months as an emergency-fund range." : "Pocketwise cannot assess your financial buffer from transactions alone."}</p></div><Icon name="arrow" size={16} /></button><div className="insight"><span className="insight-icon mint">◎</span><div><strong>{goals.length ? `${fundedGoals} of ${goals.length} savings goals funded` : "Turn future expenses into savings goals"}</strong><p>{goals.length ? "Update saved amounts as you contribute so your monthly pace stays useful." : "An emergency fund or planned purchase is a good first goal."}</p></div></div></div>
  </>;
}
