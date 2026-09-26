import { useEffect, useState, type RefObject } from 'react';

/** Show a mobile shortcut only after its original action scrolls above the page. */
export function useStickyMobileCta(
    scrollRootRef: RefObject<HTMLElement | null>,
    originalActionRef: RefObject<HTMLAnchorElement | null>
): boolean {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const root = scrollRootRef.current;
        const action = originalActionRef.current;
        if (!root || !action) return;

        const mobile = window.matchMedia('(max-width: 767px)');
        const update = () => {
            setVisible(
                mobile.matches &&
                    action.getBoundingClientRect().bottom <= root.getBoundingClientRect().top
            );
        };
        const observer =
            typeof IntersectionObserver === 'undefined'
                ? undefined
                : new IntersectionObserver(
                      ([entry]) => {
                          if (!entry) return;
                          setVisible(
                              mobile.matches &&
                                  !entry.isIntersecting &&
                                  entry.boundingClientRect.bottom <=
                                      (entry.rootBounds?.top ?? root.getBoundingClientRect().top)
                          );
                      },
                      { root, threshold: 0 }
                  );

        observer?.observe(action);
        if (!observer) root.addEventListener('scroll', update, { passive: true });
        mobile.addEventListener('change', update);
        window.addEventListener('resize', update);
        update();

        return () => {
            observer?.disconnect();
            if (!observer) root.removeEventListener('scroll', update);
            mobile.removeEventListener('change', update);
            window.removeEventListener('resize', update);
        };
    }, [scrollRootRef, originalActionRef]);

    return visible;
}
