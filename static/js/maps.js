// =====================================================================
// DocVoice AI - Maps JS (Live Hospitals + Voice + Filtering)
// =====================================================================

// --- Map Initialization ---
const map = L.map('map', { zoomControl: false }).setView([13.9299, 75.5681], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// --- Dynamic Location Data ---
const LOCATION_DATA = {
    "Karnataka": ["Bangalore", "Shivamogga", "Mysuru", "Hubli", "Mangalore", "Belgaum", "Davanagere", "Bellary"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane", "Solapur"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli", "Vellore"],
    "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Darjeeling"],
    "Delhi": ["New Delhi", "North Delhi", "South Delhi", "West Delhi", "East Delhi"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner"]
};

const ALL_STATIC_HOSPITALS = [
    // BANGALORE
    { id: 1, grid: "Bangalore", name: "Manipal Hospital", doctor: "Dr. Sudarshan Ballal", lat: 12.9600, lon: 77.6500, specialty: "General" },
    { id: 2, grid: "Bangalore", name: "Apollo Hospitals", doctor: "Dr. Sharma", lat: 12.8961, lon: 77.5985, specialty: "Orthopedics" },
    { id: 3, grid: "Bangalore", name: "NIMHANS", doctor: "Dr. Pratima Murthy", lat: 12.9370, lon: 77.5930, specialty: "Neurology" },
    { id: 4, grid: "Bangalore", name: "Jayadeva Institute", doctor: "Dr. Gupta", lat: 12.9260, lon: 77.5940, specialty: "Cardiology" },
    { id: 5, grid: "Bangalore", name: "Rainbow Children's", doctor: "Dr. Arjun Reddy", lat: 12.9750, lon: 77.5910, specialty: "Pediatrics" },
    { id: 15, grid: "Bangalore", name: "Fortis Hospital", doctor: "Dr. Vivek Jawali", lat: 12.9100, lon: 77.5850, specialty: "Cardiology" },
    { id: 16, grid: "Bangalore", name: "Aster CMI", doctor: "Dr. Nitish Shetty", lat: 13.0450, lon: 77.5900, specialty: "General" },
    { id: 17, grid: "Bangalore", name: "Sakra World Hospital", doctor: "Dr. Maheshwarappa", lat: 12.9280, lon: 77.6950, specialty: "Orthopedics" },

    // SHIVAMOGGA
    { id: 6, grid: "Shivamogga", name: "Nanjappa Multi-Speciality", doctor: "Dr. Nanjappa", lat: 13.9400, lon: 75.5700, specialty: "Cardiology" },
    { id: 7, grid: "Shivamogga", name: "McGann Teaching Hospital", doctor: "Dr. Vishwanath", lat: 13.9400, lon: 75.5600, specialty: "General" },
    { id: 8, grid: "Shivamogga", name: "Sanjivini Hospital", doctor: "Dr. Kiran Kumar", lat: 13.9350, lon: 75.5650, specialty: "Orthopedics" },
    { id: 9, grid: "Shivamogga", name: "Bapuji Child Care", doctor: "Dr. Ananya", lat: 13.9380, lon: 75.5720, specialty: "Pediatrics" },
    { id: 18, grid: "Shivamogga", name: "Subbaiah Medical College", doctor: "Dr. Srinivas", lat: 13.9500, lon: 75.5800, specialty: "General" },
    { id: 19, grid: "Shivamogga", name: "Sahyadri Hospital", doctor: "Dr. Prasad", lat: 13.9250, lon: 75.5600, specialty: "Neurology" },

    // MUMBAI
    { id: 10, grid: "Mumbai", name: "Lilavati Hospital", doctor: "Dr. Trivedi", lat: 19.0500, lon: 72.8300, specialty: "Cardiology" },
    { id: 11, grid: "Mumbai", name: "Kokilaben Ambani Hospital", doctor: "Dr. Desai", lat: 19.1300, lon: 72.8200, specialty: "Neurology" },
    { id: 12, grid: "Mumbai", name: "Tata Memorial", doctor: "Dr. Badwe", lat: 19.0040, lon: 72.8400, specialty: "General" },
    { id: 13, grid: "Mumbai", name: "Breach Candy Hospital", doctor: "Dr. Udwadia", lat: 18.9730, lon: 72.8090, specialty: "Orthopedics" },
    { id: 14, grid: "Mumbai", name: "Surya Mother & Child", doctor: "Dr. Awasthi", lat: 19.0820, lon: 72.8420, specialty: "Pediatrics" },
    { id: 20, grid: "Mumbai", name: "Jaslok Hospital", doctor: "Dr. Shoaib Padaria", lat: 18.9720, lon: 72.8080, specialty: "Cardiology" },
    { id: 21, grid: "Mumbai", name: "Nanavati Max", doctor: "Dr. Akshay Raut", lat: 19.0980, lon: 72.8360, specialty: "Orthopedics" },
    { id: 22, grid: "Mumbai", name: "H. N. Reliance", doctor: "Dr. Gustad Daver", lat: 18.9580, lon: 72.8200, specialty: "General" }
];


// --- DOM ---
const systemLog     = document.getElementById('system-log');
const dbStatusList  = document.getElementById('db-status-list');
const micBtn        = document.getElementById('mic-btn');
const aiRing        = document.getElementById('ai-ring');
const aiCore        = aiRing ? aiRing.nextElementSibling : null;
const aiStatusText  = document.getElementById('ai-status-text');
const ghostCursor   = document.getElementById('ai-cursor');
const ghostPopup    = document.getElementById('ghost-popup');
const popupText     = document.getElementById('popup-text');
const hospitalCountDisplay = document.getElementById('hospital-count');
const popupTemplate = document.getElementById('booking-popup-template');
const stateSelect   = document.getElementById('state-select');
const districtSelect = document.getElementById('district-select');
const scoutBtn       = document.getElementById('scout-btn');
const langSelect      = document.getElementById('lang-select');

// --- Session & Language Sync ---
let sessionId = localStorage.getItem('ai_clinic_session') || ('session_' + Math.random().toString(36).substr(2, 9));
localStorage.setItem('ai_clinic_session', sessionId);

let currentLang = localStorage.getItem('ai_clinic_lang') || 'en-US';
if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', () => {
        currentLang = langSelect.value;
        localStorage.setItem('ai_clinic_lang', currentLang);
        if (recognition) recognition.lang = currentLang;
        logToSystem(`<span class="text-slate-400">Language switched to: ${currentLang.split('-')[0].toUpperCase()}</span>`);
    });
}

