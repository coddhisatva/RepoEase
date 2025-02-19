# Ease.Cash

A proof-of-concept for an automated student loan payment platform. Development was completed through sandbox testing phase, at which point regulatory research revealed conflicts with the DOE STOP Act of 2020. This repository represents the completed technical validation phase.

## How It Works
The platform automatically rounds up users' daily transactions (e.g., $4.30 becomes $5.00) and accumulates these micro-savings. At the end of each day, accumulated funds are first applied to the monthly subscription fee, with remaining amounts automatically directed to users' student loan accounts.

## Technical Overview

Ease.Cash demonstrates complex integration of multiple financial services APIs to create a seamless automated payment system:

### Core Architecture
- Backend: Node.js with Express
- Authentication & Database: Firebase
- Banking Integration: Plaid API
- Payment Processing: Stripe API
- Frontend: Vanilla JavaScript

### Key Features
- Real-time transaction monitoring
- Automated round-up calculations
- Secure bank account linking
- Multi-account support
- Batched end-of-day processing
- Subscription fee management
- Automated student loan payments

### Technical Highlights
- Secure credential management
- Comprehensive error handling
- Transaction atomicity
- Automated testing infrastructure
- Sandbox environment configuration
- Cloud function scheduling
- Collection group queries for efficient data access

## Development Status
Development concluded at sandbox testing phase after thorough technical validation. The codebase demonstrates successful integration of complex financial systems while maintaining security and scalability standards.

## Local Development
```bash
# Frontend
npx webpack --watch

# Development Server
npx live-server public
# or
npx http-server public

# Backend
node server/server.js
```

## License
All rights reserved.