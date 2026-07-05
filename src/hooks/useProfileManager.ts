import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Filament } from '../types';
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
} from '../lib/profileManager';

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
        const activeProfile = lastId ? loadedProfiles.find((p) => p.id === lastId) : null;
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
    const filamentCalibrationSignature = useCallback(
        (filament: Filament) => JSON.stringify(filament.calibration ?? null),
        []
    );

    // Dirty state: detect if current filaments differ from the active profile's
    const isDirty = useMemo(() => {
        if (!activeProfileId) return false;
        const active = profiles.find((p) => p.id === activeProfileId);
        if (!active) return false;
        if (active.filaments.length !== filaments.length) return true;
        return active.filaments.some(
            (af, i) =>
                af.color !== filaments[i].color ||
                af.td !== filaments[i].td ||
                (af.name ?? '') !== (filaments[i].name ?? '') ||
                filamentCalibrationSignature(af) !== filamentCalibrationSignature(filaments[i])
        );
    }, [activeProfileId, profiles, filaments, filamentCalibrationSignature]);

    // Save New: always creates a new profile
    const handleSaveNewProfile = useCallback(
        (name: string) => {
            if (!name.trim()) return;
            const newProfile = createProfile(name, filaments);
            const updated = [...profiles, newProfile];
            setProfiles(updated);
            saveProfilesToStorage(updated);
            setActiveProfileId(newProfile.id);
            saveLastProfileId(newProfile.id);
            setShowSaveNewPopover(false);
            setSaveProfileName('');
        },
        [filaments, profiles]
    );

    // Save (overwrite): updates existing profile in-place
    const handleOverwriteProfile = useCallback(() => {
        if (!activeProfileId) return;
        const updated = overwriteProfile(profiles, activeProfileId, filaments);
        setProfiles(updated);
        saveProfilesToStorage(updated);
    }, [activeProfileId, filaments, profiles]);

    const handleRenameProfile = useCallback(
        (name: string) => {
            if (!activeProfileId || !name.trim()) return;
            const updated = renameProfile(profiles, activeProfileId, name);
            setProfiles(updated);
            saveProfilesToStorage(updated);
            setShowRenamePopover(false);
        },
        [activeProfileId, profiles]
    );

    const handleLoadProfile = useCallback(
        (id: string) => {
            const profile = profiles.find((p) => p.id === id);
            if (!profile) return;
            setActiveProfileId(id);
            saveLastProfileId(id);
            setFilaments(profile.filaments.map((f) => ({ ...f })));
        },
        [profiles, setFilaments]
    );

    const handleDeleteProfile = useCallback(
        (id: string) => {
            const updated = deleteProfileFromList(profiles, id);
            setProfiles(updated);
            saveProfilesToStorage(updated);
            if (activeProfileId === id) {
                setActiveProfileId(null);
                saveLastProfileId(null);
            }
        },
        [profiles, activeProfileId]
    );

    const handleExportProfile = useCallback(() => {
        const active = profiles.find((p) => p.id === activeProfileId);
        const profile = createProfile(active?.name ?? 'Exported Profile', filaments);
        // Preserve original ID if exporting active profile
        if (active) profile.id = active.id;

        const blob = exportProfileBlob(profile);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = profileFileName(profile.name);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, [filaments, profiles, activeProfileId]);

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
                const result = importProfiles(profiles, incoming);
                setProfiles(result.profiles);
                saveProfilesToStorage(result.profiles);

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

    return {
        profiles,
        activeProfileId,
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
    };
}
