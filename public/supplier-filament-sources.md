# Supplier filament reference colors

Kromacut uses these sRGB references in the **Supplier Palettes** menu. The physical color of a
printed part can differ with the spool, print settings, and lighting. For optical blending, use a
calibrated Auto-paint profile with your spool's hiding distance. The added reference palettes
contain color names and RGB values only.

## Sources

All links were checked on 2026-11-19. The five added sets come from the following pinned, MIT-licensed
sources. Kromacut retains the source names, normalizes hex casing, and assigns stable IDs scoped
to the product line. Keep the IDs when correcting names or values.

| Supplier palette | Source | Type |
| --- | --- | --- |
| Polymaker Panchroma Basic PLA | [Open Filament Database](https://github.com/OpenFilamentCollective/open-filament-database/tree/1c19d5088fbc19a434c426aae2006f7a3a4348d9/data/panchroma/PLA/basic_pla) | Community catalog, 28 colors |
| Prusament PLA | [Open Filament Database](https://github.com/OpenFilamentCollective/open-filament-database/tree/1c19d5088fbc19a434c426aae2006f7a3a4348d9/data/prusament/PLA/pla) | Community catalog, 20 selected colors |
| Prusament PETG | [Open Filament Database](https://github.com/OpenFilamentCollective/open-filament-database/tree/1c19d5088fbc19a434c426aae2006f7a3a4348d9/data/prusament/PETG/petg) | Community catalog, 13 selected colors |
| SUNLU PLA Classic | [Open Filament Database](https://github.com/OpenFilamentCollective/open-filament-database/tree/1c19d5088fbc19a434c426aae2006f7a3a4348d9/data/sunlu/PLA/pla_classic) | Community catalog, 15 colors |
| ELEGOO PLA (RFID) | [Ganja Panda's ELEGOO PLA library](https://github.com/Ganja-Panda/Elegoo-Centauri-Carbon-Series/blob/0290cfda6817c00e55c5f93b6de7d53dea42883f/README.md#-hueforge--elegoo-pla-filament-data) | Community transcription of color codes from ELEGOO RFID tags, 15 colors |

The SUNLU set takes its values from the PLA Classic product line in the pinned catalog. The
Prusament sets contain selected solid colors. The ELEGOO set uses the color codes reported by
the library author. The library's separate transmission-distance measurements are excluded.

The existing Bambu Lab PLA Basic palette transcribes the names and hex values from
[Bambu Lab's manufacturer chart](https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf).
The chart does not state a redistribution license. The existing transcription is retained with
attribution, with no chart artwork included.

## MIT notices

The following notices apply to the extracted color data from the two MIT sources. They are
included here so they are available in both the source checkout and the built app.

### Open Filament Collective

```text
Copyright © 2025 OpenFilamentCollective

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### Ganja Panda

```text
MIT License

Copyright (c) 2025 Ganja Panda

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
