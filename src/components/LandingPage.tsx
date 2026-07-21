import {
    ArrowRight,
    BookOpen,
    Check,
    ChevronDown,
    Download,
    Github,
    Heart,
    MessageCircle,
    Play,
    Sparkles,
} from 'lucide-react';
import logo from '../assets/logo.png';
import fuji2d from '../../content/fuji2d_new.png';
import fuji3d from '../../content/fuji3d_new.png';
import sliced from '../../content/fuji3dsliced.png';
import printed from '../../content/printed.jpg';
import { APP_PATH } from '@/lib/routes';

const links = {
    releases: 'https://github.com/vycdev/Kromacut/releases',
    github: 'https://github.com/vycdev/Kromacut',
    discord: 'https://discord.gg/nU63sFMcnX',
    patreon: 'https://www.patreon.com/cw/vycdev',
};

const workflow = [
    {
        number: '01',
        title: 'Import an image',
        description: 'Drop in artwork, a photo, or a pixel design and keep the original safely editable.',
        image: fuji2d,
        alt: 'A colorful 2D image ready to be imported into Kromacut',
    },
    {
        number: '02',
        title: 'Reduce & paint colors',
        description: 'Tune a compact palette manually or let Auto-paint match the filaments you actually own.',
        image: sliced,
        alt: 'A color-layered image preview showing separate printable colors',
    },
    {
        number: '03',
        title: 'Preview every layer',
        description: 'Inspect the stack in 3D, check transitions, and see exactly where filament swaps happen.',
        image: fuji3d,
        alt: 'Kromacut 3D preview of a stacked color-layer print',
    },
    {
        number: '04',
        title: 'Export and print',
        description: 'Download a slicer-ready STL or 3MF with the print plan you need to finish the job.',
        image: printed,
        alt: 'A finished colorful layered print made from a Kromacut workflow',
    },
];

function ExternalArrow() {
    return <ArrowRight aria-hidden="true" className="h-4 w-4" />;
}

