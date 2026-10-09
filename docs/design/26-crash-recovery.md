# 26 Crash recovery

Issue #54, after tabs (note 25) and the save-failure banner (note 02). With several figures open
a render error that blanks the app is expensive, so it must not lose them.

## Boundary

`CrashBoundary` (`src/ui/CrashBoundary.tsx`) wraps `<App/>` in `main.tsx`, so it covers the canvas,
panels and dialogs alike (an inner boundary would miss an error in App itself). On an error it
renders `RecoveryScreen`: a `role="alertdialog"` that takes focus, names the error kind, offers
**Download a copy of <title>** for every open tab and **Save and reload**.

The figures are never read from React state: the store lives outside React and still holds every tab,
so download reuses `downloadCopy` (session.ts), and reload goes through `flushCurrent()` (the
autosaver) first. A download that throws is reported on the screen, not swallowed. The screen
takes its operations as props, so the unit test needs no store.

## Errors outside render

`installCrashHandlers` (window `error` and `unhandledrejection`) puts an error notice on the status
line; the app stays up. A failed start (fonts or session) in `main.tsx` shows `showStartFailure`,
plain DOM with a Reload button, since React may be what failed; nothing is deleted.

## Analytics

`EVENTS.crash` (`render`, `error`, `rejection`) with the error's built-in class name as the name
(`errorKind`: anything else is `Error`). Never the message, stack or figure content.

## Test hook

`CrashProbe` (rendered by App) throws while `window.__justfigCrash` is truthy. Nothing sets it in
the app, so it is inert; the worst a user could do is crash their own tab, which the recovery screen
handles. `e2e/crash.spec.ts` sets it, edits, and walks the recovery.
