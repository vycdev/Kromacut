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
                        <Button
                            key={p.id}
                            type="button"
                            onClick={() => onSelect(p.id, p.size)}
                            title={p.id === 'auto' ? 'Auto' : `${p.size} colors`}
                            variant={isActive ? 'default' : 'outline'}
                            className="h-auto p-3 flex flex-col items-center gap-2 transition-all duration-200 hover:border-primary"
                        >
                            <div className="w-full">
                                {p.id === 'auto' ? (
                                    <div className="text-sm font-bold text-center py-2">Auto</div>
                                ) : (
                                    <div
                                        className="grid gap-1"
                                        style={{
                                            gridTemplateColumns:
                                                'repeat(auto-fill, minmax(14px, 1fr))',
                                        }}
                                    >
                                        {p.colors.map((c, i) => (
                                            <div
                                                key={i}
                                                className="aspect-square rounded-sm border border-border/50 transition-all hover:border-border"
                                                style={{ background: c }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            {p.id === 'auto' ? null : (
                                <div className="text-xs font-semibold text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                                    {p.size} colors
                                </div>
                            )}
                        </Button>
                    );
                })}
            </div>
        </Card>
    );
};
