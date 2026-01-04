import { createSignal, createEffect, Show } from 'solid-js';
import { Box } from '@suid/material';

/**
 * A basic Collapse implementation for SolidJS/SUID
 * Since SUID doesn't currently export a Collapse component
 */
export default function Collapse(props) {
    let contentRef;
    const [height, setHeight] = createSignal('0px');
    const [isTransitioning, setIsTransitioning] = createSignal(false);

    createEffect(() => {
        if (props.in) {
            setIsTransitioning(true);
            if (contentRef) {
                const updateHeight = () => {
                    setHeight(`${contentRef.scrollHeight}px`);
                };

                // Initial update
                updateHeight();

                // Observe content changes (e.g. nested collapses)
                const observer = new ResizeObserver(updateHeight);
                observer.observe(contentRef);

                const timer = setTimeout(() => {
                    setIsTransitioning(false);
                }, 300);

                return () => {
                    observer.disconnect();
                    clearTimeout(timer);
                };
            }
        } else {
            setIsTransitioning(true);
            setHeight('0px');
            const timer = setTimeout(() => {
                setIsTransitioning(false);
            }, 300);
            return () => clearTimeout(timer);
        }
    });

    const displayHeight = () => {
        if (!props.in) return '0px';
        if (isTransitioning()) return height();
        return 'auto'; // Use auto when open and not transitioning for perfect flexibility
    };

    return (
        <Box
            sx={{
                overflow: 'hidden',
                transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                height: displayHeight(),
                width: '100%',
                ...props.sx
            }}
        >
            <div ref={contentRef}>
                {props.children}
            </div>
        </Box>
    );
}
