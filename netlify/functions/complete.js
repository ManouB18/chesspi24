const axios = require('axios');

exports.handler = async (event) => {
  const PI_API_KEY = process.env.PI_API_KEY;

  try {
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No body provided' }) };
    }

    const body = JSON.parse(event.body);
    const { paymentId, txid } = body;

    if (!paymentId || !txid) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing paymentId or txid' }) };
    }

    const axiosClient = axios.create({ baseURL: 'https://api.minepi.com' });
    const config = { headers: { 'Authorization': `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 };

    await axiosClient.post(`/v2/payments/${paymentId}/complete`, { txid }, config);
    return { statusCode: 200, body: JSON.stringify({ message: 'Completed' }) };
  } catch (error) {
    console.error('Error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Completion failed: ' + error.message }) };
  }
};




