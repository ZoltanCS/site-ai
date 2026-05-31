# chatbot-api

POST /api/chat
Body:
{
  "message": "szöveg"
}

Env vars:
- VERCEL_AI_GATEWAY_URL
- VERCEL_AI_GATEWAY_KEY
- VERCEL_AI_MODEL (opcionális, default: perplexity/comet)