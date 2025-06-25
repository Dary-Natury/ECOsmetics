import os
import json
import psycopg2
from psycopg2.extras import Json 
from dotenv import load_dotenv

load_dotenv() 

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:password@localhost:5432/holistic_db')

def create_tables(conn):
    """Tworzy tabele w bazie danych."""
    commands = (
        """
        DROP TABLE IF EXISTS products;
        """,
        """
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            link TEXT,
            criteria JSONB,
            main_ingredients TEXT[],
            ingredients TEXT
        );
        """
    )
    cur = conn.cursor()
    try:
        for command in commands:
            cur.execute(command)
        cur.close()
        conn.commit()
        print("Tabela 'products' została utworzona (lub zresetowana).")
    except (Exception, psycopg2.DatabaseError) as error:
        print(f"Błąd podczas tworzenia tabel: {error}")
        conn.rollback()
        cur.close()


def insert_products(conn, products_data):
    """Wstawia dane produktów do tabeli."""
    sql = """INSERT INTO products(id, name, link, criteria, main_ingredients, ingredients)
             VALUES(%s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING;"""
    cur = conn.cursor()
    try:
        for product in products_data:
            cur.execute(sql, (
                product.get('id'),
                product.get('name'),
                product.get('link'),
                Json(product.get('criteria', {})), 
                product.get('mainIngredients', []),
                product.get('ingredients')
            ))
        conn.commit()
        cur.close()
        print(f"Wstawiono/zaktualizowano dane dla {len(products_data)} produktów (ignorując duplikaty ID).")
    except (Exception, psycopg2.DatabaseError) as error:
        print(f"Błąd podczas wstawiania produktów: {error}")
        conn.rollback()
        cur.close()

if __name__ == '__main__':
    json_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'products.json')

    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            products_list = json.load(f)
    except FileNotFoundError:
        print(f"BŁĄD: Plik {json_file_path} nie został znaleziony.")
        print("JSON nie odnaleziony.")
        exit()
    except json.JSONDecodeError as e:
        print(f"BŁĄD: Niepoprawny format JSON w pliku {json_file_path}: {e}")
        exit()
    except Exception as e:
        print(f"BŁĄD: Nieoczekiwany błąd podczas ładowania pliku JSON: {e}")
        exit()


    conn = None
    try:
        print(f"Próba połączenia z bazą danych: {DATABASE_URL.split('@')[-1]}")
        conn = psycopg2.connect(DATABASE_URL)
        print("Połączono z bazą danych.")
        create_tables(conn)
        insert_products(conn, products_list)
    except psycopg2.OperationalError as e:
        print(f"BŁĄD KRYTYCZNY: Nie można połączyć się z bazą danych PostgreSQL.")
        print(f"Szczegóły: {e}")
        print("Sprawdź, czy usługa PostgreSQL (kontener 'db') działa i czy DATABASE_URL jest poprawnie skonfigurowany.")
    except (Exception, psycopg2.DatabaseError) as error:
        print(f"Błąd operacji na bazie danych: {error}")
    finally:
        if conn is not None:
            conn.close()
            print("Połączenie z bazą danych zostało zamknięte.")