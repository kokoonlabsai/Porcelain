/** Country code assumed when someone types a local number without one (e.g. 98765 43210). */
const DEFAULT_CC = String(process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');

/**
 * One canonical form per number, so "98765 43210", "098765 43210" and "+91 98765-43210"
 * all match the same patient.
 */
function normalizePhone(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `+${DEFAULT_CC}${digits}`;
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

module.exports = { normalizePhone };
