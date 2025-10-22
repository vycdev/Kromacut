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
    const containerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ startX: 0, startWidth: 0 });

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            isDraggingRef.current = true;
            dragStartRef.current = {
                startX: e.clientX,
                startWidth: leftWidth,
            };

            const container = containerRef.current;
            if (!container) return;

            const handleMouseMove = (e: MouseEvent) => {
                if (!isDraggingRef.current) return;

                const deltaX = e.clientX - dragStartRef.current.startX;
                const containerWidth = container.clientWidth;
                const deltaPercent = (deltaX / containerWidth) * 100;
                const newWidth = dragStartRef.current.startWidth + deltaPercent;

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
        <div
            ref={containerRef}
            className={`flex h-full w-full ${className}`}
            style={
                {
                    height: '100%',
                    '--left-width': `${leftWidth}%`,
                } as React.CSSProperties
            }
        >
            <div
                className="overflow-hidden h-full flex-shrink-0"
                style={{ flexBasis: `${leftWidth}%` }}
            >
                {children[0]}
            </div>
            <Separator
                ref={separatorRef}
                orientation="vertical"
                className="bg-gray-700 hover:bg-gray-600 cursor-col-resize transition-colors flex-shrink-0 w-2"
                onMouseDown={handleMouseDown}
            />
            <div className="overflow-hidden min-w-0 h-full flex-1">{children[1]}</div>
        </div>
    );
};

export default ResizableSplitter;
