# DISD CTE — Logo Library

Authoritative source for every Dallas ISD CTE logo asset used elsewhere in this
repo (PDFs, slide decks, internal docs). All files were pulled from the
[Dallas ISD IPC Central — CTE Logos page](https://sites.google.com/dallasisd.org/ipccentral/cte-logos)
on 2026-05-07.

> **Why a dedicated folder?** Treating brand assets as version-controlled files
> (instead of pasting them into individual docs) means every artifact in the
> project — `IBC Library/` PDFs, slides, audit workbooks — pulls from the same
> source. Update one file here and re-render the downstream artifacts; the
> branding stays in sync.

---

## Inventory & intended use

| File | Pixels | Transparency | Where it's used |
|---|---|---|---|
| `CTE LOGO WHITE.png` | 1933 × 423 | yes | **Title pages with a dark background** (e.g., the navy hero on every IBC implementation guide PDF). Wide horizontal lockup. |
| `Dallas ISD CTE Logo.png` | 1422 × 206 | yes | **Light-background headers / footers / letterheads.** Wide horizontal lockup, navy version. |
| `CTE_Blue-clear.png` | 364 × 364 | yes | **Small-format spots** — favicons, profile bugs, tight margins. Square navy mark. |
| `White Square Logo.png` | 1029 × 1029 | yes | **Slide decks on dark backgrounds** when you need a square aspect ratio. |
| `blue circle DISD CTE WHIT.png` | 1029 × 1029 | yes | **Avatars, badges, callouts.** Circular navy with the white "CTE" lockup. |
| `Dallas ISD CTE Logo Square.jpg` | 1163 × 688 | no | **Print masters** when transparency isn't needed (handouts, posters). |
| `Dallas ISD CTE Logo White Space.jpg` | 7125 × 2058 | no | **Large-format prints** — banners, signage. 1.5 MB; do not embed in slides. |

---

## How to add or replace a logo

1. **Drop the new file into this folder.** Keep the original filename from the
   IPC Central page so the provenance is obvious; rename only when there's a
   collision (e.g., `... (1).jpg` got dropped as a deduped duplicate already).
2. **Update the table above** with pixel dimensions, transparency, and the
   intended use. Run `sips -g pixelWidth -g pixelHeight -g hasAlpha <file>` if
   you need to confirm.
3. **If the new logo replaces one referenced by a script** (e.g.,
   `scripts/render_ibc_guide_pdf.py` embeds `CTE LOGO WHITE.png` on the IBC
   guide title page), update the constant at the top of that script. Logos are
   referenced by filename, not hash, so the swap is one line.
4. **Re-render any affected artifacts.** Right now that means
   `IBC Library/exports/*.pdf`. Run `python3 scripts/render_ibc_guide_pdf.py
   --all` to regenerate all curated guides.

---

## Best-practice notes for non-design users

- **Prefer transparent PNGs (`hasAlpha: yes`)** for any logo that will be placed
  on a colored background. JPGs always carry their own white background.
- **Pick the version that matches the background**, not "the prettiest." A
  white logo on a white page is invisible; a navy logo on a navy hero is the
  same. The columns above tell you which is which.
- **Don't resize logos in Word/Slides by dragging the corner repeatedly** —
  that introduces compression artifacts. Pick the size that's closest to the
  pixel dimensions of the slot you need to fill.
- **The `White Space` JPG is large** (1.5 MB). Don't embed it in any document
  destined for email; reach for the PNG versions instead.
