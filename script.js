/* ==========================================================================
   HeritageVoice Web Application State & Logic Engine
   ========================================================================== */

// --- 1. SUPABASE & API INITIALIZATION ---
const SUPABASE_URL = "https://fdirykbtkqnwcjpspofe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_v7RMflMmWZJvsVXV-aRTRw_2bU3fTcg";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.warn("Supabase library not loaded.");
}

const HF_TOKEN = "hf_gSbxaufuEbeoNYceHOBqdYoBrLT1QTjLjU";
const TRANSLATION_API_KEY = "AIzaSyCVMRE1muxsrQsgm1-rNcQQl569CfIQ0ng";

// Helper: resolves any language name to an ISO code via Google Translate API
async function getIsoCode(languageName) {
    if (!languageName) return "en";
    const cleanName = languageName.trim().toLowerCase();
    if (cleanName === "english") return "en";

    try {
        const response = await fetch(`https://translation.googleapis.com/language/translate/v2/languages?key=${TRANSLATION_API_KEY}&target=en`);
        const data = await response.json();
        const languages = data.data?.languages || [];
        const match = languages.find(lang => lang.name && lang.name.toLowerCase() === cleanName);
        return match ? match.language : cleanName.slice(0, 2);
    } catch (error) {
        console.error("Error fetching ISO codes:", error);
        return cleanName.slice(0, 2);
    }
}

// --- 2. GLOBAL APPLICATION STATE ---
const appState = {
    authMode: "signup",
    user: {
        isLoggedIn: false,
        email: "user@heritagevoice.org",
        username: "heritage_learner",
        knownLanguage: "English",
        learningStyle: "Flashcards with Pictures",
        targetLanguages: [
            {
                name: "Yoruba",
                origin: "West Africa",
                related: "Volta-Niger family",
                level: "A1 Beginner"
            }
        ],
        activeTargetIndex: 0,
        privateCorpus: []
    },
    availableLanguages: [],
    lessonNodes: [
        { id: "A1.1", label: "A1: Greetings & Family", x: 15, y: 80, status: "active", prompt: "Good morning grandfather", targetText: "" },
        { id: "A1.2", label: "A1: Daily Check-in", x: 30, y: 35, status: "locked", prompt: "How are you doing today?", targetText: "" },
        { id: "A1.3", label: "A1: Shared Meals", x: 50, y: 70, status: "locked", prompt: "Let us eat together", targetText: "" },
        { id: "A2.1", label: "A2: Expressing Gratitude", x: 70, y: 30, status: "locked", prompt: "Thank you for the meal", targetText: "" },
        { id: "A2.2", label: "A2: Storytelling Roots", x: 88, y: 75, status: "locked", prompt: "Tell me a story from home", targetText: "" }
    ],
    activeNode: null
};

