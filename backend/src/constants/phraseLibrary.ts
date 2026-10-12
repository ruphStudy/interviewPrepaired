/**
 * Phase 8 ("Conversation Humanizer") — the static phrase library.
 *
 * A small, hand-authored, DETERMINISTIC set of short neutral phrases the
 * `ConversationHumanizerService` selects from to compose a
 * `ConversationPresentationPlan` (see constants/conversationHumanizer.ts).
 * Nothing here is AI-generated and nothing here is evaluative — every
 * phrase must read the same whether the candidate's last answer was
 * excellent or weak, since `moveType`/`answerSignal` (the ONLY inputs that
 * would reveal that) are never allowed to leak into spoken/displayed text.
 *
 * `allowedModes` is the enforcement point for "never turn hidden evaluation
 * into feedback for an employer candidate" — a phrase that could read as
 * even slightly evaluative (PROBE's "you mentioned something interesting",
 * CHALLENGE's "let's push on that") deliberately excludes `'employer'`.
 * Every other category is unambiguously neutral and safe everywhere.
 */

import { SupportedLanguageCode } from '../config/languages';

// ============================================================================
// Interview "humanizer mode" — the audience this presentation content is
// for. Distinct from (but derived from) `IInterview.purpose`/
// `interviewMode`/`organizationId` — see `deriveHumanizerMode` in
// constants/conversationHumanizer.ts, the ONE place that maps real Interview
// fields to this value.
// ============================================================================
export const HUMANIZER_INTERVIEW_MODE_VALUES = ['practice', 'uploaded', 'institute', 'employer'] as const;
export type HumanizerInterviewMode = (typeof HUMANIZER_INTERVIEW_MODE_VALUES)[number];

export const PHRASE_CATEGORY_VALUES = [
  'NEUTRAL_ACK',
  'THINKING',
  'PROBE',
  'TRANSITION',
  'CLARIFY',
  'CALLBACK',
  'CONTRADICTION_NEUTRAL',
  'CHALLENGE',
  'NO_ANSWER',
  'LONG_ANSWER',
  'DELAY_BRIDGE',
  // Phase 11 — the interview's opening greeting (before the first question)
  // and its closing sign-off (once the last answer has been submitted).
  // Both are one-time, scripted moments (never mid-interview filler), which
  // is why `phraseSelector.ts`'s SILENCE_WEIGHT deliberately gives both 0 —
  // unlike every category above, these must never resolve to "say nothing".
  'WELCOME',
  'CLOSING',
] as const;
export type PhraseCategory = (typeof PHRASE_CATEGORY_VALUES)[number];

/**
 * Hindi/Marathi hardening (multilingual conversation) — a natural,
 * hand-authored (never machine-translated-sounding) translation per
 * non-English supported language. Deliberately NOT keyed by the full
 * `SupportedLanguageCode` union (which also has 'en-IN'): English always
 * uses `Phrase.text` itself as the single source of truth, so there is
 * never a redundant/driftable 'en-IN' entry here. A missing entry for a
 * given phrase+language is expected and safe — `resolvePhraseText` falls
 * back to `text` (English) rather than producing broken/mixed text.
 */
export type PhraseTranslations = Partial<Record<Exclude<SupportedLanguageCode, 'en-IN'>, string>>;

export interface Phrase {
  id: string;
  category: PhraseCategory;
  text: string;
  /** Hindi/Marathi natural-language variants of `text` — see `PhraseTranslations`'s own doc comment. */
  translations?: PhraseTranslations;
  allowedModes: HumanizerInterviewMode[];
  /** Relative weight within its own category+mode pool — NOT a 0-100 scale, only meaningful compared to siblings. */
  weight: number;
  /** Minimum number of turns since this exact phrase id was last used (per `recentPhraseHistory`'s position-based window) before it's eligible again. 0 = no cooldown. */
  minimumGap: number;
  /** Semantic avatar-state vocabulary already established by useInterviewPresentationState.ts's `PresentationState` — never a parallel vocabulary. */
  avatarStateHint: string;
  // Deliberately NOT added yet: `audioAssetKey?: string` — a future,
  // trivially-additive field once pre-recorded audio exists for phrases.
  // Omitted now per explicit instruction; adding it later needs no
  // migration since every consumer already treats `Phrase` fields as
  // optional-safe/additive.
}

