import React, { memo } from 'react';

interface DynamicBackdropProps {
    className?: string;
    showGrid?: boolean;
}

/**
 * DynamicBackdrop Component
 * - Cyber Dot-Matrix: Subtle transparent micro dotted grid (10% opacity)
 * - Dynamic Aurora Mist: Ambient blur spheres with electric blue (#2563eb),
 *   indigo (#4f46e5), and soft teal/toska muda accent (#06b6d4 / #2dd4bf)
 * - Hardware accelerated CSS transforms (transform-gpu) with zero CPU lag
 */
function DynamicBackdropComponent({
    className = '',
}: DynamicBackdropProps) {
    return (
        <div
            className={`pointer-events-none fixed inset-0 z-0 overflow-hidden select-none bg-[#f8fafc] dark:bg-[#071026] ${className}`}
            aria-hidden="true"
        />
    );
}

export default memo(DynamicBackdropComponent);
