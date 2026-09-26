# Cloudflare deployment checklist

1. Create D1: `npx wrangler d1 create sensors-db`.
2. Copy `wrangler.toml.example` to `wrangler.toml` and insert the returned database ID.
3. Create Pages project `sensors-euiyun` or deploy once with `npm run deploy`.
4. Apply migrations and seed data.
5. In Cloudflare **Workers & Pages → sensors-euiyun → Custom domains**, add `sensors.euiyun.com`. Because `euiyun.com` is already a Cloudflare zone, Cloudflare can create/manage the DNS record during domain association.
6. Add GitHub repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_D1_DATABASE_ID` if using the provided deploy workflow.
7. Confirm D1 binding variable is exactly `DB`.

The production site does not require the Mac Studio to be online. The Mac Studio is only an ETL/agent runner.
