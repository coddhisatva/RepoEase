# RepoEase
Ease Repository 0.2

# For frontend (in first terminal):
npx webpack --watch

# In a second terminal, for local, run one of these:
npx live-server public
# or
npx http-server public
# or, for web hosting:
firebase deploy

# For backend (in a third terminal):
node server/server.js

Firebase UI Email Enumeration:
-https://github.com/firebase/firebaseui-web/issues/1040
-In order to allow sign in with Firebase UI post Sep 2023, you have to disable email eumeration.
--This is a security risk as it exposes user emails.
--No fix as of now, >1year later. Have they abandoned FirebaseUI?
It would be advantageous to get to know someone on a Firebase team.
-headquarters: 22 4th Street, San Francisco.

I think we should change from FirebaseUI to Clerk, and use next.js (React framework).

Tailwind -- recd by Will
ChadCm -- Ui component library recd by will
InstantDb (to be aware of)-- database acts like a web socket (instantaneous updates), recd by Will -- cached locally

## Bank Account Linking

### Behavior
- Users can link multiple bank accounts through Plaid
- Each connection can include checking accounts, credit cards, and/or student loan accounts, etc
- Student loan accounts are tagged as 'destination' (for payments)
- All else are tagged as 'source' (for round-ups)
- Users can:
  - Connect multiple accounts from the same bank
  - Connect accounts from different banks
  - Add student loan accounts at any time (not required immediately)

### Duplicate Prevention
- Cannot link the same account type from the same institution twice
- Can link different account types from the same institution
- Can link same account types from different institutions

### Data Storage
Each connection is stored in Firestore with:
- Encrypted access token
- Institution ID
- Account details including:
  - Account IDs
  - Account types
  - Account purposes (source/destination)
  - Account masks (last 4 digits)


  A proof-of-concept for an automated student loan payment platform. Development was completed through sandbox testing phase, at which point regulatory research revealed conflicts with the DOE STOP Act of 2020. This repository represents the completed technical validation phase.