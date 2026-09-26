import { Trans, useTranslation } from 'react-i18next';
import {
    ArrowRight,
    BookOpen,
    Check,
    ChevronDown,
    Download,
    FileText,
    Github,
    Heart,
    MessageCircle,
    Monitor,
    Moon,
    Play,
    Ruler,
    ShieldCheck,
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
import titanKromacutPreview from '../../content/community/titan-kromacut-preview.png';
import titanSlicerPreview from '../../content/community/titan-slicer-preview.png';
import titanFinished from '../../content/community/titan-finished.jpg';
import batmangaKromacutPreview from '../../content/community/batmanga-kromacut-preview.png';
import batmangaSlicerPreview from '../../content/community/batmanga-slicer-preview.png';
import batmangaFinished from '../../content/community/batmanga-finished.jpg';
import narutoKromacutPreview from '../../content/community/naruto-kromacut-preview.png';
import narutoSlicerPreview from '../../content/community/naruto-slicer-preview.png';
import narutoFinished from '../../content/community/naruto-finished.jpg';
import redditIcon from '../assets/reddit.svg';
import { APP_PATH, docsPath, publicPath } from '@/lib/routes';
import LanguageSetting from './LanguageSetting';
import { useStickyMobileCta } from '@/hooks/useStickyMobileCta';
import './landing-mobile-cta.css';
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
        title: 'landing.importAnImage',
        description: 'landing.dropInArtworkAPhotoOrAPixelDesignAnd',
        image: fuji2d,
        alt: 'landing.aColorful2DImageReadyToBeImportedIntoKromacut',
        imagePosition: '95% 50%',
        imageScale: 1.65,
        imageFit: 'cover',
    },
    {
        number: '02',
        title: 'landing.reducePaintColors',
        description: 'landing.tuneACompactPaletteManuallyOrLetAutoPaintMatch',
        image: sliced,
        alt: 'landing.aColorLayeredImagePreviewShowingSeparatePrintableColors',
        imagePosition: '50% 48%',
        imageScale: 1.08,
        imageFit: 'cover',
    },
    {
        number: '03',
        title: 'landing.previewEveryLayer',
        description: 'landing.inspectTheStackIn3DCheckTransitionsAndSeeExactly',
        image: fuji3d,
        alt: 'landing.kromacut3DPreviewOfAStackedColorLayerPrint',
        imagePosition: '95% 50%',
        imageScale: 1.65,
        imageFit: 'cover',
    },
    {
        number: '04',
        title: 'landing.exportAndPrint',
        description: 'landing.downloadASlicerReadySTLOr3MFWithThePrint',
        image: printed,
        alt: 'landing.aFinishedColorfulLayeredPrintMadeFromAKromacutWorkflow',
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
    artwork?: { label: string; href: string };
    kind: string;
    note?: string;
    title: string;
}

const communityShowcase: ShowcaseItem[] = [
    {
        image: hobbitsAndDragonsOne,
        alt: 'landing.aColorfulHobbitsAndDragonsLayered3DPrint',
        title: 'Hobbits and Dragons',
        kind: 'landing.finishedPrint',
        creator: 'u/ominaex25',
        href: 'https://www.reddit.com/r/kromacut/comments/1vum7om/hobbits_and_dragons/',
    },
    {
        image: hobbitsAndDragonsTwo,
        alt: 'landing.aSecondViewOfTheHobbitsAndDragonsLayered3D',
        title: 'Hobbits and Dragons',
        kind: 'landing.finishedPrint',
        creator: 'u/ominaex25',
        href: 'https://www.reddit.com/r/kromacut/comments/1vum7om/hobbits_and_dragons/',
    },
    {
        image: kingOfHeartsSlicer,
        alt: 'landing.slicerPreviewOfTheMulticolorKingOfHeartsPlayingCard',
        title: 'King of Hearts',
        kind: 'landing.slicerPreview',
        creator: 'vycdev',
        dimensions: '47.72 \u00d7 66.53 \u00d7 3.2 mm',
    },
    {
        image: kingOfHearts,
        alt: 'landing.aMulticolorLayeredKingOfHeartsPlayingCardPrint',
        title: 'King of Hearts',
        kind: 'landing.finishedPrint',
        creator: 'vycdev',
        dimensions: '47.72 \u00d7 66.53 \u00d7 3.2 mm',
    },
];

