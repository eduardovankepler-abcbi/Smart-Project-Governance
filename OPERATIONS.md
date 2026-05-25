# Operations

## Current Cloud Topology

- Frontend: Vercel
- Backend: Render Web Service
- Database: Aiven MySQL

## Aiven SSL Hardening

Initial deploy can use:

```env
DB_SSL_MODE=required
DB_SSL_CA=
```

After the deployed app is stable, prefer certificate verification:

```env
DB_SSL_MODE=verify_ca
DB_SSL_CA=-----BEGIN CERTIFICATE-----
PASTE_AIVEN_CA_CERTIFICATE_HERE
-----END CERTIFICATE-----
```

In Render:

1. Open the backend service.
2. Go to Environment.
3. Change `DB_SSL_MODE` to `verify_ca`.
4. Paste the Aiven CA certificate into `DB_SSL_CA`.
5. Save and redeploy.
6. Validate `/api/health`, login, and a read-only page such as Projetos.

If Render has trouble with multiline values, paste the certificate with literal `\n` line breaks. The backend converts `\n` to real newlines.

## Aiven Backup

Run a logical backup before destructive operations, imports, migrations, or large data edits.

Required local tools:

- MySQL client tools with `mysqldump` available in `PATH`
- Aiven connection values

PowerShell example:

```powershell
$env:DB_HOST = "HOST_DA_AIVEN"
$env:DB_PORT = "PORTA_DA_AIVEN"
$env:DB_USER = "USUARIO_DA_AIVEN"
$env:DB_PASSWORD = "SENHA_DA_AIVEN"
$env:DB_NAME = "abc_project_manager_v2"
$env:DB_SSL_MODE = "verify_ca"
$env:DB_SSL_CA_FILE = "C:\path\to\aiven-ca.pem"

.\scripts\backup-aiven-mysql.ps1
```

The script writes dumps to `backups/`, which is ignored by Git.

For a quick connectivity-only backup while CA verification is not configured locally:

```powershell
$env:DB_SSL_MODE = "required"
$env:DB_SSL_CA_FILE = ""
.\scripts\backup-aiven-mysql.ps1
```

Use `verify_ca` for routine backups once the CA file is available.

## Restore Caution

Do not restore directly over production without first confirming the target host, database name, and dump date.

Recommended restore practice:

1. Restore to a temporary database first.
2. Validate table counts and login seed/user records.
3. Take a fresh production backup.
4. Restore to production only after explicit approval.
