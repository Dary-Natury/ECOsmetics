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

def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"BŁĄD: Nie udało się połączyć z bazą danych: {e}")
        return None

@app.route('/')
def hello():
    return "Backend Holistyczny Dobór Kosmetyków działa!"

@app.route('/api/products', methods=['GET'])
def get_products_route():
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Błąd połączenia z bazą danych"}), 500
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    products_list = []
    try:
        cur.execute('SELECT id, name, link, criteria, main_ingredients, ingredients FROM products ORDER BY id;')
        products_list = cur.fetchall()
    except Exception as e:
        print(f"BŁĄD: Błąd podczas pobierania produktów: {e}")
        return jsonify({"error": "Błąd podczas pobierania produktów z bazy danych"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
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

    prompt_parts = [
        "Jesteś wysoce kompetentnym ekspertem w dziedzinie kosmetologii i formulacji kosmetyków. Twoim zadaniem jest stworzenie klarownej, przykładowej, prostej i bezpiecznej receptury kosmetycznej, przeznaczonej do przygotowania w warunkach domowych, wraz z instrukcją wykonania krok po kroku.",
        f"Formuła ma dotyczyć produktu typu: '{product_type}'.",
        f"Główną bazą (nośnikiem) produktu jest: '{base_ingredient}'.",
    ]

    if active_ingredients:
        prompt_parts.append(f"Główne wybrane przez użytkownika składniki aktywne, które należy uwzględnić w recepturze to: {', '.join(active_ingredients)}. Proszę użyć ich w typowych, bezpiecznych stężeniach dla kosmetyków domowych.")
    else:
        prompt_parts.append("Użytkownik nie wybrał specyficznych składników aktywnych. Na podstawie podanego typu produktu i bazy, zasugeruj 1 do 3 popularnych, bezpiecznych i synergicznie działających składników aktywnych, które będą odpowiednie.")

    prompt_parts.extend([
        "Receptura musi być podana w procentach (%), a suma wszystkich składników powinna być bardzo bliska 100% (np. 99-100%).",
        "Dla każdego składnika w recepturze podaj jego dokładną nazwę, stężenie procentowe oraz zwięźle opisz jego główną rolę/funkcję w produkcie.",
        "Odpowiedź musi być sformułowana wyłącznie w języku POLSKIM.",
        "Format odpowiedzi powinien składać się z dwóch głównych sekcji:",
        "1. Sekcja 'RECEPTURA:', zawierająca listę składników. Każdy składnik w nowej linii, zaczynając od myślnika (-). Przykład formatowania składnika: '- Nazwa Składnika (np. Olej jojoba): XX% (rola: np. emolient, nawilżenie)'.",
        "2. Sekcja 'INSTRUKCJA WYKONANIA KROK PO KROKU:', zawierająca numerowaną listę prostych kroków, jak połączyć składniki, aby stworzyć gotowy produkt. Instrukcja powinna być zrozumiała dla osoby bez specjalistycznej wiedzy chemicznej, z uwzględnieniem podstawowych zasad bezpieczeństwa (np. praca w czystych warunkach, używanie odpowiednich naczyń).",
        "Nie dodawaj żadnych zdań wstępnych, powitalnych, tytułów (poza nagłówkami sekcji), podsumowań, pożegnań ani żadnych innych komentarzy poza tymi dwiema sekcjami.",
        "Przykład struktury odpowiedzi:",
        "RECEPTURA:",
        "- Składnik A: X% (rola A)",
        "- Składnik B: Y% (rola B)",
        "INSTRUKCJA WYKONANIA KROK PO KROKU:",
        "1. Odmierz składnik A.",
        "2. Powoli dodawaj składnik B do składnika A, ciągle mieszając.",
        "3. Mieszaj aż do uzyskania jednolitej konsystencji.",
        "Jeśli dodajesz wodę, nazwij ją 'Woda destylowana' lub 'Hydrolat XYZ'.",
        "Pamiętaj o dodaniu odpowiedniego konserwantu w bezpiecznym stężeniu, jeśli receptura zawiera fazę wodną, i wspomnij o tym w instrukcji. Zaproponuj jakiś naturalny konserwant np: witamina C"
    ])
    
    prompt = "\n".join(prompt_parts)
    
    print(f"--- Pełny prompt wysyłany do Ollama ---\n{prompt}\n-----------------------------------------")

    try:
        ollama_payload = {
            "model": "mistral:latest", 
            "prompt": prompt,
            "system": "Jesteś precyzyjnym asystentem AI, specjalizującym się w tworzeniu domowych receptur kosmetycznych wraz z instrukcjami ich wykonania. Odpowiadasz wyłącznie w języku polskim i ściśle trzymasz się wymaganego formatu odpowiedzi, dostarczając sekcję RECEPTURA i sekcję INSTRUKCJA WYKONANIA KROK PO KROKU.",
            "stream": False,
            "options": {
                 "temperature": 0.4,
                 "top_p": 0.9,
                 # "num_predict": 512 
            }
        }
        print(f"Wysyłanie zapytania do Ollama: {OLLAMA_API_URL} z modelem {ollama_payload['model']}")
        
        response = requests.post(OLLAMA_API_URL, json=ollama_payload, timeout=180)
        response.raise_for_status() 
        
        ollama_response_data = response.json()
        generated_text = ollama_response_data.get('response', 'Przepraszam, nie udało mi się wygenerować odpowiedzi. Spróbuj ponownie.')
        
        cleaned_text = generated_text.strip()

        print(f"Otrzymano odpowiedź od Ollamy (pierwsze 500 znaków):\n{cleaned_text[:500]}...") 
        return jsonify({"formula": cleaned_text})

    except requests.exceptions.Timeout:
        print("BŁĄD: Przekroczono czas oczekiwania na odpowiedź od Ollama.")
        return jsonify({"error": "Serwer AI zbyt długo nie odpowiadał. Spróbuj ponownie później."}), 504
    except requests.exceptions.ConnectionError:
        print(f"BŁĄD: Nie można połączyć się z Ollama pod adresem: {OLLAMA_API_URL}.")
        return jsonify({"error": f"Nie można połączyć się z serwerem AI. Upewnij się, że usługa 'ollama' działa poprawnie."}), 503
    except requests.exceptions.RequestException as e:
        print(f"BŁĄD: Błąd komunikacji z Ollama: {e}")
        return jsonify({"error": f"Błąd komunikacji z serwerem AI: {str(e)}"}), 500
    except Exception as e:
        print(f"BŁĄD: Wystąpił nieoczekiwany błąd serwera: {e}")
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500

#if __name__ == '__main__':        
#    app.run(debug=False, host='0.0.0.0', port=5000)