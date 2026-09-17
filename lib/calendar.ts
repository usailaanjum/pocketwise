const monthFormatter = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" });
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Format a date as the month label shown in the dashboard picker.
export function monthLabel(date: Date): string {
  return monthFormatter.format(date);
}

// Format a local calendar day for an HTML date input without UTC shifts.
export function localDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Turn a month label into a sortable year-and-month number.
function monthTime(label: string): number {
  const [name, yearText] = label.split(" ");
  const monthIndex = monthNames.indexOf(name);
  const year = Number(yearText);
  return monthIndex < 0 || !Number.isInteger(year) ? 0 : year * 12 + monthIndex;
}

// Offer recent months plus any month with saved transactions, newest first.
export function availableMonths(now: Date, selected: string, transactionMonths: (string | undefined)[]): string[] {
  const months = new Set<string>([selected]);
  for (let offset = 0; offset < 12; offset += 1) {
    months.add(monthLabel(new Date(now.getFullYear(), now.getMonth() - offset, 1)));
  }
  for (const month of transactionMonths) if (month) months.add(month);
  return [...months].sort((a, b) => monthTime(b) - monthTime(a));
}
