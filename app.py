import json
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

DB_FILE = 'clinic.db'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    # Unique booking_token added
    c.execute('''
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doctor TEXT, date TEXT, time TEXT, status TEXT,
            booking_token TEXT, patient_name TEXT
        )
    ''')
    # New table for stored hospitals from maps
    c.execute('''
        CREATE TABLE IF NOT EXISTS hospitals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, lat REAL, lon REAL, specialty TEXT,
            last_scanned TEXT
        )
    ''')
    # Migration check for patient_name
    try:
        c.execute('ALTER TABLE appointments ADD COLUMN patient_name TEXT')
    except sqlite3.OperationalError:
        pass # Column already exists
    # Migration check for booking_token
    try:
        c.execute('ALTER TABLE appointments ADD COLUMN booking_token TEXT')
    except sqlite3.OperationalError:
        pass # Column already exists

    conn.commit()
    conn.close()


init_db()

def seed_hospitals():
    """Seed the database with default hospitals if none exist."""
    default_hospitals = [
        ("Apollo Cardiology Centre", 12.9760, 77.5920, "Cardiology"),
        ("Manipal Orthopedic Clinic", 12.9680, 77.6000, "Orthopedics"),
        ("Rainbow Children's Hospital", 12.9700, 77.5850, "Pediatrics"),
        ("NIMHANS Neurology", 12.9430, 77.5910, "Neurology"),
        ("Fortis General Hospital", 12.9800, 77.5950, "General")
    ]
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM hospitals')
    if c.fetchone()[0] == 0:
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M')
        for name, lat, lon, spec in default_hospitals:
            c.execute('INSERT INTO hospitals (name, lat, lon, specialty, last_scanned) VALUES (?,?,?,?,?)',
                      (name, lat, lon, spec, now_str))
        conn.commit()
    conn.close()

seed_hospitals()

# API Keys and Models
KEYS = [
    "AIzaSyCuPhh6n7ujGy8BTbApY2bQ3aH1rFnx4ZI", # Key A
    "AIzaSyDc6kytoxNjjnLnIeZgSgLefqFtN7ygceA",  # Key B
    "AIzaSyC1uty7ehn6T5tVZyN6hg2mvTarmQWf_jw"   # Key C (new)
]

def get_model(key_index=0, model_name='gemini-2.0-flash'):
    genai.configure(api_key=KEYS[key_index % len(KEYS)])
    # Lowering safety thresholds to avoid false positives with regional languages
    safety_settings = [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]
    return genai.GenerativeModel(
        model_name, 
        generation_config={"temperature": 0.4},
        safety_settings=safety_settings
    )

# ── Persistent Context ──────────────────────────────────────────────
SESSION_HISTORY = {} # { session_id: [ {role, parts}, ... ] }
MAX_HISTORY = 5

def get_history(session_id):
    if session_id not in SESSION_HISTORY:
        SESSION_HISTORY[session_id] = []
    return SESSION_HISTORY[session_id]

def add_to_history(session_id, user_text, ai_response_text):
    hist = get_history(session_id)
    hist.append({"role": "user", "content": user_text})
    hist.append({"role": "model", "content": ai_response_text})
    if len(hist) > MAX_HISTORY * 2:
        SESSION_HISTORY[session_id] = hist[-(MAX_HISTORY * 2):]

# ── Static pages ──────────────────────────────────────────────────────
@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/dashboard.html')
def serve_dashboard():
    return app.send_static_file('dashboard.html')

@app.route('/maps.html')
def serve_maps():
    return app.send_static_file('maps.html')

# ── Appointments API ──────────────────────────────────────────────────
@app.route('/api/slots', methods=['GET'])
def get_slots():
    date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    doctor = request.args.get('doctor', 'ALL')
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    if doctor == 'ALL':
        c.execute('SELECT time FROM appointments WHERE date=?', (date,))
    else:
        # Match doctor name specifically to prevent global booking conflict
        c.execute('SELECT time FROM appointments WHERE date=? AND doctor LIKE ?', (date, f"%{doctor}%"))
        
    booked = [r[0] for r in c.fetchall()]
    conn.close()
    return jsonify(booked)

@app.route('/api/book', methods=['POST'])
def book_appointment():
    d = request.json
    doctor = d.get('doctor','Unknown')
    date = d.get('date', datetime.now().strftime('%Y-%m-%d'))
    time = d.get('time','Unknown')
    patient = d.get('patient_name', 'Emma (Demo)') # Default for voice demo
    
    # Generate unique identifier (Token)
    import hashlib
    token = hashlib.md5(f"{doctor}{date}{time}{datetime.now()}".encode()).hexdigest()[:8].upper()
    
    conn = sqlite3.connect(DB_FILE)
    conn.cursor().execute(
        'INSERT INTO appointments (doctor, date, time, status, booking_token, patient_name) VALUES (?,?,?,?,?,?)',
        (doctor, date, time, 'booked', f"DOC-{token}", patient)
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "success", "token": f"DOC-{token}"})

@app.route('/api/cancel', methods=['POST'])
def cancel_booking():
    d = request.json
    doctor, date, time = d.get('doctor',''), d.get('date',''), d.get('time','')
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    if time and time != "any":
        c.execute('DELETE FROM appointments WHERE doctor LIKE ? AND date=? AND time=?', (f'%{doctor}%', date, time))
    else:
        c.execute('DELETE FROM appointments WHERE doctor LIKE ? AND date=?', (f'%{doctor}%', date))
    conn.commit(); conn.close()
    return jsonify({"status": "success"})

