const PROVIDER_DISABLED_MESSAGE =
  "Google sign-in is not enabled for this project yet. Enable the Google provider in Supabase Dashboard > Authentication > Providers, then try again.";

type ProviderValidationError = {
  error_code?: string;
  msg?: string;
};

function isProviderDisabledMessage(message: string | undefined) {
  return Boolean(message && /provider is not enabled|unsupported provider/i.test(message));
}

function parseValidationError(message: string): ProviderValidationError | null {
  try {
    const parsed = JSON.parse(message) as ProviderValidationError;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function getFriendlyAuthErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const parsedMessage = parseValidationError(error.message);
  if (
    parsedMessage?.error_code === "validation_failed" &&
    isProviderDisabledMessage(parsedMessage.msg)
  ) {
    return PROVIDER_DISABLED_MESSAGE;
  }

  if (isProviderDisabledMessage(error.message)) {
    return PROVIDER_DISABLED_MESSAGE;
  }

  return error.message;
}