let hospitals = [];
let hospitalMarkers = [];
let currentDate = new Date();
let lastRequestTime = 0;
const REQUEST_COOLDOWN_MS = 5000;
let pendingBooking = null; // Holds unconfirmed booking until user says 'yes'

const SPECIALTY_COLORS = {
    'Cardiology':   '#ef4444', 
    'Orthopedics':  '#3b82f6', 
    'Pediatrics':   '#ec4899', 
    'Neurology':    '#a855f7', 
    'General':      '#22c55e', 
};

// --- Marker Icon Factories (Inline CSS - Tailwind won't work inside Leaflet) ---
function makeDefaultIcon(color) {
    const c = color || '#2563eb';
    return L.divIcon({
        className: '',
        html: `<div style="
            width:12px; height:12px;
            background:${c};
            border-radius:50%;
            border:2px solid #fff;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        "></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
}

function makeHighlightIcon(color) {
    const c = color || '#2563eb';
    return L.divIcon({
        className: '',
        html: `<div style="position:relative;width:28px;height:28px;">
            <div style="
                position:absolute;top:0;left:0;
                width:28px;height:28px;
                border-radius:50%;
                background:${c};
                opacity:0.2;
                animation: ripple 1.2s ease-out infinite;
            "></div>
            <div style="
                position:absolute;top:6px;left:6px;
                width:16px;height:16px;
                border-radius:50%;
                background:${c};
                border:2px solid #fff;
                box-shadow: 0 0 15px ${c}66;
                animation: coreGlow 1.5s ease-in-out infinite;
            "></div>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

// Inject keyframe CSS for marker animations
const markerStyle = document.createElement('style');
markerStyle.textContent = `
@keyframes coreGlow {
    0%, 100% { box-shadow: 0 0 12px 4px currentColor; transform: scale(1); }
    50%       { box-shadow: 0 0 24px 10px currentColor; transform: scale(1.1); }
}
@keyframes ripple {
    0%   { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(2.8); opacity: 0;   }
}
`;
document.head.appendChild(markerStyle);

// --- Utility ---
function logToSystem(message) {
    const div = document.createElement('div');
    div.innerHTML = message;
    systemLog.appendChild(div);
    systemLog.scrollTop = systemLog.scrollHeight;
}

// --- Magical AI Effects ---
function createSplash(x, y) {
    const splash = document.createElement('div');
    splash.className = 'magical-splash';
    splash.style.left = `${x - 20}px`;
    splash.style.top = `${y - 20}px`;
    document.body.appendChild(splash);
    setTimeout(() => splash.remove(), 600);
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// Client-side symptom → specialty mapping (Saves API quota for instant response)
const SYMPTOM_SPECIALTY_MAP = {
    'chest pain': 'Cardiology',   'chest': 'Cardiology',
    'heart': 'Cardiology',        'cardiac': 'Cardiology',
    'palpitation': 'Cardiology',  'blood pressure': 'Cardiology',
    'hypertension': 'Cardiology', 'breathless': 'Cardiology',
    'shortness of breath': 'Cardiology',
    'headache': 'General',    'migraine': 'General',
    'head': 'General',        'dizzy': 'General',
    'dizziness': 'General',   'vertigo': 'General',
    'seizure': 'General',     'stroke': 'General',
    'memory': 'General',      'fits': 'General',
    'back pain': 'Orthopedics', 'back': 'Orthopedics',
    'bone': 'Orthopedics',      'joint': 'Orthopedics',
    'fracture': 'Orthopedics',  'knee': 'Orthopedics',
    'shoulder': 'Orthopedics',  'spine': 'Orthopedics',
    'son': 'Pediatrics',      'daughter': 'Pediatrics',
    'kid': 'Pediatrics',      'child': 'Pediatrics',
    'baby': 'Pediatrics',     'infant': 'Pediatrics',
    'fever': 'General',       'cold': 'General',
    'flu': 'General',         'cough': 'General',
    'stomach': 'General',     'sick': 'General',
    'pain': 'General',        'dying': 'General',
    'hurt': 'General',        'ache': 'General'
};

function detectSymptomSpecialty(text) {
    const lower = text.toLowerCase();
    for (const [keyword, specialty] of Object.entries(SYMPTOM_SPECIALTY_MAP)) {
        if (lower.includes(keyword)) return specialty;
    }
    return null;
}

function showGhostPopup(text, isError = false) {
    popupText.textContent = text;
    if (isError) {
        ghostPopup.style.background = '#ef4444';
        ghostPopup.style.borderColor = '#fee2e2';
    } else {
        ghostPopup.style.background = '#2563eb';
        ghostPopup.style.borderColor = '#dbeafe';
    }
    ghostPopup.classList.add('popup-show');
    setTimeout(() => ghostPopup.classList.remove('popup-show'), 3200);
}

function updateDbUI(name, time, dateStr, token, patient) {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;padding:8px 10px;border-radius:12px;margin-bottom:6px;';
    
    const tokenDisplay = token || 'DOC-MAP';
    const patientDisplay = patient || 'Emma (Demo)';

    div.innerHTML = `
        <div>
            <div style="color:#1e293b;font-weight:700;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;">${name || 'Hospital'}</div>
            <div style="color:#64748b;font-size:9px;">Patient: ${patientDisplay} | ${dateStr}</div>
        </div>
        <div style="text-align:right;">
            <div style="font-family:monospace;font-size:11px;color:#1e293b;font-weight:bold;">${time}</div>
            <div style="font-size:8px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:0 6px;border-radius:6px;margin-top:2px;font-weight:bold;">${tokenDisplay}</div>
        </div>
    `;
    dbStatusList.insertBefore(div, dbStatusList.firstChild);
}

// --- Cursor ---
function moveCursorToLatLng(latlng) {
    return new Promise((resolve) => {
        const point = map.latLngToContainerPoint(latlng);
        ghostCursor.classList.remove('opacity-0');
        ghostCursor.style.left = `${point.x}px`;
        ghostCursor.style.top = `${point.y + 76}px`; // offset for nav bar

        const moveHandler = () => {
            const p2 = map.latLngToContainerPoint(latlng);
            ghostCursor.style.left = `${p2.x}px`;
            ghostCursor.style.top = `${p2.y + 76}px`;
        };
        map.on('move', moveHandler);
        setTimeout(() => { map.off('move', moveHandler); resolve(); }, 900);
    });
}

function hideCursor() {
    ghostCursor.classList.add('opacity-0');
}

// --- Static Hospital Fetch ---
async function fetchHospitals(grid = "Bangalore") {
    logToSystem(`Scanning for nodes in grid: ${grid}...`);
    if (hospitalCountDisplay) hospitalCountDisplay.textContent = '…';

    try {
        // Filter from static array instead of network fetch
        hospitals = ALL_STATIC_HOSPITALS.filter(h => h.grid.toLowerCase() === grid.toLowerCase());

        if (hospitalCountDisplay) hospitalCountDisplay.textContent = hospitals.length;
        logToSystem(`<span style="color:#22c55e;">Uplink secured. System has mapped ${hospitals.length} static hospitals in this grid.</span>`);
        renderMarkers(hospitals);

    } catch (e) {
        logToSystem(`<span style="color:#ef4444;">Database link failed: ${e.message}</span>`);
        if (hospitalCountDisplay) hospitalCountDisplay.textContent = '0';
        hospitals = []; 
    }
}

function renderMarkers(hospitalArray) {
    hospitalMarkers.forEach(m => map.removeLayer(m));
    hospitalMarkers = [];

    hospitalArray.forEach(hosp => {
        const color = SPECIALTY_COLORS[hosp.specialty] || '#22c55e';
        const marker = L.marker([hosp.lat, hosp.lon], { icon: makeDefaultIcon(color) }).addTo(map);

        // Build popup from template
        const popupContent = document.importNode(popupTemplate.content, true);
        const nameEl = popupContent.querySelector('.hospital-name');
        if (nameEl) nameEl.childNodes[nameEl.childNodes.length - 1].textContent = hosp.name;
        
        const specEl = popupContent.querySelector('.hospital-specialty');
        // Include doctor name if available
        if (specEl) specEl.textContent = `${hosp.specialty} | ${hosp.doctor || 'On-Call specialist'}`;
        
        const dateEl = popupContent.querySelector('.popup-date-val');
        if (dateEl) dateEl.textContent = formatDate(currentDate);

        // Bind booking slot clicks
        const slotBtns = popupContent.querySelectorAll('.slot-btn');
        slotBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const timeStr = e.target.dataset.time;
                const dateStr = formatDate(currentDate);
                
                // Show loading state
                e.target.textContent = '...SAVING';
                e.target.disabled = true;

                try {
                    const patientName = "Emma (Demo)";
                    const bookRes = await fetch('/api/book', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            doctor: hosp.doctor || hosp.name, // Link to specific doctor for persistence
                            date: dateStr,
                            time: timeStr,
                            patient_name: patientName,
                            hospital: hosp.name // Supplementary info
                        })
                    });
                    
                    if (bookRes.ok) {
                        const bData = await bookRes.json();
                        const token = bData.token || "SECURED";
                        
                        e.target.textContent = '✓ SECURED';
                        e.target.style.background = 'rgba(8,145,178,0.3)';
                        e.target.style.borderColor = '#22d3ee';
                        e.target.style.color = '#22d3ee';
                        
                        const rect = e.target.getBoundingClientRect();
                        createSplash(rect.left + rect.width / 2, rect.top + rect.height / 2);

                        showGhostPopup(`Node Secured: ${hosp.name} @ ${timeStr}`);
                        updateDbUI(hosp.name, timeStr, dateStr, token, patientName);
                        logToSystem(`Log: ${token} mapped to ${hosp.name}.`);
                    } else {
                        throw new Error("Server rejected booking");
                    }
                } catch (err) {
                    console.error(err);
                    e.target.textContent = 'ERROR';
                    e.target.disabled = false;
                    showGhostPopup("Failed to save booking. Please try again.", true);
                }
            });
        });

        const container = document.createElement('div');
        container.appendChild(popupContent);

        marker.bindPopup(container, {
            maxWidth: 300,
            closeButton: true,
            className: 'custom-leaflet-popup',
            offset: [0, -10]
        });

        marker.hospitalData = hosp;
        marker._defaultColor = color;
        hospitalMarkers.push(marker);
    });
}

