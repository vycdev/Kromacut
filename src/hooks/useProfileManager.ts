import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Filament } from '../types';
import type { FinalPrintableStackSnapshot } from '../types/appearance';
import {
    buildPaletteProofRecord,
    completePaletteProofEvaluation,
    deletePaletteProof,
    deleteStackMatrixCalibration,
    reopenPaletteProofEvaluation,
    setPaletteTargetResponse,
    upsertPaletteProofRecord,
    upsertStackMatrixCalibration,
    type PaletteProofRecord,
    type PaletteTargetResponse,
    type StackMatrixCalibrationV1,
} from '../lib/appearanceProfile';
import type { PaletteProofSpec } from '../lib/paletteProof';
import {
    type AutoPaintProfile,
    loadProfiles,
    saveProfilesToStorage,
    createProfile,
    overwriteProfile,
    renameProfile,
    deleteProfile as deleteProfileFromList,
    importProfiles,
    parseProfileFile,
    parseHueForgeCSV,
    exportProfileBlob,
    profileFileName,
    loadLastProfileId,
    saveLastProfileId,
    profileFilamentsEqual,
    buildProfileExportSnapshot,
} from '../lib/profileManager';
import { deduplicateName } from '../lib/nameUtils';
import { persistProfilesBeforeCommit } from '../lib/profilePersistence';
import { TEMPLATE_PROFILES, isTemplateProfileId } from '../data/supplierFilaments';

/** Built-in template profile ids are reserved — imported files can never claim them. */
const RESERVED_PROFILE_IDS = new Set(TEMPLATE_PROFILES.map((p) => p.id));

const PROFILE_STORAGE_FAILURE_MESSAGE =
    'Profile changes could not be saved. Existing profiles and selection were left unchanged; free browser storage and try again.';

export interface UseProfileManagerOptions {
    /** Current filament list (used for save/export operations). */
    filaments: Filament[];
    /** Setter to replace the filament list when loading a profile. */
    setFilaments: (filaments: Filament[]) => void;
}

