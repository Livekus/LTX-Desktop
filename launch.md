# LTX Desktop Local Launcher

## Start the App

Use the Desktop launcher if you created one, or run the local script from this repository:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-local-dev.ps1
```

Double-clicking a shortcut or `.cmd` wrapper for this command runs the local development app.

## What It Does

The launcher runs the repository-local script:

```powershell
.\run-local-dev.ps1
```

That script:

- Adds `uv` to `PATH`
- Sets required Windows TLS environment variables
- Uses Python 3.13 from `$env:LOCALAPPDATA\Programs\Python\Python313`
- Installs missing dependencies if needed
- Stops stale LTX Desktop dev processes
- Starts the app with `pnpm dev`

## Keep It Open

Keep the PowerShell or Command Prompt window open while using the app.

Closing that window stops the local dev server and the Electron app.

## Stop the App

Press:

```text
Ctrl+C
```

in the launcher window.

You can also close the Electron app window.

## Logs

Development logs are written here:

```powershell
.\.codex\logs\pnpm-dev.out.log
```

App session logs are written here:

```powershell
$env:LOCALAPPDATA\LTXDesktop\logs
```

## If Double-Click Does Not Work

Open PowerShell and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run-local-dev.ps1
```

## Expected Startup

When startup succeeds, the logs should show:

- Vite running at `http://localhost:5173`
- Electron running in development mode
- Python backend started successfully
- Backend running on a local `127.0.0.1` port

## Hugging Face Sign-In

Use the in-app `Sign in with HuggingFace` button from Settings.

After browser login, Hugging Face redirects back to a local URL like:

```text
http://127.0.0.1:41954/api/auth/huggingface/callback?code=...&state=...
```

If it succeeds, the page says authentication succeeded and the local app shows `Signed in`.

Do not share the full callback URL. The `code` is a short-lived one-time OAuth code.
