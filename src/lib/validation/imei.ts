export function isValidImei(value: string) {
  return /^\d{15}$/.test(value.trim());
}

export function isValidImeiChange(current: string, proposed: string) {
  return proposed === current || isValidImei(proposed);
}

export function imeiValidationMessage(value: string): string | undefined {
  if (!/^\d{15}$/.test(value.trim())) return "El IMEI debe tener exactamente 15 dígitos numéricos.";
  return undefined;
}
