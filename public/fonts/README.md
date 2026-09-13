# Bundled fonts

Kromacut serves these fonts from its own origin and includes them in desktop builds.
No Google Fonts request is needed at runtime.

- Oxanium v21: normal, weights 200–800; Latin and Latin Extended.
- Source Code Pro v31: normal, weights 400–700; Latin, Latin Extended,
  Cyrillic, Cyrillic Extended, Greek, Greek Extended, and Vietnamese.
- Source Serif 4 v14: normal, weights 400–700; Latin, Latin Extended,
  Cyrillic, Cyrillic Extended, Greek, and Vietnamese.

These are the unmodified variable WOFF2 files returned by the Google Fonts CSS API
on 13 September 2026. The previous discrete-weight stylesheet returned the same
binary URLs. All its Unicode subsets and `font-display: swap` behavior are retained
in `src/styles/fonts.css`. Browsers only download subsets needed by rendered text.

All three families are distributed under the SIL Open Font License 1.1; the
family-specific copyright notices and full licenses are included beside the fonts
and copied into web and desktop distributions. Kromacut's own license does not
replace these font licenses.

`sources.json` records upstream URLs and SHA-256 hashes for verification. Those URLs
are provenance, not runtime requests. Downloading replacements is a maintenance
operation: preserve the license notices and update the CSS, filenames, and hashes
together.
