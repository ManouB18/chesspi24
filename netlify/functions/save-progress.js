// netlify/functions/save-progress.js
//
// Saves a player's progress (unlocked levels/themes), keyed by their Pi
// Network user ID (verified server-side via the access token, same as
// get-progress.js). Progress is MERGED with whatever is already saved
// (union of both lists) rather than overwritten, so a stale/offline client
// can never accidentally erase unlocks the player already has.
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

const DEFAULT_PROGRESS = {
    unlockedLevels: ['easy'],
    unlockedThemes: ['brown'],
    unlockedPieceSets: ['neo']
};

exports.handler = async (event) => {
    try {
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
        }

        const body = JSON.parse(event.body);
        const accessToken = body.accessToken;
        const incomingProgress = body.progress;

        if (!accessToken || !incomingProgress) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing accessToken or progress' }) };
        }

        let uid;
        try {
            const meResponse = await axios.get('https://api.minepi.com/v2/me', {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10000
            });
            uid = meResponse.data && meResponse.data.uid;
        } catch (verifyError) {
            console.error('Pi token verification failed:', verifyError.response ? verifyError.response.data : verifyError.message);
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired Pi access token' }) };
        }

        if (!uid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Could not verify Pi user' }) };
        }

        const store = getBlobStore('player-progress');
        const existingProgress = (await store.get(uid, { type: 'json' })) || DEFAULT_PROGRESS;

        // Union merge: a level/theme unlocked either before or now stays unlocked.
        const mergedProgress = {
            unlockedLevels: Array.from(new Set([
                ...(existingProgress.unlockedLevels || []),
                ...(incomingProgress.unlockedLevels || [])
            ])),
            unlockedThemes: Array.from(new Set([
                ...(existingProgress.unlockedThemes || []),
                ...(incomingProgress.unlockedThemes || [])
            ])),
            unlockedPieceSets: Array.from(new Set([
                ...(existingProgress.unlockedPieceSets || []),
                ...(incomingProgress.unlockedPieceSets || [])
            ]))
        };

        await store.setJSON(uid, mergedProgress);

        return { statusCode: 200, body: JSON.stringify(mergedProgress) };
    } catch (error) {
        console.error('save-progress error:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save progress' }) };
    }
};
