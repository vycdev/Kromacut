// Maintenance-only generator for the Snapmaker Innovation Fund winner badges.
// Snapmaker's rules: use their official logo files unaltered, and state only
// "Snapmaker Innovation Fund Winner". Their dark wordmark goes in content/badges/logo/
// as snapmaker-logo.(svg|png); until then a dashed placeholder marks the logo slot. An
// optional snapmaker-icon-white.(svg|png|jpg) (the white "ʃ" mark) fills the small badge's
// medal. Both badges carry their own light card, so one version suits any page background.
// Each SVG is also rendered to a 2x PNG with Playwright Chromium. WebKit (Safari, GitHub's
// iOS app, the macOS/Linux desktop webviews) ignores variable-font weights inside SVG images
// and draws the lettering at Oxanium's thinnest weight, so the README, website and app show
// the PNGs to look the same everywhere.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'content/badges');
const logoDir = path.join(output, 'logo');
mkdirSync(logoDir, { recursive: true });

const font = readFileSync(path.join(root, 'public/fonts/oxanium-v21-latin.woff2')).toString('base64');
const fontStyle = `<style>@font-face{font-family:'Oxanium';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800;}</style>`;

// Clockwise from 12 o'clock, sampled from the Kromacut K so the rim reads as the same spectrum.
const SPECTRUM = [
    '#dfd13b',
    '#f0a21f',
    '#ff6b1f',
    '#ff2a3a',
    '#ff1f85',
    '#c01784',
    '#5c1a93',
    '#33137f',
    '#0b238c',
    '#0066b8',
    '#009bcb',
    '#00a07a',
    '#4ab548',
    '#bfcd35',
];
const INK = '#121530';
// viewBox of the official wordmark files.
const LOGO_ASPECT = 171.762 / 34;

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) =>
    `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => {
    const [ra, rb] = [hexToRgb(a), hexToRgb(b)];
    return rgbToHex(ra.map((v, i) => v + (rb[i] - v) * t));
};
const spectrumAt = (u) => {
    const x = (((u % 1) + 1) % 1) * SPECTRUM.length;
    const i = Math.floor(x);
    return mix(SPECTRUM[i], SPECTRUM[(i + 1) % SPECTRUM.length], x - i);
};
const polar = (cx, cy, r, turn) => {
    const a = turn * Math.PI * 2 - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const pt = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;

function loadLogo(name) {
    const mimes = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
    for (const [ext, mime] of Object.entries(mimes)) {
        const file = path.join(logoDir, `${name}.${ext}`);
        if (existsSync(file)) {
            return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
        }
    }
    return null;
}

// The logo is embedded byte-for-byte and only scaled, never redrawn or recolored.
function logoSlot(x, y, width) {
    const height = width / LOGO_ASPECT;
    const href = loadLogo('snapmaker-logo');
    if (href) {
        return `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    const stroke = '#9aa0b8';
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${x + width / 2}" y="${y + height / 2 + 4}" text-anchor="middle" font-family="Oxanium, sans-serif" font-size="${Math.round(height * 0.34)}" fill="${stroke}">official Snapmaker logo</text></g>`;
}

function facetRing(cx, cy, rOuter, rFacet, count) {
    const parts = [];
    for (let i = 0; i < count; i++) {
        const u0 = (i - 0.5) / count;
        const u1 = (i + 0.5) / count;
        const color = spectrumAt(i / count);
        const a = polar(cx, cy, rOuter, u0);
        const b = polar(cx, cy, rOuter, u1);
        const m = polar(cx, cy, rFacet, i / count);
        const base = mix(color, INK, 0.18);
        const lit = mix(color, '#ffffff', 0.1);
        // Same-color strokes hide the anti-aliasing seams between neighbouring facets.
        parts.push(`<path d="M${cx},${cy}L${pt(a)}L${pt(b)}Z" fill="${base}" stroke="${base}" stroke-width="0.8" stroke-linejoin="round"/>`);
        parts.push(`<path d="M${pt(a)}L${pt(b)}L${pt(m)}Z" fill="${lit}" stroke="${lit}" stroke-width="0.6" stroke-linejoin="round"/>`);
    }
    return parts.join('');
}

function layerStrip(x, y, width, height, count) {
    const w = width / count;
    return Array.from(
        { length: count },
        (_, i) =>
            `<rect x="${(x + i * w).toFixed(2)}" y="${y}" width="${(w + 0.4).toFixed(2)}" height="${height}" fill="${spectrumAt(i / count)}"/>`
    ).join('');
}

