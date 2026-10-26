export type PreservedValues = Record<string, string[]>;

export function snapshotFormData(formData: FormData, preserveFields?: readonly string[]): PreservedValues {
  const allowed = preserveFields ? new Set(preserveFields) : null;
  const values: PreservedValues = {};
  for (const [name, entry] of formData.entries()) {
    if (typeof entry !== "string" || (allowed && !allowed.has(name))) continue;
    (values[name] ??= []).push(entry);
  }
  return values;
}
