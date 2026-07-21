/**
 * Global axios defaults — imported once for its side effect (see app/_layout.tsx).
 *
 * Every screen calls the bare `axios` singleton directly (no shared instance), so
 * setting a default here applies everywhere. Without a timeout, a stalled or
 * dropped connection leaves a request pending forever: spinners that never
 * resolve, buttons stuck disabled, screens that look frozen. App Review flags
 * that as the app hanging. 15s gives slow mobile networks room without leaving
 * the UI blocked indefinitely.
 */
import axios from 'axios';

axios.defaults.timeout = 15000;
