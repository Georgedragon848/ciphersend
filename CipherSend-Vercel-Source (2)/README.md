# CipherSend — Zero-Storage Secure File Transfer

CipherSend is a browser-based file handoff. It encrypts file metadata and file chunks on the sender's device, then transfers the encrypted bytes through a WebRTC DataChannel. There are no accounts, application file uploads, permanent file database, or server-held decryption keys.

**Zero storage describes the application design, not the whole internet path.** The temporary signaling service receives a random session ID plus WebRTC offers, answers, and ICE candidates. Those candidates may contain network-address information. The hosting provider and network infrastructure may also process ordinary connection metadata such as IP addresses. The signaling process does not receive the transfer key, original file, plaintext metadata, or file chunks, and it is written not to log room IDs, candidates, or file data.

## How a transfer works

1. The sender's browser generates a 128-bit random room ID and an independent 256-bit AES key with the Web Crypto API. The transfer code contains both values as `roomId.secretKey`. The code is a bearer secret: anyone who obtains it can join and decrypt, so share it privately.
2. The sender opens a temporary WebSocket signaling room using only the public room ID. The receiver parses the full code locally, imports the key into a non-extractable `CryptoKey`, and also sends only the public ID to signaling.
3. The two browsers exchange a WebRTC offer, answer, and ICE candidates through the signaling service. The service keeps room associations in process memory, accepts one sender and one receiver, rate/size-limits messages, expires inactive rooms after 10 minutes, and enforces a 60-minute maximum session age. Rooms are removed when a participant disconnects or the service shuts down.
4. Once WebRTC connects, file content bypasses the signaling WebSocket. The sender reads the selected file using `File.slice()` in 48 KiB chunks, encrypts each chunk locally, and sends it over an ordered, reliable DataChannel. Backpressure keeps the sender's queue bounded. The receiver authenticates and decrypts each chunk locally. It confirms completion only after all chunks match the encrypted metadata and the local save has finished.

The app uses public STUN servers to help discover network paths. It does not configure a TURN relay. Some firewall/NAT combinations may prevent a connection; the user must start a new transfer if negotiation fails. A future TURN relay could carry ciphertext and would add another infrastructure provider to the trust boundary. The WebRTC connection itself uses its standard DTLS transport protection in addition to CipherSend's application-layer encryption.

## Cryptography in this implementation

The AES key is 256 bits and is created with `crypto.getRandomValues()`. The browser imports it through `crypto.subtle.importKey()` with `extractable: false`; the secret key bytes are not sent to the signaling server. AES-GCM provides confidentiality and an authentication tag, so modified ciphertext or mismatched context fails decryption.

Each transfer has a random 32-bit IV prefix and a monotonically increasing 64-bit counter. Together they form a unique 96-bit IV for every metadata record and chunk under that transfer key. The counter has an explicit no-wrap check. Additional authenticated data binds encrypted metadata to the room and each chunk to its room and sequence number. This prevents a valid chunk from being silently substituted into another position or transfer. Metadata—including filename and MIME type—is encrypted too.

The packet header contains only the chunk index and IV; the chunk payload is AES-GCM ciphertext. The 48 KiB plaintext size plus header and authentication tag stays below common WebRTC DataChannel message limits. CipherSend uses the browser's standard Web Crypto implementation rather than implementing a cipher itself.

## Storage, downloads, and file support

CipherSend accepts any file type available to the browser; it does not rely on an extension allowlist. Sender reads are chunked. When the browser supports the File System Access API, the receiver writes decrypted chunks directly to a file location the user chooses. Otherwise, the browser holds the complete decrypted file as a Blob until the user downloads it. That fallback can use substantial memory for large files. A user-selected download is, of course, saved locally by the browser; CipherSend does not retain a server copy.

The project has no user registration, profile, permanent file storage, or application database. The key exists in browser memory and in the transfer code. Closing a page or losing the signaling service can interrupt setup; active WebRTC data transfer may continue after signaling is no longer needed, but a failed peer connection must be started again. The signaling service is intentionally one process; its volatile rooms are lost on restart.

## Security limitations

The full code is the decryption capability. A malicious sender who knows the key can create valid encrypted content, and CipherSend does not authenticate sender identity or provide an independent signature. The project has not been independently audited. Browser extensions, compromised devices, screenshots/clipboard history, and unsafe local downloads are outside the protocol's protection. STUN, the signaling host, and network providers may process transient connection metadata. This project does not promise anonymity, uninterrupted reachability, or absolute security.

