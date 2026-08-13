/**
 * Playlist Editor song-table text filter.
 *
 * Space-separated terms are ANDed (case-insensitive). A leading `!` negates
 * a term. Bare `!` tokens are ignored. Each term is matched against the
 * combined title, label, and categories of a song entry.
 */

export interface SongTextFilterFields {
  title: string;
  label: string;
  categories: string;
}

/** True if the song entry matches every space-separated filter term. */
export function songMatchesTextFilter(
  song: SongTextFilterFields,
  filterText: string,
): boolean {
  const tokens = filterText.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack =
    `${song.title} ${song.label} ${song.categories}`.toLowerCase();

  for (const token of tokens) {
    if (token.startsWith("!")) {
      const term = token.slice(1).toLowerCase();
      if (!term) continue;
      if (haystack.includes(term)) return false;
    } else if (!haystack.includes(token.toLowerCase())) {
      return false;
    }
  }
  return true;
}
