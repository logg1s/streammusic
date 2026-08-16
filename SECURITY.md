# Security Policy

Vong handles OAuth access/refresh tokens for three storage providers (Google
Drive, Dropbox, OneDrive), an optional YouTube account connection, and a
signing keystore for the Android release build. Please report vulnerabilities
privately rather than filing a public issue.

## Reporting a vulnerability

Preferred: open a [GitHub Security Advisory](https://github.com/logg1s/streammusic/security/advisories/new)
on this repository. It's private by default and lets us coordinate a fix
before disclosure.

If you can't use GitHub Security Advisories, email
**logis1592@gmail.com** with a description of the
issue, steps to reproduce, and the shell affected (web / Windows / Android).
Please don't include real user data or credentials in the report itself.

We aim to acknowledge reports within a few days. This is a small project run
outside working hours, so please be patient — but we do take reports
seriously, particularly anything touching the items below.

## What's most sensitive here

- **OAuth tokens** for storage providers are stored encrypted (AES-256-GCM)
  in the database — see `src/lib/connections.ts`. A bug that leaks
  `ENCRYPTION_KEY`, bypasses the encryption, or lets one user read another
  user's connection is a top-priority report.
- **YouTube audio resolution happens on the user's own device**, never on the
  server — see the hard invariants in `AGENTS.md`. A change that routes this
  through server infrastructure isn't just a bug, it breaks the design (and
  will get `LOGIN_REQUIRED` from YouTube anyway).
- **Library streaming from the native shells** carries an
  `Authorization: Bearer` token — a bypass of that check is a priority
  report.
- **The Android signing keystore**, `mobile/credentials/vong-release.jks`, is
  irreplaceable — if it's ever lost, every existing install can never be
  updated again with the same signature. It is `.gitignore`d and must **never**
  be committed. If you find a copy of it anywhere public (a fork, a paste,
  a leaked artifact), please report it immediately, even though it isn't a
  code vulnerability.

## What's out of scope

- Reports against `Vong_*.apk` / `.exe` build artifacts that shouldn't have
  been committed — those are a hygiene issue, not a security one; feel free
  to open a normal issue or PR instead.
- Automated scanner output with no working proof of concept.
- Social engineering, physical attacks, or attacks that require the
  attacker to already control the victim's Google/Dropbox/OneDrive account.

## Supported versions

Vong doesn't yet maintain multiple release branches — only the latest release
of each shell (web at [streammusic.vercel.app](https://streammusic.vercel.app),
plus the most recent tagged Windows/Android build) receives fixes.