@app.route('/api/history', methods=['GET'])
def get_history_api():
    """Returns all stored appointments from the database."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT doctor, date, time, status, booking_token, patient_name FROM appointments ORDER BY id DESC')
    rows = c.fetchall()
    conn.close()
    
    appts = []
    for r in rows:
        appts.append({
            "doctor": r[0],
            "date": r[1],
            "time": r[2],
            "status": r[3],
            "token": r[4],
            "patient": r[5]
        })
    return jsonify(appts)

@app.route('/api/send-email', methods=['POST'])
def send_email():
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    d = request.json
    to_email  = d.get('to', 'yyashas209@gmail.com')
    doctor    = d.get('doctor', 'Unknown Doctor')
    hospital  = d.get('hospital', 'Unknown Hospital')
    date      = d.get('date', 'Unknown Date')
    time      = d.get('time', 'Unknown Time')
    token     = d.get('token', 'UNKNOWN')
    patient   = d.get('patient', 'Patient')

    # --- Sender credentials ---
    SENDER_EMAIL    = "yyashas209@gmail.com"   # Send from the user's own Gmail
    SENDER_PASSWORD = "krtm qnqj lrdm axgi"    # Gmail App Password (Settings > Security > App Passwords)

    subject = f"✅ Appointment Confirmed — {token}"
    html_body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden;border:1px solid #0891b2;">
      <div style="background:linear-gradient(135deg,#0891b2,#1e3a5f);padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;color:#ffffff;">🏥 DocVoice AI</h1>
        <p style="margin:4px 0 0;color:#a5f3fc;font-size:12px;letter-spacing:2px;">APPOINTMENT CONFIRMATION</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="color:#94a3b8;margin-top:0;">Hi <b style="color:#e2e8f0;">{patient}</b>, your appointment has been secured!</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Doctor</td><td style="color:#fff;font-weight:600;">{doctor}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Hospital</td><td style="color:#7dd3fc;">{hospital}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Date</td><td style="color:#fff;">{date}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Time</td><td style="color:#fff;">{time}</td></tr>
        </table>
        <div style="background:#0c2340;border:1px solid #0891b2;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px;">
          <p style="margin:0 0 4px;color:#64748b;font-size:11px;letter-spacing:2px;">BOOKING TOKEN</p>
          <p style="margin:0;color:#22d3ee;font-size:22px;font-weight:700;font-family:monospace;letter-spacing:4px;">{token}</p>
        </div>
        <p style="color:#64748b;font-size:12px;text-align:center;">Keep this token safe. Show it at the reception desk to check in.</p>
      </div>
      <div style="padding:16px 32px;border-top:1px solid #1e3a5f;text-align:center;">
        <p style="margin:0;color:#475569;font-size:11px;">DocVoice AI — Powered by Gemini &amp; Leaflet.js — Hackathon Demo 2026</p>
      </div>
    </div>
    """

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From']    = SENDER_EMAIL
        msg['To']      = to_email
        msg.attach(MIMEText(html_body, 'html'))

        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(SENDER_EMAIL, SENDER_PASSWORD)
            smtp.sendmail(SENDER_EMAIL, to_email, msg.as_string())

        print(f"[Email] Sent confirmation to {to_email} for token {token}")
        return jsonify({"status": "sent", "to": to_email})
    except Exception as e:
        print(f"[Email Error] AUTH/SMTP failure: {e}")
        # Return success anyway to not block the UI, but log the error
        return jsonify({"status": "error", "message": "SMTP Authentication failed. Check App Password."}), 500

@app.route('/api/hospitals', methods=['GET'])
def get_hospitals():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT name, lat, lon, specialty FROM hospitals')
    rows = c.fetchall()
    conn.close()
    
    hospitals = []
    for r in rows:
        hospitals.append({
            "name": r[0],
            "lat": r[1],
            "lon": r[2],
            "specialty": r[3]
        })
    return jsonify(hospitals)

@app.route('/api/analyze-hospitals', methods=['POST'])
def analyze_hospitals():
    base_data = request.json
    hospitals = base_data.get('hospitals', [])
    
    if not hospitals:
        return jsonify({})
    
    names = [h.get('name', 'Hospital') for h in hospitals]
    
    # Store these hospitals in the DB for future reference/caching
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M')
    for h in hospitals:
        c.execute('INSERT OR IGNORE INTO hospitals (name, lat, lon, last_scanned) VALUES (?,?,?,?)',
                  (h.get('name'), h.get('lat'), h.get('lon'), now_str))
    conn.commit()
    conn.close()
    
    prompt = f"""You are a strict data classification API. Your ONLY function is to accept a list of hospital names and return a single JSON object mapping each name to a medical specialty.

ALLOWED SPECIALITIES:
"Cardiology", "Orthopedics", "Pediatrics", "Neurology", "General".

RULES:
1. Keyword Matching: If the name implies a specialty (e.g., "Heart", "Cardiac" -> Cardiology; "Bone", "Joint" -> Orthopedics; "Child", "Kids" -> Pediatrics; "Neuro", "Brain" -> Neurology), assign it accurately.
2. Generic Names: If the hospital name is generic (e.g., "City Hospital", "Care Clinic", "Apollo"), you MUST randomly assign it to one of the 5 allowed specialties. Do NOT default them all to "General". Ensure a relatively even distribution across all specialties for demonstration purposes.
3. Formatting: Return ONLY the raw JSON object. Do NOT include markdown formatting, code blocks, or any conversational text.

INPUT: {json.dumps(names)}
"""

    def call_with_failover(p):
        try:
            # Try Key A
            m = get_model(0)
            return m.generate_content(p)
        except Exception as e:
            if "429" in str(e):
                print("Key A exhausted, switching to Key B...")
                m = get_model(1)
                return m.generate_content(p)
            raise e

    try:
        response = call_with_failover(prompt)
        raw = response.text.strip()
        import re
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        
        if json_match:
            mapping = json.loads(json_match.group())
            for name in names:
                if name not in mapping: mapping[name] = "General"
            return jsonify(mapping)
        return jsonify({name: "General" for name in names})
    except Exception as e:
        print(f"Error in analyze_hospitals: {e}")
        return jsonify({name: "General" for name in names})

