import { Ticket } from "../types";
import { createInitialEntities } from "./seeds";

let entities: Ticket[] = createInitialEntities();

/**
 * Basic memory database coordinator.
 * Change `Ticket` references and queries when customizing the template for other schemas.
 */
export function getTickets(): Ticket[] {
  return entities;
}

export function getTicketById(id: string): Ticket | undefined {
  return entities.find(e => e.id === id);
}

export function updateTicket(id: string, fields: Partial<Ticket>): Ticket | null {
  const index = entities.findIndex(e => e.id === id);
  if (index !== -1) {
    entities[index] = { ...entities[index], ...fields };
    return entities[index];
  }
  return null;
}

export function resetDb(referenceTime?: string | Date): Ticket[] {
  entities = createInitialEntities(referenceTime);
  return entities;
}
