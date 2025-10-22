import React, { useState, useRef, useCallback } from 'react';
import { Separator } from '@/components/ui/separator';

interface ResizableSplitterProps {
    children: [React.ReactNode, React.ReactNode];
    defaultSize?: number; // percentage (0-100)
    minSize?: number; // minimum percentage for left panel
    maxSize?: number; // maximum percentage for left panel
    className?: string;
}

export const ResizableSplitter: React.FC<ResizableSplitterProps> = ({
    children,
    defaultSize = 50,
    minSize = 20,
    maxSize = 80,
    className = '',
}) => {
    const [leftWidth, setLeftWidth] = useState(defaultSize);
    const separatorRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            isDraggingRef.current = true;

            const startX = e.clientX;
            const startWidth = leftWidth;
            const container = separatorRef.current?.parentElement;
            const containerWidth = container?.clientWidth || window.innerWidth;

            const handleMouseMove = (e: MouseEvent) => {
                if (!isDraggingRef.current) return;

                const deltaX = e.clientX - startX;
                const deltaPercent = (deltaX / containerWidth) * 100;
                const newWidth = startWidth + deltaPercent;

                // Constrain the width within min/max bounds
                const constrainedWidth = Math.max(minSize, Math.min(maxSize, newWidth));
                setLeftWidth(constrainedWidth);
            };

            const handleMouseUp = () => {
                isDraggingRef.current = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        },
        [leftWidth, minSize, maxSize]
    );

    return (
        <div className={`flex h-full ${className}`}>
            <div className="flex-shrink-0 overflow-hidden" style={{ width: `${leftWidth}%` }}>
                {children[0]}
            </div>
            <Separator
                ref={separatorRef}
                orientation="vertical"
                className="w-1 bg-gray-700 hover:bg-gray-600 cursor-col-resize transition-colors flex-shrink-0"
                onMouseDown={handleMouseDown}
            />
            <div className="flex-1 overflow-hidden" style={{ width: `${100 - leftWidth}%` }}>
                {children[1]}
            </div>
        </div>
    );
};

export default ResizableSplitter;
