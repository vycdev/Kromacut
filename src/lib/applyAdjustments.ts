// Image adjustments utility applying a set of sliders to ImageData.
// Each adjustment key corresponds to the sliderDefs keys.
// Returns a new ImageData instance (does not mutate source).

export interface Adjustments {
  [key: string]: number;
}

export interface AdjustmentContext {
  width: number;
  height: number;
}

const DEFAULTS: Record<string, number> = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  clarity: 0,
};

export function isAllDefault(adj: Adjustments): boolean {
  for (const k in DEFAULTS) {
    if ((adj[k] ?? DEFAULTS[k]) !== DEFAULTS[k]) return false;
  }
  return true;
}

// Fast RGB <-> HSL helpers (H in [0,360), S/L in [0,1])
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360; // normalize
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return [r, g, b];
}

// Simple 3x3 box blur for clarity (local contrast) base
function boxBlur3(data: Uint8ClampedArray, w: number, h: number, out: Uint8ClampedArray) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const idx = (yy * w + xx) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          c++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / c;
      out[o + 1] = g / c;
      out[o + 2] = b / c;
      out[o + 3] = data[o + 3];
    }
  }
}

export function applyAdjustments(src: ImageData, adjustments: Adjustments): ImageData {
  if (isAllDefault(adjustments))
    return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);

  const { width: w, height: h, data: sdata } = src;
  const out = new Uint8ClampedArray(sdata); // start with copy

  const exposure = adjustments.exposure ?? 0; // stops
  const exposureMul = Math.pow(2, exposure);
  const contrast = (adjustments.contrast ?? 0) / 100; // -1..1 roughly
  const saturationAdj = (adjustments.saturation ?? 0) / 100;
  const vibranceAdj = (adjustments.vibrance ?? 0) / 100;
  const hueShift = adjustments.hue ?? 0; // degrees
  const temp = (adjustments.temperature ?? 0) / 100; // -1..1
  const tint = (adjustments.tint ?? 0) / 100; // -1..1
  const clarity = (adjustments.clarity ?? 0) / 100; // -1..1
  const highlights = (adjustments.highlights ?? 0) / 100;
  const shadows = (adjustments.shadows ?? 0) / 100;
  const whites = (adjustments.whites ?? 0) / 100;
  const blacks = (adjustments.blacks ?? 0) / 100;

  const needHSL = saturationAdj !== 0 || vibranceAdj !== 0 || hueShift !== 0;
  let blurred: Uint8ClampedArray | null = null;
  if (clarity !== 0) {
    blurred = new Uint8ClampedArray(out.length);
    boxBlur3(out, w, h, blurred);
  }

  for (let i = 0; i < out.length; i += 4) {
    let r = out[i];
    let g = out[i + 1];
    let b = out[i + 2];
    const a = out[i + 3];
    if (a === 0) continue; // skip transparent

    // Exposure
    if (exposure !== 0) {
      r = Math.min(255, r * exposureMul);
      g = Math.min(255, g * exposureMul);
      b = Math.min(255, b * exposureMul);
    }
    // Contrast around mid (128)
    if (contrast !== 0) {
      const f = 1 + contrast; // simple linear contrast
      r = Math.max(0, Math.min(255, (r - 128) * f + 128));
      g = Math.max(0, Math.min(255, (g - 128) * f + 128));
      b = Math.max(0, Math.min(255, (b - 128) * f + 128));
    }
    // Temperature / tint (very approximate linear shifts)
    if (temp !== 0 || tint !== 0) {
      // warm -> increase R, decrease B
      if (temp !== 0) {
        r = Math.max(0, Math.min(255, r + 60 * temp));
        b = Math.max(0, Math.min(255, b - 60 * temp));
      }
      // tint: positive adds magenta (R+B), negative adds green
      if (tint !== 0) {
        const amt = 50 * Math.abs(tint);
        if (tint > 0) {
          r = Math.max(0, Math.min(255, r + amt));
          b = Math.max(0, Math.min(255, b + amt));
          g = Math.max(0, Math.min(255, g - amt));
        } else {
          g = Math.max(0, Math.min(255, g + amt));
        }
      }
    }

    let hsl: [number, number, number] | null = null;
    if (needHSL) {
      hsl = rgbToHsl(r, g, b);
      let hue = hsl[0];
      let sat = hsl[1];
      const lum = hsl[2];
      if (saturationAdj !== 0) {
        sat = Math.max(0, Math.min(1, sat * (1 + saturationAdj)));
      }
      if (vibranceAdj !== 0) {
        // Increase sat more for low-saturated colors
        const vibFactor = 1 + vibranceAdj * (1 - sat);
        sat = Math.max(0, Math.min(1, sat * vibFactor));
      }
      if (hueShift !== 0) hue = (hue + hueShift) % 360;
      const rgb = hslToRgb(hue, sat, lum);
      r = rgb[0];
      g = rgb[1];
      b = rgb[2];
    }

    // Tone region adjustments based on luminance (after previous operations)
    const lumLin = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; // 0..1
    let toneScale = 1;
    if (lumLin < 0.1 && blacks !== 0) {
      toneScale *= 1 + blacks * 0.7; // stronger in deep blacks
    }
    if (lumLin < 0.4 && shadows !== 0) {
      toneScale *= 1 + shadows * 0.5;
    }
    if (lumLin > 0.6 && highlights !== 0) {
      toneScale *= 1 + highlights * 0.5;
    }
    if (lumLin > 0.9 && whites !== 0) {
      toneScale *= 1 + whites * 0.7; // strong at extremes
    }
    if (toneScale !== 1) {
      r = Math.max(0, Math.min(255, r * toneScale));
      g = Math.max(0, Math.min(255, g * toneScale));
      b = Math.max(0, Math.min(255, b * toneScale));
    }

    // Clarity (local contrast) via unsharp mask approximation
    if (clarity !== 0 && blurred) {
      const br = blurred[i];
      const bg = blurred[i + 1];
      const bb = blurred[i + 2];
      const amount = clarity * 0.8; // scale
      r = Math.max(0, Math.min(255, r + (r - br) * amount));
      g = Math.max(0, Math.min(255, g + (g - bg) * amount));
      b = Math.max(0, Math.min(255, b + (b - bb) * amount));
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    // alpha unchanged
  }

  return new ImageData(out, w, h);
}

export { DEFAULTS as ADJUSTMENT_DEFAULTS };
