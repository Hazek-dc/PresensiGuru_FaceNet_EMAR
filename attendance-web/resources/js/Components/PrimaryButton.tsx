import { ButtonHTMLAttributes } from 'react';

export default function PrimaryButton({
    className = '',
    disabled,
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            className={
                `inline-flex items-center justify-center rounded-xl border border-transparent bg-royal-blue dark:bg-sky-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition duration-150 ease-in-out hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-royal-blue focus:ring-offset-2 ${
                    disabled && 'opacity-50 cursor-not-allowed'
                } ` + className
            }
            disabled={disabled}
        >
            {children}
        </button>
    );
}
