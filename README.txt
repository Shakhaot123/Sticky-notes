Sticky Notes (Tailwind v4 CLI + Alpine.js)

Run:   open index.html in a browser (style.css is already compiled).
       Internet is needed only for Alpine.js (CDN) and Google Fonts.

Edit the design?  Needs Node.js.
  npm install
  npm run build     # compile once -> style.css
  npm run watch     # recompile on every save

Edit src/input.css for custom CSS. Tailwind classes are scanned from index.html.
If you add Tailwind classes inside app.js, add:  @source "../app.js";  to src/input.css