function resetMapMarkers() {
    hospitalMarkers.forEach(m => m.setIcon(makeDefaultIcon(m._defaultColor)));
}

// --- Voice AI Setup ---
let recognizing = false;
let recognition;
const synth = window.speechSynthesis;
let isManualStop = true;
let hasGreeted = false;
let selectedVoice = null;

// Load voices and prefer a female English one
function loadVoice() {
    const voices = synth.getVoices();
    // Prefer: Google UK English Female > Microsoft Zira > any female en-US/en-GB
    const preferred = [
        'Google UK English Female',
        'Microsoft Zira Desktop',
        'Microsoft Zira - English (United States)',
        'Karen',
        'Samantha',
        'Victoria',
        'Moira',
    ];
    for (const name of preferred) {
        const v = voices.find(v => v.name === name);
        if (v) { selectedVoice = v; break; }
    }
    // Fallback: any female-sounding en voice
    if (!selectedVoice) {
        selectedVoice = voices.find(v =>
            v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('woman'))
        ) || voices.find(v => v.lang.startsWith('en')) || null;
    }
}
synth.onvoiceschanged = loadVoice;
loadVoice();

function setAIState(state, msg) {
    if (!aiRing) return;
    aiRing.className = 'ai-ring ' + state;
    if (aiCore) aiCore.className = 'ai-core ' + state;
    if (aiStatusText) {
        aiStatusText.textContent = msg || ({
            listening: 'Listening',
            thinking:  'Processing',
            executing: 'Executing',
        }[state] || 'Standby');
    }
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => { recognizing = true; setAIState('listening'); };

    recognition.onend = () => {
        recognizing = false;
        if (isManualStop || synth.speaking) return;
        // Auto-restart if always-on is active
        if (!isManualStop) {
            try { recognition.start(); } catch(e) {}
        }
    };

    recognition.onresult = (event) => {
        let transcript = '';
        let confidence = 0;
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                transcript += event.results[i][0].transcript;
                confidence = event.results[i][0].confidence;
            }
        }
        
        const clean = transcript.trim();
        if (clean) {
            // --- NOISE GATE ---
            if (confidence < 0.2 && clean.length < 3) {
                console.log(`[Noise Gate] Discarded: "${clean}" (${(confidence*100).toFixed(1)}%)`);
                return;
            }
            
            try { recognition.stop(); } catch(e) {}
            handleVoiceInput(clean);
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        if (event.error === 'not-allowed') {
            logToSystem('<span style="color:#f87171;">Mic blocked. Please allow browser permissions.</span>');
            isManualStop = true;
        }
    };
} else {
    logToSystem('<span style="color:#f87171;">Speech recognition unsupported.</span>');
}

