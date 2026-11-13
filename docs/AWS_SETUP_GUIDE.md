# AWS Setup Guide

This guide uses four core AWS services: API Gateway, Lambda, DynamoDB, and S3. Complete resource setup after the team agrees on the code structure and environment variable names.

> AWS console labels can change. Verify the current console options and course/lab account restrictions before creating resources.

## 1. Region and permissions

1. Sign in to the AWS Console using the project account.
2. Select **US East (N. Virginia)** region (`us-east-1`) and use it consistently for all resources: API Gateway, Lambda, DynamoDB, and S3.
3. Check that API Gateway, Lambda, DynamoDB, and S3 are available in `us-east-1`.
4. Check whether the account provides a permitted Lambda execution role (some training environments provide a role such as `LabRole`).
5. Do not create or use personal IAM access keys in frontend code.

**Important:** Lambda needs an execution role to access DynamoDB, S3, and logging. JWT is for application users and does not replace the Lambda execution role. If the lab does not permit an execution role, ask the instructor/admin before proceeding.

## 2. Create DynamoDB tables

Create the five tables defined in `DATABASE_DESIGN.md`: `MarqueUsers`, `MarqueEvents`, `MarqueRSVPs`, `MarqueWaitlist`, and `MarqueTickets`.

For each table:
1. Open DynamoDB → Tables → Create table.
2. Enter the exact table name and partition/sort keys from `DATABASE_DESIGN.md`.
3. Use on-demand capacity for the student MVP if permitted.
4. Create the required GSIs with the exact names and keys in the database document.
5. Wait until the table and indexes are active.
6. Record the names and region (`us-east-1`) for backend configuration.

Do not invent key names during setup; they must match the code.

## 3. Create the S3 bucket

1. Open S3 → Create bucket.
2. Choose a globally unique name, e.g. a name containing `marque-event-banners` plus a unique suffix.
3. Keep Block Public Access enabled.
4. Keep bucket-owner-enforced object ownership unless the account has a specific requirement.
5. Configure CORS only if the browser uploads directly to presigned URLs. Allow the deployed frontend origin and only the needed methods/headers.
6. Use presigned URLs for authorized uploads. Do not make the bucket publicly writable.

If banner upload is not in the MVP, the team can upload a few event images manually. Do not store secrets or private attendee records in S3.

## 4. Lambda execution role

Use the role approved by the course account or create a dedicated role only if permitted. It needs:
- Basic Lambda logging permissions.
- Read/write permissions only for the five Marque DynamoDB tables and required indexes.
- S3 permissions limited to the Marque banner bucket and needed operations.

Avoid broad administrator permissions. Do not place AWS credentials in code.

## 5. Create the Lambda function

1. Open Lambda → Create function → Author from scratch.
2. Name it `marque-api`.
3. Select a supported Node.js runtime (Node.js 22.x is suitable if offered in the account).
4. Assign the permitted execution role.
5. Configure environment variables after code/resource names are finalized.
6. Upload the backend package built by the team. Do not assume the console editor can install npm dependencies.
7. Set the handler to match the exported handler in the backend package.
8. Test a health endpoint before frontend integration.

Suggested environment variables:

> [!IMPORTANT]
> **Reserved Environment Variable:** AWS Lambda automatically provides the reserved `AWS_REGION` environment variable (`us-east-1` when deployed in US East N. Virginia). Do **not** attempt to manually configure the `AWS_REGION` variable in Lambda function environment variable settings, as AWS Lambda rejects manual definition of reserved runtime variables.
> For local development, set `AWS_REGION=us-east-1` in `backend/.env`.

- `USERS_TABLE=MarqueUsers`
- `EVENTS_TABLE=MarqueEvents`
- `EVENT_STAFF_TABLE=MarqueEventStaff`
- `RSVPS_TABLE=MarqueRSVPs`
- `WAITLIST_TABLE=MarqueWaitlist`
- `TICKETS_TABLE=MarqueTickets`
- `S3_BUCKET=<your-private-bucket-name>`
- `JWT_SECRET=<strong-random-secret>`
- `JWT_EXPIRES_IN=24h`
- `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://*.vercel.app`

Never commit the real `JWT_SECRET`. Use a different local-development secret from the deployed secret.

## 6. Create API Gateway HTTP API

1. Open API Gateway → Create API → HTTP API.
2. Add `marque-api` as the Lambda integration.
3. For the initial MVP, route requests to the same Lambda handler and dispatch by HTTP method/path inside the application router.
4. Ensure both root and nested paths reach the handler; a `$default` route is one option. Verify route behavior with a test request.
5. Configure CORS to allow the exact Vercel frontend origin, required methods, and `Authorization`/`Content-Type` headers.
6. Deploy to a stage and copy the invoke URL.
7. Test the health route and a public event endpoint.

Because this MVP uses custom JWTs issued by the application, shared Lambda middleware verifies tokens. An API Gateway managed JWT authorizer requires a compatible issuer and JWKS endpoint; do not configure one with guessed issuer values.

## 7. Connect Vercel frontend

Set this environment variable in Vercel:
- `VITE_API_BASE_URL=<API-Gateway-invoke-URL>`

The frontend must use the environment variable rather than a hardcoded URL. Redeploy after changing environment variables.

## 8. End-to-end validation

- Register an attendee and log in.
- Confirm a JWT is returned and protected endpoints reject invalid tokens.
- Create an event as an authorized organizer.
- RSVP when seats are available; fill the event and verify later users are waitlisted.
- Cancel a confirmed RSVP and verify promotion of the next eligible user.
- Display a ticket QR, then scan it or use manual lookup.
- Scan the same ticket twice and verify the second attempt is rejected.
- Inspect Lambda logs when something fails.

## 9. Cost and cleanup

Use the smallest practical configuration, check lab limits and billing alerts, and clean up unused resources if required by the course. Do not claim a service is deployed until it has been tested in the account.
