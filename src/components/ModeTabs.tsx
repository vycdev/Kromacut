import React from 'react';
import { Button } from '@/components/ui/button';

interface Props {
    mode: '2d' | '3d';
    onChange: (m: '2d' | '3d') => void;
}

export const ModeTabs: React.FC<Props> = ({ mode, onChange }) => {
    return (
        <div className="p-4 border-b border-border pr-[25px]" aria-hidden={false}>
            <div className="flex gap-2">
                <Button
                    variant={mode === '2d' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 font-semibold"
                    onClick={() => onChange('2d')}
                    aria-pressed={mode === '2d'}
                >
                    2D
                </Button>
                <Button
                    variant={mode === '3d' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 font-semibold"
                    onClick={() => onChange('3d')}
                    aria-pressed={mode === '3d'}
                >
                    3D
                </Button>
            </div>
        </div>
    );
};

export default ModeTabs;
