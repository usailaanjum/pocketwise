"use client";

// This page keeps editable app data in React state. The storage helpers below
// persist that snapshot separately from the original imported statement files.

import type { ChangeEvent, Dispatch, DragEvent, FormEvent, ReactNode, RefObject, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculateCategorySpending,
  createDefaultCategories,
  customCategoryColors,
  hasCustomCategoryPlan,
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
import { clearLocalDatabase, getStatementFile, listStatements, loadWorkspace, saveImportedStatement, saveWorkspace } from "../lib/local-database";
import type { SavedStatement } from "../lib/local-database";
import { availableMonths, localDateInput, monthLabel } from "../lib/calendar";
import { calculateSpendingForecast } from "../lib/forecast";

type Tab = "Dashboard" | "Transactions" | "Import" | "Budget" | "Forecast & plan" | "Settings";
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
  sourceStatementId?: string;
};

type BudgetSettings = {
  monthlyIncome: number;
  spendingLimit: number;
  currency: "CAD";
};

type WorkspaceSnapshot = {
  settings: BudgetSettings;
  transactions: Transaction[];
  categories: BudgetCategory[];
  accounts: FinancialAccount[];
  goals: SavingsGoal[];
  recurringItems: RecurringItem[];
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

// Read and validate legacy localStorage arrays during the IndexedDB migration.
function legacyItems<T>(raw: string | null, isItem: (value: unknown) => value is T): T[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter(isItem) : [];
}

const emptyTransactionDraft: TransactionDraft = { merchant: "", amount: "", category: "Groceries", note: "", date: "", kind: "expense" };
const accountTypes: AccountType[] = ["Chequing", "Savings", "Cash", "Investment", "Credit card", "Line of credit", "Loan", "Mortgage", "Other"];
const recurringFrequencies: RecurringFrequency[] = ["Weekly", "Every two weeks", "Monthly", "Yearly"];

// Render a shared line icon by name and size.
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

// Format an absolute amount as Canadian dollars for display.
function money(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(Math.abs(value));
}

// Turn a saved ISO date into a readable local statement date.
function formatStatementDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

// Convert a saved display date back into the value expected by a date input.
function editableDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : localDateInput(parsed);
}

// Match every search term against a transaction's name, note, and date formats.
function matchesTransactionSearch(transaction: Transaction, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const searchable = `${transaction.merchant} ${transaction.note} ${transaction.date} ${editableDate(transaction.date)}`.toLowerCase();
  return terms.every((term) => searchable.includes(term));
}