micBtn.addEventListener('click', () => {
    if (recognizing || !isManualStop) {
        isManualStop = true;
        try { recognition.stop(); } catch(e) {}
        synth.cancel();
        setAIState('idle', 'WAITING FOR VOCAL INPUT');
        return;
    }
    isManualStop = false;
    synth.cancel();
    try { recognition.start(); } catch(e) {}
});

function speakAI(text, callback) {
    if (!text) { if (callback) callback(); return; }
    logToSystem(`<span style="color:#f472b6;">AI: "${text}"</span>`);
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utt.voice = selectedVoice;
    utt.rate  = 1.05;
    utt.pitch = 1.2; // Higher pitch = more feminine
    utt.volume = 1.0;
    utt.onend   = () => { if (callback) callback(); };
    utt.onerror = () => { if (callback) callback(); };
    synth.speak(utt);
}

// Handle voice input from user
async function handleVoiceInput(text) {
    logToSystem(`User: "${text}"`);
    const t = text.toLowerCase();

    // --- PENDING CONFIRMATION INTERCEPT ---
    // Improved for multilingual confirmations
    const isConfirm = /^(yes|confirm|okay|ok|sure|go ahead|do it|book it|proceed|sari|hudu|hownu|ಸರಿ|ಹೌದು|ಖಚಿತಪಡಿಸು)/i.test(t);
    const isCancel  = /^(no|cancel|stop|never mind|forget|beda|ಬೇಡ|ಆಗಲ್ಲ)/i.test(t);

    if (pendingBooking && isConfirm) {
        logToSystem(`<span style="color:#22d3ee;">Confirming pending booking...</span>`);
        const pb = pendingBooking;
        pendingBooking = null;
        await completePendingBooking(pb);
        return;
    }
    if (pendingBooking && isCancel) {
        pendingBooking = null;
        speakAI("Got it, I've cancelled that booking request. How else can I help?", () => {
            if (!isManualStop) try { recognition.start(); } catch(e) {}
        });
        return;
    }

    // ---- CLIENT-SIDE COOLDOWN CHECK ----
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_COOLDOWN_MS) {
        const remaining = Math.ceil((REQUEST_COOLDOWN_MS - (now - lastRequestTime)) / 1000);
        speakAI(`Just a moment, give me ${remaining} more seconds.`, () => {
            if (!isManualStop) try { recognition.start(); } catch(e) {}
        });
        return;
    }

    // ---- CLIENT-SIDE SYMPTOM SHORTCUT ----
    // Only use local mapping if the user ISN'T trying to book/cancel/etc.
    const isBookingIntent = text.toLowerCase().match(/book|appoint|reserve|slot|time|cancel|remove|delete/);
    const clientSpecialty = !isBookingIntent ? detectSymptomSpecialty(text) : null;
    
    if (clientSpecialty) {
        const empathy = text.toLowerCase().match(/son|daughter|kid|child|baby|infant/) 
            ? `Oh, I hope they feel better soon!` 
            : `Oh, I'm sorry to hear that.`;
        speakAI(`${empathy} I'll highlight ${clientSpecialty} specialists near you right now.`, () => {
            if (!isManualStop) try { recognition.start(); } catch(e) {}
        });
        logToSystem(`Client matched specialty: ${clientSpecialty}`);
        await filterAndHighlight(clientSpecialty);
        return;
    }

    // ---- SEND TO GEMINI ----
    setAIState('thinking', 'Processing…');
    lastRequestTime = Date.now();

    try {
        const res = await fetch('/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text, 
                session_id: sessionId,
                lang: currentLang 
            })
        });
        const data = await res.json();

        // Always speak the response naturally — even for 'none'
        if (data.action === 'none') {
            speakAI(data.spoken_response || "Could you say that again?", () => {
                setAIState('idle', 'STANDBY');
                if (!isManualStop) try { recognition.start(); } catch(e) {}
            });
            return;
        }

        await executeMapAction(data);
    } catch (err) {
        console.error(err);
        const phrases = [
            "Hmm, I had a little trouble there. Could you try again?",
            "Sorry about that — could you repeat it?",
            "I missed that one! Say it again?"
        ];
        speakAI(phrases[Math.floor(Math.random() * phrases.length)], () => {
            setAIState('idle', 'STANDBY');
            if (!isManualStop) try { recognition.start(); } catch(e) {}
        });
    }
}