// --- 3. DYNAMIC GOOGLE TRANSLATION HELPER ---
async function translateActiveUserText(text, forcedSourceLang = null) {
    if (!text || !text.trim()) return "";

    const activeTargetObj = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    const sourceLang = forcedSourceLang || appState.user.knownLanguage || "English";
    const targetLang = activeTargetObj?.name || "Yoruba";

    if (sourceLang.toLowerCase().trim() === targetLang.toLowerCase().trim()) return text;

    const sourceCode = await getIsoCode(sourceLang);
    const targetCode = await getIsoCode(targetLang);

    try {
        const url = `https://translation.googleapis.com/language/translate/v2?key=${TRANSLATION_API_KEY}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                q: text,
                source: sourceCode,
                target: targetCode,
                format: "text"
            })
        });

        const data = await response.json();
        return data.data?.translations[0]?.translatedText || text;
    } catch (error) {
        console.error("Translation API Error:", error);
        return text;
    }
}

// --- 4. PROFILE VIEW RENDERER ---
// --- 4. PROFILE VIEW RENDERER ---
function renderProfileView() {
    const emailEl = document.getElementById("profile-display-email");
    const usernameEl = document.getElementById("profile-display-username");
    const styleEl = document.getElementById("profile-display-style");
    const knownLangEl = document.getElementById("profile-display-known-lang");
    const corpusContainer = document.getElementById("private-corpus-list");
    const targetLangContainer = document.getElementById("user-target-languages-list") || document.querySelector(".target-lang-list");

    if (emailEl) emailEl.innerHTML = `<i class="fa-solid fa-envelope"></i> ${appState.user.email}`;
    if (usernameEl) usernameEl.innerText = appState.user.username;
    if (styleEl) styleEl.innerText = appState.user.learningStyle;
    if (knownLangEl) knownLangEl.innerText = appState.user.knownLanguage;

    // Render Active Target Languages on Profile with click handlers
    if (targetLangContainer) {
        if (!appState.user.targetLanguages || appState.user.targetLanguages.length === 0) {
            targetLangContainer.innerHTML = `<p class="empty-state-text">No target languages selected yet.</p>`;
        } else {
            targetLangContainer.innerHTML = appState.user.targetLanguages.map((lang, index) => `
                <div class="target-lang-card ${index === appState.user.activeTargetIndex ? 'active-target' : ''}" 
                     onclick="switchTargetAndGoToPath(${index})" 
                     style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s;">
                    <div>
                        <strong style="color: #0f172a; font-size: 1.05em;">${lang.name}</strong>
                        <div style="font-size: 0.85em; color: #64748b;">${lang.origin || 'Language'} • ${lang.level || 'A1 Beginner'}</div>
                    </div>
                    ${index === appState.user.activeTargetIndex ? '<span style="background: #dbeafe; color: #1e40af; font-size: 0.75em; padding: 4px 8px; border-radius: 12px; font-weight: 600;">Active</span>' : ''}
                </div>
            `).join("");
        }
    }

    if (corpusContainer) {
        if (!appState.user.privateCorpus || appState.user.privateCorpus.length === 0) {
            corpusContainer.innerHTML = `<p class="empty-state-text" style="color: #64748b; font-style: italic; margin-top: 12px;">No saved phrases yet. Use "Import Target Sentence or Audio" to build your corpus.</p>`;
        } else {
            corpusContainer.innerHTML = appState.user.privateCorpus.map(item => `
                <div class="corpus-item" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-top: 10px; background: #f8fafc; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: #0f172a; font-size: 1em;">${item.knownText}</strong>
                        <span style="font-size: 0.75em; color: #94a3b8;">${item.dateAdded || ''}</span>
                    </div>
                    <div style="color: #2563eb; font-weight: 600; font-size: 0.95em;">
                        ${item.targetLang || 'Target'}: <span style="color: #1e293b; font-weight: 400;">${item.targetText}</span>
                    </div>
                    ${item.hasAudio && item.audioSrc ? `
                        <div style="margin-top: 6px;">
                            <audio controls src="${item.audioSrc}" style="width: 100%; height: 32px; border-radius: 4px;"></audio>
                        </div>
                    ` : item.hasAudio ? `
                        <div style="margin-top: 4px; font-size: 0.8em; color: #059669; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-file-audio"></i> <span>Audio Attached (${item.audioFileName || 'Voice Note'})</span>
                        </div>
                    ` : ''}
                </div>
            `).join("");
        }
    }
} 

function switchTargetAndGoToPath(index) {
    if (index >= 0 && index < appState.user.targetLanguages.length) {
        appState.user.activeTargetIndex = index;
        
        // Update global language labels and save state
        if (typeof updateLanguageLabels === "function") updateLanguageLabels();
        saveStateToStorage();
        saveUserLanguagesToSupabase();

        // Render updated map nodes if applicable
        if (typeof renderLessonMap === "function") renderLessonMap();

        // Navigate directly to the active learning path view
        navigateTo("lessons-view"); 
        
        showToast(`Switched active language to ${appState.user.targetLanguages[index].name}`);
    }
}

// --- 5. ADD CUSTOM SENTENCE / AUDIO MODAL & TRANSLATION LOGIC ---
// Open Modal without triggering canvas click listeners
function openAddDataModal(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const modal = document.getElementById("add-data-modal");
    if (!modal) return;

    const form = document.getElementById("import-data-form");
    if (form) form.reset();

    const dropText = document.getElementById("file-drop-text");
    if (dropText) dropText.innerText = "Drag & drop voice note or click to upload (.mp3, .wav, .m4a)";

    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.style.pointerEvents = "auto";
    modal.style.opacity = "1";
}

// Close and return safely without firing map events
function cancelAddDataModal(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const modal = document.getElementById("add-data-modal");
    if (!modal) return;

    const form = document.getElementById("import-data-form");
    if (form) form.reset();

    modal.style.opacity = "0";
    modal.style.pointerEvents = "none";
    setTimeout(() => {
        modal.style.display = "none";
        modal.classList.add("hidden");
    }, 150);
}

// Trigger file input dialog cleanly
function triggerAudioUpload(e) {
    e.stopPropagation();
    const fileInput = document.getElementById("import-audio-file");
    if (fileInput) fileInput.click();
}

// Handle file selection UI text
function handleFileSelect(e) {
    e.stopPropagation();
    const file = e.target.files[0];
    const dropText = document.getElementById("file-drop-text");
    if (file && dropText) {
        dropText.innerText = `Selected: ${file.name}`;
    }
}

// Real-time Translation Debounce
let translateTimeout = null;
function handleKnownTextAutoTranslate(val) {
    const targetInput = document.getElementById("import-target-text");
    if (!targetInput) return;

    clearTimeout(translateTimeout);
    if (!val.trim()) {
        targetInput.value = "";
        return;
    }

    translateTimeout = setTimeout(async () => {
        const userKnownLang = appState.user.knownLanguage || "English";
        try {
            const translated = await translateActiveUserText(val.trim(), userKnownLang);
            if (translated) targetInput.value = translated;
        } catch (err) {
            console.warn("Auto-translation error:", err);
        }
    }, 400);
}

// Save data to Profile Corpus, update database, and navigate back
async function handleImportData(e) {
    e.preventDefault();
    e.stopPropagation();

    const knownInput = document.getElementById("import-known-text");
    const targetInput = document.getElementById("import-target-text");
    const fileInput = document.getElementById("import-audio-file");

    const knownText = knownInput ? knownInput.value.trim() : "";
    const targetText = targetInput ? targetInput.value.trim() : "";
    const hasAudio = fileInput && fileInput.files && fileInput.files.length > 0;

    if (!knownText || !targetText) {
        showToast("Please fill in both phrases.");
        return;
    }

    const userKnownLang = appState.user.knownLanguage || "English";
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    const targetLangName = activeTarget ? activeTarget.name : "Target";

    // Add to Private Corpus (Profile)
    if (!appState.user.privateCorpus) appState.user.privateCorpus = [];
    appState.user.privateCorpus.unshift({
        id: Date.now(),
        knownLang: userKnownLang,
        targetLang: targetLangName,
        knownText: knownText,
        targetText: targetText,
        hasAudio: hasAudio,
        audioFileName: hasAudio ? fileInput.files[0].name : null,
        dateAdded: new Date().toISOString().split("T")[0]
    });

    // Add node to Lesson Map
    const nodeIndex = appState.lessonNodes.length + 1;
    appState.lessonNodes.push({
        id: `Custom.${nodeIndex}`,
        label: `Custom: ${knownText.slice(0, 14)}...`,
        x: Math.floor(Math.random() * 60) + 20,
        y: Math.floor(Math.random() * 50) + 25,
        status: "active",
        prompt: knownText,
        targetText: targetText
    });

    // Sync state to storage and backend database
    saveStateToStorage();
    saveUserLanguagesToSupabase();

    // Reset and close modal
    cancelAddDataModal(e);

    // Re-render UI views
    if (typeof renderProfileView === "function") renderProfileView();
    if (typeof renderLessonMap === "function") renderLessonMap();

    showToast("Phrase and translation saved to Profile!");
}


 

async function handleAddCustomSentence() {
    const input = document.getElementById("add-modal-sentence");
    const sentence = input ? input.value.trim() : "";

    if (!sentence) {
        showToast("Please enter a sentence or record audio first.");
        return;
    }

    const userKnownLang = appState.user.knownLanguage || "English";
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    const targetLangName = activeTarget ? activeTarget.name : "Target";

    showToast("Translating sentence...");

    let translated = sentence;
    try {
        translated = await Promise.race([
            translateActiveUserText(sentence, userKnownLang),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Translation timeout")), 2500))
        ]);
    } catch (err) {
        console.warn("Translation fallback applied:", err.message);
        translated = sentence;
    }

    if (!appState.user.privateCorpus) appState.user.privateCorpus = [];
    appState.user.privateCorpus.unshift({
        id: Date.now(),
        knownLang: userKnownLang,
        targetLang: targetLangName,
        knownText: sentence,
        targetText: translated,
        audioAttached: (typeof isRecording !== "undefined" && isRecording) || false,
        dateAdded: new Date().toISOString().split("T")[0]
    });

    const nodeIndex = appState.lessonNodes.length + 1;
    const newNode = {
        id: `Custom.${nodeIndex}`,
        label: `Custom: ${sentence.slice(0, 14)}...`,
        x: Math.floor(Math.random() * 60) + 20,
        y: Math.floor(Math.random() * 50) + 25,
        status: "active",
        prompt: sentence,
        targetText: translated
    };
    appState.lessonNodes.push(newNode);

    saveStateToStorage();
    saveUserLanguagesToSupabase();
    closeModal("add-data-modal");

    if (typeof renderProfileView === "function") renderProfileView();
    if (typeof renderLessonMap === "function") renderLessonMap();

    showToast("Translated and saved! Added to profile & active lesson path.");
}

// --- 6. EXERCISE MODAL & TARGET LANGUAGE MATCHING ---
async function openExerciseModal(node) {
    if (!node) return;
    appState.activeNode = node;

    if (node.status === "locked") {
        showToast("This lesson node is locked! Complete previous nodes first.");
        return;
    }

    let modal = document.getElementById("exercise-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "exercise-modal";
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000; opacity: 0; transition: opacity 0.2s ease;
        `;
        document.body.appendChild(modal);
    }

    const userKnown = appState.user.knownLanguage || "English";
    const activeTargetObj = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    const targetLangName = activeTargetObj ? activeTargetObj.name : "Target";
    const learningStyle = (appState.user.learningStyle || "").toLowerCase();

    const displayedPrompt = node.prompt || "";
    let dynamicTargetText = node.targetText || "";

    if (displayedPrompt && !dynamicTargetText) {
        try {
            dynamicTargetText = await Promise.race([
                translateActiveUserText(displayedPrompt, userKnown),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
            ]);
        } catch (e) {
            dynamicTargetText = displayedPrompt;
        }
    }

    // Save flashcard state globally for playback
    window.currentModalFlashcard = {
        front: displayedPrompt,
        back: dynamicTargetText || displayedPrompt,
        isFlipped: false,
        knownLang: userKnown,
        targetLang: targetLangName
    };

    let exerciseBodyHTML = "";

    if (learningStyle.includes("flashcard")) {
        exerciseBodyHTML = `
            <div style="text-align: center; margin: 20px 0;">
                <div id="flashcard-card" style="border: 2px solid #cbd5e1; border-radius: 12px; padding: 36px 16px; background: #f8fafc; cursor: pointer; transition: all 0.2s ease;" onclick="flipFlashcard()">
                    <span id="flashcard-side-label" style="font-size: 0.8em; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 8px;">Front (${userKnown})</span>
                    <h2 id="flashcard-text" style="margin: 0; color: #0f172a; font-size: 1.4em;">"${displayedPrompt}"</h2>
                </div>

                <!-- Flashcard Action Buttons -->
                <div style="display: flex; justify-content: center; gap: 12px; margin-top: 14px; align-items: center;">
                    <button type="button" onclick="flipFlashcard()" style="background: none; border: none; color: #2563eb; cursor: pointer; font-weight: 600; font-size: 0.9em;">
                        <i class="fa-solid fa-rotate"></i> Flip Card
                    </button>
                    <button type="button" onclick="playCurrentModalAudio()" style="background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.9em; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-volume-high"></i> Listen Pronunciation
                    </button>
                </div>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <button type="button" onclick="closeExerciseModal()" style="padding: 8px 16px; background: #e2e8f0; border: none; border-radius: 6px; cursor: pointer;">Close</button>
                <button type="button" onclick="submitExerciseAnswer()" style="padding: 8px 16px; background: #16a34a; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Got It!</button>
            </div>
        `;
    } else {
        exerciseBodyHTML = `
            <p id="exercise-prompt" style="font-size: 1.1em; color: #334155; margin: 16px 0;">Translate to ${targetLangName}: <strong>"${displayedPrompt}"</strong></p>
            <div style="margin-bottom: 12px;">
                <button type="button" onclick="playCurrentModalAudio()" style="background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85em; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-volume-high"></i> Listen Target Phrase
                </button>
            </div>
            <input type="text" id="exercise-user-input" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 16px;" placeholder="Type target translation...">
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" onclick="closeExerciseModal()" style="padding: 8px 16px; background: #e2e8f0; border: none; border-radius: 6px; cursor: pointer;">Close</button>
                <button type="button" onclick="submitExerciseAnswer()" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Submit</button>
            </div>
        `;
    }

    modal.innerHTML = `
        <div style="background: #fff; width: 90%; max-width: 480px; padding: 24px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                <h3 style="margin: 0; color: #0f172a;">${node.label || "Lesson Exercise"}</h3>
                <span style="font-size: 0.75em; background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 12px; font-weight: 600; text-transform: capitalize;">
                    ${targetLangName}
                </span>
            </div>
            ${exerciseBodyHTML}
        </div>
    `;

    modal.style.display = "flex";
    requestAnimationFrame(() => modal.style.opacity = "1");
}

