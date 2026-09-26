// Image-based food quality features computed from raw pixels (no black-box model).
// Degradation in cooked and fresh food shows up as browning, dark spots, loss of saturation,
// greyish/whitish mould-like patches and changes in surface texture.
const sharp = require('sharp');

const ANALYSIS_SIZE = 160;

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function pixelStats(data, width, height) {
  const n = width * height;
  const lum = new Float32Array(n);
  const acc = { sat: 0, val: 0, brown: 0, dark: 0, mould: 0, rg: 0, yb: 0, rg2: 0, yb2: 0 };
  for (let i = 0; i < n; i++) {
    const r = data[i * 3] / 255;
    const g = data[i * 3 + 1] / 255;
    const b = data[i * 3 + 2] / 255;
    const [h, s, v] = rgbToHsv(r, g, b);
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    acc.sat += s;
    acc.val += v;
    if (h >= 10 && h <= 45 && s > 0.3 && v < 0.5) acc.brown++;
    if (v < 0.18) acc.dark++;
    if (s < 0.15 && v > 0.45 && v < 0.85 && (h >= 60 && h <= 210)) acc.mould++;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    acc.rg += rg;
    acc.yb += yb;
    acc.rg2 += rg * rg;
    acc.yb2 += yb * yb;
  }
  return { n, lum, acc };
}

function textureScore(lum, width, height) {
  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - width] - lum[i + width];
      sum += lap * lap;
      count++;
    }
  }
  return Math.sqrt(sum / count);
}

async function extractFeatures(imageBuffer) {
  const { data, info } = await sharp(imageBuffer).rotate().resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { n, lum, acc } = pixelStats(data, info.width, info.height);
  const std = (s2, s) => Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
  return {
    meanSaturation: +(acc.sat / n).toFixed(4),
    meanBrightness: +(acc.val / n).toFixed(4),
    browningRatio: +(acc.brown / n).toFixed(4),
    darkSpotRatio: +(acc.dark / n).toFixed(4),
    mouldLikeRatio: +(acc.mould / n).toFixed(4),
    colorfulness: +(Math.sqrt(std(acc.rg2, acc.rg) ** 2 + std(acc.yb2, acc.yb) ** 2) + 0.3 * Math.hypot(acc.rg / n, acc.yb / n)).toFixed(4),
    texture: +textureScore(lum, info.width, info.height).toFixed(4),
  };
}

const FEATURE_ORDER = ['meanSaturation', 'meanBrightness', 'browningRatio', 'darkSpotRatio', 'mouldLikeRatio', 'colorfulness', 'texture'];

// Transparent rule-based score used until enough inspector-labelled images exist to calibrate a model.
function ruleScore(f) {
  const penalties = [
    { reason: 'Browning / oxidation', points: Math.min(35, f.browningRatio * 140) },
    { reason: 'Dark spots', points: Math.min(25, Math.max(0, f.darkSpotRatio - 0.05) * 120) },
    { reason: 'Grey/white mould-like patches', points: Math.min(35, f.mouldLikeRatio * 110) },
    { reason: 'Dull, desaturated colour', points: Math.max(0, 0.22 - f.meanSaturation) * 90 },
  ].filter((p) => p.points >= 1);
  const score = Math.max(0, 100 - penalties.reduce((s, p) => s + p.points, 0));
  return { score: +score.toFixed(1), penalties: penalties.map((p) => ({ ...p, points: +p.points.toFixed(1) })) };
}

module.exports = { extractFeatures, ruleScore, FEATURE_ORDER };