# ── Local NLU Engine (API-free, instant) ──────────────────────────────
DOCTOR_DB = {
    "bangalore": [
        {"name": "Dr. Sudarshan Ballal", "hospital": "Manipal Hospital", "specialty": "General", "aliases": ["ballal", "ಬಲ್ಲಾಳ್", "ಬಲ್ಲಾಳ"]},
        {"name": "Dr. Sharma",           "hospital": "Apollo Hospitals",   "specialty": "Orthopedics", "aliases": ["sharma", "ಶರ್ಮಾ", "ಶರ್ಮ"]},
        {"name": "Dr. Pratima Murthy",   "hospital": "NIMHANS",            "specialty": "Neurology", "aliases": ["pratima", "murthy", "ಪ್ರತಿಮಾ", "ಮೂರ್ತಿ"]},
        {"name": "Dr. Gupta",            "hospital": "Jayadeva Institute", "specialty": "Cardiology", "aliases": ["gupta", "ಗುಪ್ತ", "ಗುಪ್ತಾ"]},
        {"name": "Dr. Arjun Reddy",      "hospital": "Rainbow Children's", "specialty": "Pediatrics", "aliases": ["arjun", "reddy", "ಅರ್ಜುನ್", "ರೆಡ್ಡಿ"]},
        {"name": "Dr. Vivek Jawali",     "hospital": "Fortis Hospital",    "specialty": "Cardiology", "aliases": ["vivek", "jawali", "ವಿವೇಕ್", "ಜವಳಿ", "ಜಾವಳಿ"]},
        {"name": "Dr. Nitish Shetty",    "hospital": "Aster CMI",          "specialty": "General", "aliases": ["nitish", "shetty", "ನಿತಿಶ್", "ಶೆಟ್ಟಿ"]},
        {"name": "Dr. Maheshwarappa",    "hospital": "Sakra World Hospital","specialty": "Orthopedics", "aliases": ["maheshwarappa", "ಮಹೇಶ್ವರಪ್ಪ"]},
    ],
    "shivamogga": [
        {"name": "Dr. Nanjappa",   "hospital": "Nanjappa Multi-Speciality", "specialty": "Cardiology", "aliases": ["nanjappa", "ನಂಜಪ್ಪ"]},
        {"name": "Dr. Vishwanath", "hospital": "McGann Teaching Hospital",  "specialty": "General", "aliases": ["vishwanath", "ವಿಶ್ವನಾಥ್", "ವಿಶ್ವನಾಥ"]},
        {"name": "Dr. Kiran Kumar","hospital": "Sanjivini Hospital",        "specialty": "Orthopedics", "aliases": ["kiran", "kumar", "ಕಿರಣ್", "ಕುಮಾರ್"]},
        {"name": "Dr. Ananya",     "hospital": "Bapuji Child Care",         "specialty": "Pediatrics", "aliases": ["ananya", "ಅನನ್ಯ", "ಅನನ್ಯಾ"]},
        {"name": "Dr. Srinivas",   "hospital": "Subbaiah Medical College",  "specialty": "General", "aliases": ["srinivas", "ಶ್ರೀನಿವಾಸ್", "ಶ್ರೀನಿವಾಸ"]},
        {"name": "Dr. Prasad",     "hospital": "Sahyadri Hospital",         "specialty": "Neurology", "aliases": ["prasad", "ಪ್ರಸಾದ್", "ಪ್ರಸಾದ"]},
    ],
    "mumbai": [
        {"name": "Dr. Trivedi",        "hospital": "Lilavati Hospital",       "specialty": "Cardiology", "aliases": ["trivedi", "ತ್ರಿವೇದಿ"]},
        {"name": "Dr. Desai",          "hospital": "Kokilaben Ambani Hospital","specialty": "Neurology", "aliases": ["desai", "ದೇಸಾಯಿ", "देसाई"]},
        {"name": "Dr. Badwe",          "hospital": "Tata Memorial",           "specialty": "General", "aliases": ["badwe", "ಬಡ್ವೆ", "बाडवे"]},
        {"name": "Dr. Udwadia",        "hospital": "Breach Candy Hospital",   "specialty": "Orthopedics", "aliases": ["udwadia", "ಉದ್ವಾಡಿಯಾ", "उदवाडिया"]},
        {"name": "Dr. Awasthi",        "hospital": "Surya Mother & Child",    "specialty": "Pediatrics", "aliases": ["awasthi", "ಅವಸ್ತಿ", "अवस्थी"]},
        {"name": "Dr. Shoaib Padaria", "hospital": "Jaslok Hospital",         "specialty": "Cardiology", "aliases": ["shoaib", "padaria", "ಶೋಯೆಬ್"]},
        {"name": "Dr. Akshay Raut",    "hospital": "Nanavati Max",            "specialty": "Orthopedics", "aliases": ["akshay", "raut", "ಅಕ್ಷಯ್", "ರಾವತ್"]},
        {"name": "Dr. Gustad Daver",   "hospital": "H. N. Reliance",          "specialty": "General", "aliases": ["gustad", "daver", "ಗುಸ್ತಾದ್"]},
    ]
}