export default function LandingPage() {
    return (
        <main data-testid="landing-page" className="min-h-screen overflow-hidden bg-background text-foreground">
            <a
                href="#workflow"
                className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
                Skip to workflow
            </a>

            <div className="relative isolate">
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] overflow-hidden">
                    <div className="absolute left-[8%] top-[-13rem] h-[34rem] w-[34rem] rounded-full bg-primary/20 blur-[100px]" />
                    <div className="absolute right-[-8rem] top-[8rem] h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/10 blur-[100px]" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
                </div>

                <header className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-5 sm:px-8 lg:px-10">
                    <a href={APP_PATH} className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
                        <img src={logo} alt="Kromacut" className="h-10 w-auto" />
                        <span className="font-sans text-lg font-extrabold tracking-[0.12em]">KROMACUT</span>
                    </a>
                    <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
                        <a href="#workflow" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">How it works</a>
                        <a href="/docs/overview" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Docs</a>
                        <a href={links.releases} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Releases</a>
                    </nav>
                    <a
                        href={APP_PATH}
                        data-testid="landing-open-app"
                        className="group inline-flex min-h-11 items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background shadow-lg shadow-foreground/10 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background active:translate-y-0"
                    >
                        Open Kromacut <ExternalArrow />
                    </a>
                </header>

                <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 md:pb-28 md:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:px-10 lg:pt-24">
                    <div className="max-w-2xl">
                        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary">
                            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                            Open source · browser first
                        </div>
                        <h1 className="max-w-2xl text-balance font-sans text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                            Turn pixels into <span className="bg-gradient-to-r from-primary via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">printable layers.</span>
                        </h1>
                        <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                            Kromacut transforms 2D images into stacked, color-layered 3D prints. Prepare your palette, match real filament, preview the result, and export a model ready for your slicer.
                        </p>
                        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <a href={APP_PATH} className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background active:translate-y-0">
                                Start creating <ExternalArrow />
                            </a>
                            <a href="/docs/quick-start" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card/60 px-5 py-3 font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
                                <BookOpen aria-hidden="true" className="h-4 w-4" /> Read the quick start
                            </a>
                        </div>
                        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
                            {['Free to use', 'No upload required', 'STL + 3MF export'].map((item) => (
                                <span key={item} className="inline-flex items-center gap-2"><Check aria-hidden="true" className="h-4 w-4 text-emerald-400" />{item}</span>
                            ))}
                        </div>
                    </div>

                    <div className="relative mx-auto w-full max-w-2xl lg:ml-auto">
                        <div aria-hidden="true" className="absolute -inset-8 rounded-[2rem] bg-primary/10 blur-3xl" />
                        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/80 p-2 shadow-2xl shadow-black/30 backdrop-blur">
                            <div className="flex items-center justify-between border-b border-border px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                <span>3D layer preview</span>
                                <span className="inline-flex items-center gap-1.5 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ready to print</span>
                            </div>
                            <div className="relative aspect-[1.22] overflow-hidden rounded-xl bg-black/20">
                                <img src={fuji3d} alt="Color-layered 3D print preview" className="h-full w-full object-cover object-center" fetchPriority="high" />
                                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
                                    {['#121a3a', '#3855c7', '#e14f91', '#f6ba4a'].map((color, index) => (
                                        <span key={color} className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-black/65 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur" style={{ opacity: 1 - index * 0.04 }}>
                                            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} /> Layer {index + 1}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl sm:flex">
                            <div className="flex -space-x-1.5">{['#191d3d', '#5867d9', '#d64996', '#f5bd5a'].map((color) => <span key={color} className="h-7 w-7 rounded-full border-2 border-card" style={{ backgroundColor: color }} />)}</div>
                            <div><div className="text-xs font-bold">Palette mapped</div><div className="text-[11px] text-muted-foreground">4 printable colors</div></div>
                        </div>
                    </div>
                </section>
            </div>

            <section id="workflow" className="scroll-mt-8 border-y border-border/70 bg-card/30">
                <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">From image to object</p>
                        <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">A simple workflow, with serious control.</h2>
                        <p className="mt-5 text-lg leading-8 text-muted-foreground">Go from a flat image to a layered print without leaving your browser. Keep the creative decisions yours, while Kromacut handles the geometry and print planning.</p>
                    </div>
                    <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        {workflow.map((step) => (
                            <article key={step.number} className="group overflow-hidden rounded-xl border border-border bg-background/70 shadow-sm transition-transform motion-safe:hover:-translate-y-1">
                                <div className="aspect-[4/3] overflow-hidden border-b border-border bg-muted"><img src={step.image} alt={step.alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" /></div>
                                <div className="p-5"><div className="font-mono text-xs font-bold text-primary">{step.number}</div><h3 className="mt-3 text-lg font-bold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p></div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
                <div className="relative grid grid-cols-2 gap-3">
                    <div className="mt-10 overflow-hidden rounded-xl border border-border shadow-xl"><img src={fuji2d} alt="Original 2D artwork" loading="lazy" className="aspect-square h-full w-full object-cover" /></div>
                    <div className="overflow-hidden rounded-xl border border-primary/40 shadow-xl shadow-primary/10"><img src={printed} alt="Finished Kromacut print" loading="lazy" className="aspect-square h-full w-full object-cover" /></div>
                    <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background p-3 text-primary shadow-lg sm:block"><ArrowRight aria-hidden="true" className="h-5 w-5" /></div>
                </div>
                <div className="max-w-xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Built for real prints</p>
                    <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">Your filament. Your palette. Your model.</h2>
                    <p className="mt-5 text-lg leading-8 text-muted-foreground">Use manual slicing when you want pixel-level control, or let Auto-paint search for a color stack from your calibrated filament profile. Either way, inspect every layer before you export.</p>
                    <ul className="mt-7 space-y-3 text-sm text-foreground">
                        {['Non-destructive image adjustments', 'Three.js layer-by-layer 3D preview', 'Calibrated Auto-paint with deterministic search', 'Slicer-friendly STL and multi-material 3MF'].map((item) => <li key={item} className="flex items-start gap-3"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />{item}</li>)}
                    </ul>
                    <a href={APP_PATH} className="mt-9 inline-flex items-center gap-2 font-bold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open the tool <ExternalArrow /></a>
                </div>
            </section>

            <section className="border-t border-border/70 bg-muted/20">
                <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center lg:px-10">
                    <div><p className="text-2xl font-extrabold tracking-tight sm:text-3xl">Ready to make a flat image physical?</p><p className="mt-2 text-muted-foreground">Start with an image. Finish with a print.</p></div>
                    <div className="flex flex-wrap gap-3"><a href={APP_PATH} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open Kromacut <ExternalArrow /></a><a href={links.releases} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Download aria-hidden="true" className="h-4 w-4" /> Desktop releases</a></div>
                </div>
            </section>

            <footer className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-10">
                <div><a href={APP_PATH} className="inline-flex items-center gap-3 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={logo} alt="" className="h-8 w-auto" /> Kromacut</a><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Open-source tools for turning images into color-layered 3D prints.</p></div>
                <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:justify-end sm:gap-x-6">
                    <a href="/docs/overview" className="inline-flex items-center gap-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><BookOpen aria-hidden="true" className="h-4 w-4" /> Docs</a>
                    <a href={links.releases} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Download aria-hidden="true" className="h-4 w-4" /> Releases</a>
                    <a href={links.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Github aria-hidden="true" className="h-4 w-4" /> GitHub</a>
                    <a href={links.discord} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MessageCircle aria-hidden="true" className="h-4 w-4" /> Discord</a>
                    <a href={links.patreon} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Heart aria-hidden="true" className="h-4 w-4" /> Support Kromacut</a>
                </nav>
            </footer>
            <div className="sr-only"><ChevronDown aria-hidden="true" /><Play aria-hidden="true" /></div>
        </main>
    );
}
