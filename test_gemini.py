import json
import re
from datetime import datetime
import google.generativeai as genai

genai.configure(api_key="AIzaSyCuPhh6n7ujGy8BTbApY2bQ3aH1rFnx4ZI")
model = genai.GenerativeModel('gemini-1.5-flash')

user_text = "book an appointment for tomorrow 9:00 a.m."
today_dt = datetime.now()
today_str = today_dt.strftime('%Y-%m-%d')

prompt = f"""You are Doc Emma, a warm and caring clinic receptionist AI. 
Today is {today_str}.
User said: "{user_text}"

Doctors: Dr. Sharma (Orthopedics), Dr. Gupta (Cardiology), Dr. Arjun Reddy (Pediatrics).

Intents:
- Book: "action":"book_appointment", "doctor", "date" (YYYY-MM-DD), "time" (e.g. "9:00 AM").
- Cancel: "action":"cancel_appointment".
- Highlight: "action":"highlight_calendar".
- Filter: "action":"filter_doctors".

Logic:
- "tomorrow" = calculate exactly based on {today_str}.
- No date specified = use {today_str}.
- Booking but NO time? Set "action":"none" and ask "What time works best for you?".
- Mentioned pain? Begin response with "Oh, I'm sorry to hear that."

Return ONLY valid JSON:
{{"action":"book_appointment","doctor":"Dr. Gupta","date":"YYYY-MM-DD","time":"9:00 AM","spoken_response":"Warm response here..."}}"""

try:
    response = model.generate_content(prompt)
    if not response.candidates:
         print("Gemini Blocked")
    raw = response.text.strip()
    print(f"Gemini Raw: {raw}")

    json_match = re.search(r'\{.*\}', raw, re.DOTALL)
    
    if json_match:
        action_data = json.loads(json_match.group())
        print("Parsed JSON:", action_data)
except Exception as e:
    import traceback
    traceback.print_exc()
