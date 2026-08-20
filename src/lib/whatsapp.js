export function normalizeWhatsappNumber(value, defaultCountryCode = "55") {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `${defaultCountryCode}${digits}`;
  return digits;
}

export function whatsappOrderUrl(number, message) {
  const normalized = normalizeWhatsappNumber(number);
  if (normalized.length < 12 || normalized.length > 13) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
