export function normalizeManagedStudentEmail(value: string) {
  const email=value.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid student email address");
  return email;
}

export function managedStudentMayAuthenticate(input: { accessConfigured:boolean; enabled:boolean; hasActiveGuardianConsent:boolean }) {
  if(!input.accessConfigured) return true;
  return input.enabled&&input.hasActiveGuardianConsent;
}
