import { ButtonHTMLAttributes } from 'react';

export default function SecondaryButton({
    type = 'button',
    className = '',
    disabled,
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            type={type}
            className={
                `inline-flex items-center justify-center rounded-xl border border-outline-variant/60 dark:border-white/10 bg-surface-container-low dark:bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-200 shadow-xs transition duration-150 ease-in-out hover:bg-surface-container dark:hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-royal-blue focus:ring-offset-2 disabled:opacity-25 ${
                    disabled && 'opacity-25'
                } ` + className
            }
            disabled={disabled}
        >
            {children}
        </button>
    );
}
