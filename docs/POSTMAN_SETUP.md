# Postman Setup & API Testing Guide

This guide explains how to import `docs/openapi.yaml` into Postman, configure test environments, manage JWT bearer tokens across different stakeholder personas, dynamically capture resource IDs, and test both happy paths and error scenarios (401, 403, 409).

---

## 1. Opening Postman & Importing the OpenAPI Spec

1. Launch the **Postman** desktop application (or web client at `https://web.postman.co`).
2. In the top-left navigation, click the **Import** button (or press `Ctrl + O` / `Cmd + O`).
3. Select **Files** and browse to the repository path:
   ```text
   docs/openapi.yaml
   ```
4. In the import preview modal:
   - Ensure the import format is recognized as **OpenAPI 3.1.0**.
   - Under **Import as**, select **Postman Collection** with the checkbox **Generate collection from OpenAPI specification** enabled.
5. Click **Import**. A collection named **`Marque Campus Event Management API`** will appear in your left sidebar.

---

## 2. Configuring the Postman Environment

To test against local mock, serverless offline, or the deployed AWS API Gateway stage, configure a dedicated Postman Environment.

1. In the left sidebar, click **Environments** $\rightarrow$ **+ (Create Environment)**.
2. Name the environment: **`Marque AWS Staging`** (or **`Marque Local Dev`**).
3. Add the following variables:

| Variable Name | Initial Value | Current Value | Description |
| :--- | :--- | :--- | :--- |
| `baseUrl` | `https://{{apiGatewayId}}.execute-api.{{region}}.amazonaws.com/prod` | (Your API Gateway URL or `http://localhost:3000`) | Base API URL |
| `apiGatewayId` | `your-api-id` | `your-api-id` | AWS API Gateway HTTP API identifier |
| `region` | `us-east-1` | `us-east-1` | Target AWS deployment region (US East - N. Virginia) |
| `currentAuthToken` | (leave empty initially) | (active Bearer JWT for request execution) | Currently active token |
| `loginPersona` | `ATTENDEE` | `ATTENDEE` | Active persona label (`ATTENDEE`, `ORGANIZER`, `COORDINATOR`) |
| `attendeeToken` | (leave empty initially) | (populated after attendee login) | JWT for Attendee persona |
| `organizerToken` | (leave empty initially) | (populated after organizer login) | JWT for Organizer persona |
| `coordinatorToken` | (leave empty initially) | (populated after staff login) | JWT for Coordinator persona |
| `eventId` | `evt-ccl-hackathon-2026` | `evt-ccl-hackathon-2026` | Test Event ID (auto-captured on create) |
| `ticketId` | `tkt-8f3a9e1b2c4d` | `tkt-8f3a9e1b2c4d` | Test Ticket ID (auto-captured on RSVP) |
| `coordinatorUserId` | (leave empty initially) | (populated from staff assign) | Coordinator User ID |

4. Click **Save** (`Ctrl + S`), and ensure the environment is selected in the top-right environment dropdown.

---

## 3. Configuring Authentication & Bearer Tokens

The OpenAPI specification defines the `BearerAuth` security scheme (`Authorization: Bearer <token>`).

### Method A: Collection-Level Token Inheritance (Recommended)
1. Right-click the **Marque Campus Event Management API** collection $\rightarrow$ **Edit**.
2. Switch to the **Authorization** tab.
3. Select **Type: Bearer Token**.
4. In the **Token** field, enter:
   ```text
   {{currentAuthToken}}
   ```
5. Click **Save**. All requests set to "Inherit auth from parent" will now use this active token.

### Method B: Automated Token & Variable Capture via Test Scripts

#### 1. In `POST /api/auth/login` (Tests Tab):
```javascript
if (pm.response.code === 200) {
    const data = pm.response.json();
    pm.environment.set("currentAuthToken", data.token);

    if (data.user.role === "ORGANIZER") {
        pm.environment.set("organizerToken", data.token);
        pm.environment.set("loginPersona", "ORGANIZER");
        console.log("Captured Organizer Token for: " + data.user.email);
    } else {
        pm.environment.set("attendeeToken", data.token);
        pm.environment.set("loginPersona", "ATTENDEE");
        console.log("Captured Attendee Token for: " + data.user.email);
    }
}
```

