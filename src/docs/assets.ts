import logoImage from '@/assets/logo.png';
import tdTestImage from '@/assets/tdTest.png';
import diagramFrontlitHd from '@/assets/diagrams/06_frontlit_hiding_distance.svg';
import diagramCalibrationWedge from '@/assets/diagrams/07_calibration_wedge.svg';
import diagramOpacitySolve from '@/assets/diagrams/08_opacity_solve.svg';

const DOC_ASSETS: Record<string, string> = {
    'kromacut-logo.png': logoImage,
    'td-test.png': tdTestImage,
    '06_frontlit_hiding_distance.svg': diagramFrontlitHd,
    '07_calibration_wedge.svg': diagramCalibrationWedge,
    '08_opacity_solve.svg': diagramOpacitySolve,
};

export function resolveDocAsset(src: string): string | undefined {
    const explicitMatch = Object.keys(DOC_ASSETS).find((key) => src.includes(key));
    if (explicitMatch) return DOC_ASSETS[explicitMatch];

    const clean = src
        .trim()
        .replace(/^\.?\//, '')
        .split(/\s+/)[0]
        .replace(/^["']|["']$/g, '');
    return DOC_ASSETS[clean];
}
