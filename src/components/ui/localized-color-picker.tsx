import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
    HexColorPicker as BaseHexColorPicker,
    RgbaColorPicker as BaseRgbaColorPicker,
} from 'react-colorful';

/**
 * react-colorful 5 exposes no labels for its internal sliders. Keep its proven
 * pointer/keyboard behavior and adapt only accessibility attributes inside this
 * instance. The observer also covers hue changes that do not change a gray RGB
 * value; watching only the parent's color prop would miss those updates.
 */
function LocalizedPicker({ children }: { children: ReactNode }) {
    const container = useRef<HTMLDivElement>(null);
    const { t } = useTranslation('common');
    useLayoutEffect(() => {
        const root = container.current;
        if (!root) return;
        const set = (element: Element | null, attribute: string, value: string) => {
            if (element && element.getAttribute(attribute) !== value)
                element.setAttribute(attribute, value);
        };
        const sync = () => {
            set(
                root.querySelector('.react-colorful__hue [role="slider"]'),
                'aria-label',
                t('colorPicker.hue')
            );
            set(
                root.querySelector('.react-colorful__alpha [role="slider"]'),
                'aria-label',
                t('colorPicker.alpha')
            );
            const saturation = root.querySelector('.react-colorful__saturation [role="slider"]');
            set(saturation, 'aria-label', t('colorPicker.color'));
            const pointer = saturation?.querySelector<HTMLElement>('.react-colorful__pointer');
            if (pointer) {
                const saturationValue = Math.round(Number.parseFloat(pointer.style.left));
                const brightness = Math.round(100 - Number.parseFloat(pointer.style.top));
                if (Number.isFinite(saturationValue) && Number.isFinite(brightness)) {
                    set(
                        saturation,
                        'aria-valuetext',
                        t('colorPicker.saturationBrightness', {
                            saturation: saturationValue,
                            brightness,
                        })
                    );
                }
            }
        };
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(root, {
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-label', 'aria-valuetext', 'style'],
        });
        return () => observer.disconnect();
    }, [t]);
    return (
        <div ref={container} className="contents">
            {children}
        </div>
    );
}

export function HexColorPicker(props: ComponentProps<typeof BaseHexColorPicker>) {
    return (
        <LocalizedPicker>
            <BaseHexColorPicker {...props} />
        </LocalizedPicker>
    );
}

export function RgbaColorPicker(props: ComponentProps<typeof BaseRgbaColorPicker>) {
    return (
        <LocalizedPicker>
            <BaseRgbaColorPicker {...props} />
        </LocalizedPicker>
    );
}
