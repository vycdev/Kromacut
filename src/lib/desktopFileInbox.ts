/** Native OS-opened documents. Only the Rust queue can grant access to a path. */
export interface DesktopOpenedFile {
    name: string;
    kind: 'profile' | 'palette';
    content: string | null;
    error: string | null;
}

export interface DesktopFileRequest extends DesktopOpenedFile {
    id: number;
}

interface FileTransport {
    listen: (onFiles: () => void) => Promise<unknown>;
    take: () => Promise<DesktopOpenedFile | null>;
}

/** Retains an in-flight request across React remounts and drains one document at a time. */
export function createDesktopFileInbox(transport: FileTransport) {
    const subscribers = new Set<() => void>();
    let current: DesktopFileRequest | null = null;
    let sequence = 0;
    let started = false;
    let loading = false;
    let requested = false;
    const notify = () => subscribers.forEach((subscriber) => subscriber());

    async function requestNext() {
        requested = true;
        if (loading || current) return;
        loading = true;
        try {
            // A wake-up during an empty take must trigger another take, not be lost.
            while (requested && !current) {
                requested = false;
                const opened = await transport.take();
                if (opened) current = { ...opened, id: ++sequence };
            }
        } catch (error) {
            current = {
                id: ++sequence,
                name: '',
                kind: 'profile',
                content: null,
                error: String(error),
            };
        } finally {
            loading = false;
            notify();
        }
    }

    return {
        subscribe(subscriber: () => void) {
            subscribers.add(subscriber);
            if (!started) {
                started = true;
                // Register before reading the startup queue. Events carry no file data.
                void transport
                    .listen(() => void requestNext())
                    .then(
                        () => void requestNext(),
                        (error) => {
                            console.error('Could not listen for opened files', error);
                            void requestNext();
                        }
                    );
            }
            return () => {
                subscribers.delete(subscriber);
            };
        },
        getSnapshot: () => current,
        finish(id: number) {
            if (current?.id !== id) return;
            const failedTransport = current.name === '' && current.content === null;
            current = null;
            notify();
            // An unavailable IPC bridge should not produce an endless error-dialog loop.
            if (!failedTransport) void requestNext();
        },
    };
}