#### 2. In `POST /api/events` (Create Event - Tests Tab):
```javascript
if (pm.response.code === 201) {
    const data = pm.response.json();
    const createdEventId = data.event ? data.event.eventId : data.eventId;
    pm.environment.set("eventId", createdEventId);
    console.log("Dynamically captured eventId: " + createdEventId);
}
```

#### 3. In `POST /api/events/{{eventId}}/rsvp` (Register RSVP - Tests Tab):
```javascript
if (pm.response.code === 201 && pm.response.json().ticketId) {
    const ticketId = pm.response.json().ticketId;
    pm.environment.set("ticketId", ticketId);
    console.log("Dynamically captured ticketId: " + ticketId);
}
```

#### 4. In `POST /api/events/{{eventId}}/staff` (Assign Staff - Tests Tab):
```javascript
if (pm.response.code === 201) {
    const staffUserId = pm.response.json().assignment.userId;
    pm.environment.set("coordinatorUserId", staffUserId);
    console.log("Dynamically captured coordinatorUserId: " + staffUserId);
}
```

---

## 4. Account Provisioning Rules for Testing

### Controlled Organizer Provisioning
Public registration (`POST /api/auth/register`) strictly assigns `role: "ATTENDEE"`. To test organizer flows:
1. Register a user via `POST /api/auth/register` (e.g., `organizer@vesit.edu`).
2. Run the admin provisioning script or update DynamoDB:
   ```bash
   aws dynamodb update-item \
     --table-name MarqueUsers \
     --key '{"userId":{"S":"usr-xxx"},"itemType":{"S":"PROFILE"}}' \
     --update-expression "SET #r = :org" \
     --expression-attribute-names '{"#r":"role"}' \
     --expression-attribute-values '{":org":{"S":"ORGANIZER"}}'
   ```
3. Login via `POST /api/auth/login` to obtain the organizer JWT.

### Pre-Registration for Check-in Coordinators
Assigning staff (`POST /api/events/{{eventId}}/staff`) requires the target user account to already exist in `MarqueUsers`:
1. Register the coordinator account first via `POST /api/auth/register` (e.g. `preeti.coord@example.com`). Note: their account role remains `ATTENDEE`.
2. The event organizer assigns them using their registered email.
3. The coordinator logs in via `POST /api/auth/login`. Their token is saved as `coordinatorToken` / `currentAuthToken`. They can now access check-in endpoints for this event without any global role elevation.

---

## 5. Testing Happy Paths (Step-by-Step Persona Flows)

### Flow 1: Attendee Discovery & Free RSVP
1. **List Events:** Execute `GET {{baseUrl}}/api/events`. Verify `200 OK` and inspect event list.
2. **Attendee Sign-in:** Execute `POST {{baseUrl}}/api/auth/login` with attendee credentials.
3. **Register RSVP:** Execute `POST {{baseUrl}}/api/events/{{eventId}}/rsvp`.
   - Set Header: `Authorization: Bearer {{attendeeToken}}`.
   - Verify `201 Created` with status `CONFIRMED` and verify returned `ticketId` is captured in environment.
4. **Inspect Personal Digital Pass:** Execute `GET {{baseUrl}}/api/tickets/{{ticketId}}`.
   - Verify `200 OK` and confirm status is `ACTIVE`.

### Flow 2: Organizer Studio & Coordinator Delegation
1. **Organizer Sign-in:** Execute `POST {{baseUrl}}/api/auth/login` with organizer credentials.
2. **Create Event:** Execute `POST {{baseUrl}}/api/events` with Header `Authorization: Bearer {{organizerToken}}`.
   - Verify `201 Created`, response envelope `{ "event": { ... } }`, and verify `eventId` is captured.
3. **Assign Coordinator:** Execute `POST {{baseUrl}}/api/events/{{eventId}}/staff` with payload:
   ```json
   {
     "email": "preeti.coord@example.com"
   }
   ```
   - Verify `201 Created` with `permission: "CHECK_IN"`, and verify `coordinatorUserId` is captured.

