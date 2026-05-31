# chatbot-api

Külön Node.js API szerver Cloud Runhoz, amely:

- fogadja a weboldal kérését,
- hozzáad egy saját system promptot,
- továbbküldi a kérést a Vercel AI Gateway egységes endpointjára,
- streamingelve visszaadja a választ a kliensnek.

Ez a repo GitHub-ból közvetlenül deployolható Cloud Runra.

## Áttekintés

Ajánlott flow:

1. Frontend (`vercel.app` vagy saját domain) meghívja a `POST /api/chat` endpointot.
2. Ez a szerver beteszi a saját `system` promptot.
3. A szerver továbbküldi a requestet a Vercel AI Gateway unified endpointjára.
4. A modell streaming válasza változtatás nélkül visszamegy a frontendnek.

## Könyvtárstruktúra

```txt
.
├── package.json
├── server.js
└── README.md
```

## Követelmények

- Node.js 18+
- Google Cloud project
- Cloud Run engedélyezve
- GitHub repo
- Vercel AI Gateway API kulcs
- Vercel AI Gateway unified endpoint URL

## Environment variables

Cloud Runban ezeket add meg:

| Név | Kötelező | Leírás |
|---|---|---|
| `VERCEL_AI_GATEWAY_URL` | Igen | A Vercel AI Gateway egységes endpointja. |
| `VERCEL_AI_GATEWAY_KEY` | Igen | Bearer token a Gatewayhez. |
| `VERCEL_AI_MODEL` | Nem | Default modellazonosító, ha a kliens nem küld modellt. |
| `SYSTEM_PROMPT` | Nem | Saját alap system prompt. |
| `PORT` | Nem | Cloud Run automatikusan adja, default: `8080`. |

## API dokumentáció

### Base URL

Cloud Run után például:

```txt
https://your-service-xxxxx-ew.a.run.app
```

Később saját domainnel például:

```txt
https://api.pelda.hu
```

### 1. `GET /`

Egyszerű service info endpoint.

#### Példa request

```bash
curl https://api.pelda.hu/
```

#### Példa response

```json
{
  "ok": true,
  "service": "chatbot-api",
  "endpoints": ["/health", "/api/chat"]
}
```

### 2. `GET /health`

Healthcheck endpoint load balancerhez, uptime checkhez vagy gyors teszthez.

#### Példa request

```bash
curl https://api.pelda.hu/health
```

#### Példa response

```json
{
  "ok": true
}
```

### 3. `POST /api/chat`

Chat endpoint, amely a bejövő user promptot vagy messages tömböt a saját system prompttal együtt továbbítja a Vercel AI Gateway felé.

#### Request headers

| Header | Kötelező | Érték |
|---|---|---|
| `Content-Type` | Igen | `application/json` |

#### Támogatott request body formátumok

##### A) Egyszerű forma

```json
{
  "userPrompt": "Írj egy rövid bemutatkozó szöveget.",
  "model": "perplexity/sonar-reasoning-pro",
  "temperature": 0.4,
  "max_tokens": 200
}
```

##### B) Chat üzenetlista

```json
{
  "messages": [
    { "role": "user", "content": "Szia" },
    { "role": "assistant", "content": "Szia! Miben segíthetek?" },
    { "role": "user", "content": "Írj rólam egy rövid bio-t." }
  ],
  "model": "perplexity/sonar-reasoning-pro",
  "temperature": 0.2,
  "max_tokens": 180
}
```

#### Request body mezők

| Mező | Típus | Kötelező | Leírás |
|---|---|---|---|
| `userPrompt` | `string` | Feltételes | Egyszerű együzenetes kérés. |
| `messages` | `array` | Feltételes | OpenAI-szerű üzenetlista, de csak bemenetként; ebből épül az upstream kérés. |
| `systemPrompt` | `string` | Nem | Felülírja a szerver oldali alap system promptot az adott kéréshez. |
| `model` | `string` | Nem | Ha megadod, ezzel megy az upstream kérés. |
| `temperature` | `number` | Nem | Továbbítva az upstream modellnek. |
| `max_tokens` | `number` | Nem | Továbbítva az upstream modellnek. |

#### Szerveroldali viselkedés

A szerver mindig az alábbi logikát követi:

