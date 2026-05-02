# AXL as a second instance (Railway / Docker)

## Why not point Railway “Root Directory” at `backend/.axl/repo`?

That folder is **created at runtime** by the Node auto-starter (`git clone` into `.axl/repo`). It is **not** in Git, so Railway cannot use it as a build root.

## This folder

- **Dockerfile** clones [gensyn-ai/axl](https://github.com/gensyn-ai/axl), builds `cmd/node`, runs a small **entrypoint** that writes `node-config.json` and starts the bridge.
- **entrypoint.sh** respects **`PORT`** (Railway) for the HTTP API, **`AXL_BRIDGE_BIND`** (default `0.0.0.0`), and **`AXL_TCP_PORT`** (default `7000`).

## Railway

1. Add a **new service** from the same repo.
2. Set **Root Directory** to **`deploy/axl`**.
3. Deploy (Dockerfile build). Ensure the service has a **public HTTP** URL (or use private networking + internal URL).
4. On the **SAIL backend** service, set:
   - `AXL_BRIDGE_URL=https://<axl-service-host>` (no trailing slash; include port only if non-443)
   - `AXL_AUTO_START=false`

## SAIL backend: local auto-start paths (optional)

If you still use **`AXL_AUTO_START=true`** locally or on a full VM, `backend/gensyn/node.ts` supports:

| Variable | Purpose |
|----------|---------|
| `AXL_HOME` | Data directory (default `./.axl` under cwd) |
| `AXL_REPO_PATH` | Clone/build directory (default `$AXL_HOME/repo`) |
| `AXL_BINARY_PATH` | Prebuilt `node` binary — skips clone + `go build` |
| `AXL_CONFIG_PATH` | Config file path |
| `AXL_PRIVATE_KEY_PATH` | Ed25519 PEM path |

Use these when the binary lives in a fixed path (e.g. CI artifact or second container volume).
