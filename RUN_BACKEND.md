# Forkly Backend Run Guide

Use this command for normal local development:

```bash
npm run dev
```

It checks port `5000`, stops the old backend process if one is already running, and then starts a fresh server.

Other useful commands:

```bash
npm run stop
```

Stops the backend process using port `5000`.

```bash
npm start
```

Starts the backend directly with `node index.js`. Use this only when port `5000` is already free.

If you see `Port 5000 is already in use`, run:

```bash
npm run dev
```
