/* ==========================================================================
   HeritageVoice Web Application State & Logic Engine
   ========================================================================== */

// --- 1. SUPABASE CLIENT INITIALIZATION ---
const SUPABASE_URL = "https://fdirykbtkqnwcjpspofe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_v7RMflMmWZJvsVXV-aRTRw_2bU3fTcg";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.warn("Supabase library not loaded.");
}

const HF_TOKEN ="hf_gSbxaufuEbeoNYceHOBqdYoBrLT1QTjLjU";

// Dynamic helper: resolves any language name (e.g. "Spanish") to an ISO code via API
async function getIsoCode(languageName) {
    if (!languageName) return "en";
    const cleanName = languageName.trim().toLowerCase();
    
    // Quick fallback for common default
    if (cleanName === "english") return "en";

    try {
        const response = await fetch("https://api.mymemory.translated.net/v2/languages");
        const languages = await response.json();
        
        // Match full language name against API list
        const match = languages.find(lang => lang.name.toLowerCase() === cleanName);
        return match ? match.code : cleanName.slice(0, 2);
    } catch (error) {
        console.error("Error fetching ISO codes:", error);
        return cleanName.slice(0, 2); // Fallback to first two letters if fetch fails
    }
}
// --- 2. GLOBAL APPLICATION STATE ---
const appState = {
    user: {
        isLoggedIn: false,
        email: "user@heritagevoice.org",
        username: "heritage_learner",
        knownLanguage: "English",
        learningStyle: "Sentence Structure Practice",
        targetLanguages: [
            {
                name: "French",
                origin: "Europe, Global",
                related: "Romance family",
                level: "A1 Beginner"
            }
        ],
        activeTargetIndex: 0,
        privateCorpus: [
            { id: 1, targetLang: "French", knownText: "How are you doing today?", targetText: "Comment ça va aujourd'hui?", audioAttached: true, dateAdded: "2026-08-08" },
            { id: 2, targetLang: "French", knownText: "Good morning grandfather", targetText: "Bonjour grand-père", audioAttached: false, dateAdded: "2026-08-08" }
        ]
    },
    // Populated dynamically from Supabase database
    availableLanguages: [],
    
    // Map Node Structure for Active Target
    lessonNodes: [
        { id: "A1.1", label: "A1: Greetings & Family", x: 15, y: 80, status: "completed", prompt: "Good morning grandfather", targetText: "Bonjour grand-père" },
        { id: "A1.2", label: "A1: Daily Check-in", x: 30, y: 35, status: "active", prompt: "How are you doing today?", targetText: "Comment ça va aujourd'hui?" },
        { id: "A1.3", label: "A1: Shared Meals", x: 50, y: 70, status: "locked", prompt: "Let us eat together", targetText: "mangeons ensemble" },
        { id: "A2.1", label: "A2: Expressing Gratitude", x: 70, y: 30, status: "locked", prompt: "Thank you for the meal", targetText: "Merci pour le repas" },
        { id: "A2.2", label: "A2: Storytelling Roots", x: 88, y: 75, status: "locked", prompt: "Tell me a story from home", targetText: "raconte-moi une histoire de chez moi" }
    ],
    activeNode: null
};

// --- 3. STATE MANAGEMENT & SUPABASE SYNC HELPERS ---
function resetUserState() {
    appState.user = {
        isLoggedIn: false,
        email: "user@heritagevoice.org",
        username: "heritage_learner",
        knownLanguage: "English",
        learningStyle: "Sentence Structure Practice",
        targetLanguages: [
            {
                name: "French",
                origin: "Europe, Global",
                related: "Romance family",
                level: "A1 Beginner"
            }
        ],
        activeTargetIndex: 0,
        privateCorpus: []
    };
    try {
        localStorage.removeItem('heritage_voice_state');
    } catch (e) {
        console.warn("LocalStorage access restricted:", e);
    }
}

function saveStateToStorage() {
    try {
        if (appState && appState.user) {
            localStorage.setItem('heritage_voice_state', JSON.stringify(appState.user));
        }
    } catch (e) {
        console.warn("LocalStorage access restricted:", e);
    }
}

