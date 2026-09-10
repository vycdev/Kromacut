import { useState } from 'react';

export function useProcessingState() {
    const [isQuantizing, setIsQuantizing] = useState(false);
    const [isDedithering, setIsDedithering] = useState(false);
    const [processingLabel, setProcessingLabel] = useState<string>('');
    const [processingProgress, setProcessingProgress] = useState(0);
    const [processingIndeterminate, setProcessingIndeterminate] = useState(false);

    return {
        isQuantizing,
        setIsQuantizing,
        isDedithering,
        setIsDedithering,
        processingLabel,
        setProcessingLabel,
        processingProgress,
        setProcessingProgress,
        processingIndeterminate,
        setProcessingIndeterminate,
    };
}
