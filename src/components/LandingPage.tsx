import {
    ArrowRight,
    BookOpen,
    Check,
    ChevronDown,
    Download,
    Github,
    Heart,
    MessageCircle,
    Monitor,
    Moon,
    Play,
    Ruler,
    Sun,
} from 'lucide-react';
import React from 'react';
import logo from '../assets/logo.png';
import fuji2d from '../../content/fuji2d_new.png';
import fuji3d from '../../content/fuji3d_new.png';
import sliced from '../../content/fuji3dsliced.png';
import printed from '../../content/printed.jpg';
import hobbitsAndDragonsOne from '../../content/community/hobbits-and-dragons-1.jpg';
import hobbitsAndDragonsTwo from '../../content/community/hobbits-and-dragons-2.jpg';
import kingOfHearts from '../../content/community/king-of-hearts.jpg';
import kingOfHeartsSlicer from '../../content/community/king-of-hearts-slicer.jpg';
import hopeKromacutPreview from '../../content/community/hope-kromacut-preview.jpg';
import hopeSlicerPreview from '../../content/community/hope-slicer-preview.jpg';
import hopeFinished from '../../content/community/hope-finished.jpg';
import redditIcon from '../assets/reddit.svg';
import { APP_PATH, docsPath } from '@/lib/routes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    applyResolvedTheme,
    applyThemeMode,
    getStoredThemeMode,
    saveThemeMode,
    subscribeToSystemTheme,
    THEME_STORAGE_KEY,
    type ThemeMode,
} from '@/lib/theme';

const links = {
    releases: 'https://github.com/vycdev/Kromacut/releases',
    github: 'https://github.com/vycdev/Kromacut',
    discord: 'https://discord.gg/nU63sFMcnX',
    reddit: 'https://www.reddit.com/r/kromacut/',
    patreon: 'https://www.patreon.com/cw/vycdev',
};

const workflow = [
    {
        number: '01',
        title: 'Import an image',
        description: 'Drop in artwork, a photo, or a pixel design and keep the original safely editable.',
        image: fuji2d,
        alt: 'A colorful 2D image ready to be imported into Kromacut',
        imagePosition: '95% 50%',
        imageScale: 1.65,
        imageFit: 'cover',
    },
    {
        number: '02',
        title: 'Reduce & paint colors',
        description: 'Tune a compact palette manually or let Auto-paint match the filaments you actually own.',
        image: sliced,
        alt: 'A color-layered image preview showing separate printable colors',
        imagePosition: '50% 48%',
        imageScale: 1.08,
        imageFit: 'cover',
    },
    {
        number: '03',
        title: 'Preview every layer',
        description: 'Inspect the stack in 3D, check transitions, and see exactly where filament swaps happen.',
        image: fuji3d,
        alt: 'Kromacut 3D preview of a stacked color-layer print',
        imagePosition: '95% 50%',
        imageScale: 1.65,
        imageFit: 'cover',
    },
    {
        number: '04',
        title: 'Export and print',
        description: 'Download a slicer-ready STL or 3MF with the print plan you need to finish the job.',
        image: printed,
        alt: 'A finished colorful layered print made from a Kromacut workflow',
        imagePosition: '55% 50%',
        imageScale: 1,
        imageFit: 'contain',
    },
];

interface ShowcaseItem {
    alt: string;
    creator: string;
    dimensions?: string;
    href?: string;
    image: string;
    kind: string;
    note?: string;
    title: string;
}

const communityShowcase: ShowcaseItem[] = [
    {
        image: hobbitsAndDragonsOne,
        alt: 'A colorful Hobbits and Dragons layered 3D print',
        title: 'Hobbits and Dragons',
        kind: 'Finished print',
        creator: 'u/ominaex25',
        href: 'https://www.reddit.com/r/kromacut/comments/1vum7om/hobbits_and_dragons/',
    },
    {
        image: hobbitsAndDragonsTwo,
        alt: 'A second view of the Hobbits and Dragons layered 3D print',
        title: 'Hobbits and Dragons',
        kind: 'Finished print',
        creator: 'u/ominaex25',
        href: 'https://www.reddit.com/r/kromacut/comments/1vum7om/hobbits_and_dragons/',
    },
    {
        image: kingOfHeartsSlicer,
        alt: 'Slicer preview of the multicolor King of Hearts playing-card print',
        title: 'King of Hearts',
        kind: 'Slicer preview',
        creator: 'vycdev',
        dimensions: '47.72 \u00d7 66.53 \u00d7 3.2 mm',
    },
    {
        image: kingOfHearts,
        alt: 'A multicolor layered King of Hearts playing-card print',
        title: 'King of Hearts',
        kind: 'Finished print',
        creator: 'vycdev',
        dimensions: '47.72 \u00d7 66.53 \u00d7 3.2 mm',
    },
];