function medal() {
    const size = 480;
    const c = size / 2;
    const band = { outer: 186, inner: 132, mid: 159 };
    const fontSize = 29;
    const capHalf = fontSize * 0.36;
    const rTop = band.mid - capHalf;
    const rBottom = band.mid + capHalf;
    const logoWidth = 212;
    const logoHeight = logoWidth / LOGO_ASPECT;
    const sparkle = (turn) => {
        const [x, y] = polar(c, c, band.mid, turn);
        return `<path d="M${x},${y - 8}L${x + 3},${y - 3}L${x + 8},${y}L${x + 3},${y + 3}L${x},${y + 8}L${x - 3},${y + 3}L${x - 8},${y}L${x - 3},${y - 3}Z" fill="#ffffff" opacity="0.85"/>`;
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Snapmaker Innovation Fund Winner">
<title>Snapmaker Innovation Fund Winner</title>
<defs>${fontStyle}
<path id="arc-top" d="M${c - rTop},${c}A${rTop},${rTop} 0 0 1 ${c + rTop},${c}"/>
<path id="arc-bottom" d="M${c - rBottom},${c}A${rBottom},${rBottom} 0 0 0 ${c + rBottom},${c}"/>
</defs>
${facetRing(c, c, 234, 206, 28)}
<circle cx="${c}" cy="${c}" r="${band.outer}" fill="${INK}"/>
<circle cx="${c}" cy="${c}" r="${band.outer}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3"/>
<g font-family="Oxanium, sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="4" fill="#ffffff">
<text><textPath href="#arc-top" startOffset="50%" text-anchor="middle">INNOVATION FUND</textPath></text>
<text><textPath href="#arc-bottom" startOffset="50%" text-anchor="middle">WINNER</textPath></text>
</g>
${sparkle(0.25)}${sparkle(0.75)}
<circle cx="${c}" cy="${c}" r="${band.inner}" fill="#ffffff"/>
<circle cx="${c}" cy="${c}" r="${band.inner}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3"/>${logoSlot(c - logoWidth / 2, c - logoHeight / 2 - 6, logoWidth)}
${layerStrip(c - 60, c + logoHeight / 2 + 12, 120, 6, 12)}
</svg>
`;
}

// Snapmaker's mark on a dark disc when its file is present, otherwise a plain sparkle.
function medallion({ cx, cy, r }) {
    const mark = loadLogo('snapmaker-icon-white');
    if (mark) {
        // The official mark is already a dark disc, so it fills the centre as-is; the white
        // ring is drawn over its edge rather than inside it.
        const disc = r * 0.76;
        return `<image href="${mark}" x="${cx - disc}" y="${cy - disc}" width="${disc * 2}" height="${disc * 2}" preserveAspectRatio="xMidYMid meet"/><circle cx="${cx}" cy="${cy}" r="${disc}" fill="none" stroke="#ffffff" stroke-width="1.5"/>`;
    }
    const disc = r * 0.66;
    return `<circle cx="${cx}" cy="${cy}" r="${disc}" fill="${INK}" stroke="#ffffff" stroke-width="1.5"/><path d="M${cx},${cy - 11}L${cx + 3.5},${cy - 3.5}L${cx + 11},${cy}L${cx + 3.5},${cy + 3.5}L${cx},${cy + 11}L${cx - 3.5},${cy + 3.5}L${cx - 11},${cy}L${cx - 3.5},${cy - 3.5}Z" fill="#ffffff"/>`;
}

function ribbon() {
    const width = 420;
    const height = 96;
    const icon = { cx: 50, cy: 46, r: 32 };
    const logoWidth = 150;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Snapmaker Innovation Fund Winner">
<title>Snapmaker Innovation Fund Winner</title>
<defs>${fontStyle}
<clipPath id="card"><rect width="${width}" height="${height}" rx="16"/></clipPath>
</defs>
<g clip-path="url(#card)">
<rect width="${width}" height="${height}" fill="#ffffff"/>
${layerStrip(0, height - 8, width, 8, 28)}
</g>
<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="15" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="2"/>
${facetRing(icon.cx, icon.cy, icon.r, icon.r * 0.86, 20)}
${medallion(icon)}
${logoSlot(100, 20, logoWidth)}
<text x="100" y="73" font-family="Oxanium, sans-serif" font-weight="700" font-size="19" letter-spacing="2.2" fill="${INK}">INNOVATION FUND WINNER</text>
</svg>
`;
}

const files = {
    'innovation-fund-medal.svg': medal(),
    'innovation-fund-badge.svg': ribbon(),
};
for (const [name, svg] of Object.entries(files)) {
    writeFileSync(path.join(output, name), svg);
    console.log(`wrote content/badges/${name} (${(svg.length / 1024).toFixed(1)} KB)`);
}

const PNG_SCALE = 2;
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ deviceScaleFactor: PNG_SCALE });
    for (const [name, svg] of Object.entries(files)) {
        const href = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await page.setContent(
            `<html style="background:transparent"><body style="margin:0"><img id="badge" src="${href}" style="display:block"></body></html>`
        );
        await page.locator('#badge').evaluate((img) => img.decode());
        // Let the embedded font settle before capturing.
        await page.waitForTimeout(500);
        const png = await page.locator('#badge').screenshot({ omitBackground: true });
        const pngName = name.replace(/\.svg$/, '.png');
        writeFileSync(path.join(output, pngName), png);
        console.log(`wrote content/badges/${pngName} (${(png.length / 1024).toFixed(1)} KB)`);
    }
} finally {
    await browser.close();
}
