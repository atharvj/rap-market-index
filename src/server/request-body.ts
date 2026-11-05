/** Invalid JSON roots are empty inputs, never a null object dereference. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  } catch { return {}; }
}
