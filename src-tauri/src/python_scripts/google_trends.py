#!/usr/bin/env python3
# src-tauri/python_scripts/google_trends.py

import json
import sys
import pandas as pd
from datetime import datetime, timedelta
from pytrends.request import TrendReq

def get_time_frame(time_range):
    """Convert time range code to pytrends timeframe string."""
    now = datetime.now()
    
    if time_range == "1d":
        start_date = now - timedelta(days=1)
    elif time_range == "7d":
        start_date = now - timedelta(days=7)
    elif time_range == "30d":
        start_date = now - timedelta(days=30)
    elif time_range == "90d":
        start_date = now - timedelta(days=90)
    elif time_range == "12m":
        start_date = now - timedelta(days=365)
    elif time_range == "5y":
        start_date = now - timedelta(days=5*365)
    else:
        # Default to 30 days
        start_date = now - timedelta(days=30)
    
    # Format dates for pytrends
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = now.strftime('%Y-%m-%d')
    
    return f"{start_str} {end_str}"

def get_trends(keywords, time_range, region=None):
    """Fetch Google Trends data for the specified keywords."""
    try:
        # Initialize pytrends
        pytrends = TrendReq(hl='en-US', tz=360)
        
        # Get the appropriate timeframe
        timeframe = get_time_frame(time_range)
        
        # Build the payload
        pytrends.build_payload(
            kw_list=keywords,
            cat=0,  # Category: All categories
            timeframe=timeframe,
            geo=region if region else '',
            gprop=''  # Search type: web searches
        )
        
        # Get interest over time
        interest_over_time_df = pytrends.interest_over_time()
        
        # If the dataframe is empty, return an error
        if interest_over_time_df.empty:
            return {
                "status": "error",
                "message": "No data available for the specified parameters."
            }
        
        # Convert the dataframe to a list of results
        results = []
        for index, row in interest_over_time_df.iterrows():
            date_str = index.strftime('%Y-%m-%d')
            
            for keyword in keywords:
                if keyword in row:
                    results.append({
                        "keyword": keyword,
                        "date": date_str,
                        "value": float(row[keyword]),
                        "region": region
                    })
        
        # Get related queries for the first keyword (if available)
        related_queries = []
        try:
            related_queries_dict = pytrends.related_queries()
            if keywords[0] in related_queries_dict and 'top' in related_queries_dict[keywords[0]]:
                top_queries = related_queries_dict[keywords[0]]['top']
                if not top_queries.empty:
                    related_queries = top_queries['query'].tolist()[:5]  # Get top 5
        except Exception as e:
            print(f"Error fetching related queries: {e}", file=sys.stderr)
        
        return {
            "status": "success",
            "results": results,
            "related_queries": related_queries
        }
    
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

def main():
    """Main function to handle command-line arguments."""
    if len(sys.argv) < 3:
        print("Usage: python google_trends.py <keywords_comma_separated> <time_range> [region]")
        return
    
    keywords = sys.argv[1].split(',')
    time_range = sys.argv[2]
    region = sys.argv[3] if len(sys.argv) > 3 else None
    
    result = get_trends(keywords, time_range, region)
    print(json.dumps(result))

if __name__ == "__main__":
    main()