import localFont from "next/font/local";

// MD Nichrome Dark is the only cut declared at weight 800: titulares, botones,
// cifras. Never referred to by literal family name (see brief §Tipografía,
// "Alto") — always through this next/font export so the fallback stays
// system-ui and the Dark cut never gets synthesized from Regular.
export const mdNichrome = localFont({
  src: [
    { path: "./fonts/MDNichrome-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/MDNichrome-Dark.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-mdn",
  display: "swap",
});

export const haffer = localFont({
  src: [{ path: "./fonts/Haffer-Regular.ttf", weight: "400", style: "normal" }],
  variable: "--font-haffer",
  display: "swap",
});