// Show the confirmation card with booking details
function showConfirmationCard(details) {
    const card = document.getElementById('booking-confirm-card');
    if (!card) return;
    document.getElementById('card-doctor').textContent   = details.doctor   || '—';
    document.getElementById('card-hospital').textContent = details.hospital  || '—';
    document.getElementById('card-date').textContent     = details.date      || '—';
    document.getElementById('card-time').textContent     = details.time      || '—';
    document.getElementById('card-patient').textContent  = details.patient   || 'Emma (Demo)';
    document.getElementById('card-token').textContent    = details.token     || '—';
    document.getElementById('card-email-status').textContent = '📧 Sending confirmation email...';
    document.getElementById('card-email-status').style.color = '#94a3b8';

    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';

    // Send email
    fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            to:       'yyashas209@gmail.com',
            doctor:   details.doctor,
            hospital: details.hospital,
            date:     details.date,
            time:     details.time,
            token:    details.token,
            patient:  details.patient || 'Emma (Demo)'
        })
    }).then(r => r.json()).then(res => {
        const el = document.getElementById('card-email-status');
        if (res.status === 'sent') {
            el.textContent = '✅ Confirmation emailed to yyashas209@gmail.com';
            el.style.color = '#34d399';
        } else {
            el.textContent = '⚠️ Email failed (demo mode)';
            el.style.color = '#fbbf24';
        }
    }).catch(() => {
        document.getElementById('card-email-status').textContent = '⚠️ Email failed (demo mode)';
    });
}

