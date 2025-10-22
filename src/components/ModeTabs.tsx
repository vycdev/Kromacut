import React from 'react';
import { Button } from '@/components/ui/button';

interface Props {
    mode: '2d' | '3d';
    onChange: (m: '2d' | '3d') => void;
}

export const ModeTabs: React.FC<Props> = ({ mode, onChange }) => {
    return (
        <div className="mb-4" aria-hidden={false}>
            <div className="flex bg-muted rounded-lg p-1">
                <Button
                    variant={mode === '2d' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1"
                    onClick={() => onChange('2d')}
                    aria-pressed={mode === '2d'}
                >
                    2D Mode
                </Button>
                <Button
                    variant={mode === '3d' ? 'default' : 'ghost'}
                    size="sm"
                    className="flex-1"
                    onClick={() => onChange('3d')}
                    aria-pressed={mode === '3d'}
                >
                    3D Mode
                </Button>
            </div>
        </div>
    );
};

export default ModeTabs;