export function useProfileManager({ filaments, setFilaments }: UseProfileManagerOptions) {
    const [initialState] = useState(() => {
        const loadedProfiles = loadProfiles();
        const lastId = loadLastProfileId();
        // Templates are selectable too, so the selection survives reloads
        const activeProfile = lastId
            ? [...loadedProfiles, ...TEMPLATE_PROFILES].find((p) => p.id === lastId)
            : null;
        return {
            profiles: loadedProfiles,
            activeProfileId: activeProfile ? activeProfile.id : null,
            initialFilaments: activeProfile
                ? activeProfile.filaments.map((f) => ({ ...f }))
                : undefined,
        };
    });

    const [profiles, setProfiles] = useState<AutoPaintProfile[]>(initialState.profiles);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(
        initialState.activeProfileId
    );
    const [showSaveNewPopover, setShowSaveNewPopover] = useState(false);
    const [saveProfileName, setSaveProfileName] = useState('');
    const [showRenamePopover, setShowRenamePopover] = useState(false);
    const [renameProfileName, setRenameProfileName] = useState('');
    const [importFeedback, setImportFeedback] = useState<string | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    // Dirty state: detect if current filaments differ from the active profile's
    // (templates included, so the badge nudges toward Save New after tweaking one)
    const isDirty = useMemo(() => {
        if (!activeProfileId) return false;
        const active = [...profiles, ...TEMPLATE_PROFILES].find((p) => p.id === activeProfileId);
        if (!active) return false;
        return !profileFilamentsEqual(active.filaments, filaments);
    }, [activeProfileId, profiles, filaments]);
    const activeProfile = useMemo(
        () => profiles.find((profile) => profile.id === activeProfileId),
        [activeProfileId, profiles]
    );

    // Save New: always creates a new profile
    const handleSaveNewProfile = useCallback(
        (name: string) => {
            if (!name.trim()) return;
            const newProfile = createProfile(name, filaments);
            const updated = [...profiles, newProfile];
            if (
                !persistProfilesBeforeCommit(
                    updated,
                    saveProfilesToStorage,
                    (persistedProfiles) => {
                        setProfiles(persistedProfiles);
                        setActiveProfileId(newProfile.id);
                        saveLastProfileId(newProfile.id);
                        setShowSaveNewPopover(false);
                        setSaveProfileName('');
                        setImportFeedback(null);
                    }
                )
            ) {
                setImportFeedback(PROFILE_STORAGE_FAILURE_MESSAGE);
            }
        },
        [filaments, profiles]
    );

    // Save (overwrite): updates existing profile in-place (templates are read-only)
    const handleOverwriteProfile = useCallback(() => {
        if (!activeProfileId || isTemplateProfileId(activeProfileId)) return;
        const updated = overwriteProfile(profiles, activeProfileId, filaments);
        if (
            !persistProfilesBeforeCommit(updated, saveProfilesToStorage, (persistedProfiles) => {
                setProfiles(persistedProfiles);
                setImportFeedback(null);
            })
        ) {
            setImportFeedback(PROFILE_STORAGE_FAILURE_MESSAGE);
        }
    }, [activeProfileId, filaments, profiles]);

    const handleRenameProfile = useCallback(
        (name: string) => {
            if (!activeProfileId || isTemplateProfileId(activeProfileId) || !name.trim()) return;
            const updated = renameProfile(profiles, activeProfileId, name);
            if (
                !persistProfilesBeforeCommit(
                    updated,
                    saveProfilesToStorage,
                    (persistedProfiles) => {
                        setProfiles(persistedProfiles);
                        setShowRenamePopover(false);
                        setImportFeedback(null);
                    }
                )
            ) {
                setImportFeedback(PROFILE_STORAGE_FAILURE_MESSAGE);
            }
        },
        [activeProfileId, profiles]
    );

    const handleLoadProfile = useCallback(
        (id: string) => {
            const profile = [...profiles, ...TEMPLATE_PROFILES].find((p) => p.id === id);
            if (!profile) return;
            setActiveProfileId(id);
            saveLastProfileId(id);
            setFilaments(profile.filaments.map((f) => ({ ...f })));
            if (isTemplateProfileId(id)) {
                setImportFeedback(
                    `Loaded ${profile.name} — hiding distances are estimated from color. Calibrate before printing.`
                );
            }
        },
        [profiles, setFilaments]
    );

    const handleDeleteProfile = useCallback(
        (id: string) => {
            if (isTemplateProfileId(id)) return;
            const updated = deleteProfileFromList(profiles, id);
            if (
                !persistProfilesBeforeCommit(
                    updated,
                    saveProfilesToStorage,
                    (persistedProfiles) => {
                        setProfiles(persistedProfiles);
                        if (activeProfileId === id) {
                            setActiveProfileId(null);
                            saveLastProfileId(null);
                        }
                        setImportFeedback(null);
                    }
                )
            ) {
                setImportFeedback(PROFILE_STORAGE_FAILURE_MESSAGE);
            }
        },
        [profiles, activeProfileId]
    );

    const handleExportProfile = useCallback(() => {
        const active = [...profiles, ...TEMPLATE_PROFILES].find((p) => p.id === activeProfileId);
        const profile = buildProfileExportSnapshot(active, filaments, isDirty);

        const blob = exportProfileBlob(profile);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = profileFileName(profile.name);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (active && !isTemplateProfileId(active.id) && isDirty) {
            setImportFeedback(
                'Exported unsaved filament edits as a new profile without incompatible calibration evidence.'
            );
        }
    }, [filaments, profiles, activeProfileId, isDirty]);

    const handleRegisterPaletteProof = useCallback(
        (snapshot: FinalPrintableStackSnapshot, proof: PaletteProofSpec): PaletteProofRecord => {
            if (!activeProfileId || !activeProfile) {
                throw new Error('Save a named filament profile before tracking a Palette Proof');
            }
            if (isDirty) {
                throw new Error(
                    'Save or overwrite the edited filament profile before tracking a Palette Proof'
                );
            }
            const record = buildPaletteProofRecord(activeProfile.filaments, snapshot, proof);
            const updated = profiles.map((profile) =>
                profile.id === activeProfileId
                    ? {
                          ...profile,
                          appearance: upsertPaletteProofRecord(profile.appearance, record),
                          updatedAt: Date.now(),
                      }
                    : profile
            );
            if (!saveProfilesToStorage(updated)) {
                throw new Error('Not enough browser storage to retain this Palette Proof');
            }
            setProfiles(updated);
            return record;
        },
        [activeProfile, activeProfileId, isDirty, profiles]
    );

    const handleSetPaletteTargetResponse = useCallback(
        (proofId: string, column: number, response: PaletteTargetResponse | null) => {
            if (!activeProfileId || !activeProfile) {
                throw new Error('Load the filament profile that owns this Palette Proof');
            }
            if (isDirty) {
                throw new Error('Save or revert filament edits before recording proof results');
            }
            const appearance = setPaletteTargetResponse(
                activeProfile.appearance,
                proofId,
                column,
                response
            );
            const updated = profiles.map((profile) =>
                profile.id === activeProfileId
                    ? { ...profile, appearance, updatedAt: Date.now() }
                    : profile
            );
            if (!saveProfilesToStorage(updated)) {
                throw new Error('Could not persist Palette Proof results');
            }
            setProfiles(updated);
        },
        [activeProfile, activeProfileId, isDirty, profiles]
    );

    const handleCompletePaletteProofEvaluation = useCallback(
        (proofId: string) => {
            if (!activeProfileId || !activeProfile?.appearance) {
                throw new Error('Load the filament profile that owns this Palette Proof');
            }
            if (isDirty) {
                throw new Error('Save or revert filament edits before completing proof results');
            }
            const appearance = completePaletteProofEvaluation(activeProfile.appearance, proofId);
            const updated = profiles.map((profile) =>
                profile.id === activeProfileId
                    ? { ...profile, appearance, updatedAt: Date.now() }
                    : profile
            );
            if (!saveProfilesToStorage(updated)) {
                throw new Error('Could not persist Palette Proof completion');
            }
            setProfiles(updated);
        },
        [activeProfile, activeProfileId, isDirty, profiles]
    );

    const handleReopenPaletteProofEvaluation = useCallback(
        (proofId: string) => {
            if (!activeProfileId || !activeProfile?.appearance) {
                throw new Error('Load the filament profile that owns this Palette Proof');
            }
            if (isDirty) {
                throw new Error('Save or revert filament edits before editing proof results');
            }
            const appearance = reopenPaletteProofEvaluation(activeProfile.appearance, proofId);
            const updated = profiles.map((profile) =>
                profile.id === activeProfileId
                    ? { ...profile, appearance, updatedAt: Date.now() }
                    : profile
            );
            if (!saveProfilesToStorage(updated)) {
                throw new Error('Could not persist the reopened Palette Proof');
            }
            setProfiles(updated);
        },
        [activeProfile, activeProfileId, isDirty, profiles]
    );

    const handleDeletePaletteProof = useCallback(
        (proofId: string) => {
            if (!activeProfileId || !activeProfile?.appearance) {
                throw new Error('Load the filament profile that owns this Palette Proof');
            }
            if (isDirty) {
                throw new Error('Save or revert filament edits before deleting this proof');
            }
            const appearance = deletePaletteProof(activeProfile.appearance, proofId);
            const updated = profiles.map((profile) =>
                profile.id === activeProfileId
                    ? { ...profile, appearance, updatedAt: Date.now() }
                    : profile
            );
            if (!saveProfilesToStorage(updated)) {
                throw new Error('Could not persist Palette Proof deletion');
            }
            setProfiles(updated);
        },
        [activeProfile, activeProfileId, isDirty, profiles]
    );

    const handleUpsertStackMatrixCalibration = useCallback(
        (record: StackMatrixCalibrationV1) => {
            if (!activeProfileId || !activeProfile) {
                throw new Error('Save a named filament profile before creating a Stack Matrix');
            }
            if (isDirty) {
                throw new Error(
                    'Save or overwrite the edited filament profile before creating a Stack Matrix'
                );
            }
            const appearance = upsertStackMatrixCalibration(activeProfile.appearance, record);
            const updated = profiles.map((profile) =>
                profile.id === activeProfileId
                    ? { ...profile, appearance, updatedAt: Date.now() }
                    : profile
            );
            if (!saveProfilesToStorage(updated)) {
                throw new Error('Not enough browser storage to retain this Stack Matrix');
            }
            setProfiles(updated);
        },
        [activeProfile, activeProfileId, isDirty, profiles]
    );

    const handleDeleteStackMatrixCalibration = useCallback(
        (matrixId: string) => {
            if (!activeProfileId || !activeProfile?.appearance) {
                throw new Error('Load the filament profile that owns this Stack Matrix');
            }
            if (isDirty) {
                throw new Error('Save or revert filament edits before deleting this Stack Matrix');
            }
            const appearance = deleteStackMatrixCalibration(activeProfile.appearance, matrixId);
            const updated = profiles.map((profile) =>
                profile.id === activeProfileId
                    ? { ...profile, appearance, updatedAt: Date.now() }
                    : profile
            );
            if (!saveProfilesToStorage(updated)) {
                throw new Error('Could not persist Stack Matrix deletion');
            }
            setProfiles(updated);
        },
        [activeProfile, activeProfileId, isDirty, profiles]
    );

    const handleImportFile = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const content = reader.result as string;
                const isCSV = /\.(csv|tsv)$/i.test(file.name);
                const profileName = file.name.replace(/\.(csv|tsv)$/i, '') || 'HueForge Import';
                const incoming = isCSV
                    ? parseHueForgeCSV(content, profileName)
                    : parseProfileFile(content);
                if (!incoming) {
                    console.error('Invalid profile file');
                    return;
                }
                const result = importProfiles(profiles, incoming, RESERVED_PROFILE_IDS);
                if (result.imported.length > 0) {
                    if (!saveProfilesToStorage(result.profiles)) {
                        setImportFeedback(
                            'Import could not be saved. Existing profiles were left unchanged; free browser storage and try again.'
                        );
                        return;
                    }
                    setProfiles(result.profiles);
                }

                // Build feedback message
                const parts: string[] = [];
                if (result.imported.length > 0) parts.push(`${result.imported.length} imported`);
                if (result.overwritten.length > 0)
                    parts.push(`${result.overwritten.length} overwritten`);
                if (result.skipped.length > 0)
                    parts.push(`${result.skipped.length} skipped (duplicates)`);
                if (result.renamed.length > 0) parts.push(`${result.renamed.length} renamed`);
                setImportFeedback(parts.join(', ') || 'No profiles found');

                // Auto-load the first imported profile
                if (result.imported.length > 0) {
                    const first = result.imported[0];
                    setActiveProfileId(first.id);
                    saveLastProfileId(first.id);
                    setFilaments(first.filaments.map((f) => ({ ...f })));
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        },
        [profiles, setFilaments]
    );

    // Clear import feedback after a few seconds
    useEffect(() => {
        if (!importFeedback) return;
        const timer = setTimeout(() => setImportFeedback(null), 4000);
        return () => clearTimeout(timer);
    }, [importFeedback]);

    useEffect(() => {
        if (!showRenamePopover) return;
        const active = activeProfileId ? profiles.find((p) => p.id === activeProfileId) : null;
        setRenameProfileName(active?.name ?? '');
    }, [activeProfileId, profiles, showRenamePopover]);

    // Prefill Save New with a "(copy)" name forked from the active profile or
    // template, so saving a tweaked template is a two-click operation.
    useEffect(() => {
        if (!showSaveNewPopover) return;
        const active = activeProfileId
            ? [...profiles, ...TEMPLATE_PROFILES].find((p) => p.id === activeProfileId)
            : null;
        setSaveProfileName(
            active
                ? deduplicateName(
                      `${active.name} (copy)`,
                      profiles.map((p) => p.name)
                  )
                : ''
        );
    }, [activeProfileId, profiles, showSaveNewPopover]);

    return {
        profiles,
        activeProfileId,
        activeProfile,
        isDirty,
        showSaveNewPopover,
        setShowSaveNewPopover,
        saveProfileName,
        setSaveProfileName,
        showRenamePopover,
        setShowRenamePopover,
        renameProfileName,
        setRenameProfileName,
        importFeedback,
        importInputRef,
        initialFilaments: initialState.initialFilaments,
        handleSaveNewProfile,
        handleOverwriteProfile,
        handleRenameProfile,
        handleLoadProfile,
        handleDeleteProfile,
        handleExportProfile,
        handleImportFile,
        handleRegisterPaletteProof,
        handleSetPaletteTargetResponse,
        handleCompletePaletteProofEvaluation,
        handleReopenPaletteProofEvaluation,
        handleDeletePaletteProof,
        handleUpsertStackMatrixCalibration,
        handleDeleteStackMatrixCalibration,
    };
}