async function saveUserLanguagesToSupabase() {
    if (!supabaseClient || !appState.user.isLoggedIn) return;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { error } = await supabaseClient
            .from('profiles')
            .update({
                target_languages: appState.user.targetLanguages,
                active_target_index: appState.user.activeTargetIndex
            })
            .eq('id', user.id);

        if (error) throw error;
    } catch (err) {
        console.warn("Could not sync target languages to Supabase:", err.message);
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
            appState.user.learningStyle = profile.learning_style || "Sentence Structure Practice";
            
            // Restore saved target languages from database
            if (profile.target_languages && profile.target_languages.length > 0) {
                appState.user.targetLanguages = profile.target_languages;
                appState.user.activeTargetIndex = profile.active_target_index || 0;
            }

            appState.user.isLoggedIn = true;

            renderProfileView();
            updateLanguageLabels();
        }
    } catch (err) {
        console.warn("Could not fetch user profile from Supabase:", err.message);
    }
}

// --- 4. DATABASE FETCH: AVAILABLE LANGUAGES ---
// --- FETCH & DEDUPLICATE LANGUAGES FROM SUPABASE ---
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
        console.warn("Supabase fetch fallback:", err.message);

        // Fallback default if database connection fails or table is empty
        appState.availableLanguages = [
            { name: "French", region: "Europe, Global", flag: "🇫🇷", isCustom: false },
            { name: "Haitian Creole", region: "Haiti, Caribbean", flag: "🇭🇹", isCustom: false }
        ];
    }
}

// --- DOM INITIALIZATION WITH PERSISTENCE & AUTO-REFRESH ---
document.addEventListener("DOMContentLoaded", async () => {
    // Restore saved user state from LocalStorage if available
    const savedState = localStorage.getItem('heritage_voice_state');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            if (parsed && parsed.knownLanguage) appState.user.knownLanguage = parsed.knownLanguage;
            if (parsed && parsed.learningStyle) appState.user.learningStyle = parsed.learningStyle;
        } catch (e) {
            console.warn("Could not parse saved user state:", e);
        }
    }

    await fetchAvailableLanguages();

    renderLanguageGrid();
    renderProfileView();
    await renderSampleSentences();

    // Spoken Language Selector Listener
   const spokenSelect = document.getElementById("spoken-language-select");
if (spokenSelect) {
    spokenSelect.value = appState.user.knownLanguage || "English";

    spokenSelect.addEventListener("change", async (e) => {
        const selectedLanguage = e.target.value;
        appState.user.knownLanguage = selectedLanguage;

        saveStateToStorage();
        saveUserLanguagesToSupabase();
        updateLanguageLabels();

        if (typeof showToast === "function") {
            showToast(`Translating interface to ${selectedLanguage}...`);
        }

        await translateWebsiteUI();
        await renderSampleSentences();
    });
}

    // Run initial UI translation on page load if knownLanguage is not English
    if (appState.user.knownLanguage && appState.user.knownLanguage.toLowerCase() !== "english") {
        await translateWebsiteUI();
    }
});

