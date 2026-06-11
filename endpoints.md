# API Endpoints Documentation

## Authentication (`/api/auth`)
- `POST /api/auth/register`: Register a new user and send OTP to email.
- `POST /api/auth/verify-otp`: Verify the OTP sent to email and complete registration.
- `POST /api/auth/resend-otp`: Resend a new OTP to the user's email.
- `POST /api/auth/login`: Authenticate user and return JWT token and device ID.
- `GET /api/auth/sync`: Sync user data and check token validity.
- `POST /api/auth/logout`: Log out from the current device and remove session.
- `POST /api/auth/google`: Authenticate using Google Firebase ID token.
- `POST /api/auth/change-password`: Change user password (requires current password).

## Device Management (`/api/devices`)
- `GET /api/devices`: List all devices currently logged into the user's account.
- `DELETE /api/devices/:deviceId`: Remove a specific device session.
- `POST /api/devices/logout-all`: Log out from all devices except the current one (deletes session).

## User Profile (`/api/profile`)
- `GET /api/profile`: Fetch the current user's profile details.
- `PUT /api/profile/update`: Update user profile information (firstName, lastName, contact, bio).
- `PUT /api/profile/photo`: Upload/update profile photo using Multer.
- `GET /api/profile/login-history`: Fetch the login history (IP, timestamp, provider, status) for the user.

## Admin - User Management (`/api/admin/users`)
- `GET /api/admin/users`: List all users with pagination and filtering (customers, providers, admins).
- `GET /api/admin/users/:id`: Get detailed information about a specific user.
- `PATCH /api/admin/users/:id/block`: Block a user and terminate all their active sessions.
- `PATCH /api/admin/users/:id/unblock`: Unblock a previously blocked user.

## Admin - Categories (`/api/admin/categories`)
- `POST /api/admin/categories`: Create a new service category (with image upload).
- `GET /api/admin/categories`: List all categories.
- `GET /api/admin/categories/:id`: Get details of a specific category.
- `PUT /api/admin/categories/:id`: Update category details.
- `DELETE /api/admin/categories/:id`: Delete a category.
- `PATCH /api/admin/categories/:id/toggle-status`: Enable/disable a category.

## Admin - Advertisements (`/api/admin/ads`)
- `GET /api/admin/ads`: List all advertisement requests.
- `PATCH /api/admin/ads/:id/approve`: Approve an ad request.
- `PATCH /api/admin/ads/:id/reject`: Reject an ad request.

## Admin - Applications (`/api/admin/applications`)
- `GET /api/admin/applications`: List all provider applications.
- `GET /api/admin/applications/:id`: Get details of a provider application.
- `PATCH /api/admin/applications/:id/approve`: Approve a provider's application.
- `PATCH /api/admin/applications/:id/reject`: Reject a provider's application.

## User - Ads (`/api/ads`)
- `POST /api/ads/request`: Submit a new advertisement request.
- `GET /api/ads/approved`: List all approved/active advertisements.
- `GET /api/ads/my`: List ads submitted by the current user.

## User - Chat (`/api/chat`)
- `GET /api/chat/conversations`: List all conversations for the current user.
- `GET /api/chat/messages/:conversationId`: Fetch messages for a specific conversation.
- `POST /api/chat/start`: Start a new conversation or get existing one.

## User - Categories & Providers
- `GET /api/categories`: List all active service categories.
- `GET /api/provider/status`: Check the provider registration status for the current user.
- `POST /api/provider`: Register as a service provider (with document upload).

## Miscellaneous
- `GET /health`: Health check endpoint for the backend.
- `GET /uploads-check`: Check the status of the uploads directory.
- `POST /api/test-notification`: Send a test Firebase notification to a hardcoded token.
