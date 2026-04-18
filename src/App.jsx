import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════
// WORD DATA
// ═══════════════════════════════════════════════════════════
const SEMESTER_1 = [
  "a", "I", "can", "go", "is", "my", "see", "the", "to", "we",
  "am", "at", "like", "you", "have", "on", "are", "as", "no", "it",
  "look", "in", "me", "and", "an",
];

const SEMESTER_2 = [
  "big", "come", "down", "help", "here", "was", "jump", "not", "play", "run",
  "said", "do", "he", "she", "for", "but", "they", "want", "what", "who",
  "yes", "with", "that", "this", "saw",
];

const ALL_SIGHT_WORDS = [...SEMESTER_1, ...SEMESTER_2];

// Kid-friendly example sentences for each word
const SENTENCES = {
  "a": "I see a cat.", "I": "I like to play.", "can": "I can do it.",
  "go": "Let's go outside.", "is": "She is happy.", "my": "This is my book.",
  "see": "I can see you.", "the": "Look at the dog.", "to": "I want to go.",
  "we": "We are friends.", "am": "I am here.", "at": "Look at me.",
  "like": "I like you.", "you": "I see you.", "have": "I have a pet.",
  "on": "It is on the table.", "are": "We are happy.", "as": "As big as a bear.",
  "no": "No, thank you.", "it": "I like it.", "look": "Look at that!",
  "in": "The cat is in the box.", "me": "Come with me.", "and": "You and me.",
  "an": "I see an apple.", "big": "The dog is big.", "come": "Come here please.",
  "down": "Sit down now.", "help": "Can you help me?", "here": "Come over here.",
  "was": "She was happy.", "jump": "I can jump high.", "not": "I am not sad.",
  "play": "Let's go play.", "run": "I like to run fast.", "said": "She said hello.",
  "do": "What do you want?", "he": "He is my friend.", "she": "She can run fast.",
  "for": "This is for you.", "but": "I like it, but it's big.",
  "they": "They are coming.", "want": "I want to play.", "what": "What is that?",
  "who": "Who is that?", "yes": "Yes, I can!", "with": "Come with me.",
  "that": "Look at that.", "this": "I like this.", "saw": "I saw a bird.",
};

// Session length defaults to 10 so kids get a finish line
const SESSION_LENGTH = 10;

// Lowercase lookup for sight-word detection in the story
const SIGHT_WORD_SET = new Set(ALL_SIGHT_WORDS.map(w => w.toLowerCase()));

// ─── Story for Story Time mode (uses all 50 sight words) ───
const STORY_TITLE = "My Big Day at the Park";
const STORY_PARAGRAPHS = [
  "I am here with my dog. My dog is big. He is Max.",
  "\u201CCome, Max!\u201D I said. \u201CWe can go to the park! Do you want to play?\u201D",
  "\u201CYes!\u201D said Max.",
  "At the park, I saw a cat up on a tree.",
  "\u201CLook! An orange cat! Who is that?\u201D I said.",
  "\u201CShe is as big as me!\u201D said Max.",
  "The cat was not happy. She did not want to come down.",
  "\u201CDo you want help?\u201D I said. \u201CI can help you.\u201D",
  "\u201CNo, I am scared,\u201D said the cat.",
  "\u201CJump to me. I have you.\u201D",
  "The cat did jump. I had her!",
  "\u201CYes! We did it!\u201D I said. \u201CWhat is your name?\u201D",
  "\u201CMy name is Lily.\u201D",
  "Max is big but Lily is not. Now they are friends! They run and play in the grass with me. See how they jump! This is a big day for me. I like it here!",
];

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const haptic = (ms = 10) => {
  try { navigator.vibrate?.(ms); } catch {}
};

// Singleton audio context — reusing avoids Safari resource leaks
let _audioCtx = null;
const getAudioCtx = () => {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return null; }
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
};

const playTone = (freq, dur, type = "sine", when = 0) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = ctx.currentTime + when;
  gain.gain.setValueAtTime(0.25, start);
  gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur);
};

const cheerSound = () => {
  playTone(523, 0.12);
  playTone(659, 0.12, "sine", 0.1);
  playTone(784, 0.25, "sine", 0.2);
  haptic([15, 30, 15]);
};

const wrongSound = () => {
  playTone(220, 0.25, "sawtooth");
  haptic(40);
};

const winSound = () => {
  [523, 587, 659, 698, 784, 880, 988, 1047].forEach((f, i) => {
    playTone(f, 0.15, "sine", i * 0.08);
  });
  haptic([30, 50, 30, 50, 30]);
};

// ─── Speech synthesis with proper voice loading ───
let _preferredVoice = null;
let _voicesReady = false;

const loadVoices = () => {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  if (voices.length === 0) return false;
  _preferredVoice =
    voices.find(v => v.name.includes("Samantha")) ||
    voices.find(v => v.name.includes("Karen")) ||
    voices.find(v => v.name.includes("Google US English")) ||
    voices.find(v => v.name.includes("Microsoft Aria")) ||
    voices.find(v => v.lang?.startsWith("en") && v.name.toLowerCase().includes("female")) ||
    voices.find(v => v.lang?.startsWith("en-US")) ||
    voices.find(v => v.lang?.startsWith("en")) ||
    voices[0];
  _voicesReady = true;
  return true;
};

if (typeof window !== "undefined" && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

const makeUtterance = (text, rate = 0.7) => {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.pitch = 1.05;
  u.volume = 1;
  if (!_voicesReady) loadVoices();
  if (_preferredVoice) u.voice = _preferredVoice;
  return u;
};

const speak = (text, rate = 0.65) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(makeUtterance(text, rate));
};

const speakWithContext = (word) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const sentence = SENTENCES[word.toLowerCase()] || `I can say ${word}.`;
  window.speechSynthesis.speak(makeUtterance(word, 0.55));
  // Small gap then the sentence
  setTimeout(() => {
    window.speechSynthesis.speak(makeUtterance(sentence, 0.75));
  }, 700);
};

// ═══════════════════════════════════════════════════════════
// PERSISTENT STORAGE HELPERS
// ═══════════════════════════════════════════════════════════
const STORAGE_KEY = "sightwords-v2";
const DEFAULT_STATE = {
  scores: { stars: 0, streak: 0, bestStreak: 0, totalCorrect: 0 },
  wordStats: {}, // { word: { correct, wrong, lastSeen } }
  spellingList: [],
  settings: { semester: "both" }, // "1" | "2" | "both"
};

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed,
        scores: { ...DEFAULT_STATE.scores, ...parsed.scores },
        settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
      };
    }
  } catch {}
  return DEFAULT_STATE;
};

const saveState = (state) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
};

