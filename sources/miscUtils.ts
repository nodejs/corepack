export class Cancellation extends Error {
  constructor() {
    super(`Cancelled operation`);
  }
}