SYMPTOM_MAP = {
    "chest": "Cardiology", "heart": "Cardiology", "cardiac": "Cardiology",
    "palpitation": "Cardiology", "hypertension": "Cardiology", "breathless": "Cardiology",
    "cardiology": "Cardiology", "cardiologist": "Cardiology", "ಹೃದಯ": "Cardiology",
    "bone": "Orthopedics", "joint": "Orthopedics", "back": "Orthopedics",
    "fracture": "Orthopedics", "knee": "Orthopedics", "spine": "Orthopedics",
    "orthopedics": "Orthopedics", "orthopedic": "Orthopedics", "orthopedist": "Orthopedics", "ಮೂಳೆ": "Orthopedics",
    "child": "Pediatrics", "son": "Pediatrics", "daughter": "Pediatrics",
    "baby": "Pediatrics", "infant": "Pediatrics", "kid": "Pediatrics",
    "pediatrics": "Pediatrics", "pediatrician": "Pediatrics", "ಮಗು": "Pediatrics",
    "brain": "Neurology", "nerve": "Neurology", "seizure": "Neurology",
    "neurology": "Neurology", "neurologist": "Neurology", "ಮೆದುಳು": "Neurology",
    "headache": "General", "head": "General", "migraine": "General",
    "fever": "General", "cold": "General", "cough": "General",
    "stomach": "General", "sick": "General", "pain": "General",
    "general": "General", "physician": "General", "ಜ್ವರ": "General", "ನೋವು": "General", "ಹುಷಾರಿಲ್ಲ": "General",
    "बुखार": "General", "दर्द": "General", "तबीयत": "General"
}

TIME_MAP = {
    "9": "9:00 AM", "nine": "9:00 AM", "morning": "9:00 AM", "ಬೆಳಿಗ್ಗೆ": "9:00 AM", "सुबह": "9:00 AM",
    "10": "10:30 AM", "ten": "10:30 AM",
    "12": "12:00 PM", "noon": "12:00 PM", "lunch": "12:00 PM", "ಮಧ್ಯಾಹ್ನ": "12:00 PM", "दोपहर": "12:00 PM",
    "2": "2:00 PM", "two": "2:00 PM", "afternoon": "2:00 PM",
    "3": "3:00 PM", "three": "3:00 PM",
    "5": "5:30 PM", "five": "5:30 PM", "evening": "5:30 PM", "ಸಂಜೆ": "5:30 PM", "ಶಾಮ": "5:30 PM", "ಶ್ಯಾಮ": "5:30 PM", "ಶ್ಯಾಮ್": "5:30 PM",
    "6": "6:30 PM", "six": "6:30 PM",
    "earliest": "9:00 AM", "first": "9:00 AM", "any": "9:00 AM",
}

MONTH_MAP = {
    "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
    "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12
}

SMALL_TALK = [
    (r'\b(hi|hello|hey|good (morning|afternoon|evening))\b', [
        "Hello! I'm Doc Emma, your clinic assistant. Are you looking to book an appointment today?",
        "Hi there! Great to hear from you. How can I help you with your health today?",
        "Hey! I'm here to help. What brings you in today?"
    ]),
    (r'\b(how are you|how are you doing|you good)\b', [
        "I'm doing great, thank you for asking! I'm always ready to help. What can I do for you today?",
        "All systems running perfectly! Now, how can I help you — are you or someone you know feeling unwell?",
        "I'm feeling very helpful today! Is there an appointment I can book for you?"
    ]),
    (r'\b(namaste|namaskar|hello|hey|hi|ನಮಸ್ಕಾರ|ನಮಸ್ತೇ|नमस्ते|नमस्कार)\b', [
        "Namaste! Welcome to DocVoice AI. How can I help you today?",
        "Namaskara! Hope you are doing well. How can I assist with your health today?",
        "Namaste! I'm Doc Emma. Are you looking to book an appointment?",
        "ನಮಸ್ಕಾರ! ನೀವು ಹೇಗಿದ್ದೀರಿ? ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
        "नमस्ते! मैं आपकी क्या सहायता कर सकती हूँ?"
    ]),
    (r'\b(weather|sunny|rain|cold|hot|nice day)\b', [
        "It's always a beautiful day inside the DocVoice AI clinic! How can I help you stay healthy today?",
        "A lovely day indeed! Perfect for getting your health check-up out of the way. Shall I find you a specialist?",
        "The weather is great, and I'm here to make your day even better by helping with your appointments!"
    ]),
    (r'\b(health tip|stay healthy|advice)\b', [
        "Staying hydrated is key! Also, don't forget to book your regular check-ups. Can I help with that?",
        "A good night's sleep does wonders for your health. Speaking of health, do you need to see a doctor today?",
        "Regular exercise and a balanced diet are your best friends. Need any help scheduling a consultation?"
    ]),
    (r'\b(thank|thanks|thank you)\b', [
        "You're very welcome! Is there anything else I can help you with?",
        "Of course! Happy to help. Let me know if you need anything else!",
        "Anytime! I'm here to make your clinical experience seamless."
    ]),
    (r'\b(bye|goodbye|see you|that.s all)\b', [
        "Take care! Remember, we're here whenever you need us. Goodbye!",
        "Goodbye! Wishing you and your family good health!",
        "Have a wonderful day! DocVoice AI is always here if you need us."
    ]),
    (r'\b(what can you do|help|what do you do)\b', [
        "I can help you book, cancel, or reschedule appointments with any of our specialists — Cardiology, Pediatrics, Neurology, Orthopedics, and General. Just tell me your symptoms or a doctor's name!",
    ]),
    (r'\b(who are you|what are you|your name)\b', [
        "I'm Doc Emma, your intelligent clinic assistant! I'm here to manage your appointments and help you find the right care.",
    ]),
]

