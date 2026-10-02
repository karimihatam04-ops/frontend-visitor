import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerBackendProxy } from "../backendProxy";
import { registerRajhiLoginRoutes } from "./rajhiLogin";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { shouldServeSpaFallback } from "../spaFallback";
import { HTML_CACHE_CONTROL, staticCacheControl } from "../staticCaching";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  const captureRawBody = (req: express.Request, _res: express.Response, body: Buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
  };

  app.set("trust proxy", true);
  app.use(express.json({ limit: "50mb", verify: captureRawBody }));
  app.use(express.urlencoded({ limit: "50mb", extended: true, verify: captureRawBody }));
  registerBackendProxy(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerRajhiLoginRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  const isProduction = process.env.NODE_ENV === "production";
  const staticPath =
    process.env.STATIC_PATH ||
    (isProduction
      ? path.resolve(import.meta.dirname, "public")
      : path.resolve(import.meta.dirname, "../..", "client", "public"));

  app.use(
    express.static(staticPath, {
      maxAge: isProduction ? "1y" : 0,
      immutable: isProduction,
      etag: true,
      setHeaders(res, filePath) {
        res.setHeader("Cache-Control", staticCacheControl(filePath, isProduction));
      },
    }),
  );

  // The SPA fallback remains last, after tRPC and every defined proxy endpoint.
  app.use((req, res) => {
    if (!shouldServeSpaFallback(req.path)) {
      res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Not found" } });
      return;
    }
    res.setHeader("Cache-Control", HTML_CACHE_CONTROL);
    res.sendFile(path.resolve(staticPath, "index.html"));
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
