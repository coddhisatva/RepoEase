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
