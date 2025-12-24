/**
 * Cluster Manager for Response Analysis Service
 * Uses Node.js native clustering for multi-process scaling
 *
 * Features:
 * - Spawns workers based on CPU count
 * - Auto-restarts crashed workers
 * - Graceful shutdown support
 * - Memory monitoring
 */

const cluster = require("cluster");
const os = require("os");

// Configuration
const WORKER_COUNT = process.env.WORKER_COUNT
  ? parseInt(process.env.WORKER_COUNT, 10)
  : Math.max(2, os.cpus().length);

const RESTART_DELAY_MS = 1000;
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_WINDOW_MS = 60000; // 1 minute

// Track worker restarts for crash loop detection
const workerRestarts = new Map();

if (cluster.isPrimary) {
  console.log(`╔════════════════════════════════════════════════════════════╗`);
  console.log(
    `║    Response Analysis Service - Cluster Manager              ║`
  );
  console.log(`╠════════════════════════════════════════════════════════════╣`);
  console.log(`║  Primary PID: ${process.pid.toString().padEnd(45)}║`);
  console.log(`║  Workers: ${WORKER_COUNT.toString().padEnd(49)}║`);
  console.log(`║  Node.js: ${process.version.padEnd(49)}║`);
  console.log(`╚════════════════════════════════════════════════════════════╝`);

  // Spawn initial workers
  for (let i = 0; i < WORKER_COUNT; i++) {
    spawnWorker();
  }

  // Handle worker exit
  cluster.on("exit", (worker, code, signal) => {
    console.log(
      `⚠️ Worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`
    );

    // Check for crash loop
    const workerId = worker.id;
    const now = Date.now();
    const restarts = workerRestarts.get(workerId) || [];

    // Filter to restarts within the window
    const recentRestarts = restarts.filter(
      (time) => now - time < RESTART_WINDOW_MS
    );
    recentRestarts.push(now);
    workerRestarts.set(workerId, recentRestarts);

    if (recentRestarts.length >= MAX_RESTART_ATTEMPTS) {
      console.error(
        `❌ Worker ${workerId} crashed ${MAX_RESTART_ATTEMPTS} times in ${
          RESTART_WINDOW_MS / 1000
        }s. Not restarting.`
      );
      return;
    }

    // Restart worker after delay
    console.log(`🔄 Restarting worker in ${RESTART_DELAY_MS}ms...`);
    setTimeout(spawnWorker, RESTART_DELAY_MS);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n📴 Received ${signal}. Shutting down workers gracefully...`);

    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.send("shutdown");
        setTimeout(() => {
          if (!worker.isDead()) {
            console.log(`🔪 Force killing worker ${worker.process.pid}`);
            worker.kill("SIGKILL");
          }
        }, 10000);
      }
    }

    // Exit after all workers are dead or timeout
    setTimeout(() => {
      console.log("👋 Primary process exiting");
      process.exit(0);
    }, 15000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Log memory usage periodically
  setInterval(() => {
    const used = process.memoryUsage();
    console.log(
      `📊 Primary Memory: RSS=${Math.round(
        used.rss / 1024 / 1024
      )}MB, Heap=${Math.round(used.heapUsed / 1024 / 1024)}MB`
    );
  }, 60000);
} else {
  // Worker process - load the main application
  console.log(`🚀 Worker ${process.pid} starting...`);

  // Handle shutdown message from primary
  process.on("message", (msg) => {
    if (msg === "shutdown") {
      console.log(`📴 Worker ${process.pid} received shutdown signal`);
      // Give time for in-flight requests
      setTimeout(() => {
        process.exit(0);
      }, 5000);
    }
  });

  // Load the main application
  require("./index.js");
}

function spawnWorker() {
  const worker = cluster.fork();
  console.log(`✅ Worker ${worker.process.pid} spawned`);
  return worker;
}
