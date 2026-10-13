/**
 * Phone numbers arrive in every shape a human or a speech-to-text engine can produce:
 * "+1 (310) 555-0142", "310.555.0142", "+91 98765 43210", "9876543210". Everything is stored
 * in one canonical form -- digits only, keeping a leading + when the caller gave a country
 * code -- so the same person is never written twice under two spellings, and so the lookups
 * guests use on the phone ("it's the number ending four two") match reliably.
 */

/** Canonical storage form: no spaces, brackets, dashes or dots. "+1 (310) 555-0142" -> "+13105550142". */
export function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // A leading 00 is the international prefix written out -- treat it as a +.
  if (raw.startsWith("+") || digits.startsWith("00")) {
    return `+${digits.replace(/^00/, "")}`;
  }
  return digits;
}

/** Just the digits, country code and all -- for comparisons. */
export function phoneDigits(input) {
  return String(input ?? "").replace(/\D/g, "");
}

/**
 * Do two numbers identify the same caller? Compares the last 10 digits when both have at
 * least that many (so a number given with a country code still matches one stored without),
 * and otherwise falls back to the shorter length. Used to verify a caller before any booking
 * or order detail is read back to them.
 */
export function phonesMatch(a, b) {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  const length = Math.min(10, da.length, db.length);
  if (length < 6) return false; // too little to be a real verification
  return da.slice(-length) === db.slice(-length);
}
