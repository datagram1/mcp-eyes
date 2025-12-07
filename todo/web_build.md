# ScreenControl - Website & Product Build Task List

## Product Naming - FINALIZED

| Component | Name | Domain |
|-----------|------|--------|
| **Main Product** | ScreenControl | screencontrol.knws.co.uk |
| **Control Server** | ScreenControl Hub | (integrated) |
| **Agent App** | ScreenControl Agent | - |

---

## Phase 1: Infrastructure Setup

### 1.1 Project Structure
- [x] Create `./web` directory structure
- [x] Set up Next.js with TypeScript
- [ ] Configure ESLint/Prettier
- [ ] Create `.env.example` template
- [ ] Set up git ignore for sensitive files

### 1.2 Database Design
- [ ] Design user accounts table
  - id, email, password_hash, email_verified, oauth_provider, oauth_id
  - account_status, created_at, updated_at, last_login
  - company_name, billing_email, vat_number
- [ ] Design licenses table
  - id, user_id, license_key, product_type, max_concurrent_agents
  - valid_from, valid_until, status (active/suspended/expired)
  - trial_started, trial_ends, is_trial
- [ ] Design agents table (phone-home tracking)
  - id, license_id, agent_key, machine_fingerprint, hostname
  - os_type, os_version, last_seen_at, first_seen_at
  - ip_address, status (online/offline), version
- [ ] Design agent_sessions table
  - id, agent_id, session_start, session_end, duration_minutes
- [ ] Design builds table (custom executables)
  - id, user_id, platform (windows/macos), build_hash
  - created_at, download_count, customer_tag
- [ ] Design voucher_codes table
  - id, code, discount_percent, discount_amount, max_uses
  - used_count, valid_from, valid_until, created_by
- [ ] Design transactions table
  - id, user_id, stripe_payment_id, amount, currency
  - product_type, voucher_id, status, created_at
- [ ] Design audit_log table
  - id, user_id, agent_id, action, details, ip_address, timestamp
- [ ] Set up MySQL/PostgreSQL database
- [ ] Create migration scripts

### 1.3 Internationalization (i18n)
- [ ] Set up next-intl for i18n
- [ ] Create translation file structure
- [ ] Initial languages: English (default), Spanish, French, German
- [ ] Create language switcher component
- [ ] Translate all UI strings

---

## Phase 2: Authentication System (Port from web_contracts)

### 2.1 Core Auth (from ~/dev/web_contracts)
- [ ] Port User model with password hashing (bcrypt for Node.js)
- [ ] Port login/logout routes
- [ ] Port signup with email verification
- [ ] Port forgot password flow
- [ ] Port password reset with secure tokens
- [ ] Port session management (NextAuth.js)
- [ ] Port CSRF protection

### 2.2 OAuth Integration
- [ ] Port Google OAuth login
- [ ] Port Facebook OAuth login
- [ ] Add GitHub OAuth (common for dev tools)
- [ ] OAuth user creation/linking

### 2.3 Enhanced Security
- [ ] Add reCAPTCHA v3 on signup/login
- [ ] Implement rate limiting
- [ ] Add 2FA option (TOTP)
- [ ] Session invalidation on password change
- [ ] Secure cookie settings for production

---

## Phase 3: Stripe Payment Integration

### 3.1 Stripe Setup
- [ ] Create Stripe account and get API keys
- [ ] Set up Stripe CLI for local testing
- [ ] Configure webhook endpoints
- [ ] Set up products in Stripe Dashboard

### 3.2 Product Tiers
```
| Tier | Concurrent Agents | Price | Features |
|------|-------------------|-------|----------|
| Trial | 1 | Free (30 days) | Full features, limited time |
| Solo | 1 | $29/month | Single agent, email support |
| Team | 5 | $99/month | 5 agents, priority support |
| Business | 10 | $199/month | 10 agents, API access |
| Enterprise | 25+ | Custom | Custom agents, SLA, dedicated support |
```

### 3.3 Payment Implementation
- [ ] Create Stripe checkout session endpoint
- [ ] Implement subscription creation
- [ ] Handle subscription updates
- [ ] Handle cancellations
- [ ] Implement one-time payment for lifetime license
- [ ] Process refunds
- [ ] Handle failed payments
- [ ] Implement dunning emails

