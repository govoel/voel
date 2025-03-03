import { Elysia } from "elysia";
import betterAuthView from "./libs/auth/auth-view";

const app = new Elysia().get("/", () => "Hello Elysia").all("/api/auth/*", betterAuthView).listen(process.env.PORT || 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
