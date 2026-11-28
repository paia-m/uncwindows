# Uncles Windows

Static site with one Cloudflare Pages Function (`/contact`). No separate Workers project, database, or build dependencies. The Tailscale mockup is separate from this repository.

## Deploy

1. In Cloudflare **Workers & Pages**, create a **Pages** project and connect this GitHub repo. Use the `main` branch, no framework, a blank build command, and `public` as the build output directory. Leave the root directory at the repository root so Pages detects `functions/`.
2. Decide the live hostname. Add `uncleswindows.connectar.co.nz` in the Pages **Custom domains** tab before configuring DNS. The site can deploy first: the quote form stays off unless the current hostname exactly matches `CONTACT_HOSTNAME` and all form settings are present. Keep preview environment secrets unset.
3. Create a **Managed** Turnstile widget authorised for the live hostname, and configure these **production** Pages variables/secrets. Redeploy after setting them.

| Name | Value |
| --- | --- |
| `CONTACT_HOSTNAME` | `uncleswindows.connectar.co.nz` (hostname only) |
| `TURNSTILE_SITE_KEY` | Public key of that widget |
| `TURNSTILE_SECRET_KEY` | Widget secret (encrypted) |
| `RESEND_API_KEY` | Sending-only Resend key (encrypted) |
| `FROM_EMAIL` | Resend-verified sender, e.g. `Uncles Windows <enquiries@connectar.co.nz>` if verified |
| `CONTACT_TO_EMAIL` | The confirmed operator inbox (encrypted) |

The form sends directly to that one configured inbox, with the visitor’s email as Reply-To when provided. It does not configure Cloudflare Email Routing, send customer auto-replies, or write to Glide. Confirm this interim email-only route and the privacy notice with the operator before taking live enquiries.

Run `node --test` for the mocked endpoint tests. Before announcing the site, submit one sample request from the live hostname and confirm the email arrives in the correct inbox; then verify the reply address and that an invalid challenge does not send. Test data only. If available on the zone, add a rate-limiting rule for `POST /contact` and review submissions in Resend during rollout.

Review quotes and supplied imagery are included from the approved preview inputs; confirm republishing rights, business details, and service terms before enabling a public launch. The `.pages.dev` deployment is public even when the form is off unless protected by Cloudflare Access.