const hopeShowcase: ShowcaseItem[] = [
    {
        image: hopeKromacutPreview,
        alt: 'landing.kromacutAutoPaintPredictionForALayeredHopePosterPrint',
        title: 'Hope poster',
        kind: 'landing.kromacutPrediction',
        creator: 'vycdev',
        dimensions: '72 \u00d7 108.4 \u00d7 3.04 mm',
        note: 'landing.autoPaintPredictionUsingTheAvailableCalibratedFilamentProfile',
    },
    {
        image: hopeSlicerPreview,
        alt: 'landing.slicerPreviewOfTheLayeredHopePosterPrint',
        title: 'Hope poster',
        kind: 'landing.slicerPreview',
        creator: 'vycdev',
        dimensions: '72 \u00d7 108.4 \u00d7 3.04 mm',
        note: 'landing.thePhysicalLayerPlanPreparedForPrintingWithoutARed',
    },
    {
        image: hopeFinished,
        alt: 'landing.finishedLayeredHopePosterPrintShowingOrangeAndPurpleBlue',
        title: 'Hope poster',
        kind: 'landing.finishedPrint',
        creator: 'vycdev',
        dimensions: '72 \u00d7 108.4 \u00d7 3.04 mm',
        note: 'landing.paleYellowMatchedMostCloselyRedPrintedOrangeCyanLeaned',
    },
];

const titanShowcase: ShowcaseItem[] = [
    {
        image: titanKromacutPreview,
        alt: 'landing.kromacutAutoPaintPredictionForTheGoldenWavesOfThe',
        title: 'Titan poster',
        kind: 'landing.kromacutPrediction',
        creator: 'vycdev',
        dimensions: 'landing.text10241527MmFootprint',
        note: 'landing.autoPaintWithTheEightColorCalibratedFilamentProfile',
    },
    {
        image: titanSlicerPreview,
        alt: 'landing.crealityPrintSlicerPreviewOfTheTitanPosterWithIts',
        title: 'Titan poster',
        kind: 'landing.slicerPreview',
        creator: 'vycdev',
        note: 'landing.crealityHi04MmNozzleAnd008Mm',
    },
    {
        image: titanFinished,
        alt: 'landing.finishedTitanLayeredPrintWithGoldenYellowAndOrangeWave',
        title: 'Titan poster',
        kind: 'landing.finishedPrint',
        creator: 'vycdev',
        note: 'landing.theCompletedPrintPhotographedByItsMakerLightingAndCamera',
        artwork: {
            label: 'NASA/JPL — Titan, Visions of the Future',
            href: 'https://www.jpl.nasa.gov/images/titan-jpl-travel-poster/',
        },
    },
];

const batmangaShowcase: ShowcaseItem[] = [
    {
        image: batmangaKromacutPreview,
        alt: 'landing.kromacutAutoPaintPredictionOfTheBatmanJiroKuwataBatmanga',
        title: 'Batman: The Jiro Kuwata Batmanga',
        kind: 'landing.kromacutPrediction',
        creator: 'vycdev',
        dimensions: 'landing.text6581000MmFootprint',
        note: 'landing.autoPaintWithDeepOptimizationEnhancedMatchingAndPreserveColor',
    },
    {
        image: batmangaSlicerPreview,
        alt: 'landing.crealityPrintSlicerPreviewOfTheBatmangaCoverAndFilament',
        title: 'Batman: The Jiro Kuwata Batmanga',
        kind: 'landing.slicerPreview',
        creator: 'vycdev',
        note: 'landing.crealityHi04MmNozzleAnd008Mm2',
    },
    {
        image: batmangaFinished,
        alt: 'landing.finishedBatmangaLayeredPrintWithAYellowJapaneseTitleTan',
        title: 'Batman: The Jiro Kuwata Batmanga',
        kind: 'landing.finishedPrint',
        creator: 'vycdev',
        note: 'landing.theCompletedPrintPhotographedByItsMakerTheLargeTitle',
        artwork: {
            label: 'Jiro Kuwata / DC — Batman: The Jiro Kuwata Batmanga, Book 1',
            href: 'https://m.media-amazon.com/images/I/81rOZq5ZgqL._AC_UF1000,1000_QL80_.jpg',
        },
    },
];