function renderFlashcardUI(node) {
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex];
    const langName = activeTarget ? activeTarget.name : "Target";
    
    const targetText = node.targetText || node.prompt || "";
    const cleanText = targetText.replace(/'/g, "\\'"); // Escape quotes for inline click handler

    return `
        <div class="flashcard-card" style="text-align: center; padding: 20px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="font-size: 0.85em; color: #64748b; margin-bottom: 8px;">Target Wording</div>
            <h2 style="font-size: 1.8em; color: #0f172a; margin: 0 0 16px 0;">${targetText}</h2>
            
            <button type="button" class="btn btn-secondary" 
                    onclick="playLessonAudio('${cleanText}', '${node.audioSrc || ''}', '${langName}')" 
                    style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; cursor: pointer;">
                <i class="fa-solid fa-volume-high"></i> Listen Pronunciation
            </button>
        </div>
    `;
}
function flipFlashcard() {
    if (!window.currentModalFlashcard) return;
    const card = window.currentModalFlashcard;
    const textEl = document.getElementById("flashcard-text");
    const labelEl = document.getElementById("flashcard-side-label");
    const cardEl = document.getElementById("flashcard-card");

    if (!textEl || !cardEl || !labelEl) return;

    card.isFlipped = !card.isFlipped;
    if (card.isFlipped) {
        labelEl.innerText = `Back (${card.targetLang})`;
        textEl.innerText = card.back;
        cardEl.style.background = "#eff6ff";
        cardEl.style.borderColor = "#93c5fd";
    } else {
        labelEl.innerText = `Front (${card.knownLang})`;
        textEl.innerText = `"${card.front}"`;
        cardEl.style.background = "#f8fafc";
        cardEl.style.borderColor = "#cbd5e1";
    }
}

