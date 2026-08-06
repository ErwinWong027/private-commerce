// Helper to handle context time simulation and calculations in a unified place.
// Avoid hardcoding "new Date()" in rule calculations or state machines to allow test validation.

export interface TicketTimeContext {
  currentTime: Date;
  currentTimeIso: string;
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function getRuntimeNow(): Date {
  return new Date();
}

export function createTicketTimeContext(currentTime?: string): TicketTimeContext {
  const parsed = currentTime ? new Date(currentTime) : getRuntimeNow();
  const effectiveTime = isValidDate(parsed) ? parsed : getRuntimeNow();

  return {
    currentTime: effectiveTime,
    currentTimeIso: effectiveTime.toISOString(),
  };
}

export function calculateHoursUntilDeparture(
  departureTime: string,
  context: TicketTimeContext
): number {
  const departure = new Date(departureTime);
  return (departure.getTime() - context.currentTime.getTime()) / (1000 * 60 * 60);
}
