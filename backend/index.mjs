// index.mjs - Point d'entrée du serveur
import { app, initializeServer } from "./src/app.mjs";
import { config } from "./src/config.mjs";

/**
 * Démarre le serveur Express
 */
async function startServer() {
  try {
    // Initialiser (créer dossiers, etc.)
    await initializeServer();

    // Démarrer le serveur
    const server = app.listen(config.port, () => {
      console.log("\n🚀 Audio Sampler Backend started");
      console.log(`   Environment: ${config.env}`);
      console.log(`   Port: ${config.port}`);
      console.log(`   URL: http://localhost:${config.port}`);
      console.log(`   API: http://localhost:${config.port}/api/health`);
      console.log("\n📝 Available routes:");
      console.log("   GET    /api/health");
      console.log("   POST   /api/samples");
      console.log("   GET    /api/presets");
      console.log("   GET    /api/presets/:name");
      console.log("   POST   /api/presets");
      console.log("   PUT    /api/presets/:name");
      console.log("   PATCH  /api/presets/:name");
      console.log("   DELETE /api/presets/:name");
      console.log("   POST   /api/presets/:folder/upload");
      console.log("   POST   /api/presets/create-with-files");
      console.log("\n✨ Ready to accept requests\n");
    });

    // Gestion arrêt propre
    const shutdown = async (signal) => {
      console.log(`\n${signal} received, closing server...`);
      server.close(() => {
        console.log("Server closed");
        process.exit(0);
      });

      // Force exit après 10s
      setTimeout(() => {
        console.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Démarrer automatiquement
startServer();

export { startServer };
