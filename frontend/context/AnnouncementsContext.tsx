/**
 * AnnouncementsContext — the in-app News modal's state.
 *
 * ── THE ONE CONSTRAINT THAT SHAPES EVERYTHING HERE ────────────────────────────
 * Publishing an announcement must NEVER require an app release. A release only
 * reaches the phones that take it, so anything the modal needs from the binary
 * (a string, a screen, a flag) is a thing that cannot be announced to the people who
 * most need announcing to. Everything the author controls — both languages, the
 * image, the link, the date, the author name — arrives as data from
 * GET /announcements/. The binary contributes only chrome.
 *
 * ── SEEN STATE IS ASYNCSTORAGE, DELIBERATELY ──────────────────────────────────
 * One key per user holding the id of the newest announcement they have been shown.
 * `latest.id !== storedId` is the entire unread rule, and it needs no read-receipt
 * table, no write on boot, and no backend state for a feature whose job is to show a
 * paragraph of text. The accepted cost is that a reinstall (or a new device) shows
 * the current announcement once more. That is the right trade: the alternative is a
 * per-user write on every launch, forever.
 *
 * Note the key is the id of the NEWEST announcement, not a set of everything read.
 * Announcements arrive newest-first and there are at most three, so "you have seen
 * the top one" is a sufficient summary — and it degrades the safe way, because a new
 * publish always changes the top id.
 *
 * ── WHY A CONTEXT AND NOT LOCAL STATE IN THE MODAL ────────────────────────────
 * Two consumers, in different trees: the modal itself (mounted at the root, beside
 * UpdateGate) and the mail button in the dashboard hero, which needs the unread dot
 * and has to be able to open the modal. One fetch, one piece of truth.
 */
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { useAuth } from './AuthContext';
import type { Announcement } from '../lib/announcements';

const BASE = 'https://dollarseeds-1.onrender.com';

/**
 * Per-user, matching the `<prefix>_<userId>` convention in constants/onboarding.ts
 * and constants/premium.ts. Device-global would be simpler but wrong on a shared
 * phone: the second account to sign in would never be shown an announcement the
 * first had already dismissed.
 */
export const announcementSeenKey = (userId: string) => `announcement_last_seen_${userId}`;

type AnnouncementsContextType = {
    /** Newest first, at most three. Empty until the fetch lands — and after it, if
     *  nothing is published, which is the feature's normal resting state. */
    announcements: Announcement[];
    /** True when the newest announcement has not been shown to this user yet. */
    unread: boolean;
    /** Whether the modal is on screen. */
    visible: boolean;
    /** Which announcement the modal is showing (index into `announcements`). */
    index: number;
    setIndex: (next: number) => void;
    open: () => void;
    close: () => void;
};

const AnnouncementsContext = createContext<AnnouncementsContextType>({
    announcements: [],
    unread: false,
    visible: false,
    index: 0,
    setIndex: () => {},
    open: () => {},
    close: () => {},
});

export const useAnnouncements = () => useContext(AnnouncementsContext);

export function AnnouncementsProvider({ children }: { children: React.ReactNode }) {
    const { user, initialized } = useAuth();

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [seenId, setSeenId] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [index, setIndex] = useState(0);

    /**
     * Record the newest id as seen. Called the moment the modal goes up — by the
     * auto-open below, and by an explicit tap on the mail button — which is what
     * clears the unread dot.
     *
     * State first, storage second, and a storage failure is swallowed: the dot is
     * cleared for this session either way, and re-showing one announcement after a
     * failed write is a smaller harm than an error surfaced over a screen the user
     * did not ask for.
     */
    const markSeen = useCallback(async (id: string) => {
        setSeenId(id);
        if (!user?.id) return;
        try {
            await AsyncStorage.setItem(announcementSeenKey(user.id), id);
        } catch (err) {
            console.error('Announcement seen flag write error:', err);
        }
    }, [user?.id]);

    // ── Boot: read the flag, fetch, and auto-open if the top one is new ───────
    //
    // Boot only, not on every foreground. An announcement appearing over whatever
    // the user happened to be doing is worse than one arriving a launch later, and
    // the mail button is always there for someone who wants to look.
    useEffect(() => {
        if (!initialized || !user?.id) {
            setAnnouncements([]);
            setSeenId(null);
            setVisible(false);
            return;
        }

        let cancelled = false;
        (async () => {
            let stored: string | null = null;
            try {
                stored = await AsyncStorage.getItem(announcementSeenKey(user.id));
            } catch (err) {
                console.error('Announcement seen flag read error:', err);
                // Treated as "nothing seen". Worst case the user is shown the current
                // announcement once more — the same cost as a reinstall, and far
                // better than suppressing one because storage hiccuped.
            }
            if (cancelled) return;
            setSeenId(stored);

            let rows: Announcement[] = [];
            try {
                const res = await axios.get(`${BASE}/announcements/`);
                rows = Array.isArray(res.data?.data) ? res.data.data : [];
            } catch (err) {
                // Offline, or the backend is unhappy. No modal, no dot, no error UI —
                // announcements are the least important thing on screen.
                if (err instanceof Error) console.error('Announcements fetch error:', err.message);
                return;
            }
            if (cancelled) return;

            setAnnouncements(rows);
            const latest = rows[0];
            if (latest && latest.id !== stored) {
                setIndex(0);
                setVisible(true);
                markSeen(latest.id);
            }
        })();

        return () => { cancelled = true; };
    }, [initialized, user?.id, markSeen]);

    const latestId = announcements[0]?.id ?? null;
    const unread = !!latestId && latestId !== seenId;

    const open = useCallback(() => {
        if (!announcements.length) return;
        setIndex(0);
        setVisible(true);
        if (latestId) markSeen(latestId);
    }, [announcements.length, latestId, markSeen]);

    const close = useCallback(() => setVisible(false), []);

    const value = useMemo<AnnouncementsContextType>(() => ({
        announcements, unread, visible, index, setIndex, open, close,
    }), [announcements, unread, visible, index, open, close]);

    return (
        <AnnouncementsContext.Provider value={value}>
            {children}
        </AnnouncementsContext.Provider>
    );
}
