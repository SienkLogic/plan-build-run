---
phase: 2
plan: auth-02
type: feature
wave: 1
autonomous: true
depends_on:
  - setup-01
files_modified:
  - src/auth.js
  - src/middleware.js
must_haves:
  truths:
    - "JWT tokens are validated"
  artifacts:
    - "Auth middleware exists"
  key_links: []
provides:
  - "authentication middleware"
---

# Plan: auth-02

## Tasks

<task>
<name>Implement JWT authentication</name>
<files>src/auth.js, src/middleware.js</files>
<action>
1. Create JWT validation logic in src/auth.js
2. Create Express middleware in src/middleware.js
</action>
<verify>node -e "require('./src/auth.js')"</verify>
<done>JWT auth middleware is functional</done>
</task>

<task>
<name>Add login endpoint</name>
<files>src/auth.js</files>
<action>
1. Add POST /login route
2. Return JWT on success
</action>
<verify>curl -X POST localhost:3000/login</verify>
<done>Login endpoint returns JWT token</done>
</task>
