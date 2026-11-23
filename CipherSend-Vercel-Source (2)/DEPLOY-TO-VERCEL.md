# Deploy CipherSend with Vercel Drop

CipherSend's Next.js website can be uploaded to Vercel, but the app also needs its separate WebSocket signaling service. The signaling process stores temporary transfer-room coordination in memory, so keep it to one instance.

## 1. Deploy the signaling service

The included `render.yaml` configures the signaling service for Render. Render Blueprints are connected to a Git repository, so first put this source on a Git provider and connect that repository in Render. In the Render Dashboard, choose **New → Blueprint**, select the repository and branch containing `render.yaml`, review it, and deploy.

Set `CIPHERSEND_ALLOWED_ORIGINS` on the signaling service to the exact Vercel site origin, such as `https://your-project.vercel.app` (no trailing slash). Keep the service at one instance. When Render provides its hostname, confirm `https://<service-host>/healthz` returns `ok`. The WebSocket URL is `wss://<service-host>/ws`.

## 2. Drag the app ZIP into Vercel

1. Sign in to Vercel and open [vercel.com/drop](https://vercel.com/drop).
2. Drag this ZIP into the page. Vercel Drop accepts ZIP archives. Choose your team and a project name, then deploy.
3. In the Vercel project settings, add the environment variable `NEXT_PUBLIC_SIGNALING_URL` with the full URL from Render, for example `wss://ciphersend-signaling.onrender.com/ws`.
4. Redeploy so the variable is included in the browser app.
5. Add the final Vercel URL as an allowed origin in Render's `CIPHERSEND_ALLOWED_ORIGINS`, if you did not know it when configuring Render. Redeploy/restart the signaling service after changing that setting.
6. Test with two browser profiles and a small file first.

`NEXT_PUBLIC_SIGNALING_URL` is a public endpoint address, not a secret. Do not put credentials or private keys in it. Local development continues to use `.env.example`; the Vercel environment variable overrides the production browser endpoint.

Vercel Drop creates a new project for each drop, so it is convenient for an initial upload. For ongoing updates to the same project and URL, connect a Git repository to Vercel instead. Vercel hosts the Next.js frontend here; this ZIP upload does not deploy the separate signaling service.

For more technical details, limitations, and local setup, see `README.md`.