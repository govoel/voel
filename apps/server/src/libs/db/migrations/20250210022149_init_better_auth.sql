-- Create "user" table
CREATE TABLE `user` (`id` text NOT NULL, `name` text NOT NULL, `email` text NOT NULL, `emailVerified` integer NOT NULL, `image` text NULL, `createdAt` date NOT NULL, `updatedAt` date NOT NULL, `username` text NULL, `displayUsername` text NULL, `role` text NULL, `banned` integer NULL, `banReason` text NULL, `banExpires` date NULL, PRIMARY KEY (`id`));
-- Create index "user_email_unique_idx" to table: "user"
CREATE UNIQUE INDEX `user_email_unique_idx` ON `user` (`email`);
-- Create index "user_username_unique_idx" to table: "user"
CREATE UNIQUE INDEX `user_username_unique_idx` ON `user` (`username`);
-- Create "session" table
CREATE TABLE `session` (`id` text NOT NULL, `expiresAt` date NOT NULL, `token` text NOT NULL, `createdAt` date NOT NULL, `updatedAt` date NOT NULL, `ipAddress` text NULL, `userAgent` text NULL, `userId` text NOT NULL, `impersonatedBy` text NULL, PRIMARY KEY (`id`), CONSTRAINT `session_userId_user_id_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "session_token_unique_idx" to table: "session"
CREATE UNIQUE INDEX `session_token_unique_idx` ON `session` (`token`);
-- Create "account" table
CREATE TABLE `account` (`id` text NOT NULL, `accountId` text NOT NULL, `providerId` text NOT NULL, `userId` text NOT NULL, `accessToken` text NULL, `refreshToken` text NULL, `idToken` text NULL, `accessTokenExpiresAt` date NULL, `refreshTokenExpiresAt` date NULL, `scope` text NULL, `password` text NULL, `createdAt` date NOT NULL, `updatedAt` date NOT NULL, PRIMARY KEY (`id`), CONSTRAINT `account_userId_user_id_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create "verification" table
CREATE TABLE `verification` (`id` text NOT NULL, `identifier` text NOT NULL, `value` text NOT NULL, `expiresAt` date NOT NULL, `createdAt` date NULL, `updatedAt` date NULL, PRIMARY KEY (`id`));
