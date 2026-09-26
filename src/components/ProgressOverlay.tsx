import { useTranslation } from 'react-i18next';
import { translateRuntimeMessage } from '../lib/runtimeMessages';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clampProgress, progressBarIndicatorClass } from '../lib/progress';

interface ProgressOverlayProps {
    title: string;
    stepLabel: string;
    stepIndex?: number;
    stepCount?: number;
    stepProgress?: number;
    progress: number;
    indeterminate?: boolean;
}

interface EtaState {
    lastProgress: number;
    lastAt: number;
    smoothedRate?: number;
    etaBaseMs?: number;
    etaBaseAt?: number;
}

const ETA_INTERVAL_MS = 250;
const MIN_PROGRESS_FOR_ETA = 0.02;
const MIN_PROGRESS_DELTA = 0.0015;
const MIN_SAMPLE_MS = 120;

function formatDuration(ms: number, mode: 'elapsed' | 'eta' = 'elapsed') {
    if (!Number.isFinite(ms) || ms < 0) return '--';

    const roundedSeconds =
        mode === 'eta'
            ? ms > 0
                ? Math.max(1, Math.round(ms / 1000))
                : 0
            : Math.max(0, Math.floor(ms / 1000));
    const totalSeconds = roundedSeconds;
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
            .toString()
            .padStart(2, '0')}`;
    }

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function estimateFromRate(progress: number, ratePerMs: number) {
    if (progress < MIN_PROGRESS_FOR_ETA || progress >= 0.995 || ratePerMs <= 0) {
        return undefined;
    }

    return (1 - progress) / ratePerMs;
}

function estimateFromAverage(elapsedMs: number, progress: number) {
    if (progress < MIN_PROGRESS_FOR_ETA || progress >= 0.995 || elapsedMs <= 0) {
        return undefined;
    }

    return (elapsedMs / progress) * (1 - progress);
}

function blendEta(rawEtaMs: number, state: EtaState, timestamp: number) {
    if (state.etaBaseMs === undefined || state.etaBaseAt === undefined) {
        return rawEtaMs;
    }

    const currentCountdown = Math.max(0, state.etaBaseMs - (timestamp - state.etaBaseAt));

    if (rawEtaMs <= currentCountdown) {
        return currentCountdown * 0.35 + rawEtaMs * 0.65;
    }

    const extraMs = rawEtaMs - currentCountdown;
    if (extraMs < 3000) {
        return currentCountdown;
    }

    return currentCountdown + Math.min(extraMs, 8000) * 0.25;
}

function updateEtaState(state: EtaState, progress: number, timestamp: number) {
    const progressDelta = progress - state.lastProgress;
    const elapsedMs = timestamp - state.lastAt;

    if (progressDelta < MIN_PROGRESS_DELTA || elapsedMs < MIN_SAMPLE_MS) {
        return;
    }

    const sampleRate = progressDelta / elapsedMs;
    state.smoothedRate =
        state.smoothedRate === undefined ? sampleRate : state.smoothedRate * 0.7 + sampleRate * 0.3;

    const rawEtaMs = estimateFromRate(progress, state.smoothedRate);
    if (rawEtaMs !== undefined) {
        state.etaBaseMs = blendEta(rawEtaMs, state, timestamp);
        state.etaBaseAt = timestamp;
    }

    state.lastProgress = progress;
    state.lastAt = timestamp;
}

function etaLabelFor(progress: number, etaMs: number | undefined) {
    if (progress >= 0.995) return 'finishing';
    if (etaMs === undefined) return 'estimating';
    return formatDuration(etaMs, 'eta');
}

export default function ProgressOverlay({
    title,
    stepLabel,
    stepIndex = 1,
    stepCount = 1,
    stepProgress,
    progress,
    indeterminate = false,
}: ProgressOverlayProps) {
    const { t } = useTranslation('workspace');
    const startedAtRef = useRef(Date.now());
    const titleRef = useRef(title);
    const etaStateRef = useRef<EtaState>({
        lastProgress: clampProgress(progress),
        lastAt: startedAtRef.current,
    });
    const [now, setNow] = useState(() => Date.now());
    const clampedProgress = clampProgress(progress);
    const progressPct = Math.round(clampedProgress * 100);
    const showPercent = !indeterminate;
    const clampedStepProgress =
        stepProgress === undefined ? undefined : clampProgress(stepProgress);
    const showStepProgress = showPercent && clampedStepProgress !== undefined;
    const stepProgressPct =
        clampedStepProgress === undefined ? 0 : Math.round(clampedStepProgress * 100);
    const elapsedMs = Math.max(0, now - startedAtRef.current);
    const safeStepCount = Math.max(1, Math.floor(stepCount));
    const safeStepIndex = Math.max(1, Math.min(safeStepCount, Math.floor(stepIndex)));
    const stepValue = t('progressOverlay.stepOfTotal', {
        step: safeStepIndex,
        total: safeStepCount,
    });
    const displayTitle = translateRuntimeMessage(title);
    const displayStepLabel = translateRuntimeMessage(stepLabel);
    const etaMs = useMemo(() => {
        if (!showPercent) {
            return undefined;
        }

        const averageEta = estimateFromAverage(elapsedMs, clampedProgress);
        const state = etaStateRef.current;
        if (state.etaBaseMs === undefined || state.etaBaseAt === undefined) {
            return averageEta;
        }

        const countdownEta = Math.max(0, state.etaBaseMs - (now - state.etaBaseAt));
        return countdownEta >= 1000 ? countdownEta : averageEta;
    }, [clampedProgress, elapsedMs, now, showPercent]);
    const etaLabel = showPercent ? etaLabelFor(clampedProgress, etaMs) : 'estimating';

    useEffect(() => {
        const timestamp = Date.now();
        const state = etaStateRef.current;
        const titleChanged = titleRef.current !== title;
        const progressReset = clampedProgress < state.lastProgress - 0.02;

        if (!showPercent || titleChanged || progressReset) {
            titleRef.current = title;
            startedAtRef.current = timestamp;
            etaStateRef.current = {
                lastProgress: clampedProgress,
                lastAt: timestamp,
            };
            setNow(timestamp);
            return;
        }

        updateEtaState(state, clampedProgress, timestamp);
        setNow(timestamp);
    }, [clampedProgress, title, showPercent]);

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), ETA_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, []);

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm cursor-wait">
            <div className="w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl">
                <div className="px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="truncate text-base font-semibold leading-tight text-foreground">
                                {displayTitle}
                            </div>
                        </div>
                        <div className="shrink-0 text-xl font-bold leading-none tabular-nums text-foreground">
                            {showPercent ? `${progressPct}%` : '...'}
                        </div>
                    </div>

                    <div className="mt-4 truncate text-xs font-medium text-muted-foreground">
                        {displayStepLabel}
                    </div>

                    <div
                        className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted/80"
                        role="progressbar"
                        aria-label={t('progressOverlay.overallProgress', { title: displayTitle })}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={showPercent ? progressPct : undefined}
                    >
                        <div
                            className={progressBarIndicatorClass(indeterminate)}
                            style={{
                                width: showPercent ? `${progressPct}%` : '100%',
                            }}
                        />
                    </div>

                    {showStepProgress && (
                        <div
                            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50"
                            role="progressbar"
                            aria-label={t('progressOverlay.stepProgress', {
                                title: displayTitle,
                                step: displayStepLabel,
                            })}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={stepProgressPct}
                        >
                            <div
                                className="h-full rounded-full bg-primary/55"
                                style={{ width: `${stepProgressPct}%` }}
                            />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-3 border-t border-border/45 bg-muted/15 px-4 py-3">
                    <div className="min-w-0 pr-3">
                        <div className="text-[10px] font-semibold text-muted-foreground">
                            {t('progressOverlay.elapsed')}
                        </div>
                        <div className="mt-1.5 truncate text-lg font-bold leading-none tabular-nums text-foreground">
                            {formatDuration(elapsedMs, 'elapsed')}
                        </div>
                    </div>
                    <div className="min-w-0 border-l border-border/60 px-3">
                        <div className="text-[10px] font-semibold text-muted-foreground">
                            {t('progressOverlay.eta')}
                        </div>
                        <div className="mt-1.5 truncate text-lg font-bold leading-none tabular-nums text-foreground">
                            {etaLabel === 'estimating' || etaLabel === 'finishing'
                                ? t(`progressOverlay.${etaLabel}`)
                                : etaLabel}
                        </div>
                    </div>
                    <div className="min-w-0 border-l border-border/60 pl-3">
                        <div className="text-[10px] font-semibold text-muted-foreground">
                            {t('progressOverlay.step')}
                        </div>
                        <div className="mt-1.5 truncate text-lg font-bold leading-none tabular-nums text-foreground">
                            {stepValue}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