1. Ha van `messages`, akkor elé beszúr egy `system` üzenetet.
2. Ha nincs `messages`, de van `userPrompt`, akkor ebből épít egy két elemes listát: `system` + `user`.
3. Az így kapott `messages` tömböt elküldi a Gateway endpointnak `stream: true` módban.
4. A streamet változtatás nélkül továbbítja a kliens felé.

#### Példa frontend fetch

```js
const response = await fetch('https://api.pelda.hu/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userPrompt: 'Írj egy 2 mondatos termékleírást.',
    model: 'perplexity/sonar-reasoning-pro'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let output = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  output += decoder.decode(value, { stream: true });
}

console.log(output);
```

#### Példa curl

```bash
curl -N -X POST 'https://api.pelda.hu/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "userPrompt": "Írj egy rövid választ.",
    "model": "perplexity/sonar-reasoning-pro"
  }'
```

#### Sikeres válasz

A válasz streaming, ezért a pontos formátum attól függ, hogy a Vercel AI Gateway milyen stream formátumot ad vissza az adott modellen. A szerver ezt nem alakítja át, csak továbbítja.

Tipikusan:

- `text/event-stream`, vagy
- az upstream által adott egyéb streamelt tartalom.

#### Hiba válaszok

##### `400 Bad Request`

Ha nincs `userPrompt`, és nincs használható `messages` tömb sem.

```json
{
  "error": "Send either { messages: [...] } or { userPrompt: string }."
}
```

##### `500 Internal Server Error`

Ha hiányzik a Gateway konfiguráció vagy belső hiba történik.

```json
{
  "error": "Gateway env vars are missing."
}
```

vagy

```json
{
  "error": "Internal server error."
}
```

##### `502` vagy upstream státusz

Ha a Gateway hívás hibával tér vissza.

```json
{
  "error": "Upstream request failed.",
  "details": "..."
}
```

## Ajánlott frontend kérésforma

Ha saját UI-d van, ezt a body formátumot érdemes használni:

```json
{
  "messages": [
    { "role": "user", "content": "Kérdésem..." }
  ]
}
```

Ez később könnyebben bővíthető:

- conversation history,
- újrarenderelés,
- retry,
- tool call metaadatok,
- tenant-specifikus promptok.

## Deploy Cloud Runra GitHubból

### 1. Repo feltöltése GitHubra

Tedd fel ezt a repót GitHubra.

### 2. Cloud Run Console

Google Cloud Console -> Cloud Run -> `Services` -> `Create service`.

### 3. Source deploy

- Válaszd a repository alapú deployt.
- `Connect repository`
- Csatold a GitHub accountot.
- Válaszd ki ezt a repót.

### 4. Build beállítások

- Runtime felismerhető a `package.json` alapján.
- Buildpacks elég, külön Dockerfile nem kell.

### 5. Service beállítások

Ajánlott:

- Service name: `chatbot-api`
- Region: `europe-west1`
- Authentication: `Allow unauthenticated invocations`
- Min instances: `0`
- Max instances: `10`
- Port: `8080`

### 6. Environment variables felvétele

Add hozzá:

```txt
VERCEL_AI_GATEWAY_URL=...
VERCEL_AI_GATEWAY_KEY=...
VERCEL_AI_MODEL=perplexity/sonar-reasoning-pro
SYSTEM_PROMPT=Te egy segítőkész chatbot vagy...
```

### 7. Deploy

Nyomj deployt, és pár perc múlva kapsz egy publikus URL-t.

## Saját domain

A deploy után Cloud Runban be tudsz állítani saját domaint is:

- Cloud Run -> service -> custom domains
- add mapping
- DNS rekordok felvétele a domain szolgáltatónál

Példa:

```txt
api.pelda.hu
```

## Biztonsági megjegyzések

- A `VERCEL_AI_GATEWAY_KEY` csak szerveroldalon legyen.
- Frontendből soha ne hívd közvetlenül a Gatewayt, ha saját promptolást akarsz enforce-olni.
- Ha több site használja ugyanazt az API-t, érdemes authot vagy origin whitelistet rakni elé.
- Productionben érdemes rate limitet is tenni elé.

## További bővítési ötletek

- API kulcs alapú saját auth
- tenantonként külön prompt
- request logging
- usage logging
- rate limit
- per-domain config
- moderation layer
- analytics