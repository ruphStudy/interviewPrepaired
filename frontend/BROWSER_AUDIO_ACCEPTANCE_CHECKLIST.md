# Browser / Audio Manual Acceptance Checklist

Manual, physical-device validation checklist for the interview voice/audio
path (`InterviewScreen.tsx` + `useSpeechInterview.ts` + `voice.service.ts` +
`useAudioPlaybackQueue.ts`). This checklist has **not** been executed against
real hardware as part of any automated work — it exists so a real run can be
tracked and repeated consistently. Do not check an item off, or claim a
device was validated, unless it was actually run on that real browser/device.

The code has been hardened (capability detection, mic-permission error
messages, typed-answer fallback, non-blocking audio/TTS failure, cleanup on
unmount) and covered by source-tracing tests
(`backend/src/services/__tests__/interview.voiceAudioHardening.test.ts`),
but only a real device run can confirm actual runtime behavior — quirks in
Web Speech API availability, on-screen keyboard behavior, and audio
autoplay policy vary by real browser/OS build in ways that cannot be
faithfully simulated.

## How to use this checklist

For each row: perform the action on the real device, then record ✅ (works
as expected), ⚠️ (works with a caveat — note it), or ❌ (broken — file a bug
with browser/OS version, steps, and console output) plus the date and
browser/OS version tested.

---

## Chrome — Desktop (macOS / Windows / Linux)

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Start interview → mic permission prompt appears → **Allow** → mic captures speech, transcript appears live | | |
| 2 | Start interview → mic permission prompt appears → **Block/Deny** → clear message shown, "Type Answer" remains usable | | |
| 3 | Deny mic once, then click "Start Answer" again without changing browser permission → same clear message again (no crash/stuck state) | | |
| 4 | Give a voice answer, click Stop Answer, confirm answer text + submission proceeds | | |
| 5 | Switch to "Type Answer" mid-interview, type an answer, submit successfully | | |
| 6 | Type partial text, click "Use Microphone", then click "Type Answer" again → typed text still present | | |
| 7 | Question audio (TTS) plays automatically after each question is shown | | |
| 8 | Mute system volume / no audio output device → question text still fully readable, interview still progresses without audio | | |
| 9 | Disconnect/mute mic mid-recording → clear "no microphone" message, "Type Answer" still usable | | |
| 10 | Complete a full interview end-to-end (voice + typed mixed), confirm navigation to report | | |

## Safari — Desktop (macOS)

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Mic allow → voice recognition works (or, if Safari's SpeechRecognition support is limited/unavailable in the tested version, confirm automatic fallback to "Type Answer" with a clear message — never a silent hang) | | |
| 2 | Mic deny → clear message, typed fallback usable | | |
| 3 | Typed-answer flow works fully end-to-end (this must always work regardless of Safari's speech-recognition support level) | | |
| 4 | Question audio (TTS) plays; if Safari requires a user gesture before the first utterance, confirm the first "Start Interview" click itself counts and audio isn't silently and permanently blocked | | |
| 5 | Interview completes and navigates to the report | | |

## Android — Chrome

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Mic permission prompt appears on first mic use, Allow works, voice capture works | | |
| 2 | Mic deny → clear message, typed fallback usable | | |
| 3 | On-screen keyboard opens when the typed-answer textarea is focused; Submit/Stop/Start controls remain reachable (scroll if needed) after the keyboard opens — nothing permanently hidden behind it | | |
| 4 | Rotate device / small viewport — question text, controls, and error banners all stay readable and usable without horizontal scrolling | | |
| 5 | Question audio (TTS) plays through the device speaker/headphones | | |
| 6 | Full interview completes end-to-end on this device | | |

## iPhone / iPad — Safari

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Confirm actual Web Speech API (`SpeechRecognition`) availability on the tested iOS/iPadOS + Safari version — record whether it's supported at all | | |
| 2 | If supported: mic allow → voice capture works; mic deny → clear message + typed fallback | | |
| 3 | If NOT supported: app automatically shows the typed-answer flow (no mic controls, no dead/broken button), with no console error visible to the user | | |
| 4 | Typed-answer flow works fully end-to-end regardless of (2)/(3) | | |
| 5 | On-screen keyboard does not permanently cover the Submit button or the question text — user can scroll to reach both | | |
| 6 | Question audio (TTS) — confirm whether iOS Safari's autoplay/user-interaction policy blocks the first utterance, and that the interview still progresses (via the forced-callback timeout) even if audio is silently blocked | | |
| 7 | Full interview completes end-to-end on this device | | |

---

## Recording a run

Copy the table above (or this whole file) into a dated results doc/PR
comment when a real acceptance pass is performed — include device model,
OS version, and browser version for every row, e.g.:

```
2026-XX-XX — iPhone 14, iOS 17.x, Safari — rows 1-7: ✅ ✅ ✅ ✅ ✅ ⚠️(TTS silent
until 2nd tap, interview still progressed) ✅
```

Do not mark this checklist as "complete" in any commit message or summary
unless every relevant row was actually run on real hardware.
