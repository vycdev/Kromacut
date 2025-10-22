import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PALETTES } from '../data/palettes';

interface Props {
    selected: string;
    onSelect: (id: string, size: number) => void;
}

export const PaletteSelector: React.FC<Props> = ({ selected, onSelect }) => {
    return (
        <Card className="p-4 border border-border/50 space-y-3">
            <div className="space-y-2">
                <Label htmlFor="palette-select" className="font-medium">
                    Palette
                </Label>
                <Select
                    value={selected}
                    onValueChange={(paletteId) => {
                        const palette = PALETTES.find((p) => p.id === paletteId);
                        if (palette) {
                            onSelect(paletteId, palette.size);
                        }
                    }}
                >
                    <SelectTrigger id="palette-select">
                        <SelectValue placeholder="Select a palette" />
                    </SelectTrigger>
                    <SelectContent className="max-h-48 overflow-y-auto">
                        {PALETTES.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                <div className="flex items-center gap-2">
                                    <span>{p.id === 'auto' ? 'Auto' : `${p.size} colors`}</span>
                                    {p.id !== 'auto' && (
                                        <div className="flex gap-1">
                                            {p.colors.slice(0, 5).map((c, i) => (
                                                <div
                                                    key={i}
                                                    className="rounded border border-border/70 cursor-pointer hover:border-primary hover:shadow-md transition-all duration-200 hover:scale-110"
                                                    style={{
                                                        background: c,
                                                        width: '15px',
                                                        height: '15px',
                                                        aspectRatio: '1',
                                                    }}
                                                />
                                            ))}
                                            {p.colors.length > 5 && (
                                                <div className="text-xs text-muted-foreground">
                                                    +{p.colors.length - 5}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </Card>
    );
};
