import { describe, expect, it } from 'vitest';
import { capacity, fitLength, groupCart, planSplit, shareFigures, wasteSqft, type SplitMaterial } from './split-job';

// Live Flex stock on 25 Oct 2026, a 2 x 3 ft piece.
const flex = (width: number, stockFt: number): SplitMaterial => ({ id: `FLEX-${width}FT`, name: 'Flex', widthFt: width, stockFt });
const stock = [flex(10, 655.3), flex(8, 820.1), flex(6, 1242.52), flex(4, 1156.44), flex(3, 604.39)];
const total = (shares: { pieces: number }[]) => shares.reduce((sum, s) => sum + s.pieces, 0);

describe('how a 2 x 3 ft piece fits each roll width', () => {
  it('gives the roll length each share of the example needs, turning the piece where that is shorter', () => {
    expect(fitLength(2, 3, 10, 600)).toMatchObject({ fits: true, lengthFt: 360, turned: false, perRow: 5 });
    expect(fitLength(2, 3, 8, 500)).toMatchObject({ lengthFt: 375, turned: false, perRow: 4 });
    expect(fitLength(2, 3, 6, 400)).toMatchObject({ lengthFt: 400, turned: true });
    expect(fitLength(2, 3, 4, 300)).toMatchObject({ lengthFt: 450, turned: false, perRow: 2 });
    expect(fitLength(2, 3, 3, 200)).toMatchObject({ lengthFt: 400, turned: true, perRow: 1 });
  });

  it('says a piece wider than the roll both ways does not fit', () => {
    expect(fitLength(5, 4, 3, 10)).toMatchObject({ fits: false, lengthFt: 0 });
    expect(capacity(5, 4, 3, 1000)).toBe(0);
  });

  it('counts the most pieces a stock of roll holds, in whole rows', () => {
    expect(capacity(2, 3, 10, 655.3)).toBe(5 * Math.floor(655.3 / 3));
    expect(capacity(2, 3, 3, 604.39)).toBe(Math.floor(604.39 / 2));
    expect(capacity(2, 3, 10, 2)).toBe(3); // two feet of roll holds three turned pieces
    expect(capacity(2, 3, 10, 1)).toBe(0);
  });

  it('shows no waste where the piece divides the roll width exactly, and some where it does not', () => {
    expect(wasteSqft(2, 3, 10, 600)).toBe(0);
    expect(wasteSqft(3, 3, 10, 600)).toBeGreaterThan(0);
  });
});

describe('suggested split', () => {
  const input = { jobW: 2, jobH: 3, pieces: 2000, materials: stock };

  it('places every piece, never beyond a roll width\'s stock, whichever plan is chosen', () => {
    for (const strategy of ['least-waste', 'most-stock', 'even'] as const) {
      const plan = planSplit({ ...input, strategy });
      expect(plan.unplaced).toBe(0);
      expect(total(plan.shares)).toBe(2000);
      for (const share of plan.shares) {
        const material = stock.find((m) => m.id === share.id)!;
        expect(shareFigures(2, 3, material, share.pieces).enough).toBe(true);
      }
    }
  });

  it('shares an even plan out in proportion to what each width can hold, using all of them', () => {
    const plan = planSplit({ ...input, strategy: 'even' });
    expect(plan.shares.every((s) => s.pieces > 0)).toBe(true);
    const biggest = plan.shares.reduce((a, b) => (b.pieces > a.pieces ? b : a));
    expect(biggest.id).toBe('FLEX-6FT');
  });

  it('puts the largest stock first when asked to', () => {
    const plan = planSplit({ ...input, strategy: 'most-stock' });
    expect(plan.shares.find((s) => s.id === 'FLEX-6FT')!.pieces).toBe(capacity(2, 3, 6, 1242.52));
  });

  it('reports the pieces it could not place when the stock is too small', () => {
    const plan = planSplit({ jobW: 2, jobH: 3, pieces: 50000, materials: stock, strategy: 'even' });
    expect(plan.unplaced).toBeGreaterThan(0);
    expect(total(plan.shares) + plan.unplaced).toBe(50000);
  });

  it('leaves a material that cannot take the piece at zero', () => {
    const plan = planSplit({ jobW: 5, jobH: 4, pieces: 20, materials: [flex(3, 600), flex(10, 600)], strategy: 'least-waste' });
    expect(plan.shares.find((s) => s.id === 'FLEX-3FT')!.pieces).toBe(0);
    expect(plan.unplaced).toBe(0);
  });
});

describe('one share of the job', () => {
  it('shows the roll used, what is left, and whether the stock covers it', () => {
    expect(shareFigures(2, 3, flex(10, 655.3), 600)).toMatchObject({ lengthFt: 360, enough: true });
    expect(shareFigures(2, 3, flex(10, 655.3), 600).leftFt).toBeCloseTo(295.3, 5);
    expect(shareFigures(2, 3, flex(10, 100), 600).enough).toBe(false);
    expect(shareFigures(2, 3, flex(10, 100), 0)).toMatchObject({ lengthFt: 0, enough: true });
  });
});

describe('the order list with a split job in it', () => {
  const spec = { description: 'Flex 2 × 3 ft', width: '2', height: '3', unit: 'ft' as const, totalPieces: '2000', price: '180' };
  const line = (id: string, qty: number, amount: number, group?: string) => ({ id, qty, totalAmount: amount, ...(group ? { group: { id: group, spec } } : {}) });
  it('keeps single items as they are and gathers the lines of one job under it, in the order first added', () => {
    const entries = groupCart([line('a', 1, 100), line('j1', 600, 648000, 'job'), line('b', 2, 50), line('j2', 500, 540000, 'job')]);
    expect(entries.map((e) => e.kind)).toEqual(['item', 'job', 'item']);
    const job = entries[1] as Extract<typeof entries[number], { kind: 'job' }>;
    expect(job).toMatchObject({ id: 'job', pieces: 1100, total: 1188000 });
    expect(job.items.map((i) => i.id)).toEqual(['j1', 'j2']);
  });
});