function closeExerciseModal() {
    const modal = document.getElementById("exercise-modal");
    if (modal) {
        modal.style.opacity = "0";
        setTimeout(() => modal.style.display = "none", 200);
    }
    appState.activeNode = null;
}
// Triggers MMS-TTS for the active flashcard/modal phrase
function playCurrentModalAudio() {
    if (!window.currentModalFlashcard) return;
    const card = window.currentModalFlashcard;
    const targetText = card.back || card.front;
    playLessonAudio(targetText, appState.activeNode?.audioSrc || "", card.targetLang);
}

// Handler for HTML modal audio button (lesson-exercise-modal in index.html)
function playAudioMock() {
    if (window.currentModalFlashcard) {
        playCurrentModalAudio();
    } else if (appState.activeNode) {
        const activeTargetObj = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
        const targetLangName = activeTargetObj ? activeTargetObj.name : "Target";
        playLessonAudio(appState.activeNode.targetText || appState.activeNode.prompt, appState.activeNode.audioSrc || "", targetLangName);
    }
}

function submitExerciseAnswer() {
    if (appState.activeNode) {
        appState.activeNode.status = "completed";

        const currentIndex = appState.lessonNodes.findIndex(n => n.id === appState.activeNode.id);
        if (currentIndex !== -1 && currentIndex + 1 < appState.lessonNodes.length) {
            if (appState.lessonNodes[currentIndex + 1].status === "locked") {
                appState.lessonNodes[currentIndex + 1].status = "active";
            }
        }
        
        saveStateToStorage();
        saveUserLanguagesToSupabase();
        if (typeof renderLessonMap === "function") renderLessonMap();
    }
    showToast("Exercise completed! Next node unlocked.");
    closeExerciseModal();
}