/**
 * Resolves the final display/spoken text for an already-selected phrase in
 * the given language — the ONLY place language affects phrase output.
 * Selection eligibility (category/mode/cooldown/weight) never depends on
 * language; this purely picks which STRING to use for whichever phrase was
 * already chosen. Falls back to the English `text` (never `undefined`,
 * never a partially-translated/mixed string) whenever `languageCode` is
 * 'en-IN', or no translation exists for it yet — this is the fallback-
 * safety contract the rest of the humanizer pipeline relies on.
 */
export function resolvePhraseText(phrase: Pick<Phrase, 'text' | 'translations'>, languageCode: SupportedLanguageCode): string {
  if (languageCode === 'en-IN') return phrase.text;
  return phrase.translations?.[languageCode] || phrase.text;
}

const ALL_MODES: HumanizerInterviewMode[] = ['practice', 'uploaded', 'institute', 'employer'];
const NON_EMPLOYER_MODES: HumanizerInterviewMode[] = ['practice', 'uploaded', 'institute'];

export const PHRASE_LIBRARY: Phrase[] = [
  // ==========================================================================
  // NEUTRAL_ACK — the default "I heard you" reaction. Safe everywhere.
  // ==========================================================================
  { id: 'neutral_ack_okay', category: 'NEUTRAL_ACK', text: 'Okay.', translations: { 'hi-IN': 'ठीक है.', 'mr-IN': 'ठीक आहे.' }, allowedModes: ALL_MODES, weight: 3, minimumGap: 2, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'neutral_ack_right', category: 'NEUTRAL_ACK', text: 'Right.', translations: { 'hi-IN': 'सही है.', 'mr-IN': 'बरोबर.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 2, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'neutral_ack_got_it', category: 'NEUTRAL_ACK', text: 'Got it.', translations: { 'hi-IN': 'समझ गया.', 'mr-IN': 'समजलं.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 2, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'neutral_ack_i_see', category: 'NEUTRAL_ACK', text: 'I see.', translations: { 'hi-IN': 'अच्छा, समझा.', 'mr-IN': 'अच्छं, समजलं.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 2, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'neutral_ack_alright', category: 'NEUTRAL_ACK', text: 'Alright.', translations: { 'hi-IN': 'अच्छा.', 'mr-IN': 'ठीक आहे.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 2, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'neutral_ack_mmhmm', category: 'NEUTRAL_ACK', text: 'Mm-hmm.', translations: { 'hi-IN': 'हूँ.', 'mr-IN': 'हं.' }, allowedModes: ALL_MODES, weight: 1, minimumGap: 3, avatarStateHint: 'ACKNOWLEDGING' },

  // ==========================================================================
  // THINKING — a brief "considering what to ask next" beat. Safe everywhere
  // (never states or implies a judgment about the answer just given).
  // ==========================================================================
  { id: 'thinking_hmm', category: 'THINKING', text: 'Hmm...', translations: { 'hi-IN': 'हम्म...', 'mr-IN': 'हम्म...' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'THINKING_SHORT' },
  { id: 'thinking_let_me_think', category: 'THINKING', text: 'Okay... let me think.', translations: { 'hi-IN': 'ठीक है... मुझे सोचने दीजिए.', 'mr-IN': 'ठीक आहे... मला जरा विचार करू द्या.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'THINKING_SHORT' },
  { id: 'thinking_lets_see', category: 'THINKING', text: "Alright... let's see.", translations: { 'hi-IN': 'अच्छा... देखते हैं.', 'mr-IN': 'बरं... बघूया.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'THINKING_SHORT' },

  // ==========================================================================
  // PROBE — leads into a follow-up/deepen/scenario/claim-probe question.
  // Excluded from employer mode: even a mild "that's worth digging into"
  // can read as a signal about answer quality to a hiring candidate.
  // ==========================================================================
  { id: 'probe_interesting', category: 'PROBE', text: 'You mentioned something interesting there.', translations: { 'hi-IN': 'आपने अभी एक दिलचस्प बात कही.', 'mr-IN': 'तुम्ही आत्ता एक रंजक मुद्दा मांडला.' }, allowedModes: NON_EMPLOYER_MODES, weight: 2, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'probe_dig_in', category: 'PROBE', text: "That's worth digging into a bit more.", translations: { 'hi-IN': 'इसे थोड़ा और गहराई से समझते हैं.', 'mr-IN': 'यावर थोडं अधिक खोलात जाऊया.' }, allowedModes: NON_EMPLOYER_MODES, weight: 2, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'probe_explore_further', category: 'PROBE', text: "Let's explore that a little further.", translations: { 'hi-IN': 'चलिए इसे थोड़ा और explore करते हैं.', 'mr-IN': 'चला, यावर थोडं अजून बघूया.' }, allowedModes: NON_EMPLOYER_MODES, weight: 2, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'probe_curious', category: 'PROBE', text: "I'm curious to hear more about that.", translations: { 'hi-IN': 'मुझे इसके बारे में और जानने में दिलचस्पी है.', 'mr-IN': 'मला याबद्दल अजून जाणून घ्यायला आवडेल.' }, allowedModes: NON_EMPLOYER_MODES, weight: 1, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },

  // ==========================================================================
  // TRANSITION — plain "moving on" — used for SWITCH_COMPETENCY and any
  // generic progression. Unambiguously neutral, safe everywhere.
  // ==========================================================================
  { id: 'transition_moving_on', category: 'TRANSITION', text: "Let's move on.", translations: { 'hi-IN': 'चलिए आगे बढ़ते हैं.', 'mr-IN': 'चला, पुढे जाऊया.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'transition_next_question', category: 'TRANSITION', text: 'Moving to the next question.', translations: { 'hi-IN': 'अगले सवाल की ओर बढ़ते हैं.', 'mr-IN': 'पुढच्या प्रश्नाकडे वळूया.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'transition_lets_continue', category: 'TRANSITION', text: "Let's continue.", translations: { 'hi-IN': 'चलिए जारी रखते हैं.', 'mr-IN': 'चला, पुढे सुरू ठेवूया.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'transition_next_up', category: 'TRANSITION', text: 'Next up.', translations: { 'hi-IN': 'अगला सवाल.', 'mr-IN': 'पुढचा प्रश्न.' }, allowedModes: ALL_MODES, weight: 1, minimumGap: 3, avatarStateHint: 'ASKING_QUESTION' },

  // ==========================================================================
  // CLARIFY — leads into a CLARIFY move (also covers "repeat/rephrase"
  // requests — asking the candidate to clarify/expand/restate is the same
  // conversational move). Neutral, safe everywhere.
  // ==========================================================================
  { id: 'clarify_just_to_clarify', category: 'CLARIFY', text: 'Just to clarify —', translations: { 'hi-IN': 'बस स्पष्ट करने के लिए —', 'mr-IN': 'फक्त स्पष्ट करण्यासाठी —' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'clarify_make_sure_i_understand', category: 'CLARIFY', text: 'Let me make sure I understand —', translations: { 'hi-IN': 'मैं सुनिश्चित कर लूं कि मैं सही समझा —', 'mr-IN': 'मी नीट समजलो आहे का ते बघतो —' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'clarify_one_quick', category: 'CLARIFY', text: 'One quick clarification —', translations: { 'hi-IN': 'एक छोटा सा स्पष्टीकरण —', 'mr-IN': 'एक छोटीशी स्पष्टता —' }, allowedModes: ALL_MODES, weight: 1, minimumGap: 3, avatarStateHint: 'ASKING_QUESTION' },

  // ==========================================================================
  // CALLBACK — leads into a MEMORY_CALLBACK move, neutrally referencing an
  // earlier answer (never characterizing it). Safe everywhere.
  // ==========================================================================
  { id: 'callback_going_back', category: 'CALLBACK', text: 'Going back to something you mentioned earlier —', translations: { 'hi-IN': 'आपने पहले जो बात कही थी, उस पर वापस आते हैं —', 'mr-IN': 'तुम्ही आधी जे सांगितलं होतं त्याकडे परत वळूया —' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'callback_earlier_point', category: 'CALLBACK', text: "Earlier you brought up a point I'd like to revisit —", translations: { 'hi-IN': 'पहले आपने एक बात कही थी, जिस पर मैं फिर से बात करना चाहूंगा —', 'mr-IN': 'आधी तुम्ही एक मुद्दा मांडला होता, त्यावर मला पुन्हा बोलायचं आहे —' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'callback_circling_back', category: 'CALLBACK', text: 'Circling back to your earlier answer —', translations: { 'hi-IN': 'आपके पहले के जवाब पर वापस आते हुए —', 'mr-IN': 'तुमच्या आधीच्या उत्तराकडे परत येताना —' }, allowedModes: ALL_MODES, weight: 1, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },

  // ==========================================================================
  // CONTRADICTION_NEUTRAL — leads into a CONTRADICTION_PROBE move. Every
  // phrase here is deliberately non-accusatory ("help me understand"/
  // "square this", never "you contradicted yourself"/"that doesn't match
  // what you said") — this is the hard neutrality requirement for this
  // category specifically. Safe everywhere by construction.
  // ==========================================================================
  { id: 'contradiction_neutral_reconcile', category: 'CONTRADICTION_NEUTRAL', text: 'Earlier you mentioned something a little different — can you help me reconcile that?', translations: { 'hi-IN': 'पहले आपने थोड़ा अलग बताया था — क्या आप इसे समझाने में मेरी मदद करेंगे?', 'mr-IN': 'आधी तुम्ही थोडं वेगळं सांगितलं होतं — याचा मेळ घालायला मदत कराल का?' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 5, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'contradiction_neutral_walk_through', category: 'CONTRADICTION_NEUTRAL', text: "I want to make sure I've got this right — can you walk me through that again?", translations: { 'hi-IN': 'मैं यह सुनिश्चित करना चाहता हूँ कि मैं सही समझा — क्या आप इसे फिर से समझा सकते हैं?', 'mr-IN': 'मला खात्री करायची आहे की मी बरोबर समजलोय — तुम्ही हे पुन्हा समजावून सांगाल का?' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 5, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'contradiction_neutral_square', category: 'CONTRADICTION_NEUTRAL', text: 'Just to square something you said earlier — could you clarify?', translations: { 'hi-IN': 'आपने पहले जो कहा था, उसे थोड़ा स्पष्ट कर दीजिए —', 'mr-IN': 'तुम्ही आधी जे सांगितलं होतं, ते जरा स्पष्ट कराल का —' }, allowedModes: ALL_MODES, weight: 1, minimumGap: 5, avatarStateHint: 'ASKING_QUESTION' },

  // ==========================================================================
  // CHALLENGE — leads into a CHALLENGE_ASSUMPTION move. Excluded from
  // employer mode: framing anything as a "challenge"/"push"/"stress-test"
  // reads as evaluative pressure toward a hiring candidate.
  // ==========================================================================
  { id: 'challenge_push_on_that', category: 'CHALLENGE', text: "Let's push on that a bit.", translations: { 'hi-IN': 'चलिए इस पर थोड़ा और गहराई से बात करते हैं.', 'mr-IN': 'चला, यावर थोडं अजून खोलात बोलूया.' }, allowedModes: NON_EMPLOYER_MODES, weight: 2, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'challenge_assumption', category: 'CHALLENGE', text: "I'd like to challenge that assumption for a moment.", translations: { 'hi-IN': 'मैं इस धारणा को थोड़ी चुनौती देना चाहूंगा.', 'mr-IN': 'मला या गृहीतकाला थोडं आव्हान द्यायचं आहे.' }, allowedModes: NON_EMPLOYER_MODES, weight: 2, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },
  { id: 'challenge_stress_test', category: 'CHALLENGE', text: "Let's stress-test that a little.", translations: { 'hi-IN': 'चलिए इसे थोड़ा परखते हैं.', 'mr-IN': 'चला, याची थोडी कसोटी घेऊया.' }, allowedModes: NON_EMPLOYER_MODES, weight: 1, minimumGap: 4, avatarStateHint: 'ASKING_QUESTION' },

  // ==========================================================================
  // NO_ANSWER — a gentle, non-judgmental bridge when the candidate gave no
  // real answer. Never implies fault. Safe everywhere.
  // ==========================================================================
  { id: 'no_answer_different_angle', category: 'NO_ANSWER', text: "No worries — let's try a different angle.", translations: { 'hi-IN': 'कोई बात नहीं — चलिए एक अलग तरीके से कोशिश करते हैं.', 'mr-IN': 'काही हरकत नाही — चला वेगळ्या पद्धतीने बघूया.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'no_answer_move_forward', category: 'NO_ANSWER', text: "That's okay, let's move forward.", translations: { 'hi-IN': 'कोई बात नहीं, आगे बढ़ते हैं.', 'mr-IN': 'हरकत नाही, पुढे जाऊया.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'no_answer_come_back', category: 'NO_ANSWER', text: "Let's come back to that another way.", translations: { 'hi-IN': 'चलिए इस पर बाद में किसी और तरीके से बात करते हैं.', 'mr-IN': 'आपण यावर नंतर वेगळ्या पद्धतीने बोलूया.' }, allowedModes: ALL_MODES, weight: 1, minimumGap: 3, avatarStateHint: 'ACKNOWLEDGING' },

  // ==========================================================================
  // LONG_ANSWER — acknowledges a lengthy/verbose answer neutrally (never a
  // quality judgment — verbosity is descriptive only, see answerSignal.ts).
  // Safe everywhere.
  // ==========================================================================
  { id: 'long_answer_thanks_detail', category: 'LONG_ANSWER', text: 'Thanks for the detail.', translations: { 'hi-IN': 'विस्तार से बताने के लिए धन्यवाद.', 'mr-IN': 'सविस्तर सांगितल्याबद्दल धन्यवाद.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'long_answer_appreciate_thorough', category: 'LONG_ANSWER', text: 'Appreciate the thorough answer.', translations: { 'hi-IN': 'इतने विस्तृत जवाब के लिए शुक्रिया.', 'mr-IN': 'इतक्या सविस्तर उत्तराबद्दल आभारी आहे.' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'ACKNOWLEDGING' },
  { id: 'long_answer_helpful_context', category: 'LONG_ANSWER', text: "That's helpful context, thank you.", translations: { 'hi-IN': 'यह जानकारी बहुत मददगार रही, धन्यवाद.', 'mr-IN': 'ही माहिती खूप उपयुक्त होती, धन्यवाद.' }, allowedModes: ALL_MODES, weight: 1, minimumGap: 3, avatarStateHint: 'ACKNOWLEDGING' },

  // ==========================================================================
  // DELAY_BRIDGE — a generic, content-free bridge for a genuinely long wait.
  // Note: `buildPresentationPlan` runs AFTER the response already exists (in
  // the same request/response cycle as the next question), so by the time a
  // plan is built the wait is already over — this category is therefore not
  // currently selected by `buildPresentationPlan` itself. It's defined here
  // for completeness (per the full category taxonomy) and for potential
  // future use by a purely client-side pre-response filler (Phase 7's own
  // domain, never fed by this service). Safe everywhere.
  // ==========================================================================
  { id: 'delay_bridge_just_a_moment', category: 'DELAY_BRIDGE', text: 'Just a moment...', translations: { 'hi-IN': 'एक क्षण...', 'mr-IN': 'एक क्षण...' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'THINKING_LONG' },
  { id: 'delay_bridge_one_second', category: 'DELAY_BRIDGE', text: 'One second...', translations: { 'hi-IN': 'बस एक सेकंड...', 'mr-IN': 'फक्त एक सेकंद...' }, allowedModes: ALL_MODES, weight: 2, minimumGap: 3, avatarStateHint: 'THINKING_LONG' },
  { id: 'delay_bridge_bear_with_me', category: 'DELAY_BRIDGE', text: 'Bear with me for a moment...', translations: { 'hi-IN': 'थोड़ा धैर्य रखिए...', 'mr-IN': 'जरा थांबा हं...' }, allowedModes: ALL_MODES, weight: 1, minimumGap: 3, avatarStateHint: 'THINKING_LONG' },

  // ==========================================================================
  // WELCOME — spoken once, before the first question, combining a brief
  // greeting with what to expect (mirrors the master prompt's own example
  // lines: "Hi, good to meet you." / "I'll ask you a few questions and
  // we'll take them one at a time." / "Take your time with your answers.").
  // One phrase carries the whole opening beat (never split across the
  // ack/transition slots — see ConversationHumanizerService.
  // buildWelcomePresentationPlan) so there is no risk of the same category
  // being drawn twice for two different slots. A practice-only warmer
  // variant is permitted (per the master prompt); every other mode gets the
  // same professional-neutral wording an employer/institute candidate can
  // safely hear.
  // ==========================================================================
  {
    id: 'welcome_neutral_greeting',
    category: 'WELCOME',
    text: "Hi, good to meet you. I'll ask you a few questions and we'll take them one at a time — take your time with your answers.",
    translations: {
      'hi-IN': 'नमस्ते, आपसे मिलकर अच्छा लगा. मैं आपसे कुछ सवाल पूछूंगा और हम उन्हें एक-एक करके लेंगे — अपने जवाबों के लिए अपना समय लीजिए.',
      'mr-IN': 'नमस्कार, तुम्हाला भेटून आनंद झाला. मी तुम्हाला काही प्रश्न विचारेन आणि आपण ते एक-एक करून घेऊ — तुमच्या उत्तरांसाठी तुमचा वेळ घ्या.',
    },
    allowedModes: ALL_MODES,
    weight: 3,
    minimumGap: 0,
    avatarStateHint: 'ASKING_QUESTION',
  },
  {
    id: 'welcome_practice_warm',
    category: 'WELCOME',
    text: "Hey, great to have you here today. I'll ask you a few questions, one at a time, so just take your time with each answer.",
    translations: {
      'hi-IN': 'नमस्ते, आज आपका यहाँ होना अच्छा लगा. मैं आपसे एक-एक करके कुछ सवाल पूछूंगा, तो हर जवाब के लिए अपना समय लीजिए.',
      'mr-IN': 'नमस्कार, आज तुम्ही इथे आहात याचा आनंद आहे. मी तुम्हाला एक-एक करून काही प्रश्न विचारेन, त्यामुळे प्रत्येक उत्तरासाठी तुमचा वेळ घ्या.',
    },
    allowedModes: ['practice'],
    weight: 2,
    minimumGap: 0,
    avatarStateHint: 'ASKING_QUESTION',
  },

  // ==========================================================================
  // CLOSING — spoken once, immediately after the FINAL answer's submission
  // response (the same turn `isCompleted` becomes true). Deliberately never
  // reveals a result/score/selection outcome, and the practice/uploaded/
  // institute wording never promises the report is ready THIS INSTANT (see
  // getInterviewReport's own lazy-generation contract) — only "shortly".
  // Employer wording hands off to HR with zero result leakage, matching
  // CONTRADICTION_NEUTRAL/CHALLENGE's own employer-safety discipline above.
  // ==========================================================================
  {
    id: 'closing_report_ready_shortly',
    category: 'CLOSING',
    text: "Alright, that's all for this interview. Your feedback and report will be ready shortly.",
    translations: {
      'hi-IN': 'ठीक है, इस इंटरव्यू के लिए बस इतना ही. आपकी फीडबैक और रिपोर्ट जल्द ही तैयार हो जाएगी.',
      'mr-IN': 'ठीक आहे, या मुलाखतीसाठी एवढंच. तुमचा अभिप्राय आणि अहवाल लवकरच तयार होईल.',
    },
    allowedModes: NON_EMPLOYER_MODES,
    weight: 3,
    minimumGap: 0,
    avatarStateHint: 'ACKNOWLEDGING',
  },
  {
    id: 'closing_report_ready_shortly_alt',
    category: 'CLOSING',
    text: "That wraps up this interview. Thanks for your time — your feedback and report will be ready shortly.",
    translations: {
      'hi-IN': 'यह इंटरव्यू यहीं समाप्त होता है. आपके समय के लिए धन्यवाद — आपकी फीडबैक और रिपोर्ट जल्द ही तैयार हो जाएगी.',
      'mr-IN': 'ही मुलाखत इथे संपते. तुमच्या वेळेसाठी धन्यवाद — तुमचा अभिप्राय आणि अहवाल लवकरच तयार होईल.',
    },
    allowedModes: NON_EMPLOYER_MODES,
    weight: 1,
    minimumGap: 0,
    avatarStateHint: 'ACKNOWLEDGING',
  },
  {
    id: 'closing_employer_hr_handoff',
    category: 'CLOSING',
    text: "Alright, that's everything from my side. I'll share my feedback with the HR team, and they'll take it from here.",
    translations: {
      'hi-IN': 'ठीक है, मेरी तरफ से बस इतना ही. मैं अपनी फीडबैक HR टीम के साथ साझा करूंगा, और वे आगे की प्रक्रिया संभालेंगे.',
      'mr-IN': 'ठीक आहे, माझ्याकडून एवढंच. मी माझा अभिप्राय HR टीमसोबत शेअर करेन, आणि ते पुढील प्रक्रिया बघतील.',
    },
    allowedModes: ['employer'],
    weight: 3,
    minimumGap: 0,
    avatarStateHint: 'ACKNOWLEDGING',
  },
];

export function getPhrasesForCategory(category: PhraseCategory): Phrase[] {
  return PHRASE_LIBRARY.filter((p) => p.category === category);
}
