# Google Sans

Variable fonts from [Google Fonts](https://github.com/google/fonts/tree/b7c8331cf620346575487ef8db0e2c729f014675/ofl/googlesans), pinned to commit `b7c8331cf620346575487ef8db0e2c729f014675`.

- `GoogleSans.ttf` is the upstream `GoogleSans[GRAD,opsz,wght].ttf`.
- `GoogleSans-Italic.ttf` is the upstream `GoogleSans-Italic[GRAD,opsz,wght].ttf`.

The files are unmodified apart from their filenames. Both include weight, optical size, and grade axes. The Android font plugin registers normal and italic styles at weights 400, 500, 600, and 700 using the family aliases in `src/constants/material-fonts.ts`. Separate aliases preserve weight selection in Expo UI's Compose font resolver. iOS continues to use system fonts.

See `OFL.txt` for the SIL Open Font License and `TRADEMARKS.md` for the upstream trademark notice.
