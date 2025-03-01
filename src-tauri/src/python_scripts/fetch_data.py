#!/usr/local/bin/python3
# fetch_data.py - Directly fetch data from the database

import sys
import sqlite3
import pandas as pd

def fetch_data(db_path, keyword):
    """Fetch data for a specific keyword directly."""
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        
        # Try different query approaches
        
        # Approach 1: Direct SQL with pandas
        print("Approach 1: Using pandas read_sql_query")
        query1 = "SELECT * FROM trend_data WHERE keyword=?"
        data1 = pd.read_sql_query(query1, conn, params=(keyword,))
        print(f"Found {len(data1)} rows")
        if not data1.empty:
            print("First 3 rows:")
            print(data1.head(3))
        
        # Approach 2: Direct SQL with cursor
        print("\nApproach 2: Using cursor execute")
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trend_data WHERE keyword=?", (keyword,))
        data2 = cursor.fetchall()
        print(f"Found {len(data2)} rows")
        if data2:
            print("First 3 rows:")
            for row in data2[:3]:
                print(row)
        
        # Approach 3: Try with single quotes in SQL
        print("\nApproach 3: Using literal string in SQL")
        cursor.execute(f"SELECT * FROM trend_data WHERE keyword='{keyword}'")
        data3 = cursor.fetchall()
        print(f"Found {len(data3)} rows")
        
        # Approach 4: Try with different region handling
        print("\nApproach 4: Testing region handling")
        cursor.execute("""
            SELECT * FROM trend_data 
            WHERE keyword=? 
            AND (region=? OR region IS NULL)
        """, (keyword, 'global'))
        data4 = cursor.fetchall()
        print(f"Found {len(data4)} rows")
        
        # Approach 5: Modify the original query
        print("\nApproach 5: Testing the problematic query")
        query5 = """
        SELECT timestamp, value FROM trend_data 
        WHERE keyword = ? 
        AND (region = ? OR (region IS NULL AND ? IS NULL))
        """
        cursor.execute(query5, (keyword, None, None))
        data5 = cursor.fetchall()
        print(f"Found {len(data5)} rows")
        
        # Clean up
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python fetch_data.py <database_path> <keyword>")
        sys.exit(1)
    
    db_path = sys.argv[1]
    keyword = sys.argv[2]
    fetch_data(db_path, keyword)
