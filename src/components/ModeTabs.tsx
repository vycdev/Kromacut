import React from 'react';

interface Props {
    mode: '2d' | '3d';
    onChange: (m: '2d' | '3d') => void;
}

export const ModeTabs: React.FC<Props> = ({ mode, onChange }) => {
    return (
        <div className="mb-4" aria-hidden={false}>
            <div className="flex bg-gray-800 rounded-lg p-1">
                <button
                    type="button"
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        mode === '2d'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                    onClick={() => onChange('2d')}
                    aria-pressed={mode === '2d'}
                >
                    2D Mode
                </button>
                <button
                    type="button"
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        mode === '3d'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
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