## Run locally

Requirements: Node.js 20.9 or newer and pnpm 11.25 (pinned in `package.json`). From the repository root:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Open two terminals. Start the memory-only signaling service in the first:

```bash
pnpm signal:dev
```

Start Next.js in the second:

```bash
pnpm dev
```

Open `http://localhost:3000` in two browser profiles/devices. On the sender, choose a file and create a code. On the receiver, enter the entire code and connect. Localhost is treated as a secure browser context for Web Crypto and WebRTC. For another device on a LAN, configure the signaling URL and allowed origin appropriately; browsers also require a secure context for the frontend outside localhost.

Run the project checks with:

```bash
pnpm test:crypto
pnpm typecheck
pnpm signal:build
pnpm build
```

`/healthz` returns `ok` from the signaling service. The WebSocket endpoint is `/ws`.

## Deploy the signaling service to Render

Vercel Functions currently support WebSockets, but separate connections are not guaranteed to reach the same function instance. A sender and receiver could therefore land on different instances with different in-memory room maps. Vercel recommends external state for cross-instance coordination; adding that would change CipherSend's no-database design. For that reason the repository includes `render.yaml` for a separate, single-instance signaling service. Render routes new WebSocket connections randomly across service instances too, so keep this service at exactly one instance unless the architecture is changed to share coordination state. See [Vercel's WebSocket documentation](https://vercel.com/docs/functions/websockets) and [Render's WebSocket documentation](https://render.com/docs/websocket).

1. Connect the repository containing this project in Render and create the Blueprint from `render.yaml`. The service builds with `pnpm install --frozen-lockfile --prod=false && pnpm signal:build`, starts with `pnpm signal:start`, and checks `/healthz`.
2. Set `CIPHERSEND_ALLOWED_ORIGINS` to the exact frontend origin, for example `https://your-app.vercel.app`. Do not include a trailing slash. Use a comma-separated list only when you intentionally allow multiple exact origins, such as a production and a preview domain.
3. Keep the service at one instance. Render supplies `PORT`; the server binds to `0.0.0.0` and uses `/ws` for WebSockets. Copy the service hostname and verify `https://<service-host>/healthz` returns `ok`. Render WebSocket connections last until the instance shuts down, and new connections are routed randomly across instances, so deploys/restarts can interrupt signaling sessions. Review Render's [Blueprint spec](https://render.com/docs/blueprint-spec) and current plan behavior before deployment.
4. Free or otherwise interruptible hosting is not an always-on guarantee. This service stores session state only in process memory; a restart clears it. The frontend displays an error and the sender should create a new transfer code if signaling/negotiation is interrupted.

## Deploy the frontend to Vercel

1. Import the project repository into Vercel as a Next.js app. The frontend root is the repository root; use the lockfile's pnpm package manager.
2. Add the environment variable `NEXT_PUBLIC_SIGNALING_URL` with the full secure WebSocket URL, for example `wss://<service-host>/ws`. `NEXT_PUBLIC_` values are included in the browser bundle, so this should be a public endpoint URL, never a secret.
3. Redeploy the frontend after adding/changing that variable. Make sure the frontend's exact origin appears in the signaling service's `CIPHERSEND_ALLOWED_ORIGINS` list. Preview deployments need their own permitted origin if you want them to connect.
4. Open the deployed site in two browser profiles and test a small file first. Then test a larger file on the browsers and networks you expect to support. There is no TURN service configured, so some network pairs will not connect.

Optional container hosting uses the root `Dockerfile`; the frontend honors `PORT` (default 3000) and exposes an unauthenticated `/healthz` readiness route. This alternative does not run or replace the separate signaling service and is not deployed by these instructions.

The repository is prepared for deployment; deploying or publishing it is a separate action. The included hosting configuration does not create Render/Vercel accounts, connect a repository, or publish the website automatically.

## Source files

`app/` contains the landing page and `/send` and `/receive` routes. `lib/crypto/` implements transfer-code creation and AES-GCM helpers. `lib/transfer/` implements packet framing, peer setup, chunked send, streaming/fallback receive, and progress. `lib/signaling/` contains the browser WebSocket client. `signaling/src/server.ts` is the separate in-memory signaling service. `tests/crypto.test.ts` exercises transfer-code and encryption integrity behavior.