### 3.4 Webhooks
- [ ] `checkout.session.completed` - provision license
- [ ] `customer.subscription.updated` - update tier
- [ ] `customer.subscription.deleted` - revoke access
- [ ] `invoice.payment_failed` - notify user
- [ ] `invoice.payment_succeeded` - extend subscription

---

## Phase 4: Licensing System

### 4.1 License Generation
- [ ] Generate unique license keys (format: SC-XXXX-XXXX-XXXX-XXXX)
- [ ] Tie licenses to user accounts
- [ ] Store concurrent agent limits
- [ ] Track trial status and dates

### 4.2 30-Day Trial System
- [ ] Auto-create trial license on signup
- [ ] Track trial start/end dates
- [ ] Display trial countdown in UI
- [ ] Send reminder emails (7 days, 3 days, 1 day, expired)
- [ ] Graceful trial expiration (agents stop, don't delete data)
- [ ] Convert trial to paid seamlessly

### 4.3 Voucher Code System
- [ ] Admin interface to create vouchers
- [ ] Percentage or fixed amount discounts
- [ ] Usage limits (max uses, per-user limit)
- [ ] Expiration dates
- [ ] Apply voucher at checkout
- [ ] Track voucher usage

### 4.4 Concurrent Licensing Logic
- [ ] Count active agents per license
- [ ] Enforce limits on phone-home
- [ ] Queue or reject excess agents
- [ ] Real-time dashboard showing usage

---

## Phase 5: Agent Phone-Home System

### 5.1 Phone-Home Protocol
- [ ] Design secure API endpoint (`/api/agent/heartbeat`)
- [ ] Agent sends: license_key, machine_fingerprint, version, uptime
- [ ] Server responds: status (authorized/expired/over_limit), config updates
- [ ] Implement heartbeat interval (every 5 minutes)

### 5.2 Machine Fingerprinting
- [ ] Collect hardware identifiers (MAC, CPU, disk serial)
- [ ] Hash fingerprint for privacy
- [ ] Detect new machines vs. returning
- [ ] Handle hardware changes gracefully

### 5.3 Agent Management
- [ ] List all agents for a license
- [ ] Show online/offline status
- [ ] Display last seen timestamp
- [ ] Allow naming/labeling agents
- [ ] Remote deactivation capability
- [ ] View agent logs (if enabled)

### 5.4 Security
- [ ] HTTPS only for phone-home
- [ ] API key authentication
- [ ] Rate limiting per license
- [ ] Detect and block abuse patterns

---

## Phase 6: Build System (Executable Patching)

### 6.1 Build Pipeline
- [ ] Set up CI/CD for building ScreenControl Agent (GitHub Actions)
- [ ] Build unsigned macOS app (.app bundle)
- [ ] Build Windows executable (.exe)
- [ ] Store base builds in secure storage

### 6.2 Customer Tagging
- [ ] Design tag embedding format in binary
- [ ] Create patching script for macOS (patch Info.plist + binary)
- [ ] Create patching script for Windows (patch resource section)
- [ ] Tag includes: customer_id, license_key, build_date, build_hash

### 6.3 Download System
- [ ] Generate signed download URLs (expire in 1 hour)
- [ ] Track download counts per build
- [ ] Watermark builds per customer
- [ ] Provide checksum for integrity verification

### 6.4 Code Signing
- [ ] Apple Developer account setup for notarization
- [ ] Windows code signing certificate
- [ ] Auto-sign builds after patching
- [ ] Handle signing failures gracefully

---

## Phase 7: ScreenControl Hub (Control Server)

### 7.1 Architecture
- [ ] Design WebSocket server for real-time control
- [ ] Multi-tenant architecture (isolate customers)
- [ ] Agent-to-server connection protocol
- [ ] Master agent concept (controls sub-agents)

### 7.2 Features
- [ ] View all connected agents
- [ ] Send commands to agents
- [ ] Relay automation tasks
- [ ] Aggregate logs from agents
- [ ] Remote screenshots/status

### 7.3 Security & Access Control
- [ ] User roles: Admin, Operator, Viewer
- [ ] API key generation for programmatic access
- [ ] Audit logging of all commands
- [ ] IP whitelisting option

---

## Phase 8: Website Frontend

### 8.1 Public Pages
- [ ] Landing page with ScreenControl showcase
- [ ] Features page with comparison
- [ ] Pricing page with tier comparison
- [ ] Documentation/Getting Started
- [ ] API documentation
- [ ] FAQ page
- [ ] Contact/Support page
- [ ] Privacy Policy
- [ ] Terms of Service

### 8.2 User Dashboard
- [ ] Account overview (subscription, usage)
- [ ] License management
- [ ] Agent list with status
- [ ] Download ScreenControl Agent builds
- [ ] Billing history
- [ ] Settings (profile, password, 2FA)
- [ ] API keys management

### 8.3 Admin Panel
- [ ] User management
- [ ] License management
- [ ] Voucher code management
- [ ] Transaction history
- [ ] System statistics
- [ ] Agent activity logs

### 8.4 Design
- [ ] Create design system (colors, typography, spacing)
- [ ] Responsive design (mobile-first)
- [ ] Dark mode support
- [ ] Accessibility (WCAG 2.1 AA)

---

## Phase 9: Email System

### 9.1 Transactional Emails
- [ ] Email verification
- [ ] Welcome to ScreenControl email
- [ ] Password reset
- [ ] Subscription confirmation
- [ ] Payment receipt
- [ ] Payment failed
- [ ] Trial reminders (7d, 3d, 1d, expired)
- [ ] License expiring soon

### 9.2 Email Infrastructure
- [ ] Set up email provider (SendGrid, Postmark, or SES)
- [ ] Configure SPF, DKIM, DMARC
- [ ] Create email templates (HTML + plain text)
- [ ] Implement email queue
- [ ] Track email delivery/opens

---

## Phase 10: Deployment & DevOps

### 10.1 Infrastructure
- [ ] Set up domain: screencontrol.knws.co.uk
- [ ] Configure DNS records
- [ ] Set up SSL certificate (Let's Encrypt)
- [ ] Choose hosting (Vercel, AWS, DigitalOcean)
- [ ] Set up CDN for static assets

### 10.2 Database
- [ ] Production database setup
- [ ] Automated backups
- [ ] Read replicas (if needed)
- [ ] Connection pooling

### 10.3 Monitoring
- [ ] Application monitoring (Sentry, LogRocket)
- [ ] Server monitoring (uptime, CPU, memory)
- [ ] Database monitoring
- [ ] Alert system (PagerDuty, Slack)

### 10.4 CI/CD
- [ ] Automated testing pipeline
- [ ] Staging environment
- [ ] Production deployment automation
- [ ] Rollback capability

---

## Phase 11: Legal & Compliance

### 11.1 Legal Documents
- [ ] Privacy Policy (GDPR compliant)
- [ ] Terms of Service
- [ ] Acceptable Use Policy
- [ ] Data Processing Agreement (DPA)
- [ ] Cookie Policy

### 11.2 Compliance
- [ ] GDPR compliance (EU users)
- [ ] Data export functionality
- [ ] Account deletion process
- [ ] Cookie consent banner

---

## Phase 12: Testing

### 12.1 Testing Types
- [ ] Unit tests for backend logic
- [ ] Integration tests for API endpoints
- [ ] E2E tests for critical flows (signup, purchase, agent auth)
- [ ] Load testing for phone-home system
- [ ] Security penetration testing

### 12.2 Test Scenarios
- [ ] New user signup flow
- [ ] Trial to paid conversion
- [ ] Agent phone-home under load
- [ ] Concurrent license enforcement
- [ ] Payment failure handling
- [ ] Password reset flow

---

## Tech Stack - DECIDED

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | NextAuth.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Payments | Stripe |
| Email | SendGrid or Postmark |
| Hosting | Vercel (frontend) + Railway/Render (API) |
| i18n | next-intl |

---

## Immediate Next Steps

1. [x] Finalize product naming → **ScreenControl**
2. [ ] Set up `./web` with Next.js project
3. [ ] Configure Prisma with PostgreSQL schema
4. [ ] Implement authentication with NextAuth.js
5. [ ] Create landing page
6. [ ] Set up Stripe test account

---

## Business Model Summary

| Component | Pricing |
|-----------|---------|
| Browser Extensions | FREE (Chrome, Firefox, Safari) |
| MCP Proxy Tool | FREE (open source) |
| **ScreenControl Agent** | PAID (subscription) |
| **ScreenControl Hub** | Included with Business+ tiers |

**Target Market:**
- Developers building automation tools
- MSPs managing client machines
- Enterprises with distributed automation needs
- QA teams running automated testing

**Domain:** screencontrol.knws.co.uk
