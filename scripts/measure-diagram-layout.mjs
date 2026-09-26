// Maintainer tool: measure geometry once after editing the English SVG artwork.
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const result = {};
try {
    for (const file of readdirSync(path.join(root, 'src/assets/diagrams')).filter((file) =>
        file.endsWith('.svg')
    )) {
        await page.setContent(readFileSync(path.join(root, 'src/assets/diagrams', file), 'utf8'));
        result[file.slice(0, -4)] = await page.evaluate(() => {
            const svg = document.querySelector('svg');
            const width = svg.viewBox.baseVal.width;
            svg.style.width = `${width}px`;
            const rootMatrix = svg.getScreenCTM().inverse();
            const position = (element, x, y) =>
                new DOMPoint(x, y).matrixTransform(rootMatrix.multiply(element.getScreenCTM()));
            const text = [...svg.querySelectorAll('text[data-i18n]')].map((element) => {
                const origin = position(
                    element,
                    element.x.baseVal[0]?.value ?? 0,
                    element.y.baseVal[0]?.value ?? 0
                );
                const style = getComputedStyle(element);
                return {
                    element,
                    x: origin.x,
                    y: origin.y,
                    anchor: style.textAnchor,
                    size: parseFloat(style.fontSize),
                    weight: parseFloat(style.fontWeight),
                    width: element.getComputedTextLength(),
                };
            });
            const panels = [...svg.querySelectorAll('rect')]
                .map((element) => {
                    const box = element.getBBox();
                    const topLeft = position(element, box.x, box.y);
                    const bottomRight = position(element, box.x + box.width, box.y + box.height);
                    return {
                        left: topLeft.x,
                        top: topLeft.y,
                        right: bottomRight.x,
                        bottom: bottomRight.y,
                        area: box.width * box.height,
                    };
                })
                .filter((rect) => rect.right - rect.left >= 100);
            const values = {};
            for (const label of text) {
                const panel = panels
                    .filter(
                        (rect) =>
                            label.x >= rect.left &&
                            label.x <= rect.right &&
                            label.y > rect.top &&
                            label.y <= rect.bottom
                    )
                    .sort((a, b) => a.area - b.area)[0] ?? { left: 0, right: width };
                let left = panel.left + 12;
                let right = panel.right - 12;
                for (const neighbor of text) {
                    if (
                        neighbor === label ||
                        Math.abs(neighbor.y - label.y) > Math.min(label.size, neighbor.size) / 2
                    )
                        continue;
                    const start =
                        neighbor.x -
                        (neighbor.anchor === 'end'
                            ? neighbor.width
                            : neighbor.anchor === 'middle'
                              ? neighbor.width / 2
                              : 0);
                    const end = start + neighbor.width;
                    if (start > label.x) right = Math.min(right, start - 8);
                    if (end < label.x) left = Math.max(left, end + 8);
                }
                const available =
                    label.anchor === 'end'
                        ? label.x - left
                        : label.anchor === 'middle'
                          ? 2 * Math.min(label.x - left, right - label.x)
                          : right - label.x;
                const key = label.element.dataset.i18n;
                const maximum = Math.max(label.width, available);
                const entry = {
                    width: Math.round(maximum * 10) / 10,
                    fontSize: label.size,
                    fontWeight: label.weight || 400,
                };
                if (!values[key] || values[key].width > entry.width) values[key] = entry;
            }
            return values;
        });
    }
} finally {
    await browser.close();
}
writeFileSync(
    path.join(root, 'src/assets/diagrams/layout.json'),
    JSON.stringify(result, null, 2) + '\n'
);
console.log(`Measured safe text widths in ${Object.keys(result).length} diagrams.`);
