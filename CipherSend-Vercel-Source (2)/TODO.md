# CipherSend — updated acceptance outcomes

## 1. Home page and interface design — complete
- Create a clean, premium cybersecurity-themed interface.
- Include the CipherSend logo.
- Display the exact heading: “Your Files. Your Privacy. Zero Storage.”
- Include Send File and Receive File buttons.
- Include How It Works and Security Features sections.
- Provide a sender page with a file upload area, encryption status, generated transfer code, Copy Code button, connection status, and transfer progress.
- Provide a receiver page with transfer-code entry, Connect button, receiving status, decryption progress, and Download button.
- Keep the code understandable for third-year B.Tech Cybersecurity students.

## 2. Local cryptography and private transfer code — complete
- Encrypt files locally in the browser with AES-256-GCM.
- Generate random 256-bit encryption keys and cryptographically secure random IVs.
- Perform encryption entirely inside the browser; transmit no plaintext file contents.
- The encryption key must never be sent to the signaling server.
- Generate a cryptographically secure random transfer identifier; do not use sequential identifiers and do not include personal information.
- The transfer code must allow the receiver to discover the sender's temporary WebRTC signaling session.
- Implement expiration for inactive sessions.

## 3. Receiver connection and WebRTC signaling — complete
- Create a receiver page where users can enter the transfer code, connect to the sender, see connection status, receive the encrypted file, decrypt the file locally, and download the original file.
- If the sender is offline, show a clear error.
- Implement a lightweight WebSocket signaling service.
- The signaling server should only exchange temporary session identifiers, WebRTC offers, WebRTC answers, and ICE candidates.
- The signaling server must never receive original files, encryption keys, or plaintext file contents.
- Once the WebRTC connection is established, send the encrypted file through WebRTC DataChannels directly between the two browsers.

## 4. File support, chunking, progress, and cleanup — complete
- Support PDF, JPG, PNG, DOCX, ZIP, TXT, and other common file formats.
- Implement chunked transfer to support larger files without loading the entire file into memory.
- Display upload and download progress.
- Automatically expire temporary signaling sessions.
- Clear temporary session information after transfer completion.

## 5. Zero-permanent-storage privacy and honest security claims — complete
- The project follows a zero-permanent-storage architecture.
- Do not require user registration or user accounts.
- Do not use permanent file storage or a permanent file database.
- Do not collect personal information or store encryption keys.
- Do not upload original files to servers.
- Do not claim that no data ever passes through a server. Explain that temporary signaling metadata passes through the signaling service, while file contents travel through WebRTC.
- Explain the security limitations without claiming independent audit or absolute security.

## 6. Vercel and signaling deployment instructions — complete
- Prepare the Next.js frontend for Vercel.
- Deploy the signaling service separately if the selected hosting platform does not support persistent WebSocket connections.
- Provide exact deployment instructions for the frontend and separate signaling service.

## 7. Beginner-friendly documentation — complete
- Create a README explaining the system architecture, how AES-256-GCM works in this application, how WebRTC works, how the signaling server works, how files are transferred, security limitations, installation instructions, and deployment instructions.

## 8. Staged functional implementation — in progress
## 8. Staged functional implementation — complete
- Build step by step: first implement the frontend; then implement encryption and decryption; then implement WebRTC signaling; then implement peer-to-peer file transfer; finally test the complete application.
- Do not create a fake demonstration. All buttons and major features must work.
- The final application must be functional, secure by design, and deployable.
- Evidence: production Next.js build, TypeScript checks, all five crypto tests, signaling build, two-client signaling smoke test, Preview route checks, and read-only implementation review pass. A locally served production build and the real local WebSocket signaling process were exercised in two independent Chromium contexts. The UI transferred a 250,321-byte multi-chunk file; the displayed transfer code parsed successfully, Copy Code matched the parseable code, sender status was “Transfer complete,” receiver status was “File received and authenticated,” and both progress values reached 100%. The downloaded file matched the source byte-for-byte and by SHA-256 (`7bb7ee2925e2ceea23de97334e131711f1a61de6545abefa2df40006364e82f0`); no browser page or console errors were reported. This verifies a local production build, not a hosted deployment.
