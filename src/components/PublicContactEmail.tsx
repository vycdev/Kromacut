import { useEffect, useId, useRef, useState } from 'react';

const buttonClassName =
    'inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60';

export default function PublicContactEmail() {
    const detailsId = useId();
    const emailLinkRef = useRef<HTMLAnchorElement>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [copying, setCopying] = useState(false);
    const [copyStatus, setCopyStatus] = useState('');

    useEffect(() => {
        // The reveal control is removed, so keep keyboard focus on its replacement.
        if (email !== null) emailLinkRef.current?.focus({ preventScroll: true });
    }, [email]);

    const revealEmail = () => {
        if (email !== null) return;
        // Basic scraping deterrent, not secrecy: decode only after activation.
        const encodedParts = [
            [118, 121, 99, 100, 101, 118],
            [103, 109, 97, 105, 108, 46, 99, 111, 109],
        ];
        setEmail(
            encodedParts
                .map((part) => part.map((code) => String.fromCharCode(code)).join(''))
                .join(String.fromCharCode(64))
        );
    };

    const copyEmail = async () => {
        if (!email || copying) return;
        setCopying(true);
        setCopyStatus('');
        try {
            await navigator.clipboard.writeText(email);
            setCopyStatus('Email address copied.');
        } catch {
            setCopyStatus(
                'Could not copy automatically. Select the email address above and copy it manually, or try Copy email address again.'
            );
        } finally {
            setCopying(false);
        }
    };

    return (
        <div className="space-y-3">
            {email === null && (
                <>
                    <button
                        type="button"
                        className={buttonClassName}
                        aria-expanded={false}
                        aria-controls={detailsId}
                        onClick={revealEmail}
                    >
                        Reveal email address
                    </button>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Reveal the email address, then open it in your email app or copy it.
                    </p>
                </>
            )}
            <div id={detailsId} hidden={email === null} className="space-y-3">
                {email !== null && (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <a
                                ref={emailLinkRef}
                                href={`mailto:${email}`}
                                className="inline-flex min-h-11 max-w-full select-text items-center break-all rounded-md text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                                {email}
                            </a>
                            <button
                                type="button"
                                className={buttonClassName}
                                disabled={copying}
                                aria-busy={copying}
                                onClick={copyEmail}
                            >
                                Copy email address
                            </button>
                        </div>
                        <p role="status" aria-atomic="true" className="text-sm leading-6">
                            {copyStatus}
                        </p>
                    </>
                )}
            </div>
            <noscript>
                <p className="text-sm leading-6 text-muted-foreground">
                    JavaScript is needed to reveal this email address.
                </p>
            </noscript>
        </div>
    );
}
