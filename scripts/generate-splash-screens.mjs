// Génère les apple-touch-startup-image (splash screens iOS PWA) aux
// résolutions exactes attendues par chaque device. Couvre les iPhone
// du SE 1st/2nd/3rd gen jusqu'au 16/17 Pro Max.
//
// Usage : `node scripts/generate-splash-screens.mjs`
//
// Pourquoi ce script existe : les anciennes images splash-*.png étaient
// toutes à ~852×1846 quel que soit leur nom de fichier — iOS faisait du
// best-effort scaling et laissait apparaître la safe-area du home
// indicator en blanc pendant ~1.5s au boot de la PWA. Solution Apple
// officielle = un PNG par résolution physique exacte.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// Résolutions physiques (px) en portrait. Chaque entrée correspond à un
// <link rel="apple-touch-startup-image"> dans index.html avec sa media
// query exacte. Trier par DPR puis par device-width descendant : iOS
// prend le premier match.
const SIZES = [
  { w: 1290, h: 2796, label: "iPhone 14/15/16 Pro Max + 17 Pro" },
  { w: 1284, h: 2778, label: "iPhone 12/13 Pro Max" },
  { w: 1242, h: 2688, label: "iPhone XS Max / 11 Pro Max" },
  { w: 1179, h: 2556, label: "iPhone 14/15/16 Pro" },
  { w: 1170, h: 2532, label: "iPhone 12/13/14" },
  { w: 1125, h: 2436, label: "iPhone X/XS/11 Pro" },
  { w: 828, h: 1792, label: "iPhone XR / 11" },
  { w: 750, h: 1334, label: "iPhone SE / 8 / 7 / 6" },
];

// #0F4C3A — vert sapin Salamarket. Doit matcher manifest.background_color
// et le bg appliqué sur html/body dans index.html.
const BG = { r: 0x0f, g: 0x4c, b: 0x3a, alpha: 1 };

// Logo source : version "light" (couleurs claires sur fond sombre) avec
// fond transparent. Resize en preserving aspect ratio.
const LOGO_PATH = path.join(ROOT, "public/brand/logo-horizontal-light.png");
const OUTPUT_DIR = path.join(ROOT, "public/splash");

// Largeur du logo en % de la largeur de l'écran. 0.55 laisse de la
// marge respirante des deux côtés.
const LOGO_WIDTH_RATIO = 0.55;

if (!fs.existsSync(LOGO_PATH)) {
  console.error(`✗ Source logo not found: ${LOGO_PATH}`);
  process.exit(1);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let totalBytes = 0;

for (const { w, h, label } of SIZES) {
  const logoWidth = Math.round(w * LOGO_WIDTH_RATIO);

  const logoBuffer = await sharp(LOGO_PATH)
    .resize({
      width: logoWidth,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const outPath = path.join(OUTPUT_DIR, `iphone-${w}x${h}.png`);

  await sharp({
    create: { width: w, height: h, channels: 4, background: BG },
  })
    .composite([{ input: logoBuffer, gravity: "center" }])
    .png({ compressionLevel: 9, palette: true, quality: 100 })
    .toFile(outPath);

  const stats = fs.statSync(outPath);
  totalBytes += stats.size;
  const kb = (stats.size / 1024).toFixed(1);
  console.log(`✓ iphone-${w}x${h}.png  ${kb.padStart(7)} KB  ${label}`);
}

const totalKb = (totalBytes / 1024).toFixed(1);
console.log(`\nTotal : ${SIZES.length} fichiers, ${totalKb} KB`);