def local_nlu(text, today_str, lang='en-US', session_id=None):
    """Rule-based NLU that handles common intents with session-context awareness."""
    import re, random
    from datetime import datetime, timedelta
    t = text.lower().strip()
    today_dt = datetime.strptime(today_str, '%Y-%m-%d')
    
    # Retrieve last context
    last_context = SESSION_HISTORY.get(f"{session_id}_context", {}) if session_id else {}
    
    # Detect if we should respond in Kannada
    is_kn = (lang and lang.startswith('kn')) or any('\u0ce6' <= c <= '\u0cf2' for c in text)

    # --- SMALL TALK HANDLER ---
    has_medical = any(word in t for word in SYMPTOM_MAP.keys())
    for pattern, responses in SMALL_TALK:
        if re.search(pattern, t):
            # Prioritize small talk ONLY if no medical symptoms or booking words are present
            if not has_medical and not any(w in t for w in ["book","appoint","cancel","called off"]):
                return {"action": "none", "spoken_response": random.choice(responses)}

    # --- Detect Region ---
    region = None
    if "bangalore" in t or "bengaluru" in t:
        region = "Bangalore"
    elif "shivamogga" in t or "shimoga" in t:
        region = "Shivamogga"
    elif "mumbai" in t or "bombay" in t:
        region = "Mumbai"

    # Region Key Priority: Mentions > Context > Default
    region_key = region.lower() if region else (last_context.get("region").lower() if last_context.get("region") else "shivamogga")

    # --- Detect Doctor ---
    doctor = None
    all_docs = DOCTOR_DB.get(region_key, []) + [d for dlist in DOCTOR_DB.values() for d in dlist]
    for doc in all_docs:
        full_name = doc["name"].lower()
        last_name = doc["name"].split()[-1].lower()
        aliases = doc.get("aliases", [])
        if full_name in t or f"dr {last_name}" in t or f"dr. {last_name}" in t or f"doctor {last_name}" in t or any(alias in t for alias in aliases):
            doctor = doc
            break

    # --- Detect Specialty/Date/Time ---
    specialty = None
    for word, spec in SYMPTOM_MAP.items():
        if word in t: specialty = spec; break

    date_str = None
    if "tomorrow" in t: date_str = (today_dt + timedelta(days=1)).strftime('%Y-%m-%d')
    else:
        day_month = re.search(r'(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)', t)
        month_day = re.search(r'(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})', t)
        if day_month:
            try: date_str = datetime(today_dt.year, MONTH_MAP[day_month.group(2)], int(day_month.group(1))).strftime('%Y-%m-%d')
            except: pass
        elif month_day:
            try: date_str = datetime(today_dt.year, MONTH_MAP[month_day.group(1)], int(month_day.group(2))).strftime('%Y-%m-%d')
            except: pass

    time_str = None
    explicit = re.search(r'(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)', t)
    digit_period = re.search(r'\b(\d{1,2})\s*([ap]\.?m\.?)\b', t)
    if explicit: time_str = f"{explicit.group(1)}:{explicit.group(2)} {'PM' if 'p' in explicit.group(3).lower() else 'AM'}"
    elif digit_period: time_str = f"{digit_period.group(1)}:00 {'PM' if 'p' in digit_period.group(2).lower() else 'AM'}"
    else:
        for key, val in TIME_MAP.items():
            if key in t: time_str = val; break

    # --- Intents ---
    book_words   = ["book", "appoint", "reserve", "slot", "schedule", "fix an", "bouquet", "karo", "kar do", "madi", "maadi", "ಮಾಡ", "ಮಾಡು", "ಮಾಡ ಬೇಕು", "ಖಚಿತಪಡಿಸ", "ಅಪಾಯಿಂಟ್ಮೆಂಟ್", "confirm", "ಕರೋ", "ಕರ್ ದೋ", "yes", "sari", "hudu", "okay", "ok", "ಸರಿ", "ಹೌದು", "ಮತ್ತು", "ಕೂಡ", "ok", "visit", "consult", "see a", "ಭೇಟಿ", "ತೋರಿಸಬೇಕು", "ದೇಖಾವೋ", "like it", "that works", "perfect", "good"]
    cancel_words = ["cancel", "remove", "delete", "unbook", "called off", "not coming", "busy", "don't want", "madbedi", "ಕ್ಯಾನ್ಸಲ್", "ಬೇಡ", "ಮದ್ಬೇಡಿ", "ಹೋಗಲ್ಲ", "ಆಗಲ್ಲ"]
    region_words = ["go to", "switch", "show", "take me", "open", "ಹೋಗು", "ತೋರಿಸು", "ಬದಲಾಯಿಸು", "ಚಲೋ", "ದಿಖಾವೋ"]
    negation_words = ["no", "not", "cannot", "can't", "don't", "wait", "hold", "stop", "change", "ಇಲ್ಲ", "ಬೇಡ", "ಆಗಲ್ಲ", "ಬದಲಾಯಿಸು", "ನಹೀ", "nahi", "change"]

    is_book   = any(w in t for w in book_words)
    is_cancel = any(w in t for w in cancel_words)
    is_region = any(w in t for w in region_words) and region
    is_negation = any(w in t for w in negation_words)
    is_change = "change" in t or "ಬದಲಾಯಿಸು" in t or "ಚೇಂಜ್" in t or "reschedule" in t

    # Prioritize Map/Region intent if explicitly requested via keywords or if no doctor/specialty yet found
    if region and (is_region or not (doctor or specialty)):
        if session_id:
            SESSION_HISTORY[f"{session_id}_context"] = {"region": region, "specialty": specialty or ctx_spec}
        
        spec_to_show = specialty or ctx_spec
        spec_str = f" I'll highlight {spec_to_show} specialists." if spec_to_show else ""
        resp = f"Switching to {region} now!{spec_str}"
        if is_kn: resp = f"ಈಗ {region} ಪ್ರದೇಶಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗುತ್ತಿದೆ!{spec_str}"
        return {"action": "switch_region", "region": region, "specialty": spec_to_show, "spoken_response": resp}

    # 1. Contextual Correction (ONLY if last_booking exists)
    if not is_book and not is_cancel and (date_str or time_str):
        last_booking = SESSION_HISTORY.get(f"{session_id}_last_booking") if session_id else None
        if last_booking and len(t.split()) < 6:
            return {
                "action": "book_appointment", "doctor": last_booking.get("doctor"),
                "date": date_str or last_booking.get("date"), "time": time_str or last_booking.get("time"),
                "region": region or last_booking.get("region"),
                "spoken_response": f"Oh, I see! You'd like to change that to {time_str or date_str}. Updating your booking now!"
            }

    if is_cancel:
        final_date, final_time, target_doc = date_str or today_str, time_str or "any", doctor["name"] if doctor else "your"
        return {"action": "cancel_appointment", "doctor": doctor["name"] if doctor else None, "date": final_date, "time": final_time, "spoken_response": f"Got it! I'll cancel {target_doc} appointment for {final_time} on {final_date}."}

    # Resolve Context
    ctx_doc, ctx_spec = last_context.get("doctor"), last_context.get("specialty")
    is_yes_only = is_book and len(t.split()) < 4 and any(w in t for w in ["yes", "sari", "hudu", "okay", "ok", "confirm", "like it", "works", "perfect", "good", "correct"])
    
    if doctor or specialty or ctx_doc or ctx_spec:
        res_doc_name = doctor["name"] if doctor else (ctx_doc if ctx_doc else None)
        res_spec = specialty or ctx_spec
        if not res_doc_name and res_spec:
            candidates = [d for d in DOCTOR_DB.get(region_key, []) if d["specialty"] == res_spec]
            if candidates: doctor = candidates[0]; res_doc_name = candidates[0]["name"]
        if not doctor and res_doc_name:
            all_docs = [d for dlist in DOCTOR_DB.values() for d in dlist]
            for doc_obj in all_docs:
                if doc_obj["name"] == res_doc_name: doctor = doc_obj; break
        
        d = doctor or (DOCTOR_DB.get(region_key, DOCTOR_DB["shivamogga"])[0])
        final_date = date_str or last_context.get("suggested_date") or today_str
        final_time = time_str or last_context.get("suggested_time")

        if session_id:
            SESSION_HISTORY[f"{session_id}_context"] = {
                "doctor": d['name'], "specialty": res_spec, "region": region or last_context.get("region"),
                "suggested_date": final_date if not date_str else None, "suggested_time": final_time if not time_str else None
            }

        empathy = "Oh, I'm sorry to hear that. " if res_spec and any(w in t for w in ["pain","hurt","sick","fever","ache"]) else ""
        if is_kn and empathy: empathy = "ಅಯ್ಯೋ, ಕೇಳಿ ಬೇಜಾರಾಯಿತು. "

        if (is_negation or is_change) and not time_str:
            resp = f"I understand. What time or date would work better for your appointment with {d['name']}?"
            if is_kn: resp = f"ಸರಿ, ಹಾಗಾದರೆ {d['name']} ಅವರೊಂದಿಗೆ ಮೀಟಿಂಗ್ ಮಾಡಲು ನಿಮಗೆ ಯಾವ ಸಮಯ ಅಥವಾ ದಿನಾಂಕ ಅನುಕೂಲವಾಗುತ್ತದೆ?"
            return {"action": "filter_doctors", "doctor": d['name'], "spoken_response": resp}

        if is_book and (final_time or is_yes_only):
            if not final_time:
                resp = f"I'd love to book that for you! What time would you like to visit {d['name']}?"
                if is_kn: resp = f"ಖಂಡಿತವಾಗಿಯೂ! ನೀವು ಎಷ್ಟು ಗಂಟೆಗೆ {d['name']} ಅವರನ್ನು ಭೇಟಿ ಮಾಡಲು ಬಯಸುತ್ತೀರಿ?"
                return {"action": "filter_doctors", "doctor": d['name'], "spoken_response": resp}
            
            resp = f"Confirmed! Your appointment with {d['name']} is set for {final_time} on {final_date}. I've displayed your appointment card on the screen."
            if is_kn: resp = f"ಖಚಿತಪಡಿಸಲಾಗಿದೆ! {final_date} ರಂದು ಬೆಳಗ್ಗೆ {final_time} ಕ್ಕೆ {d['name']} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ ಅಪಾಯಿಂಟ್ಮೆಂಟ್ ನಿಗದಿಯಾಗಿದೆ."
            return {"action": "book_appointment", "doctor": d["name"], "date": final_date, "time": final_time, "spoken_response": resp}
        
        if not final_time:
            resp = f"{empathy}I've found {d['name']} ({d['specialty']}) at {d['hospital']}. What time would you like to visit?"
            if is_kn: resp = f"{empathy}ನಾನು {d['hospital']} ನಲ್ಲಿ {d['specialty']} ತಜ್ಞರಾದ {d['name']} ಅವರನ್ನು ಕಂಡುಕೊಂಡಿದ್ದೇನೆ. ನೀವು ಎಷ್ಟು ಗಂಟೆಗೆ ಬರಲು ಬಯಸುತ್ತೀರಿ?"
        else:
            resp = f"{empathy}I've found {d['name']} at {d['hospital']}. Shall I book you for {final_time} on {final_date}?"
            if session_id:
                SESSION_HISTORY[f"{session_id}_context"]["suggested_date"] = final_date
                SESSION_HISTORY[f"{session_id}_context"]["suggested_time"] = final_time
            if is_kn: resp = f"{empathy}ನಾನು {d['name']} ಅವರ ಸ್ಲಾಟ್ ಕಂಡುಕೊಂಡಿದ್ದೇನೆ. {final_date} ರಂದು {final_time} ಕ್ಕೆ ನಾನು ಬುಕ್ ಮಾಡಲೇ?"
            
        return {"action": "filter_doctors", "specialty": d['specialty'], "doctor": d['name'], "spoken_response": resp}


    if region and (is_region or not (doctor or specialty)):
        if session_id:
            SESSION_HISTORY[f"{session_id}_context"] = {"region": region, "specialty": specialty or ctx_spec}
        
        spec_to_show = specialty or ctx_spec
        spec_str = f" I'll highlight {spec_to_show} specialists." if spec_to_show else ""
        resp = f"Switching to {region} now!{spec_str}"
        if is_kn: resp = f"ಈಗ {region} ಪ್ರದೇಶಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗುತ್ತಿದೆ!{spec_str}"
        return {"action": "switch_region", "region": region, "specialty": spec_to_show, "spoken_response": resp}

    if specialty:
        resp = f"Let me find {specialty} specialists for you right away!"
        if is_kn: resp = f"ನಿಮಗಾಗಿ {specialty} ತಜ್ಞರನ್ನು ಈಗಲೇ ಹುಡುಕುತ್ತೇನೆ!"
        return {"action": "filter_doctors", "specialty": specialty, "region": region, "spoken_response": resp}

    return None

