export function createRequestId(prefix = "mob"): string {
  const randomPart = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${randomPart}`;
}

export function createIdempotencyKey(prefix: string): string {
  return createRequestId(prefix).replace(/[^a-zA-Z0-9:_-]/g, "-");
}

export function makeId(prefix: string): string {
  return createRequestId(prefix);
}
