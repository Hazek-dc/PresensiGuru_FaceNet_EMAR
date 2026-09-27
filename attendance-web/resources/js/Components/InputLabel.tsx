import { LabelHTMLAttributes } from 'react';

export default function InputLabel({
    value,
    className = '',
    children,
    ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { value?: string }) {
    return (
        <label
            {...props}
            className={`block text-xs font-bold uppercase tracking-wider text-deep-navy dark:text-slate-300 ` + className}
        >
            {value ? value : children}
        </label>
    );
}
