import os
import psycopg2
from psycopg2.extras import RealDictCursor 
import requests 
from flask import Flask, request, jsonify
from flask_cors import CORS 
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app) 

DATABASE_URL = os.getenv('DATABASE_URL')
OLLAMA_API_URL = os.getenv('OLLAMA_API_URL', 'http://ollama:11434/api/generate') 
# Używamy nazwy usługi 'ollama' z docker-compose

def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"Błąd połączenia z bazą danych: {e}")
        return None

@app.route('/')
def hello():
    return "Backend Holistyczny Dobór Kosmetyków działa!"

@app.route('/api/products', methods=['GET'])
def get_products_route(): # Zmieniono nazwę funkcji, aby uniknąć konfliktu z potencjalną zmienną products
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Błąd połączenia z bazą danych"}), 500
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute('SELECT * FROM products ORDER BY id;')
        products_list = cur.fetchall() # Zmieniono nazwę zmiennej
    except Exception as e:
        print(f"Błąd podczas pobierania produktów: {e}")
        return jsonify({"error": "Błąd podczas pobierania produktów z bazy danych"}), 500
    finally:
        cur.close()
        conn.close()
    return jsonify(products_list)

@app.route('/api/ai/generate-formula', methods=['POST'])
def generate_formula_endpoint():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w zapytaniu (oczekiwano JSON)."}), 400
        
    product_type = data.get('product_type')
    base_ingredient = data.get('base')
    active_ingredients = data.get('actives', []) 

    if not product_type or not base_ingredient:
        return jsonify({"error": "Pola 'product_type' i 'base' są wymagane."}), 400

    prompt = f"Jesteś ekspertem w tworzeniu receptur kosmetycznych. Stwórz prostą, przykładową recepturę dla produktu typu '{product_type}'."
    prompt += f" Baza produktu to: '{base_ingredient}'."
    if active_ingredients:
        prompt += f" Główne składniki aktywne to: {', '.join(active_ingredients)}."
    prompt += " Podaj recepturę w procentach, z krótkim opisem roli każdego składnika (np. nośnik, nawilżenie, antyoksydant, humektant, stabilność)."
    prompt += " Skup się na bezpieczeństwie i typowych stężeniach. Formatuj każdy składnik w nowej linii zaczynając od myślnika, np.:\n- Nazwa Składnika: X% (rola)"


    try:
        ollama_payload = {
            "model": "phi", # Upewnij się, że ten model jest/będzie pobrany w kontenerze Ollama
            "prompt": prompt,
            "stream": False 
        }
        print(f"Wysyłanie zapytania do Ollama: {OLLAMA_API_URL} z modelem {ollama_payload['model']}")
        # print(f"Prompt dla Ollamy: {prompt}") # Możesz odkomentować do debugowania promptu

        response = requests.post(OLLAMA_API_URL, json=ollama_payload, timeout=90) # Zwiększony timeout
        response.raise_for_status() 
        
        ollama_response_data = response.json()
        generated_text = ollama_response_data.get('response', 'Przepraszam, nie udało mi się wygenerować odpowiedzi.')
        
        # Proste czyszczenie, aby spróbować uzyskać tylko listę składników
        lines = generated_text.split('\n')
        recipe_lines = [line.strip() for line in lines if line.strip().startswith('-') or '%' in line.strip()]
        
        if recipe_lines:
            cleaned_text = "\n".join(recipe_lines)
        else:
            # Jeśli powyższe nie zadziała, zwróć całą odpowiedź z małym formatowaniem
            cleaned_text = generated_text.strip()

        print(f"Otrzymano odpowiedź od Ollamy: {cleaned_text[:200]}...") # Pokaż początek odpowiedzi
        return jsonify({"formula": cleaned_text})

    except requests.exceptions.Timeout:
        print("BŁĄD: Przekroczono czas oczekiwania na odpowiedź od Ollama.")
        return jsonify({"error": "Przekroczono czas oczekiwania na odpowiedź od Ollama."}), 504
    except requests.exceptions.ConnectionError:
        print(f"BŁĄD: Nie można połączyć się z Ollama pod adresem: {OLLAMA_API_URL}.")
        return jsonify({"error": f"Nie można połączyć się z Ollama. Upewnij się, że usługa 'ollama' działa poprawnie w Dockerze."}), 503
    except requests.exceptions.RequestException as e:
        print(f"BŁĄD: Błąd komunikacji z Ollama: {e}")
        return jsonify({"error": f"Błąd komunikacji z Ollama: {str(e)}"}), 500
    except Exception as e:
        print(f"BŁĄD: Wystąpił nieoczekiwany błąd: {e}")
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd: {str(e)}"}), 500


if __name__ == '__main__':
    # W kontekście Dockera, init_db.py jest uruchamiany osobno przez 'docker-compose exec'.
    # Ta linia byłaby dla lokalnego developmentu bez Dockera i init_db.py nie jest tu potrzebny do uruchomienia serwera.
    # if not os.path.exists('.db_initialized'): # Prosty mechanizm flagi
    #    print("Pierwsze uruchomienie lub brak flagi, inicjalizacja bazy danych...")
    #    os.system(f'python {os.path.join(os.path.dirname(__file__), "init_db.py")}')
    #    with open('.db_initialized', 'w') as f: # Utwórz plik flagi
    #        f.write('initialized')
            
    app.run(debug=True, host='0.0.0.0', port=5000) 