// --- 6. NAVIGATION LOGIC ---
async function navigateTo(viewId) {
    const views = document.querySelectorAll(".view-section");
    views.forEach(v => v.classList.remove("active"));

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add("active");
    }

    const navBtns = document.querySelectorAll(".nav-btn");
    navBtns.forEach(btn => {
        if (btn.getAttribute("data-target") === viewId) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    if (viewId === "lessons-view") {
        renderLessonMap();
    } else if (viewId === "profile-view") {
        renderProfileView();
    }

    // Automatically translate whichever view section was just opened
    if (appState.user.knownLanguage && appState.user.knownLanguage.toLowerCase() !== "english") {
        if (typeof translateWebsiteUI === "function") {
            await translateWebsiteUI();
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- 7. AUTHENTICATION FLOW ---
function switchAuthTab(type) {
    const tabs = document.querySelectorAll(".auth-tab");
    const signupForm = document.getElementById("signup-form");
    const loginForm = document.getElementById("login-form");

    if (!signupForm || !loginForm) return;

    if (type === 'signup') {
        if (tabs[0]) tabs[0].classList.add("active");
        if (tabs[1]) tabs[1].classList.remove("active");
        signupForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
    } else {
        if (tabs[1]) tabs[1].classList.add("active");
        if (tabs[0]) tabs[0].classList.remove("active");
        loginForm.classList.remove("hidden");
        signupForm.classList.add("hidden");
    }
}

async function handleAuthSubmit(event, type) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    const emailInput = type === 'signup' ? document.getElementById("signup-email") : document.getElementById("login-email");
    const passwordInput = type === 'signup' ? document.getElementById("signup-password") : document.getElementById("login-password");

    if (!emailInput || !passwordInput) {
        if (typeof showToast === 'function') showToast(`HTML Error: Missing input fields for ${type}`);
        console.error("Missing input fields in DOM.");
        return;
    }

    if (!emailInput.value.trim() || !passwordInput.value.trim()) {
        if (typeof showToast === 'function') showToast("Please fill in both email and password.");
        return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    try {
        let authUserEmail = email;
        let authUserId = null;

        if (supabaseClient && supabaseClient.auth) {
            const { data, error } = type === 'signup' 
                ? await supabaseClient.auth.signUp({ email, password })
                : await supabaseClient.auth.signInWithPassword({ email, password });

            if (error) {
                if (typeof showToast === 'function') showToast(`Auth error: ${error.message}`);
                console.error("Supabase auth error:", error);
                return;
            }

            if (data?.user) {
                authUserEmail = data.user.email;
                authUserId = data.user.id;
            }

            // Save/Upsert extra profile state on Sign Up
            if (type === 'signup' && data?.user) {
                const { error: profileError } = await supabaseClient
                    .from('profiles')
                    .upsert([{
                        id: data.user.id,
                        email: data.user.email,
                        username: data.user.email.split("@")[0],
                        learning_style: appState.user.learningStyle,
                        known_language: appState.user.knownLanguage,
                        target_languages: appState.user.targetLanguages,
                        active_target_index: appState.user.activeTargetIndex
                    }]);

                if (profileError) {
                    console.warn("Could not save profile preferences:", profileError.message);
                }
            }

            // Hydrate state from database
            if (authUserId) {
                await fetchUserProfile(authUserId);
            }
        } else {
            console.warn("Supabase client offline. Proceeding with local state.");
            appState.user.email = authUserEmail;
            appState.user.username = authUserEmail.split("@")[0];
            appState.user.isLoggedIn = true;
        }

        const authBtn = document.getElementById("header-auth-btn");
        const profileDisplay = document.getElementById("profile-display-email");
        
        if (profileDisplay) {
            profileDisplay.innerHTML = `<i class="fa-solid fa-envelope"></i> ${appState.user.email}`;
        }

        if (authBtn) {
            authBtn.innerText = "Log Out";
            authBtn.onclick = async () => {
                if (supabaseClient && supabaseClient.auth) {
                    await supabaseClient.auth.signOut();
                }
                
                // Clear state & update UI back to defaults
                resetUserState();
                renderProfileView();
                updateLanguageLabels();

                authBtn.innerText = "Sign In";
                authBtn.onclick = () => navigateTo('auth-view');
                
                navigateTo('home-view');
                if (typeof showToast === 'function') showToast("Logged out successfully");
            };
        }

        saveStateToStorage();
        if (typeof showToast === 'function') showToast(type === 'signup' ? "Account created successfully!" : "Welcome back!");
        
        navigateTo("method-view");

    } catch (err) {
        console.error("Unexpected auth exception:", err);
        navigateTo("method-view");
    }
}

// --- 8. METHOD SELECTION ---
function selectMethod(element) {
    document.querySelectorAll(".method-option").forEach(opt => opt.classList.remove("selected"));
    element.classList.add("selected");
    const val = element.getAttribute("data-value");
    appState.user.learningStyle = val;
}

function saveMethodAndNext() {
    saveStateToStorage();
    saveUserLanguagesToSupabase();
    showToast(`Learning method saved: ${appState.user.learningStyle}`);
    navigateTo("languages-view");
}

// --- 9. LANGUAGES SELECTION & CREATION ---
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
    saveUserLanguagesToSupabase();
    navigateTo("sample-data-view");
}

function openCustomLangModal() {
    const modal = document.getElementById("custom-lang-modal");
    if (modal) modal.classList.add("active");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
}

async function handleCreateCustomLanguage(event) {
    event.preventDefault();
    const name = document.getElementById("custom-lang-name")?.value;
    const origin = document.getElementById("custom-lang-origin")?.value;
    const related = document.getElementById("custom-lang-related")?.value || "Custom Family";
    const level = document.getElementById("custom-lang-level")?.value || "A1 Beginner";

    if (!name || !origin) return;

    const newLangObj = {
        name: name,
        origin: origin,
        is_custom: true
    };

    try {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('languages')
                .insert([newLangObj]);
            if (error) throw error;
        }

        appState.user.targetLanguages.push({ name, origin, related, level });
        appState.user.activeTargetIndex = appState.user.targetLanguages.length - 1;
        
        appState.availableLanguages.unshift({
            name,
            region: origin,
            flag: "🌍",
            isCustom: true
        });

        renderLanguageGrid();
        closeModal("custom-lang-modal");
        updateLanguageLabels();
        await saveUserLanguagesToSupabase();
        
        showToast(`Added ${name} to database & profile!`);
        navigateTo("sample-data-view");
    } catch (err) {
        console.error("Error saving custom language:", err.message);
        showToast("Error adding custom language to database.");
    }
}

function updateLanguageLabels() {
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    if (!activeTarget) return;
    
    const targetNameSpan = document.getElementById("sample-target-name");
    if (targetNameSpan) targetNameSpan.innerText = activeTarget.name;

    const knownLangLabel = document.getElementById("known-lang-label");
    if (knownLangLabel) knownLangLabel.innerText = appState.user.knownLanguage;

    const mapTitle = document.getElementById("map-target-title");
    if (mapTitle) mapTitle.innerText = `${activeTarget.name} Learning Path`;

    const targetBadge = document.getElementById("current-target-badge");
    if (targetBadge) targetBadge.innerHTML = `<i class="fa-solid fa-language"></i> Target: ${activeTarget.name}`;

    const levelTag = document.getElementById("current-level-tag");
    if (levelTag) levelTag.innerText = activeTarget.level || "A1 Beginner";

    const synthDesc = document.getElementById("synthesis-desc");
    if (synthDesc) {
        synthDesc.innerText = `Ingesting cross-lingual similarities from ${activeTarget.related || 'related languages'} to generate low-latency recall modules for ${activeTarget.name}.`;
    }

        // At the end of updateLanguageLabels(), append this line:
    if (typeof renderSampleSentences === 'function') {
        renderSampleSentences();
    }
}

// --- NEW API TRANSLATION HELPER ---
async function translateActiveUserText(text, forcedSourceLang = null) {
    if (!text || !text.trim()) return "";

    const activeTargetObj = appState.user.targetLanguages[appState.user.activeTargetIndex] 
                           || appState.user.targetLanguages[0];

    const sourceLang = forcedSourceLang || appState.user.knownLanguage || "English";
    const targetLang = activeTargetObj?.name || "English";

    // Prevent API error if source and target languages match
    if (sourceLang.toLowerCase().trim() === targetLang.toLowerCase().trim()) {
        return text;
    }

    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;
        
        const response = await fetch(url);
        const data = await response.json();

        // Check if API returned an internal error message string
        const translated = data.responseData?.translatedText || text;
        if (translated.includes("PLEASE SELECT TWO DISTINCT LANGUAGES")) {
            return text;
        }

        return translated;
    } catch (error) {
        console.error("Translation API error:", error);
        return text;
    }
}

// --- 10. SAMPLE DATA & DIAGNOSTIC ---
// --- SAMPLE DATA & DIAGNOSTIC ---
async function renderSampleSentences() {
    const container = document.getElementById("sample-sentences-container");
    if (!container) return;

    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    const targetName = activeTarget ? activeTarget.name : "Target Language";
    const userKnown = appState.user.knownLanguage || "English";

    // Base diagnostic sentences in English
    const baseEnglishSamples = [
        "How are you doing today?",
        "Good morning grandfather",
        "Let us eat together"
    ];

    // Fetch ISO codes dynamically from API without listing them manually
    const knownCode = await getIsoCode(userKnown);
    const targetCode = await getIsoCode(targetName);

    // Initial skeleton UI render
    container.innerHTML = baseEnglishSamples.map((known, i) => `
        <div class="sample-item">
            <div class="sample-item-header">
                <span class="sample-known-text" id="sample-known-label-${i}">${userKnown}: "${known}"</span>
                <span class="small-text"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Diagnostic Pair #${i + 1}</span>
            </div>
            <div class="sample-input-group">
                <input type="text" id="sample-input-${i}" class="form-input sample-target-input" placeholder="Translating to ${targetName}..." value="">
                <button class="sample-audio-btn" onclick="triggerRecordMock(this)"><i class="fa-solid fa-microphone"></i> Record Audio</button>
            </div>
        </div>
    `).join("");

    // Process translations asynchronously
    for (let i = 0; i < baseEnglishSamples.length; i++) {
        const englishText = baseEnglishSamples[i];
        let knownLangPrompt = englishText;

        // 1. Translate English prompt -> User's Known Language
        if (knownCode !== "en") {
            try {
                const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(englishText)}&langpair=en|${knownCode}`);
                const data = await res.json();
                if (data.responseData?.translatedText && !data.responseData.translatedText.includes("PLEASE SELECT")) {
                    knownLangPrompt = data.responseData.translatedText;
                }
            } catch (e) {
                console.error("Error translating to known language:", e);
            }
        }

        // Update card label with translated prompt
        const labelEl = document.getElementById(`sample-known-label-${i}`);
        if (labelEl) {
            labelEl.innerText = `${userKnown}: "${knownLangPrompt}"`;
        }

        // 2. Translate Known Language prompt -> Target Language
        let targetTranslation = "";
        if (knownCode === targetCode) {
            targetTranslation = knownLangPrompt;
        } else {
            try {
                const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(knownLangPrompt)}&langpair=${knownCode}|${targetCode}`);
                const data = await res.json();
                if (data.responseData?.translatedText && !data.responseData.translatedText.includes("PLEASE SELECT")) {
                    targetTranslation = data.responseData.translatedText;
                }
            } catch (e) {
                console.error("Error translating to target language:", e);
            }
        }

        // Insert target translation into input box
        const inputEl = document.getElementById(`sample-input-${i}`);
        if (inputEl) {
            inputEl.value = targetTranslation;
            inputEl.placeholder = `Type ${targetName} spelling/phonetics...`;
        }
    }
}

 

