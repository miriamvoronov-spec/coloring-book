# Hebrew fairy-tale fonts

`disneyfy.py` turns an open-licence (SIL OFL 1.1) Hebrew font into a playful storybook version: each letter gets its own small tilt and hop, and ל and י get a tiny star. The results are renamed, as the OFL asks.

| File | Made from (OFL 1.1) |
| --- | --- |
| `src/assets/fonts/miriam-magic.woff2` | Fredoka Bold (Hebrew) |
| `src/assets/fonts/miriam-magic-play.woff2` | Playpen Sans Hebrew ExtraBold |
| `src/assets/fonts/miriam-magic-hand.woff2` | Gveret Levin |

The source fonts come from the npm packages `@fontsource/fredoka`, `@fontsource/playpen-sans-hebrew` and `@fontsource/gveret-levin`:

```bash
npm pack @fontsource/fredoka && tar xzf fontsource-fredoka-*.tgz
python tools/font/disneyfy.py package/files/fredoka-hebrew-700-normal.woff2 src/assets/fonts/miriam-magic.woff2 "Miriam Magic"
```
