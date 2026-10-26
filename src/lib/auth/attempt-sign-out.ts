export async function attemptSignOut(
  signOut: () => Promise<{ error: unknown | null }>,
): Promise<boolean> {
  try {
    const result = await signOut();
    return result.error === null;
  } catch {
    return false;
  }
}
