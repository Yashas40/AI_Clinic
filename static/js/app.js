document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let recognizing = false;
    let recognition;
    let synth = window.speechSynthesis;
    let fallbackTimer;
    let isManualStop = true;
    let hasGreeted = false;
    let lastRequestTime = 0;
    const REQUEST_COOLDOWN_MS = 5000;
    let selectedVoice = null;
    let currentDate = new Date();
    let currentDoctor = 'Dr. Sharma'; // Default selected doctor
    let currentSpeechLang = 'en-US'; // Default language
    const sessionID = 'sess_' + Math.random().toString(36).substr(2, 9); // session for history

    // --- DOM Elements ---
    const emmaAvatar = document.getElementById('emma-avatar');
    const aiStatusText = document.getElementById('ai-status-text');
    const statusDot = aiStatusText ? aiStatusText.previousElementSibling : null;
    const aiWave = document.getElementById('ai-wave');
    const aiCoreBall = document.getElementById('ai-core-ball');
    const systemLog = document.getElementById('system-log');
    const ghostCursor = document.getElementById('ai-cursor');
    const calendarDoctorName = document.getElementById('calendar-doctor-name');
    const bookSlotBtn = document.getElementById('book-slot-btn');
    const slotGrid = document.getElementById('slot-grid');
    const display = document.getElementById('calendar-date-display');
    const grid = document.getElementById('calendar-grid');

    // --- Voice Setup ---
    function loadVoice() {
        const voices = synth.getVoices();
        // Priority list including regional voices
        const preferred = [
            'Google UK English Female', 'Microsoft Zira Desktop', 'Samantha', 
            'Google हिन्दी', 'Microsoft Hemant', 'Microsoft Kalpana',
            'Microsoft Valluvar' // Close enough if Kannada specific isn't found, though browsers vary
        ];
        for (const name of preferred) {
            const v = voices.find(v => v.name.includes(name));
            if (v) { selectedVoice = v; break; }
        }
    }
    synth.onvoiceschanged = loadVoice;
    loadVoice();

    // --- Helper Functions ---
    function logToSystem(message) {
        if (!systemLog) return;
        const div = document.createElement('div');
        div.className = 'log-item';
        div.innerHTML = message;
        systemLog.appendChild(div);
        
        // Use requestAnimationFrame for smoother auto-scroll after render
        requestAnimationFrame(() => {
            systemLog.scrollTop = systemLog.scrollHeight;
        });
    }

    function formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    function setAIState(state, message) {
        if (!aiStatusText) return;
        if (state === 'listening') {
            aiStatusText.textContent = "AI Listening...";
            aiStatusText.className = 'text-xs uppercase tracking-widest text-[#3B82F6] font-bold';
            if (statusDot) statusDot.className = 'w-3 h-3 rounded-full bg-[#3B82F6] animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.4)]';
            if (aiCoreBall) aiCoreBall.className = 'magical-ball top-4 right-4 listening';
            if (aiWave) aiWave.style.opacity = '0';
        } else if (state === 'thinking') {
            aiStatusText.textContent = "AI Thinking...";
            aiStatusText.className = 'text-xs uppercase tracking-widest text-[#EAB308] font-bold';
            if (statusDot) statusDot.className = 'w-3 h-3 rounded-full bg-[#EAB308] animate-bounce shadow-[0_0_12px_rgba(234,179,8,0.4)]';
            if (aiCoreBall) aiCoreBall.className = 'magical-ball top-4 right-4 thinking';
            if (aiWave) aiWave.style.opacity = '0';
        } else if (state === 'executing') {
            aiStatusText.textContent = "AI Working...";
            aiStatusText.className = 'text-xs uppercase tracking-widest text-[#10B981] font-bold';
            if (statusDot) statusDot.className = 'w-3 h-3 rounded-full bg-[#10B981] animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.4)]';
            if (aiCoreBall) aiCoreBall.className = 'magical-ball top-4 right-4 working';
            if (aiWave) aiWave.style.opacity = '1';
        } else {
            aiStatusText.textContent = message || "AI Standby";
            aiStatusText.className = 'text-xs uppercase tracking-widest text-[#6B7280] font-bold';
            if (statusDot) statusDot.className = 'w-3 h-3 rounded-full bg-slate-200';
            if (aiCoreBall) aiCoreBall.className = 'magical-ball top-4 right-4';
            if (aiWave) aiWave.style.opacity = '0';
        }
    }

    async function moveCursorTo(element) {
        if (!ghostCursor || !element) return;
        const rect = element.getBoundingClientRect();
        const x = rect.left + (rect.width / 2);
        const y = rect.top + (rect.height / 2);
        ghostCursor.classList.remove('opacity-0');
        ghostCursor.style.left = `${x}px`;
        ghostCursor.style.top = `${y}px`;
        return new Promise(r => setTimeout(r, 900));
    }

    function hideCursor() {
        if (ghostCursor) ghostCursor.classList.add('opacity-0');
    }

    // --- Calendar & Slots ---
    function renderCalendar() {
        if (!grid || !display) return;
        display.textContent = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        grid.innerHTML = '';
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const div = document.createElement('div');
            div.className = 'calendar-day empty';
            grid.appendChild(div);
        }
        for (let i = 1; i <= daysInMonth; i++) {
            const div = document.createElement('div');
            const isToday = i === new Date().getDate() && month === new Date().getMonth();
            const isSelected = i === currentDate.getDate();
            div.className = `calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`;
            div.textContent = i;
            div.onclick = () => {
                currentDate.setDate(i);
                renderCalendar();
                refreshSlots(formatDate(currentDate));
            };
            grid.appendChild(div);
        }
    }

    async function refreshSlots(dateStr) {
        if (!slotGrid) return;
        slotGrid.innerHTML = '<div class="col-span-full py-4 text-center text-xs animate-pulse text-slate-400">Scanning availability...</div>';
        try {
            const res = await fetch(`/api/slots?date=${dateStr}&doctor=${encodeURIComponent(currentDoctor)}`);
            const bookedTimes = await res.json();
            slotGrid.innerHTML = '';
            for (let h = 9; h < 16; h++) {
                for (let m = 0; m < 60; m += 15) {
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    let displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
                    const displayM = m === 0 ? '00' : m;
                    const timeStr = `${displayH}:${displayM} ${ampm}`;
                    const slot = document.createElement('div');
                    slot.className = 'slot-item';
                    slot.textContent = timeStr;
                    if (bookedTimes.includes(timeStr)) {
                        slot.classList.add('booked');
                    } else {
                        slot.onclick = () => {
                            document.querySelectorAll('.slot-item').forEach(s => s.classList.remove('selected'));
                            slot.classList.add('selected');
                            window.selectedSlotTime = timeStr;
                        };
                    }
                    slotGrid.appendChild(slot);
                }
            }
        } catch (e) { slotGrid.innerHTML = 'Error loading slots.'; }
    }

    // --- Modal Management ---
    window.openModal = function(htmlContent) {
        const container = document.getElementById('modal-container');
        const content = document.getElementById('modal-content');
        if (container && content) {
            content.innerHTML = htmlContent;
            container.classList.add('active');
        }
    };
    window.closeModal = function() {
        const container = document.getElementById('modal-container');
        if (container) container.classList.remove('active');
    };

    window.openSpecialistsModal = function() {
        const specialists = [
            { name: 'Dr. Sharma', specialty: 'Orthopedics', desc: 'Expert in bone injuries and chronic back pain.', img: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=200&h=200' },
            { name: 'Dr. Gupta', specialty: 'Cardiology', desc: 'Renowned heart specialist focusing on hypertension.', img: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=200&h=200' },
            { name: 'Dr. Arjun Reddy', specialty: 'Pediatrics', desc: 'Compassionate care for infants and children.', img: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=200&h=200' },
            { name: 'Dr. Vivek Jawali', specialty: 'Cardiac Surgery', desc: 'Voted top surgeon for bypass and valve replacement.', img: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=200&h=200' },
            { name: 'Dr. Akshay Raut', specialty: 'Sports Medicine', desc: 'Specialist in athletic injuries and fast-track recovery.', img: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=200&h=200' }
        ];
        let html = `
            <div class="p-2">
                <h2 class="text-2xl font-black mb-1 text-slate-800 tracking-tight">Meet Our Specialists</h2>
                <p class="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">Expert Medical Panel</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
        specialists.forEach(doc => {
            html += `
                <div class="p-5 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all group">
                    <div class="flex gap-4 items-center mb-4">
                        <img src="${doc.img}" class="w-16 h-16 rounded-2xl object-cover shadow-md group-hover:scale-105 transition-transform">
                        <div>
                            <h3 class="font-bold text-slate-800 text-lg leading-tight">${doc.name}</h3>
                            <p class="text-[10px] font-black text-blue-500 uppercase tracking-widest">${doc.specialty}</p>
                        </div>
                    </div>
                    <p class="text-sm text-slate-500 mb-5 leading-relaxed">${doc.desc}</p>
                    <button onclick="window.handleDoctorSelect('${doc.name}'); closeModal();" class="w-full bg-[#f8fafc] border border-slate-100 py-3 rounded-2xl font-bold text-slate-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all text-xs tracking-wider uppercase">Select Specialist</button>
                </div>`;
        });
        html += `</div></div>`;
        openModal(html);
    };

    window.handleDoctorSelect = function(name) {
        currentDoctor = name;
        if (calendarDoctorName) calendarDoctorName.textContent = name;
        logToSystem(`Selected Specialist: ${currentDoctor}`);
        
        // Highlight in grid
        document.querySelectorAll('.specialist-card').forEach(card => {
            const h4 = card.querySelector('h4');
            if (h4 && (h4.textContent === name || h4.textContent === name.split(' ').pop())) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });

        const portraitMap = {
            'Dr. Sharma': 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=200&h=200',
            'Dr. Gupta': 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=200&h=200',
            'Dr. Arjun Reddy': 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=200&h=200',
            'Dr. Vivek Jawali': 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=200&h=200',
            'Dr. Akshay Raut': 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=200&h=200'
        };
        const img = document.getElementById('booking-doctor-img');
        if (img && portraitMap[name]) {
            img.src = portraitMap[name];
            img.classList.add('object-cover');
        }
        refreshSlots(formatDate(currentDate));
    };

    window.openAppointmentsModal = async function() {
        try {
            // Fetch real history from DB instead of just session
            const res = await fetch('/api/history');
            const data = await res.json();
            let html = `<h2 class="text-2xl font-bold mb-6 text-slate-800">Your Secured Appointments</h2>`;
            if (!data || data.length === 0) {
                html += `<div class="text-center py-12"><p class="text-slate-400">No appointments found in the system.</p></div>`;
            } else {
                html += `<div class="space-y-3 max-h-[400px] overflow-y-auto pr-2">`;
                data.forEach(appt => {
                    html += `
                        <div class="p-4 bg-white border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                            <div>
                                <div class="font-bold text-slate-800 text-sm">${appt.doctor}</div>
                                <div class="text-[10px] text-slate-400 uppercase tracking-widest font-bold">${appt.date} @ ${appt.time}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md font-bold uppercase tracking-tighter">${appt.token}</div>
                                <div class="text-[9px] text-emerald-500 font-bold mt-1">Confirmed</div>
                            </div>
                        </div>`;
                });
                html += `</div>`;
            }
            openModal(html);
        } catch(e) { 
            console.error(e);
            openModal("Error loading history from database."); 
        }
    };

    window.openProfileModal = function() {
        const profileHtml = `
            <div class="max-w-2xl">
                <div class="flex gap-6 items-center mb-10 pb-10 border-b border-slate-50">
                    <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200&h=200" class="w-32 h-32 rounded-[2.5rem] object-cover shadow-2xl border-4 border-white">
                    <div>
                        <h2 class="text-3xl font-black text-slate-800 tracking-tight mb-1">Emma Richards</h2>
                        <p class="text-blue-500 font-bold tracking-widest uppercase text-xs">Premium Member • ID: DV-9921</p>
                        <div class="flex gap-2 mt-4">
                            <span class="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-lg border border-emerald-100 uppercase tracking-wider">Verified</span>
                            <span class="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg border border-blue-100 uppercase tracking-wider">Health A+</span>
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-3 gap-4 mb-8">
                    <div class="p-4 rounded-3xl bg-slate-50 border border-slate-100 text-center">
                        <div class="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">Blood Group</div>
                        <div class="text-xl font-black text-slate-800">O+</div>
                    </div>
                    <div class="p-4 rounded-3xl bg-slate-50 border border-slate-100 text-center">
                        <div class="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">Weight</div>
                        <div class="text-xl font-black text-slate-800">54<span class="text-sm ml-0.5 text-slate-400">kg</span></div>
                    </div>
                    <div class="p-4 rounded-3xl bg-slate-50 border border-slate-100 text-center">
                        <div class="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">Height</div>
                        <div class="text-xl font-black text-slate-800">168<span class="text-sm ml-0.5 text-slate-400">cm</span></div>
                    </div>
                </div>

                <div class="space-y-4">
                    <h3 class="font-black text-slate-800 text-sm tracking-widest uppercase">Medical History Overview</h3>
                    <div class="p-5 rounded-3xl border border-slate-100 bg-white shadow-sm flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800">Recent: Cardiology Check</div>
                                <div class="text-[10px] text-slate-400 font-bold uppercase">March 10, 2026 • Dr. Gupta</div>
                            </div>
                        </div>
                        <div class="text-emerald-500 font-black text-xs uppercase tracking-wider">Completed</div>
                    </div>
                    <div class="p-5 rounded-3xl border border-slate-100 bg-white shadow-sm flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center">
                                <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800">Annual Physical Lab Results</div>
                                <div class="text-[10px] text-slate-400 font-bold uppercase">February 28, 2026 • Lab-A</div>
                            </div>
                        </div>
                        <div class="text-blue-500 font-black text-xs uppercase tracking-wider underline cursor-pointer">View PDF</div>
                    </div>
                </div>

                <div class="mt-8 flex gap-3">
                    <button class="flex-1 bg-blue-600 text-white py-4 rounded-[1.25rem] font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-200">Edit Physical Profile</button>
                    <button class="px-6 py-4 rounded-[1.25rem] border border-slate-100 font-black text-xs text-slate-400 uppercase tracking-widest">Settings</button>
                </div>
            </div>`;
        openModal(profileHtml);
    };

    window.changeLang = function(lang) {
        currentSpeechLang = lang;
        if (recognition) {
            recognition.lang = lang;
            if (recognizing) {
                isManualStop = true; // Temporary
                recognition.stop();
                setTimeout(() => {
                    isManualStop = false;
                    recognition.start();
                }, 300);
            }
        }
        // Update UI
        document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
        if (lang === 'en-US') document.getElementById('lang-en').classList.add('active');
        if (lang === 'hi-IN') document.getElementById('lang-hi').classList.add('active');
        if (lang === 'kn-IN') document.getElementById('lang-kn').classList.add('active');
        
        logToSystem(`Language switched to: ${lang.toUpperCase()}`);
    };

    // --- Web Speech DNA ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.onstart = () => { recognizing = true; setAIState('listening'); };
        recognition.onend = () => { recognizing = false; if (!isManualStop && !synth.speaking) try { recognition.start(); } catch(e){} };
        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
            }
            if (transcript.trim().length > 0) {
                try { recognition.stop(); } catch(e){}
                processVoiceCommand(transcript.trim());
            }
        };
    }

    function speakAI(text, callback) {
        if (!text) { if(callback) callback(); return; }
        logToSystem(`<span class="text-pink-500">AI: "${text}"</span>`);
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Match voice to current language if possible
        const voices = synth.getVoices();
        let langVoice = null;
        if (currentSpeechLang.startsWith('hi')) langVoice = voices.find(v => v.lang.startsWith('hi'));
        if (currentSpeechLang.startsWith('kn')) langVoice = voices.find(v => v.lang.startsWith('kn'));
        
        utterance.voice = langVoice || selectedVoice;
        utterance.onstart = () => emmaAvatar.classList.add('emma-speaking');
        utterance.onend = () => { emmaAvatar.classList.remove('emma-speaking'); if(callback) callback(); };
        synth.speak(utterance);
    }

    async function processVoiceCommand(text) {
        logToSystem(`User: "${text}"`);
        setAIState('thinking');
        try {
            const res = await fetch('/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, session_id: sessionID, lang: currentSpeechLang })
            });
            const data = await res.json();
            if (data.action === 'none') {
                speakAI(data.spoken_response || "I didn't quite get that.", () => setAIState('idle', 'Doc Emma is listening...'));
                return;
            }
            executeAction(data);
        } catch(e) { speakAI("Server connection lost.", () => setAIState('idle')); }
    }

    async function executeAction(data) {
        const { action, doctor, date, time, spoken_response } = data;
        setAIState('executing');
        
        if (action === 'book_appointment') {
            const docToBook = doctor || currentDoctor;
            const timeToBook = time || window.selectedSlotTime || "10:00 AM";
            const dateToBook = date ? formatDate(new Date(date)) : formatDate(currentDate);

            if (doctor && doctor !== currentDoctor) window.handleDoctorSelect(doctor);
            
            try {
                const bRes = await fetch('/api/book', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ doctor: docToBook, time: timeToBook, date: dateToBook, patient_name: 'Emma (Demo)' })
                });
                if (bRes.ok) {
                    const result = await bRes.json();
                    
                    // Populate and show the glassy confirmation card
                    document.getElementById('card-doctor').textContent = docToBook;
                    document.getElementById('card-date').textContent = dateToBook;
                    document.getElementById('card-time').textContent = timeToBook;
                    document.getElementById('card-patient').textContent = 'Emma (Demo)';
                    document.getElementById('card-token').textContent = result.token || 'TKN-' + Math.floor(1000 + Math.random() * 9000);
                    
                    const confirmCard = document.getElementById('booking-confirm-card');
                    confirmCard.classList.remove('opacity-0', 'pointer-events-none');
                    confirmCard.querySelector('#confirm-card-inner').classList.remove('scale-90');
                    confirmCard.querySelector('#confirm-card-inner').classList.add('scale-100');

                    speakAI(`Confirmed! Your appointment with ${docToBook} is set for ${timeToBook} on ${dateToBook}. I've displayed your appointment card on the screen.`, () => {
                        setAIState('listening');
                        refreshSlots(dateToBook);
                        updatePendingSummary();
                        if (!isManualStop) try { recognition.start(); } catch(e){}
                    });
                }
            } catch(e) { 
                speakAI("Booking failed."); 
                setAIState('listening');
                if (!isManualStop) try { recognition.start(); } catch(e){}
            }
        } else if (action === 'cancel_appointment') {
            try {
                const cRes = await fetch('/api/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ doctor, date, time })
                });
                if (cRes.ok) {
                    speakAI(spoken_response, () => {
                        setAIState('listening');
                        refreshSlots(date || formatDate(currentDate));
                        updatePendingSummary();
                        if (!isManualStop) try { recognition.start(); } catch(e){}
                    });
                }
            } catch(e) {
                speakAI("Cancellation failed.");
                setAIState('listening');
                if (!isManualStop) try { recognition.start(); } catch(e){}
            }
        } else if (action === 'switch_region') {
            speakAI(spoken_response, () => {
                const params = new URLSearchParams();
                if (data.region) params.set('region', data.region);
                if (data.specialty) params.set('specialty', data.specialty);
                window.location.href = `maps.html?${params.toString()}`;
            });
        } else if (action === 'filter_doctors') {
            // Stay on dashboard, select doctor if identified
            if (doctor) {
                // selectDoctor is defined in dashboard.html script block
                if (window.selectDoctor) window.selectDoctor(doctor);
            }
            speakAI(spoken_response, () => {
                setAIState('listening');
                if (!isManualStop) try { recognition.start(); } catch(e){}
            });
        } else {
            speakAI(spoken_response, () => {
                setAIState('listening');
                if (!isManualStop) try { recognition.start(); } catch(e){}
            });
        }
    }

    const micToggleBtn = document.getElementById('mic-toggle-btn');
    const micStatusLabel = document.getElementById('mic-status-label');

    async function updatePendingSummary() {
        const summaryLabel = document.getElementById('pending-summary');
        if (!summaryLabel) return;
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            const count = data.length;
            summaryLabel.textContent = `You have ${count} pending session${count === 1 ? '' : 's'} today.`;
        } catch (e) {
            summaryLabel.textContent = "Unable to fetch schedule.";
        }
    }

    function toggleMic() {
        isManualStop = !isManualStop;
        if (isManualStop) {
            try { recognition.stop(); } catch(e){}
            synth.cancel();
            setAIState('idle', 'Awaken Emma');
            if (micToggleBtn) micToggleBtn.classList.add('muted');
            if (micStatusLabel) {
                micStatusLabel.textContent = 'OFF';
                micStatusLabel.className = 'text-[9px] font-black uppercase tracking-tighter text-red-500';
            }
            logToSystem('<span class="text-slate-400 italic">[System] Manual Pause.</span>');
        } else {
            setAIState('listening');
            try { recognition.start(); } catch(e){}
            if (micToggleBtn) micToggleBtn.classList.remove('muted');
            if (micStatusLabel) {
                micStatusLabel.textContent = 'ON';
                micStatusLabel.className = 'text-[9px] font-black uppercase tracking-tighter text-blue-500';
            }
            logToSystem('<span class="text-blue-400 italic">[System] Manual Resume.</span>');
        }
    }

    if (micToggleBtn) micToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMic();
    });

    // --- Activation ---
    document.body.addEventListener('click', (e) => {
        // Ignore clicks on buttons/modals/nav links to allow normal interaction
        if (e.target.closest('button') || e.target.closest('.modal-content') || e.target.closest('.nav-link') || e.target.closest('.calendar-grid') || e.target.closest('.slot-item')) {
            return;
        }

        // Click anywhere else (Global Activation)
        if (!hasGreeted) {
            hasGreeted = true;
            isManualStop = false; // "Always On" starts here
            if (micToggleBtn) micToggleBtn.classList.remove('muted');
            if (micStatusLabel) micStatusLabel.textContent = 'ON';
            speakAI("Hello! I am Emma, your AI Clinic Assistant. I am listening—how can I help you today?", () => {
                try { recognition.start(); } catch(e){}
            });
        } else if (isManualStop) {
            // If stopped, resume on any screen click
            toggleMic();
        }
    });

    // --- Initialization ---
    renderCalendar();
    refreshSlots(formatDate(currentDate));
    updatePendingSummary();
    logToSystem('<span class="text-blue-500 font-bold">[System] AI Online. Click anywhere to begin.</span>');
});