// Complete a pending booking that was awaiting user confirmation
async function completePendingBooking(pb) {
    setAIState('executing', 'Securing appointment…');
    try {
        const bookRes = await fetch('/api/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doctor: pb.doctor, time: pb.time,
                date: pb.date, patient_name: pb.patient || 'Emma (Demo)'
            })
        });
        if (bookRes.ok) {
            const bData = await bookRes.json();
            const token = bData.token || 'SECURED';
            showConfirmationCard({ ...pb, token });
            logToSystem(`<span style="color:#22d3ee;">✅ Booking confirmed: ${token}</span>`);
            speakAI(`Your appointment is confirmed. Token is ${token}. A confirmation email has been sent!`, () => {
                setAIState('idle', 'STANDBY');
                if (!isManualStop) try { recognition.start(); } catch(e) {}
            });
            updateDbUI(pb.doctor, pb.time, pb.date, token, pb.patient || 'Emma (Demo)');
        } else {
            speakAI(`I'm sorry, the booking system returned an error. Please try again.`, () => {
                setAIState('idle', 'STANDBY');
            });
        }
    } catch(e) {
        console.error(e);
        speakAI('Connection error during booking. Please try again.', () => setAIState('idle', 'STANDBY'));
    }
}

// Filter map markers by specialty and fly to them
async function filterAndHighlight(specialty) {
    setAIState('executing', 'Filtering nodes…');
    resetMapMarkers();

    const matched = hospitalMarkers.filter(m =>
        !specialty || m.hospitalData.specialty.toLowerCase() === specialty.toLowerCase()
    );

    logToSystem(`Highlighted ${matched.length} ${specialty} nodes.`);

    if (matched.length > 0) {
        matched.forEach(m => m.setIcon(makeHighlightIcon('#22d3ee')));
        const group = L.featureGroup(matched);
        map.flyToBounds(group.getBounds(), { padding: [80, 80], duration: 1.5 });
        if (hospitalCountDisplay) hospitalCountDisplay.textContent = matched.length;

        await new Promise(r => setTimeout(r, 1600));
        if (matched[0]) {
            await moveCursorToLatLng(matched[0].getLatLng());
            matched[0].openPopup();
        }
    } else {
        if (hospitalCountDisplay) hospitalCountDisplay.textContent = '0';
        logToSystem('<span style="color:#fbbf24;">No matches found for this specialty.</span>');
        speakAI(`I'm sorry, I couldn't find any ${specialty} hospitals nearby right now. Would you like me to show all hospitals instead?`, () => {
            if (!isManualStop) try { recognition.start(); } catch(e) {}
        });
    }

    setAIState('idle', 'STANDBY');
    setTimeout(hideCursor, 3000);
    if (!isManualStop) try { recognition.start(); } catch(e) {}
}

