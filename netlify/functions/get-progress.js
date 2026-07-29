// netlify/functions/get-progress.js
//
// Returns a player's saved progress (unlocked levels/themes), keyed by their
// Pi Network user ID. The UID is never trusted from the client directly —
// we verify the access token against Pi's own /v2/me endpoint first, so a
// player can't spoof someone else's UID to read/steal their progress.
const axios = require('axios');
const { getStore } = require('@netlify/blobs');

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

        if (!accessToken) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing accessToken' }) };
        }

        // Verify the token with Pi Network and get the real, server-confirmed UID.
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

        const store = getStore('player-progress');
        const savedProgress = await store.get(uid, { type: 'json' });

        return {
            statusCode: 200,
            body: JSON.stringify(savedProgress || DEFAULT_PROGRESS)
        };
    } catch (error) {
        console.error('get-progress error:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to load progress' }) };
    }
};