// 3D Tilt Physics for Components
document.addEventListener('DOMContentLoaded', () => {
    const initTilt = () => {
        const cards = document.querySelectorAll('.js-tilt');
        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const rotateX = ((y - (rect.height / 2)) / (rect.height / 2)) * -10;
                const rotateY = ((x - (rect.width / 2)) / (rect.width / 2)) * 10;
                card.style.transform = `scale(1.05) translateY(-5px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
                card.style.zIndex = '50';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
                card.style.zIndex = '';
            });
        });
    };
    setTimeout(initTilt, 100);
});

// Global Utility Functions
window.copyBookingDetails = function() {
    const doctor = document.getElementById('card-doctor').textContent;
    const date = document.getElementById('card-date').textContent;
    const time = document.getElementById('card-time').textContent;
    const token = document.getElementById('card-token').textContent;
    
    const text = `AI Clinic Appointment:\nDoctor: ${doctor}\nDate: ${date}\nTime: ${time}\nToken: ${token}`;
    
    navigator.clipboard.writeText(text).then(() => {
        const copyBtn = document.querySelector('[onclick="copyBookingDetails()"]');
        if (copyBtn) {
            const oldText = copyBtn.textContent;
            copyBtn.textContent = 'COPIED!';
            setTimeout(() => copyBtn.textContent = oldText, 2000);
        }
        // Use the application's local logToSystem if possible, or just console log if not
        console.log('Appointment details copied to clipboard!');
    });
};
