export function badRequest(message: string, details?: unknown) {
  return { status: 400 as const, body: { message, details } };
}

export function notFound(message: string) {
  return { status: 404 as const, body: { message } };
}

export function forbidden(message: string) {
  return { status: 403 as const, body: { message } };
}

export function serviceUnavailable(message: string) {
  return { status: 503 as const, body: { message } };
}
