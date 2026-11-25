# YT Catchup

A viewing dashboard that shows the latest uploads from the channels a user is subscribed to, with custom Lists and a catch-up autoplay queue.

## Language

**Release**:
A `v`-prefixed version tag (for example `v0.5.0`) on a commit of `main` that was live at ytcatchup.com when it was tagged. One version number covers the whole app.
_Avoid_: Build, deploy (a deploy is the act of going live, a Release is the label for it)

**Invite only**:
The state where signing in requires an invite code, kept in place to protect the YouTube API quota. Lifting it makes the app open to the public.
_Avoid_: Private beta, waitlist

**Demo**:
The login-free, fake-data copy of the app at `/demo` that anyone can try.
_Avoid_: Sandbox, preview
