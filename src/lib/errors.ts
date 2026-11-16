/** A user-facing business-rule error (shown as-is in the UI). */
export class DomainError extends Error {
  constructor(message: string, public code = "invalid") {
    super(message);
  }
}
