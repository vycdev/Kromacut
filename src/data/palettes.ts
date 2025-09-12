export type Palette = {
    id: string;
    label: string;
    colors: string[];
    size: number;
};

export const PALETTES: Palette[] = [
    { id: "auto", label: "Auto", colors: [], size: 0 },

    // Colored palettes grouped and ordered by size (ascending)
    // 4-color palettes
    {
        id: "p4",
        label: "4",
        size: 4,
        // Material-like primary 4 colors
        colors: ["#F44336", "#2196F3", "#4CAF50", "#FFEB3B"],
    },
    {
        id: "p4_alt",
        label: "4 (Pastel)",
        size: 4,
        colors: ["#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9"],
    },

    // 8-color palettes
    {
        id: "p8",
        label: "8",
        size: 8,
        // Tableau-like 8 (widely used qualitative palette)
        colors: [
            "#4E79A7",
            "#F28E2B",
            "#E15759",
            "#76B7B2",
            "#59A14F",
            "#EDC948",
            "#B07AA1",
            "#FF9DA7",
        ],
    },
    {
        id: "p8_alt",
        label: "8 (Solarized)",
        size: 8,
        // A compact Solarized-inspired set
        colors: [
            "#b58900",
            "#cb4b16",
            "#dc322f",
            "#d33682",
            "#6c71c4",
            "#268bd2",
            "#2aa198",
            "#859900",
        ],
    },
    {
        id: "material_8",
        label: "Material (8)",
        size: 8,
        colors: [
            "#E53935",
            "#D81B60",
            "#8E24AA",
            "#5E35B1",
            "#3949AB",
            "#1E88E5",
            "#039BE5",
            "#00ACC1",
        ],
    },
    {
        id: "brewer_set2",
        label: "ColorBrewer Set2 (8)",
        size: 8,
        colors: [
            "#66c2a5",
            "#fc8d62",
            "#8da0cb",
            "#e78ac3",
            "#a6d854",
            "#ffd92f",
            "#e5c494",
            "#b3b3b3",
        ],
    },

    // 9-color palettes
    {
        id: "brewer_set1",
        label: "ColorBrewer Set1 (9)",
        size: 9,
        colors: [
            "#e41a1c",
            "#377eb8",
            "#4daf4a",
            "#984ea3",
            "#ff7f00",
            "#ffff33",
            "#a65628",
            "#f781bf",
            "#999999",
        ],
    },
    {
        id: "pastel_9",
        label: "Pastel (9)",
        size: 9,
        colors: [
            "#fbb4ae",
            "#b3cde3",
            "#ccebc5",
            "#decbe4",
            "#fed9a6",
            "#ffffcc",
            "#e5d8bd",
            "#fddaec",
            "#f2f2f2",
        ],
    },

    // 10-color palettes
    {
        id: "flat_ui_10",
        label: "Flat UI (10)",
        size: 10,
        colors: [
            "#1abc9c",
            "#2ecc71",
            "#3498db",
            "#9b59b6",
            "#34495e",
            "#16a085",
            "#27ae60",
            "#2980b9",
            "#8e44ad",
            "#2c3e50",
        ],
    },
    {
        id: "d3_category10",
        label: "D3 Category 10",
        size: 10,
        colors: [
            "#1f77b4",
            "#ff7f0e",
            "#2ca02c",
            "#d62728",
            "#9467bd",
            "#8c564b",
            "#e377c2",
            "#7f7f7f",
            "#bcbd22",
            "#17becf",
        ],
    },

    // 12-color palettes
    {
        id: "paired_12",
        label: "Paired (12)",
        size: 12,
        colors: [
            "#a6cee3",
            "#1f78b4",
            "#b2df8a",
            "#33a02c",
            "#fb9a99",
            "#e31a1c",
            "#fdbf6f",
            "#ff7f00",
            "#cab2d6",
            "#6a3d9a",
            "#ffff99",
            "#b15928",
        ],
    },

    // 16-color palettes
    {
        id: "p16",
        label: "16",
        size: 16,
        // Classic web-safe / VGA 16-color set (good variety)
        colors: [
            "#000000",
            "#800000",
            "#008000",
            "#808000",
            "#000080",
            "#800080",
            "#008080",
            "#c0c0c0",
            "#808080",
            "#ff0000",
            "#00ff00",
            "#ffff00",
            "#0000ff",
            "#ff00ff",
            "#00ffff",
            "#ffffff",
        ],
    },
    {
        id: "p16_alt",
        label: "16 (Material Extended)",
        size: 16,
        colors: [
            "#E51C23",
            "#9C27B0",
            "#3F51B5",
            "#03A9F4",
            "#009688",
            "#8BC34A",
            "#CDDC39",
            "#FFEB3B",
            "#FFC107",
            "#FF9800",
            "#FF5722",
            "#795548",
            "#9E9E9E",
            "#607D8B",
            "#673AB7",
            "#F44336",
        ],
    },

    // 32-color palettes
    {
        id: "p32",
        label: "32",
        size: 32,
        // Extended D3 / qualitative blend (20 core + extras)
        colors: [
            "#1f77b4",
            "#aec7e8",
            "#ff7f0e",
            "#ffbb78",
            "#2ca02c",
            "#98df8a",
            "#d62728",
            "#ff9896",
            "#9467bd",
            "#c5b0d5",
            "#8c564b",
            "#c49c94",
            "#e377c2",
            "#f7b6d2",
            "#7f7f7f",
            "#c7c7c7",
            "#bcbd22",
            "#dbdb8d",
            "#17becf",
            "#9edae5",
            // extras to reach 32
            "#ff6f69",
            "#ffcc5c",
            "#88d8b0",
            "#96ceb4",
            "#6b5b95",
            "#feb236",
            "#d64161",
            "#ff7b25",
            "#b2e061",
            "#6ecff6",
            "#c1a1e2",
            "#f3a5a5",
        ],
    },

    // Grayscale palettes (kept at the end)
    {
        id: "g4",
        label: "Gray 4",
        size: 4,
        colors: Array.from({ length: 4 }).map((_, i) => {
            const light = Math.round(20 + i * (60 / (4 - 1)));
            return `hsl(0 0% ${light}%)`;
        }),
    },
    {
        id: "g8",
        label: "Gray 8",
        size: 8,
        colors: Array.from({ length: 8 }).map((_, i) => {
            const light = Math.round(10 + i * (75 / (8 - 1)));
            return `hsl(0 0% ${light}%)`;
        }),
    },
    {
        id: "g16",
        label: "Gray 16",
        size: 16,
        colors: Array.from({ length: 16 }).map((_, i) => {
            const light = Math.round(6 + i * (88 / (16 - 1)));
            return `hsl(0 0% ${light}%)`;
        }),
    },
    {
        id: "g32",
        label: "Gray 32",
        size: 32,
        colors: Array.from({ length: 32 }).map((_, i) => {
            const light = Math.round(3 + i * (92 / (32 - 1)));
            return `hsl(0 0% ${light}%)`;
        }),
    },
];
