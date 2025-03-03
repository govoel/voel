import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin, createAuthMiddleware, username } from "better-auth/plugins";
import Database from "bun:sqlite";
import { BunSqliteDialect } from "kysely-bun-sqlite";

const dialect = new BunSqliteDialect({
  database: new Database(process.env.DATABASE_PATH),
});

export const auth = betterAuth({
  database: {
    dialect,
    type: "sqlite",
  },
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: ["apricotta://"],
  plugins: [expo(), username(), admin({ defaultRole: "under18" })],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        throw new APIError("BAD_REQUEST", {message: "You must sign-up with your username."})
      } else if (ctx.path === "/sign-in/email") {
        throw new APIError("BAD_REQUEST", {message: "You must sign-in with your username."})
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up/username") || ctx.path.startsWith("/sign-in/username")) {
        return ctx.json({
          token: ctx.context.newSession?.session.token,
          user: {
            id: ctx.context.newSession?.user.id,
            email: ctx.context.newSession?.user.email,
            username: ctx.context.newSession?.user.username,
            name: ctx.context.newSession?.user.name,
            image: ctx.context.newSession?.user.image,
            createdAt: ctx.context.newSession?.user.createdAt,
            updatedAt: ctx.context.newSession?.user.updatedAt,
          },
        })
      }
    })
  }
});

// atlas schema inspect -u "sqlite://dev.db?_fk=1" > ./src/libs/db/schema.hcl
// atlas migrate diff init_better_auth --dir "file://db/migrations" --to "file://db/schema.hcl" --dev-url "sqlite://dev.db?_fk=1"
// atlas migrate lint --dev-url "sqlite://dev.db?_fk=1" --dir "file://src/libs/db/migrations" --latest 1
// atlas migrate apply --url "sqlite://dev.db?_fk=1" --dir "file://src/lib/db/migrations"
