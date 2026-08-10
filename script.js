/* ==========================================================================
   HeritageVoice Web Application State & Logic Engine
   ========================================================================== */

// --- SUPABASE CLIENT INITIALIZATION ---
const SUPABASE_URL = "https://fdirykbtkqnwcjpspofe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_v7RMflMmWZJvsVXV-aRTRw_2bU3fTcg";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL APPLICATION STATE ---
const appState = {
    user: {
        isLoggedIn: false,
        email: "user@heritagevoice.org",
        username: "heritage_learner",
        knownLanguage: "English",
        learningStyle: "Sentence Structure Practice",
        targetLanguages: [
            {
                name: "Sousou",
                origin: "Guinea, West Africa",
                related: "Mandinka, Pular",
                level: "A1 Beginner"
            }
        ],
        activeTargetIndex: 0,
        privateCorpus: [
            { id: 1, targetLang: "Sousou", knownText: "How are you doing today?", targetText: "I kene wa?", audioAttached: true, dateAdded: "2026-08-08" },
            { id: 2, targetLang: "Sousou", knownText: "Good morning grandfather", targetText: "Inoma kene", audioAttached: false, dateAdded: "2026-08-08" }
        ]
    },
    // Populated dynamically from Supabase database
    availableLanguages: [],
    
    // Map Node Structure for Active Target
    lessonNodes: [
        { id: "A1.1", label: "A1: Greetings & Family", x: 15, y: 80, status: "completed", prompt: "Good morning grandfather", targetText: "Inoma kene" },
        { id: "A1.2", label: "A1: Daily Check-in", x: 30, y: 35, status: "active", prompt: "How are you doing today?", targetText: "I kene wa?" },
        { id: "A1.3", label: "A1: Shared Meals", x: 50, y: 70, status: "locked", prompt: "Let us eat together", targetText: "A kha donse don" },
        { id: "A2.1", label: "A2: Expressing Gratitude", x: 70, y: 30, status: "locked", prompt: "Thank you for the meal", targetText: "I bara wolo" },
        { id: "A2.2", label: "A2: Storytelling Roots", x: 88, y: 75, status: "locked", prompt: "Tell me a story from home", targetText: "Tariku fala n bɛ" }
    ],
    activeNode: null
};

// --- DATABASE FETCH: AVAILABLE LANGUAGES ---
async function fetchAvailableLanguages() {
    try {
        const { data, error } = await supabaseClient
            .from('languages')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
            appState.availableLanguages = data.map(item => ({
                id: item.id,
                name: item.name,
                region: item.region || item.origin || "Global",
                flag: item.flag || "🌍",
                isCustom: item.is_custom || false
            }));
        }
    } catch (err) {
        console.error("Error fetching languages from Supabase:", err.message);
        showToast("Could not load languages from database. Using offline fallback.");
        
        // Fallback default if database connection fails or table is empty
        appState.availableLanguages = [
            { name: "Sousou", region: "Guinea, West Africa", flag: "🇬🇳", isCustom: false },
            { name: "Haitian Creole", region: "Haiti, Caribbean", flag: "🇭🇹", isCustom: false }
        ];
    }
}

// --- DOM INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    // Fetch languages from Supabase first
    await fetchAvailableLanguages();

    // Render UI components after fetching database records
    renderLanguageGrid();
    renderProfileView();
    renderSampleSentences();
    renderLessonMap();

    // Setup Known Language dropdown listener
    const knownSelect = document.getElementById("known-language-select");
    if (knownSelect) {
        knownSelect.addEventListener("change", (e) => {
            appState.user.knownLanguage = e.target.value;
            renderSampleSentences();
            updateLanguageLabels();
            showToast(`Spoken language set to ${e.target.value}`);
        });
    }
});