// Execute complex AI-driven actions
async function executeMapAction(data) {
    const { action, specialty, doctor, date, time, region, spoken_response } = data;
    logToSystem(`Intent: ${action}${region ? ' @ ' + region : ''}`);
    setAIState('executing', 'Executing…');

    let speakDone = false, actionDone = false;

    function checkFinish() {
        if (!speakDone || !actionDone) return;
        if (!isManualStop) {
            setAIState('idle', 'Listening…');
            try { recognition.start(); } catch(e) {}
        } else {
            setTimeout(hideCursor, 2500);
        }
    }

    // --- SEQUENTIAL EXECUTION FOR REGION & FILTER ---
    speakAI(spoken_response, () => { speakDone = true; checkFinish(); });

    try {
        if (region) {
            const regionCoords = {
                "Bangalore": [12.9716, 77.5946],
                "Mumbai": [19.0760, 72.8777],
                "Shivamogga": [13.9299, 75.5681]
            };
            const coords = regionCoords[region];
            if (coords) {
                logToSystem(`Switching HQ to ${region}...`);
                map.flyTo(coords, 13, { duration: 1.5 });
                await fetchHospitals(region);
                await new Promise(r => setTimeout(r, 1600));
            }
        }

        if (action === 'switch_region' || action === 'filter_doctors') {
            await filterAndHighlight(specialty);
        } else if (action === 'book_appointment' || action === 'highlight_calendar') {
            if (date) currentDate = new Date(date);

            // Find best marker target by specialty or by doctor name
            let targetMarker = doctor
                ? hospitalMarkers.find(m => m.hospitalData.doctor === doctor)
                : null;
            if (!targetMarker && specialty) {
                targetMarker = hospitalMarkers.find(m => m.hospitalData.specialty === specialty);
            }
            if (!targetMarker) targetMarker = hospitalMarkers[0];

            if (targetMarker) {
                resetMapMarkers();
                targetMarker.setIcon(makeHighlightIcon('#22d3ee'));
                map.flyTo(targetMarker.getLatLng(), 16, { duration: 1.0 });
                await new Promise(r => setTimeout(r, 1300));

                const popupDateEl = targetMarker.getPopup().getElement()?.querySelector('.popup-date-val');
                if (popupDateEl) popupDateEl.textContent = formatDate(currentDate);
                targetMarker.openPopup();
                await moveCursorToLatLng(targetMarker.getLatLng());

                if (action === 'book_appointment') {
                    const bookTime = time || '9:00 AM';
                    const bookDate = formatDate(currentDate);
                    const bookDoc  = targetMarker.hospitalData.doctor || doctor || 'Specialist';
                    const bookHosp = targetMarker.hospitalData.name;

                    // Store as pending — wait for user to say "yes/confirm"
                    pendingBooking = {
                        doctor:   bookDoc,
                        hospital: bookHosp,
                        time:     bookTime,
                        date:     bookDate,
                        patient:  'Emma (Demo)'
                    };

                    logToSystem(`<span style="color:#facc15;">⏳ Pending confirmation for ${bookDoc} @ ${bookTime}</span>`);
                    speakAI(`I've found ${bookDoc} at ${bookHosp} for ${bookTime} on ${bookDate}. Shall I confirm this booking?`, () => {
                        speakDone = true; checkFinish();
                        if (!isManualStop) try { recognition.start(); } catch(e) {}
                    });
                }
            }
        }
    } catch(e) {
        console.error(e);
        logToSystem('<span style="color:#f87171;">Execution error.</span>');
    }

    actionDone = true;
    checkFinish();
}