// --- 7. AUDIO RECORDING & SUNBIRD ASR ---
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function triggerRecordMock(btn) {
    const inputGroup = btn.closest(".sample-input-group");
    const targetInput = inputGroup ? (inputGroup.querySelector(".sample-target-input") || inputGroup.parentElement?.querySelector("input")) : null;

    if (!isRecording) {
        try {
            audioChunks = [];
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.start();
            isRecording = true;

            btn.innerHTML = `<i class="fa-solid fa-circle-dot" style="color:red"></i> Stop Recording`;
            btn.style.background = "#FEE2E2";
            btn.style.color = "#991B1B";
            showToast("Recording... Speak clearly.");
        } catch (err) {
            console.error("Microphone access error:", err);
            showToast("Microphone access denied or unavailable.");
        }
    } else {
        isRecording = false;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Transcribing...`;
        btn.style.background = "#FEF3C7";
        btn.style.color = "#92400E";

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
            const transcription = await sendToSunbirdASR(audioBlob);

            if (transcription) {
                if (targetInput) targetInput.value = transcription;
                const modalInput = document.getElementById("add-modal-sentence");
                if (modalInput) modalInput.value = transcription;
                showToast("Audio transcribed successfully!");
            } else {
                showToast("Audio captured.");
            }

            btn.innerHTML = `<i class="fa-solid fa-microphone"></i> Record Audio Sentence`;
            btn.style.background = "#f1f5f9";
            btn.style.color = "#334155";
        };

        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}
// Map common language names to ISO 639-3 codes without hardcoding exhaustive lists
function getLanguageIsoCode(langName) {
    if (!langName) return "yor";
    const name = langName.toLowerCase().trim();
    
    // Dynamic match for active target languages
    if (name.includes("yoruba")) return "yor";
    if (name.includes("sousou") || name.includes("susu")) return "sus";
    if (name.includes("swahili")) return "swh";
    if (name.includes("hausa")) return "hau";
    if (name.includes("igbo")) return "ibo";

    // Fallback: use current active target's isoCode property if present
    const activeTarget = appState.user.targetLanguages?.[appState.user.activeTargetIndex];
    return activeTarget?.isoCode || "yor";
}

// Fetch native audio blob from Hugging Face MMS-TTS
async function fetchMmsTtsAudio(textToSpeak, langName) {
    const isoCode = getLanguageIsoCode(langName);
    const modelUrl = `https://api-inference.huggingface.co/models/facebook/mms-tts-${isoCode}`;

    try {
        const response = await fetch(modelUrl, {
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({ inputs: textToSpeak })
        });

        if (!response.ok) {
            throw new Error(`MMS-TTS API returned status ${response.status}`);
        }

        const audioBlob = await response.blob();
        return URL.createObjectURL(audioBlob);
    } catch (error) {
        console.warn("MMS-TTS API offline or failed:", error);
        return null;
    }
}

// Global Audio Player for Lessons and Flashcards
async function playLessonAudio(text, customAudioSrc, langName) {
    // 1. Play custom uploaded audio note if present
    if (customAudioSrc && customAudioSrc !== "") {
        try {
            const audio = new Audio(customAudioSrc);
            await audio.play();
            return;
        } catch (err) {
            console.warn("Custom audio playback failed, generating TTS:", err);
        }
    }

    // 2. Fetch native audio from Hugging Face MMS-TTS
    showToast("Loading pronunciation...");
    const generatedAudioUrl = await fetchMmsTtsAudio(text, langName);

    if (generatedAudioUrl) {
        const audio = new Audio(generatedAudioUrl);
        audio.play();
    } else {
        // 3. Fallback to browser TTS if API is reaching cold start or unavailable
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.85;
            window.speechSynthesis.speak(utterance);
        } else {
            showToast("Audio currently unavailable.");
        }
    }
}
async function sendToSunbirdASR(audioBlob) {
    const modelUrl = "https://api-inference.huggingface.co/models/Sunbird/asr-whisper-51-african-languages";

    try {
        const response = await fetch(modelUrl, {
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "audio/wav"
            },
            method: "POST",
            body: audioBlob
        });

        const result = await response.json();
        return result.text || "";
    } catch (error) {
        console.error("Sunbird ASR API Error:", error);
        return "";
    }
}

// --- 8. STATE PERSISTENCE & SUPABASE HELPERS ---
function resetUserState() {
    appState.user = {
        isLoggedIn: false,
        email: "user@heritagevoice.org",
        username: "heritage_learner",
        knownLanguage: "English",
        learningStyle: "Flashcards with Pictures",
        targetLanguages: [
            {
                name: "Yoruba",
                origin: "West Africa",
                related: "Volta-Niger family",
                level: "A1 Beginner"
            }
        ],
        activeTargetIndex: 0,
        privateCorpus: []
    };
    try {
        localStorage.removeItem('heritage_voice_state');
    } catch (e) {
        console.warn("LocalStorage access error:", e);
    }
}

