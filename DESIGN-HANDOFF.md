# Design and workflow handoff — October 4, 2026

Status: draft for organization review. Existing coded branding follows the supplied website reference. No organization approval or native Figma project has been obtained. Import [the editable SVG board](public/design-system.svg) into Figma as a starting point; it is not a replacement for a published Figma component library. Source typography and tokens are in `src/brand.css`; functional layouts remain in the React and React Native source.

## Design acceptance

- Confirm permission to use the current logo/photos and approve the sky-blue, charcoal and white identity.
- Approve desktop sidebar, mobile Home/Schedule/Chat/More navigation and role-specific screens.
- Create native Figma components/variants from the import board: buttons, forms, cards, tables, dialogs, notices, charts and courts. Add focus, error, loading, empty and disabled states.
- Review readable contrast, 48px mobile actions, 16px input text, accessible labels and keyboard/screen-reader behavior on actual devices.
- Approve final copy, waiver wording, credit policy, cancellation/refund policy, document requirements and competition rules separately.

## Accounts and family profiles

```mermaid
flowchart TD
 A[Parent signup or administrator invitation] --> B[Account registration and password]
 B --> C[Role and family/team scope enforced by server]
 C --> D[Sign in]
 D --> E[Family contact and player profiles]
 D --> F[Role-specific hubs]
 D --> G[Password recovery link]
 G --> H[New password revokes existing sessions]
 A --> I[Expired or revoked invitation: request replacement]
```

## Registration, waivers and waitlists

```mermaid
flowchart TD
 A[Choose program and player] --> B{Registration eligibility and capacity}
 B -->|Eligible and space| C[Review current form version and terms]
 B -->|Full| D[Join FIFO waitlist]
 B -->|Ineligible or closed| E[Explain registration restriction]
 D --> F[Staff offer with expiry and reserved capacity]
 F --> C
 F -->|Expired or declined| D
 C --> G[Validate typed answers and signature]
 G -->|Form changed| C
 G --> H[Save immutable waiver and enrollment]
 H --> I[Create invoice]
 H --> J[Calendar, attendance and training access]
 H --> K[Family or staff downloads scoped waiver records]
```

## Store, payment and refund

```mermaid
flowchart TD
 A[Player, color, size and quantity for each cart line] --> B[Reserve for 15 minutes]
 B -->|Unavailable| A
 B -->|Expire or release| A
 B --> C[Confirm order and apply current credit balance]
 C --> D[One invoice and inventory debit]
 D -->|Amount due| E[Stripe test checkout]
 D -->|Covered by credits| F[Fulfillment]
 E -->|Verified matching webhook| F
 E -->|Failed or expired| G[Retry existing invoice checkout]
 G --> E
 D --> H[Staff cancel whole unpaid cart]
 H -->|No checkout or payment and not delivered| I[Restore stock and credits; void invoice]
 E --> J[Staff refund request]
 J --> K[Admin approval or rejection]
 K --> L[Explicit provider submission]
 L -->|Uncertain outcome| M[Reconcile provider refund ID]
 L -->|Confirmed| N[Record refund status]
```

## Scheduling and league management

```mermaid
flowchart TD
 A[Teams, venue, time zone and recurrence] --> B[Preview or validate conflicts]
 A --> C[Tournament courts, weekdays, blackouts, rest and rounds]
 C --> B
 B -->|Incomplete or conflicting| A
 B --> D[Commit validated schedule]
 D --> E[Calendar, notices and RSVPs]
 D --> F[Change a session or this-and-following practice series]
 F --> B
 E --> G[Attendance and league scorekeeping]
 G --> H[Clock, possession, team counters and independent player stats]
 H --> I[Finalize score; validate playoff constraints]
 I --> J[Standings, next-round participants and champion]
```

## Training, playbook and media

```mermaid
flowchart TD
 A[Coach creates drills and plans] --> B[Assign immutable exercise snapshots]
 B --> C[Player completes exercises and results]
 C --> D[Progress summaries and coaching feedback]
 A --> E[Five or ten-player framed play with routes]
 E --> F[Web or native frame playback]
 A --> G[Film, select or import video]
 G --> H[Scoped local upload and recovery]
 H --> I[Optional private cloud copy]
 H --> J[Authorized review, timestamps and annotations]
 I --> J
 J --> K[Soft delete or restore]
 K --> L[Grace period and explicit administrator purge]
```

## Staff onboarding and moderation

```mermaid
flowchart TD
 A[Staff invitation and account] --> B[Profile and private document upload]
 B --> C[Document title, expiry and supersession history]
 C --> D[Administrator review]
 D -->|Expired current evidence or changes needed| B
 D -->|Accepted| E[Approved onboarding profile]
 E -->|New document or changed metadata| D
 F[Scoped team, direct or group chat] --> G[Member reports a message]
 G --> H[Staff sees reported evidence and reason]
 H --> I[Dismiss or remove with written review]
 F --> J[Group owner renames or removes members]
 J --> K[Access scope updates immediately]
```

## Launch and operational acceptance

```mermaid
flowchart TD
 A[Organization-owned accounts and approved policies] --> B[Configure HTTPS staging and secrets]
 B --> C[Stripe, email, push, cloud and database journeys]
 C --> D[Backup restore, access control, load and monitoring checks]
 D --> E[Physical iPhone and Android testing]
 E --> F[Fix issues and record acceptance evidence]
 F --> G[Signed builds and store listings]
 G --> H[Organization approval and submission]
 H --> I[Release monitoring and incident/recovery process]
```

These diagrams describe the implemented workflow and intended launch gates. Provider-backed stages remain pending real configuration and acceptance testing. Advanced native provider operations still use the web administrator workspace.
