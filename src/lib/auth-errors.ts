export function formatAuthErrorMessage(message: string) {
  if (/invalid login credentials|invalid credentials|email or password/i.test(message)) {
    return "Email or password is incorrect. Check both fields, reset your password, or create an account.";
  }

  if (/email not confirmed|email.*confirm/i.test(message)) {
    return "Confirm your email address before logging in.";
  }

  if (/password.*(weak|short)|weak password/i.test(message)) {
    return "Use a stronger password with at least 8 characters.";
  }

  if (/captcha|turnstile|security check/i.test(message)) {
    return "The security check did not work. Complete it again and retry.";
  }

  if (/expired.*(otp|link|token)|invalid.*(otp|link|token)/i.test(message)) {
    return "This link has expired or was already used. Request a new one.";
  }

  if (/network|failed to fetch|fetch failed/i.test(message)) {
    return "Could not reach RMI. Check your connection and try again.";
  }

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