function saveStateToStorage() {
    try {
        const payload = {
            user: appState.user,
            lessonNodes: appState.lessonNodes
        };
        localStorage.setItem('heritage_voice_state', JSON.stringify(payload));
    } catch (e) {
        console.warn("LocalStorage save error:", e);
    }
}

function restoreStateFromStorage() {
    const raw = localStorage.getItem('heritage_voice_state');
    if (!raw) return;

    try {
        const parsed = JSON.parse(raw);
        if (parsed.user) {
            appState.user = { ...appState.user, ...parsed.user };
        }
        if (parsed.lessonNodes && Array.isArray(parsed.lessonNodes)) {
            appState.lessonNodes = parsed.lessonNodes;
        }
    } catch (e) {
        console.warn("Error parsing local state:", e);
    }
}

async function saveUserLanguagesToSupabase() {
    if (!supabaseClient || !appState.user.isLoggedIn) return;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        await supabaseClient
            .from('profiles')
            .update({
                target_languages: appState.user.targetLanguages,
                active_target_index: appState.user.activeTargetIndex,
                learning_style: appState.user.learningStyle,
                lesson_nodes: appState.lessonNodes
            })
            .eq('id', user.id);
    } catch (err) {
        console.warn("Could not sync to Supabase:", err.message);
    }
}

async function fetchUserProfile(userId) {
    if (!supabaseClient) return;

    try {
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;

        if (profile) {
            appState.user.email = profile.email;
            appState.user.username = profile.username || profile.email.split("@")[0];
            appState.user.knownLanguage = profile.known_language || "English";
            appState.user.learningStyle = profile.learning_style || "Flashcards with Pictures";

            if (profile.target_languages && profile.target_languages.length > 0) {
                appState.user.targetLanguages = profile.target_languages;
                appState.user.activeTargetIndex = profile.active_target_index || 0;
            }
            // FIX: Restore saved Lesson Nodes if available
            if (profile.lesson_nodes && Array.isArray(profile.lesson_nodes) && profile.lesson_nodes.length > 0) {
                appState.lessonNodes = profile.lesson_nodes;
            }

            appState.user.isLoggedIn = true;
            saveStateToStorage();
            renderProfileView();
            updateLanguageLabels();
            updateAuthButtonUI();
        }
    } catch (err) {
        console.warn("Could not fetch user profile:", err.message);
    }
}

async function fetchAvailableLanguages() {
    try {
        if (!supabaseClient) throw new Error("Supabase SDK not loaded");

        const { data, error } = await supabaseClient
            .from('languages')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
            const seenNames = new Set();
            const uniqueLanguages = [];

            data.forEach(item => {
                const trimmedName = item.name ? item.name.trim() : "";
                if (trimmedName && !seenNames.has(trimmedName.toLowerCase())) {
                    seenNames.add(trimmedName.toLowerCase());
                    uniqueLanguages.push({
                        id: item.id,
                        name: trimmedName,
                        region: item.region || item.origin || "Global",
                        flag: item.flag || "🌍",
                        isCustom: item.is_custom || false
                    });
                }
            });

            appState.availableLanguages = uniqueLanguages;
        }
    } catch (err) {
        appState.availableLanguages = [
            { name: "Yoruba", region: "West Africa", flag: "🇳🇬", isCustom: false },
            { name: "Sousou", region: "Guinea / West Africa", flag: "🇬🇳", isCustom: false }
        ];
    }
}

// --- 9. AUTHENTICATION & SESSION MANAGEMENT ---
async function handleAuthSubmit(event) {
    if (event) event.preventDefault();

    const emailInput = document.getElementById("auth-email") || document.querySelector("input[type='email']");
    const passwordInput = document.getElementById("auth-password") || document.querySelector("input[type='password']");

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";

    if (!email || !password) {
        showToast("Please enter both email and password.");
        return;
    }

    const mode = appState.authMode || "signup";
    showToast(mode === "login" ? "Logging in..." : "Creating account...");

    try {
        if (supabaseClient) {
            let authResponse;
            if (mode === "login") {
                authResponse = await supabaseClient.auth.signInWithPassword({ email, password });
            } else {
                authResponse = await supabaseClient.auth.signUp({ email, password });
            }

            if (authResponse.error) throw authResponse.error;

            const user = authResponse.data.user;
            if (user) {
                appState.user.isLoggedIn = true;
                appState.user.email = user.email;
                appState.user.username = user.user_metadata?.username || user.email.split("@")[0];
                await fetchUserProfile(user.id);
            }
        } else {
            appState.user.isLoggedIn = true;
            appState.user.email = email;
            appState.user.username = email.split("@")[0];
        }

        saveStateToStorage();
        updateLanguageLabels();
        renderProfileView();
        updateAuthButtonUI();
        showToast(`Welcome back, ${appState.user.username}!`);
        navigateTo("languages-view");
    } catch (err) {
        console.error("Auth Error:", err);
        showToast(`Auth Failed: ${err.message || "Invalid credentials"}`);
    }
}

