table "user" {
  schema = schema.main
  column "id" {
    null = false
    type = text
  }
  column "name" {
    null = false
    type = text
  }
  column "email" {
    null = false
    type = text
  }
  column "emailVerified" {
    null = false
    type = integer
  }
  column "image" {
    null = true
    type = text
  }
  column "createdAt" {
    null = false
    type = date
  }
  column "updatedAt" {
    null = false
    type = date
  }
  column "username" {
    null = true
    type = text
  }
  column "role" {
    null = true
    type = text
  }
  column "banned" {
    null = true
    type = integer
  }
  column "banReason" {
    null = true
    type = text
  }
  column "banExpires" {
    null = true
    type = date
  }
  primary_key {
    columns = [column.id]
  }
  index "user_email_unique_idx" {
    unique  = true
    columns = [column.email]
  }
  index "user_username_unique_idx" {
    unique  = true
    columns = [column.username]
  }
}
table "session" {
  schema = schema.main
  column "id" {
    null = false
    type = text
  }
  column "expiresAt" {
    null = false
    type = date
  }
  column "token" {
    null = false
    type = text
  }
  column "createdAt" {
    null = false
    type = date
  }
  column "updatedAt" {
    null = false
    type = date
  }
  column "ipAddress" {
    null = true
    type = text
  }
  column "userAgent" {
    null = true
    type = text
  }
  column "userId" {
    null = false
    type = text
  }
  column "impersonatedBy" {
    null = true
    type = text
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "session_userId_user_id_fkey" {
    columns     = [column.userId]
    ref_columns = [table.user.column.id]
    on_update   = NO_ACTION
    on_delete   = NO_ACTION
  }
  index "session_token_unique_idx" {
    unique  = true
    columns = [column.token]
  }
}
table "account" {
  schema = schema.main
  column "id" {
    null = false
    type = text
  }
  column "accountId" {
    null = false
    type = text
  }
  column "providerId" {
    null = false
    type = text
  }
  column "userId" {
    null = false
    type = text
  }
  column "accessToken" {
    null = true
    type = text
  }
  column "refreshToken" {
    null = true
    type = text
  }
  column "idToken" {
    null = true
    type = text
  }
  column "accessTokenExpiresAt" {
    null = true
    type = date
  }
  column "refreshTokenExpiresAt" {
    null = true
    type = date
  }
  column "scope" {
    null = true
    type = text
  }
  column "password" {
    null = true
    type = text
  }
  column "createdAt" {
    null = false
    type = date
  }
  column "updatedAt" {
    null = false
    type = date
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "account_userId_user_id_fkey" {
    columns     = [column.userId]
    ref_columns = [table.user.column.id]
    on_update   = NO_ACTION
    on_delete   = NO_ACTION
  }
}
table "verification" {
  schema = schema.main
  column "id" {
    null = false
    type = text
  }
  column "identifier" {
    null = false
    type = text
  }
  column "value" {
    null = false
    type = text
  }
  column "expiresAt" {
    null = false
    type = date
  }
  column "createdAt" {
    null = true
    type = date
  }
  column "updatedAt" {
    null = true
    type = date
  }
  primary_key {
    columns = [column.id]
  }
}
schema "main" {}
