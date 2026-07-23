# ResQMesh PostgreSQL Deployment

This website now uses PostgreSQL through `DATABASE_URL`. SQLite data is not migrated; PostgreSQL starts fresh.

## Install PostgreSQL On The Droplet

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

## Create The App Database

```bash
APP_DB_PASSWORD="$(openssl rand -base64 32)"
echo "$APP_DB_PASSWORD"
sudo -u postgres psql
```

Inside `psql`:

```sql
CREATE ROLE resqmesh_app WITH LOGIN PASSWORD 'PASTE_STRONG_PASSWORD_HERE';
CREATE DATABASE resqmesh OWNER resqmesh_app;
\c resqmesh
ALTER SCHEMA public OWNER TO resqmesh_app;
\q
```

Verify local-only access:

```bash
psql "postgresql://resqmesh_app:PASTE_STRONG_PASSWORD_HERE@127.0.0.1:5432/resqmesh" -c "SELECT NOW();"
```

Do not open port `5432` in UFW or the DigitalOcean firewall.

## Deploy The Website

```bash
cd /var/www/resqmesh/resqmeshofficialwebsite
pm2 stop resqmesh
cp .env .env.backup-before-postgres
nano .env
```

Set the database URL:

```env
DATABASE_URL=postgresql://resqmesh_app:PASTE_STRONG_PASSWORD_HERE@127.0.0.1:5432/resqmesh
```

Remove `SQLITE_DB_PATH` if it still exists.

Install dependencies and start once to create the schema:

```bash
npm install
npm start
```

Stop the foreground process after schema creation, then bootstrap required access:

```bash
npm run admin:create -- --username=admin --password='CHANGE_THIS_PASSWORD'
npm run device:upsert -- --node-id=MN00001 --node-name='Panlibatuhan Creek' --api-key='DEVICE_KEY'
npm run device:upsert -- --node-id=MN00002 --node-name='Panlibatuhan Creek MN2' --api-key='DEVICE_KEY'
npm run device:upsert -- --node-id=MN00003 --node-name='CDRRMO HQ' --api-key='DEVICE_KEY'
```

Restart under PM2:

```bash
pm2 start server.js --name resqmesh
pm2 save
pm2 logs resqmesh --lines 100
```

## Verification

```bash
curl https://resqmesh.me/health
curl https://resqmesh.me/api/health
npm run audit:users
```

Register users/rescuers/teams again from the admin website. Firmware devices keep their local data, but each device must be re-registered in `sync_devices` with the same `DEVICE_NODE_ID` and matching `DEVICE_API_KEY`.

Rotate secrets that were exposed during development, especially SMTP app passwords, ORS keys, reCAPTCHA secret, and device API keys.