// ═══════════════════════════════════════════════════════════
// ADAPTIVE WORD SELECTION (spaced-repetition lite)
// Words the child has gotten wrong show up more often.
// ═══════════════════════════════════════════════════════════
const pickWord = (words, stats, exclude = null) => {
  const pool = words.filter(w => w !== exclude);
  if (pool.length === 0) return words[Math.floor(Math.random() * words.length)];
  // Weight each word: base 1 + 2 per wrong - 0.3 per correct (floor 0.3)
  const weights = pool.map(w => {
    const s = stats[w] || { correct: 0, wrong: 0 };
    return Math.max(0.3, 1 + s.wrong * 2 - s.correct * 0.3);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
};

// ═══════════════════════════════════════════════════════════
// STAR BURST EFFECT
// ═══════════════════════════════════════════════════════════
function StarBurst({ show }) {
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 999,
    }}>
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${25 + Math.random() * 50}%`,
          top: `${20 + Math.random() * 40}%`,
          fontSize: `${28 + Math.random() * 36}px`,
          animation: `starFloat 1.1s ease-out forwards`,
          animationDelay: `${i * 0.04}s`,
          opacity: 0,
        }}>{["⭐","✨","🌟"][i % 3]}</div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function SightWordsApp() {
  const [screen, setScreen] = useState("home");
  const [selectedMode, setSelectedMode] = useState(null);
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [showStars, setShowStars] = useState(false);

  // Load persisted state once on mount
  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  // Persist whenever state changes (after initial load)
  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  // Cleanup speech on unmount
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  // Active word list based on semester filter
  const activeWords = useMemo(() => {
    if (state.settings.semester === "1") return SEMESTER_1;
    if (state.settings.semester === "2") return SEMESTER_2;
    return ALL_SIGHT_WORDS;
  }, [state.settings.semester]);

  const triggerStars = () => {
    setShowStars(true);
    setTimeout(() => setShowStars(false), 1200);
  };

  const recordCorrect = (word) => {
    cheerSound();
    triggerStars();
    setState(s => ({
      ...s,
      scores: {
        stars: s.scores.stars + 1,
        streak: s.scores.streak + 1,
        bestStreak: Math.max(s.scores.bestStreak, s.scores.streak + 1),
        totalCorrect: s.scores.totalCorrect + 1,
      },
      wordStats: word ? {
        ...s.wordStats,
        [word]: {
          correct: (s.wordStats[word]?.correct || 0) + 1,
          wrong: s.wordStats[word]?.wrong || 0,
          lastSeen: Date.now(),
        },
      } : s.wordStats,
    }));
  };

  const recordWrong = (word) => {
    wrongSound();
    setState(s => ({
      ...s,
      scores: { ...s.scores, streak: 0 },
      wordStats: word ? {
        ...s.wordStats,
        [word]: {
          correct: s.wordStats[word]?.correct || 0,
          wrong: (s.wordStats[word]?.wrong || 0) + 1,
          lastSeen: Date.now(),
        },
      } : s.wordStats,
    }));
  };

  const setSpellingList = (list) =>
    setState(s => ({ ...s, spellingList: list }));

  const setSemester = (semester) =>
    setState(s => ({ ...s, settings: { ...s.settings, semester } }));

  const resetProgress = () => {
    if (!confirm("Reset all stars and progress? (Spelling words will be kept.)")) return;
    setState(s => ({
      ...s,
      scores: { stars: 0, streak: 0, bestStreak: 0, totalCorrect: 0 },
      wordStats: {},
    }));
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #FFF8E7 0%, #FFECD2 30%, #FCE4EC 70%, #E8F5E9 100%)",
      fontFamily: "'Fredoka', 'Nunito', sans-serif",
      position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap');

        @keyframes starFloat {
          0% { opacity: 1; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.3) rotate(180deg); }
          100% { opacity: 0; transform: scale(0.5) rotate(360deg) translateY(-100px); }
        }
        @keyframes bounceIn {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes wobble {
          0%,100% { transform: rotate(0); }
          25% { transform: rotate(-3deg); }
          75% { transform: rotate(3deg); }
        }

        .big-btn {
          border: none; border-radius: 20px; padding: 20px 24px;
          font-size: 20px; font-family: 'Fredoka', sans-serif; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1), 0 6px 0 rgba(0,0,0,0.08);
          display: flex; align-items: center; gap: 12px;
          width: 100%; justify-content: center;
          -webkit-tap-highlight-color: transparent;
        }
        .big-btn:active {
          transform: translateY(3px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1), 0 3px 0 rgba(0,0,0,0.08);
        }
        .big-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .word-card {
          background: white; border-radius: 20px; padding: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          text-align: center; animation: bounceIn 0.4s ease-out;
        }

        .choice-btn {
          border: 3px solid #E0E0E0; border-radius: 16px; padding: 18px 12px;
          font-size: 28px; font-family: 'Fredoka', sans-serif; font-weight: 600;
          background: white; cursor: pointer; transition: all 0.15s;
          min-height: 70px; -webkit-tap-highlight-color: transparent;
        }
        .choice-btn:active { transform: scale(0.96); }
        .choice-btn.correct { border-color: #4CAF50; background: #E8F5E9; animation: pulse 0.5s; }
        .choice-btn.wrong { border-color: #F44336; background: #FFEBEE; animation: shake 0.5s; }
        .choice-btn:disabled { cursor: default; }

        .back-btn {
          background: rgba(255,255,255,0.7); border: none; font-size: 24px;
          cursor: pointer; border-radius: 50%; width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          -webkit-tap-highlight-color: transparent;
        }
        .back-btn:active { background: rgba(0,0,0,0.1); }

        .score-bar {
          display: flex; align-items: center; gap: 14px;
          padding: 8px 16px; background: rgba(255,255,255,0.75);
          border-radius: 30px; backdrop-filter: blur(10px);
          font-family: 'Fredoka', sans-serif; font-weight: 600; font-size: 16px;
        }

        .letter-btn {
          width: 50px; height: 58px; border-radius: 12px;
          border: 2px solid #BDBDBD; background: white;
          font-size: 26px; font-family: 'Fredoka', sans-serif; font-weight: 600;
          cursor: pointer; transition: all 0.12s;
          box-shadow: 0 3px 0 rgba(0,0,0,0.1);
          -webkit-tap-highlight-color: transparent;
          color: #5D4037;
        }
        .letter-btn:active {
          transform: translateY(2px);
          box-shadow: 0 1px 0 rgba(0,0,0,0.1);
        }
        .letter-btn:disabled { opacity: 0.3; cursor: default; }

        .progress-dots {
          display: flex; justify-content: center; gap: 6px; margin: 8px 0 12px;
        }
        .progress-dot {
          width: 10px; height: 10px; border-radius: 50%;
          background: #E0E0E0; transition: all 0.3s;
        }
        .progress-dot.done { background: #66BB6A; transform: scale(1.1); }
        .progress-dot.current { background: #FF8A65; transform: scale(1.3); }
        .progress-dot.wrong { background: #EF5350; }

        .flashcard-inner { transition: transform 0.6s; transform-style: preserve-3d; position: relative; }
        .flashcard-inner.flipped { transform: rotateY(180deg); }
        .flashcard-front, .flashcard-back {
          backface-visibility: hidden; border-radius: 24px; padding: 40px; text-align: center;
        }
        .flashcard-back {
          position: absolute; inset: 0; transform: rotateY(180deg);
          display: flex; align-items: center; justify-content: center;
        }

        input, textarea { font-family: 'Fredoka', sans-serif; }
        input:focus, textarea:focus { outline: none; border-color: #FF8A65; }

        * { box-sizing: border-box; }
      `}</style>

      <StarBurst show={showStars} />

      {/* Header */}
      <div style={{
        padding: "12px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", maxWidth: 520, margin: "0 auto",
      }}>
        {screen !== "home" ? (
          <button className="back-btn" onClick={() => {
            window.speechSynthesis?.cancel();
            if (selectedMode) setSelectedMode(null);
            else setScreen("home");
          }}>←</button>
        ) : <div style={{ width: 44 }} />}
        <div className="score-bar">
          <span>⭐ {state.scores.stars}</span>
          <span>🔥 {state.scores.streak}</span>
        </div>
        <div style={{ width: 44 }} />
      </div>

      {/* Content */}
      <div style={{ padding: "0 16px 40px", maxWidth: 520, margin: "0 auto" }}>
        {screen === "home" && (
          <HomeScreen
            state={state}
            activeWords={activeWords}
            onNavigate={setScreen}
            onSetSemester={setSemester}
          />
        )}

        {screen === "practice" && !selectedMode && (
          <PracticeMenu activeWords={activeWords} onSelect={setSelectedMode} />
        )}

        {screen === "practice" && selectedMode === "listen" && (
          <ListenTapGame
            words={activeWords}
            wordStats={state.wordStats}
            onCorrect={recordCorrect}
            onWrong={recordWrong}
            onDone={() => setSelectedMode(null)}
          />
        )}

        {screen === "practice" && selectedMode === "speak" && (
          <SayItGame
            words={activeWords}
            wordStats={state.wordStats}
            onCorrect={recordCorrect}
            onWrong={recordWrong}
            onDone={() => setSelectedMode(null)}
          />
        )}

        {screen === "practice" && selectedMode === "flash" && (
          <FlashcardGame
            words={activeWords}
            onCorrect={recordCorrect}
            onDone={() => setSelectedMode(null)}
          />
        )}

        {screen === "practice" && selectedMode === "spell" && (
          <SpellItGame
            words={activeWords}
            wordStats={state.wordStats}
            onCorrect={recordCorrect}
            onWrong={recordWrong}
            onDone={() => setSelectedMode(null)}
          />
        )}

        {screen === "story" && (
          <StoryTimeScreen onFirstTap={recordCorrect} />
        )}

        {screen === "spelling" && (
          <SpellingTestSection
            spellingList={state.spellingList}
            setSpellingList={setSpellingList}
            onCorrect={recordCorrect}
            onWrong={recordWrong}
          />
        )}

        {screen === "progress" && (
          <ProgressScreen
            wordStats={state.wordStats}
            scores={state.scores}
            spellingList={state.spellingList}
            onReset={resetProgress}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME SCREEN
// ═══════════════════════════════════════════════════════════
function HomeScreen({ state, activeWords, onNavigate, onSetSemester }) {
  return (
    <div style={{ animation: "slideUp 0.4s ease-out" }}>
      <div style={{ textAlign: "center", padding: "16px 0 20px" }}>
        <div style={{ fontSize: 56, marginBottom: 4, animation: "wobble 3s ease-in-out infinite" }}>📚</div>
        <h1 style={{
          fontFamily: "'Fredoka', sans-serif", fontSize: 34, fontWeight: 700,
          color: "#5D4037", margin: 0, lineHeight: 1.1,
        }}>Sight Words</h1>
        <p style={{
          fontFamily: "'Nunito', sans-serif", color: "#8D6E63",
          fontSize: 16, margin: "4px 0 0", fontWeight: 600,
        }}>Let's practice reading!</p>
      </div>

      {/* Semester picker */}
      <div style={{
        background: "rgba(255,255,255,0.7)", borderRadius: 20, padding: 10,
        marginBottom: 16, display: "flex", gap: 6, backdropFilter: "blur(10px)",
      }}>
        {[
          { key: "1", label: "1st Sem" },
          { key: "2", label: "2nd Sem" },
          { key: "both", label: "All 50" },
        ].map(opt => (
          <button key={opt.key}
            onClick={() => onSetSemester(opt.key)}
            style={{
              flex: 1, border: "none", borderRadius: 14, padding: "10px 8px",
              fontFamily: "'Fredoka'", fontWeight: 600, fontSize: 15,
              cursor: "pointer", transition: "all 0.2s",
              background: state.settings.semester === opt.key ? "#FF8A65" : "transparent",
              color: state.settings.semester === opt.key ? "white" : "#8D6E63",
              boxShadow: state.settings.semester === opt.key
                ? "0 2px 8px rgba(255,138,101,0.4)" : "none",
              WebkitTapHighlightColor: "transparent",
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button className="big-btn" style={{ background: "#FF8A65", color: "white" }}
          onClick={() => onNavigate("practice")}>
          <span style={{ fontSize: 28 }}>🎯</span> Practice Words
        </button>
        <button className="big-btn" style={{ background: "#8E63CE", color: "white" }}
          onClick={() => onNavigate("story")}>
          <span style={{ fontSize: 28 }}>📖</span> Story Time
        </button>
        <button className="big-btn" style={{ background: "#26A69A", color: "white" }}
          onClick={() => onNavigate("spelling")}>
          <span style={{ fontSize: 28 }}>📝</span> Spelling Test
        </button>
        <button className="big-btn" style={{ background: "#42A5F5", color: "white" }}
          onClick={() => onNavigate("progress")}>
          <span style={{ fontSize: 28 }}>📊</span> My Progress
        </button>
      </div>

      <div style={{
        marginTop: 20, background: "rgba(255,255,255,0.7)",
        borderRadius: 20, padding: "16px 20px",
        display: "flex", justifyContent: "space-around",
        fontFamily: "'Fredoka', sans-serif", backdropFilter: "blur(10px)",
      }}>
        <Stat value={activeWords.length} label="Words" color="#4CAF50" />
        <Stat value={state.scores.totalCorrect} label="Correct" color="#FF9800" />
        <Stat value={state.scores.bestStreak} label="Best Streak" color="#7E57C2" />
      </div>
    </div>
  );
}

function Stat({ value, label, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PRACTICE MENU
// ═══════════════════════════════════════════════════════════
function PracticeMenu({ activeWords, onSelect }) {
  return (
    <div style={{ animation: "slideUp 0.3s ease-out" }}>
      <h2 style={{
        fontFamily: "'Fredoka'", fontSize: 26, color: "#5D4037",
        textAlign: "center", margin: "8px 0 20px",
      }}>🎯 Pick a Game!</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <button className="big-btn" style={{ background: "#EF5350", color: "white" }}
          onClick={() => onSelect("listen")}>
          <span style={{ fontSize: 28 }}>👂</span> Listen &amp; Tap
        </button>
        <button className="big-btn" style={{ background: "#AB47BC", color: "white" }}
          onClick={() => onSelect("speak")}>
          <span style={{ fontSize: 28 }}>🗣️</span> Read It Out Loud
        </button>
        <button className="big-btn" style={{ background: "#FFA726", color: "white" }}
          onClick={() => onSelect("flash")}>
          <span style={{ fontSize: 28 }}>🃏</span> Flashcards
        </button>
        <button className="big-btn" style={{ background: "#66BB6A", color: "white" }}
          onClick={() => onSelect("spell")}>
          <span style={{ fontSize: 28 }}>🔤</span> Spell It
        </button>
      </div>
      <p style={{
        textAlign: "center", fontFamily: "'Nunito'", color: "#999",
        fontSize: 14, marginTop: 16,
      }}>
        {activeWords.length} words · {SESSION_LENGTH} per round
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SESSION PROGRESS COMPONENT
// ═══════════════════════════════════════════════════════════
function SessionProgress({ current, total, history }) {
  return (
    <div className="progress-dots">
      {Array.from({ length: total }).map((_, i) => {
        let cls = "progress-dot";
        if (i < current) cls += history[i] === false ? " wrong" : " done";
        else if (i === current) cls += " current";
        return <div key={i} className={cls} />;
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// END-OF-SESSION SCREEN
// ═══════════════════════════════════════════════════════════
function SessionEnd({ correct, total, onPlayAgain, onDone }) {
  const pct = Math.round((correct / total) * 100);
  useEffect(() => { winSound(); }, []);

  const celebration = pct === 100
    ? { emoji: "🏆", msg: "PERFECT!", color: "#FFA000" }
    : pct >= 80
      ? { emoji: "🌟", msg: "Amazing!", color: "#4CAF50" }
      : pct >= 60
        ? { emoji: "👍", msg: "Great job!", color: "#42A5F5" }
        : { emoji: "💪", msg: "Keep going!", color: "#FF7043" };

  return (
    <div style={{ animation: "bounceIn 0.5s", textAlign: "center" }}>
      <div style={{ fontSize: 80, marginBottom: 4 }}>{celebration.emoji}</div>
      <h2 style={{
        fontFamily: "'Fredoka'", color: celebration.color, fontSize: 34, margin: "0 0 8px",
      }}>{celebration.msg}</h2>
      <div className="word-card">
        <div style={{
          fontSize: 56, fontFamily: "'Fredoka'", fontWeight: 700, color: celebration.color,
        }}>{correct}/{total}</div>
        <p style={{ fontFamily: "'Nunito'", color: "#888", margin: "4px 0 0" }}>
          {pct}% right!
        </p>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button className="big-btn" style={{ background: "#FF8A65", color: "white", flex: 1 }}
          onClick={onPlayAgain}>Play Again</button>
        <button className="big-btn" style={{ background: "#42A5F5", color: "white", flex: 1 }}
          onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LISTEN & TAP GAME
// ═══════════════════════════════════════════════════════════
function ListenTapGame({ words, wordStats, onCorrect, onWrong, onDone }) {
  const sessionSize = Math.min(SESSION_LENGTH, words.length);
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [choices, setChoices] = useState([]);
  const [feedback, setFeedback] = useState({});
  const [sessionOver, setSessionOver] = useState(false);
  const correctCount = history.filter(x => x === true).length;

  const nextWord = useCallback(() => {
    if (words.length < 2) return;
    const w = pickWord(words, wordStats);
    const others = words.filter(x => x !== w);
    const distractors = shuffle(others).slice(0, 3);
    setCurrent(w);
    setChoices(shuffle([w, ...distractors]));
    setFeedback({});
    setTimeout(() => speakWithContext(w), 350);
  }, [words, wordStats]);

  useEffect(() => { nextWord(); }, []); // eslint-disable-line

  const handleTap = (word, i) => {
    if (Object.keys(feedback).length > 0) return;
    if (word === current) {
      setFeedback({ [i]: "correct" });
      onCorrect(current);
      setHistory(h => [...h, true]);
      setTimeout(() => {
        if (idx + 1 >= sessionSize) setSessionOver(true);
        else { setIdx(x => x + 1); nextWord(); }
      }, 900);
    } else {
      setFeedback({ [i]: "wrong" });
      onWrong(current);
      // Mark wrong in history only once per word shown
      if (!history[idx]) setHistory(h => {
        const copy = [...h]; copy[idx] = false; return copy;
      });
      setTimeout(() => setFeedback({}), 600);
    }
  };

  if (words.length < 2) return <EmptyState text="Need at least 2 words!" />;
  if (sessionOver) return <SessionEnd
    correct={correctCount} total={sessionSize}
    onPlayAgain={() => { setIdx(0); setHistory([]); setSessionOver(false); nextWord(); }}
    onDone={onDone}
  />;

  return (
    <div style={{ animation: "slideUp 0.3s ease-out" }}>
      <SessionProgress current={idx} total={sessionSize} history={history} />
      <div className="word-card" style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: "'Nunito'", color: "#999", fontSize: 14, margin: "0 0 12px" }}>
          Tap the word you hear!
        </p>
        <button onClick={() => speakWithContext(current)} style={{
          background: "#EF5350", color: "white", border: "none",
          borderRadius: "50%", width: 80, height: 80, fontSize: 40,
          cursor: "pointer", boxShadow: "0 4px 15px rgba(239,83,80,0.35)",
          WebkitTapHighlightColor: "transparent",
        }}>🔊</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {choices.map((w, i) => (
          <button key={i}
            className={`choice-btn ${feedback[i] || ""}`}
            onClick={() => handleTap(w, i)}
          >{w}</button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// READ IT OUT LOUD (formerly "Say It")
// Parent-assisted: kid reads it, parent taps right/wrong
// ═══════════════════════════════════════════════════════════
function SayItGame({ words, wordStats, onCorrect, onWrong, onDone }) {
  const sessionSize = Math.min(SESSION_LENGTH, words.length);
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [result, setResult] = useState(null);
  const [sessionOver, setSessionOver] = useState(false);
  const correctCount = history.filter(x => x === true).length;

  const nextWord = useCallback(() => {
    if (words.length === 0) return;
    setCurrent(pickWord(words, wordStats));
    setResult(null);
  }, [words, wordStats]);

  useEffect(() => { nextWord(); }, []); // eslint-disable-line

  const handleJudge = (correct) => {
    if (result) return;
    setResult(correct ? "correct" : "wrong");
    setHistory(h => [...h, correct]);
    if (correct) onCorrect(current);
    else { onWrong(current); speakWithContext(current); }

    setTimeout(() => {
      if (idx + 1 >= sessionSize) setSessionOver(true);
      else { setIdx(x => x + 1); nextWord(); }
    }, correct ? 1200 : 2200);
  };

  if (words.length === 0) return <EmptyState text="No words!" />;
  if (sessionOver) return <SessionEnd
    correct={correctCount} total={sessionSize}
    onPlayAgain={() => { setIdx(0); setHistory([]); setSessionOver(false); nextWord(); }}
    onDone={onDone}
  />;

  return (
    <div style={{ animation: "slideUp 0.3s ease-out", textAlign: "center" }}>
      <SessionProgress current={idx} total={sessionSize} history={history} />
      <div className="word-card" style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "'Nunito'", color: "#999", fontSize: 14, margin: "0 0 16px" }}>
          Read this word out loud!
        </p>
        <div style={{
          fontSize: 84, fontFamily: "'Fredoka'", fontWeight: 700,
          color: result === "correct" ? "#4CAF50" : result === "wrong" ? "#F44336" : "#5D4037",
          lineHeight: 1.2, transition: "color 0.3s",
          animation: result === "correct" ? "pulse 0.5s"
            : result === "wrong" ? "shake 0.5s" : "none",
        }}>{current}</div>

        <button onClick={() => speakWithContext(current)} style={{
          background: "#AB47BC", color: "white", border: "none",
          borderRadius: 50, width: 56, height: 56, fontSize: 28,
          cursor: "pointer", marginTop: 12,
          boxShadow: "0 4px 15px rgba(171,71,188,0.3)",
          WebkitTapHighlightColor: "transparent",
        }}>🔊</button>
        <p style={{ fontFamily: "'Nunito'", color: "#bbb", fontSize: 12, marginTop: 4 }}>
          Need help? Tap to hear it
        </p>
      </div>

      {result === "correct" && (
        <div style={{ animation: "bounceIn 0.4s", marginBottom: 12 }}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <p style={{ fontFamily: "'Fredoka'", color: "#4CAF50", fontSize: 22, margin: 0 }}>Great job!</p>
        </div>
      )}
      {result === "wrong" && (
        <div style={{ animation: "bounceIn 0.4s", marginBottom: 12 }}>
          <div style={{ fontSize: 56 }}>💪</div>
          <p style={{ fontFamily: "'Fredoka'", color: "#FF9800", fontSize: 18, margin: 0 }}>
            Listen — we'll try again!
          </p>
        </div>
      )}

      {!result && (
        <div style={{ display: "flex", gap: 12 }}>
          <button className="big-btn" style={{ background: "#4CAF50", color: "white", flex: 1 }}
            onClick={() => handleJudge(true)}>
            <span style={{ fontSize: 24 }}>✅</span> Got it!
          </button>
          <button className="big-btn" style={{ background: "#FF7043", color: "white", flex: 1 }}
            onClick={() => handleJudge(false)}>
            <span style={{ fontSize: 24 }}>🤔</span> Missed
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FLASHCARDS
// ═══════════════════════════════════════════════════════════
function FlashcardGame({ words, onCorrect, onDone }) {
  const sessionSize = Math.min(SESSION_LENGTH, words.length);
  // Reshuffle whenever words changes
  const deck = useMemo(() => shuffle(words).slice(0, sessionSize), [words, sessionSize]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [history, setHistory] = useState([]);
  const [sessionOver, setSessionOver] = useState(false);
  const correctCount = history.filter(x => x === true).length;

  if (words.length === 0) return <EmptyState text="No words to review!" />;
  if (sessionOver) return <SessionEnd
    correct={correctCount} total={sessionSize}
    onPlayAgain={() => { setIdx(0); setHistory([]); setSessionOver(false); setFlipped(false); }}
    onDone={onDone}
  />;

  const word = deck[idx];

  const flip = () => {
    if (!flipped) { setFlipped(true); speak(word); }
  };

  const next = (knew) => {
    if (knew) onCorrect(word);
    setHistory(h => [...h, knew]);
    setFlipped(false);
    setTimeout(() => {
      if (idx + 1 >= sessionSize) setSessionOver(true);
      else setIdx(i => i + 1);
    }, 250);
  };

  return (
    <div style={{ animation: "slideUp 0.3s ease-out", textAlign: "center" }}>
      <SessionProgress current={idx} total={sessionSize} history={history} />
      <p style={{ fontFamily: "'Nunito'", color: "#999", fontSize: 14, margin: "0 0 12px" }}>
        Tap the card to flip!
      </p>

      <div onClick={flip} style={{ cursor: "pointer", perspective: 600, marginBottom: 20 }}>
        <div className={`flashcard-inner ${flipped ? "flipped" : ""}`} style={{ minHeight: 220 }}>
          <div className="flashcard-front" style={{
            background: "linear-gradient(135deg, #FFA726, #FF7043)", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
            minHeight: 220,
          }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>❓</div>
            <div style={{ fontFamily: "'Fredoka'", fontSize: 22 }}>Tap to reveal!</div>
          </div>
          <div className="flashcard-back" style={{
            background: "white", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", flexDirection: "column",
          }}>
            <div style={{
              fontSize: 68, fontFamily: "'Fredoka'", fontWeight: 700, color: "#5D4037",
            }}>{word}</div>
            <button onClick={(e) => { e.stopPropagation(); speak(word); }} style={{
              background: "none", border: "none", fontSize: 28, cursor: "pointer", marginTop: 8,
              WebkitTapHighlightColor: "transparent",
            }}>🔊</button>
          </div>
        </div>
      </div>

      {flipped && (
        <div style={{ display: "flex", gap: 12, animation: "slideUp 0.3s" }}>
          <button className="big-btn" style={{ background: "#66BB6A", color: "white", flex: 1 }}
            onClick={(e) => { e.stopPropagation(); next(true); }}>
            Knew it! ✨
          </button>
          <button className="big-btn" style={{ background: "#FF7043", color: "white", flex: 1 }}
            onClick={(e) => { e.stopPropagation(); next(false); }}>
            Learning 🤔
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPELL IT GAME
// ═══════════════════════════════════════════════════════════
function SpellItGame({ words, wordStats, onCorrect, onWrong, onDone }) {
  const sessionSize = Math.min(SESSION_LENGTH, words.length);
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [input, setInput] = useState([]);
  const [letterPool, setLetterPool] = useState([]);
  const [result, setResult] = useState(null);
  const [sessionOver, setSessionOver] = useState(false);
  const correctCount = history.filter(x => x === true).length;

  const nextWord = useCallback(() => {
    if (words.length === 0) return;
    const w = pickWord(words, wordStats);
    setCurrent(w);
    setInput([]);
    setResult(null);

    const letters = w.toLowerCase().split("");
    const extras = "abcdefghijklmnopqrstuvwxyz".split("")
      .filter(l => !letters.includes(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(3, 6 - letters.length));
    setLetterPool(shuffle([...letters, ...extras]));
    setTimeout(() => speak(w), 300);
  }, [words, wordStats]);

  useEffect(() => { nextWord(); }, []); // eslint-disable-line

  const addLetter = (letter, poolIdx) => {
    if (result) return;
    const newInput = [...input, { letter, poolIdx }];
    setInput(newInput);

    const typed = newInput.map(i => i.letter).join("");
    if (typed.length === current.length) {
      const isRight = typed.toLowerCase() === current.toLowerCase();
      setResult(isRight ? "correct" : "wrong");
      if (isRight) { onCorrect(current); speak(current); }
      else onWrong(current);
      setHistory(h => [...h, isRight]);

      setTimeout(() => {
        if (idx + 1 >= sessionSize) setSessionOver(true);
        else { setIdx(x => x + 1); nextWord(); }
      }, isRight ? 1400 : 1800);
    }
  };

  const removeLetter = () => {
    if (result) return;
    setInput(input.slice(0, -1));
  };

  if (words.length === 0) return <EmptyState text="No words!" />;
  if (sessionOver) return <SessionEnd
    correct={correctCount} total={sessionSize}
    onPlayAgain={() => { setIdx(0); setHistory([]); setSessionOver(false); nextWord(); }}
    onDone={onDone}
  />;
  if (!current) return null;

  const usedIdxs = input.map(i => i.poolIdx);

  return (
    <div style={{ animation: "slideUp 0.3s ease-out", textAlign: "center" }}>
      <SessionProgress current={idx} total={sessionSize} history={history} />
      <div className="word-card" style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "'Nunito'", color: "#999", fontSize: 14, margin: "0 0 12px" }}>
          Spell the word you hear!
        </p>
        <button onClick={() => speak(current)} style={{
          background: "#66BB6A", color: "white", border: "none",
          borderRadius: "50%", width: 72, height: 72, fontSize: 36,
          cursor: "pointer", boxShadow: "0 4px 15px rgba(102,187,106,0.3)",
          WebkitTapHighlightColor: "transparent",
        }}>🔊</button>
      </div>

      {/* Letter slots */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 6, marginBottom: 20, minHeight: 58,
      }}>
        {current.split("").map((_, i) => (
          <div key={i} style={{
            width: 48, height: 56, borderRadius: 12,
            border: `3px solid ${
              result === "correct" ? "#4CAF50"
              : result === "wrong" ? "#F44336" : "#E0E0E0"
            }`,
            background: result === "correct" ? "#E8F5E9"
              : result === "wrong" ? "#FFEBEE" : "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, fontFamily: "'Fredoka'", fontWeight: 600, color: "#5D4037",
            transition: "all 0.2s",
          }}>{input[i]?.letter || ""}</div>
        ))}
      </div>

      {result === "wrong" && (
        <p style={{
          fontFamily: "'Fredoka'", color: "#F44336", fontSize: 16, margin: "0 0 12px",
        }}>It's: <strong>{current}</strong></p>
      )}

      {/* Letter keyboard */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginBottom: 14,
      }}>
        {letterPool.map((l, i) => (
          <button key={i} className="letter-btn"
            disabled={usedIdxs.includes(i)}
            onClick={() => addLetter(l, i)}
          >{l}</button>
        ))}
      </div>

      <button onClick={removeLetter} disabled={input.length === 0 || !!result} style={{
        background: input.length === 0 || result ? "#E0E0E0" : "#FFAB91",
        color: "white", border: "none", borderRadius: 12,
        padding: "10px 24px", fontSize: 16, fontFamily: "'Fredoka'", fontWeight: 600,
        cursor: input.length === 0 || result ? "default" : "pointer",
        WebkitTapHighlightColor: "transparent",
      }}>← Undo</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPELLING TEST
// ═══════════════════════════════════════════════════════════
function SpellingTestSection({ spellingList, setSpellingList, onCorrect, onWrong }) {
  const [mode, setMode] = useState("menu");
  const [newWords, setNewWords] = useState("");
  const [testIdx, setTestIdx] = useState(0);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testScore, setTestScore] = useState({ correct: 0, total: 0 });

  const saveWords = () => {
    const parsed = newWords.split(/[,\n]+/)
      .map(w => w.trim().toLowerCase()).filter(Boolean);
    if (parsed.length > 0) {
      setSpellingList(parsed);
      setMode("menu");
      setNewWords("");
    }
  };

  const startTest = () => {
    if (spellingList.length === 0) return;
    setTestIdx(0);
    setTestInput("");
    setTestResult(null);
    setTestScore({ correct: 0, total: 0 });
    setMode("test");
    setTimeout(() => speak(spellingList[0]), 500);
  };

  const checkSpelling = () => {
    const correct = testInput.trim().toLowerCase() === spellingList[testIdx];
    setTestResult(correct ? "correct" : "wrong");
    if (correct) onCorrect(spellingList[testIdx]);
    else onWrong(spellingList[testIdx]);
    setTestScore(s => ({
      correct: s.correct + (correct ? 1 : 0),
      total: s.total + 1,
    }));

    setTimeout(() => {
      if (testIdx + 1 < spellingList.length) {
        setTestIdx(i => i + 1);
        setTestInput("");
        setTestResult(null);
        setTimeout(() => speak(spellingList[testIdx + 1]), 300);
      } else {
        setMode("results");
      }
    }, correct ? 1200 : 1800);
  };

  if (mode === "menu") {
    return (
      <div style={{ animation: "slideUp 0.3s ease-out" }}>
        <h2 style={{
          fontFamily: "'Fredoka'", fontSize: 26, color: "#5D4037",
          textAlign: "center", margin: "8px 0 20px",
        }}>📝 Spelling Test</h2>

        {spellingList.length > 0 && (
          <div className="word-card" style={{ marginBottom: 16 }}>
            <p style={{ fontFamily: "'Nunito'", fontSize: 14, color: "#888", margin: "0 0 10px" }}>
              This week's words ({spellingList.length}):
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {spellingList.map((w, i) => (
                <span key={i} style={{
                  background: "#E8F5E9", color: "#2E7D32",
                  padding: "4px 12px", borderRadius: 20,
                  fontFamily: "'Fredoka'", fontSize: 15, fontWeight: 500,
                }}>{w}</span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {spellingList.length > 0 && (
            <button className="big-btn" style={{ background: "#26A69A", color: "white" }}
              onClick={startTest}>
              <span style={{ fontSize: 28 }}>✏️</span> Take the Test!
            </button>
          )}
          <button className="big-btn" style={{ background: "#42A5F5", color: "white" }}
            onClick={() => setMode("add")}>
            <span style={{ fontSize: 28 }}>➕</span>
            {spellingList.length > 0 ? "Update Words" : "Add Words"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "add") {
    return (
      <div style={{ animation: "slideUp 0.3s ease-out" }}>
        <h2 style={{
          fontFamily: "'Fredoka'", fontSize: 22, color: "#5D4037",
          textAlign: "center", margin: "8px 0 16px",
        }}>Add Spelling Words</h2>

        <div className="word-card" style={{ marginBottom: 16 }}>
          <p style={{
            fontFamily: "'Nunito'", color: "#666", fontSize: 14, margin: "0 0 12px",
          }}>
            Type this week's words, separated by commas or new lines:
          </p>

          <textarea
            value={newWords}
            onChange={(e) => setNewWords(e.target.value)}
            placeholder="cat, dog, run, big..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: "100%", minHeight: 120, borderRadius: 12,
              border: "2px solid #E0E0E0", padding: 12,
              fontSize: 18, fontFamily: "'Fredoka'",
              resize: "vertical",
            }}
          />

          <button className="big-btn" style={{
            background: "#66BB6A", color: "white", marginTop: 12,
          }} onClick={saveWords} disabled={!newWords.trim()}>
            Save Words ✓
          </button>
        </div>

        <button onClick={() => setMode("menu")} style={{
          background: "none", border: "none", color: "#999",
          fontFamily: "'Nunito'", fontSize: 14, cursor: "pointer",
          textDecoration: "underline", width: "100%",
        }}>Cancel</button>
      </div>
    );
  }

  if (mode === "test") {
    const currentWord = spellingList[testIdx];
    return (
      <div style={{ animation: "slideUp 0.3s ease-out", textAlign: "center" }}>
        <p style={{ fontFamily: "'Nunito'", color: "#888", fontSize: 14, margin: "0 0 8px" }}>
          Word {testIdx + 1} of {spellingList.length}
        </p>

        <div className="word-card" style={{ marginBottom: 20 }}>
          <button onClick={() => speak(currentWord)} style={{
            background: "#26A69A", color: "white", border: "none",
            borderRadius: "50%", width: 84, height: 84, fontSize: 42,
            cursor: "pointer", boxShadow: "0 4px 20px rgba(38,166,154,0.3)", marginBottom: 8,
            WebkitTapHighlightColor: "transparent",
          }}>🔊</button>
          <p style={{ fontFamily: "'Nunito'", fontSize: 13, color: "#999", margin: 0 }}>
            Tap to hear the word
          </p>
        </div>

        <input
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && testInput.trim() && !testResult && checkSpelling()}
          placeholder="Type the word..."
          autoFocus
          disabled={!!testResult}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: "100%", padding: "14px 16px", fontSize: 28,
            fontFamily: "'Fredoka'", fontWeight: 600,
            borderRadius: 16, border: `3px solid ${
              testResult === "correct" ? "#4CAF50"
              : testResult === "wrong" ? "#F44336" : "#E0E0E0"
            }`,
            textAlign: "center",
            background: testResult === "correct" ? "#E8F5E9"
              : testResult === "wrong" ? "#FFEBEE" : "white",
          }}
        />

        {testResult === "wrong" && (
          <p style={{
            fontFamily: "'Fredoka'", color: "#F44336", fontSize: 18, margin: "10px 0",
          }}>It's spelled: <strong>{currentWord}</strong></p>
        )}
        {testResult === "correct" && (
          <p style={{
            fontFamily: "'Fredoka'", color: "#4CAF50", fontSize: 22, margin: "10px 0",
          }}>🎉 Correct!</p>
        )}

        {!testResult && (
          <button className="big-btn" style={{
            background: "#26A69A", color: "white", marginTop: 12,
          }} onClick={checkSpelling} disabled={!testInput.trim()}>
            Check ✓
          </button>
        )}
      </div>
    );
  }

  if (mode === "results") {
    return <SessionEnd
      correct={testScore.correct} total={testScore.total}
      onPlayAgain={startTest}
      onDone={() => setMode("menu")}
    />;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// STORY TIME — tappable reading
// Words are tappable; sight words are highlighted. First time
// tapping a sight word awards a star. After reading, shows
// total sight words found and a completion celebration.
// ═══════════════════════════════════════════════════════════
function StoryTimeScreen({ onFirstTap }) {
  const [readWords, setReadWords] = useState({}); // lowercase word -> tap count
  const [recentKey, setRecentKey] = useState(null);
  const celebratedRef = useRef(false);

  // Count unique sight words already tapped
  const uniqueSightRead = Object.keys(readWords)
    .filter(w => SIGHT_WORD_SET.has(w)).length;

  // Celebrate once when all 50 have been tapped
  useEffect(() => {
    if (uniqueSightRead >= SIGHT_WORD_SET.size && !celebratedRef.current) {
      celebratedRef.current = true;
      winSound();
    }
  }, [uniqueSightRead]);

  const handleTap = (word, key) => {
    const clean = word.toLowerCase();
    speak(clean);
    haptic(10);
    setRecentKey(key);
    setTimeout(() => setRecentKey(k => (k === key ? null : k)), 450);

    setReadWords(r => {
      const isFirstTap = !r[clean];
      if (isFirstTap && SIGHT_WORD_SET.has(clean)) {
        // Award a star the first time each sight word is tapped
        onFirstTap?.(clean);
      }
      return { ...r, [clean]: (r[clean] || 0) + 1 };
    });
  };

  const renderParagraph = (line, lineIdx) => {
    // Split into tokens: runs of letters, or non-letters (punct/spaces)
    const tokens = line.match(/[a-zA-Z]+|[^a-zA-Z]+/g) || [];
    return tokens.map((tok, i) => {
      const key = `${lineIdx}-${i}`;
      if (!/^[a-zA-Z]+$/.test(tok)) {
        return <span key={key}>{tok}</span>;
      }
      const clean = tok.toLowerCase();
      const isSight = SIGHT_WORD_SET.has(clean);
      const tapCount = readWords[clean] || 0;
      const isRecent = recentKey === key;

      let bg = "transparent";
      if (isRecent) bg = "#FFD54F";
      else if (isSight && tapCount > 0) bg = "#C8E6C9";
      else if (isSight) bg = "#FFF3E0";

      return (
        <span key={key}
          onClick={() => handleTap(tok, key)}
          style={{
            background: bg,
            borderRadius: 6,
            padding: "2px 5px",
            margin: "0 1px",
            cursor: "pointer",
            transition: "background 0.25s",
            fontWeight: isSight ? 700 : 500,
            color: isSight ? "#5D4037" : "#666",
            WebkitTapHighlightColor: "transparent",
            display: "inline-block",
            textDecoration: isSight ? "none" : "underline dotted rgba(0,0,0,0.1)",
          }}>
          {tok}{isSight && tapCount > 0 ? "\u00A0⭐" : ""}
        </span>
      );
    });
  };

  const allFound = uniqueSightRead >= SIGHT_WORD_SET.size;

  return (
    <div style={{ animation: "slideUp 0.3s ease-out" }}>
      <h2 style={{
        fontFamily: "'Fredoka'", fontSize: 26, color: "#5D4037",
        textAlign: "center", margin: "8px 0 12px",
      }}>📖 Story Time</h2>

      <div style={{
        background: allFound
          ? "linear-gradient(135deg, #FFD54F, #FFA726)"
          : "rgba(255,255,255,0.75)",
        borderRadius: 20, padding: "10px 16px", marginBottom: 12,
        textAlign: "center", fontFamily: "'Fredoka'", fontWeight: 600,
        fontSize: 15, color: allFound ? "white" : "#8D6E63",
        transition: "all 0.4s",
        boxShadow: allFound ? "0 4px 15px rgba(255,167,38,0.4)" : "none",
      }}>
        {allFound
          ? "🏆 You read every sight word! Amazing!"
          : `⭐ ${uniqueSightRead}/${SIGHT_WORD_SET.size} sight words read`}
      </div>

      <div style={{
        background: "white", borderRadius: 24, padding: "24px 20px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        fontFamily: "'Nunito', sans-serif",
        fontSize: 22, lineHeight: 2.0, color: "#666",
      }}>
        <h3 style={{
          fontFamily: "'Fredoka'", fontSize: 26, color: "#5D4037",
          textAlign: "center", margin: "0 0 18px", fontWeight: 700,
        }}>{STORY_TITLE}</h3>
        {STORY_PARAGRAPHS.map((para, i) => (
          <p key={i} style={{ margin: "0 0 16px" }}>
            {renderParagraph(para, i)}
          </p>
        ))}
      </div>

      <p style={{
        textAlign: "center", fontFamily: "'Nunito'", color: "#999",
        fontSize: 13, margin: "14px 0 4px",
      }}>
        Tap any word to hear it! Bold orange words are sight words.
      </p>
      <div style={{
        display: "flex", gap: 12, justifyContent: "center",
        fontSize: 11, color: "#aaa", fontFamily: "'Nunito'",
        marginTop: 4,
      }}>
        <span><span style={{
          display: "inline-block", width: 10, height: 10, borderRadius: 3,
          background: "#FFF3E0", border: "1px solid #FFE0B2",
          verticalAlign: "middle", marginRight: 4,
        }}/>New sight word</span>
        <span><span style={{
          display: "inline-block", width: 10, height: 10, borderRadius: 3,
          background: "#C8E6C9", border: "1px solid #A5D6A7",
          verticalAlign: "middle", marginRight: 4,
        }}/>Read it!</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PROGRESS SCREEN
// ═══════════════════════════════════════════════════════════
function ProgressScreen({ wordStats, scores, spellingList, onReset }) {
  const renderWord = (w, keyBase) => {
    const s = wordStats[w];
    let bg = "#F5F5F5", color = "#666", border = "#E0E0E0";
    if (s) {
      const ratio = s.correct / Math.max(1, s.correct + s.wrong);
      if (ratio >= 0.8 && s.correct >= 2) { bg = "#E8F5E9"; color = "#2E7D32"; border = "#A5D6A7"; }
      else if (ratio >= 0.5) { bg = "#FFF3E0"; color = "#E65100"; border = "#FFE0B2"; }
      else { bg = "#FFEBEE"; color = "#C62828"; border = "#EF9A9A"; }
    }
    return (
      <span key={keyBase} style={{
        padding: "4px 10px", borderRadius: 12, fontSize: 14,
        fontFamily: "'Fredoka'", fontWeight: 500,
        background: bg, color, border: `1px solid ${border}`,
      }}>{w}</span>
    );
  };

  const masteredCount = Object.entries(wordStats)
    .filter(([_, s]) => s.correct >= 2 && s.correct / Math.max(1, s.correct + s.wrong) >= 0.8).length;

  return (
    <div style={{ animation: "slideUp 0.3s ease-out" }}>
      <h2 style={{
        fontFamily: "'Fredoka'", fontSize: 26, color: "#5D4037",
        textAlign: "center", margin: "8px 0 16px",
      }}>📊 My Progress</h2>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16,
      }}>
        <div className="word-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 28 }}>⭐</div>
          <div style={{ fontFamily: "'Fredoka'", fontSize: 26, fontWeight: 700, color: "#FFA726" }}>
            {scores.stars}
          </div>
          <div style={{ fontFamily: "'Nunito'", fontSize: 12, color: "#888" }}>Stars</div>
        </div>
        <div className="word-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 28 }}>🏅</div>
          <div style={{ fontFamily: "'Fredoka'", fontSize: 26, fontWeight: 700, color: "#4CAF50" }}>
            {masteredCount}
          </div>
          <div style={{ fontFamily: "'Nunito'", fontSize: 12, color: "#888" }}>Mastered</div>
        </div>
      </div>

      <div className="word-card" style={{ marginBottom: 16 }}>
        <div style={{
          display: "flex", gap: 14, justifyContent: "center", marginBottom: 14,
          fontSize: 12, fontFamily: "'Nunito'", color: "#888", flexWrap: "wrap",
        }}>
          <Legend color="#E8F5E9" border="#A5D6A7" label="Mastered" />
          <Legend color="#FFF3E0" border="#FFE0B2" label="Learning" />
          <Legend color="#FFEBEE" border="#EF9A9A" label="Tricky" />
          <Legend color="#F5F5F5" border="#E0E0E0" label="New" />
        </div>

        <h3 style={{ fontFamily: "'Fredoka'", fontSize: 16, color: "#5D4037", margin: "0 0 10px" }}>
          1st Semester ({SEMESTER_1.length})
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 16 }}>
          {SEMESTER_1.map((w, i) => renderWord(w, `s1-${i}`))}
        </div>

        <h3 style={{ fontFamily: "'Fredoka'", fontSize: 16, color: "#5D4037", margin: "0 0 10px" }}>
          2nd Semester ({SEMESTER_2.length})
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {SEMESTER_2.map((w, i) => renderWord(w, `s2-${i}`))}
        </div>

        {spellingList.length > 0 && (
          <>
            <h3 style={{ fontFamily: "'Fredoka'", fontSize: 16, color: "#5D4037", margin: "16px 0 10px" }}>
              📝 This Week's Spelling ({spellingList.length})
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {spellingList.map((w, i) => (
                <span key={i} style={{
                  padding: "4px 10px", borderRadius: 12, fontSize: 14,
                  fontFamily: "'Fredoka'", fontWeight: 500,
                  background: "#E3F2FD", color: "#1565C0", border: "1px solid #90CAF9",
                }}>{w}</span>
              ))}
            </div>
          </>
        )}
      </div>

      <button onClick={onReset} style={{
        background: "transparent", border: "2px solid #E0E0E0",
        borderRadius: 14, padding: "10px 20px", fontFamily: "'Fredoka'",
        color: "#999", fontSize: 14, cursor: "pointer", width: "100%",
        WebkitTapHighlightColor: "transparent",
      }}>Reset Progress</button>
    </div>
  );
}

function Legend({ color, border, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{
        width: 12, height: 12, borderRadius: 4,
        background: color, border: `1px solid ${border}`,
      }} /> {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════
function EmptyState({ text }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0", animation: "slideUp 0.3s" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
      <p style={{ fontFamily: "'Fredoka'", fontSize: 22, color: "#5D4037" }}>{text}</p>
      <p style={{ fontFamily: "'Nunito'", color: "#999" }}>You're doing amazing!</p>
    </div>
  );
}
