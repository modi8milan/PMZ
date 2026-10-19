const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function addWorkingDays(
  startDate: string,
  workingDays: number,
  calendar: Map<string, boolean> = new Map(),
): string {
  const result = new Date(`${startDate}T12:00:00.000Z`);
  let remaining = workingDays;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const key = isoDate(result);
    const configured = calendar.get(key);
    const day = result.getUTCDay();
    const working = configured ?? (day !== 0 && day !== 6);
    if (working) remaining -= 1;
  }
  return isoDate(result);
}