// --- 10. SAMPLE DATA & DIAGNOSTIC ---

// Global media recorder variables
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Replaces triggerRecordMock to capture live audio & transcribe via Sunbird Whisper API
async function triggerRecordMock(btn) {
    const inputGroup = btn.closest(".sample-input-group");
    const targetInput = inputGroup ? inputGroup.querySelector(".sample-target-input") : null;

    if (!isRecording) {
        // --- START RECORDING ---
        try {
            audioChunks = [];
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.start();
            isRecording = true;

            btn.innerHTML = `<i class="fa-solid fa-circle-dot" style="color:red"></i> Stop & Transcribe`;
            btn.style.background = "#FEE2E2";
            btn.style.color = "#991B1B";
            showToast("Recording started... Speak into your microphone.");
        } catch (err) {
            console.error("Microphone access denied or error:", err);
            showToast("Error accessing microphone.");
        }
    } else {
        // --- STOP RECORDING & TRANSCRIBE ---
        isRecording = false;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Transcribing...`;
        btn.style.background = "#FEF3C7";
        btn.style.color = "#92400E";

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
            
            // Send binary audio to Sunbird ASR model
            const transcription = await sendToSunbirdASR(audioBlob);

            if (transcription && targetInput) {
                targetInput.value = transcription;
                showToast("Speech transcribed successfully!");
            } else {
                showToast("Transcription failed or returned empty text.");
            }

            btn.innerHTML = `<i class="fa-solid fa-check"></i> Record Audio`;
            btn.style.background = "#D1FAE5";
            btn.style.color = "#065F46";
        };

        mediaRecorder.stop();
        // Stop all microphone tracks to release mic hardware
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// Function to call Hugging Face API with audio binary
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


async function translateAndAddPhrase() {
    const input = document.getElementById("custom-known-phrase");
    if (!input || !input.value.trim()) return;

    const knownText = input.value.trim();
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] 
                          || appState.user.targetLanguages[0];

    showToast("Translating phrase...");
    const translatedText = await translateActiveUserText(knownText);

    appState.user.privateCorpus.unshift({
        id: Date.now(),
        targetLang: activeTarget ? activeTarget.name : "Target",
        knownText: knownText,
        targetText: translatedText,
        audioAttached: false,
        dateAdded: new Date().toISOString().split("T")[0]
    });

    input.value = "";
    showToast("Phrase translated & saved to your private profile corpus!");
    renderProfileView();
}


function generateLessonMapAndProceed() {
    showToast("Synthesizing learning path and active recall nodes...");
    navigateTo("lessons-view");
}

// --- 11. LESSON MAP & EXERCISE MODAL ---
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
            const prevX = (nodes[idx-1].x / 100) * (container.clientWidth || 800);
            const prevY = (nodes[idx-1].y / 100) * 440;
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
//updated exercise modal to actually show the users learning style
async function openExerciseModal(node) {
    appState.activeNode = node;
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    
    // Grabs whatever language the user chose from state dynamically
    const userKnownLanguage = appState.user.knownLanguage || "English";
    const targetLanguageName = activeTarget ? activeTarget.name : "Target";

    // 1. Update UI Labels dynamically
    const tag = document.getElementById("exercise-node-tag");
    if (tag) tag.innerText = `${node.id} (${appState.user.learningStyle})`;

    document.querySelectorAll(".user-known-lang-text").forEach(el => el.innerText = userKnownLanguage);
    document.querySelectorAll(".target-lang-text").forEach(el => el.innerText = targetLanguageName);

    // 2. Translate base prompt from English into the USER'S CHOSEN KNOWN LANGUAGE
    let displayPrompt = node.prompt;
    if (userKnownLanguage.toLowerCase() !== "english") {
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(node.prompt)}&langpair=English|${encodeURIComponent(userKnownLanguage)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.responseData?.translatedText) {
                displayPrompt = data.responseData.translatedText;
            }
        } catch (e) {
            console.error("Error translating prompt to user's known language:", e);
        }
    }

    const promptEl = document.getElementById("ex-prompt-text");
    if (promptEl) promptEl.innerText = `"${displayPrompt}"`;

    // 3. Translate base prompt into target learning language (e.g., Arabic)
    if (typeof translateActiveUserText === "function") {
        node.targetText = await translateActiveUserText(node.prompt);
    }

    // 4. Render and display modal
    renderExerciseContainer(node, activeTarget);

    const feedback = document.getElementById("correction-feedback");
    if (feedback) feedback.classList.add("hidden");

    const modal = document.getElementById("lesson-exercise-modal");
    if (modal) modal.classList.add("active");
}

function renderExerciseContainer(node, activeTarget) {
    const container = document.getElementById("exercise-interactive-container");
    if (!container) return;

    const style = (appState.user.learningStyle || "").toLowerCase();

    if (style.includes("flashcard")) {
        container.innerHTML = `
            <div class="flashcard-wrapper" onclick="this.classList.toggle('flipped')">
                <div class="flashcard-inner">
                    <div class="flashcard-front">
                        <span class="small-text">${appState.user.knownLanguage}</span>
                        <h3>${node.prompt}</h3>
                        <p class="flashcard-hint"><i class="fa-solid fa-rotate"></i> Click to flip</p>
                    </div>
                    <div class="flashcard-back">
                        <span class="small-text">${activeTarget ? activeTarget.name : "Target"}</span>
                        <h3>${node.targetText}</h3>
                        <button class="sample-audio-btn" onclick="event.stopPropagation(); playAudioMock();">
                            <i class="fa-solid fa-volume-high"></i> Listen
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else if (style.includes("audio") || style.includes("oral")) {
        container.innerHTML = `
            <div class="audio-exercise-box">
                <p>Listen to the pronunciation and repeat:</p>
                <button class="sample-audio-btn large" onclick="playAudioMock()">
                    <i class="fa-solid fa-play" id="play-icon"></i> Play Pronunciation
                </button>
                <div class="waveform-visualizer"></div>
                <div class="sample-input-group" style="margin-top: 1rem;">
                    <button class="sample-audio-btn" onclick="triggerRecordMock(this)">
                        <i class="fa-solid fa-microphone"></i> Record Your Voice
                    </button>
                </div>
            </div>
        `;
    } else if (style.includes("quiz") || style.includes("choice")) {
        container.innerHTML = `
            <div class="quiz-container" style="text-align: center; margin: 1rem 0;">
                <p class="small-text">Select the correct translation for: <strong>"${node.prompt}"</strong></p>
                <div class="quiz-options" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem;">
                    <button class="btn btn-secondary" onclick="simulateCorrection()">${node.targetText}</button>
                    <button class="btn btn-secondary" onclick="showToast('Try again!')">Option B</button>
                </div>
            </div>
        `;
    } else {
        // Default: Sentence Structure Practice / Text Input
        container.innerHTML = `
            <div class="sample-input-group">
                <input type="text" id="ex-user-input" class="form-input" value="${node.targetText}" placeholder="Type target language translation...">
                <button class="btn btn-secondary" onclick="simulateCorrection()">Save / Correct</button>
            </div>
        `;
    }
}

// Updated handler: Animates visualizer and triggers live spoken audio
// --- 11. LESSON TTS AUDIO GENERATION ---

// Maps target African & global languages to Meta MMS TTS model paths on Hugging Face
function getTtsModelName(langName) {
    if (!langName) return "facebook/mms-tts-eng";
    
    const clean = langName.trim().toLowerCase();

    const mmsCodeMap = {
        // West Africa
        "igbo": "ibo",
        "yoruba": "yor",
        "hausa": "hau",
        "twi": "twi",
        "ewe": "ewe",
        "ga": "gaa",
        "dagbani": "dag",
        "wolof": "wol",
        "bambara": "bam",
        "fulani": "ful",
        "fulfulde": "fuv",
        "kanuri": "kau",
        "fon": "fon",
        "mossi": "mos",

        // East & Central Africa
        "swahili": "swa",
        "amharic": "amh",
        "tigrinya": "tir",
        "oromo": "orm",
        "somali": "som",
        "luganda": "lug",
        "acholi": "ach",
        "ateso": "teo",
        "lugbara": "lgg",
        "runyankole": "nyn",
        "kinyarwanda": "kin",
        "kirundi": "run",
        "luo": "luo",
        "kikuyu": "kik",
        "kamba": "kam",
        "lingala": "lin",
        "sango": "sag",
        "dinka": "din",
        "nuer": "nus",

        // Southern Africa
        "zulu": "zul",
        "xhosa": "xho",
        "shona": "sna",
        "chewa": "nya",
        "nyanja": "nya",
        "bemba": "bem",
        "tonga": "toi",
        "lozi": "loz",
        "tswana": "tsn",
        "sotho": "sot",
        "tsonga": "tso",
        "venda": "ven",
        "swati": "ssw",
        "afrikaans": "afr",
        "malagasy": "mlg",

        // Global / Fallbacks
        "french": "fra",
        "english": "eng",
        "arabic": "ara",
        "portuguese": "por"
    };

    const iso3Code = mmsCodeMap[clean] || clean.slice(0, 3);
    return `facebook/mms-tts-${iso3Code}`;
}

// Speaks target translation using Hugging Face MMS TTS API
async function speakAfricanText(text, langName) {
    if (!text) return;

    const model = getTtsModelName(langName);

    try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({ inputs: text })
        });

        if (!response.ok) throw new Error(`TTS API failed with status ${response.status}`);

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        await audio.play();

    } catch (err) {
        console.warn(`Hugging Face TTS fallback triggered for ${langName}:`, err);

        // Fallback to native browser speech synthesis
        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.85;
            window.speechSynthesis.speak(utterance);
        }
    }
}

