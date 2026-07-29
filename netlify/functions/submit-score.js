// netlify/functions/submit-score.js
//
// Saves/updates a player's leaderboard entry, keyed by their Pi Network
// user ID (verified server-side via the access token, same as
// get-progress.js / save-progress.js). The username is also taken from
// Pi's own verified response rather than trusted from the client, so a
// player can't spoof a fake display name on the leaderboard.
//
// Alongside each player's own record, we maintain a single "top 50" blob
// (LEADERBOARD_TOP_KEY) updated incrementally right here. This means
// get-leaderboard.js can just read one blob instead of scanning every
// player on every page view — see that file for details.
const axios = require('axios');
const { getStore } = require('@netlify/blobs');

// See get-leaderboard.js for why this manual-override helper exists.
function getBlobStore(name) {
    const siteID = process.env.BLOBS_SITE_ID;
    const token = process.env.BLOBS_TOKEN;
    if (siteID && token) {
        return getStore({ name, siteID, token });
    }
    return getStore(name);
}

const LEADERBOARD_TOP_KEY = '__leaderboard_top50__';
const TOP_N = 50;

function isBetter(a, b) {
    // true if entry a ranks above entry b (more wins, then higher win rate)
    if (a.wins !== b.wins) return a.wins > b.wins;
    return (Number(a.winRate) || 0) > (Number(b.winRate) || 0);
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
        }
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
        }

        const body = JSON.parse(event.body);
        const accessToken = body.accessToken;

        if (!accessToken) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing accessToken' }) };
        }

        // Verify the token with Pi Network and get the real, server-confirmed
        // UID and username — never trust these from the client directly.
        let uid, username;
        try {
            const meResponse = await axios.get('https://api.minepi.com/v2/me', {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10000
            });
            uid = meResponse.data && meResponse.data.uid;
            username = meResponse.data && meResponse.data.username;
        } catch (verifyError) {
            console.error('Pi token verification failed:', verifyError.response ? verifyError.response.data : verifyError.message);
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired Pi access token' }) };
        }

        if (!uid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Could not verify Pi user' }) };
        }

        // Basic sanity limits on the incoming numbers so a malformed/odd
        // client payload can't corrupt the stored entry with garbage types.
        const wins = Number.isFinite(body.wins) ? Math.max(0, Math.floor(body.wins)) : 0;
        const gamesPlayed = Number.isFinite(body.gamesPlayed) ? Math.max(0, Math.floor(body.gamesPlayed)) : 0;
        const winRate = Number.isFinite(Number(body.winRate)) ? Number(body.winRate) : 0;

        const entry = {
            uid,
            username: username || 'Guest',
            wins,
            gamesPlayed,
            winRate,
            updatedAt: new Date().toISOString()
        };

        const store = getBlobStore('leaderboard');
        await store.setJSON(uid, entry);

        // Keep the top-50 blob in sync so get-leaderboard.js never has to
        // scan every player. We only rewrite it when this update could
        // actually change the top 50 — i.e. the player was already on the
        // board (their row needs updating/re-sorting) or they now beat the
        // current #50 (or the board isn't full yet).
        try {
            let top = await store.get(LEADERBOARD_TOP_KEY, { type: 'json' });
            if (!Array.isArray(top)) top = [];

            const existingIndex = top.findIndex((e) => e.uid === uid);
            const wasOnBoard = existingIndex !== -1;
            const boardFull = top.length >= TOP_N;
            const beatsLast = !boardFull || isBetter(entry, top[top.length - 1]);

            if (wasOnBoard || beatsLast) {
                if (wasOnBoard) top.splice(existingIndex, 1);
                top.push(entry);
                top.sort((a, b) => {
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    return (Number(b.winRate) || 0) - (Number(a.winRate) || 0);
                });
                if (top.length > TOP_N) top = top.slice(0, TOP_N);
                await store.setJSON(LEADERBOARD_TOP_KEY, top);
            }
        } catch (topError) {
            // The player's own score is already saved safely above; failing
            // to refresh the top-50 cache shouldn't fail the whole request.
            console.error('submit-score: failed to update top-50 cache:', topError.message);
        }

        return { statusCode: 200, body: JSON.stringify(entry) };
    } catch (error) {
        console.error('submit-score error:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to submit score' }) };
    }
};

