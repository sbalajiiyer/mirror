// Generates the PWA icons from the Mirror logo. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const logo = (size, pad, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${bg === "round" ? 7 : 0}" fill="#ffffff"/>
  <g transform="translate(${pad} ${pad}) scale(${(32 - 2 * pad) / 32})">
    <circle cx="16" cy="16" r="14" fill="none" stroke="#4338ca" stroke-width="2.5"/>
    <path d="M16 4a12 12 0 0 1 0 24z" fill="#4338ca"/>
    <circle cx="16" cy="16" r="4" fill="#eb6834"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const out = [
  ["public/icons/icon-192.png", 192, 3, "round"],
  ["public/icons/icon-512.png", 512, 3, "round"],
  ["public/icons/maskable-512.png", 512, 7, "square"],
  ["public/icons/apple-touch-icon.png", 180, 4, "square"],
];
for (const [file, size, pad, bg] of out) await sharp(Buffer.from(logo(size, pad, bg))).png().toFile(file);
console.log("icons written");