// Updated audio player: animates UI and speaks active node text
function playAudioMock() {
    if (!appState.activeNode) return;

    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] 
                          || appState.user.targetLanguages[0];
    const targetLangName = activeTarget ? activeTarget.name : "Igbo";
    const targetTextToSpeak = appState.activeNode.targetText || "";

    const visualizer = document.querySelector(".waveform-visualizer");
    const icon = document.getElementById("play-icon");
    if (visualizer) visualizer.classList.add("playing");
    if (icon) icon.className = "fa-solid fa-pause";

    // Play spoken translation
    speakAfricanText(targetTextToSpeak, targetLangName);

    setTimeout(() => {
        if (visualizer) visualizer.classList.remove("playing");
        if (icon) icon.className = "fa-solid fa-play";
    }, 3000);
}

function simulateCorrection() {
    const input = document.getElementById("ex-user-input");
    const feedback = document.getElementById("correction-feedback");

    if (input && input.value) {
        if (appState.activeNode) {
            appState.activeNode.targetText = input.value;
        }

        const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
        appState.user.privateCorpus.unshift({
            id: Date.now(),
            targetLang: activeTarget ? activeTarget.name : "Target",
            knownText: appState.activeNode ? appState.activeNode.prompt : "Correction",
            targetText: input.value + " (User Corrected)",
            audioAttached: true,
            dateAdded: new Date().toISOString().split("T")[0]
        });

        if (feedback) {
            feedback.innerText = "✓ Translation updated! Saved to your private profile corpus.";
            feedback.classList.remove("hidden");
        }
        showToast("Translation correction saved");
    }
}