// --- NAVIGATION LOGIC ---
function navigateTo(viewId) {
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

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- AUTHENTICATION FLOW ---
function switchAuthTab(type) {
    const tabs = document.querySelectorAll(".auth-tab");
    const signupForm = document.getElementById("signup-form");
    const loginForm = document.getElementById("login-form");

    if (type === 'signup') {
        tabs[0].classList.add("active");
        tabs[1].classList.remove("active");
        signupForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
    } else {
        tabs[1].classList.add("active");
        tabs[0].classList.remove("active");
        loginForm.classList.remove("hidden");
        signupForm.classList.add("hidden");
    }
}

async function handleAuthSubmit(event, type) {
    event.preventDefault();

    const emailInput = type === 'signup' ? document.getElementById("signup-email") : document.getElementById("login-email");
    const passwordInput = type === 'signup' ? document.getElementById("signup-password") : document.getElementById("login-password");

    console.log("Auth Triggered:", type, { emailInput, passwordInput });

    if (!emailInput || !passwordInput) {
        showToast(`HTML Error: Missing input fields for ${type}`);
        console.error("Missing inputs in DOM. Check your HTML IDs.");
        return;
    }

    if (!emailInput.value || !passwordInput.value) {
        showToast("Please fill in both email and password.");
        return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;

    try {
        const { data, error } = type === 'signup' 
            ? await supabaseClient.auth.signUp({ email, password })
            : await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            showToast(`Auth error: ${error.message}`);
            console.error("Supabase error:", error);
            return;
        }

        appState.user.isLoggedIn = true;
        appState.user.email = data.user.email;
        appState.user.username = data.user.email.split("@")[0];

        const authBtn = document.getElementById("header-auth-btn");
        if (authBtn) {
            authBtn.innerText = "Log Out";
            authBtn.onclick = async () => {
                await supabaseClient.auth.signOut();
                appState.user.isLoggedIn = false;
                authBtn.innerText = "Sign In";
                authBtn.onclick = () => navigateTo('auth-view');
                navigateTo('home-view');
                showToast("Logged out successfully");
            };
        }

        showToast(type === 'signup' ? "Account created successfully!" : "Welcome back!");
        navigateTo("method-view");
    } catch (err) {
        console.error("Unexpected auth exception:", err);
        showToast("An unexpected error occurred.");
    }
}

// --- METHOD SELECTION ---
function selectMethod(element) {
    document.querySelectorAll(".method-option").forEach(opt => opt.classList.remove("selected"));
    element.classList.add("selected");
    const val = element.getAttribute("data-value");
    appState.user.learningStyle = val;
}

function saveMethodAndNext() {
    showToast(`Learning method set: ${appState.user.learningStyle}`);
    navigateTo("languages-view");
}

// --- LANGUAGES SELECTION & CREATION ---
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
    navigateTo("sample-data-view");
}

function updateLanguageLabels() {
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    
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
}

// --- MODAL: CUSTOM LANGUAGE INPUT ---
function openCustomLangModal() {
    document.getElementById("custom-lang-modal").classList.add("active");
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove("active");
}

async function handleCreateCustomLanguage(event) {
    event.preventDefault();
    const name = document.getElementById("custom-lang-name").value;
    const origin = document.getElementById("custom-lang-origin").value;
    const related = document.getElementById("custom-lang-related").value;
    const level = document.getElementById("custom-lang-level").value;

    const newLangObj = {
        name: name,
        region: origin,
        flag: "🌍",
        is_custom: true
    };

    // Save newly created language to Supabase
    try {
        const { data, error } = await supabaseClient
            .from('languages')
            .insert([newLangObj])
            .select();

        if (error) throw error;

        // Add to local state
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
        showToast(`Added ${name} to database & profile!`);
        navigateTo("sample-data-view");
    } catch (err) {
        console.error("Error saving custom language:", err.message);
        showToast("Error adding custom language to database.");
    }
}

// --- SAMPLE DATA & DIAGNOSTIC ---
function renderSampleSentences() {
    const container = document.getElementById("sample-sentences-container");
    if (!container) return;

    const samples = [
        { known: "How are you doing today?", defaultTarget: "I kene wa?" },
        { known: "Good morning grandfather", defaultTarget: "Inoma kene" },
        { known: "Let us eat together", defaultTarget: "A kha donse don" }
    ];

    container.innerHTML = samples.map((s, i) => `
        <div class="sample-item">
            <div class="sample-item-header">
                <span class="sample-known-text">${appState.user.knownLanguage}: "${s.known}"</span>
                <span class="small-text"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Diagnostic Pair #${i + 1}</span>
            </div>
            <div class="sample-input-group">
                <input type="text" class="form-input sample-target-input" placeholder="Type target spelling/phonetics..." value="${s.defaultTarget}">
                <button class="sample-audio-btn" onclick="triggerRecordMock(this)"><i class="fa-solid fa-microphone"></i> Record Audio</button>
            </div>
        </div>
    `).join("");
}