### Flow 3: Coordinator Venue Check-in
1. **Coordinator Sign-in:** Login as `preeti.coord@example.com`. Set `currentAuthToken = {{coordinatorToken}}`.
2. **List Assigned Events:** Execute `GET {{baseUrl}}/api/me/assigned-events`.
   - Verify `200 OK` and check that the assigned event appears in the list.
3. **Attendee Search:** Execute `GET {{baseUrl}}/api/events/{{eventId}}/attendees?q=chandrabhanu`.
   - Verify `200 OK` and note the masked email (`ch***@example.com`) and active ticket ID.
4. **Execute Check-in:** Execute `POST {{baseUrl}}/api/events/{{eventId}}/check-in` with payload:
   ```json
   {
     "ticketId": "{{ticketId}}"
   }
   ```
   - Verify `200 OK` with status `CHECKED_IN`, timestamp, and staff name.
5. **Check-in Summary:** Execute `GET {{baseUrl}}/api/events/{{eventId}}/checkin-summary`.
   - Verify `200 OK` with updated `checkedInCount`.

---

## 6. Testing Error Conditions (401, 403, 409)

### Testing 401 Unauthorized
1. Open `POST /api/events` or `GET /api/me/rsvps`.
2. Set **Authorization** to **No Auth** (or send an invalid/expired token).
3. Send request.
4. **Expected Result:**
   - Status: `401 Unauthorized`
   - Body:
     ```json
     {
       "error": {
         "code": "UNAUTHORIZED",
         "message": "Authentication required. Please provide a valid Bearer token."
       }
     }
     ```

### Testing 403 Forbidden (RBAC Guardrail Tests)
1. **Attendee Attempting to Create Event:**
   - Send `POST /api/events` using `Authorization: Bearer {{attendeeToken}}`.
   - **Expected Result:** Status `403 Forbidden` (`FORBIDDEN`).
2. **Attendee Attempting Check-in:**
   - Send `POST /api/events/{{eventId}}/check-in` using `Authorization: Bearer {{attendeeToken}}`.
   - **Expected Result:** Status `403 Forbidden` (`FORBIDDEN`).
3. **Organizer Scanning Without Staff Assignment:**
   - Send `POST /api/events/{{eventId}}/check-in` using `Authorization: Bearer {{organizerToken}}` when the organizer has not explicitly assigned themselves in `MarqueEventStaff`.
   - **Expected Result:** Status `403 Forbidden` (`FORBIDDEN`).
4. **Cross-Organizer Tampering:**
   - Organizer B attempts `PATCH /api/events/{{eventId}}` on an event owned by Organizer A.
   - **Expected Result:** Status `403 Forbidden` (`FORBIDDEN`).
5. **Unassigned Coordinator Check-in:**
   - Coordinator attempts check-in on an event where they have no record in `MarqueEventStaff`.
   - **Expected Result:** Status `403 Forbidden` (`FORBIDDEN`).

### Testing 409 Conflict (Concurrency & Idempotency)
1. **Duplicate RSVP:**
   - Execute `POST /api/events/{{eventId}}/rsvp` a second time with the same attendee token.
   - **Expected Result:** Status `409 Conflict` with code `DUPLICATE_REGISTRATION`.
2. **Duplicate Ticket Check-in:**
   - Execute `POST /api/events/{{eventId}}/check-in` with the same `ticketId` a second time.
   - **Expected Result:** Status `409 Conflict` with code `ALREADY_CHECKED_IN` displaying the original check-in timestamp and staff name.
3. **Duplicate Email Signup:**
   - Execute `POST /api/auth/register` with an already registered email.
   - **Expected Result:** Status `409 Conflict` with code `EMAIL_ALREADY_EXISTS`.

---

## 7. Organizing & Saving Request Presets

1. Create test folders inside Postman:
   - `01. Authentication`
   - `02. Attendee Discovery & RSVP`
   - `03. Organizer Event Studio`
   - `04. Coordinator Check-in Gate`
   - `05. Security & Edge Case Tests (401/403/409)`
2. Use the **Postman Collection Runner** to execute the entire test sequence sequentially and verify that all assertions pass automatically.
