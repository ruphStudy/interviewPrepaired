# Media Files for Interview Avatar

## Required Files

Place the following files in this directory:

1. **interviewer-speaking.mp4** - Video that plays when the interviewer is speaking
2. **interviewer-idle.jpg** - Static image shown when paused/listening/thinking

## Instructions

1. Rename your video file to: `interviewer-speaking.mp4`
2. Rename your image file to: `interviewer-idle.jpg` (or .png)
3. Place both files in this `/frontend/src/assets/media/` folder

## How It Works

- **SPEAKING state**: Video plays (with voice)
- **All other states** (LISTENING, THINKING, IDLE, COMPLETED): Static image shows

The video will preload when the component mounts to ensure smooth playback.

## Backup

The original Lottie-based component is backed up at:
`/frontend/src/components/InterviewAvatar/InterviewAvatar.backup.tsx`

To revert to Lottie animations, simply restore this backup file.
