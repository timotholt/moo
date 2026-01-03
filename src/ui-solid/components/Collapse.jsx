import { createSignal, createEffect, Show } from 'solid-js';
import { Box } from '@suid/material';

/**
 * A basic Collapse implementation for SolidJS/SUID
 * Since SUID doesn't currently export a Collapse component
 */
export default function Collapse(props) {
    let contentRef;
    const [height, setHeight] = createSignal('0px');

    createEffect(() => {
        if (props.in) {
            if (contentRef) {
                setHeight(`${contentRef.scrollHeight}px`);
            }
        } else {
            setHeight('0px');
        }
    });

    return (
        <Box
            sx={{
                overflow: 'hidden',
                transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                height: height(),
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