const hopeShowcase: ShowcaseItem[] = [
    {
        image: hopeKromacutPreview,
        alt: 'Kromacut Auto-paint prediction for a layered Hope poster print',
        title: 'Hope poster',
        kind: 'Kromacut prediction',
        creator: 'vycdev',
        dimensions: '72 \u00d7 108.4 \u00d7 3.04 mm',
        note: 'Auto-paint prediction using the available calibrated filament profile.',
    },
    {
        image: hopeSlicerPreview,
        alt: 'Slicer preview of the layered Hope poster print',
        title: 'Hope poster',
        kind: 'Slicer preview',
        creator: 'vycdev',
        dimensions: '72 \u00d7 108.4 \u00d7 3.04 mm',
        note: 'The physical layer plan prepared for printing without a red filament.',
    },
    {
        image: hopeFinished,
        alt: 'Finished layered Hope poster print showing orange and purple-blue color shifts',
        title: 'Hope poster',
        kind: 'Finished print',
        creator: 'vycdev',
        dimensions: '72 \u00d7 108.4 \u00d7 3.04 mm',
        note: 'Pale yellow matched most closely; red printed orange, cyan leaned purple-blue, and black reproduced the preview but missed the target\'s dark teal.',
    },
];

function ExternalArrow() {
    return <ArrowRight aria-hidden="true" className="h-4 w-4" />;
}

