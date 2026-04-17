import google.generativeai as genai
genai.configure(api_key="AIzaSyCuPhh6n7ujGy8BTbApY2bQ3aH1rFnx4ZI")
with open("models.txt", "w") as f:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            f.write(m.name + "\n")
