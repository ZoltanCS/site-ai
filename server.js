import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

const SYSTEM_PROMPT = `Te egy segítőkész chatbot vagy ezen a weboldalon. 
Rövid, tömör válaszokat adj, ne használj markdownt, ne írj felesleges körítést.`;

app.get('/', (req, res) => {
  res.send('chatbot-api ok');
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message (string) kell a body-ban' });
    }

    const fullPrompt = `${SYSTEM_PROMPT}\n\nUser: ${message}\nAssistant:`;

    // Vercel AI Gateway hívása (Comet a háttérben)
    const upstream = await fetch(process.env.VERCEL_AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VERCEL_AI_GATEWAY_KEY}`
      },
      body: JSON.stringify({
        model: process.env.VERCEL_AI_MODEL || 'perplexity/comet',
        messages: [
          { role: 'user', content: fullPrompt }
        ],
        stream: true
      })
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      console.error('Upstream error:', upstream.status, text);
      return res.status(502).json({ error: 'upstream (Vercel AI Gateway) error' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }

    res.end();
  } catch (err) {
    console.error('Internal error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal server error' });
    } else {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`chatbot-api listening on port ${PORT}`);
});