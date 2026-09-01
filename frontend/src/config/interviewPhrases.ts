import { DEFAULT_LANGUAGE_CODE } from './languages';

/**
 * Small set of canned spoken phrases the interview screen uses around the
 * actual AI-generated question (welcome, transitions, thank-you, etc). These
 * are NOT AI content — translating them with a lookup table (not an OpenAI
 * call) keeps a Hindi/Marathi interview's TTS from switching back to English
 * mid-interview, which would sound broken when read by a Hindi/Marathi voice.
 */
export type InterviewPhraseKey =
  | 'welcome'
  | 'intro'
  | 'instructions'
  | 'begin'
  | 'thankYou'
  | 'nextQuestion'
  | 'congratulations'
  | 'reportReady';

const INTERVIEW_PHRASES: Record<string, Record<InterviewPhraseKey, string>> = {
  'en-IN': {
    welcome: 'Welcome to the {topic} interview.',
    intro: 'I will ask you a series of questions.',
    instructions: 'Please click Start Answer button after each question to record your response.',
    begin: "Let's begin.",
    thankYou: 'Thank you.',
    nextQuestion: "Let's move to the next question.",
    congratulations: 'Congratulations! You have completed the interview.',
    reportReady: 'Your report is now ready.',
  },
  'hi-IN': {
    welcome: '{topic} इंटरव्यू में आपका स्वागत है।',
    intro: 'मैं आपसे कुछ सवाल पूछूंगा।',
    instructions: 'हर सवाल के बाद अपना जवाब record करने के लिए कृपया Start Answer बटन पर क्लिक करें।',
    begin: 'चलिए शुरू करते हैं।',
    thankYou: 'धन्यवाद।',
    nextQuestion: 'अब अगले सवाल पर चलते हैं।',
    congratulations: 'बधाई हो! आपने इंटरव्यू पूरा कर लिया है।',
    reportReady: 'आपकी रिपोर्ट अब तैयार है।',
  },
  'mr-IN': {
    welcome: '{topic} मुलाखतीत आपले स्वागत आहे.',
    intro: 'मी तुम्हाला काही प्रश्न विचारेन.',
    instructions: 'प्रत्येक प्रश्नानंतर तुमचे उत्तर रेकॉर्ड करण्यासाठी कृपया Start Answer बटणावर क्लिक करा.',
    begin: 'चला सुरुवात करूया.',
    thankYou: 'धन्यवाद.',
    nextQuestion: 'चला पुढच्या प्रश्नाकडे वळूया.',
    congratulations: 'अभिनंदन! तुम्ही मुलाखत पूर्ण केली आहे.',
    reportReady: 'तुमचा रिपोर्ट आता तयार आहे.',
  },
};

export function getInterviewPhrase(
  key: InterviewPhraseKey,
  language: string | undefined,
  vars?: { topic?: string }
): string {
  const table = INTERVIEW_PHRASES[language || ''] || INTERVIEW_PHRASES[DEFAULT_LANGUAGE_CODE];
  let text = table[key];
  if (vars?.topic) text = text.replace('{topic}', vars.topic);
  return text;
}
