# CipherSend — updated zero-storage P2P plan

## Approved request and scope

This plan replaces the earlier Supabase file-storage specification with the user's newer attachment: **CipherSend – Zero-Storage Secure File Transfer Protocol**. Build a functional Next.js, React, TypeScript, Tailwind, Web Crypto, AES-256-GCM, WebRTC DataChannel, lightweight WebSocket signaling application. The Next.js frontend is deployable to Vercel. Vercel Functions now support WebSockets, but separate connections are not guaranteed to reach the same function instance; in-memory signaling rooms therefore cannot be shared reliably without external state. Keep signaling as a separate, single-instance Node WebSocket process so rooms stay ephemeral and no database is needed. Do not add accounts, permanent databases, or permanent file storage. Do not claim no information ever passes through servers: temporary signaling metadata and WebRTC negotiation pass through the signaling service; file bytes travel via WebRTC DataChannel and can be directly peer-to-peer when network topology permits. The application itself will not store transfer metadata or files persistently.

The sender creates a cryptographically random room identifier and an independent 256-bit AES key locally. The displayed/copied transfer code contains both in a structured form (public room identifier plus a separate secret key component). Receiver code parsing stays local; only the room identifier is sent to the signaling service. The service therefore cannot learn the AES key from the code. The public room ID is a uniformly random, non-sequential, non-personal session locator; format it as grouped human-readable text. The full code is a bearer secret: anyone who gets it may join and decrypt the transfer, so the UI must warn users to share it privately.

Encrypt file metadata and content in the browser with AES-256-GCM. Use an independent IV per record/chunk (a random prefix and monotonic unique counter, with an explicit no-wrap invariant) and authenticated additional data to bind transfer/chunk context. DataChannel packets contain ciphertext only; the signaling service receives only room IDs, WebRTC offers/answers, and ICE candidates. Never send the key, original file, or plaintext through signaling. The receiver decrypts chunks locally. Read sender files chunk-by-chunk using `File.slice()`; honor DataChannel backpressure. On browsers that support the File System Access API, write decrypted chunks directly to the chosen destination; provide a Blob-based fallback for browsers without streaming file access and document its memory limitation.

The lightweight signaling service has in-memory rooms only, accepts at most one sender and one receiver per room, validates room identifiers and signaling message schemas, caps message sizes/rates, expires idle sessions, removes room state after completion/disconnect/timeout, and never writes room contents or ICE data to application logs or disk. No account, login, permanent database, or user profile. Signaling-provider transport logs and network providers may still process transient connection metadata such as IPs; disclose this limitation and do not claim zero metadata reaches infrastructure. Use a configurable public STUN list by default; explain that restrictive networks may prevent a direct connection and that a relay/TURN service, if deliberately added, can carry ciphertext through its relay infrastructure. Do not add a TURN provider/key without asking.

## Application routes and interactions

- `/`: branded landing page with CipherSend logo, exact heading “Your Files. Your Privacy. Zero Storage.”, Send File and Receive File actions, How It Works, Security Features, and footer.
- `/send`: drag/drop or select files; show locally encrypted status, generated transfer code, copy-code action, connection status, and transfer progress. Create a room with the public ID, wait for receiver, negotiate WebRTC, and send encrypted metadata and ciphertext chunks through the DataChannel. Expire inactive sessions and clean temporary signaling state after transfer.
- `/receive`: accept the full transfer code; parse it in the browser, send only the public room ID to signaling, connect via WebRTC, receive encrypted metadata/chunks, decrypt locally, and present the original file for download. Show clear invalid-code, expired-session, sender-offline, connection, receive, and decryption states.

## Security and user-facing honesty

- Use Web Crypto APIs only; do not implement a cipher.
- Generate the room locator and AES-256 key with cryptographically secure randomness; do not encode personal information or use sequential identifiers.
- The service sees only the public room ID plus SDP offers/answers and ICE candidates. It must never receive the AES secret component, key, original file, plaintext content, or encrypted file chunks.
- Use WebRTC DataChannels to carry ciphertext between clients; encrypt before send, decrypt after receive. Encryption keys remain in browser memory and in the user's transfer code only.
- Keep temporary room state memory-only with bounded sizes/rates and expiry. Clean up sockets, channels, peer connections, timers, and temporary files when transfer completes or is cancelled.
- No persistent database, permanent file storage, account system, or original-file upload to servers.
- Include security limitations: users who obtain the full code can decrypt; WebRTC may fail behind restrictive NAT/firewall setups; optional TURN relay infrastructure would see encrypted traffic; browsers and hosting providers process some transient connection/operational metadata; the project has not been independently audited.

