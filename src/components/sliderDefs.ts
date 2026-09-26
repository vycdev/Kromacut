export type SliderDef = {
    key: string;
    labelKey: string;
    min: number;
    max: number;
    step: number;
    default: number;
    unit?: string;
    unitKey?: string;
};

export const SLIDER_DEFS: SliderDef[] = [
    {
        key: 'exposure',
        labelKey: 'adjustments.exposure',
        min: -3,
        max: 3,
        step: 0.01,
        default: 0,
        unitKey: 'adjustments.stops',
    },
    {
        key: 'contrast',
        labelKey: 'adjustments.contrast',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'highlights',
        labelKey: 'adjustments.highlights',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'shadows',
        labelKey: 'adjustments.shadows',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'whites',
        labelKey: 'adjustments.whites',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'blacks',
        labelKey: 'adjustments.blacks',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'saturation',
        labelKey: 'adjustments.saturation',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'vibrance',
        labelKey: 'adjustments.vibrance',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'hue',
        labelKey: 'adjustments.hue',
        min: -180,
        max: 180,
        step: 1,
        default: 0,
        unitKey: 'adjustments.degrees',
    },
    {
        key: 'temperature',
        labelKey: 'adjustments.temperature',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '',
    },
    {
        key: 'tint',
        labelKey: 'adjustments.tint',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '',
    },
    {
        key: 'clarity',
        labelKey: 'adjustments.clarity',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '',
    },
];

export default SLIDER_DEFS;
