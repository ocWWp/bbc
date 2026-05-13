// Inline SVG icons used across the Library surface. Mirrors the LI/I icon
// sets in the Claude Design output (library-card.jsx, library-main.jsx) so
// the visual port stays identical.

export const Icons = {
  search: () => (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="4" />
      <line x1="9" y1="9" x2="12" y2="12" />
    </svg>
  ),
  github: () => (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="currentColor">
      <path d="M7 0.5a6.5 6.5 0 0 0-2.05 12.66c.32.06.44-.14.44-.31v-1.13c-1.8.39-2.18-.86-2.18-.86-.3-.74-.72-.94-.72-.94-.58-.4.05-.39.05-.39.64.04.98.66.98.66.57.98 1.5.7 1.87.53.06-.42.22-.7.4-.86-1.44-.16-2.96-.72-2.96-3.2 0-.71.25-1.29.66-1.74-.07-.16-.29-.83.06-1.72 0 0 .55-.18 1.8.66a6.27 6.27 0 0 1 3.27 0c1.25-.84 1.8-.66 1.8-.66.36.9.13 1.56.06 1.72.41.45.66 1.03.66 1.74 0 2.48-1.52 3.03-2.96 3.2.23.2.44.6.44 1.2v1.78c0 .17.12.38.45.31A6.5 6.5 0 0 0 7 0.5z" />
    </svg>
  ),
  link: () => (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8.5l-1 1a2.12 2.12 0 1 1-3-3l2-2a2.12 2.12 0 0 1 3 0" />
      <path d="M8 5.5l1-1a2.12 2.12 0 1 1 3 3l-2 2a2.12 2.12 0 0 1-3 0" />
    </svg>
  ),
  warn: () => (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1.5L13 12H1z" />
      <line x1="7" y1="6" x2="7" y2="9" />
      <circle cx="7" cy="10.5" r="0.6" fill="currentColor" />
    </svg>
  ),
  check: () => (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2.5,7.5 5.5,10.5 11.5,4" />
    </svg>
  ),
  x: () => (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="3" x2="11" y2="11" />
      <line x1="11" y1="3" x2="3" y2="11" />
    </svg>
  ),
  open: () => (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h3v3" />
      <line x1="11" y1="3" x2="6.5" y2="7.5" />
      <path d="M11 8v3h-8v-8h3" />
    </svg>
  ),
};
