import type { Page } from '@playwright/test';

/**
 * A fake Tauri runtime for e2e specs. It answers every command the desktop app sends at startup
 * with neutral defaults (no update, no opened file, event listen/unlisten succeed), so specs only
 * handle the commands they test. Any other command throws, so new native calls are noticed.
 */
export interface FakeDesktop {
    /** Every invoked command name in call order, including startup and unknown commands. */
    calls: string[];
    /**
     * Answers one or more commands, replacing any default. The handler receives the invoke
     * arguments (`{}` when none were sent) and the command name.
     */
    handle(commands: string | string[], handler: (args: never, command: string) => unknown): void;
    /** Delivers an event to listeners registered through `@tauri-apps/api/event`. */
    emit(event: string, payload?: unknown): void;
}

export type FakeDesktopWindow = Window & { __kromacutFakeDesktop: FakeDesktop };

/** Runs in the page, so it must not reference anything outside its own body. */
export type FakeDesktopSetup<Arg> = (desktop: FakeDesktop, arg: Arg) => void;

// Serialized into the page; keep it self-contained.
function installFakeDesktopRuntime() {
    const host = window as unknown as FakeDesktopWindow & {
        isTauri: boolean;
        __TAURI_INTERNALS__: unknown;
        __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
    };
    if (host.__kromacutFakeDesktop) return;
    let nextId = 0;
    const callbacks = new Map<number, (value: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    const handlers = new Map<string, (args: unknown, command: string) => unknown>();
    const desktop: FakeDesktop = {
        calls: [],
        handle(commands, handler) {
            for (const command of typeof commands === 'string' ? [commands] : commands)
                handlers.set(command, handler as (args: unknown, command: string) => unknown);
        },
        emit(event, payload = null) {
            for (const [id, listener] of listeners)
                if (listener.event === event)
                    callbacks.get(listener.handler)?.({ event, id, payload });
        },
    };
    desktop.handle('get_app_version', () => '4.1.0');
    desktop.handle(['check_for_updates', 'take_opened_file'], () => null);
    desktop.handle('plugin:event|listen', (args: { event: string; handler: number }) => {
        const id = ++nextId;
        listeners.set(id, { event: args.event, handler: args.handler });
        return id;
    });
    desktop.handle('plugin:event|unlisten', (args: { eventId: number }) => {
        listeners.delete(args.eventId);
    });
    host.isTauri = true;
    host.__TAURI_INTERNALS__ = {
        transformCallback(callback: (value: unknown) => void, once = false) {
            const id = ++nextId;
            callbacks.set(id, (value) => {
                if (once) callbacks.delete(id);
                callback(value);
            });
            return id;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        async invoke(command: string, args?: unknown) {
            desktop.calls.push(command);
            const handler = handlers.get(command);
            if (!handler) throw new Error(`Unexpected desktop command: ${command}`);
            return handler(args ?? {}, command);
        },
    };
    host.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (_event: string, eventId: number) => listeners.delete(eventId),
    };
    host.__kromacutFakeDesktop = desktop;
}

const setupScript = <Arg>(setup: FakeDesktopSetup<Arg>, arg: Arg) =>
    `(${setup.toString()})(window.__kromacutFakeDesktop, ${JSON.stringify(arg)});`;

/**
 * Starts every document in this page as the desktop app. Call before `page.goto`; `setup` and
 * `arg` (JSON-serializable) run in the page after the fake exists, before any app code.
 */
export async function fakeDesktopBeforeLoad<Arg = undefined>(
    page: Page,
    setup?: FakeDesktopSetup<Arg>,
    arg?: Arg
) {
    await page.addInitScript(installFakeDesktopRuntime);
    if (setup) await page.addInitScript(setupScript(setup, arg as Arg));
}

/**
 * Switches an already loaded page to the desktop runtime, for specs that compare web and desktop
 * behavior in one page. `App` is lazy-loaded, so startup code may still run against the fake;
 * the neutral startup defaults keep that harmless. Calling it again only runs the new `setup`.
 * Like `fakeDesktopBeforeLoad`, `arg` must be JSON-serializable.
 */
export async function fakeDesktopAfterLoad<Arg = undefined>(
    page: Page,
    setup?: FakeDesktopSetup<Arg>,
    arg?: Arg
) {
    await page.evaluate(installFakeDesktopRuntime);
    if (setup) await page.evaluate(setupScript(setup, arg as Arg));
}

/** Command names the page has invoked so far. */
export const fakeDesktopCalls = (page: Page) =>
    page.evaluate(() => (window as unknown as FakeDesktopWindow).__kromacutFakeDesktop.calls);
