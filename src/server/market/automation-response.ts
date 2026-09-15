export type AutomationResponse = {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
};

export async function readAutomationResponse<T extends { ok?: boolean; error?: string } = AutomationResponse>(response: Response): Promise<T> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof (value as Record<string, unknown>).ok !== "boolean") {
      return { ok: false, error: "Automation endpoint returned an invalid completion response." } as T;
    }
    return value as T;
  } catch {
    return { ok: false, error: `Automation endpoint returned unreadable JSON (HTTP ${response.status}).` } as T;
  }
}

// An application failure wrapped in HTTP 200 must still fail scheduler checks.
export function automationFailureStatus(response: Response) {
  return response.status >= 400 ? response.status : 502;
}
