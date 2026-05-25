param(
  [string]$HostName = $env:DB_HOST,
  [string]$Port = $env:DB_PORT,
  [string]$User = $env:DB_USER,
  [string]$Password = $env:DB_PASSWORD,
  [string]$Database = $env:DB_NAME,
  [string]$SslMode = $env:DB_SSL_MODE,
  [string]$SslCa = $env:DB_SSL_CA,
  [string]$SslCaFile = $env:DB_SSL_CA_FILE,
  [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"

function Require-Value {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing required value: $Name. Set it as a parameter or environment variable."
  }
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found in PATH. Install MySQL client tools before running this script."
  }
}

Require-Command "mysqldump"
Require-Value "DB_HOST" $HostName
Require-Value "DB_PORT" $Port
Require-Value "DB_USER" $User
Require-Value "DB_PASSWORD" $Password
Require-Value "DB_NAME" $Database

if ([string]::IsNullOrWhiteSpace($SslMode)) {
  $SslMode = "VERIFY_CA"
}

$normalizedSslMode = $SslMode.Trim().ToUpperInvariant().Replace("-", "_")
if ($normalizedSslMode -eq "VERIFY_CA" -and [string]::IsNullOrWhiteSpace($SslCaFile) -and [string]::IsNullOrWhiteSpace($SslCa)) {
  throw "DB_SSL_MODE=verify_ca requires DB_SSL_CA_FILE or DB_SSL_CA."
}

$createdTempCa = $false
if ([string]::IsNullOrWhiteSpace($SslCaFile) -and -not [string]::IsNullOrWhiteSpace($SslCa)) {
  $SslCaFile = Join-Path ([System.IO.Path]::GetTempPath()) "aiven-ca-$([System.Guid]::NewGuid().ToString('N')).pem"
  $SslCa.Replace("\n", "`n") | Set-Content -LiteralPath $SslCaFile -Encoding ascii
  $createdTempCa = $true
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeDatabase = $Database -replace "[^A-Za-z0-9_.-]", "_"
$outputPath = Join-Path $OutputDir "$safeDatabase-$timestamp.sql"

$previousMysqlPwd = $env:MYSQL_PWD
$env:MYSQL_PWD = $Password

try {
  $args = @(
    "--host=$HostName",
    "--port=$Port",
    "--user=$User",
    "--databases",
    $Database,
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    "--set-gtid-purged=OFF",
    "--ssl-mode=$normalizedSslMode"
  )

  if (-not [string]::IsNullOrWhiteSpace($SslCaFile)) {
    $args += "--ssl-ca=$SslCaFile"
  }

  & mysqldump @args | Set-Content -LiteralPath $outputPath -Encoding utf8

  if ((Get-Item -LiteralPath $outputPath).Length -le 0) {
    throw "Backup file was created but is empty: $outputPath"
  }

  Write-Host "Backup created: $outputPath"
} finally {
  if ($null -eq $previousMysqlPwd) {
    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
  } else {
    $env:MYSQL_PWD = $previousMysqlPwd
  }

  if ($createdTempCa -and -not [string]::IsNullOrWhiteSpace($SslCaFile)) {
    Remove-Item -LiteralPath $SslCaFile -Force -ErrorAction SilentlyContinue
  }
}
