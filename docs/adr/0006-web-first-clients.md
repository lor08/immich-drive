# ADR 0006: Deliver the file experience in the web client first

- Status: Accepted
- Date: 2026-07-27

## Context

The roadmap plans file features for both the web application and the Flutter application. Building them together looks efficient, but in this fork the mobile path carries costs that the web path does not.

Issue #11 established that the inherited mobile workflow depends on an upstream custom runner and upstream signing secrets, so it cannot build this fork's clients as-is. Shipping mobile means a fork-owned application identifier, fork-owned signing keys, store or F-Droid distribution, and a release pipeline — before a single file feature reaches a user.

Mobile also freezes the API. Once an installed application talks to a server it does not ship with, every contract change becomes a compatibility problem. The web client has no such property: it is served by the same image as the server and is always the matching version.

## Decision

The first usable client for Immich Drive files is the existing Immich **web application**.

- Flutter file features are deferred until the file API has stabilized, which is expected after the index arrives; see ADR 0005.
- While the web client is the only consumer, the file API is explicitly unstable and may change without a compatibility layer or deprecation period.
- No Dart client is generated or maintained for file endpoints during this period.
- Mobile work begins by freezing the contract, then generating the Dart client, and only then implementing screens.
- Photo and video backup remain the responsibility of the existing Immich mobile application throughout, and are unaffected.

## Consequences

### Positive

- Signing identities, store accounts, and release pipelines leave the critical path, so Issue #11 can be resolved on its own schedule.
- The API can be reshaped when the index lands at no compatibility cost, which is what makes ADR 0005 affordable.
- The surface that must be kept synchronized with upstream stays smaller, since the Flutter application is the most active area of the upstream codebase.
- A responsive web application already covers browsing, upload, download, and playback handoff on a phone.

### Negative

- No background or automatic upload of arbitrary files from a phone.
- Android intents, the Storage Access Framework, Android TV navigation, and offline caching are all postponed.
- When Flutter work starts it inherits a larger API in one step rather than growing with it.
- Users who expect a single native application for both photos and files will not have one in early releases.

## Rejected alternatives

**Build web and Flutter in parallel.** Doubles the client surface before the server contract is proven, forces the release and signing decisions immediately, and makes every API correction a coordinated multi-client change.

**Ship a separate dedicated mobile application for files.** Contradicts the product promise of one account and one family of clients, and multiplies the distribution problem instead of deferring it.