// --- Regional Scouting Logic ---
function populateStates() {
    for (const state in LOCATION_DATA) {
        const opt = document.createElement('option');
        opt.value = state;
        opt.textContent = state;
        stateSelect.appendChild(opt);
    }
}

stateSelect.addEventListener('change', () => {
    const state = stateSelect.value;
    districtSelect.innerHTML = '<option value="">Select Grid (District)</option>';
    if (state) {
        LOCATION_DATA[state].forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            districtSelect.appendChild(opt);
        });
        districtSelect.disabled = false;
    } else {
        districtSelect.disabled = true;
    }
    scoutBtn.disabled = true;
});

districtSelect.addEventListener('change', () => {
    scoutBtn.disabled = !districtSelect.value;
});

scoutBtn.addEventListener('click', async () => {
    const state = stateSelect.value;
    const district = districtSelect.value;
    if (!state || !district) return;

    scoutBtn.textContent = 'LOCATING...';
    scoutBtn.disabled = true;
    logToSystem(`<span style="color:#a855f7;">Initiating regional geocode for ${district}, ${state}...</span>`);

    try {
        const query = encodeURIComponent(`${district}, ${state}, India`);
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`);
        const geoData = await geoRes.json();

        if (geoData && geoData.length > 0) {
            const lat = parseFloat(geoData[0].lat);
            const lon = parseFloat(geoData[0].lon);

            map.flyTo([lat, lon], 13, { duration: 1.8 });
            await new Promise(r => setTimeout(r, 2000));
            
            // Pass the district as the grid name for filtering
            await fetchHospitals(district);
        } else {
            throw new Error("Target region not found in satellite database.");
        }
    } catch (e) {
        logToSystem(`<span style="color:#ef4444;">Scout Protocol Error: ${e.message}</span>`);
    } finally {
        scoutBtn.textContent = 'Execute Scout';
        scoutBtn.disabled = false;
    }
});

// --- Boot ---
setTimeout(async () => {
    logToSystem('<span style="color:#22d3ee;font-weight:bold;">[System v2.0] Core Online.</span>');
    logToSystem('Overpass API link ready.');
    logToSystem('<span style="color:#facc15;">➜ Click anywhere to activate DocVoice AI.</span>');
    populateStates();
    
    // Handle URL Parameters for Redirects
    const params = new URLSearchParams(window.location.search);
    const urlRegion = params.get('region');
    const urlSpec = params.get('specialty');
    
    if (urlRegion || urlSpec) {
        logToSystem(`Deep Link Detected: ${urlRegion || ''} ${urlSpec || ''}`);
        await executeMapAction({
            action: urlSpec ? 'filter_doctors' : 'switch_region',
            region: urlRegion || "Shivamogga",
            specialty: urlSpec,
            spoken_response: `Welcome to the map. Showing ${urlSpec || 'all'} specialists in ${urlRegion || 'Shivamogga'}.`
        });
    } else {
        await fetchHospitals("Shivamogga"); // Default
    }
}, 100);

document.body.addEventListener('click', () => {
    if (hasGreeted) return;
    hasGreeted = true;
    
    // Clear standby text
    if (aiStatusText) aiStatusText.textContent = "Listening";

    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    
    speakAI(`${greet}! DocVoice map uplink is now active. How can I help you today?`, () => {
        if (recognition) {
            isManualStop = false;
            try { recognition.start(); } catch(e) {}
            setAIState('listening');
        }
    });
});
