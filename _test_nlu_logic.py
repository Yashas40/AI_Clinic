import sys
import os
from datetime import datetime

# Add project root to path to import app
project_path = r'c:\Users\Dell\Desktop\AI_Clinic'
sys.path.append(project_path)

try:
    from app import local_nlu
except ImportError as e:
    print(f"Failed to import local_nlu: {e}")
    sys.exit(1)

def test_nlu():
    today = "2026-03-14"
    session_id = "test_session"
    
    test_cases = [
        {
            "input": "book an appointment for cardiologist in Bangalore",
            "expected_action": "filter_doctors",
            "expected_specialty": "Cardiology",
            "desc": "Detect specialty 'Cardiology' from 'cardiologist'"
        },
        {
            "input": "cardiologist",
            "expected_action": "filter_doctors",
            "expected_specialty": "Cardiology",
            "desc": "Single word specialty match should NOT trigger small talk"
        },
        {
            "input": "hi",
            "expected_action": "none",
            "desc": "Exact 'hi' should trigger small talk"
        },
        {
            "input": "book an appointment for cardiologist in Bangalore I am feeling sick",
            "expected_action": "filter_doctors",
            "expected_specialty": "Cardiology",
            "desc": "Multi-intent sentence with specialty and symptoms"
        },
        {
            "input": "I would like to visit at 9:00 a.m.",
            "expected_action": "book_appointment",
            "expected_time": "9:00 AM",
            "desc": "Detect explicit time and book action"
        },
        {
            "input": "like it",
            "expected_action": "book_appointment",
            "desc": "Detect 'like it' as confirmation word"
        }
    ]

    print(f"{'Description':<60} | {'Status':<10}")
    print("-" * 75)
    
    success_count = 0
    for case in test_cases:
        result = local_nlu(case["input"], today, session_id=session_id)
        
        passed = True
        if result is None:
            passed = False
        else:
            if result.get("action") != case["expected_action"]:
                passed = False
            if "expected_specialty" in case and result.get("specialty") != case["expected_specialty"]:
                passed = False
            if "expected_time" in case and result.get("time") != case["expected_time"]:
                passed = False
        
        status = "PASSED" if passed else "FAILED"
        print(f"{case['desc']:<60} | {status:<10}")
        if not passed:
            print(f"  Expected: action={case['expected_action']}")
            print(f"  Actual:   {result}")
        else:
            success_count += 1

    print("-" * 75)
    print(f"Total: {success_count}/{len(test_cases)} passed")

if __name__ == "__main__":
    test_nlu()