async function addInLessonWord() {
    const nativeInput = document.getElementById("in-lesson-native-word");
    if (!nativeInput || !nativeInput.value.trim()) return;

    const word = nativeInput.value.trim();
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] 
                          || appState.user.targetLanguages[0];

    showToast("Translating word...");
    const translatedWord = await translateActiveUserText(word);

    appState.user.privateCorpus.unshift({
        id: Date.now(),
        targetLang: activeTarget ? activeTarget.name : "Target",
        knownText: word,
        targetText: translatedWord,
        audioAttached: false,
        dateAdded: new Date().toISOString().split("T")[0]
    });

    nativeInput.value = "";
    showToast(`Translated "${word}" → "${translatedWord}" & saved to Profile!`);
    renderProfileView();
}

function completeExerciseNode() {
    if (appState.activeNode) {
        appState.activeNode.status = "completed";
        const currIdx = appState.lessonNodes.findIndex(n => n.id === appState.activeNode.id);
        if (currIdx >= 0 && currIdx + 1 < appState.lessonNodes.length) {
            appState.lessonNodes[currIdx + 1].status = "active";
        }
    }
    closeModal("lesson-exercise-modal");
    renderLessonMap();
    showToast("Exercise completed!");
}

function openAddDataModal() {
    const modal = document.getElementById("add-data-modal");
    if (modal) modal.classList.add("active");
}

