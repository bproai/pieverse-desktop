#!/usr/local/bin/python3
# src-tauri/python_scripts/trend_spike_predictor.py

import json
import sys
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pytrends.request import TrendReq
from sklearn.ensemble import IsolationForest, RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from prophet import Prophet
import sqlite3
import requests
from bs4 import BeautifulSoup
import re
import threading
import time
import traceback

class TrendSpikePredictor:
    def __init__(self, db_path):
        """Initialize the trend spike predictor with a database for storing historical data."""
        self.pytrends = TrendReq(hl='en-US', tz=360)
        self.db_path = db_path
        self._ensure_db_setup()
        # Max number of threads to use for related term fetching
        self.max_threads = 5
        
    def _ensure_db_setup(self):
        """Create the necessary database tables if they don't exist."""
        conn = sqlite3.connect(self.db_path)
        
        # Table for storing raw Google Trends data
        conn.execute('''
        CREATE TABLE IF NOT EXISTS trend_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT,
            timestamp TEXT,
            value REAL,
            region TEXT,
            created_at TEXT
        )
        ''')
        
        # Table for storing predictions and alerts
        conn.execute('''
        CREATE TABLE IF NOT EXISTS trend_predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT,
            probability REAL,
            forecast TEXT, -- JSON string of forecast data
            detected_at TEXT,
            predicted_spike_date TEXT,
            status TEXT, -- 'pending', 'confirmed', 'false_positive'
            signals TEXT, -- JSON string of signal data that led to prediction
            is_read INTEGER DEFAULT 0
        )
        ''')
        
        # Table for storing related terms that may be leading indicators
        conn.execute('''
        CREATE TABLE IF NOT EXISTS related_terms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            main_keyword TEXT,
            related_term TEXT,
            correlation REAL,
            lead_time_days REAL,
            last_updated TEXT
        )
        ''')
        
        # Table for social media/news volume tracking
        conn.execute('''
        CREATE TABLE IF NOT EXISTS social_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT,
            source TEXT, -- 'twitter', 'reddit', 'news', etc.
            timestamp TEXT,
            volume INTEGER,
            sentiment REAL,
            created_at TEXT
        )
        ''')
        
        conn.commit()
        conn.close()
    
    def _get_time_frame(self, time_range, end_date=None):
        """Convert time range code to pytrends timeframe string."""
        if end_date is None:
            end_date = datetime.now()
        
        if time_range == "1d":
            start_date = end_date - timedelta(days=1)
        elif time_range == "7d":
            start_date = end_date - timedelta(days=7)
        elif time_range == "30d":
            start_date = end_date - timedelta(days=30)
        elif time_range == "90d":
            start_date = end_date - timedelta(days=90)
        elif time_range == "12m":
            start_date = end_date - timedelta(days=365)
        elif time_range == "5y":
            start_date = end_date - timedelta(days=5*365)
        else:
            # Default to 90 days (good for spike prediction)
            start_date = end_date - timedelta(days=90)
        
        # Format dates for pytrends
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        return f"{start_str} {end_str}"
    
    def fetch_and_store_trends(self, keywords, time_range="90d", region=None):
        """Fetch Google Trends data and store in the database."""
        try:
            # Get timeframe string
            timeframe = self._get_time_frame(time_range)
            
            # Build the payload for each keyword separately (better data quality)
            results = []
            conn = sqlite3.connect(self.db_path)
            
            for keyword in keywords:
                try:
                    self.pytrends.build_payload(
                        kw_list=[keyword],
                        cat=0,  # Category: All categories
                        timeframe=timeframe,
                        geo=region if region else '',
                        gprop=''  # Search type: web searches
                    )
                    
                    # Get interest over time
                    interest_df = self.pytrends.interest_over_time()
                    
                    if interest_df.empty:
                        continue
                    
                    # Store in database and collect results
                    for index, row in interest_df.iterrows():
                        date_str = index.strftime('%Y-%m-%d')
                        value = float(row[keyword])
                        
                        # Store in database
                        conn.execute(
                            """
                            INSERT INTO trend_data 
                            (keyword, timestamp, value, region, created_at) 
                            VALUES (?, ?, ?, ?, datetime('now'))
                            """,
                            (keyword, date_str, value, region or "global")
                        )
                        
                        # Add to results
                        results.append({
                            "keyword": keyword,
                            "date": date_str,
                            "value": value,
                            "region": region
                        })
                    
                    conn.commit()
                    
                    # Fetch and store related terms that might be leading indicators
                    try:
                        related_queries = self.pytrends.related_queries()
                        if keyword in related_queries and related_queries[keyword]:
                            # Process top related queries
                            if 'top' in related_queries[keyword] and not related_queries[keyword]['top'].empty:
                                self._process_related_terms(keyword, related_queries[keyword]['top']['query'].tolist())
                            
                            # Process rising related queries (more important for prediction)
                            if 'rising' in related_queries[keyword] and not related_queries[keyword]['rising'].empty:
                                rising_terms = related_queries[keyword]['rising']['query'].tolist()
                                self._process_related_terms(keyword, rising_terms, is_rising=True)
                    except Exception as e:
                        print(f"Error processing related terms for {keyword}: {e}", file=sys.stderr)
                    
                except Exception as e:
                    print(f"Error processing keyword {keyword}: {e}", file=sys.stderr)
                    traceback.print_exc(file=sys.stderr)
                
                # Sleep to avoid rate limiting
                time.sleep(1)
            
            conn.close()
            
            return {
                "status": "success",
                "results": results
            }
        
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            return {
                "status": "error",
                "message": str(e)
            }
    
    def _process_related_terms(self, main_keyword, related_terms, is_rising=False):
        """
        Process related terms and analyze them as potential leading indicators.
        """
        # Use a thread pool to process multiple terms in parallel
        threads = []
        results = []
        
        def process_term(term):
            try:
                # Get historical data for the main keyword
                main_data = self.get_historical_data(main_keyword, days=120)
                
                # Get historical data for the related term
                term_data = self.get_historical_data(term, days=120)
                
                if len(main_data) < 30 or len(term_data) < 30:
                    return None
                
                # Merge the data on timestamp
                merged = pd.merge(
                    term_data.rename(columns={'value': 'term_value'}),
                    main_data.rename(columns={'value': 'main_value'}),
                    on='timestamp', how='inner'
                )
                
                if len(merged) < 30:
                    return None
                
                # Check if the term might be a leading indicator
                # We'll look for cross-correlation with different lag values
                max_correlation = 0
                lead_time = 0
                
                for lag in range(1, 14):  # Test lags from 1 to 14 days
                    # Shift the main keyword data by the lag
                    merged[f'main_shifted_{lag}'] = merged['main_value'].shift(-lag)
                    
                    # Calculate correlation between term value and shifted main value
                    correlation = merged['term_value'].corr(merged[f'main_shifted_{lag}'])
                    
                    if not np.isnan(correlation) and abs(correlation) > abs(max_correlation):
                        max_correlation = correlation
                        lead_time = lag
                
                # If we found a significant correlation, store it
                if abs(max_correlation) > 0.5 and lead_time > 0:
                    # Rising terms get a boost in significance
                    significance = max_correlation * (1.5 if is_rising else 1.0)
                    
                    return {
                        'main_keyword': main_keyword,
                        'related_term': term,
                        'correlation': significance,
                        'lead_time_days': lead_time
                    }
                
                return None
            
            except Exception as e:
                print(f"Error analyzing related term {term}: {e}", file=sys.stderr)
                return None
        
        # Process terms in parallel with limited threads
        for i in range(0, len(related_terms), self.max_threads):
            batch = related_terms[i:i + self.max_threads]
            threads = []
            
            for term in batch:
                thread = threading.Thread(target=lambda: results.append(process_term(term)))
                threads.append(thread)
                thread.start()
            
            # Wait for all threads to complete
            for thread in threads:
                thread.join()
            
            # Give Google a break to avoid rate limiting
            time.sleep(2)
        
        # Filter out None results and store in database
        valid_results = [r for r in results if r is not None]
        
        if valid_results:
            conn = sqlite3.connect(self.db_path)
            
            for result in valid_results:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO related_terms 
                    (main_keyword, related_term, correlation, lead_time_days, last_updated) 
                    VALUES (?, ?, ?, ?, datetime('now'))
                    """,
                    (result['main_keyword'], result['related_term'], result['correlation'], result['lead_time_days'])
                )
            
            conn.commit()
            conn.close()
    
    def get_historical_data(self, keyword, days=90, region=None):
        """Get historical data for a keyword from the database."""
        conn = sqlite3.connect(self.db_path)
        
        # Simplified query based on what we know works
        query = """
        SELECT timestamp, value FROM trend_data 
        WHERE keyword = ?
        ORDER BY timestamp
        """
        
        params = (keyword,)
        
        data = pd.read_sql_query(query, conn, params=params)
        conn.close()
        
        if data.empty:
            print(f"No historical data found for {keyword}", file=sys.stderr)
            return pd.DataFrame(columns=['timestamp', 'value'])
        
        # Debug output
        print(f"Found {len(data)} records for {keyword}", file=sys.stderr)
        
        # Deduplicate the data by taking the average for each day
        print(f"Deduplicating data...", file=sys.stderr)
        data = data.groupby('timestamp').agg({'value': 'mean'}).reset_index()
        print(f"After deduplication: {len(data)} records", file=sys.stderr)
        
        return data

    def get_leading_indicators(self, keyword):
        """
        Get related terms that have been identified as potential leading indicators
        for the given keyword.
        """
        conn = sqlite3.connect(self.db_path)
        
        query = """
        SELECT related_term, correlation, lead_time_days 
        FROM related_terms
        WHERE main_keyword = ?
        ORDER BY ABS(correlation) DESC
        LIMIT 10
        """
        
        data = pd.read_sql_query(query, conn, params=(keyword,))
        conn.close()
        
        return data
    
    def fetch_social_signals(self, keyword):
        """
        Fetch social media and news signals for a keyword.
        This is a placeholder - in a real implementation, you would 
        connect to actual social media APIs.
        """
        # For demonstration, we'll generate some random data
        # In a real implementation, you'd connect to Twitter/X API, 
        # Reddit API, News APIs, etc.
        
        now = datetime.now()
        signals = []
        
        # Generate 14 days of fake social data
        for days_ago in range(14, -1, -1):
            date = now - timedelta(days=days_ago)
            date_str = date.strftime('%Y-%m-%d')
            
            # Different volume and sentiment for each source
            sources = [
                ('twitter', np.random.randint(100, 1000), np.random.normal(0, 0.5)),
                ('reddit', np.random.randint(50, 500), np.random.normal(0, 0.5)),
                ('news', np.random.randint(10, 100), np.random.normal(0, 0.5))
            ]
            
            for source, volume, sentiment in sources:
                signals.append({
                    'keyword': keyword,
                    'source': source,
                    'timestamp': date_str,
                    'volume': volume,
                    'sentiment': sentiment
                })
        
        # Store in database
        conn = sqlite3.connect(self.db_path)
        
        for signal in signals:
            conn.execute(
                """
                INSERT INTO social_signals
                (keyword, source, timestamp, volume, sentiment, created_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                """,
                (signal['keyword'], signal['source'], signal['timestamp'], 
                 signal['volume'], signal['sentiment'])
            )
        
        conn.commit()
        conn.close()
        
        return signals
    
    def get_social_signals(self, keyword, days=14):
        """
        Get social signals from the database.
        """
        conn = sqlite3.connect(self.db_path)
        
        query = """
        SELECT keyword, source, timestamp, volume, sentiment
        FROM social_signals
        WHERE keyword = ?
        AND timestamp >= date('now', ?)
        ORDER BY timestamp, source
        """
        
        data = pd.read_sql_query(query, conn, params=(keyword, f'-{days} days'))
        conn.close()
        
        return data
    
    # Modify to show the last 15 data points:
    def predict_spike(self, keyword, sensitivity=0.7, region=None):
        """
        Predict if a keyword is likely to experience a spike soon.
        Uses multiple signals to make the prediction.
        
        Returns: (probability, forecast_data, predicted_spike_date, signals)
        """
        # Get historical data first
        historical_data = self.get_historical_data(keyword, days=120, region=None)
        
        # TEMPORARY TEST: For "deepseek", filter data to simulate being at Jan 24, 2025
        # This includes less of the early signal (up to value 5.0) but not the major spike
        # if len(historical_data) > 0 and keyword.lower() == 'deepseek':
        #     cutoff_date = '2025-01-24'  # Include data showing early rise from 1.0 to 5.0
        #     historical_data = historical_data[historical_data['timestamp'] <= cutoff_date]
        #     print(f"TESTING PREDICTIVE POWER: Limited data to before {cutoff_date}")
        #     print(f"Data points available: {len(historical_data)}")
            
        #     # Print the last 15 data points to see the trend
        #     last_points = historical_data.tail(15).to_string()
        #     print(f"Last 15 data points:\n{last_points}")
        
        # Check if we have enough data
        if len(historical_data) < 30:
            # Not enough data
            return 0.0, [], None, {}
        
        # 1. Check if we have leading indicators for this keyword
        leading_indicators = self.get_leading_indicators(keyword)
        leading_indicator_signal = 0.0
        leading_signals = []
        
        if not leading_indicators.empty:
            # Fetch data for leading indicators
            for _, indicator in leading_indicators.iterrows():
                term = indicator['related_term']
                lead_time = indicator['lead_time_days']
                correlation = indicator['correlation']
                
                term_data = self.get_historical_data(term, days=30)
                
                if not term_data.empty:
                    # Check if the term is trending up recently
                    if len(term_data) >= 7:
                        recent_data = term_data.tail(7)
                        term_trend = np.polyfit(range(len(recent_data)), recent_data['value'], 1)[0]
                        
                        # If the term is trending up, it may signal a coming spike
                        if term_trend > 0:
                            # The strength of the signal depends on correlation and trend slope
                            signal_strength = abs(correlation) * term_trend * 0.1
                            leading_indicator_signal += signal_strength
                            
                            leading_signals.append({
                                'term': term,
                                'lead_time': lead_time,
                                'trend': term_trend,
                                'signal_strength': signal_strength
                            })
        
        # Scale the leading indicator signal to 0-1
        leading_indicator_signal = min(leading_indicator_signal, 1.0)
        
        # 2. Check for anomalies in recent data
        anomaly_signal = 0.0
        
        if len(historical_data) > 14:
            recent_data = historical_data.tail(14)
            
            # Use Isolation Forest to detect anomalies
            try:
                clf = IsolationForest(contamination=0.1, random_state=42)
                anomaly_scores = clf.fit_predict(recent_data[['value']])
                
                # -1 indicates anomaly, 1 indicates normal
                anomaly_count = sum(1 for score in anomaly_scores if score == -1)
                anomaly_signal = min(anomaly_count / 3, 1.0)  # Scale to 0-1
            except Exception as e:
                print(f"Anomaly detection error: {e}", file=sys.stderr)
        
        # 3. Calculate acceleration in trend data
        acceleration_signal = 0.0
        
        if len(historical_data) > 14:
            try:
                recent_data = historical_data.tail(14).copy()
                recent_data['diff'] = recent_data['value'].diff()
                recent_data['acceleration'] = recent_data['diff'].diff()
                
                if not recent_data['acceleration'].isnull().all():
                    # Get the average acceleration in the recent data
                    avg_accel = recent_data['acceleration'].dropna().mean()
                    
                    # Convert to a signal (positive acceleration = potential early spike)
                    if avg_accel > 0:
                        # Scale the acceleration to a signal between 0 and 1
                        acceleration_signal = min(avg_accel / 5, 1.0)
            except Exception as e:
                print(f"Acceleration calculation error: {e}", file=sys.stderr)
        
        # 4. Use Prophet for forecasting
        prophet_signal = 0.0
        forecast_data = []
        predicted_spike_date = None
        
        try:
            # Prepare data for Prophet
            prophet_df = historical_data.rename(columns={'timestamp': 'ds', 'value': 'y'})
            
            # Train Prophet model for forecasting
            model = Prophet(
                changepoint_prior_scale=0.15,  # More flexible trend
                seasonality_mode='multiplicative',  # Better for trend data
                daily_seasonality=False,
                weekly_seasonality=True,
                yearly_seasonality=False
            )
            model.fit(prophet_df)
            
            # Make future dataframe for the next 21 days
            future = model.make_future_dataframe(periods=21)
            forecast = model.predict(future)
            
            # Extract only future predictions
            future_forecast = forecast[forecast['ds'] > prophet_df['ds'].max()]
            
            # Calculate forecasted trend direction and acceleration
            if not future_forecast.empty:
                # Look for forecasted spike
                max_value_idx = future_forecast['yhat'].argmax()
                max_value_date = future_forecast.iloc[max_value_idx]['ds']
                max_value = future_forecast.iloc[max_value_idx]['yhat']
                
                # Get most recent value
                current_value = prophet_df.iloc[-1]['y']
                
                # Calculate forecasted growth
                growth_ratio = max_value / current_value if current_value > 0 else 1.0
                
                # If significant growth is forecasted, it's a signal
                if growth_ratio > 1.3:  # 30% growth threshold
                    prophet_signal = min((growth_ratio - 1.0) / 1.0, 1.0)  # Scale to 0-1
                    predicted_spike_date = max_value_date.strftime('%Y-%m-%d')
                
                # Format forecast data for return
                for _, row in future_forecast.iterrows():
                    forecast_data.append({
                        'date': row['ds'].strftime('%Y-%m-%d'),
                        'value': float(row['yhat']),
                        'lower': float(row['yhat_lower']),
                        'upper': float(row['yhat_upper'])
                    })
        except Exception as e:
            print(f"Prophet forecast error: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
        
        # 5. Get social media signals
        social_signal = 0.0
        
        # Try to fetch social signals from various sources
        try:
            # First check if we already have signals in the DB
            social_data = self.get_social_signals(keyword)
            
            if social_data.empty:
                # Fetch new social signals
                self.fetch_social_signals(keyword)
                social_data = self.get_social_signals(keyword)
            
            if not social_data.empty:
                # Group by date and source
                grouped = social_data.groupby(['timestamp', 'source']).agg({
                    'volume': 'sum',
                    'sentiment': 'mean'
                }).reset_index()
                
                # Calculate trends for each source
                sources = grouped['source'].unique()
                
                for source in sources:
                    source_data = grouped[grouped['source'] == source].sort_values('timestamp')
                    
                    if len(source_data) >= 7:
                        recent_data = source_data.tail(7)
                        # Calculate volume trend
                        volume_trend = np.polyfit(range(len(recent_data)), recent_data['volume'], 1)[0]
                        
                        # If volume is increasing, it's a signal
                        if volume_trend > 0:
                            # Different weights for different sources
                            weight = 1.0
                            if source == 'twitter':
                                weight = 1.2
                            elif source == 'reddit':
                                weight = 1.0
                            elif source == 'news':
                                weight = 1.5
                            
                            # Normalize by typical volumes for the source
                            norm_factor = recent_data['volume'].max() / 1000 if source == 'twitter' else \
                                        recent_data['volume'].max() / 500 if source == 'reddit' else \
                                        recent_data['volume'].max() / 100
                            
                            norm_factor = max(norm_factor, 1.0)
                            
                            signal = volume_trend * weight / norm_factor
                            social_signal += signal
            
            # Scale the social signal to 0-1
            social_signal = min(social_signal / 100, 1.0)
            
        except Exception as e:
            print(f"Social signal analysis error: {e}", file=sys.stderr)
        
        # 6. Combine signals with weights
        signals = [
            {'name': 'leading_indicators', 'value': leading_indicator_signal, 'weight': 0.30},
            {'name': 'anomalies', 'value': anomaly_signal, 'weight': 0.15},
            {'name': 'acceleration', 'value': acceleration_signal, 'weight': 0.20},
            {'name': 'prophet_forecast', 'value': prophet_signal, 'weight': 0.20},
            {'name': 'social_signals', 'value': social_signal, 'weight': 0.15}
        ]
        
        weighted_signals = [s['value'] * s['weight'] for s in signals]
        final_probability = sum(weighted_signals)
        
        # Adjust sensitivity (higher sensitivity = lower threshold for alerts)
        adjusted_probability = min(final_probability * (1.0 / max(0.1, sensitivity)), 1.0)
        
        # Add details to the signals
        signal_details = {
            'leading_indicators': {
                'value': leading_indicator_signal,
                'weight': 0.30,
                'details': leading_signals
            },
            'anomalies': {
                'value': anomaly_signal,
                'weight': 0.15
            },
            'acceleration': {
                'value': acceleration_signal,
                'weight': 0.20
            },
            'prophet_forecast': {
                'value': prophet_signal,
                'weight': 0.20,
                'predicted_spike_date': predicted_spike_date
            },
            'social_signals': {
                'value': social_signal,
                'weight': 0.15
            }
        }
        
        return adjusted_probability, forecast_data, predicted_spike_date, signal_details    

    def save_prediction(self, keyword, probability, forecast, predicted_spike_date, signals):
        """Save a trend spike prediction to the database."""
        conn = sqlite3.connect(self.db_path)
        
        conn.execute(
            """
            INSERT INTO trend_predictions 
            (keyword, probability, forecast, detected_at, predicted_spike_date, status, signals)
            VALUES (?, ?, ?, datetime('now'), ?, 'pending', ?)
            """,
            (keyword, probability, json.dumps(forecast), predicted_spike_date, json.dumps(signals))
        )
        
        conn.commit()
        conn.close()
    
    def monitor_keywords(self, keywords, threshold=0.7, region=None):
        """
        Monitor a list of keywords for potential spikes.
        Returns keywords with spike probabilities above threshold.
        """
        results = []
        
        for keyword in keywords:
            # First update our data
            self.fetch_and_store_trends([keyword], "90d", region)
            
            # Now predict spikes
            probability, forecast, predicted_date, signals = self.predict_spike(keyword, threshold, region)
            
            if probability >= threshold:
                # Save prediction to database
                self.save_prediction(keyword, probability, forecast, predicted_date, signals)
                
                results.append({
                    'keyword': keyword,
                    'probability': probability,
                    'forecast': forecast,
                    'predicted_spike_date': predicted_date,
                    'region': region,
                    'signals': signals
                })
        
        return results
    
    def get_predictions(self, limit=10, include_past=False):
        """Get recent spike predictions from the database."""
        conn = sqlite3.connect(self.db_path)
        
        status_filter = "" if include_past else "AND status = 'pending'"
        
        query = f"""
        SELECT id, keyword, probability, forecast, detected_at, predicted_spike_date, status, signals
        FROM trend_predictions
        WHERE is_read = 0 {status_filter}
        ORDER BY detected_at DESC
        LIMIT ?
        """
        
        rows = conn.execute(query, (limit,)).fetchall()
        
        predictions = []
        for row in rows:
            id, keyword, probability, forecast_json, detected_at, predicted_date, status, signals_json = row
            predictions.append({
                'id': id,
                'keyword': keyword,
                'probability': probability,
                'forecast': json.loads(forecast_json) if forecast_json else [],
                'detected_at': detected_at,
                'predicted_spike_date': predicted_date,
                'status': status,
                'signals': json.loads(signals_json) if signals_json else {}
            })
        
        conn.close()
        return predictions
    
    def mark_prediction_read(self, prediction_id):
        """Mark a prediction as read."""
        conn = sqlite3.connect(self.db_path)
        conn.execute("UPDATE trend_predictions SET is_read = 1 WHERE id = ?", (prediction_id,))
        conn.commit()
        conn.close()
        return True
    
    def update_prediction_status(self, prediction_id, status):
        """Update the status of a prediction (confirmed or false_positive)."""
        if status not in ['confirmed', 'false_positive']:
            return False
            
        conn = sqlite3.connect(self.db_path)
        conn.execute("UPDATE trend_predictions SET status = ? WHERE id = ?", (status, prediction_id))
        conn.commit()
        conn.close()
        return True
    
    def get_signal_sources(self, keyword):
        """Get a list of signal sources for a given keyword that might help predict spikes."""
        # Leading indicators (related terms)
        leading_indicators = self.get_leading_indicators(keyword)
        
        # Social signals
        social_sources = ['twitter', 'reddit', 'news']
        
        sources = {
            'leading_indicators': [row['related_term'] for _, row in leading_indicators.iterrows()],
            'social_sources': social_sources
        }
        
        return sources
        
def main():
    """Main function to handle command-line arguments."""
    if len(sys.argv) < 3:
        print("Usage: python trend_spike_predictor.py <db_path> <command> [args...]")
        print("Commands:")
        print("  fetch <keywords_comma_separated> <time_range> [region]")
        print("  predict <keyword> <threshold> [region]")
        print("  monitor <keywords_comma_separated> <threshold> [region]")
        print("  predictions [limit] [include_past]")
        print("  sources <keyword>")
        return
    
    db_path = sys.argv[1]
    command = sys.argv[2]
    
    predictor = TrendSpikePredictor(db_path)
    
    if command == "fetch":
        if len(sys.argv) < 5:
            print("Usage: python trend_spike_predictor.py <db_path> fetch <keywords_comma_separated> <time_range> [region]")
            return
        
        keywords = sys.argv[3].split(',')
        time_range = sys.argv[4]
        region = sys.argv[5] if len(sys.argv) > 5 else None
        
        result = predictor.fetch_and_store_trends(keywords, time_range, region)
        print(json.dumps(result))
    
    elif command == "predict":
        # Check if we have enough arguments
        if len(sys.argv) < 4:
            print("Usage: python trend_spike_predictor.py <db_path> predict <keyword> <threshold> [region]")
            print(json.dumps({
                "status": "error", 
                "message": "Missing required arguments"
            }))
            return
        
        # Make sure to assign values safely
        try:
            keyword = sys.argv[3]
            threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.7
            region = sys.argv[5] if len(sys.argv) > 5 else None
            
            # Now do the prediction
            probability, forecast, predicted_date, signals = predictor.predict_spike(keyword, threshold, region)
            
            # Make sure signals is a dict (not None or something else)
            if not isinstance(signals, dict):
                signals = {}
            
            # Make sure signals has all required fields
            if 'leading_indicators' not in signals:
                signals['leading_indicators'] = {'value': 0.0, 'weight': 0.3, 'details': []}
            if 'anomalies' not in signals:
                signals['anomalies'] = {'value': 0.0, 'weight': 0.15}
            if 'acceleration' not in signals:
                signals['acceleration'] = {'value': 0.0, 'weight': 0.2}
            if 'prophet_forecast' not in signals:
                signals['prophet_forecast'] = {'value': 0.0, 'weight': 0.2}
            if 'social_signals' not in signals:
                signals['social_signals'] = {'value': 0.0, 'weight': 0.15}
            
            result = {
                'keyword': keyword,
                'probability': probability,
                'forecast': forecast,
                'predicted_spike_date': predicted_date,
                'signals': signals
            }
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({
                "status": "error",
                "message": f"Error processing prediction: {str(e)}"
            }))

    elif command == "monitor":
        if len(sys.argv) < 5:
            print("Usage: python trend_spike_predictor.py <db_path> monitor <keywords_comma_separated> <threshold> [region]")
            return
        
        keywords = sys.argv[3].split(',')
        threshold = float(sys.argv[4])
        region = sys.argv[5] if len(sys.argv) > 5 else None
        
        results = predictor.monitor_keywords(keywords, threshold, region)
        print(json.dumps(results))
    
    elif command == "predictions":
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        include_past = sys.argv[4].lower() == "true" if len(sys.argv) > 4 else False
        
        predictions = predictor.get_predictions(limit, include_past)
        print(json.dumps(predictions))
    
    elif command == "sources":
        if len(sys.argv) < 4:
            print("Usage: python trend_spike_predictor.py <db_path> sources <keyword>")
            return
            
        keyword = sys.argv[3]
        sources = predictor.get_signal_sources(keyword)
        print(json.dumps(sources))
    
    else:
        print(f"Unknown command: {command}")

if __name__ == "__main__":
    main()
