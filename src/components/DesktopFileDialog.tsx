import { useTranslation } from 'react-i18next';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from './ui/alert-dialog';

interface Props {
    name: string;
    onDismiss: () => void;
    onConfirm?: () => void;
}

/** Uses the app's existing dialog and buttons for OS-open errors and unsaved edits. */
export function DesktopFileDialog({ name, onDismiss, onConfirm }: Props) {
    const { t } = useTranslation('common');
    return (
        <AlertDialog
            open
            onOpenChange={(open) => {
                if (!open) onDismiss();
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t(onConfirm ? 'desktopFiles.unsavedTitle' : 'desktopFiles.failedTitle')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t(
                            onConfirm
                                ? 'desktopFiles.unsavedDescription'
                                : name
                                  ? 'desktopFiles.failedDescription'
                                  : 'desktopFiles.unavailable',
                            { name }
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onDismiss}>
                        {t(onConfirm ? 'desktopFiles.keepEdits' : 'desktopFiles.close')}
                    </AlertDialogCancel>
                    {onConfirm && (
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                onConfirm();
                            }}
                        >
                            {t('desktopFiles.openProfile')}
                        </AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