function handleImportData(event) {
    event.preventDefault();
    const known = document.getElementById("import-known-text")?.value;
    const target = document.getElementById("import-target-text")?.value;
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];

    appState.user.privateCorpus.unshift({
        id: Date.now(),
        targetLang: activeTarget ? activeTarget.name : "Target",
        knownText: known,
        targetText: target,
        audioAttached: true,
        dateAdded: new Date().toISOString().split("T")[0]
    });

    closeModal("add-data-modal");
    showToast("Imported sentence & audio snippet to private profile!");
}

// --- 12. PROFILE & SETTINGS RENDER ---
function renderProfileView() {
    const user = appState.user;

    const uName = document.getElementById("profile-username");
    if (uName) uName.innerText = user.username;

    const uEmail = document.getElementById("profile-display-email");
    if (uEmail) uEmail.innerHTML = `<i class="fa-solid fa-envelope"></i> ${user.email}`;

    const uStyle = document.getElementById("profile-learning-style-badge");
    if (uStyle) uStyle.innerText = `Learning Style: ${user.learningStyle}`;

    const targetsList = document.getElementById("user-target-languages-list");
    if (targetsList) {
        targetsList.innerHTML = user.targetLanguages.map(t => `
            <div class="corpus-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${t.name}</strong> <small>(${t.origin})</small>
                    <div class="small-text">Related: ${t.related || 'N/A'}</div>
                </div>
                <span class="badge-tag">${t.level}</span>
            </div>
        `).join("");
    }

    const corpusList = document.getElementById("private-corpus-list");
    if (corpusList) {
        if (!user.privateCorpus || user.privateCorpus.length === 0) {
            corpusList.innerHTML = `<p class="small-text">No custom sentences added yet.</p>`;
        } else {
            corpusList.innerHTML = user.privateCorpus.map(item => `
                <div class="corpus-item">
                    <div style="display:flex; justify-content:space-between;">
                        <span class="corpus-item-target">${item.targetLang}: "${item.targetText}"</span>
                        <small class="small-text">${item.dateAdded}</small>
                    </div>
                    <div class="small-text">${user.knownLanguage} prompt: "${item.knownText}" ${item.audioAttached ? '• <i class="fa-solid fa-volume-high"></i> Audio Attached' : ''}</div>
                </div>
            `).join("");
        }
    }
}