// Dynamic UI update for Nav Auth Button
function updateAuthButtonUI() {
    const authBtn = document.getElementById("nav-auth-btn");
    if (!authBtn) return;

    if (appState.user.isLoggedIn) {
        authBtn.innerText = "Sign Out";
    } else {
        authBtn.innerText = "Sign In";
    }
}

// Click Handler for Nav Auth Button
async function handleAuthNavClick() {
    if (appState.user.isLoggedIn) {
        // Handle Logout
        if (supabaseClient) {
            await supabaseClient.auth.signOut();
        }
        resetUserState();
        updateAuthButtonUI();
        showToast("Signed out successfully.");
        navigateTo("auth-view");
    } else {
        // Navigate to Login/Signup View
        navigateTo("auth-view");
    }
}
// --- 10. DOM INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    restoreStateFromStorage();

    if (supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
            appState.user.isLoggedIn = true;
            appState.user.email = session.user.email;
            await fetchUserProfile(session.user.id);
        }
    }

    const authForm = document.getElementById("auth-form") || document.querySelector("form");
    if (authForm) {
        authForm.addEventListener("submit", handleAuthSubmit);
    }

    await fetchAvailableLanguages();
    renderLanguageGrid();
    renderProfileView();
    updateLanguageLabels();
    updateAuthButtonUI();

    if (appState.user.isLoggedIn) {
        navigateTo("languages-view");
    }

    const spokenSelect = document.getElementById("spoken-language-select");
    if (spokenSelect) {
        spokenSelect.value = appState.user.knownLanguage || "English";

        spokenSelect.addEventListener("change", async (e) => {
            const selectedLanguage = e.target.value;
            appState.user.knownLanguage = selectedLanguage;

            saveStateToStorage();
            saveUserLanguagesToSupabase();
            updateLanguageLabels();

            showToast(`Translating interface to ${selectedLanguage}...`);
            await renderSampleSentences();
        });
    }
});

