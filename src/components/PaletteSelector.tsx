import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PALETTES } from '../data/palettes';

interface Props {
    selected: string;
    onSelect: (id: string, size: number) => void;
}

export const PaletteSelector: React.FC<Props> = ({ selected, onSelect }) => {
    return (
        <Card className="p-4 border border-border/50 space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-foreground">Palette</h3>
                <p className="text-xs text-muted-foreground mt-1">Choose a color palette</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {PALETTES.map((p) => {
                    const isActive = p.id === selected;
                    return (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => onSelect(p.id, p.size)}
                            title={p.id === 'auto' ? 'Auto' : `${p.size} colors`}
                            className={`h-auto p-3 flex flex-col items-center gap-2.5 rounded-lg border-2 transition-all duration-200 ${
                                isActive
                                    ? 'border-primary bg-primary/5 shadow-md'
                                    : 'border-border hover:border-primary/50 hover:bg-accent/5'
                            }`}
                        >
                            <div className="w-full">
                                {p.id === 'auto' ? (
                                    <div className="text-sm font-bold text-center py-2 text-foreground">Auto</div>
                                ) : (
                                    <div
                                        className="grid gap-1.5 p-2 bg-muted/30 rounded"
                                        style={{
                                            gridTemplateColumns:
                                                'repeat(auto-fill, minmax(16px, 1fr))',
                                        }}
                                    >
                                        {p.colors.map((c, i) => (
                                            <div
                                                key={i}
                                                className="aspect-square rounded border border-border/70 transition-all hover:border-primary shadow-sm"
                                                style={{ background: c }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            {p.id === 'auto' ? null : (
                                <div className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                                    {p.size} colors
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </Card>
    );
};
