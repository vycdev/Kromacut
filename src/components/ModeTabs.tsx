import React from 'react';

interface Props {
    mode: '2d' | '3d';
    onChange: (m: '2d' | '3d') => void;
}

export const ModeTabs: React.FC<Props> = ({ mode, onChange }) => {
    return (
        <div className="controls-group mode-section" aria-hidden={false}>
            <div className="mode-tabs">
                <button
                    type="button"
                    className={`mode-btn ${mode === '2d' ? 'mode-btn--active' : ''}`}
                    onClick={() => onChange('2d')}
                    aria-pressed={mode === '2d'}
                >
                    2D Mode
                </button>
                <button
                    type="button"
                    className={`mode-btn ${mode === '3d' ? 'mode-btn--active' : ''}`}
                    onClick={() => onChange('3d')}
                    aria-pressed={mode === '3d'}
                >
                    3D Mode
                </button>
            </div>
        </div>
    );
};

export default ModeTabs;
