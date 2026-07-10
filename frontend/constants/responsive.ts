import { Dimensions } from 'react-native';

/**
 * Tablet-aware sizing helpers.
 *
 * Bigger devices (iPads / large tablets) render the phone-designed layouts at a
 * physically small type size. These helpers enlarge headings, amounts, and button
 * text ON TABLETS ONLY — phones are never touched (every helper returns its base
 * value unchanged below the breakpoint), so the phone experience is identical.
 *
 * Detection is by the SHORTEST screen side, so it's orientation-independent:
 * a device that is a tablet in portrait is still a tablet in landscape. iPads have
 * a shortest side of 744–1024pt; 600 also captures larger Android tablets, while
 * every phone (and an iPad in a narrow Split View pane) stays below it.
 *
 * Computed once at module load. Tablet-ness never flips at runtime (rotation keeps
 * the shortest side the same), so there's no need for a hook / re-render.
 */
const { width, height } = Dimensions.get('window');

export const isTablet = Math.min(width, height) >= 600;

/**
 * Font-size scale. On phones returns `base` unchanged; on tablets returns
 * `base * mult`, rounded. Use for `fontSize` values in StyleSheets.
 *
 * @param base  the phone font size (unchanged on phones)
 * @param mult  tablet multiplier (default 1.28 — a comfortable heading bump)
 */
export function ft(base: number, mult = 1.28): number {
    return isTablet ? Math.round(base * mult) : base;
}

/**
 * Generic tablet value picker for non-font props (icon sizes, the AnimatedAmount
 * `size` prop, spacing). Returns `phone` on phones, `tablet` on tablets.
 */
export function tv<T>(phone: T, tablet: T): T {
    return isTablet ? tablet : phone;
}