// --- 11. NAVIGATION & INTERFACE HELPERS ---
async function navigateTo(viewId) {
    const views = document.querySelectorAll(".view-section");
    views.forEach(v => v.classList.remove("active"));

    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add("active");

    const navBtns = document.querySelectorAll(".nav-btn");
    navBtns.forEach(btn => {
        if (btn.getAttribute("data-target") === viewId) btn.classList.add("active");
        else btn.classList.remove("active");
    });

    if (viewId === "lessons-view") {
        renderLessonMap();
    } else if (viewId === "profile-view") {
        renderProfileView();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectMethod(element) {
    document.querySelectorAll(".method-option").forEach(opt => opt.classList.remove("selected"));
    element.classList.add("selected");
    appState.user.learningStyle = element.getAttribute("data-value");
}

function saveMethodAndNext() {
    saveStateToStorage();
    saveUserLanguagesToSupabase();
    renderProfileView();
    showToast(`Learning method set: ${appState.user.learningStyle}`);
    navigateTo("languages-view");
}

function renderLanguageGrid() {
    const grid = document.getElementById("language-grid");
    if (!grid) return;

    grid.innerHTML = "";
    appState.availableLanguages.forEach((lang, idx) => {
        const card = document.createElement("div");
        card.className = `lang-card ${idx === 0 ? 'selected' : ''}`;
        card.onclick = () => selectTargetLanguage(lang, card);

        card.innerHTML = `
            <span class="lang-flag">${lang.flag}</span>
            <span class="lang-name">${lang.name}</span>
            <span class="lang-region">${lang.region}</span>
        `;
        grid.appendChild(card);
    });
}

function selectTargetLanguage(lang, cardElement) {
    document.querySelectorAll(".lang-card").forEach(c => c.classList.remove("selected"));
    cardElement.classList.add("selected");

    const existingIdx = appState.user.targetLanguages.findIndex(l => l.name === lang.name);
    if (existingIdx >= 0) {
        appState.user.activeTargetIndex = existingIdx;
    } else {
        appState.user.targetLanguages.push({
            name: lang.name,
            origin: lang.region,
            related: "Regional Dialects",
            level: "A1 Beginner"
        });
        appState.user.activeTargetIndex = appState.user.targetLanguages.length - 1;
    }

    updateLanguageLabels();
    saveStateToStorage();
    saveUserLanguagesToSupabase();
    renderProfileView();
    navigateTo("sample-data-view");
}

function openCustomLangModal() {
    const modal = document.getElementById("custom-lang-modal");
    if (modal) modal.classList.add("active");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");
        modal.style.opacity = "0";
        setTimeout(() => modal.style.display = "none", 200);
    }
}

function updateLanguageLabels() {
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    if (!activeTarget) return;

    const userKnown = appState.user.knownLanguage || "English";

    const targetNameSpan = document.getElementById("sample-target-name");
    if (targetNameSpan) targetNameSpan.innerText = activeTarget.name;

    const knownLangLabel = document.getElementById("known-lang-label");
    if (knownLangLabel) knownLangLabel.innerText = userKnown;

    const mapTitle = document.getElementById("map-target-title");
    if (mapTitle) mapTitle.innerText = `${userKnown} → ${activeTarget.name} Path`;

    const targetBadge = document.getElementById("current-target-badge");
    if (targetBadge) targetBadge.innerHTML = `<i class="fa-solid fa-language"></i> ${userKnown} → ${activeTarget.name}`;

    if (typeof renderSampleSentences === "function") renderSampleSentences();
    if (typeof renderLessonMap === "function") renderLessonMap();
}

async function renderSampleSentences() {
    const container = document.getElementById("sample-sentences-container");
    if (!container) return;

    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    const targetName = activeTarget ? activeTarget.name : "Target Language";
    const userKnown = appState.user.knownLanguage || "English";

    const baseEnglishSamples = [
        "How are you doing today?",
        "Good morning grandfather",
        "Let us eat together"
    ];

    container.innerHTML = baseEnglishSamples.map((known, i) => `
        <div class="sample-item">
            <div class="sample-item-header">
                <span class="sample-known-text" id="sample-known-label-${i}">${userKnown}: "${known}"</span>
                <span class="small-text"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Pair #${i + 1}</span>
            </div>
            <div class="sample-input-group">
                <input type="text" id="sample-input-${i}" class="form-input sample-target-input" placeholder="Translating to ${targetName}...">
                <button class="sample-audio-btn" onclick="triggerRecordMock(this)"><i class="fa-solid fa-microphone"></i> Record Audio</button>
            </div>
        </div>
    `).join("");

    for (let i = 0; i < baseEnglishSamples.length; i++) {
        const englishText = baseEnglishSamples[i];
        const targetTranslation = await translateActiveUserText(englishText, "English");

        const inputEl = document.getElementById(`sample-input-${i}`);
        if (inputEl) {
            inputEl.value = targetTranslation;
        }
    }
}

function generateLessonMapAndProceed() {
    showToast("Generating custom lesson path...");
    navigateTo("lessons-view");
}

// --- 12. LESSON MAP RENDERER ---
function renderLessonMap() {
    const container = document.getElementById("map-nodes-container");
    const svgCanvas = document.getElementById("map-svg-canvas");
    if (!container || !svgCanvas) return;

    container.innerHTML = "";
    svgCanvas.innerHTML = "";

    const nodes = appState.lessonNodes;

    let pathD = "";
    nodes.forEach((node, idx) => {
        const xPx = (node.x / 100) * (container.clientWidth || 800);
        const yPx = (node.y / 100) * 440;

        if (idx === 0) {
            pathD += `M ${xPx} ${yPx}`;
        } else {
            const prevX = (nodes[idx - 1].x / 100) * (container.clientWidth || 800);
            const prevY = (nodes[idx - 1].y / 100) * 440;
            const cx1 = (prevX + xPx) / 2;
            pathD += ` C ${cx1} ${prevY}, ${cx1} ${yPx}, ${xPx} ${yPx}`;
        }
    });

    const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathElement.setAttribute("d", pathD);
    pathElement.setAttribute("stroke", "#CBD5E1");
    pathElement.setAttribute("stroke-width", "4");
    pathElement.setAttribute("stroke-dasharray", "8, 8");
    pathElement.setAttribute("fill", "none");
    svgCanvas.appendChild(pathElement);

    nodes.forEach((node) => {
        const nodeEl = document.createElement("div");
        nodeEl.className = `map-node ${node.status}`;
        nodeEl.style.left = `${node.x}%`;
        nodeEl.style.top = `${node.y}%`;
        nodeEl.onclick = () => openExerciseModal(node);

        nodeEl.innerHTML = `
            <div class="node-icon-star">
                <i class="fa-solid ${node.status === 'completed' ? 'fa-check' : 'fa-star'}"></i>
            </div>
            <span class="node-label">${node.label}</span>
        `;
        container.appendChild(nodeEl);
    });
}

// --- 13. TOAST NOTIFICATION UTILITY ---
function showToast(message) {
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "toast-container";
        toastContainer.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 9999;
            display: flex; flex-direction: column; gap: 8px; pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement("div");
    toast.innerText = message;
    toast.style.cssText = `
        background: #1e293b; color: #ffffff; padding: 12px 20px;
        border-radius: 8px; font-size: 14px; font-family: inherit;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); opacity: 0;
        transform: translateY(10px); transition: all 0.25s ease; pointer-events: auto;
    `;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

// --- 14. AUTH TAB SWITCHER ---
window.switchAuthTab = function(mode) {
    const signUpTab = document.getElementById("tab-signup") || document.querySelector('[onclick*="signup"]');
    const logInTab = document.getElementById("tab-login") || document.querySelector('[onclick*="login"]');
    const formTitle = document.getElementById("auth-form-title") || document.querySelector("h2");
    const submitBtn = document.getElementById("auth-submit-btn") || document.querySelector("button[type='submit']") || document.querySelector(".auth-submit-btn");

    if (mode === 'login') {
        if (signUpTab) signUpTab.classList.remove("active");
        if (logInTab) logInTab.classList.add("active");

        if (formTitle) formTitle.innerText = "Welcome Back";
        if (submitBtn) submitBtn.innerHTML = `Log In <i class="fa-solid fa-arrow-right"></i>`;
        
        appState.authMode = "login";
    } else {
        if (logInTab) logInTab.classList.remove("active");
        if (signUpTab) signUpTab.classList.add("active");

        if (formTitle) formTitle.innerText = "Create an Account";
        if (submitBtn) submitBtn.innerHTML = `Continue to Learning Setup <i class="fa-solid fa-arrow-right"></i>`;

        appState.authMode = "signup";
    }
};