const narutoShowcase: ShowcaseItem[] = [
    {
        image: narutoKromacutPreview,
        alt: 'landing.kromacutAutoPaintPredictionOfNarutoLookingUpAtA',
        title: 'Naruto',
        kind: 'landing.kromacutPrediction',
        creator: 'vycdev',
        dimensions: 'landing.text11041902MmFootprint',
        note: 'landing.autoPaintWithTheEightColorCalibratedFilamentProfile0',
    },
    {
        image: narutoSlicerPreview,
        alt: 'landing.crealityPrintSlicerPreviewOfTheNarutoPrintWithSeven',
        title: 'Naruto',
        kind: 'landing.slicerPreview',
        creator: 'vycdev',
        note: 'landing.crealityHi04MmNozzleAnd008Mm3',
    },
    {
        image: narutoFinished,
        alt: 'landing.finishedNarutoLayeredPrintWithYellowHairOrangeClothingAnd',
        title: 'Naruto',
        kind: 'landing.finishedPrint',
        creator: 'vycdev',
        note: 'landing.theCompletedOvernightPrintPhotographedByItsMakerLightingAnd',
        artwork: { label: 'Naruto', href: 'https://in.pinterest.com/pin/169870217190172931/' },
    },
];

const showcaseGroups = [
    ...communityShowcase,
    ...titanShowcase,
    ...hopeShowcase,
    ...batmangaShowcase,
    ...narutoShowcase,
].reduce<ShowcaseItem[][]>((groups, item) => {
    const group = groups.find((entries) => entries[0].title === item.title);
    if (group) group.push(item);
    else groups.push([item]);
    return groups;
}, []);

function ExternalArrow() {
    return <ArrowRight aria-hidden="true" className="h-4 w-4" />;
}

