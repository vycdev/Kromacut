export type SliderDef = {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    default: number;
    unit?: string;
};

export const SLIDER_DEFS: SliderDef[] = [
    {
        key: 'exposure',
        label: 'Exposure',
        min: -3,
        max: 3,
        step: 0.01,
        default: 0,
        unit: 'stops',
    },
    {
        key: 'contrast',
        label: 'Contrast',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'highlights',
        label: 'Highlights',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'shadows',
        label: 'Shadows',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'whites',
        label: 'Whites',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'blacks',
        label: 'Blacks',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'saturation',
        label: 'Saturation',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'vibrance',
        label: 'Vibrance',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '%',
    },
    {
        key: 'hue',
        label: 'Hue',
        min: -180,
        max: 180,
        step: 1,
        default: 0,
        unit: 'deg',
    },
    {
        key: 'temperature',
        label: 'Temperature',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '',
    },
    {
        key: 'tint',
        label: 'Tint',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '',
    },
    {
        key: 'clarity',
        label: 'Clarity',
        min: -100,
        max: 100,
        step: 1,
        default: 0,
        unit: '',
    },
];

export default SLIDER_DEFS;
