# Interview Pages - Quick Start

## 🚀 Get Started

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Set Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
REACT_APP_API_BASE_URL=http://localhost:5000/api
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Open Browser

Navigate to: `http://localhost:3000/setup`

---

## 📋 Usage Flow

### Setup Interview

1. **Go to Setup Page**: `/setup`
2. **Select Topic**: Choose from 9 interview topics
3. **Select Difficulty**: Beginner/Intermediate/Advanced/Expert
4. **Enter Experience**: Years of experience (0-50)
5. **Set Question Count**: 1-10 questions
6. **Click Start Interview**

### Conduct Interview

1. **Read Question**: Question displays automatically
2. **Click Speaker Icon**: Optional - hear question aloud
3. **Click Start Recording**: Begin voice recording
4. **Speak Your Answer**: Answer appears as transcript
5. **Click Stop Recording**: End recording
6. **Click Submit Answer**: Send answer for evaluation
7. **View Evaluation**: See scores and feedback
8. **Click Continue**: Move to next question
9. **Complete Interview**: View final results

---

## 🎯 Features

### Setup Page

✅ **Topic Selection**
- Node.js, Angular, React, MongoDB, TypeScript
- System Design, Team Lead, Engineering Manager, HR

✅ **Difficulty Levels**
- Beginner (0-2 years)
- Intermediate (2-5 years)
- Advanced (5-10 years)
- Expert (10+ years)

✅ **Validation**
- Required fields check
- Range validation
- Real-time error display

### Interview Page

✅ **Question Display**
- Large readable text
- Progress indicator
- Question counter

✅ **Text-to-Speech**
- Click speaker icon
- Adjustable rate
- Stop/start control

✅ **Voice Recording**
- Start/stop/pause/resume
- Live transcription
- Confidence scoring
- Duration tracking

✅ **Answer Evaluation**
- 5-dimensional scoring
- Strengths/weaknesses
- Suggestions
- Missing points

✅ **Progress Tracking**
- Visual progress bar
- Question X of Y
- Completion percentage

---

## 🔌 API Integration

### Endpoints Used

```typescript
// Start Interview
POST /api/interview/start
{
  topic: string,
  difficulty: string,
  experienceYears: number,
  totalQuestions: number
}

// Submit Answer
POST /api/interview/answer
{
  interviewId: string,
  answer: string,
  duration: number
}

// Get Report
GET /api/interview/report/:id
```

### Authentication

Token stored in localStorage:
```typescript
localStorage.setItem('authToken', 'your-jwt-token');
```

---

## 🎨 Customization

### Change API URL

Edit `.env`:
```env
REACT_APP_API_BASE_URL=https://your-api.com/api
```

### Modify Topics

Edit `frontend/src/api/interviewApi.ts`:
```typescript
export const INTERVIEW_TOPICS = [
  { value: 'CustomTopic', label: 'Custom Topic' },
  // Add more topics
];
```

### Styling

Uses Tailwind CSS. Modify classes in components:
```tsx
<div className="bg-blue-500 text-white p-4 rounded-lg">
  Your content
</div>
```

---

## 📱 Mobile Support

Fully responsive design:
- Mobile: Single column layout
- Tablet: Adjusted spacing
- Desktop: Two-column layout

---

## 🐛 Troubleshooting

### Voice Recording Not Working

1. **Check Browser**: Use Chrome, Edge, or Safari
2. **Enable Microphone**: Allow microphone permissions
3. **Use HTTPS**: Required for microphone access

### API Errors

1. **Check Backend**: Ensure backend server is running
2. **Check URL**: Verify REACT_APP_API_BASE_URL in .env
3. **Check Token**: Ensure authToken is set in localStorage

### Text-to-Speech Not Working

1. **Check Browser**: Most modern browsers support TTS
2. **Check System**: Ensure system has TTS voices installed

---

## 🔍 File Structure

```
frontend/
├── src/
│   ├── api/
│   │   └── interviewApi.ts          # API service layer
│   ├── pages/
│   │   ├── InterviewSetupPage.tsx   # Setup form
│   │   └── InterviewPage.tsx        # Interview conduct
│   ├── components/
│   │   └── Interview/
│   │       ├── VoiceRecorder.tsx    # Voice recording
│   │       ├── SpeechControls.tsx   # Control buttons
│   │       └── TranscriptViewer.tsx # Transcript display
│   ├── App.tsx                       # Routes
│   └── main.tsx                      # Entry point
├── .env                              # Environment variables
└── package.json                      # Dependencies
```

---

## 📊 Components Used

### InterviewSetupPage
- Form with validation
- Dropdowns and inputs
- API integration
- Error handling

### InterviewPage
- Question display
- VoiceRecorder component
- Text-to-speech
- Evaluation display
- Progress tracking

### VoiceRecorder
- Speech recognition
- Live transcription
- Control buttons
- Error handling

---

## 🚀 Deployment

### Build

```bash
npm run build
```

### Deploy to Vercel

```bash
vercel --prod
```

### Environment Variables (Production)

Set in deployment platform:
```
REACT_APP_API_BASE_URL=https://api.yourapp.com/api
```

---

## 💡 Tips

1. **Test Microphone First**: Check permissions before starting
2. **Speak Clearly**: Better recognition accuracy
3. **Save Progress**: Answers are saved after submission
4. **Review Evaluation**: Read feedback before continuing
5. **Complete All Questions**: Get comprehensive final report

---

## 📞 Support

For issues:
1. Check browser console for errors
2. Verify API connection
3. Review environment variables
4. Check browser compatibility

---

## 🎉 Next Steps

After completing interviews:
- View detailed reports
- Track progress over time
- Review strengths and weaknesses
- Practice recommended topics

**Happy Interviewing! 🎤**
