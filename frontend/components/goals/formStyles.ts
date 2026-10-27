/**
 * The Goals tab's form styles, shared by the goal form, the edit modal and the
 * goals_v2 sheets so they keep looking like one screen. Colours are never here —
 * every caller passes theme tokens inline.
 */
import { StyleSheet } from 'react-native';
import { ft } from '../../constants/responsive';

export const YEAR_ITEM_W = 84;   // must match yearItem width + marginRight

export const formStyles = StyleSheet.create({
    formTitle: {
        fontFamily: 'InstrumentSerif-Regular',
        fontSize: ft(20, 1.3),
        letterSpacing: -0.3,
        marginBottom: 16,
    },
    fieldLabel: {
        fontFamily: 'JetBrainsMono-SemiBold',
        fontSize: ft(10, 1.25),
        letterSpacing: 1.6,
        marginBottom: 8,
        marginTop: 2,
    },
    textInput: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: ft(15, 1.18),
        fontFamily: 'Geist-Regular',
        marginBottom: 14,
    },
    hint: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(12, 1.18),
        lineHeight: ft(17, 1.18),
        marginTop: -6,
        marginBottom: 14,
    },
    errorText: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(12, 1.18),
        marginTop: -10,
        marginBottom: 10,
        fontStyle: 'italic',
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 18,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
    },
    chipText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(12, 1.18),
    },
    // Fixed width so the snap interval is exact: 76 + 8 margin = YEAR_ITEM_W (84).
    yearItem: {
        width: 76,
        marginRight: 8,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    formBtnRow: {
        flexDirection: 'row',
        gap: 10,
    },
    submitBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingVertical: 13,
        borderRadius: 12,
    },
    submitBtnText: {
        color: '#fff',
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(14, 1.2),
    },
    cancelBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        borderRadius: 12,
        borderWidth: 1,
    },
    cancelBtnText: {
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(14, 1.2),
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 6,
    },
    switchLabel: {
        flex: 1,
        fontFamily: 'Geist-SemiBold',
        fontSize: ft(14, 1.2),
    },
    planBox: {
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 16,
        gap: 4,
    },
    planLine: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(14, 1.2),
    },
    planStrong: {
        fontFamily: 'Geist-SemiBold',
    },
    planSmall: {
        fontFamily: 'Geist-Regular',
        fontSize: ft(12, 1.18),
        lineHeight: ft(17, 1.18),
    },
});
