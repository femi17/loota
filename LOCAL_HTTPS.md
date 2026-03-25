# HTTPS on localhost (mkcert + Next.js)

Using **mkcert** gives you a locally trusted HTTPS certificate so the browser shows a secure lock with no warnings (unlike a generic self-signed cert). Next.js supports this via `--experimental-https` with custom cert paths.

---

## What you need to do (one-time setup)

### 1. Install mkcert

**Windows (PowerShell as Administrator):**

- **Chocolatey:** `choco install mkcert`
- **Scoop:** `scoop install mkcert`

**macOS:** `brew install mkcert`  
**Linux:** e.g. `sudo apt install mkcert` or use your distro’s package manager.

### 2. Install the local Certificate Authority (once per machine)

```bash
mkcert -install
```

This adds mkcert’s CA to your system/browser trust store so certs it creates are trusted.

### 3. Create the certificate in this project

From the project root (`c:\wamp\www\loota`):

```bash
mkdir certificates
mkcert -key-file certificates/localhost-key.pem -cert-file certificates/localhost.pem localhost
```

This creates `certificates/localhost.pem` and `certificates/localhost-key.pem`. The `*.pem` files are already in `.gitignore` and won’t be committed.

---

## Running the app with HTTPS

After the steps above:

```bash
npm run dev:https
```

Then open **https://localhost:3000** (not http). The browser should show a secure connection with no certificate warning.

---

## Summary

| Step | Command / action |
|------|-------------------|
| 1 | Install mkcert (e.g. `choco install mkcert` on Windows) |
| 2 | `mkcert -install` (one-time per machine) |
| 3 | `mkdir certificates` then `mkcert -key-file certificates/localhost-key.pem -cert-file certificates/localhost.pem localhost` |
| 4 | `npm run dev:https` and use https://localhost:3000 |
