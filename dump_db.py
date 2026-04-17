import sqlite3
import json

DB_FILE = 'clinic.db'

def dump_hospitals():
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('SELECT * FROM hospitals')
        rows = c.fetchall()
        columns = [description[0] for description in c.description]
        data = []
        for row in rows:
            data.append(dict(zip(columns, row)))
        print(json.dumps(data, indent=2))
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    dump_hospitals()