# ── AI Processing ─────────────────────────────────────────────────────
@app.route('/process', methods=['POST'])
def process():
    data = request.json
    if not data or "text" not in data:
        return jsonify({"action": "none", "spoken_response": "I didn't hear anything."}), 400

    user_text = data["text"]
    # Filter out junk/accidental short inputs
    if len(user_text.strip()) < 2:
        return jsonify({"action": "none", "spoken_response": ""})
        
    session_id = data.get("session_id", "default_guest")
    lang = data.get("lang", "en-US")
    today_str = datetime.now().strftime('%Y-%m-%d')
    history = get_history(session_id)

    # --- TRY LOCAL NLU FIRST ---
    local_result = local_nlu(user_text, today_str, lang, session_id)
    
    # If it's a structural command (book/cancel/switch) and local NLU caught it, RETURN IMMEDIATELY
    if local_result and local_result.get("action") != "none":
        # Keep track of the last doctor/date/time for the session context
        if local_result.get("action") == "book_appointment":
            SESSION_HISTORY[f"{session_id}_last_booking"] = local_result
            
        add_to_history(session_id, user_text, local_result.get("spoken_response", ""))
        return jsonify(local_result)
    
    # --- Contextual Cancellation Fallback ---
    # User said "cancel it" or "ಕ್ಯಾನ್ಸಲ್ ಮಾಡು" without a name, but we just booked something
    if "cancel" in user_text.lower() or "ಕ್ಯಾನ್ಸಲ್" in user_text:
        last_booking = SESSION_HISTORY.get(f"{session_id}_last_booking")
        if last_booking:
            res = {
                "action": "cancel_appointment",
                "doctor": last_booking.get("doctor"),
                "date": last_booking.get("date"),
                "time": last_booking.get("time"),
                "region": last_booking.get("region"),
                "spoken_response": f"Sari, I've cancelled your appointment with {last_booking.get('doctor')} for you. All done!" if "ಕ್ಯಾನ್ಸಲ್" in user_text else f"No problem! I've cancelled your appointment with {last_booking.get('doctor')}. Anything else?"
            }
            add_to_history(session_id, user_text, res["spoken_response"])
            return jsonify(res)

    # --- ENHANCED CONVERSATIONAL PROMPT ---
    history_context = ""
    if history:
        history_context = "Conversation History:\n" + "\n".join([f"{m['role']}: {m['content']}" for m in history])

    prompt = f"""You are Doc Emma, a warm, caring, and highly efficient medical concierge. 
You run the front desk for high-tech clinics in Bangalore, Shivamogga, and Mumbai.

IMPORTANT: You are MULTILINGUAL. 
- If user speaks in English, respond in English.
- If user speaks in Hindi or Hinglish, respond in Hindi or Hinglish.
- If user speaks in Kannada or Kanglish, respond in Kannada or Kanglish.
- CRITICAL: If the user's language mode is Kannada (KN), you MUST respond in Kannada or Kanglish, even if the user speaks some English.
- ALWAYS MATCH THE USER'S LINGUISTIC STYLE (Code-switching is encouraged if the user does it).

TODAY IS: {today_str}
{history_context}
USER JUST SAID: "{user_text}"

YOUR MISSION:
1. Empathy First: If the user is sick, in pain, or worried, acknowledge it warmly.
2. Contextual Memory: Use history for follow-ups.
3. Action Logic:
   - "book_appointment": Use for slots. (doctor, date, time).
   - "cancel_appointment": Use to remove slots.
   - "filter_doctors": Use for symptoms/specialties.
   - "switch_region": Change city.
   - "none": Greetings/Small talk.

OUTPUT FORMAT: Return ONLY a raw JSON object. Match the user's language in "spoken_response".
{{
  "action": "...",
  "doctor": "...",
  "specialty": "...",
  "date": "YYYY-MM-DD",
  "time": "H:MM AM/PM",
  "region": "...",
  "spoken_response": "..."
}}"""

    def call_with_failover(p):
        import time, re as _re
        for key_idx in range(len(KEYS)):
            try:
                m = get_model(key_idx)
                return m.generate_content(p)
            except Exception as e:
                if "429" in str(e): continue
                raise e
        time.sleep(0.5)
        return get_model(0).generate_content(p)

    try:
        response = call_with_failover(prompt)
        # Handle cases where response might be empty or blocked
        if not response or not response.text:
            raise ValueError("Empty or blocked response from model")
            
        raw_text = response.text.strip()
        
        # Robust JSON extraction (handles ```json blocks or raw JSON)
        import re
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group())
                # Save to history for next turn
                add_to_history(session_id, user_text, result.get("spoken_response", ""))
                return jsonify(result)
            except json.JSONDecodeError:
                print(f"JSON Decode Error in response: {raw_text}")
        
        if local_result: return jsonify(local_result)
        return jsonify({"action": "none", "spoken_response": "I'm listening. Tell me more?"})

    except Exception as e:
        import traceback, random
        print("\n=== AI CLINIC EXCEPTION ===\n")
        traceback.print_exc()
        if local_result: return jsonify(local_result)
        
        is_kn_session = (lang and lang.startswith('kn'))
        is_hi_session = (lang and lang.startswith('hi'))
        
        fallbacks_en = [
            "Namaste! I'm still here. How can I help you with your health today?",
            "I'm listening! Would you like to check the specialists in your area?",
            "I see! Tell me more about how you're feeling, or ask me to book/cancel something."
        ]
        fallbacks_kn = [
            "ನಮಸ್ಕಾರ! ನಾನು ಇಲ್ಲೇ ಇದ್ದೇನೆ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
            "ನಾನು ಕೇಳುತ್ತಿದ್ದೇನೆ! ನಿಮ್ಮ ಪ್ರದೇಶದ ತಜ್ಞರನ್ನು ಪರೀಕ್ಷಿಸಲು ನೀವು ಬಯಸುವಿರಾ?",
            "ಹೇಳಿ! ನಿಮಗೆ ಹೇಗೆ ಅನಿಸುತ್ತಿದೆ ಎಂದು ನನಗೆ ತಿಳಿಸಿ."
        ]
        fallbacks_hi = [
            "नमस्ते! मैं यहीं हूँ। मैं आपकी कैसे सहायता कर सकती हूँ?",
            "मैं सुन रही हूँ! क्या आप अपने क्षेत्र के विशेषज्ञों की सूची देखना चाहेंगे?",
            "बताइए! आपको कैसा लग रहा है, या मुझसे अपॉइंटमेंट बुक करने के लिए कहें।"
        ]
        
        if is_kn_session: fallbacks = fallbacks_kn
        elif is_hi_session: fallbacks = fallbacks_hi
        else: fallbacks = fallbacks_en
        
        spoken = random.choice(fallbacks)
        return jsonify({
            "action": "none", 
            "spoken_response": spoken
        })

if __name__ == '__main__':
    app.run(debug=True, port=5000)

