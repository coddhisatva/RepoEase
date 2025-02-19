# Ease

Ease is a proof-of-concept platform that automates micro-savings and student loan payments. It integrates multiple financial APIs to streamline payments seamlessly. The project reached full technical validation, demonstrating the feasibility of an automated loan repayment system.

Development was completed through sandbox testing phase, at which point regulatory research revealed conflicts with the DOE STOP Act of 2020. This repository represents the completed technical validation phase.

## How It Works
The platform automatically rounds up users' daily transactions (e.g., $4.30 becomes $5.00) and accumulates these micro-savings. At the end of each day, accumulated funds are first applied to the monthly subscription fee, with remaining amounts automatically directed to users' student loan accounts.

This model helps borrowers make incremental progress on their loans effortlessly. By automating small, daily contributions, Ease reduces manual effort and optimizes loan repayment without requiring users to change spending habits.

## Technical Overview

Ease demonstrates complex integration of multiple financial services APIs to create a seamless automated payment system:

### Core Architecture
- Backend: Node.js with Express for RESTful API endpoints
- Authentication & Database: Firebase for user management and real-time data
- Banking Integration: Plaid API for account linking and ACH transfers
- Payment Processing: Stripe API for transaction holds and fee collection
- Frontend: Vanilla JavaScript with Webpack bundling
- Cloud Functions: Firebase scheduled functions for batch processing

### Key Features
- Real-time transaction monitoring and round-up calculation
- Multi-directional fund flow management:
  - Transaction round-ups from checking accounts
  - Subscription fee processing
  - Automated loan payment distribution
- Secure multi-account linking and management
- End-of-day batch processing with error recovery
- Comprehensive transaction logging and status tracking

### Technical Highlights
- Secure credential management with environment isolation
- Comprehensive error handling
- Batched Firestore operations for data consistency
- Automated testing infrastructure
- Sandbox environment for financial transaction validation
- Scheduled cloud functions with retry logic
- Collection group queries for efficient data access
- Webhook handling for real-time transaction updates

## Development Status
Development concluded at sandbox testing phase after thorough technical validation. The codebase demonstrates successful integration of complex financial systems while maintaining security and scalability standards.

## Local Development
```bash
# Start frontend build process
npx webpack --watch

# Start development server
npx live-server public  # option 1
npx http-server public  # option 2

# Start backend server
node server/server.js
```

## License
All rights reserved.