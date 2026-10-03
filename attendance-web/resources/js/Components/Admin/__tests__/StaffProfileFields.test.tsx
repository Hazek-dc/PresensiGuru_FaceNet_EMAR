import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubject, cleanSubject, positionLabel, StaffPosition, toggleSubject } from '../../../Utils/staffProfile';
import { StaffProfileFields } from '../StaffProfileFields';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = ['Kimia', 'Matematika', 'Produktif', 'Sejarah Indonesia'];

let container: HTMLDivElement;
let root: Root;
let latest: { position: StaffPosition | ''; subjects: string[] };

function Harness({ max = 8, initial = [] as string[] }: { max?: number; initial?: string[] }) {
    const [position, setPosition] = useState<StaffPosition | ''>('');
    const [subjects, setSubjects] = useState<string[]>(initial);
    latest = { position, subjects };
    return (
        <StaffProfileFields
            position={position}
            subjects={subjects}
            subjectOptions={OPTIONS}
            maxSubjects={max}
            onPositionChange={setPosition}
            onSubjectsChange={setSubjects}
        />
    );
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

const radio = (value: string) => container.querySelector(`input[type="radio"][value="${value}"]`) as HTMLInputElement;
const checkbox = (label: string) =>
    Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
        (el) => el.parentElement?.textContent?.includes(label),
    ) as HTMLInputElement | undefined;
const extraInput = () => container.querySelector('#subject-extra') as HTMLInputElement;

function typeExtra(value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
        setValue.call(extraInput(), value);
        extraInput().dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function pressEnter(): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
        extraInput().dispatchEvent(event);
    });
    return event;
}

describe('isian jabatan dan bidang studi', () => {
    it('bidang studi baru muncul setelah memilih Guru', () => {
        act(() => root.render(<Harness />));
        expect(container.textContent).toContain('Belum diisi.');
        expect(checkbox('Kimia')).toBeUndefined();

        act(() => radio('guru').click());
        expect(latest.position).toBe('guru');
        expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(OPTIONS.length);

        act(() => checkbox('Matematika')!.click());
        expect(latest.subjects).toEqual(['Matematika']);
        expect(container.textContent).toContain('Boleh 1 sampai 8 bidang studi, tidak lebih. 1 dari 8 dipilih.');
    });

    it('Enter di isian bebas menambah bidang studi tanpa mengirim formulir, dengan ejaan daftar', () => {
        act(() => root.render(<Harness />));
        act(() => radio('guru').click());

        typeExtra('  produktif ');
        expect(pressEnter().defaultPrevented).toBe(true);
        expect(latest.subjects).toEqual(['Produktif']);
        expect(checkbox('Produktif')!.checked).toBe(true);

        typeExtra('PRODUKTIF');
        pressEnter();
        expect(latest.subjects).toEqual(['Produktif']);
        expect(container.textContent).toContain('“Produktif” sudah dipilih.');
    });

    it('bidang studi di luar daftar tampil sebagai chip dan hilang saat dilepas', () => {
        act(() => root.render(<Harness />));
        act(() => radio('guru').click());
        typeExtra('Fisika   Terapan');
        pressEnter();
        expect(latest.subjects).toEqual(['Fisika Terapan']);
        expect(checkbox('Fisika Terapan')!.checked).toBe(true);

        act(() => checkbox('Fisika Terapan')!.click());
        expect(latest.subjects).toEqual([]);
        expect(checkbox('Fisika Terapan')).toBeUndefined();
    });

    it('batas jumlah mengunci pilihan lain dan isian bebas', () => {
        act(() => root.render(<Harness max={2} />));
        act(() => radio('guru').click());
        act(() => checkbox('Kimia')!.click());
        act(() => checkbox('Matematika')!.click());

        expect(checkbox('Produktif')!.disabled).toBe(true);
        expect(checkbox('Kimia')!.disabled).toBe(false);
        expect(extraInput().disabled).toBe(true);
    });

    it('Staff TU menyembunyikan bidang studi dan memberi tahu bahwa tidak disimpan', () => {
        act(() => root.render(<Harness initial={['Kimia']} />));
        act(() => radio('staff_tu').click());
        expect(checkbox('Kimia')).toBeUndefined();
        expect(container.textContent).toContain('Bidang studi (Kimia) tidak disimpan untuk Staff TU.');
    });
});

describe('util jabatan', () => {
    it('merapikan, menyamakan ejaan, dan menolak duplikat', () => {
        expect(cleanSubject('  Sejarah   Indonesia ')).toBe('Sejarah Indonesia');
        expect(addSubject([], 'kimia', OPTIONS)).toEqual({ subjects: ['Kimia'], subject: 'Kimia', duplicate: false });
        expect(addSubject(['Kimia'], 'KIMIA', OPTIONS)).toEqual({ subjects: ['Kimia'], subject: 'Kimia', duplicate: true });
        expect(addSubject(['Kimia'], '   ', OPTIONS)).toEqual({ subjects: ['Kimia'], subject: null, duplicate: false });
        expect(toggleSubject(['Kimia', 'PAI'], 'Kimia')).toEqual(['PAI']);
        expect(positionLabel('staff_tu')).toBe('Staff TU');
        expect(positionLabel(null)).toBeNull();
        expect(positionLabel('kepala')).toBeNull();
    });
});
