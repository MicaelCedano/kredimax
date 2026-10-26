const SEARCH_TERM_MAX_LENGTH = 80;

export function sanitizeSearchTerm(value: string) {
  return value.trim().replace(/[^\p{L}\p{N}\s+-]/gu, "").replace(/\s+/g, " ").slice(0, SEARCH_TERM_MAX_LENGTH);
}