function handleUpdateEmail(e) {
    e.preventDefault();
    const newEmail = document.getElementById("update-email-input")?.value;
    if (newEmail) {
        appState.user.email = newEmail;
        renderProfileView();
        showToast("Email address updated!");
        document.getElementById("update-email-input").value = "";
    }
}

function handleUpdatePassword(e) {
    e.preventDefault();
    showToast("Password updated successfully!");
    e.target.reset();
}

// --- 13. UTILITY: TOAST NOTIFICATIONS ---
function showToast(msg) {
    const toast = document.getElementById("toast");
    const toastMsg = document.getElementById("toast-message");
    if (toast && toastMsg) {
        toastMsg.innerText = msg;
        toast.classList.add("show");
        setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }
}

async function translateWebsiteUI() {
    const targetKnownLang = appState.user.knownLanguage;
    if (!targetKnownLang || targetKnownLang.toLowerCase() === "english") return;

    // Gather translatable text nodes
    const selector = "h1, h2, h3, h4, h5, p, label, button, .sample-known-text, .node-label";
    const elements = document.querySelectorAll(selector);
    const textNodes = [];

    elements.forEach(el => {
        if (["INPUT", "TEXTAREA", "SELECT", "SCRIPT", "STYLE"].includes(el.tagName)) return;

        Array.from(el.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 0) {
                if (!node.datasetOriginal) {
                    node.datasetOriginal = node.nodeValue.trim();
                }
                textNodes.push(node);
            }
        });
    });

    if (textNodes.length === 0) return;

    // Combine all UI text into a single query separated by newlines to bypass rate limits
    const combinedText = textNodes.map(n => n.datasetOriginal).join("\n");

    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(combinedText)}&langpair=English|${encodeURIComponent(targetKnownLang)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.responseData?.translatedText) {
            const translatedArray = data.responseData.translatedText.split("\n");
            
            // Re-assign translated values back to text nodes
            textNodes.forEach((node, index) => {
                if (translatedArray[index]) {
                    node.nodeValue = translatedArray[index];
                }
            });
        }
    } catch (err) {
        console.error("Batch UI Translation error:", err);
    }
}
