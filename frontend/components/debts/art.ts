/**
 * Geometry and illustration colours for the plant art.
 *
 * Every plant file shares one 1000 × 1250 canvas with the pot bottom at y = 1150, so
 * one set of boxes (measured by scripts/extract-plant-svgs.mjs into layout.json)
 * positions the text overlays for every species and frame.
 *
 * ILLUSTRATION_COLORS is the one deliberate exception to "every colour from
 * useTheme()": like the plant SVGs themselves, the water and the drops are artwork
 * with their own fixed palette, drawn to match the plants' outline and fills. UI
 * around the art still takes theme tokens.
 */
import layout from '../../assets/debt-freedom/layout.json';

export const CANVAS_W = layout.canvas.width;
export const CANVAS_H = layout.canvas.height;
export const CANVAS_RATIO = CANVAS_H / CANVAS_W; // 1.25
export const POT_BOTTOM_Y = layout.canvas.potBottom;

export interface Box { x: number; y: number; width: number; height: number }

export const POT_LABEL_BOX: Box = layout.potLabel;
export const SEED_BOX: Box = layout.seed;
export const SOIL_TOP: Box = layout.soilTop;

export function stakeTagOf(species: number): { box: Box; rotation: number } {
    const s = layout.species[String(species) as '1' | '2' | '3' | '4'] ?? layout.species['4'];
    return { box: s.stakeTag, rotation: s.stakeTagRotation };
}

/** Top-most painted y of each growth frame (pot, plant, and the flytrap's bug along
 *  its flight and rising puff), in canvas units — so a view can crop the empty sky
 *  above a young plant. Measured by the extract script; index = growth step. */
export const ART_TOP: Record<1 | 2 | 3 | 4, number[]> = {
    1: layout.species['1'].artTop, 2: layout.species['2'].artTop,
    3: layout.species['3'].artTop, 4: layout.species['4'].artTop,
};
/** Same, for the static paid-off art. */
export const ART_TOP_PAID_OFF: Record<1 | 2 | 3 | 4, number> = {
    1: layout.species['1'].artTopPaidOff, 2: layout.species['2'].artTopPaidOff,
    3: layout.species['3'].artTopPaidOff, 4: layout.species['4'].artTopPaidOff,
};

export interface FragmentFall { dx: number; dy: number; rotate: number; cx: number; cy: number }
export const FRAGMENT_FALLS: FragmentFall[] = layout.fragments;

/** The pot's outer width on the canvas (rim edge to rim edge). */
export const POT_WIDTH = 560;

export const ILLUSTRATION_COLORS = {
    outline: '#1F2A1C',   // the plants' ink line
    water: '#7CC6E8',
    waterDeep: '#4FA3CC',
    waterShine: '#D8F0FB',
} as const;

export function clampSpecies(n: number): 1 | 2 | 3 | 4 {
    return (n >= 1 && n <= 4 ? Math.round(n) : 4) as 1 | 2 | 3 | 4;
}

export function clampStep(n: number): number {
    return Math.max(0, Math.min(10, Math.round(n || 0)));
}
