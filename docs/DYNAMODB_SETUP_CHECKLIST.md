# DynamoDB Table Setup & Verification Checklist

This checklist provides the exact AWS DynamoDB table configurations, partition/sort keys, Global Secondary Indexes (GSIs), projection types, and verification test queries needed to provision the Marque database without errors.

---

## 1. Table Overview & Environment Variables

| Table Name | Environment Variable | Partition Key (PK) | Sort Key (SK) | Capacity Mode | GSIs |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MarqueUsers` | `USERS_TABLE` | `userId` (String) | `itemType` (String) | On-Demand (PAY_PER_REQUEST) | 0 (Base table lock item) |
| `MarqueEvents` | `EVENTS_TABLE` | `eventId` (String) | None | On-Demand (PAY_PER_REQUEST) | 2 (`status-startAt-index`, `organizer-index`) |
| `MarqueEventStaff` | `EVENT_STAFF_TABLE` | `eventId` (String) | `userId` (String) | On-Demand (PAY_PER_REQUEST) | 1 (`user-assigned-events-index`) |
| `MarqueRSVPs` | `RSVPS_TABLE` | `eventId` (String) | `attendeeId` (String) | On-Demand (PAY_PER_REQUEST) | 1 (`attendee-index`) |
| `MarqueWaitlist` | `WAITLIST_TABLE` | `eventId` (String) | `queueKey` (String) | On-Demand (PAY_PER_REQUEST) | 0 (Base table FIFO queue) |
| `MarqueTickets` | `TICKETS_TABLE` | `ticketId` (String) | None | On-Demand (PAY_PER_REQUEST) | 2 (`event-attendees-index`, `attendee-tickets-index`) |

**Total Global Secondary Indexes across Marque:** Exactly **6 GSIs**.

---

## 2. Table-by-Table Configuration & Verification

### Table 1: `MarqueUsers`
- **Table Name:** `MarqueUsers`
- **Partition Key (`PK`):** `userId` (String: UUID or `EMAIL#<normalizedEmail>`)
- **Sort Key (`SK`):** `itemType` (String: `PROFILE` or `LOCK`)
- **Billing Mode:** On-Demand
- **GSIs:** None (Eliminated in favor of strongly consistent base table email locks)
- **Key Attributes:**
  - `userId`: String (UUID for profile, or `EMAIL#<normalizedEmail>` for lock)
  - `itemType`: String (`PROFILE` or `LOCK`)
  - `ownerUserId`: String (Present on lock items, pointing to profile `userId`)
  - `name`: String
  - `email`: String
  - `normalizedEmail`: String
  - `passwordHash`: String (bcrypt hash)
  - `role`: String (`ATTENDEE` or `ORGANIZER`)
  - `createdAt`: String (ISO 8601 UTC)
- **Access Patterns Serviced:** AP-01 (Email Login & Staff Lookup via strongly consistent base table lock read), AP-02 (User Profile Fetch), Atomic Email Uniqueness Lock.
- **Verification Query (AWS CLI):**
  ```bash
  aws dynamodb get-item \
    --table-name MarqueUsers \
    --key '{"userId":{"S":"EMAIL#chandrabhanu@example.com"},"itemType":{"S":"LOCK"}}' \
    --consistent-read
  ```

---

### Table 2: `MarqueEvents`
- **Table Name:** `MarqueEvents`
- **Partition Key (`PK`):** `eventId` (String)
- **Sort Key (`SK`):** None
- **Billing Mode:** On-Demand
- **GSI 1: `status-startAt-index`**
  - Partition Key: `status` (String)
  - Sort Key: `startAt` (String)
  - Projection Type: `ALL`
- **GSI 2: `organizer-index`**
  - Partition Key: `organizerId` (String)
  - Sort Key: `createdAt` (String)
  - Projection Type: `ALL`
- **Key Attributes:**
  - `eventId`: String
  - `title`: String
  - `description`: String
  - `category`: String
  - `startAt`: String (ISO 8601 UTC)
  - `endAt`: String (ISO 8601 UTC)
  - `venue`: String
  - `capacity`: Number
  - `confirmedCount`: Number
  - `status`: String (`PUBLISHED`, `DRAFT`, `CANCELLED`)
  - `organizerId`: String
  - `bannerUrl`: String
- **Access Patterns Serviced:** AP-03 (Public Event Discovery), AP-04 (Event Details), AP-05 (Organizer Dashboard Events).
- **Verification Query (AWS CLI):**
  ```bash
  aws dynamodb query \
    --table-name MarqueEvents \
    --index-name status-startAt-index \
    --key-condition-expression "#status = :pub AND startAt >= :now" \
    --expression-attribute-names '{"#status":"status"}' \
    --expression-attribute-values '{":pub":{"S":"PUBLISHED"},":now":{"S":"2026-11-01T00:00:00.000Z"}}'
  ```

---

### Table 3: `MarqueEventStaff`
- **Table Name:** `MarqueEventStaff`
- **Partition Key (`PK`):** `eventId` (String)
- **Sort Key (`SK`):** `userId` (String)
- **Billing Mode:** On-Demand
- **GSI 1: `user-assigned-events-index`**
  - Partition Key: `userId` (String)
  - Sort Key: `assignedAt` (String)
  - Projection Type: `ALL`
- **Key Attributes:**
  - `eventId`: String
  - `userId`: String
  - `email`: String
  - `name`: String
  - `permission`: String (`CHECK_IN`)
  - `assignedAt`: String (ISO 8601 UTC)
  - `assignedBy`: String