function ShowcaseCard({ items }: { items: ShowcaseItem[] }) {
    const { t } = useTranslation('public');
    const project = items[0];
    const artwork = items.find((item) => item.artwork)?.artwork;
    const sourceLinkClassName =
        'inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-blue-700 underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300';
    return (
        <article className="overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 shadow-md shadow-slate-200/60 dark:border-border dark:bg-background/70 dark:shadow-sm dark:shadow-black/20">
            <header className="flex flex-col gap-4 border-b border-border/70 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">{project.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            <Trans
                                t={t}
                                i18nKey="landing.creator"
                                values={{ creator: project.creator }}
                                components={{
                                    name: <span className="font-semibold text-foreground" />,
                                }}
                            />
                        </p>
                    </div>
                    <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
                        {t('landing.photos', { count: items.length })}
                    </span>
                </div>
                {project.dimensions && (
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Ruler
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300"
                        />
                        {project.dimensions.startsWith('landing.')
                            ? t(project.dimensions)
                            : project.dimensions}
                    </p>
                )}
            </header>
            <div
                className={`grid gap-6 p-5 sm:grid-cols-2 sm:p-6 ${items.length > 2 ? 'lg:grid-cols-3' : ''}`}
            >
                {items.map((item, index) => (
                    <figure key={item.image} className="min-w-0">
                        <a
                            href={item.image}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('landing.openPhoto', {
                                title: item.title,
                                kind: t(item.kind),
                                index: index + 1,
                            })}
                            className="block h-72 overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-80"
                        >
                            <img
                                src={item.image}
                                alt={t(item.alt)}
                                loading="lazy"
                                className="h-full w-full object-contain"
                            />
                        </a>
                        <figcaption className="mt-4 space-y-3">
                            <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                                {t(item.kind)}
                            </p>
                            {item.note && (
                                <p className="text-sm leading-6 text-muted-foreground">
                                    {t(item.note)}
                                </p>
                            )}
                        </figcaption>
                    </figure>
                ))}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/70 px-5 py-3 text-sm text-muted-foreground sm:px-6">
                <p>{t('landing.openAnyPhotoAtFullSize')}</p>
                {project.href && (
                    <a
                        href={project.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={sourceLinkClassName}
                    >
                        {t('landing.viewRedditPost')}
                        <ExternalArrow />
                    </a>
                )}
                {artwork && (
                    <p>
                        <Trans
                            t={t}
                            i18nKey="landing.originalArtwork"
                            values={{ title: artwork.label }}
                            components={{
                                source: (
                                    <a
                                        href={artwork.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={sourceLinkClassName}
                                    />
                                ),
                            }}
                        />
                    </p>
                )}
            </footer>
        </article>
    );
}

interface CommunityLinksProps {
    children?: React.ReactNode;
    className: string;
    labelClassName?: string;
    testId?: string;
}

function CommunityLinks({
    children,
    className,
    labelClassName = 'sr-only',
    testId,
}: CommunityLinksProps) {
    const { t } = useTranslation('public');
    const linkClassName =
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

    return (
        <nav data-testid={testId} aria-label={t('landing.communityLinks')} className={className}>
            <a
                href={links.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('landing.kromacutOnGitHub')}
                title="GitHub"
                className={linkClassName}
            >
                <Github aria-hidden="true" className="h-4 w-4" />
                <span className={labelClassName}>GitHub</span>
            </a>
            <a
                href={links.discord}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('landing.joinKromacutOnDiscord')}
                title="Discord"
                className={linkClassName}
            >
                <MessageCircle aria-hidden="true" className="h-4 w-4 text-indigo-400" />
                <span className={labelClassName}>Discord</span>
            </a>
            <a
                href={links.reddit}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('landing.rKromacutOnReddit')}
                title="Reddit"
                className={linkClassName}
            >
                <img src={redditIcon} alt="" className="h-4 w-4 dark:invert" />
                <span className={labelClassName}>Reddit</span>
            </a>
            <a
                href={links.patreon}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('landing.supportKromacutOnPatreon')}
                title="Patreon"
                className={linkClassName}
            >
                <Heart aria-hidden="true" className="h-4 w-4 text-rose-400" />
                <span className={labelClassName}>{t('landing.support')}</span>
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
    const { t } = useTranslation('public');
    const [open, setOpen] = React.useState(false);
    const ThemeIcon = themeMode === 'system' ? Monitor : themeMode === 'dark' ? Moon : Sun;
    const options: Array<{ icon: typeof Monitor; label: string; value: ThemeMode }> = [
        { icon: Monitor, label: t('landing.system'), value: 'system' },
        { icon: Moon, label: t('landing.dark'), value: 'dark' },
        { icon: Sun, label: t('landing.light'), value: 'light' },
    ];

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={t('landing.themeLabel', { theme: t(`landing.${themeMode}`) })}
                    title={t('landing.changeTheme')}
                    className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ThemeIcon aria-hidden="true" className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1.5">
                <div className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t('landing.theme')}
                </div>
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
    const { t } = useTranslation('public');
    const [themeMode, setThemeMode] = React.useState<ThemeMode>(() => getStoredThemeMode());
    const scrollRootRef = React.useRef<HTMLElement>(null);
    const originalActionRef = React.useRef<HTMLAnchorElement>(null);
    const showStickyCta = useStickyMobileCta(scrollRootRef, originalActionRef);

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
        <main
            ref={scrollRootRef}
            data-testid="landing-page"
            className="landing-page h-full overflow-x-hidden overflow-y-auto bg-[#f6f8fc] text-foreground dark:bg-background"
        >
            <a
                href="#workflow"
                className="sr-only z-50 rounded-md bg-blue-700 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-700"
            >
                {t('landing.skipToWorkflow')}
            </a>

            <div data-testid="landing-hero" className="relative isolate flex min-h-screen flex-col">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full overflow-hidden"
                >
                    <div className="absolute left-[8%] top-[-13rem] h-[34rem] w-[34rem] rounded-full bg-primary/20 blur-[100px]" />
                    <div className="absolute right-[-8rem] top-[8rem] h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/10 blur-[100px]" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(71,85,105,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(71,85,105,0.12)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:linear-gradient(to_bottom,black,transparent_88%)] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)]" />
                </div>

                <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/55 px-5 py-5 backdrop-blur-xl sm:gap-6 sm:px-8 lg:px-10 dark:border-transparent dark:bg-transparent">
                    <a
                        href={APP_PATH}
                        className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                    >
                        <img src={logo} alt="" className="h-9 w-auto sm:h-10" />
                        <span className="hidden font-sans text-lg font-extrabold tracking-[0.12em] min-[390px]:inline">
                            KROMACUT
                        </span>
                    </a>
                    <nav
                        aria-label={t('landing.mainNavigation')}
                        className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex"
                    >
                        <a
                            href="#workflow"
                            className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {t('landing.howItWorks')}
                        </a>
                        <a
                            href={docsPath('overview')}
                            className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {t('landing.docs')}
                        </a>
                        <a
                            href={links.releases}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {t('landing.releases')}
                        </a>
                    </nav>
                    <CommunityLinks
                        testId="landing-community-links"
                        className="hidden items-center gap-1 lg:flex"
                        labelClassName="hidden xl:inline"
                    >
                        <ThemePicker themeMode={themeMode} onChange={setTheme} />
                    </CommunityLinks>
                    <a
                        href={APP_PATH}
                        data-testid="landing-open-app"
                        ref={originalActionRef}
                        className="group inline-flex min-h-11 items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-bold text-background shadow-lg shadow-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 sm:px-4"
                    >
                        {t('landing.openKromacut')}
                        <ExternalArrow />
                    </a>
                    <div className="order-last w-full border-t border-border/70 pt-2 md:hidden">
                        <nav
                            aria-label={t('landing.mobileNavigation')}
                            className="flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground"
                        >
                            <a
                                href="#workflow"
                                className="inline-flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {t('landing.howItWorks')}
                            </a>
                            <a
                                href={docsPath('overview')}
                                className="inline-flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {t('landing.docs')}
                            </a>
                            <a
                                href={links.releases}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {t('landing.releases')}
                            </a>
                        </nav>
                        <CommunityLinks
                            testId="landing-mobile-community-links"
                            className="mt-1 flex items-center justify-center gap-1 border-t border-border/50 pt-1"
                        >
                            <ThemePicker themeMode={themeMode} onChange={setTheme} />
                        </CommunityLinks>
                    </div>
                    <CommunityLinks
                        testId="landing-tablet-community-links"
                        className="order-last hidden w-full items-center justify-center gap-1 border-t border-border/70 pt-3 md:flex lg:hidden"
                    >
                        <ThemePicker themeMode={themeMode} onChange={setTheme} />
                    </CommunityLinks>
                </header>

                <section className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-14 px-5 pb-20 pt-12 sm:px-8 md:pb-28 md:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:px-10 lg:pt-24">
                    <div className="max-w-2xl">
                        <div className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                            <span aria-hidden="true" className="h-px w-8 bg-primary/70" />
                            {t('landing.openSourceBrowserFirst')}
                        </div>
                        <h1 className="max-w-2xl text-balance font-sans text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                            <Trans
                                t={t}
                                i18nKey="landing.heroTitle"
                                components={{
                                    accent: (
                                        <span className="bg-gradient-to-r from-blue-700 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent dark:from-primary dark:via-violet-400 dark:to-fuchsia-400" />
                                    ),
                                }}
                            />
                        </h1>
                        <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                            {t('landing.kromacutTransforms2DImagesIntoStackedColorLayered3DPrints')}
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <a
                                href={APP_PATH}
                                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 font-bold text-white shadow-xl shadow-blue-700/20 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background motion-safe:transition motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-reduce:transition-none"
                            >
                                {t('landing.startCreating')}
                                <ExternalArrow />
                            </a>
                            <a
                                href={docsPath('quick-start')}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card/60 px-5 py-3 font-bold text-foreground transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                            >
                                <BookOpen aria-hidden="true" className="h-4 w-4" />
                                {t('landing.readTheQuickStart')}
                            </a>
                        </div>
                        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
                            {[
                                t('landing.freeToUse'),
                                t('landing.browserDesktop'),
                                t('landing.sTL3MFExport'),
                            ].map((item) => (
                                <span key={item} className="inline-flex items-center gap-2">
                                    <Check
                                        aria-hidden="true"
                                        className="h-4 w-4 text-emerald-400"
                                    />
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="relative mx-auto w-full max-w-2xl lg:ml-auto">
                        <div
                            aria-hidden="true"
                            className="absolute inset-0 rounded-[2rem] bg-primary/10 blur-3xl sm:-inset-8"
                        />
                        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 p-2 shadow-2xl shadow-slate-300/60 backdrop-blur dark:border-white/10 dark:bg-card/80 dark:shadow-black/30">
                            <div className="flex items-center justify-between border-b border-border px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                <span>{t('landing.text3DLayerPreview')}</span>
                                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    {t('landing.readyToPrint')}
                                </span>
                            </div>
                            <div className="relative aspect-[1.22] overflow-hidden rounded-xl bg-black/20">
                                <img
                                    src={fuji3d}
                                    alt={t('landing.colorLayered3DPrintPreview')}
                                    className="h-full w-full object-cover object-[95%_center]"
                                    fetchPriority="high"
                                />
                            </div>
                        </div>
                        <div className="absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-300/50 sm:flex dark:border-border dark:bg-card dark:shadow-black/30">
                            <div className="flex -space-x-1.5">
                                {['#191d3d', '#5867d9', '#d64996', '#f5bd5a'].map((color) => (
                                    <span
                                        key={color}
                                        className="h-7 w-7 rounded-full border-2 border-card"
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <div>
                                <div className="text-xs font-bold">
                                    {t('landing.paletteMapped')}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    {t('landing.text4PrintableColors')}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <section
                id="workflow"
                tabIndex={-1}
                className="scroll-mt-8 border-y border-slate-200/90 bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:border-border/70 dark:bg-card/30"
            >
                <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">
                            {t('landing.fromImageToObject')}
                        </p>
                        <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
                            {t('landing.aSimpleWorkflowWithSeriousControl')}
                        </h2>
                        <p className="mt-5 text-lg leading-8 text-muted-foreground">
                            {t('landing.goFromAFlatImageToALayeredPrintWithout')}
                        </p>
                    </div>
                    <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        {workflow.map((step) => (
                            <article
                                key={step.number}
                                className="group overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 shadow-md shadow-slate-200/60 transition-transform motion-safe:hover:-translate-y-1 motion-reduce:transition-none dark:border-border dark:bg-background/70 dark:shadow-sm dark:shadow-black/20"
                            >
                                <div className="aspect-[4/3] overflow-hidden border-b border-border bg-muted">
                                    <img
                                        src={step.image}
                                        alt={t(step.alt)}
                                        loading="lazy"
                                        className={`h-full w-full ${step.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`}
                                        style={{
                                            objectPosition: step.imagePosition,
                                            transform: `scale(${step.imageScale})`,
                                        }}
                                    />
                                </div>
                                <div className="p-5">
                                    <div className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">
                                        {step.number}
                                    </div>
                                    <h3 className="mt-3 text-lg font-bold">{t(step.title)}</h3>
                                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                        {t(step.description)}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
                <div className="relative grid grid-cols-2 items-center gap-3">
                    <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border shadow-xl">
                        <img
                            src={fuji2d}
                            alt={t('landing.original2DArtwork')}
                            loading="lazy"
                            className="h-full w-full object-cover object-[95%_50%]"
                            style={{ transform: 'translateY(-2%) scale(1.55)' }}
                        />
                    </div>
                    <div className="aspect-[4/3] overflow-hidden rounded-xl border border-primary/40 bg-muted shadow-xl shadow-primary/10">
                        <img
                            src={printed}
                            alt={t('landing.finishedKromacutPrint')}
                            loading="lazy"
                            className="h-full w-full object-contain object-center"
                        />
                    </div>
                    <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background p-3 text-primary shadow-lg sm:block">
                        <ArrowRight aria-hidden="true" className="h-5 w-5" />
                    </div>
                </div>
                <div className="max-w-xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">
                        {t('landing.builtForRealPrints')}
                    </p>
                    <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
                        {t('landing.yourFilamentYourPaletteYourModel')}
                    </h2>
                    <p className="mt-5 text-lg leading-8 text-muted-foreground">
                        {t('landing.useManualSlicingWhenYouWantPixelLevelControlOr')}
                    </p>
                    <ul className="mt-7 space-y-3 text-sm text-foreground">
                        {[
                            t('landing.nonDestructiveImageAdjustments'),
                            t('landing.threeJsLayerByLayer3DPreview'),
                            t('landing.calibratedAutoPaintWithDeterministicSearch'),
                            t('landing.slicerFriendlySTLAndMultiMaterial3MF'),
                        ].map((item) => (
                            <li key={item} className="flex items-start gap-3">
                                <Check
                                    aria-hidden="true"
                                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400"
                                />
                                {item}
                            </li>
                        ))}
                    </ul>
                    <a
                        href={APP_PATH}
                        className="mt-9 inline-flex items-center gap-2 font-bold text-blue-700 underline decoration-blue-700/30 underline-offset-4 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300 dark:decoration-blue-300/30"
                    >
                        {t('landing.openTheTool')}
                        <ExternalArrow />
                    </a>
                </div>
            </section>

            <section
                data-testid="community-showcase"
                className="border-y border-slate-200/90 bg-white/65 dark:border-border/70 dark:bg-card/30"
            >
                <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">
                            {t('landing.communityShowcase')}
                        </p>
                        <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
                            {t('landing.madeByTheKromacutCommunity')}
                        </h2>
                        <p className="mt-5 text-lg leading-8 text-muted-foreground">
                            {t(
                                'landing.finishedPrintsAndBehindTheScenesPreviewsFromPeopleCreating'
                            )}
                        </p>
                    </div>
                    <div data-testid="community-gallery" className="mt-10 grid grid-cols-1 gap-8">
                        {showcaseGroups.map((items) => (
                            <ShowcaseCard key={items[0].title} items={items} />
                        ))}
                    </div>
                    <div className="mt-8 flex flex-col gap-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <div>
                            <p className="font-bold">
                                {t('landing.wantToShowcaseYourWorkOrContributeToKromacut')}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                {t('landing.shareWhatYouMadeImproveTheProjectOrHelpThe')}
                            </p>
                        </div>
                        <a
                            href={`${links.github}/pulls`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
                        >
                            <Github aria-hidden="true" className="h-4 w-4" />
                            {t('landing.openAPullRequest')}
                            <ExternalArrow />
                        </a>
                    </div>
                </div>
            </section>

            <section className="border-t border-slate-200/90 bg-slate-100/80 dark:border-border/70 dark:bg-muted/20">
                <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center lg:px-10">
                    <div>
                        <p className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                            {t('landing.readyToMakeAFlatImagePhysical')}
                        </p>
                        <p className="mt-2 text-muted-foreground">
                            {t('landing.startWithAnImageFinishWithAPrint')}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <a
                            href={APP_PATH}
                            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 font-bold text-white shadow-lg shadow-blue-700/20 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none"
                        >
                            {t('landing.openKromacut')}
                            <ExternalArrow />
                        </a>
                        <a
                            href={links.releases}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 font-bold transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Download aria-hidden="true" className="h-4 w-4" />
                            {t('landing.desktopReleases')}
                        </a>
                    </div>
                </div>
            </section>

            <footer className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-x-12 lg:px-10">
                <div>
                    <a
                        href={APP_PATH}
                        className="inline-flex min-h-11 items-center gap-3 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <img src={logo} alt="" className="h-8 w-auto" /> Kromacut
                    </a>
                    <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                        {t('landing.openSourceToolsForTurningImagesIntoColorLayered3D')}
                    </p>
                </div>
                <nav
                    aria-label={t('landing.footerNavigation')}
                    className="flex min-w-0 flex-col gap-3 text-sm text-muted-foreground"
                >
                    <div
                        data-testid="landing-footer-community"
                        className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:justify-end"
                    >
                        <a
                            href={docsPath('overview')}
                            className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <BookOpen aria-hidden="true" className="h-4 w-4" />
                            {t('landing.docs')}
                        </a>
                        <a
                            href={links.releases}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Download aria-hidden="true" className="h-4 w-4" />
                            {t('landing.releases')}
                        </a>
                        <a
                            href={links.github}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Github aria-hidden="true" className="h-4 w-4" /> GitHub
                        </a>
                        <a
                            href={links.discord}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <MessageCircle aria-hidden="true" className="h-4 w-4" /> Discord
                        </a>
                        <a
                            href={links.patreon}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Heart aria-hidden="true" className="h-4 w-4" />
                            {t('landing.supportKromacut')}
                        </a>
                    </div>
                    <div
                        data-testid="landing-footer-utility"
                        className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:justify-end"
                    >
                        <a
                            href={publicPath('/privacy')}
                            data-testid="landing-privacy-link"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                            {t('landing.privacy')}
                        </a>
                        <a
                            href={publicPath('/terms')}
                            data-testid="landing-terms-link"
                            className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 transition-colors motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <FileText aria-hidden="true" className="h-4 w-4" />
                            {t('landing.terms')}
                        </a>
                        <LanguageSetting compact />
                    </div>
                </nav>
            </footer>
            {showStickyCta && (
                <div
                    data-testid="landing-sticky-cta"
                    className="landing-mobile-cta fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md md:hidden"
                >
                    <a
                        href={APP_PATH}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                        {t('landing.openKromacut')}
                        <ExternalArrow />
                    </a>
                </div>
            )}
            <div className="sr-only">
                <ChevronDown aria-hidden="true" />
                <Play aria-hidden="true" />
            </div>
        </main>
    );
}
