import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Bab5EvaluationData, Bab5ScenarioCard } from '../Bab5ScenarioCard';

let container: HTMLDivElement;
let root: Root;

async function flush() {
    for (let i = 0; i < 6; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    root.unmount();
    container.remove();
});

const evaluated: Bab5EvaluationData = {
    evaluated: true,
    s1_decision: 0,
    s2_decision: 0,
    s3_decision: 1,
    euclidean_distance: 0.408,
    p_face: 0.728,
    p_live: 1,
    s_final: 0.837,
};

async function renderCard(props: Parameters<typeof Bab5ScenarioCard>[0]) {
    root.render(<Bab5ScenarioCard {...props} />);
    await flush();
    return container.firstElementChild as HTMLElement;
}

describe('latar kartu Bab 5', () => {
    it('tanpa prop isDark mengikuti tema halaman, bukan selalu gelap', async () => {
        const card = await renderCard({ data: evaluated, variant: 'modal' });

        expect(card.classList.contains('bg-slate-50/90')).toBe(true);
        expect(card.classList.contains('dark:bg-slate-900/80')).toBe(true);
        expect(card.classList.contains('bg-slate-900/80')).toBe(false);
    });

    it('isDark yang dikirim tetap dipakai apa adanya', async () => {
        const dark = await renderCard({ data: evaluated, variant: 'full', isDark: true });
        expect(dark.classList.contains('bg-slate-900/80')).toBe(true);
        expect(dark.classList.contains('bg-slate-50/90')).toBe(false);

        const light = await renderCard({ data: evaluated, variant: 'full', isDark: false });
        expect(light.classList.contains('bg-slate-50/90')).toBe(true);
        expect(light.classList.contains('dark:bg-slate-900/80')).toBe(false);
    });

    it('kartu "belum dinilai" juga mengikuti tema tanpa prop isDark', async () => {
        const card = await renderCard({ data: { evaluated: false }, variant: 'modal' });

        expect(card.textContent).toContain('belum dinilai');
        expect(card.classList.contains('bg-white')).toBe(true);
        expect(card.classList.contains('dark:bg-slate-900/95')).toBe(true);
    });
});
