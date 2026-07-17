export function normalizePhone(input, defaultCountryCode = '84') {
  if (!input) return '';
  let phone = String(input).replace(/[^\d+]/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0')) phone = defaultCountryCode + phone.slice(1);
  return phone;
}
