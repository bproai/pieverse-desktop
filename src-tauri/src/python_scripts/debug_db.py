#!/usr/local/bin/python3
# debug_db.py - A simple script to debug the database

import sys
import sqlite3
import pandas as pd

def debug_database(db_path):
    """Debug the database and show its contents."""
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Print database metadata
        print(f"\n=== Database: {db_path} ===")
        
        # List all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        print(f"\nTables in database: {[t[0] for t in tables]}")
        
        # Print schema for each table
        for table in tables:
            table_name = table[0]
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = cursor.fetchall()
            print(f"\nSchema for {table_name}:")
            for col in columns:
                print(f"  - {col[1]} ({col[2]})")
        
        # Check trend_data table content
        if 'trend_data' in [t[0] for t in tables]:
            # Count records
            cursor.execute("SELECT COUNT(*) FROM trend_data")
            count = cursor.fetchone()[0]
            print(f"\nTotal records in trend_data: {count}")
            
            # Count by keyword
            cursor.execute("SELECT keyword, COUNT(*) FROM trend_data GROUP BY keyword")
            keyword_counts = cursor.fetchall()
            print("\nRecords by keyword:")
            for keyword, count in keyword_counts:
                print(f"  - {keyword}: {count}")
            
            # Sample data
            cursor.execute("SELECT keyword, timestamp, value, region, created_at FROM trend_data LIMIT 5")
            sample_data = cursor.fetchall()
            print("\nSample data:")
            for row in sample_data:
                print(f"  {row}")
            
            # Check specifically for 'deepseek'
            cursor.execute("SELECT COUNT(*) FROM trend_data WHERE keyword='deepseek'")
            deepseek_count = cursor.fetchone()[0]
            print(f"\nRecords for 'deepseek': {deepseek_count}")
            
            if deepseek_count > 0:
                # Get date range
                cursor.execute("SELECT MIN(timestamp), MAX(timestamp) FROM trend_data WHERE keyword='deepseek'")
                min_date, max_date = cursor.fetchone()
                print(f"Date range for 'deepseek': {min_date} to {max_date}")
                
                # Get value range
                cursor.execute("SELECT MIN(value), MAX(value) FROM trend_data WHERE keyword='deepseek'")
                min_val, max_val = cursor.fetchone()
                print(f"Value range for 'deepseek': {min_val} to {max_val}")
                
                # Check regions
                cursor.execute("SELECT DISTINCT region FROM trend_data WHERE keyword='deepseek'")
                regions = cursor.fetchall()
                print(f"Regions for 'deepseek': {[r[0] for r in regions]}")
            
            # Try the query from get_historical_data
            query = """
            SELECT timestamp, value FROM trend_data 
            WHERE keyword = ? 
            AND (region = ? OR (region IS NULL AND ? IS NULL))
            AND timestamp >= date('now', ?)
            ORDER BY timestamp
            """
            
            params = ('deepseek', None, None, '-90 days')
            
            # Execute the query directly
            cursor.execute(query, params)
            results = cursor.fetchall()
            print(f"\nResults from original query with date filter: {len(results)} rows")
            
            # Try without date filter
            query_no_date = """
            SELECT timestamp, value FROM trend_data 
            WHERE keyword = ? 
            AND (region = ? OR (region IS NULL AND ? IS NULL))
            ORDER BY timestamp
            """
            
            params_no_date = ('deepseek', None, None)
            
            # Execute the query directly
            cursor.execute(query_no_date, params_no_date)
            results_no_date = cursor.fetchall()
            print(f"Results from query without date filter: {len(results_no_date)} rows")
            
            # Check if SQLite date function is working
            cursor.execute("SELECT date('now'), date('now', '-90 days')")
            now, days_ago = cursor.fetchone()
            print(f"Current date according to SQLite: {now}")
            print(f"90 days ago according to SQLite: {days_ago}")
            
            # Check how many records would be selected with the date filter
            cursor.execute("SELECT COUNT(*) FROM trend_data WHERE keyword='deepseek' AND timestamp >= date('now', '-90 days')")
            count_with_date = cursor.fetchone()[0]
            print(f"Records for 'deepseek' in last 90 days: {count_with_date}")
            
    except Exception as e:
        print(f"Error during database debugging: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python debug_db.py <database_path>")
        sys.exit(1)
    
    db_path = sys.argv[1]
    debug_database(db_path)
