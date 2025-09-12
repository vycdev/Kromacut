export type Palette = {
    id: string;
    label: string;
    colors: string[];
    size: number;
};

export const PALETTES: Palette[] = [
    { id: "auto", label: "Auto", colors: [], size: 0 },
    {
        id: "p4",
        label: "4",
        size: 4,
        colors: ["#d7263d", "#021c1e", "#f2e86d", "#3bceac"],
    },
    {
        id: "p8",
        label: "8",
        size: 8,
        colors: [
            "#264653",
            "#2a9d8f",
            "#e9c46a",
            "#f4a261",
            "#e76f51",
            "#8ab17d",
            "#6a4c93",
            "#ef476f",
        ],
    },
    {
        id: "p16",
        label: "16",
        size: 16,
        colors: [
            "#e63946",
            "#f1faee",
            "#a8dadc",
            "#457b9d",
            "#1d3557",
            "#ffb4a2",
            "#ffd6a5",
            "#fdffb6",
            "#cdeac0",
            "#a3e635",
            "#80ed99",
            "#00b4d8",
            "#0077b6",
            "#023e8a",
            "#ef233c",
            "#ffd6e0",
        ],
    },
    {
        id: "p32",
        label: "32",
        size: 32,
        colors: Array.from({ length: 32 }).map((_, i) => {
            const hue = Math.round((i * 360) / 32);
            return `hsl(${hue} 70% 55%)`;
        }),
    },
];
