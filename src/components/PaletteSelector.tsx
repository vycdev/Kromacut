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
        <Card className="p-4 space-y-3">
            <div className="font-bold text-foreground">Palette</div>
            <div className="grid grid-cols-2 gap-2">
                {PALETTES.map((p) => {
                    const isActive = p.id === selected;
                    return (
                        <Button
                            key={p.id}
                            type="button"
                            onClick={() => onSelect(p.id, p.size)}
                            title={p.id === 'auto' ? 'Auto' : `${p.size} colors`}
                            variant={isActive ? 'default' : 'outline'}
                            className="h-auto p-2 flex flex-col items-center gap-2"
                        >
                            <div className="w-full">
                                {p.id === 'auto' ? (
                                    <div className="text-xs font-bold text-center">Auto</div>
                                ) : (
                                    <div className="grid grid-cols-4 gap-1">
                                        {p.colors.map((c, i) => (
                                            <div
                                                key={i}
                                                className="aspect-square rounded border border-border"
                                                style={{ background: c }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            {p.id === 'auto' ? null : (
                                <div className="text-xs font-semibold text-muted-foreground">
                                    {p.size}
                                </div>
                            )}
                        </Button>
                    );
                })}
            </div>
        </Card>
    );
};