function triggerRecordMock(btn) {
    btn.innerHTML = `<i class="fa-solid fa-circle-dot" style="color:red"></i> Recording...`;
    setTimeout(() => {
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Audio Captured`;
        btn.style.background = "#D1FAE5";
        btn.style.color = "#065F46";
        showToast("Oral audio snippet attached to sentence pair!");
    }, 1500);
}

function translateAndAddPhrase() {
    const input = document.getElementById("custom-known-phrase");
    if (!input || !input.value) return;

    const knownText = input.value;
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];

    const simulatedTarget = `[${activeTarget.name}] ` + knownText.split(" ").map(w => w + "a").join(" ");

    appState.user.privateCorpus.unshift({
        id: Date.now(),
        targetLang: activeTarget.name,
        knownText: knownText,
        targetText: simulatedTarget,
        audioAttached: false,
        dateAdded: new Date().toISOString().split("T")[0]
    });

    input.value = "";
    showToast("Phrase translated & saved to your private profile corpus!");
    renderSampleSentences();
}

function generateLessonMapAndProceed() {
    showToast("Synthesizing learning path and active recall nodes...");
    navigateTo("lessons-view");
}

// --- LESSON MAP & EXERCISE MODAL ---
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

function openExerciseModal(node) {
    appState.activeNode = node;
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];

    document.getElementById("exercise-node-tag").innerText = node.id;
    document.getElementById("ex-prompt-text").innerText = `"${node.prompt}"`;
    document.querySelectorAll(".user-known-lang-text").forEach(el => el.innerText = appState.user.knownLanguage);
    document.querySelectorAll(".target-lang-text").forEach(el => el.innerText = activeTarget.name);

    document.getElementById("ex-user-input").value = node.targetText;
    document.getElementById("correction-feedback").classList.add("hidden");

    document.getElementById("lesson-exercise-modal").classList.add("active");
}

function playAudioMock() {
    const visualizer = document.querySelector(".waveform-visualizer");
    const icon = document.getElementById("play-icon");
    if (visualizer) visualizer.classList.add("playing");
    if (icon) icon.className = "fa-solid fa-pause";

    setTimeout(() => {
        if (visualizer) visualizer.classList.remove("playing");
        if (icon) icon.className = "fa-solid fa-play";
    }, 2500);
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
            targetLang: activeTarget.name,
            knownText: appState.activeNode ? appState.activeNode.prompt : "Correction",
            targetText: input.value + " (User Corrected)",
            audioAttached: true,
            dateAdded: new Date().toISOString().split("T")[0]
        });

        feedback.innerText = "✓ Translation updated! Your correction has been saved to your private profile corpus.";
        feedback.classList.remove("hidden");
        showToast("Translation correction saved");
    }
}

function addInLessonWord() {
    const nativeInput = document.getElementById("in-lesson-native-word");
    if (!nativeInput || !nativeInput.value) return;

    const word = nativeInput.value;
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];
    const translatedWord = `[${activeTarget.name}] ` + word + "i kali";

    appState.user.privateCorpus.unshift({
        id: Date.now(),
        targetLang: activeTarget.name,
        knownText: word,
        targetText: translatedWord,
        audioAttached: false,
        dateAdded: new Date().toISOString().split("T")[0]
    });

    nativeInput.value = "";
    showToast(`Translated "${word}" → "${translatedWord}" & saved to Profile!`);
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
    document.getElementById("add-data-modal").classList.add("active");
}

function handleImportData(event) {
    event.preventDefault();
    const known = document.getElementById("import-known-text").value;
    const target = document.getElementById("import-target-text").value;
    const activeTarget = appState.user.targetLanguages[appState.user.activeTargetIndex] || appState.user.targetLanguages[0];

    appState.user.privateCorpus.unshift({
        id: Date.now(),
        targetLang: activeTarget.name,
        knownText: known,
        targetText: target,
        audioAttached: true,
        dateAdded: new Date().toISOString().split("T")[0]
    });

    closeModal("add-data-modal");
    showToast("Imported sentence & audio snippet to private profile!");
}

// --- PROFILE & SETTINGS RENDER ---
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
        if (user.privateCorpus.length === 0) {
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
    const newEmail = document.getElementById("update-email-input").value;
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

// --- UTILITY: TOAST NOTIFICATIONS ---
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