- **Access Patterns Serviced:** AP-06 (List Event Staff), AP-07 (Check-in Staff Authorization Verification in $O(1)$), AP-08 (Assigned Events for User).
- **Verification Query (AWS CLI):**
  ```bash
  aws dynamodb get-item \
    --table-name MarqueEventStaff \
    --key '{"eventId":{"S":"evt-ccl-hackathon-2026"},"userId":{"S":"usr-coordinator-01"}}'
  ```

---

### Table 4: `MarqueRSVPs`
- **Table Name:** `MarqueRSVPs`
- **Partition Key (`PK`):** `eventId` (String)
- **Sort Key (`SK`):** `attendeeId` (String)
- **Billing Mode:** On-Demand
- **GSI 1: `attendee-index`**
  - Partition Key: `attendeeId` (String)
  - Sort Key: `createdAt` (String)
  - Projection Type: `ALL`
- **Key Attributes:**
  - `eventId`: String
  - `attendeeId`: String
  - `rsvpId`: String
  - `status`: String (`CONFIRMED`, `WAITLISTED`, `CANCELLED`)
  - `ticketId`: String (Nullable)
  - `queueKey`: String (Nullable, present only if `status = "WAITLISTED"`)
  - `createdAt`: String (ISO 8601 UTC)
  - `updatedAt`: String (ISO 8601 UTC)
- **Access Patterns Serviced:** AP-09 (My RSVPs Registrations List), AP-10 (Check Attendee RSVP Status & Duplicate Prevention).
- **Verification Query (AWS CLI):**
  ```bash
  aws dynamodb query \
    --table-name MarqueRSVPs \
    --index-name attendee-index \
    --key-condition-expression "attendeeId = :aid" \
    --expression-attribute-values '{":aid":{"S":"usr-attendee-demo"}}'
  ```

---

### Table 5: `MarqueWaitlist`
- **Table Name:** `MarqueWaitlist`
- **Partition Key (`PK`):** `eventId` (String)
- **Sort Key (`SK`):** `queueKey` (String: `<ISO8601_TIMESTAMP>#<attendeeId>`)
- **Billing Mode:** On-Demand
- **GSIs:** None (Contains active waiting entries only; deleted on promotion or cancellation)
- **Key Attributes:**
  - `eventId`: String
  - `queueKey`: String
  - `attendeeId`: String
  - `attendeeName`: String
  - `attendeeEmail`: String
  - `status`: String (`WAITING`)
  - `createdAt`: String (ISO 8601 UTC)
- **Access Patterns Serviced:** AP-11 (Retrieve Oldest FIFO Candidate with **Strongly Consistent Reads** on Base Table without status filter; self-cancellation via direct base table delete using `queueKey` from `MarqueRSVPs`).
- **Verification Query (AWS CLI):**
  ```bash
  aws dynamodb query \
    --table-name MarqueWaitlist \
    --key-condition-expression "eventId = :eid" \
    --expression-attribute-values '{":eid":{"S":"evt-ccl-hackathon-2026"}}' \
    --scan-index-forward \
    --consistent-read \
    --max-items 1
  ```

---

### Table 6: `MarqueTickets`
- **Table Name:** `MarqueTickets`
- **Partition Key (`PK`):** `ticketId` (String: Opaque Random ID)
- **Sort Key (`SK`):** None
- **Billing Mode:** On-Demand
- **GSI 1: `event-attendees-index`**
  - Partition Key: `eventId` (String)
  - Sort Key: `attendeeName` (String)
  - Projection Type: `ALL`
- **GSI 2: `attendee-tickets-index`**
  - Partition Key: `attendeeId` (String)
  - Sort Key: `eventId` (String)
  - Projection Type: `ALL`
- **Key Attributes:**
  - `ticketId`: String
  - `eventId`: String
  - `attendeeId`: String
  - `attendeeName`: String
  - `attendeeEmail`: String
  - `eventTitle`: String
  - `eventVenue`: String
  - `eventStartAt`: String
  - `status`: String (`ACTIVE`, `CHECKED_IN`, `CANCELLED`)
  - `issuedAt`: String (ISO 8601 UTC)
  - `checkedInAt`: String (Nullable)
  - `checkedInBy`: String (Nullable)
- **Access Patterns Serviced:** AP-12 (Ticket Inspection by Owner), AP-13 (Attendee Registry Search for Check-in Staff), Single-Use Check-in.
- **Verification Query (AWS CLI):**
  ```bash
  aws dynamodb get-item \
    --table-name MarqueTickets \
    --key '{"ticketId":{"S":"tkt-8f3a9e1b2c4d"}}'
  ```

---

## 3. Provisioning Checklist Sign-off

Before deploying backend handlers:
- [ ] All 6 tables created in the same target AWS Region (US East - N. Virginia, `us-east-1`).
- [ ] On-demand capacity mode active on all tables and GSIs.
- [ ] All 6 GSIs have reached `ACTIVE` status:
  - `MarqueEvents.status-startAt-index`
  - `MarqueEvents.organizer-index`
  - `MarqueEventStaff.user-assigned-events-index`
  - `MarqueRSVPs.attendee-index`
  - `MarqueTickets.event-attendees-index`
  - `MarqueTickets.attendee-tickets-index`
- [ ] Table names match environment variables in Lambda configuration.
- [ ] Point-in-time recovery (PITR) enabled on production tables.
- [ ] Lambda execution role grants permissions strictly for these 6 tables and their 6 GSIs.