## Design system (retain the approved visual direction and adapt copy)

- **Design movement:** restrained cyber-editorial / modern secure utility, not a neon arcade or generic dashboard.
- **Core principles:** privacy-first hierarchy; accessible high-contrast controls; transparent security language; clear real-time transfer feedback.
- **Color philosophy:** ink/graphite surfaces communicate discretion; cool mint-cyan marks trusted actions and active transfer; warm amber/red is reserved for warnings and errors.
- **Layout paradigm:** editorial landing page with a focused sender/receiver workspace; keep the transfer steps legible rather than using a generic dashboard grid.
- **Signature elements:** shield/arrow CipherSend monogram; fine circuit/progress path; bounded session-state chips.
- **Interaction:** immediate drag/drop feedback, explicit connect/connected/transferring/completed/error states, reduced-motion support, and accessible focus/keyboard states.
- **Animation:** subtle 150–220 ms UI transitions and a restrained connection pulse; no motion that obscures progress; honor `prefers-reduced-motion`.
- **Typography:** system sans for primary text, monospace for transfer-code groups and live connection labels; avoid remote font dependencies.
- **Brand essence:** a discreet, precise, reassuring student-built tool for direct private file handoff.
- **Brand voice:** calm and candid. Examples: “Encrypted in your browser. Sent over a peer connection.” and “The transfer code is the key—share it privately.”
- **Wordmark/logo:** shield outline with a split-arrow/key motif beside the CipherSend wordmark; accessible inline SVG/CSS mark.
- **Signature brand color:** cool mint-cyan used sparingly for trusted actions and transfer states.

## Project structure

```text
app/
  layout.tsx                  Shared shell and metadata
  page.tsx                    Home page
  send/page.tsx               Sender workspace
  receive/page.tsx            Receiver code-entry workspace
components/
  site-header.tsx              Brand/navigation
  site-footer.tsx              Honest project/security footer
  sender-transfer.tsx          Sender states and progress
  receiver-transfer.tsx        Receiver states and progress
lib/
  crypto/                      AES-GCM, IV sequencing, code parsing
  transfer/                    DataChannel protocol, chunking/backpressure
  signaling/                   Browser WebSocket client and schemas
  validation/                  Transfer code and message validation
signaling/
  src/server.ts                In-memory WebSocket rooms and session expiry
  tsconfig.json                Independent signaling TypeScript build
tests/
  crypto.test.ts               Key/code and authenticated-encryption tests
render.yaml                    Single-instance signaling-service blueprint
.env.example                   Local frontend signaling URL
package.json                   Frontend, signaling, and test scripts
public/manus-routes.json       Static route manifest
README.md                      Architecture, threat model, setup, deployment and limitations
plan.md                        This updated architecture and design plan
TODO.md                        Full acceptance criteria from the new attachment
```

## Delivery sequence

1. Adapt the existing home/send/receive UI to the new exact copy and receiver code-entry flow; keep the current responsive visual system and remove stale Supabase wording.
2. Implement transfer-code generation/parsing and chunked browser AES-GCM encryption/decryption, while keeping the AES secret component out of any signaling message.
3. Implement DataChannel transfer framing, backpressure, progress, streaming save support where available, fallback behavior, and cleanup.
4. Implement and connect the separate memory-only WebSocket signaling process with schema/rate limits and inactive-session expiry.
5. Document how the system works, its security limitations, local development, Vercel frontend deployment, and separate WebSocket-service deployment; run TypeScript diagnostics and project checks. Publishing is not included unless requested.

## Hosting/deployment dependency

Vercel serves the Next.js frontend. Vercel's current WebSocket support is documented, but new connections can reach different function instances and reconnects are not pinned; a shared store would be needed for cross-instance in-memory rooms. The chosen companion signaling service therefore runs as one Render web-service instance, binds to `0.0.0.0:$PORT`, and keeps rooms only in process memory. It uses `NEXT_PUBLIC_SIGNALING_URL` in the browser and an explicit origin allowlist. Render also load-balances new WebSocket connections randomly, so do not scale signaling horizontally without changing the architecture to shared coordination state. A TURN server is optional and not provisioned by this plan; without a relay, some network pairs may not connect.
