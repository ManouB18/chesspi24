// netlify/functions/get-leaderboard.js
//
// Returns the top players ranked by wins. This is a public read — no Pi
// auth needed, since anyone should be able to view the leaderboard even
// before signing in.
//
// This reads a single pre-computed "top 50" blob (kept up to date by
// submit-score.js on every score submission) instead of scanning every
// stored player on every page view — much cheaper as the player base
// grows, since the cost here no longer depends on how many players exist.
//
// Fallback: if that blob doesn't exist yet (e.g. right after upgrading
// from the old full-scan version, before any new score has been
// submitted), we do one full scan here to build it, then save it so
// every request after this one hits the fast path above.
const { getStore } = require('@netlify/blobs');

const LEADERBOARD_TOP_KEY = '__leaderboard_top50__';
const MAX_ENTRIES_SCANNED = 1000; // safety cap while listing blob keys (fallback path only)
const TOP_N = 50;

async function buildTopFromFullScan(store) {
    let allKeys = [];
    let cursor;
    do {
        const page = await store.list({ cursor });
        allKeys = allKeys.concat(page.blobs.map((b) => b.key));
        cursor = page.cursor;
    } while (cursor && allKeys.length < MAX_ENTRIES_SCANNED);

    const entries = await Promise.all(
        allKeys
            .filter((key) => key !== LEADERBOARD_TOP_KEY)
            .map(async (key) => {
                try {
                    return await store.get(key, { type: 'json' });
                } catch (e) {
                    return null;
                }
            })
    );

    return entries
        .filter((e) => e && typeof e.wins === 'number')
        .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return (Number(b.winRate) || 0) - (Number(a.winRate) || 0);
        })
        .slice(0, TOP_N);
}

exports.handler = async () => {
    try {
        const store = getStore('leaderboard');

        let top = await store.get(LEADERBOARD_TOP_KEY, { type: 'json' });

        if (!Array.isArray(top)) {
            top = await buildTopFromFullScan(store);
            try {
                await store.setJSON(LEADERBOARD_TOP_KEY, top);
            } catch (e) {
                console.error('get-leaderboard: failed to save fallback-built top50:', e.message);
            }
        }

        const leaderboard = top.map((e) => ({
            uid: e.uid,
            username: e.username || 'Guest',
            wins: e.wins,
            gamesPlayed: e.gamesPlayed || 0,
            winRate: e.winRate || 0
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ leaderboard })
        };
    } catch (error) {
        console.error('get-leaderboard error:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to load leaderboard' }) };
    }
};

