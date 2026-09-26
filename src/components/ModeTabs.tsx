import { useTranslation } from 'react-i18next';
import React from 'react';
import { Button } from '@/components/ui/button';

interface Props {
    mode: '2d' | '3d';
    onChange: (m: '2d' | '3d') => void;
}

export const ModeTabs: React.FC<Props> = ({ mode, onChange }) => {
    const { t } = useTranslation('workspace');
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
                    {t('modeTabs.2d')}
                </Button>
                <Button
                    variant={mode === '3d' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 font-semibold"
                    onClick={() => onChange('3d')}
                    aria-pressed={mode === '3d'}
                >
                    {t('modeTabs.3d')}
                </Button>
            </div>
        </div>
    );
};

export default ModeTabs;