function ShowcaseCard({ item }: { item: ShowcaseItem }) {
    return (
        <article className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 shadow-md shadow-slate-200/60 dark:border-border dark:bg-background/70 dark:shadow-sm dark:shadow-black/20">
            <div className="aspect-[4/3] overflow-hidden bg-muted"><img src={item.image} alt={item.alt} loading="lazy" className="h-full w-full object-cover" /></div>
            <div className="flex flex-1 flex-col gap-4 border-t border-border/70 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold tracking-tight">{item.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">By <span className="font-semibold text-foreground">{item.creator}</span></p>
                    </div>
                    <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">{item.kind}</span>
                </div>
                {item.dimensions && <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Ruler aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />{item.dimensions}</p>}
                {item.note && <p className="text-sm leading-6 text-muted-foreground">{item.note}</p>}
                {item.href && (
                    <a href={item.href} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-700/20 transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                        View Reddit post <ExternalArrow />
                    </a>
                )}
            </div>
        </article>
    );
}

interface CommunityLinksProps {
    children?: React.ReactNode;
    className: string;
    labelClassName?: string;
    testId?: string;
}

function CommunityLinks({ children, className, labelClassName = 'sr-only', testId }: CommunityLinksProps) {
    const linkClassName = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

    return (
        <nav data-testid={testId} aria-label="Community links" className={className}>
            <a href={links.github} target="_blank" rel="noopener noreferrer" aria-label="Kromacut on GitHub" title="GitHub" className={linkClassName}>
                <Github aria-hidden="true" className="h-4 w-4" /><span className={labelClassName}>GitHub</span>
            </a>
            <a href={links.discord} target="_blank" rel="noopener noreferrer" aria-label="Join Kromacut on Discord" title="Discord" className={linkClassName}>
                <MessageCircle aria-hidden="true" className="h-4 w-4 text-indigo-400" /><span className={labelClassName}>Discord</span>
            </a>
            <a href={links.reddit} target="_blank" rel="noopener noreferrer" aria-label="r/kromacut on Reddit" title="Reddit" className={linkClassName}>
                <img src={redditIcon} alt="" className="h-4 w-4 dark:invert" /><span className={labelClassName}>Reddit</span>
            </a>
            <a href={links.patreon} target="_blank" rel="noopener noreferrer" aria-label="Support Kromacut on Patreon" title="Patreon" className={linkClassName}>
                <Heart aria-hidden="true" className="h-4 w-4 text-rose-400" /><span className={labelClassName}>Support</span>
            </a>
            {children}
        </nav>
    );
}

interface ThemePickerProps {
    onChange: (themeMode: ThemeMode) => void;
    themeMode: ThemeMode;
}

function ThemePicker({ onChange, themeMode }: ThemePickerProps) {
    const [open, setOpen] = React.useState(false);
    const ThemeIcon = themeMode === 'system' ? Monitor : themeMode === 'dark' ? Moon : Sun;
    const options: Array<{ icon: typeof Monitor; label: string; value: ThemeMode }> = [
        { icon: Monitor, label: 'System', value: 'system' },
        { icon: Moon, label: 'Dark', value: 'dark' },
        { icon: Sun, label: 'Light', value: 'light' },
    ];

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Theme: ${themeMode}`}
                    title="Change theme"
                    className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ThemeIcon aria-hidden="true" className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1.5">
                <div className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Theme</div>
                {options.map(({ icon: Icon, label, value }) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={themeMode === value}
                        onClick={() => {
                            onChange(value);
                            setOpen(false);
                        }}
                        className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${themeMode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    >
                        <Icon aria-hidden="true" className="h-4 w-4" />
                        {label}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}

export default function LandingPage() {
    const [themeMode, setThemeMode] = React.useState<ThemeMode>(() => getStoredThemeMode());

    React.useEffect(() => {
        applyThemeMode(themeMode);
        if (themeMode !== 'system') return;
        return subscribeToSystemTheme(applyResolvedTheme);
    }, [themeMode]);

    React.useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === THEME_STORAGE_KEY) setThemeMode(getStoredThemeMode());
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const setTheme = (nextThemeMode: ThemeMode) => {
        saveThemeMode(nextThemeMode);
        setThemeMode(nextThemeMode);
    };

    return (
        <main data-testid="landing-page" className="h-full overflow-x-hidden overflow-y-auto bg-[#f6f8fc] text-foreground dark:bg-background">
            <a
                href="#workflow"
                className="sr-only z-50 rounded-md bg-blue-700 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-700"
            >
                Skip to workflow
            </a>

            <div data-testid="landing-hero" className="relative isolate flex min-h-screen flex-col">
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full overflow-hidden">
                    <div className="absolute left-[8%] top-[-13rem] h-[34rem] w-[34rem] rounded-full bg-primary/20 blur-[100px]" />
                    <div className="absolute right-[-8rem] top-[8rem] h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/10 blur-[100px]" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(71,85,105,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(71,85,105,0.12)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:linear-gradient(to_bottom,black,transparent_88%)] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)]" />
                </div>

                <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/55 px-5 py-5 backdrop-blur-xl sm:gap-6 sm:px-8 lg:px-10 dark:border-transparent dark:bg-transparent">
                    <a href={APP_PATH} className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
                        <img src={logo} alt="" className="h-9 w-auto sm:h-10" />
                        <span className="hidden font-sans text-lg font-extrabold tracking-[0.12em] min-[390px]:inline">KROMACUT</span>
                    </a>
                    <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
                        <a href="#workflow" className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">How it works</a>
                        <a href={docsPath('overview')} className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Docs</a>
                        <a href={links.releases} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Releases</a>
                    </nav>
                    <CommunityLinks testId="landing-community-links" className="hidden items-center gap-1 lg:flex" labelClassName="hidden xl:inline">
                        <ThemePicker themeMode={themeMode} onChange={setTheme} />
                    </CommunityLinks>
                    <a
                        href={APP_PATH}
                        data-testid="landing-open-app"
                        className="group inline-flex min-h-11 items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-bold text-background shadow-lg shadow-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 sm:px-4"
                    >
                        Open Kromacut <ExternalArrow />
                    </a>
                    <div className="order-last w-full border-t border-border/70 pt-2 md:hidden">
                        <nav aria-label="Mobile navigation" className="flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground">
                            <a href="#workflow" className="inline-flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">How it works</a>
                            <a href={docsPath('overview')} className="inline-flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Docs</a>
                            <a href={links.releases} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Releases</a>
                        </nav>
                        <CommunityLinks testId="landing-mobile-community-links" className="mt-1 flex items-center justify-center gap-1 border-t border-border/50 pt-1">
                            <ThemePicker themeMode={themeMode} onChange={setTheme} />
                        </CommunityLinks>
                    </div>
                    <CommunityLinks testId="landing-tablet-community-links" className="order-last hidden w-full items-center justify-center gap-1 border-t border-border/70 pt-3 md:flex lg:hidden">
                        <ThemePicker themeMode={themeMode} onChange={setTheme} />
                    </CommunityLinks>
                </header>

                <section className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-14 px-5 pb-20 pt-12 sm:px-8 md:pb-28 md:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:px-10 lg:pt-24">
                    <div className="max-w-2xl">
                        <div className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                            <span aria-hidden="true" className="h-px w-8 bg-primary/70" />
                            Open source · browser first
                        </div>
                        <h1 className="max-w-2xl text-balance font-sans text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                            Turn pixels into <span className="bg-gradient-to-r from-blue-700 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent dark:from-primary dark:via-violet-400 dark:to-fuchsia-400">printable layers.</span>
                        </h1>
                        <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                            Kromacut transforms 2D images into stacked, color-layered 3D prints. Prepare your palette, match real filament, preview the result, and export a model ready for your slicer.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <a href={APP_PATH} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 font-bold text-white shadow-xl shadow-blue-700/20 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-safe:transition motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-reduce:transition-none">
                                Start creating <ExternalArrow />
                            </a>
                            <a href={docsPath('quick-start')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card/60 px-5 py-3 font-bold text-foreground transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
                                <BookOpen aria-hidden="true" className="h-4 w-4" /> Read the quick start
                            </a>
                        </div>
                        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
                            {['Free to use', 'Browser + desktop', 'STL + 3MF export'].map((item) => (
                                <span key={item} className="inline-flex items-center gap-2"><Check aria-hidden="true" className="h-4 w-4 text-emerald-400" />{item}</span>
                            ))}
                        </div>
                    </div>

                    <div className="relative mx-auto w-full max-w-2xl lg:ml-auto">
                        <div aria-hidden="true" className="absolute inset-0 rounded-[2rem] bg-primary/10 blur-3xl sm:-inset-8" />
                        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 p-2 shadow-2xl shadow-slate-300/60 backdrop-blur dark:border-white/10 dark:bg-card/80 dark:shadow-black/30">
                            <div className="flex items-center justify-between border-b border-border px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                <span>3D layer preview</span>
                                <span className="inline-flex items-center gap-1.5 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ready to print</span>
                            </div>
                            <div className="relative aspect-[1.22] overflow-hidden rounded-xl bg-black/20">
                                <img src={fuji3d} alt="Color-layered 3D print preview" className="h-full w-full object-cover object-[95%_center]" fetchPriority="high" />
                            </div>
                        </div>
                        <div className="absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-300/50 sm:flex dark:border-border dark:bg-card dark:shadow-black/30">
                            <div className="flex -space-x-1.5">{['#191d3d', '#5867d9', '#d64996', '#f5bd5a'].map((color) => <span key={color} className="h-7 w-7 rounded-full border-2 border-card" style={{ backgroundColor: color }} />)}</div>
                            <div><div className="text-xs font-bold">Palette mapped</div><div className="text-[11px] text-muted-foreground">4 printable colors</div></div>
                        </div>
                    </div>
                </section>
            </div>

            <section id="workflow" tabIndex={-1} className="scroll-mt-8 border-y border-slate-200/90 bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:border-border/70 dark:bg-card/30">
                <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">From image to object</p>
                        <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">A simple workflow, with serious control.</h2>
                        <p className="mt-5 text-lg leading-8 text-muted-foreground">Go from a flat image to a layered print without leaving your browser. Keep the creative decisions yours, while Kromacut handles the geometry and print planning.</p>
                    </div>
                    <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        {workflow.map((step) => (
                            <article key={step.number} className="group overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 shadow-md shadow-slate-200/60 transition-transform motion-safe:hover:-translate-y-1 motion-reduce:transition-none dark:border-border dark:bg-background/70 dark:shadow-sm dark:shadow-black/20">
                                <div className="aspect-[4/3] overflow-hidden border-b border-border bg-muted"><img src={step.image} alt={step.alt} loading="lazy" className={`h-full w-full ${step.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} style={{ objectPosition: step.imagePosition, transform: `scale(${step.imageScale})` }} /></div>
                                <div className="p-5"><div className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{step.number}</div><h3 className="mt-3 text-lg font-bold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p></div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
                <div className="relative grid grid-cols-2 items-center gap-3">
                    <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border shadow-xl"><img src={fuji2d} alt="Original 2D artwork" loading="lazy" className="h-full w-full object-cover object-[95%_50%]" style={{ transform: 'translateY(-2%) scale(1.55)' }} /></div>
                    <div className="aspect-[4/3] overflow-hidden rounded-xl border border-primary/40 bg-muted shadow-xl shadow-primary/10"><img src={printed} alt="Finished Kromacut print" loading="lazy" className="h-full w-full object-contain object-center" /></div>
                    <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background p-3 text-primary shadow-lg sm:block"><ArrowRight aria-hidden="true" className="h-5 w-5" /></div>
                </div>
                <div className="max-w-xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Built for real prints</p>
                    <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">Your filament. Your palette. Your model.</h2>
                    <p className="mt-5 text-lg leading-8 text-muted-foreground">Use manual slicing when you want pixel-level control, or let Auto-paint search for a color stack from your calibrated filament profile. Either way, inspect every layer before you export.</p>
                    <ul className="mt-7 space-y-3 text-sm text-foreground">
                        {['Non-destructive image adjustments', 'Three.js layer-by-layer 3D preview', 'Calibrated Auto-paint with deterministic search', 'Slicer-friendly STL and multi-material 3MF'].map((item) => <li key={item} className="flex items-start gap-3"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />{item}</li>)}
                    </ul>
                    <a href={APP_PATH} className="mt-9 inline-flex items-center gap-2 font-bold text-blue-700 underline decoration-blue-700/30 underline-offset-4 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300 dark:decoration-blue-300/30">Open the tool <ExternalArrow /></a>
                </div>
            </section>

            <section data-testid="community-showcase" className="border-y border-slate-200/90 bg-white/65 dark:border-border/70 dark:bg-card/30">
                <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">Community showcase</p>
                        <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">Made by the Kromacut community.</h2>
                        <p className="mt-5 text-lg leading-8 text-muted-foreground">Finished prints and behind-the-scenes previews from people creating with Kromacut.</p>
                    </div>
                    <div data-testid="community-gallery" className="mt-10 grid gap-5 sm:grid-cols-2">
                        {communityShowcase.map((item) => <ShowcaseCard key={item.image} item={item} />)}
                    </div>
                    <div data-testid="hope-showcase" className="mt-14 border-t border-border/70 pt-10">
                        <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-3">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Prediction vs. print</p>
                                <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">1 of 4 target colors close</span>
                            </div>
                            <h3 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">Hope poster field test</h3>
                            <p className="mt-4 text-base leading-7 text-muted-foreground">With no red filament available, Auto-paint predicted red from orange over pink. The print stayed orange, while the predicted cyan shifted toward purple-blue. Pale yellow was the closest match. The printed black followed the preview, but both missed the original image&apos;s very dark teal-blue target. Limited calibration coverage and a permissive color-error limit may both have contributed.</p>
                        </div>
                        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {hopeShowcase.map((item) => <ShowcaseCard key={item.image} item={item} />)}
                        </div>
                    </div>
                    <div className="mt-8 flex flex-col gap-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <div>
                            <p className="font-bold">Want to showcase your work or contribute to Kromacut?</p>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">Share what you made, improve the project, or help the community discover what Kromacut can do.</p>
                        </div>
                        <a href={`${links.github}/pulls`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto">
                            <Github aria-hidden="true" className="h-4 w-4" /> Open a pull request <ExternalArrow />
                        </a>
                    </div>
                </div>
            </section>

            <section className="border-t border-slate-200/90 bg-slate-100/80 dark:border-border/70 dark:bg-muted/20">
                <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center lg:px-10">
                    <div><p className="text-2xl font-extrabold tracking-tight sm:text-3xl">Ready to make a flat image physical?</p><p className="mt-2 text-muted-foreground">Start with an image. Finish with a print.</p></div>
                    <div className="flex flex-wrap gap-3"><a href={APP_PATH} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 font-bold text-white shadow-lg shadow-blue-700/20 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none">Open Kromacut <ExternalArrow /></a><a href={links.releases} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 font-bold transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Download aria-hidden="true" className="h-4 w-4" /> Desktop releases</a></div>
                </div>
            </section>

            <footer className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-10">
                <div><a href={APP_PATH} className="inline-flex items-center gap-3 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={logo} alt="" className="h-8 w-auto" /> Kromacut</a><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Open-source tools for turning images into color-layered 3D prints.</p></div>
                <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:justify-end sm:gap-x-6">
                    <a href={docsPath('overview')} className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><BookOpen aria-hidden="true" className="h-4 w-4" /> Docs</a>
                    <a href={links.releases} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Download aria-hidden="true" className="h-4 w-4" /> Releases</a>
                    <a href={links.github} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Github aria-hidden="true" className="h-4 w-4" /> GitHub</a>
                    <a href={links.discord} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MessageCircle aria-hidden="true" className="h-4 w-4" /> Discord</a>
                    <a href={links.patreon} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Heart aria-hidden="true" className="h-4 w-4" /> Support Kromacut</a>
                </nav>
            </footer>
            <div className="sr-only"><ChevronDown aria-hidden="true" /><Play aria-hidden="true" /></div>
        </main>
    );
}
