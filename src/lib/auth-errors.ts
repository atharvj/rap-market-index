export function formatAuthErrorMessage(message: string) {
  if (/email rate limit|over_email_send_rate_limit|rate limit.*email/i.test(message)) {
    return "RMI's email provider has reached its hourly limit. Try again one hour after the last email request.";
  }

  if (/user already registered|already been registered/i.test(message)) {
    return "An account may already exist for this email. Try logging in or resetting your password.";
  }

  if (/banned|suspend/i.test(message)) {
    return "This account is suspended. Contact RMI support if you believe this is a mistake.";
  }

  return message;
}
