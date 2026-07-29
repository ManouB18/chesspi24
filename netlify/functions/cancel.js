const axios = require('axios');

exports.handler = async (event) => {
    const PI_API_KEY = process.env.PI_API_KEY;
    try {
        const body = JSON.parse(event.body);
        const paymentId = body.paymentId;
        const axiosClient = axios.create({ baseURL: 'https://api.minepi.com' });
        const config = { headers: { 'Authorization': `Key ${PI_API_KEY}` } };
        await axiosClient.post(`/v2/payments/${paymentId}/cancel`, {}, config);
        return { statusCode: 200, body: JSON.stringify({ message: 'Canceled' }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Cancel failed' }) };
    }

};


