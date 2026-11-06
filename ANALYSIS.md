# SplitMoni Repository Analysis

## Application Architecture

This is a Next.js 16 application built with React 19 and TypeScript, using Tailwind CSS for styling. The app follows a client-server model with:

- **Frontend**: Next.js pages router with React components
- **Backend**: Server-side API routes in `app/api/` 
- **Database**: Local SQLite database (`splitmoni.sqlite`)
- **Authentication**: Session-based authentication with HTTP-only cookies
- **Data Flow**: Client fetches state from `/api/state` and syncs to localStorage

## Frontend and Backend Entry Points

**Frontend:**
- Main entry: `app/page.tsx` (AuthHome component)
- Layout: `app/layout.tsx` 
- Components in `components/` directory

**Backend API Routes:**
- `/api/auth` - Authentication endpoints
- `/api/state` - Fetch current app state
- `/api/expenses` - Expense management
- `/api/settlements` - Settlement management

## Database Structure

The SQLite database contains tables for:
- Users, accounts, sessions (authentication)
- Groups and group members (group membership)
- Invitations (email invitations)
- Expenses and expense splits (expense tracking)
- Settlements (repayment records)

## API Routes

RESTful API with endpoints for authentication, group management, expense creation/deletion, and settlement recording.

## Authentication Implementation

Session-based authentication using HTTP-only cookies, secure password hashing with scrypt, and token expiration handling.

## Background Workers

No explicit background workers - all operations are synchronous.

## Testing Infrastructure

No explicit testing infrastructure mentioned, but code structure suggests it could be unit tested.

## Three Potential Bugs

1. **Insecure Session Management**: Session validation only checks expiration but not additional integrity verification
2. **Race Condition in Expense Saving**: Multiple database operations without explicit transaction boundaries 
3. **Incomplete Settlement Validation Logic**: Potential edge cases in repayment validation that could allow invalid settlements

These bugs are primarily related to data consistency and security in the database operations, which are critical for an application handling financial data.