# Voel

Voel is a self-hosted media application where users connect a client to one or more independently operated servers.

## Language

**Account**:
A switchable profile identified by one **Server URL** and one authenticated Better Auth user.
_Avoid_: Tenant, profile

**User**:
An identity belonging to one Voel server that can authenticate and use that server.
_Avoid_: Account

**User Profile**:
The mutable public attributes of a **User**, such as their name, username, and profile image.
_Avoid_: Account profile

**Server URL**:
The base URL of a self-hosted Voel server that a client can connect to.
_Avoid_: Instance URL, host

## Relationships

- An **Account** belongs to exactly one **Server URL**
- An **Account** identifies exactly one **User** on its **Server URL**
- A **User Profile** belongs to exactly one **User**
- A **Server URL** can have zero or more **Accounts** on a client
- A client has at most one active **Account** at a time

## Example Dialogue

> **Dev:** "If alice signs in on two Voel servers, is that one **Account** or two?"
> **Domain expert:** "Two — each **Account** is scoped to the **Server URL** it came from."

## Flagged Ambiguities

- "account" can sound like only a Better Auth user, but in Voel it is the pair of **Server URL** and authenticated user.
