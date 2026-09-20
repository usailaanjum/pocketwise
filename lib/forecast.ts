type ForecastTransaction = { amount: number; category: string };

export type SpendingForecast = {
  spent: number;
  fixedSpending: number;
  flexibleSpending: number;
  averageFlexiblePerDay: number;
  projectedFlexible: number;
  projectedTotal: number;
  projectedSavings: number;
  projectedSavingsRate: number;
  elapsedDays: number;
  daysInMonth: number;
};

// Project a selected month's spending from recorded fixed costs and flexible daily pace.
export function calculateSpendingForecast(transactions: ForecastTransaction[], month: string, monthlyIncome: number, now = new Date()): SpendingForecast {
  const [monthName, yearText] = month.split(" ");
  const monthIndex = new Date(`${monthName} 1, ${yearText}`).getMonth();
  const year = Number(yearText);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate() || 30;
  const elapsedDays = now.getFullYear() === year && now.getMonth() === monthIndex
    ? Math.max(1, now.getDate())
    : daysInMonth;
  const expenses = transactions.filter((item) => item.amount < 0 && item.category !== "Payments & transfers");
  const spent = expenses.reduce((total, item) => total + Math.abs(item.amount), 0);
  const fixedSpending = expenses.filter((item) => ["Housing", "Utilities"].includes(item.category))
    .reduce((total, item) => total + Math.abs(item.amount), 0);
  const flexibleSpending = Math.max(0, spent - fixedSpending);
  const averageFlexiblePerDay = flexibleSpending / elapsedDays;
  const projectedFlexible = averageFlexiblePerDay * daysInMonth;
  const projectedTotal = fixedSpending + projectedFlexible;
  const projectedSavings = monthlyIncome - projectedTotal;
  const projectedSavingsRate = monthlyIncome > 0 ? projectedSavings / monthlyIncome * 100 : 0;
  return { spent, fixedSpending, flexibleSpending, averageFlexiblePerDay, projectedFlexible, projectedTotal, projectedSavings, projectedSavingsRate, elapsedDays, daysInMonth };
}
