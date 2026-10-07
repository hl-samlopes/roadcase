# Deploying Roadcase

Roadcase runs on Railway, with these pieces:

| Piece | Service |
| --- | --- |
| Web app | Railway service `web` |
| Background worker | Railway service `worker` (email, Slack, PDFs) |
| Database | Railway Postgres |
| Files | Cloudflare R2 (private bucket) |
| Email | Resend |

Both Railway services build from the same `Dockerfile`; only the start command differs, set in each service's settings. Before the web service goes live, its pre-deploy command, `railway/predeploy.sh`, applies database migrations. When `SEED_ADMIN_PASSWORD` is set, it also runs the seed, which is safe to rerun.

Production starts empty: nothing from your laptop's database comes along. The seed creates the organization, the campuses, the first admin, default categories, conditions and band positions.

## 1. Put the code on `main`

Railway deploys `main`. Everything so far is one straight line of commits on top of `main`, so `main` can simply move forward:

```bash
git push origin deploy/railway:main
```

GitHub then shows the Phase 1 pull request as merged. From here on, merge work into `main` to deploy it.

## 2. Cloudflare R2 (files)

1. In Cloudflare, go to **R2** and create a bucket, for example `roadcase`. Leave public access **off**: Roadcase serves every file through its own permission checks, and logos through its own `/branding` route.
2. Go to **R2 > Manage API tokens** and create a token with **Object Read & Write**, limited to that bucket. Keep its **Access Key ID** and **Secret Access Key**. The secret is shown only once.
3. Note the S3 endpoint, `https://<account id>.r2.cloudflarestorage.com`, shown on the bucket's settings page.

## 3. Resend (email)

1. Create a Resend account and an **API key** with sending access.
2. **To email anyone other than yourself, Resend needs a domain you control.** Add it under **Domains** and create the DNS records it shows: a subdomain such as `mail.hume.org` works, and needs someone with Hume's DNS access. Until then, Resend only delivers to the address you signed up with, from `onboarding@resend.dev`. That's fine for a first look, but not for sharing.
3. Set `EMAIL_FROM_ADDRESS` to an address on the verified domain, for example `roadcase@mail.hume.org`. The organization's display name is used as the sender name.

## 4. Railway

1. Create a project, then add **PostgreSQL**. In the database's settings, turn on backups.
2. Add a service from this GitHub repository and name it `web`.
   - **Settings > Deploy:** set these (Railway's config-as-code files are deprecated, so they're set here):

     | Setting | Value |
     | --- | --- |
     | Custom start command | `npm run start` |
     | Pre-deploy command | `sh ./railway/predeploy.sh` |
     | Healthcheck path | `/api/health` |
     | Restart policy | On failure |
   - **Settings > Networking:** click **Generate Domain**. The address, for example `https://roadcase-production.up.railway.app`, is your `APP_URL`.
3. Add a second service from the same repository and name it `worker`.
   - **Settings > Deploy:** set the custom start command to `npm run worker`, the restart policy to Always, and leave the pre-deploy command and healthcheck path empty.
   - Give it no public domain.
4. In **Project Settings > Shared Variables**, add the variables below, then share them with both services.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (a reference to the database) |
| `APP_URL` | The web service's address, for example `https://roadcase-production.up.railway.app` |
| `AUTH_SECRET` | New random value: `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` |
| `SECRETS_ENCRYPTION_KEY` | New random value: `openssl rand -base64 32`. Keep a copy somewhere safe: losing or changing it makes saved Slack webhooks unreadable |
| `APP_TIME_ZONE` | `America/New_York` |
| `DEFAULT_ORGANIZATION_SLUG` | `hume` |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | From step 3 |
| `EMAIL_FROM_ADDRESS` | From step 3 |
| `S3_ENDPOINT` | From step 2 |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | The bucket name, for example `roadcase` |
| `S3_ACCESS_KEY_ID` | From step 2 |
| `S3_SECRET_ACCESS_KEY` | From step 2 |
| `S3_FORCE_PATH_STYLE` | `true` |

Leave `S3_PUBLIC_BASE_URL` unset. Use new secrets here, never the values from your laptop's `.env`.

For the first deploy only, also add these to the **web** service:

| Variable | Value |
| --- | --- |
| `SEED_ADMIN_USERNAME` | The first admin's username |
| `SEED_ADMIN_PASSWORD` | A long password; you'll change it after signing in |
| `SEED_ADMIN_EMAIL` | The admin's email |
| `SEED_ADMIN_DISPLAY_NAME` | Their name |

## 5. First deploy and checks

1. Deploy both services; Railway builds the image once per service. The web deploy log shows the migrations and `Seed complete.`
2. Delete `SEED_ADMIN_PASSWORD` from the web service. Later deploys then skip the seed.
3. Open `APP_URL`/api/health: it should say `{"ok":true}`.
4. Sign in as the admin, then change the password (Account > Password).
5. Go to **Settings > Notifications** and send a test email; it should arrive within a few seconds. If it doesn't, the worker's log and the same page's failed jobs show why.
6. Upload a logo in **Settings > Appearance**, and check it shows on the sign-in page in a private window.
7. Add people in **Settings > Users** with the right grants, then send them the address.

## Updating

Merging into `main` redeploys both services. Migrations run before the new web version takes traffic. The worker restarts on the new image a moment later, and its jobs retry, so nothing is lost while it does.

## Costs (rough, October 2026)

| Service | Cost |
| --- | --- |
| Railway (two small services and Postgres) | About $10–25/month, by usage |
| Cloudflare R2 | Free up to 10 GB stored, then about $0.015/GB/month; no download fees |
| Resend | Free up to 3,000 emails/month |
