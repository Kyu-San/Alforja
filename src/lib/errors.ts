import { isAppError } from "../api";

export function message(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** El mensaje corto (primera línea) y el detalle técnico del motor, si lo hay. */
export function splitDetail(msg: string | null): [string, string | null] {
  if (!msg) return ["Algo salió mal.", null];
  const [head, ...rest] = msg.split("\n\n");
  return [head, rest.join("\n\n") || null];
}
