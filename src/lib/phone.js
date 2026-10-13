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

/** Just the digits, country code and all -- for comparisons. */
export function phoneDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Do two numbers identify the same caller? Compares the last 10 digits when both have at least
 * that many, so a number given with a country code still matches one stored without it, and
 * falls back to the shorter length otherwise. Returns false when either side is missing, which
 * is what makes the phone genuinely required: a lookup with no phone fails verification rather
 * than skipping the check.
 */
export function phonesMatch(a, b) {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  const length = Math.min(10, da.length, db.length);
  if (length < 6) return false; // too little to be a real verification
  return da.slice(-length) === db.slice(-length);
}
