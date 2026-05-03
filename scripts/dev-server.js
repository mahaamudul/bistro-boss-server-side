const { execFileSync, spawn } = require("child_process");
const path = require("path");

const port = String(process.env.PORT || 5000);
const rootDir = path.resolve(__dirname, "..");
const stopOnly = process.argv.includes("--stop-only");

const getListeningPids = () => {
  if (process.platform !== "win32") {
    try {
      return execFileSync("lsof", ["-ti", `tcp:${port}`], {
        encoding: "utf8",
      })
        .split(/\r?\n/)
        .map((pid) => pid.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  try {
    const output = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
    });

    const pids = output
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 5)
      .filter((parts) => parts[0] === "TCP")
      .filter((parts) => parts[3] === "LISTENING")
      .filter((parts) => parts[1].endsWith(`:${port}`))
      .map((parts) => parts[4])
      .filter(Boolean);

    return [...new Set(pids)];
  } catch {
    return [];
  }
};

const stopProcesses = (pids) => {
  pids
    .filter((pid) => pid !== String(process.pid))
    .forEach((pid) => {
      try {
        if (process.platform === "win32") {
          execFileSync("taskkill", ["/PID", pid, "/F"], { stdio: "ignore" });
        } else {
          process.kill(Number(pid), "SIGTERM");
        }

        console.log(`Stopped old backend process on port ${port} (PID ${pid}).`);
      } catch (error) {
        console.log(`Could not stop PID ${pid}: ${error.message}`);
      }
    });
};

const existingPids = getListeningPids();

if (existingPids.length) {
  stopProcesses(existingPids);
} else {
  console.log(`Port ${port} is free.`);
}

if (stopOnly) {
  process.exit(0);
}

const child = spawn(process.execPath, ["index.js"], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
});

const shutdown = () => {
  if (!child.killed) {
    child.kill("SIGINT");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }

  process.exit(code || 0);
});
