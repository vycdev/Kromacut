import { useCallback, useState } from 'react';
import type { Filament } from '../types';
import { estimateTDFromColor } from '../lib/colorUtils';

export interface UseFilamentsOptions {
    initial?: Filament[];
}

export function useFilaments(options: UseFilamentsOptions = {}) {
    const [filaments, setFilaments] = useState<Filament[]>(options.initial ?? []);

    const addFilament = useCallback(() => {
        const defaultColor = '#808080';
        setFilaments((prev) => [
            ...prev,
            {
                id: Math.random().toString(36).substring(2, 9),
                color: defaultColor,
                td: estimateTDFromColor(defaultColor),
            },
        ]);
    }, []);

    const addFilamentWithProps = useCallback((props: Omit<Filament, 'id'>) => {
        setFilaments((prev) => [
            ...prev,
            { id: Math.random().toString(36).substring(2, 9), ...props },
        ]);
    }, []);

    const removeFilament = useCallback((id: string) => {
        setFilaments((prev) => prev.filter((f) => f.id !== id));
    }, []);

    const updateFilament = useCallback((id: string, updates: Partial<Omit<Filament, 'id'>>) => {
        setFilaments((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    }, []);

    return {
        filaments,
        setFilaments,
        addFilament,
        addFilamentWithProps,
        removeFilament,
        updateFilament,
    };
}