// Own the local workspace state, data persistence, page navigation, and dialogs.
export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [forecastView, setForecastView] = useState<"Forecast" | "Plan">("Forecast");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [quickSearch, setQuickSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [transactionMonthFilter, setTransactionMonthFilter] = useState("All months");
  const [month, setMonth] = useState(() => monthLabel(new Date()));
  const [showModal, setShowModal] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [showBudgetSetup, setShowBudgetSetup] = useState(false);
  const [budgetSetupRequired, setBudgetSetupRequired] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [pendingImport, setPendingImport] = useState<Transaction[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  const [savedStatements, setSavedStatements] = useState<SavedStatement[]>([]);
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
  const [settingsMessage, setSettingsMessage] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [form, setForm] = useState<TransactionDraft>(emptyTransactionDraft);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const quickSearchRef = useRef<HTMLDivElement>(null);
  const quickSearchInputRef = useRef<HTMLInputElement>(null);
  const quickSearchButtonRef = useRef<HTMLButtonElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const importRequestRef = useRef(0);
  const categoriesCustomizedRef = useRef(false);

  // Hydrate the workspace before allowing edits, so initial empty state cannot overwrite saved data.
  useEffect(() => {
    let cancelled = false;
    // Load IndexedDB data, migrating any earlier localStorage workspace once.
    async function initializeStorage() {
      try {
        let saved = await loadWorkspace<WorkspaceSnapshot>();
        if (!saved) {
          const legacy = {
            settings: window.localStorage.getItem(storageKeys.settings),
            transactions: window.localStorage.getItem(storageKeys.transactions),
            categories: window.localStorage.getItem(storageKeys.categories),
            accounts: window.localStorage.getItem(storageKeys.accounts),
            goals: window.localStorage.getItem(storageKeys.goals),
            recurringItems: window.localStorage.getItem(storageKeys.recurring),
          };
          if (Object.values(legacy).some(Boolean)) {
            const legacySettings = legacy.settings ? JSON.parse(legacy.settings) as BudgetSettings : defaultSettings;
            const legacyCategories = legacyItems(legacy.categories, isBudgetCategory);
            saved = {
              settings: legacySettings,
              transactions: legacy.transactions ? JSON.parse(legacy.transactions) as Transaction[] : [],
              categories: legacyCategories.length
                ? legacyCategories
                : createDefaultCategories(legacySettings.spendingLimit),
              accounts: legacyItems(legacy.accounts, isFinancialAccount),
              goals: legacyItems(legacy.goals, isSavingsGoal),
              recurringItems: legacyItems(legacy.recurringItems, isRecurringItem),
            };
            await saveWorkspace(saved);
          }
        }
        const statements = await listStatements();
        if (cancelled) return;
        if (saved) {
          setSettings(saved.settings);
          setTransactions(saved.transactions);
          setBudgetCategories(saved.categories);
          setAccounts(saved.accounts);
          setGoals(saved.goals);
          setRecurringItems(saved.recurringItems);
          setBudgetDraft({ monthlyIncome: String(saved.settings.monthlyIncome), spendingLimit: String(saved.settings.spendingLimit) });
          categoriesCustomizedRef.current = hasCustomCategoryPlan(saved.categories, saved.settings.spendingLimit);
        } else {
          setShowBudgetSetup(true);
          setBudgetSetupRequired(true);
        }
        setSavedStatements(statements);
        setStorageReady(true);
      } catch (error) {
        if (!cancelled) setStorageError(error instanceof Error ? error.message : "Browser storage is unavailable.");
      }
    }
    void initializeStorage();
    return () => { cancelled = true; };
  }, []);

  // Persist every workspace edit in order once hydration has completed.
  useEffect(() => {
    if (!storageReady) return;
    void saveWorkspace({ settings, transactions, categories: budgetCategories, accounts, goals, recurringItems })
      .then(() => setStorageError(""))
      .catch((error) => setStorageError(error instanceof Error ? error.message : "Browser storage could not save this change."));
  }, [settings, transactions, budgetCategories, accounts, goals, recurringItems, storageReady]);

  // Let users dismiss notifications without changing the current page.
  useEffect(() => {
    if (!notificationsOpen) return;
    // Dismiss the open header panel when a pointer press happens outside it.
    function closeOnOutsideClick(event: PointerEvent) {
      if (!notificationRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    }
    // Close the open header panel on Escape and return focus to its button.
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        notificationButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  // Search stays in a header popover and only opens an editor when a result is chosen.
  useEffect(() => {
    if (!searchOpen) return;
    quickSearchInputRef.current?.focus();
    // Dismiss the open header panel when a pointer press happens outside it.
    function closeOnOutsideClick(event: PointerEvent) {
      if (!quickSearchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    }
    // Close the open header panel on Escape and return focus to its button.
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSearchOpen(false);
        quickSearchButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [searchOpen]);

  // The Transactions page uses the same name and date matcher as header search.
  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    const matchesSearch = matchesTransactionSearch(transaction, search);
    return matchesSearch && (categoryFilter === "All categories" || transaction.category === categoryFilter) && (transactionMonthFilter === "All months" || transaction.monthKey === transactionMonthFilter) && (!reviewOnly || transaction.review);
  }), [transactions, search, categoryFilter, reviewOnly, transactionMonthFilter]);

  const quickSearchResults = useMemo(() => quickSearch.trim()
    ? transactions.filter((transaction) => matchesTransactionSearch(transaction, quickSearch))
    : [], [transactions, quickSearch]);

  const categoryOptions = useMemo(() => {
    const names = new Set(budgetCategories.map((category) => category.name));
    names.add("Income");
    names.add("Payments & transfers");
    for (const transaction of transactions) names.add(transaction.category);
    return Array.from(names);
  }, [budgetCategories, transactions]);

  // Prepare a blank transaction form with today's local date.
  function openAddTransaction() {
    setEditingTransactionId(null);
    setForm({ ...emptyTransactionDraft, date: localDateInput(new Date()) });
    setShowModal(true);
  }

  // Fill the transaction form from an existing row.
  function openEditTransaction(transaction: Transaction) {
    setEditingTransactionId(transaction.id);
    setForm({
      merchant: transaction.merchant,
      amount: String(Math.abs(transaction.amount)),
      category: transaction.category,
      note: transaction.note,
      date: editableDate(transaction.date),
      kind: transaction.amount >= 0 ? "income" : "expense",
    });
    setShowModal(true);
  }

  // Validate and save a manual or edited transaction, then update its month.
  function saveTransaction(event: FormEvent) {
    event.preventDefault();
    if (!form.merchant || !form.amount) return;
    const magnitude = Math.abs(Number(form.amount));
    if (!Number.isFinite(magnitude) || magnitude === 0) return;
    const amount = form.kind === "income" ? magnitude : -magnitude;
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(form.date)
      ? new Date(`${form.date}T12:00:00`)
      : new Date(form.date);
    const monthKey = Number.isNaN(parsedDate.getTime()) ? month : monthLabel(parsedDate);
    if (editingTransactionId !== null) {
      setTransactions((current) => current.map((transaction) => transaction.id === editingTransactionId
        ? {
          ...transaction,
          merchant: form.merchant.trim(),
          note: form.note.trim() || "Manual entry",
          date: form.date ? formatStatementDate(form.date) : transaction.date,
          amount,
          category: form.category,
          initials: form.merchant.trim().slice(0, 1).toUpperCase(),
          monthKey: form.date ? monthKey : transaction.monthKey ?? month,
          postingDate: form.date && formatStatementDate(form.date) !== transaction.date ? undefined : transaction.postingDate,
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
    if (editingTransactionId === null) setMonth(monthKey);
    setEditingTransactionId(null);
    setShowModal(false);
  }

  // Confirm deletion before removing a transaction from the workspace.
  function deleteTransaction() {
    if (editingTransactionId === null) return;
    const transaction = transactions.find((item) => item.id === editingTransactionId);
    if (!transaction || !window.confirm(`Delete ${transaction.merchant} from your transactions?`)) return;
    setTransactions((current) => current.filter((item) => item.id !== editingTransactionId));
    setEditingTransactionId(null);
    setShowModal(false);
  }

  // Suggest a category for CSV rows from the merchant name.
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

  // Split one CSV row while respecting quoted commas and escaped quotes.
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

  // Reset the preview and open the dedicated import area.
  function openImport() {
    if (importSaving) { setActiveTab("Import"); return; }
    setPendingImport([]);
    setImportCounts({ found: 0, review: 0, duplicates: 0 });
    setImportMessage("");
    setImportWarnings([]);
    setActiveTab("Import");
  }

  // Save budget baselines and refresh untouched default category limits.
  function saveBudget(event: FormEvent) {
    event.preventDefault();
    const monthlyIncome = Number(budgetDraft.monthlyIncome);
    const spendingLimit = Number(budgetDraft.spendingLimit);
    if (monthlyIncome <= 0 || spendingLimit <= 0) return;
    setSettings({ monthlyIncome, spendingLimit, currency: "CAD" });
    if (!categoriesCustomizedRef.current) setBudgetCategories(createDefaultCategories(spendingLimit));
    setBudgetSetupRequired(false);
    setShowBudgetSetup(false);
    setSettingsMessage("Financial baseline saved in this browser.");
  }

  // Prepare the form and color for a new custom category.
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

  // Load an existing category into the limit editor.
  function openEditCategory(category: BudgetCategory) {
    setCategoryDraft({ name: category.name, limit: String(category.limit), color: category.color });
    setEditingCategoryId(category.id);
    setCategoryError("");
    setCategoryEditorMode("edit");
  }

  // Clear category editing state and validation errors.
  function closeCategoryEditor() {
    setCategoryEditorMode(null);
    setEditingCategoryId(null);
    setCategoryError("");
  }

  // Validate a category, update its limit, and rename linked transactions if needed.
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

  // Clear the account, goal, or recurring item editor.
  function closePlannerEditor() {
    setPlannerEditor(null);
    setPlannerEditingId(null);
    setPlannerError("");
  }

  // Open the account form for a new or existing balance.
  function openAccountEditor(account?: FinancialAccount) {
    setPlannerEditingId(account?.id ?? null);
    setAccountDraft(account
      ? { name: account.name, kind: account.kind, type: account.type, balance: String(account.balance) }
      : { name: "", kind: "asset", type: "Chequing", balance: "" });
    setPlannerError("");
    setPlannerEditor("account");
  }

  // Open the savings goal form with current values when editing.
  function openGoalEditor(goal?: SavingsGoal) {
    setPlannerEditingId(goal?.id ?? null);
    setGoalDraft(goal
      ? { name: goal.name, targetAmount: String(goal.targetAmount), currentAmount: String(goal.currentAmount), targetDate: goal.targetDate }
      : { name: "", targetAmount: "", currentAmount: "", targetDate: "" });
    setPlannerError("");
    setPlannerEditor("goal");
  }

  // Open the recurring item form with current values when editing.
  function openRecurringEditor(item?: RecurringItem) {
    setPlannerEditingId(item?.id ?? null);
    setRecurringDraft(item
      ? { name: item.name, amount: String(item.amount), category: item.category, frequency: item.frequency, nextDate: item.nextDate }
      : { name: "", amount: "", category: "Utilities", frequency: "Monthly", nextDate: "" });
    setPlannerError("");
    setPlannerEditor("recurring");
  }

  // Validate and save an asset or liability balance.
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

  // Validate and save a savings target and progress amount.
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

  // Validate and save a recurring payment or income item.
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

  // Confirm and remove the planner item currently being edited.
  function deletePlannerItem() {
    if (!plannerEditingId || !plannerEditor) return;
    const labels = { account: "account", goal: "goal", recurring: "recurring item" } as const;
    if (!window.confirm(`Delete this ${labels[plannerEditor]}?`)) return;
    if (plannerEditor === "account") setAccounts((current) => current.filter((item) => item.id !== plannerEditingId));
    if (plannerEditor === "goal") setGoals((current) => current.filter((item) => item.id !== plannerEditingId));
    if (plannerEditor === "recurring") setRecurringItems((current) => current.filter((item) => item.id !== plannerEditingId));
    closePlannerEditor();
  }

  // Create a browser download for generated CSV or JSON content.
  function downloadLocalFile(filename: string, contents: string, type: string) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Retrieve and download an untouched original statement from IndexedDB.
  async function downloadStatement(statement: SavedStatement) {
    try {
      const file = await getStatementFile(statement.id);
      if (!file) throw new Error("The original file could not be found in this browser.");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = statement.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "The original file could not be downloaded.");
    }
  }

  // Export the selected transactions and their source details as CSV.
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

  // Export the selected month's calculated financial summary as CSV.
  function exportReport() {
    const health = calculateFinancialHealth({
      monthlyIncome: settings.monthlyIncome,
      spendingLimit: settings.spendingLimit,
      transactions: monthTransactions,
      accounts,
    });
    const forecast = calculateSpendingForecast(monthTransactions, month, settings.monthlyIncome);
    const netWorth = calculateNetWorth(accounts);
    const rows = [
      ["Pocketwise report", month],
      ["Monthly income baseline", settings.monthlyIncome.toFixed(2)],
      ["Spending", health.monthlyExpenses.toFixed(2)],
      ["Projected month-end spending", forecast.projectedTotal.toFixed(2)],
      ["Projected remaining budget", (settings.spendingLimit - forecast.projectedTotal).toFixed(2)],
      ["Projected savings", forecast.projectedSavings.toFixed(2)],
      ["Projected savings rate", `${forecast.projectedSavingsRate.toFixed(1)}%`],
      ["Savings rate", `${health.savingsRate.toFixed(1)}%`],
      ["Financial health score", `${health.score}/100`],
      ["Assets", netWorth.assets.toFixed(2)],
      ["Liabilities", netWorth.liabilities.toFixed(2)],
      ["Net worth", netWorth.netWorth.toFixed(2)],
      ["Recurring monthly commitments", calculateMonthlyRecurringTotal(recurringItems).toFixed(2)],
    ];
    downloadLocalFile(`pocketwise-report-${month.toLowerCase().replaceAll(" ", "-")}.csv`, rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  // Download editable app data as a JSON backup; originals stay separate.
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

  // Delete local app data and originals only after an explicit user confirmation.
  async function clearLocalData() {
    if (!window.confirm("Delete all Pocketwise data in this browser, including original statements? This cannot be undone.")) return;
    try {
      await clearLocalDatabase();
      for (const key of Object.values(storageKeys)) window.localStorage.removeItem(key);
      window.location.reload();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Browser data could not be cleared.");
    }
  }

  // Validate a JSON backup before replacing editable workspace data.
  async function restoreBackup(file: File) {
    setBackupMessage("");
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("Backup files must be smaller than 50 MB.");
      const backup = JSON.parse(await file.text()) as Record<string, unknown>;
      const nextSettings = backup.settings as Partial<BudgetSettings> | undefined;
      const nextTransactions = backup.transactions;
      const nextCategories = backup.categories;
      const nextAccounts = backup.accounts;
      const nextGoals = backup.goals;
      const nextRecurring = backup.recurringItems;
      // A backup is external input even when it was originally created by this app.
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
      if (!window.confirm("Restore this backup and replace current app data? Saved original statement files will remain in this browser.")) return;
      const restoredSettings = nextSettings as BudgetSettings;
      await saveWorkspace({ settings: restoredSettings, transactions: nextTransactions, categories: nextCategories, accounts: nextAccounts, goals: nextGoals, recurringItems: nextRecurring });
      setSettings(restoredSettings);
      setBudgetDraft({ monthlyIncome: String(restoredSettings.monthlyIncome), spendingLimit: String(restoredSettings.spendingLimit) });
      setTransactions(nextTransactions);
      setBudgetCategories(nextCategories);
      setAccounts(nextAccounts);
      setGoals(nextGoals);
      setRecurringItems(nextRecurring);
      categoriesCustomizedRef.current = hasCustomCategoryPlan(nextCategories, restoredSettings.spendingLimit);
      setBudgetSetupRequired(false);
      setBackupMessage("Backup restored successfully.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "The backup could not be restored.");
    }
  }

  // Parse a CSV or PDF locally and preview unique rows before saving.
  async function handleFile(file: File) {
    if (importSaving) return;
    const requestId = ++importRequestRef.current;
    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isPdf = lowerName.endsWith(".pdf");
    setActiveTab("Import");
    setPendingImport([]);
    setPendingFile(null);
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
      // CSV column names must identify dates, descriptions, and money before rows are accepted.
      if (isCsv) {
        const rows = (await file.text()).split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
        if (requestId !== importRequestRef.current) return;
        const headers = parseCsvRow(rows[0] || "").map((header) => header.toLowerCase());
        const indexOf = (...names: string[]) => headers.findIndex((header) => names.some((name) => header.includes(name)));
        const dateIndex = indexOf("transaction date", "date");
        const merchantIndex = indexOf("description", "merchant", "payee", "activity");
        const amountIndex = headers.findIndex((header) => header.includes("amount") && !/(original|foreign|exchange)/.test(header));
        const debitIndex = indexOf("debit");
        const creditIndex = indexOf("credit");
        const originalAmountIndex = indexOf("original amount", "foreign amount");
        const originalCurrencyIndex = indexOf("original currency", "foreign currency", "currency");
        const exchangeRateIndex = indexOf("exchange rate", "fx rate");
        if (dateIndex < 0 || merchantIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
          setImportMessage(`${file.name} · CSV needs date, description, and amount or debit/credit columns.`);
          return;
        }
        const parsed = rows.slice(1).map((row, index) => {
          const columns = parseCsvRow(row);
          const merchant = columns[merchantIndex] || columns[1] || columns[0] || `Imported item ${index + 1}`;
          const debit = Number((columns[debitIndex] || "0").replace(/[$,]/g, ""));
          const credit = Number((columns[creditIndex] || "0").replace(/[$,]/g, ""));
          const rawAmount = Number((columns[amountIndex] || "0").replace(/[$,]/g, ""));
          const amount = debit ? -Math.abs(debit) : credit ? Math.abs(credit) : rawAmount;
          const originalAmount = Number((columns[originalAmountIndex] || "0").replace(/[$,]/g, "")) || undefined;
          const originalCurrency = columns[originalCurrencyIndex]?.toUpperCase() || undefined;
          const exchangeRate = Number(columns[exchangeRateIndex] || "0") || undefined;
          const date = columns[dateIndex] || columns[0] || "Imported";
          const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date(date);
          const monthKey = Number.isNaN(parsedDate.getTime()) ? month : monthLabel(parsedDate);
          const category = inferCategory(merchant);
          return { id: Date.now() + index, merchant, note: "Imported from CSV", date, amount, category, initials: merchant.slice(0, 1).toUpperCase(), tone: "mint", originalAmount, originalCurrency, exchangeRate, monthKey, review: category === "Other" };
        }).filter((item) => item.amount !== 0);
        const { unique, duplicateCount } = excludeExistingTransactions(transactions, parsed);
        const review = unique.filter((item) => item.review).length;
        setPendingImport(unique);
        setPendingFile(parsed.length ? file : null);
        setImportCounts({ found: unique.length, review, duplicates: duplicateCount });
        setImportMessage(unique.length
          ? `${file.name} · ${unique.length} new line items ready to review`
          : duplicateCount ? `${file.name} · transactions already added; you can still save the original`
            : `${file.name} · no transaction rows found`);
        const warnings: string[] = [];
        if (!parsed.length) warnings.push("No non-zero transaction rows were found. Check the CSV column names.");
        if (duplicateCount) warnings.push(`${duplicateCount} matching ${duplicateCount === 1 ? "transaction was" : "transactions were"} already in Pocketwise and skipped.`);
        setImportWarnings(warnings);
        return;
      }

      // PDF parsing uses institution and column clues instead of the uploaded filename.
      const result = await parsePdfStatement(file);
      if (requestId !== importRequestRef.current) return;
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
      setPendingFile(imported.length ? file : null);
      setImportCounts({ found: unique.length, review, duplicates: duplicateCount });
      setImportWarnings([
        ...result.warnings,
        ...(duplicateCount ? [`${duplicateCount} matching ${duplicateCount === 1 ? "transaction was" : "transactions were"} already in Pocketwise and skipped.`] : []),
      ]);
      setImportMessage(unique.length
        ? `${file.name} · ${result.institutionName} · ${unique.length} new line items found`
        : duplicateCount ? `${file.name} · transactions already added; you can still save the original`
          : `${file.name} · no transaction rows recognized`);
      if (result.statementMonth) setMonth(result.statementMonth);
    } catch (error) {
      if (requestId !== importRequestRef.current) return;
      setPendingImport([]);
      setPendingFile(null);
      setImportCounts({ found: 0, review: 0, duplicates: 0 });
      const message = error instanceof StatementPdfError
        ? error.message
        : "This statement could not be read. Try a searchable PDF or CSV export.";
      setImportMessage(`${file.name} · ${message}`);
    }
  }

  // Atomically store the original file and add its unique transactions.
  async function confirmImport() {
    if (!pendingFile || importSaving || !storageReady || pendingImport.some((transaction) => transaction.review)) return;
    setImportSaving(true);
    const statement: SavedStatement = {
      id: crypto.randomUUID(),
      name: pendingFile.name,
      type: pendingFile.type || (pendingFile.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/csv"),
      size: pendingFile.size,
      importedAt: new Date().toISOString(),
      transactionCount: pendingImport.length,
    };
    const nextTransactions = [...pendingImport.map((item) => ({ ...item, sourceStatementId: statement.id })), ...transactions];
    try {
      await saveImportedStatement(pendingFile, statement, {
        settings, transactions: nextTransactions, categories: budgetCategories, accounts, goals, recurringItems,
      } satisfies WorkspaceSnapshot);
      setTransactions(nextTransactions);
      setSavedStatements((current) => [statement, ...current]);
      setPendingFile(null);
      setPendingImport([]);
      setActiveTab("Transactions");
      setStorageError("");
    } catch (error) {
      setImportMessage(error instanceof Error ? `Could not save the statement: ${error.message}` : "Could not save the statement in this browser.");
    } finally {
      setImportSaving(false);
    }
  }

  // Pass a chosen statement file into the shared import flow.
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleFile(file);
    event.target.value = "";
  }

  // Pass a dropped statement file into the shared import flow.
  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const navItems: { label: Tab; icon: string }[] = [
    { label: "Dashboard", icon: "grid" }, { label: "Transactions", icon: "card" }, { label: "Import", icon: "upload" }, { label: "Budget", icon: "tag" }, { label: "Forecast & plan", icon: "chart" }, { label: "Settings", icon: "settings" },
  ];
  const monthTransactions = transactions.filter((transaction) => !transaction.monthKey || transaction.monthKey === month);
  const monthOptions = availableMonths(new Date(), month, transactions.map((transaction) => transaction.monthKey));
  const transactionMonthOptions = monthOptions.filter((option) => transactions.some((transaction) => transaction.monthKey === option));
  const reviewCount = transactions.filter((transaction) => transaction.review).length;
  const financialHealth = calculateFinancialHealth({ monthlyIncome: settings.monthlyIncome, spendingLimit: settings.spendingLimit, transactions: monthTransactions, accounts });
  const monthRemaining = settings.spendingLimit - financialHealth.monthlyExpenses;
  const monthlyPulse = monthTransactions.length ? `${financialHealth.status} monthly pulse.` : `No activity in ${month} yet.`;
  const activeEditingCategory = editingCategoryId
    ? budgetCategories.find((category) => category.id === editingCategoryId)
    : undefined;
  const editingTransaction = editingTransactionId === null ? undefined : transactions.find((transaction) => transaction.id === editingTransactionId);

  return (
    <>
    <main className="app-shell" inert={!storageReady} aria-busy={!storageReady}>
      <aside className="sidebar">
        <button className="brand" type="button" aria-label="Pocketwise — go to Dashboard" onClick={() => setActiveTab("Dashboard")}><span className="brand-mark">↗</span><span>pocketwise</span></button>
        <div className="workspace-label">PERSONAL SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => <button key={item.label} className={`nav-item ${activeTab === item.label ? "active" : ""}`} type="button" aria-label={item.label} aria-current={activeTab === item.label ? "page" : undefined} onClick={() => { if (item.label === "Forecast & plan") setForecastView("Forecast"); setActiveTab(item.label); }}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.label === "Transactions" && <span className="nav-count">{transactions.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="tip-card"><div className="tip-spark">✦</div><p><strong>{monthlyPulse}</strong><br />{monthTransactions.length ? monthRemaining >= 0 ? `${money(monthRemaining)} remains in your spending plan.` : `${money(monthRemaining)} over your spending plan.` : "Add or import transactions to see your monthly picture."}</p><button onClick={() => { setForecastView("Forecast"); setActiveTab("Forecast & plan"); }}>View forecast <Icon name="arrow" size={14} /></button></div>
          <div className="profile"><div className="avatar">⌂</div><div><strong>Local workspace</strong><span>Saved in this browser</span></div></div>
        </div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <nav className="breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => setActiveTab("Dashboard")}>Personal space</button><span aria-hidden="true">/</span><strong aria-current="page">{activeTab}</strong></nav>
          <div className="top-actions">
            <div className="quick-search-wrap" ref={quickSearchRef}>
              <button ref={quickSearchButtonRef} className="icon-button" type="button" aria-label="Search transactions" aria-expanded={searchOpen} aria-controls="quick-search-panel" onClick={() => { setQuickSearch(""); setNotificationsOpen(false); setSearchOpen((open) => !open); }}><Icon name="search" size={18} /></button>
              {searchOpen && <div className="quick-search-panel" id="quick-search-panel" aria-label="Search transactions">
                <div className="quick-search-heading"><strong>Find a transaction</strong><span>Search all dates</span></div>
                <form role="search" onSubmit={(event) => { event.preventDefault(); if (quickSearchResults[0]) { openEditTransaction(quickSearchResults[0]); setSearchOpen(false); } }}>
                  <Icon name="search" size={17} />
                  <input ref={quickSearchInputRef} value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} aria-label="Search by merchant, name, or date" placeholder="Merchant, name, or date" autoComplete="off" />
                </form>
                <div className="quick-search-results">
                  {!quickSearch.trim() && <p className="quick-search-empty">Type a merchant, name, or date to search your saved transactions.</p>}
                  {quickSearch.trim() && !quickSearchResults.length && <p className="quick-search-empty">No transactions found for “{quickSearch.trim()}”.</p>}
                  {quickSearchResults.slice(0, 8).map((transaction) => <button className="quick-search-result" type="button" key={transaction.id} onClick={() => { openEditTransaction(transaction); setSearchOpen(false); }}><span><strong>{transaction.merchant}</strong><small>{transaction.date} · {transaction.category}</small></span><b>{transaction.amount < 0 ? "−" : "+"}{money(transaction.amount)}</b></button>)}
                </div>
                {quickSearchResults.length > 8 && <button className="quick-search-all" type="button" onClick={() => { setSearch(quickSearch.trim()); setCategoryFilter("All categories"); setTransactionMonthFilter("All months"); setReviewOnly(false); setActiveTab("Transactions"); setSearchOpen(false); }}>View all {quickSearchResults.length} matches <Icon name="arrow" size={14} /></button>}
              </div>}
            </div>
            <div className="notification-wrap" ref={notificationRef}><button ref={notificationButtonRef} className="icon-button notification" type="button" aria-label="Notifications" aria-expanded={notificationsOpen} aria-controls="notification-panel" onClick={() => { setSearchOpen(false); setNotificationsOpen((open) => !open); }}><Icon name="bell" size={18} />{reviewCount > 0 && <span className="review-count">{reviewCount}</span>}</button>{notificationsOpen && <div className="notification-panel" id="notification-panel" aria-label="Notifications"><div className="notification-heading"><strong>Notifications</strong><span>{reviewCount ? `${reviewCount} need review` : "You're up to date"}</span></div><div className="notification-list">{reviewCount > 0 && <button className="notification-item" type="button" onClick={() => { setSearch(""); setCategoryFilter("All categories"); setTransactionMonthFilter("All months"); setReviewOnly(true); setActiveTab("Transactions"); setNotificationsOpen(false); }}><span className="notification-symbol review">!</span><span><strong>{reviewCount} {reviewCount === 1 ? "transaction needs" : "transactions need"} review</strong><small>Check imported merchants and categories.</small></span><Icon name="arrow" size={15} /></button>}{savedStatements.slice(0, 5).map((statement) => <button className="notification-item" type="button" key={statement.id} onClick={() => { setActiveTab("Settings"); setNotificationsOpen(false); }}><span className="notification-symbol saved">✓</span><span><strong>Statement added</strong><small>{statement.name} · {statement.transactionCount} {statement.transactionCount === 1 ? "transaction" : "transactions"} · {new Date(statement.importedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</small></span><Icon name="arrow" size={15} /></button>)}{!reviewCount && !savedStatements.length && <p className="notification-empty">No notifications yet. Imported statements and items needing review will appear here.</p>}</div></div>}</div>
          </div>
        </header>

        <div className="content-inner">
          {storageError && <div className="storage-error" role="alert">Saved data is unavailable: {storageError} Changes may not be kept. Reload after checking browser storage.</div>}
          {activeTab === "Dashboard" && <Overview month={month} monthOptions={monthOptions} setMonth={setMonth} onImport={openImport} onAdd={openAddTransaction} onOpenTransactions={() => setActiveTab("Transactions")} onOpenCategories={() => setActiveTab("Budget")} onReports={() => { setForecastView("Forecast"); setActiveTab("Forecast & plan"); }} onOpenPlan={() => { setForecastView("Plan"); setActiveTab("Forecast & plan"); }} onAddAccount={() => openAccountEditor()} onAddGoal={() => openGoalEditor()} onAddRecurring={() => openRecurringEditor()} onEditGoal={openGoalEditor} onEditRecurring={openRecurringEditor} transactions={monthTransactions} settings={settings} categories={budgetCategories} accounts={accounts} goals={goals} recurringItems={recurringItems} onEditTransaction={openEditTransaction} />}
          {activeTab === "Transactions" && <TransactionsPage transactions={filteredTransactions} searchRef={searchRef} reviewOnly={reviewOnly} setReviewOnly={setReviewOnly} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} monthFilter={transactionMonthFilter} setMonthFilter={setTransactionMonthFilter} monthOptions={transactionMonthOptions} onImport={openImport} onAdd={openAddTransaction} categoryOptions={categoryOptions} onEdit={openEditTransaction} onExport={() => exportTransactions(filteredTransactions)} />}
          {activeTab === "Import" && <ImportPage fileRef={fileRef} pendingFile={pendingFile} pendingImport={pendingImport} setPendingImport={setPendingImport} importMessage={importMessage} importWarnings={importWarnings} duplicateCount={importCounts.duplicates} importSaving={importSaving} storageReady={storageReady} categoryOptions={categoryOptions} savedStatements={savedStatements} onChooseFile={chooseFile} onDropFile={dropFile} onSave={() => void confirmImport()} onDownloadStatement={(statement) => void downloadStatement(statement)} />}
          {activeTab === "Budget" && <CategoriesPage month={month} monthOptions={monthOptions} setMonth={setMonth} settings={settings} categories={budgetCategories} transactions={monthTransactions} onAdd={openAddCategory} onEdit={openEditCategory} />}
          {activeTab === "Forecast & plan" && <><nav className="section-switch" aria-label="Forecast and plan"><button type="button" aria-current={forecastView === "Forecast" ? "page" : undefined} className={forecastView === "Forecast" ? "active" : ""} onClick={() => setForecastView("Forecast")}>Forecast</button><button type="button" aria-current={forecastView === "Plan" ? "page" : undefined} className={forecastView === "Plan" ? "active" : ""} onClick={() => setForecastView("Plan")}>Goals & accounts</button></nav>{forecastView === "Forecast" ? <ReportsPage transactions={monthTransactions} settings={settings} categories={budgetCategories} accounts={accounts} goals={goals} recurringItems={recurringItems} month={month} monthOptions={monthOptions} setMonth={setMonth} onDownload={exportReport} onOpenPlan={() => setForecastView("Plan")} /> : <PlanPage accounts={accounts} goals={goals} recurringItems={recurringItems} onAddAccount={() => openAccountEditor()} onEditAccount={openAccountEditor} onAddGoal={() => openGoalEditor()} onEditGoal={openGoalEditor} onAddRecurring={() => openRecurringEditor()} onEditRecurring={openRecurringEditor} />}</>}
          {activeTab === "Settings" && <SettingsPage budgetDraft={budgetDraft} setBudgetDraft={setBudgetDraft} onSaveBudget={saveBudget} settingsMessage={settingsMessage} onDownloadBackup={downloadBackup} onClearData={() => void clearLocalData()} backupRef={backupRef} onRestoreBackup={(file) => void restoreBackup(file)} backupMessage={backupMessage} savedStatements={savedStatements} onDownloadStatement={(statement) => void downloadStatement(statement)} />}
        </div>
      </section>

      {showBudgetSetup && <div className="modal-backdrop">{!budgetSetupRequired && <button className="modal-backdrop-close" type="button" aria-label="Close settings" onClick={() => setShowBudgetSetup(false)} />}<div className="modal setup-modal">{!budgetSetupRequired && <button className="modal-close" type="button" onClick={() => setShowBudgetSetup(false)}>×</button>}<div className="modal-icon budget-icon">$</div><h2>Budget settings & backup</h2><p className="modal-sub">These numbers power your available-to-spend, savings rate, and forecast. Everything stays on this device.</p><form onSubmit={saveBudget}><label>Monthly take-home income<div className="money-input"><span>CAD</span><input value={budgetDraft.monthlyIncome} onChange={(event) => setBudgetDraft({ ...budgetDraft, monthlyIncome: event.target.value })} type="number" min="1" step="50" /></div></label><label>Monthly spending limit<div className="money-input"><span>CAD</span><input value={budgetDraft.spendingLimit} onChange={(event) => setBudgetDraft({ ...budgetDraft, spendingLimit: event.target.value })} type="number" min="1" step="50" /></div></label><div className="local-note"><span>✓</span><p><strong>Local for now</strong>Your financial data is saved only in this browser.</p></div><button className="primary-button full" type="submit">Save budget settings <Icon name="arrow" size={16} /></button></form>{!budgetSetupRequired && <div className="backup-actions"><div><strong>Data backup</strong><span>Download or restore app data as JSON. Original statement files are downloaded separately below.</span></div><div><button className="secondary-button small" type="button" onClick={downloadBackup}><Icon name="backup" size={14} /> Download</button><button className="secondary-button small" type="button" onClick={() => backupRef.current?.click()}><Icon name="upload" size={14} /> Restore</button></div><input ref={backupRef} className="hidden-input" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); event.target.value = ""; }} />{backupMessage && <p className="backup-message" role="status">{backupMessage}</p>}</div>}<div className="saved-statements"><strong>Original statements</strong><p>Stored separately from the transactions shown in Pocketwise, in this browser only.</p>{savedStatements.length ? <ul>{savedStatements.map((statement) => <li key={statement.id}><span><strong>{statement.name}</strong><small>{new Date(statement.importedAt).toLocaleDateString("en-CA")} · {statement.transactionCount} added transactions</small></span><button className="secondary-button small" type="button" onClick={() => void downloadStatement(statement)}>Download</button></li>)}</ul> : <p>No original statements saved yet.</p>}</div></div></div>}
      {categoryEditorMode && <div className="modal-backdrop"><button className="modal-backdrop-close" type="button" aria-label="Close category editor" onClick={closeCategoryEditor} /><div className="modal category-modal"><button className="modal-close" type="button" onClick={closeCategoryEditor}>×</button><div className="modal-icon category-modal-icon"><Icon name="tag" size={20} /></div><h2>{categoryEditorMode === "add" ? "Add a custom category" : "Edit category limit"}</h2><p className="modal-sub">Set the monthly amount you want to reserve for this category. Changes stay on this device.</p><form onSubmit={saveCategory}><label>Category name<input value={categoryDraft.name} disabled={categoryEditorMode === "edit" && !activeEditingCategory?.custom} maxLength={40} onChange={(event) => { setCategoryDraft({ ...categoryDraft, name: event.target.value }); setCategoryError(""); }} placeholder="e.g. Travel" /></label><label>Monthly limit<div className="money-input"><span>CAD</span><input value={categoryDraft.limit} onChange={(event) => { setCategoryDraft({ ...categoryDraft, limit: event.target.value }); setCategoryError(""); }} type="number" min="0" step="1" placeholder="0" /></div></label>{categoryError && <p className="form-error" role="alert">{categoryError}</p>}<button className="primary-button full" type="submit">{categoryEditorMode === "add" ? "Add category" : "Save limit"} <Icon name="arrow" size={16} /></button></form></div></div>}
      {showModal && <div className="modal-backdrop"><button className="modal-backdrop-close" type="button" aria-label="Close transaction form" onClick={() => { setShowModal(false); setEditingTransactionId(null); }} /><div className="modal"><button className="modal-close" type="button" onClick={() => { setShowModal(false); setEditingTransactionId(null); }}>×</button><h2>{editingTransactionId === null ? "Add transaction" : "Edit transaction"}</h2><p className="modal-sub">{editingTransactionId === null ? "Record something that isn’t in a statement." : "Correct the merchant, amount, date, or category used in your reports."}</p>{editingTransaction && (editingTransaction.originalAmount !== undefined || editingTransaction.sourceInstitution || editingTransaction.postingDate) && <div className="transaction-source-details"><strong>Original transaction details</strong>{editingTransaction.sourceInstitution && <span>Institution: {editingTransaction.sourceInstitution}</span>}{editingTransaction.originalAmount !== undefined && editingTransaction.originalCurrency && <span>Original amount: {editingTransaction.originalCurrency} {editingTransaction.originalAmount.toFixed(2)}</span>}{editingTransaction.exchangeRate !== undefined && <span>Exchange rate: {editingTransaction.exchangeRate}</span>}{editingTransaction.postingDate && <span>Posting date: {formatStatementDate(editingTransaction.postingDate)}</span>}</div>}<form onSubmit={saveTransaction}><label>Merchant<input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} placeholder="e.g. Corner store" required /></label><div className="form-row"><label>Type<select value={form.kind} onChange={(event) => { const kind = event.target.value as TransactionDraft["kind"]; setForm({ ...form, kind, category: kind === "income" ? "Income" : form.category === "Income" ? "Other" : form.category }); }}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Amount (CAD)<input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" type="number" min="0.01" step="0.01" required /></label></div><div className="form-row"><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label><label>Date<input value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} type="date" /></label></div><label>Note <span className="optional">optional</span><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Add a note" /></label><div className="modal-actions">{editingTransactionId !== null && <button className="danger-button" type="button" onClick={deleteTransaction}><Icon name="trash" size={14} /> Delete</button>}<button className="primary-button" type="submit">Save transaction <Icon name="arrow" size={16} /></button></div></form></div></div>}
      {plannerEditor && <div className="modal-backdrop"><button className="modal-backdrop-close" type="button" aria-label="Close planning form" onClick={closePlannerEditor} /><div className="modal planner-modal"><button className="modal-close" type="button" onClick={closePlannerEditor}>×</button><div className="modal-icon category-modal-icon"><Icon name="target" size={20} /></div><h2>{plannerEditingId ? "Edit" : "Add"} {plannerEditor === "account" ? "account balance" : plannerEditor === "goal" ? "savings goal" : "recurring item"}</h2><p className="modal-sub">This information stays in your browser and feeds your plan, net worth, and financial-health report.</p>
        {plannerEditor === "account" && <form onSubmit={saveAccount}><label>Account name<input value={accountDraft.name} onChange={(event) => { setAccountDraft({ ...accountDraft, name: event.target.value }); setPlannerError(""); }} placeholder="e.g. Emergency savings" required /></label><div className="form-row"><label>Balance type<select value={accountDraft.kind} onChange={(event) => { const kind = event.target.value as AccountKind; setAccountDraft({ ...accountDraft, kind, type: kind === "asset" ? "Chequing" : "Credit card" }); }}><option value="asset">Asset — I own it</option><option value="liability">Debt — I owe it</option></select></label><label>Account type<select value={accountDraft.type} onChange={(event) => setAccountDraft({ ...accountDraft, type: event.target.value as AccountType })}>{accountTypes.filter((type) => accountDraft.kind === "asset" ? !["Credit card", "Line of credit", "Loan", "Mortgage"].includes(type) : !["Chequing", "Savings", "Cash", "Investment"].includes(type)).map((type) => <option key={type}>{type}</option>)}</select></label></div><label>Current balance<div className="money-input"><span>CAD</span><input value={accountDraft.balance} onChange={(event) => { setAccountDraft({ ...accountDraft, balance: event.target.value }); setPlannerError(""); }} type="number" min="0" step="0.01" placeholder="0.00" required /></div></label>{plannerError && <p className="form-error" role="alert">{plannerError}</p>}<PlannerModalActions editing={Boolean(plannerEditingId)} onDelete={deletePlannerItem} label="Save account" /></form>}
        {plannerEditor === "goal" && <form onSubmit={saveGoal}><label>Goal name<input value={goalDraft.name} onChange={(event) => { setGoalDraft({ ...goalDraft, name: event.target.value }); setPlannerError(""); }} placeholder="e.g. Emergency fund" required /></label><div className="form-row"><label>Target amount<input value={goalDraft.targetAmount} onChange={(event) => setGoalDraft({ ...goalDraft, targetAmount: event.target.value })} type="number" min="0.01" step="0.01" placeholder="0.00" required /></label><label>Already saved<input value={goalDraft.currentAmount} onChange={(event) => setGoalDraft({ ...goalDraft, currentAmount: event.target.value })} type="number" min="0" step="0.01" placeholder="0.00" /></label></div><label>Target date <span className="optional">optional</span><input value={goalDraft.targetDate} onChange={(event) => setGoalDraft({ ...goalDraft, targetDate: event.target.value })} type="date" /></label>{plannerError && <p className="form-error" role="alert">{plannerError}</p>}<PlannerModalActions editing={Boolean(plannerEditingId)} onDelete={deletePlannerItem} label="Save goal" /></form>}
        {plannerEditor === "recurring" && <form onSubmit={saveRecurring}><label>Name<input value={recurringDraft.name} onChange={(event) => { setRecurringDraft({ ...recurringDraft, name: event.target.value }); setPlannerError(""); }} placeholder="e.g. Internet bill" required /></label><div className="form-row"><label>Amount (CAD)<input value={recurringDraft.amount} onChange={(event) => setRecurringDraft({ ...recurringDraft, amount: event.target.value })} type="number" min="0.01" step="0.01" placeholder="0.00" required /></label><label>Frequency<select value={recurringDraft.frequency} onChange={(event) => setRecurringDraft({ ...recurringDraft, frequency: event.target.value as RecurringFrequency })}>{recurringFrequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label></div><div className="form-row"><label>Category<select value={recurringDraft.category} onChange={(event) => setRecurringDraft({ ...recurringDraft, category: event.target.value })}>{categoryOptions.filter((category) => category !== "Income").map((category) => <option key={category}>{category}</option>)}</select></label><label>Next date <span className="optional">optional</span><input value={recurringDraft.nextDate} onChange={(event) => setRecurringDraft({ ...recurringDraft, nextDate: event.target.value })} type="date" /></label></div>{plannerError && <p className="form-error" role="alert">{plannerError}</p>}<PlannerModalActions editing={Boolean(plannerEditingId)} onDelete={deletePlannerItem} label="Save recurring item" /></form>}
      </div></div>}
    </main>
    {!storageReady && <div className="startup-cover" role={storageError ? "alert" : "status"}><div className="startup-card"><span className="brand-mark">↗</span><strong>{storageError ? "Your saved workspace could not open" : "Opening your workspace"}</strong><p>{storageError || "Loading your private data from this browser…"}</p>{storageError && <button className="secondary-button" type="button" onClick={() => window.location.reload()}>Try again</button>}</div></div>}
    </>
  );
}

// Render the shared save and optional delete actions for planner forms.
function PlannerModalActions({ editing, onDelete, label }: { editing: boolean; onDelete: () => void; label: string }) {
  return <div className="modal-actions">{editing && <button className="danger-button" type="button" onClick={onDelete}><Icon name="trash" size={14} /> Delete</button>}<button className="primary-button" type="submit">{label} <Icon name="arrow" size={16} /></button></div>;
}

// Render a month selector shared by the overview, categories, and reports.
function MonthPicker({ month, options, onChange }: { month: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="month-select"><span>{month}</span><Icon name="chevron" size={14} /><select value={month} onChange={(event) => onChange(event.target.value)} aria-label="Select month">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

// Guide a statement from local upload through category review before it is saved.
function ImportPage({ fileRef, pendingFile, pendingImport, setPendingImport, importMessage, importWarnings, duplicateCount, importSaving, storageReady, categoryOptions, savedStatements, onChooseFile, onDropFile, onSave, onDownloadStatement }: { fileRef: RefObject<HTMLInputElement | null>; pendingFile: File | null; pendingImport: Transaction[]; setPendingImport: Dispatch<SetStateAction<Transaction[]>>; importMessage: string; importWarnings: string[]; duplicateCount: number; importSaving: boolean; storageReady: boolean; categoryOptions: string[]; savedStatements: SavedStatement[]; onChooseFile: (event: ChangeEvent<HTMLInputElement>) => void; onDropFile: (event: DragEvent<HTMLDivElement>) => void; onSave: () => void; onDownloadStatement: (statement: SavedStatement) => void }) {
  const reviewCount = pendingImport.filter((transaction) => transaction.review).length;
  const setCategory = (id: number, category: string) => setPendingImport((current) => current.map((transaction) => transaction.id === id ? { ...transaction, category, review: false } : transaction));
  const confirmCategory = (id: number) => setPendingImport((current) => current.map((transaction) => transaction.id === id ? { ...transaction, review: false } : transaction));

  return <>
    <div className="page-heading"><div><p className="eyebrow">BRING YOUR DATA IN</p><h1>Import a statement</h1><p className="heading-sub">Upload, inspect suggested categories, then save the original and usable transactions together.</p></div></div>
    <div className="import-steps" aria-label="Import steps"><span className="active"><b>1</b> Upload</span><span className={importMessage ? "active" : ""}><b>2</b> Extract</span><span className={pendingFile ? "active" : ""}><b>3</b> Review & save</span></div>
    <section className="panel import-workspace"><div className="panel-heading"><div><h2>Choose a file</h2><p>CSV or searchable PDF · up to 10 MB</p></div></div><div className="import-page-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDropFile}><span className="import-page-dropicon"><Icon name="upload" size={25} /></span><strong>Drop your statement here</strong><span>Or choose a file from your device</span><button className="secondary-button" type="button" disabled={importSaving} onClick={() => fileRef.current?.click()}>Browse files</button></div><input ref={fileRef} className="hidden-input" type="file" accept=".csv,.pdf" onChange={onChooseFile} /><div className="import-privacy"><span>✓</span><p>Your financial files stay in this browser. Pocketwise does not connect to your bank. The file name does not matter for bank detection.</p></div></section>
    {importMessage && <div className="import-readout" role="status"><span className="import-readout-icon">✦</span><span>{importMessage}</span></div>}
    {importWarnings.length > 0 && <div className="import-warnings" role="status">{importWarnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}</div>}
    {pendingFile && <section className="panel import-review"><div className="panel-heading"><div><h2>Review import</h2><p>Categories are suggestions. Change any category and confirm flagged items before saving.</p></div></div><div className="import-review-summary"><span><strong>{pendingImport.length}</strong> new transactions</span><span className={reviewCount ? "needs-review" : ""}><strong>{reviewCount}</strong> need review</span>{duplicateCount > 0 && <span><strong>{duplicateCount}</strong> duplicates skipped</span>}{reviewCount > 0 && <button className="secondary-button small" type="button" disabled={importSaving} onClick={() => setPendingImport((current) => current.map((transaction) => ({ ...transaction, review: false })))}>Confirm all as shown</button>}</div>{pendingImport.length ? <div className="import-review-list">{pendingImport.map((transaction) => <div className="import-review-row" key={transaction.id}><span className="import-review-merchant"><strong>{transaction.merchant}</strong><small>{transaction.date} · {transaction.review ? "Please confirm this suggestion" : "Category suggested"}</small></span><strong className={transaction.amount < 0 ? "expense" : "income"}>{transaction.amount < 0 ? "−" : "+"}{money(transaction.amount)}</strong><select value={transaction.category} onChange={(event) => setCategory(transaction.id, event.target.value)} disabled={importSaving} aria-label={`Category for ${transaction.merchant}`}>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select>{transaction.review ? <button type="button" className="import-confirm" disabled={importSaving} onClick={() => confirmCategory(transaction.id)}>Confirm</button> : <span className="import-confirmed">✓ Ready</span>}</div>)}</div> : <p className="import-no-rows">All recognized transactions were already added. You can still save this original statement.</p>}<div className="import-review-footer"><span>The untouched original is stored separately from these editable transactions.</span><button className="primary-button" type="button" disabled={!storageReady || importSaving || reviewCount > 0} onClick={onSave}>{importSaving ? "Saving…" : pendingImport.length ? `Save ${pendingImport.length} transactions & original` : "Save original statement"} <Icon name="arrow" size={15} /></button></div></section>}
    {savedStatements.length > 0 && <section className="panel import-history"><div className="panel-heading"><div><h2>Saved originals</h2><p>Download the exact files you imported</p></div></div><div>{savedStatements.slice(0, 5).map((statement) => <div className="import-history-row" key={statement.id}><span><strong>{statement.name}</strong><small>{new Date(statement.importedAt).toLocaleDateString("en-CA")} · {statement.transactionCount} added</small></span><button className="secondary-button small" type="button" onClick={() => onDownloadStatement(statement)}>Download</button></div>)}</div></section>}
  </>;
}

// Keep financial baselines, backups, saved originals, and privacy information together.
function SettingsPage({ budgetDraft, setBudgetDraft, onSaveBudget, settingsMessage, onDownloadBackup, onClearData, backupRef, onRestoreBackup, backupMessage, savedStatements, onDownloadStatement }: { budgetDraft: { monthlyIncome: string; spendingLimit: string }; setBudgetDraft: (value: { monthlyIncome: string; spendingLimit: string }) => void; onSaveBudget: (event: FormEvent) => void; settingsMessage: string; onDownloadBackup: () => void; onClearData: () => void; backupRef: RefObject<HTMLInputElement | null>; onRestoreBackup: (file: File) => void; backupMessage: string; savedStatements: SavedStatement[]; onDownloadStatement: (statement: SavedStatement) => void }) {
  return <><div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Settings</h1><p className="heading-sub">Update the numbers behind your budget and keep a private copy of your data.</p></div></div><div className="settings-grid"><section className="panel settings-card"><div className="panel-heading"><div><h2>Financial baseline</h2><p>Used for available spending and forecast estimates</p></div></div><form className="settings-form" onSubmit={onSaveBudget}><label>Monthly take-home income<span className="settings-money-input"><span>CAD</span><input value={budgetDraft.monthlyIncome} onChange={(event) => setBudgetDraft({ ...budgetDraft, monthlyIncome: event.target.value })} type="number" min="1" step="50" required /></span></label><label>Monthly spending limit<span className="settings-money-input"><span>CAD</span><input value={budgetDraft.spendingLimit} onChange={(event) => setBudgetDraft({ ...budgetDraft, spendingLimit: event.target.value })} type="number" min="1" step="50" required /></span></label><div className="settings-currency">Currency <strong>CAD · Canadian dollars</strong></div><button className="primary-button" type="submit">Save baseline</button>{settingsMessage && <p className="backup-message" role="status">{settingsMessage}</p>}</form></section><section className="panel settings-card"><div className="panel-heading"><div><h2>Data & backup</h2><p>Export or restore your editable Pocketwise workspace</p></div></div><p className="settings-copy">A JSON backup includes transactions, categories, balances, goals, and recurring items. Download original statements separately below.</p><div className="settings-actions"><button className="secondary-button" type="button" onClick={onDownloadBackup}><Icon name="download" size={15} /> Export app data</button><button className="secondary-button" type="button" onClick={() => backupRef.current?.click()}><Icon name="upload" size={15} /> Restore backup</button></div><input ref={backupRef} className="hidden-input" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onRestoreBackup(file); event.target.value = ""; }} />{backupMessage && <p className="backup-message" role="status">{backupMessage}</p>}</section><section className="panel settings-card"><div className="panel-heading"><div><h2>Privacy</h2><p>Local by design</p></div></div><ul className="settings-privacy"><li>✓ Your financial data is stored in this browser on this device.</li><li>✓ Pocketwise does not connect to your bank.</li><li>✓ Imported statement files stay separate from the transactions you edit.</li></ul></section><section className="panel settings-card"><div className="panel-heading"><div><h2>Original statements</h2><p>Files saved in this browser</p></div></div>{savedStatements.length ? <div className="settings-statement-list">{savedStatements.map((statement) => <div className="import-history-row" key={statement.id}><span><strong>{statement.name}</strong><small>{new Date(statement.importedAt).toLocaleDateString("en-CA")} · {statement.transactionCount} added</small></span><button className="secondary-button small" type="button" onClick={() => onDownloadStatement(statement)}>Download</button></div>)}</div> : <p className="settings-copy">No original statements saved yet.</p>}<div className="settings-danger"><strong>Reset this device</strong><p>Delete all Pocketwise data in this browser, including original statements.</p><button className="danger-button" type="button" onClick={onClearData}><Icon name="trash" size={14} /> Clear all local data</button></div></section></div></>;
}

// Calculate and display the selected month's summary and spending trends.
function Overview({ month, monthOptions, setMonth, onImport, onAdd, onOpenTransactions, onOpenCategories, onReports, onOpenPlan, onAddAccount, onAddGoal, onAddRecurring, onEditGoal, onEditRecurring, transactions, settings, categories, accounts, goals, recurringItems, onEditTransaction }: { month: string; monthOptions: string[]; setMonth: (value: string) => void; onImport: () => void; onAdd: () => void; onOpenTransactions: () => void; onOpenCategories: () => void; onReports: () => void; onOpenPlan: () => void; onAddAccount: () => void; onAddGoal: () => void; onAddRecurring: () => void; onEditGoal: (goal: SavingsGoal) => void; onEditRecurring: (item: RecurringItem) => void; transactions: Transaction[]; settings: BudgetSettings; categories: BudgetCategory[]; accounts: FinancialAccount[]; goals: SavingsGoal[]; recurringItems: RecurringItem[]; onEditTransaction: (transaction: Transaction) => void }) {
  const hasActivity = transactions.length > 0;
  const forecast = calculateSpendingForecast(transactions, month, settings.monthlyIncome);
  const expenses = forecast.spent;
  const projectedSpending = forecast.projectedTotal;
  const available = settings.spendingLimit - expenses;
  const savingsRate = forecast.projectedSavingsRate;
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
    <div className="page-heading"><div><p className="eyebrow">YOUR MONTH AT A GLANCE</p><h1>Here’s your money story.</h1><p className="heading-sub">A clear view of where you are, and where you’re headed.</p></div><div className="heading-actions"><MonthPicker month={month} options={monthOptions} onChange={setMonth} /><button className="primary-button" onClick={onAdd}><Icon name="plus" size={16} /> Add transaction</button></div></div>
    <div className={`import-banner ${hasActivity ? "" : "empty"}`}><div className="import-art"><span>CSV</span><span>PDF</span><i /></div><div className="import-copy"><strong>{hasActivity ? "Bring in your latest statement" : `No activity in ${month} yet`}</strong><span>{hasActivity ? "Drop a CSV or PDF here and we’ll sort the line items for you." : "Import a statement or add a transaction to start seeing your money picture."}</span></div><button className="secondary-button" onClick={onImport}><Icon name="upload" size={15} /> Import statement</button></div>
    <div className="metric-grid"><MetricCard label="Available to spend" value={`${available < 0 ? "−" : ""}${money(available)}`} detail={`of ${money(settings.spendingLimit)} monthly plan`} trend={available >= 0 ? "On plan" : "Over plan"} trendType={available >= 0 ? "positive" : "warning"} icon="wallet" /><MetricCard label="Spent this month" value={money(expenses)} detail="Across imported and manual entries" trend={`${Math.round((expenses / settings.spendingLimit) * 100)}%`} trendType="neutral" icon="trend" /><MetricCard label="Projected month-end" value={hasActivity ? money(projectedSpending) : "—"} detail={hasActivity ? "Recurring costs + recent daily average" : "Add transactions to calculate"} trend={hasActivity ? projectedSpending <= settings.spendingLimit ? "Within limit" : "Above limit" : "Waiting for activity"} trendType={hasActivity && projectedSpending > settings.spendingLimit ? "warning" : "neutral"} icon="forecast" /><MetricCard label="Projected savings rate" value={hasActivity ? `${savingsRate.toFixed(1)}%` : "—"} detail={hasActivity ? `Based on ${money(settings.monthlyIncome)} income` : "Add transactions to calculate"} trend={hasActivity ? "Forecast" : "Waiting for activity"} trendType="neutral" icon="leaf" /></div>
    <PlanPreview accounts={accounts} goals={goals} recurringItems={recurringItems} onOpenPlan={onOpenPlan} onAddAccount={onAddAccount} onAddGoal={onAddGoal} onAddRecurring={onAddRecurring} onEditGoal={onEditGoal} onEditRecurring={onEditRecurring} />
    <div className="main-grid"><section className="panel spending-panel"><div className="panel-heading"><div><h2>Spending over time</h2><p>{month} · live from your transactions</p></div><button className="ghost-button" onClick={onReports}>View report <Icon name="arrow" size={14} /></button></div><div className="chart-legend"><span><i className="legend-dot purple" /> Spent</span><span><i className="legend-dot peach" /> Planned pace</span></div><SpendingChart month={month} transactions={transactions} spendingLimit={settings.spendingLimit} /></section><section className="panel health-panel"><div className="panel-heading"><div><h2>Financial health</h2><p>Calculated from this month</p></div><span className={`health-badge ${health.status === "Needs attention" ? "warning" : ""}`}>{hasActivity ? health.status : "Waiting for data"}</span></div><div className="health-ring" style={{ background: hasActivity ? `conic-gradient(#82c8ac 0 ${health.score}%, #f0edeb ${health.score}% 100%)` : "#f0edeb" }}><div><strong>{hasActivity ? health.score : "—"}</strong><span>{hasActivity ? "/ 100" : "score"}</span></div></div><p className="health-copy">{hasActivity ? health.message : "Add transactions to see a score based on your spending plan."}</p><div className="health-breakdown"><div><span className="health-line mint" /><span>Cash flow</span><strong>{hasActivity ? health.cashFlowScore : "—"}</strong></div><div><span className="health-line purple" /><span>Spending plan</span><strong>{hasActivity ? health.spendingPlanScore : "—"}</strong></div><div><span className="health-line peach" /><span>Emergency fund</span><strong>{hasActivity ? health.emergencyFundScore ?? "—" : "—"}</strong></div></div></section></div>
    <div className="lower-grid"><section className="panel transactions-panel"><div className="panel-heading"><div><h2>Recent transactions</h2><p>Latest activity across your accounts</p></div><button className="ghost-button" onClick={onOpenTransactions}>See all <Icon name="arrow" size={14} /></button></div><TransactionList transactions={transactions.slice(0, 4)} onEdit={onEditTransaction} emptyMessage={`No transactions in ${month} yet.`} /></section><section className="panel category-panel"><div className="panel-heading"><div><h2>Where it’s going</h2><p>Spend by category</p></div><button className="ghost-button" onClick={onOpenCategories}>Edit limits <Icon name="arrow" size={14} /></button></div><div className="donut-wrap"><div className="donut" style={{ background: donutBackground }}><div className="donut-hole"><strong>{money(expenses)}</strong><span>total spent</span></div></div><div className="donut-legend">{categoryLegend.length ? categoryLegend.map((category) => <span key={category.id}><i style={{ background: category.color }} /> {category.name} <strong>{expenses ? Math.round((category.amount / expenses) * 100) : 0}%</strong></span>) : <span className="empty-category-copy">No spending yet</span>}</div></div><div className="category-foot"><span>Monthly budget</span><strong>{money(settings.spendingLimit)} <small>· {settings.spendingLimit ? Math.round((expenses / settings.spendingLimit) * 100) : 0}% used</small></strong></div></section></div>
  </>;
}

// Surface the most useful plan details on Overview while keeping the full editor in Plan.
function PlanPreview({ accounts, goals, recurringItems, onOpenPlan, onAddAccount, onAddGoal, onAddRecurring, onEditGoal, onEditRecurring }: { accounts: FinancialAccount[]; goals: SavingsGoal[]; recurringItems: RecurringItem[]; onOpenPlan: () => void; onAddAccount: () => void; onAddGoal: () => void; onAddRecurring: () => void; onEditGoal: (goal: SavingsGoal) => void; onEditRecurring: (item: RecurringItem) => void }) {
  const netWorth = calculateNetWorth(accounts);
  const monthlyRecurring = calculateMonthlyRecurringTotal(recurringItems);
  const savedTowardGoals = goals.reduce((total, goal) => total + Math.min(goal.currentAmount, goal.targetAmount), 0);
  const previewGoals = [...goals]
    .sort((left, right) => Number(left.currentAmount >= left.targetAmount) - Number(right.currentAmount >= right.targetAmount)
      || (left.targetDate || "9999").localeCompare(right.targetDate || "9999"))
    .slice(0, 2);
  const firstRecurring = [...recurringItems]
    .sort((left, right) => (left.nextDate || "9999").localeCompare(right.nextDate || "9999"))[0];

  return <section className="overview-plan" aria-labelledby="overview-plan-title">
    <div className="overview-plan-heading"><div><p className="eyebrow">LOOKING AHEAD</p><h2 id="overview-plan-title">Your plan at a glance</h2><p>Goals, balances, and known commitments stay close to your monthly picture.</p></div><button className="ghost-button" type="button" onClick={onOpenPlan}>View full plan <Icon name="arrow" size={14} /></button></div>
    <div className="overview-plan-grid">
      <article className="panel overview-plan-card"><div className="overview-plan-card-title"><span className="overview-plan-icon goal">◎</span><h3>Savings goals</h3></div>{goals.length ? <><p className="overview-plan-summary">{money(savedTowardGoals)} saved across {goals.length} {goals.length === 1 ? "goal" : "goals"}</p><div className="overview-goal-list">{previewGoals.map((goal) => { const percent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)); return <button className="overview-goal" type="button" key={goal.id} onClick={() => onEditGoal(goal)}><span><strong>{goal.name}</strong><small>{money(goal.currentAmount)} of {money(goal.targetAmount)}</small></span><b>{percent}%</b><i><span style={{ width: `${percent}%` }} /></i></button>; })}</div></> : <><p className="overview-plan-empty">Give your savings a purpose and watch progress here.</p><button className="overview-plan-add" type="button" onClick={onAddGoal}><Icon name="plus" size={14} /> Add savings goal</button></>}</article>
      <article className="panel overview-plan-card"><div className="overview-plan-card-title"><span className="overview-plan-icon account">↗</span><h3>Accounts & debts</h3></div>{accounts.length ? <><strong className={`overview-plan-value ${netWorth.netWorth < 0 ? "negative" : ""}`}>{netWorth.netWorth < 0 ? "−" : ""}{money(netWorth.netWorth)} <small>net worth</small></strong><div className="overview-plan-pair"><span>Assets <strong>{money(netWorth.assets)}</strong></span><span>Debt <strong>{money(netWorth.liabilities)}</strong></span></div><p className="overview-plan-foot">From {accounts.length} manually tracked {accounts.length === 1 ? "account" : "accounts"}</p></> : <><p className="overview-plan-empty">Add balances to see what you own and owe.</p><button className="overview-plan-add" type="button" onClick={onAddAccount}><Icon name="plus" size={14} /> Add account balance</button></>}</article>
      <article className="panel overview-plan-card"><div className="overview-plan-card-title"><span className="overview-plan-icon recurring">↻</span><h3>Recurring costs</h3></div>{recurringItems.length ? <><strong className="overview-plan-value">{money(monthlyRecurring)} <small>per month</small></strong><p className="overview-plan-summary">Across {recurringItems.length} known {recurringItems.length === 1 ? "commitment" : "commitments"}</p>{firstRecurring && <button className="overview-recurring-item" type="button" onClick={() => onEditRecurring(firstRecurring)}><span><strong>{firstRecurring.name}</strong><small>{firstRecurring.frequency}{firstRecurring.nextDate ? ` · ${formatStatementDate(firstRecurring.nextDate)}` : ""}</small></span><Icon name="arrow" size={14} /></button>}</> : <><p className="overview-plan-empty">Keep regular bills in view before they arrive.</p><button className="overview-plan-add" type="button" onClick={onAddRecurring}><Icon name="plus" size={14} /> Add recurring cost</button></>}</article>
    </div>
  </section>;
}

// Render one compact dashboard metric with its context and trend.
function MetricCard({ label, value, detail, trend, trendType, icon }: { label: string; value: string; detail: string; trend: string; trendType: string; icon: string }) {
  return <div className="metric-card"><div className={`metric-icon ${icon}`}>{icon === "wallet" ? "▰" : icon === "trend" ? "↗" : "✦"}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail"><span className={`trend ${trendType}`}>{trendType === "positive" && "↘ "}{trend}</span> {detail}</div></div>;
}

// Plot cumulative spending against the selected month's plan.
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

// Render transaction rows and an appropriate empty state.
function TransactionList({ transactions, onEdit, emptyMessage = "No transactions to show." }: { transactions: Transaction[]; onEdit?: (transaction: Transaction) => void; emptyMessage?: string }) {
  return <div className="transaction-list">{transactions.length ? transactions.map((transaction) => <button className="transaction-row" type="button" key={transaction.id} onClick={() => onEdit?.(transaction)} aria-label={`Open ${transaction.merchant}, ${transaction.date}, ${transaction.category}, ${transaction.amount < 0 ? "expense" : "income"} ${money(transaction.amount)}`}><span className={`merchant-mark ${transaction.tone}`}>{transaction.initials}</span><span className="transaction-info"><strong>{transaction.merchant}{transaction.review && <span className="review-chip">Review</span>}</strong><span>{transaction.note} · {transaction.date}{transaction.originalAmount && transaction.originalCurrency ? ` · Originally ${transaction.originalCurrency} ${transaction.originalAmount.toFixed(2)}${transaction.exchangeRate ? ` at ${transaction.exchangeRate}` : ""}` : ""}</span></span><span className="transaction-category">{transaction.category}</span><strong className={transaction.amount > 0 ? "income" : "expense"}>{transaction.amount > 0 ? "+" : "−"}{money(transaction.amount)}</strong><span className="row-more"><Icon name="more" size={16} /></span></button>) : <div className="empty-list">{emptyMessage}</div>}</div>;
}

// Show searchable, filterable transactions and export controls.
function TransactionsPage({ transactions, searchRef, reviewOnly, setReviewOnly, search, setSearch, categoryFilter, setCategoryFilter, monthFilter, setMonthFilter, monthOptions, onImport, onAdd, categoryOptions, onEdit, onExport }: { transactions: Transaction[]; searchRef: RefObject<HTMLInputElement | null>; reviewOnly: boolean; setReviewOnly: (value: boolean) => void; search: string; setSearch: (value: string) => void; categoryFilter: string; setCategoryFilter: (value: string) => void; monthFilter: string; setMonthFilter: (value: string) => void; monthOptions: string[]; onImport: () => void; onAdd: () => void; categoryOptions: string[]; onEdit: (transaction: Transaction) => void; onExport: () => void }) {
  return <><div className="page-heading"><div><p className="eyebrow">ACTIVITY</p><h1>Transactions</h1><p className="heading-sub">Every purchase, bill, and deposit in one place. Select a row to inspect or edit it.</p></div><div className="heading-actions"><button className="secondary-button" onClick={onImport}><Icon name="upload" size={15} /> Import</button><button className="primary-button" onClick={onAdd}><Icon name="plus" size={16} /> Add transaction</button></div></div><div className="panel table-panel"><div className="table-toolbar"><div className="search-field"><Icon name="search" size={16} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Merchant, name, or date" aria-label="Search transactions by merchant or date" /></div><select aria-label="Filter by month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}><option>All months</option>{monthOptions.map((option) => <option key={option}>{option}</option>)}</select><select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select><button className={`review-filter ${reviewOnly ? "active" : ""}`} type="button" aria-pressed={reviewOnly} onClick={() => setReviewOnly(!reviewOnly)}>Needs review</button><button className="secondary-button small" type="button" onClick={onExport}><Icon name="download" size={15} /> Export CSV</button></div><div className="table-head"><span aria-hidden="true" /><span>Merchant</span><span>Category</span><span>Amount</span><span aria-hidden="true" /></div><TransactionList transactions={transactions} onEdit={onEdit} emptyMessage={reviewOnly ? "All caught up. No transactions need review." : search || categoryFilter !== "All categories" || monthFilter !== "All months" ? "No transactions match these filters." : "No transactions yet. Import a statement or add one manually."} /><div className="table-footer">Showing {transactions.length} transactions <span>Saved locally</span></div></div></>;
}

// Build an SVG wedge path for one category's share of spending.
function pieSlicePath(startAngle: number, endAngle: number) {
  const center = 120;
  const radius = 105;
  const point = (angle: number) => {
    const radians = angle * Math.PI / 180;
    return [center + radius * Math.cos(radians), center + radius * Math.sin(radians)];
  };
  const [startX, startY] = point(startAngle);
  const [endX, endY] = point(endAngle);
  return `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${endAngle - startAngle > 180 ? 1 : 0} 1 ${endX} ${endY} Z`;
}

// Show category spending as an interactive pie and editable limit list.
function CategoriesPage({ month, monthOptions, setMonth, settings, categories, transactions, onAdd, onEdit }: { month: string; monthOptions: string[]; setMonth: (value: string) => void; settings: BudgetSettings; categories: BudgetCategory[]; transactions: Transaction[]; onAdd: () => void; onEdit: (category: BudgetCategory) => void }) {
  const spending = calculateCategorySpending(categories, transactions);
  const items = categories.map((category) => ({ ...category, amount: spending[category.name] ?? 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const spentItems = items.filter((category) => category.amount > 0);
  const totalPlanned = items.reduce((total, category) => total + category.limit, 0);
  const totalSpent = items.reduce((total, category) => total + category.amount, 0);
  const planDifference = settings.spendingLimit - totalPlanned;
  const attentionCount = items.filter((category) => category.limit === 0 ? category.amount > 0 : category.amount / category.limit >= 0.8).length;
  const slices = spentItems.map((category, index) => {
    const spentBefore = spentItems.slice(0, index).reduce((total, item) => total + item.amount, 0);
    const startAngle = -90 + spentBefore / totalSpent * 360;
    const endAngle = -90 + (spentBefore + category.amount) / totalSpent * 360;
    return { category, path: pieSlicePath(startAngle, endAngle) };
  });
  const openSlice = (event: React.KeyboardEvent<SVGElement>, category: BudgetCategory) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit(category);
    }
  };

  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR SPENDING PLAN</p><h1>Budget</h1><p className="heading-sub">See where your money went in {month}. Select a slice or category to change its limit.</p></div><div className="heading-actions"><MonthPicker month={month} options={monthOptions} onChange={setMonth} /><button className="secondary-button" onClick={onAdd}><Icon name="plus" size={16} /> Add custom category</button></div></div>
    <div className="category-at-a-glance">
      <div><span>Spent this month</span><strong>{money(totalSpent)}</strong><small>Across {transactions.length} transactions</small></div>
      <div><span>Monthly spending limit</span><strong>{money(settings.spendingLimit)}</strong><small>{planDifference >= 0 ? `${money(planDifference)} unassigned to categories` : `${money(planDifference)} over category plan`}</small></div>
      <div><span>Monthly income</span><strong>{money(settings.monthlyIncome)}</strong><small>Take-home baseline</small></div>
      <div><span>Needs attention</span><strong>{attentionCount}</strong><small>{attentionCount ? "At least 80% of the limit used" : "All categories have room"}</small></div>
    </div>
    <section className="panel category-breakdown" aria-labelledby="category-breakdown-heading">
      <div className="category-breakdown-heading"><div><h2 id="category-breakdown-heading">Spending by category</h2><p>Each slice shows a share of this month’s spending.</p></div><span>{spentItems.length} active of {items.length} categories</span></div>
      <div className="category-breakdown-layout">
        <div className="category-pie-panel">
          <svg className="category-pie" viewBox="0 0 240 240" role="group" aria-label="Spending pie chart. Select a slice to edit its category limit.">
            {slices.length === 0 && <circle cx="120" cy="120" r="105" fill="#f0edeb" />}
            {slices.length === 1 ? <circle className="pie-slice" cx="120" cy="120" r="105" fill={slices[0].category.color} stroke="#fff" strokeWidth="2" role="button" tabIndex={0} aria-label={`${slices[0].category.name}: ${money(slices[0].category.amount)} spent. Edit limit.`} onClick={() => onEdit(slices[0].category)} onKeyDown={(event) => openSlice(event, slices[0].category)} /> : slices.map(({ category, path }) => <path className="pie-slice" key={category.id} d={path} fill={category.color} stroke="#fff" strokeWidth="2" role="button" tabIndex={0} aria-label={`${category.name}: ${money(category.amount)} spent, ${Math.round(category.amount / totalSpent * 100)}% of spending. Edit limit.`} onClick={() => onEdit(category)} onKeyDown={(event) => openSlice(event, category)} />)}
          </svg>
          <div className="category-pie-caption"><span>Total spending</span><strong>{money(totalSpent)}</strong>{!totalSpent && <small>Add a transaction to see the breakdown.</small>}</div>
        </div>
        <div className="category-breakdown-list" aria-label="Categories and limits">
          {items.map((category) => {
            const limitUsed = category.limit ? Math.round(category.amount / category.limit * 100) : category.amount > 0 ? 100 : 0;
            const share = totalSpent ? Math.round(category.amount / totalSpent * 100) : 0;
            return <button className="category-breakdown-row" key={category.id} type="button" onClick={() => onEdit(category)} aria-label={`Edit ${category.name} limit. ${money(category.amount)} spent of ${money(category.limit)} limit.`}>
              <span className="category-breakdown-dot" style={{ background: category.color }} />
              <span className="category-breakdown-name"><strong>{category.name}</strong><small>{money(category.amount)} spent · {money(category.limit)} limit</small></span>
              <span className="category-breakdown-share"><strong>{share}%</strong><small className={limitUsed >= 80 && category.amount > 0 ? "near-limit" : ""}>{limitUsed}% of limit</small></span>
            </button>;
          })}
        </div>
      </div>
    </section>
  </>;
}

// Show account balances, savings goals, and recurring commitments.
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

// Render an empty planner section with its first action.
function PlannerEmpty({ title, copy, action, onAction }: { title: string; copy: string; action: string; onAction: () => void }) {
  return <div className="planner-empty"><span>✦</span><strong>{title}</strong><p>{copy}</p><button className="secondary-button small" type="button" onClick={onAction}>{action}</button></div>;
}

// Calculate and present deeper financial metrics for the selected month.
function ReportsPage({ transactions, settings, categories, accounts, goals, recurringItems, month, monthOptions, setMonth, onDownload, onOpenPlan }: { transactions: Transaction[]; settings: BudgetSettings; categories: BudgetCategory[]; accounts: FinancialAccount[]; goals: SavingsGoal[]; recurringItems: RecurringItem[]; month: string; monthOptions: string[]; setMonth: (value: string) => void; onDownload: () => void; onOpenPlan: () => void }) {
  const health = calculateFinancialHealth({ monthlyIncome: settings.monthlyIncome, spendingLimit: settings.spendingLimit, transactions, accounts });
  const forecast = calculateSpendingForecast(transactions, month, settings.monthlyIncome);
  const projectedRemaining = settings.spendingLimit - forecast.projectedTotal;
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
  const healthLabel = !transactions.length ? `No activity recorded for ${month} yet.` : health.score >= 75 ? "Your plan has a solid foundation." : health.score >= 55 ? "Your plan is steady, with room to strengthen." : "A few focused changes would improve your buffer.";

  return <><div className="page-heading"><div><p className="eyebrow">THE BIGGER PICTURE</p><h1>{month} forecast</h1><p className="heading-sub">A clear estimate based on your recorded spending. Transfers are excluded.</p></div><div className="heading-actions"><MonthPicker month={month} options={monthOptions} onChange={setMonth} /><button className="secondary-button" onClick={onDownload}><Icon name="download" size={15} /> Download report</button></div></div>
    <div className="metric-grid"><MetricCard label="Projected spending" value={transactions.length ? money(forecast.projectedTotal) : "—"} detail={`against ${money(settings.spendingLimit)} limit`} trend={transactions.length ? "Month end" : "Waiting for activity"} trendType={projectedRemaining < 0 ? "warning" : "neutral"} icon="trend" /><MetricCard label="Projected remaining" value={transactions.length ? `${projectedRemaining < 0 ? "−" : ""}${money(projectedRemaining)}` : "—"} detail="After projected spending" trend={projectedRemaining >= 0 ? "Within plan" : "Over plan"} trendType={projectedRemaining >= 0 ? "positive" : "warning"} icon="wallet" /><MetricCard label="Projected savings" value={transactions.length ? `${forecast.projectedSavings < 0 ? "−" : ""}${money(forecast.projectedSavings)}` : "—"} detail={`from ${money(settings.monthlyIncome)} take-home income`} trend="Estimate" trendType="neutral" icon="forecast" /><MetricCard label="Savings rate" value={transactions.length ? `${forecast.projectedSavingsRate.toFixed(1)}%` : "—"} detail="Share of take-home income" trend="Estimate" trendType="neutral" icon="leaf" /></div>
    <section className="panel forecast-explainer"><div className="panel-heading"><div><h2>How we calculated this</h2><p>Fixed costs already recorded plus your flexible spending pace</p></div></div><div className="forecast-breakdown"><div><span>Fixed spending recorded</span><strong>{money(forecast.fixedSpending)}</strong></div><div><span>Flexible spending so far</span><strong>{money(forecast.flexibleSpending)}</strong></div><div><span>Average flexible spend</span><strong>{money(forecast.averageFlexiblePerDay)} / day</strong></div><div><span>Days in this month</span><strong>{forecast.elapsedDays} elapsed · {forecast.daysInMonth} total</strong></div><div><span>Projected flexible spending</span><strong>{money(forecast.projectedFlexible)}</strong></div><div className="forecast-total"><span>Projected total</span><strong>{transactions.length ? money(forecast.projectedTotal) : "—"}</strong></div></div><p className="forecast-note">This is an estimate. Pocketwise extends your flexible daily average across the month. Your {money(calculateMonthlyRecurringTotal(recurringItems))} in known monthly commitments appears in Goals & accounts and is not added again here, so it does not get counted twice.</p></section>
    <div className="report-grid"><div className="panel report-highlight"><div className="report-kicker">{month.toUpperCase()} SIGNAL</div><h2>{healthLabel}</h2><p>{transactions.length ? <>{health.message} Your current baseline leaves <strong>{remaining >= 0 ? money(remaining) : `${money(remaining)} over plan`}</strong> before month end.</> : "Import a statement or add a transaction to see insights for this month."}</p><div className="report-number"><strong>{transactions.length ? `${health.score}/100` : "—"}</strong><span>{transactions.length ? `${health.status} financial-health score · ${health.savingsRate.toFixed(1)}% current savings rate` : "Your report will appear as spending is added"}</span></div></div><div className="panel report-bars"><div className="panel-heading"><div><h2>Category budget use</h2><p>Actual spending versus your limits</p></div></div>{categoryRows.map((category) => { const percent = category.limit ? Math.round((category.spent / category.limit) * 100) : category.spent > 0 ? 100 : 0; return <div className="bar-row" key={category.id}><span>{category.name}</span><div><i style={{ width: `${Math.min(100, percent)}%`, background: category.color }} /></div><strong className={percent > 100 ? "over-limit" : ""}>{percent}%</strong></div>; })}</div></div>
    <div className="panel insight-list"><div className="panel-heading"><div><h2>Helpful nudges</h2><p>Specific observations from the data you have entered</p></div></div><div className="insight"><span className="insight-icon mint">✦</span><div><strong>{reviewCount ? `${reviewCount} imported ${reviewCount === 1 ? "transaction needs" : "transactions need"} review` : transactions.length ? "Imported transactions are categorized" : "No transactions to review yet"}</strong><p>{reviewCount ? "Confirming merchants and categories keeps forecasts and reports accurate." : "Nothing in this month is currently flagged for category review."}</p></div></div><div className="insight"><span className="insight-icon peach">↘</span><div><strong>{biggestCategory ? `${biggestCategory.name} is your largest spending category` : "Add transactions to reveal spending patterns"}</strong><p>{biggestCategory ? `${money(biggestCategory.spent)} spent against a ${money(biggestCategory.limit)} monthly category limit.` : "Your category report will update as soon as statement or manual entries are added."}</p></div></div><button className="insight insight-button" type="button" onClick={onOpenPlan}><span className="insight-icon purple">⌁</span><div><strong>{accounts.length ? `${health.emergencyMonths ?? 0} months of essential expenses in cash accounts` : "Add balances for net worth and emergency coverage"}</strong><p>{accounts.length ? "Canadian guidance commonly uses three to six months as an emergency-fund range." : "Pocketwise cannot assess your financial buffer from transactions alone."}</p></div><Icon name="arrow" size={16} /></button><div className="insight"><span className="insight-icon mint">◎</span><div><strong>{goals.length ? `${fundedGoals} of ${goals.length} savings goals funded` : "Turn future expenses into savings goals"}</strong><p>{goals.length ? "Update saved amounts as you contribute so your monthly pace stays useful." : "An emergency fund or planned purchase is a good first goal."}</p></div></div></div>
  </>;
}
