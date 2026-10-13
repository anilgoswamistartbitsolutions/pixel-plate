// Accepts Indian and US/Canada numbers (and general E.164) without guessing or forcing a
// country code -- a bare 10-digit number is kept exactly as typed rather than assumed Indian,
// so a US guest's number isn't silently rewritten to +91.
export function normalizePhone(value) {
  const compact = String(value ?? "").replace(/[\s()-.]/g, "");
  if (!compact) return "";
  if (compact.startsWith("+")) return `+${compact.slice(1).replace(/\D/g, "")}`;
  const digits = compact.replace(/\D/g, "");
  // Indian trunk-prefix form (0 + 10 digits) -- the only case where the leading digit is not
  // part of the actual number, so stripping it is safe and keeps the number comparable.
  if (/^0\d{10}$/.test(digits)) return digits.slice(1);
  return digits;
}

export function isValidPhone(value) {
  const normalized = normalizePhone(value).replace(/^\+/, "");
  return /^\d{7,15}$/.test(normalized);
}
