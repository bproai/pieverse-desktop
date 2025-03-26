// src/components/Signals/SignalsPanel.tsx
import React, { useState, useEffect } from 'react';
import { Card, TextInput, Select, Button, Group, Text, Stack, Badge, Alert, Tabs, Grid, Progress, Table, ActionIcon, Menu, NumberInput, ScrollArea, Switch, Divider } from '@mantine/core';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, Download, AlertTriangle, BellRing, Settings, Plus, Trash, Play, Pause, RefreshCw, ChevronRight, Calendar, Info, Camera } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { notifications } from '@mantine/notifications';
import * as openerPlugin from '@tauri-apps/plugin-opener';
import DetectedSpikeCard from './DetectedSpikeCard';

// Debug mode toggle - set to true to enable debugging
const DEBUG_ENABLED = false;

// Types for trend data (existing)
interface TrendResult {
  keyword: string;
  date: string;
  value: number;
  region?: string;
}

interface TrendResponse {
  results: TrendResult[];
  status: string;
  message?: string;
}

// New types for spike prediction
interface ForecastPoint {
  date: string;
  value: number;
  lower: number;
  upper: number;
}

interface SignalSource {
  value: number;
  weight: number;
  details?: any[];
  predicted_spike_date?: string;
}

interface SignalDetails {
  leading_indicators: SignalSource;
  anomalies: SignalSource;
  acceleration: SignalSource;
  prophet_forecast: SignalSource;
  social_signals: SignalSource;
}

interface TrendPrediction {
  id?: number;
  keyword: string;
  probability: number;
  forecast: ForecastPoint[];
  detected_at?: string;
  predicted_spike_date?: string;
  status?: string;
  signals?: SignalDetails;
  region?: string;
}

const SignalsPanel = () => {
  // Standard trends tab state (existing)
  const [keywords, setKeywords] = useState<string>('');
  const [timeRange, setTimeRange] = useState<string>('90d');
  const [region, setRegion] = useState<string>('');
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [relatedQueries, setRelatedQueries] = useState<string[]>([]);
  
  // Add debugging for interval
  const [intervalDebug, setIntervalDebug] = useState<string[]>([]);
  
  // Spike prediction tab state (new)
  const [monitoredKeywords, setMonitoredKeywords] = useState<Record<string, string[]>>({});
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [newCategory, setNewCategory] = useState<string>('');
  const [newKeyword, setNewKeyword] = useState<string>('');
  const [predictions, setPredictions] = useState<TrendPrediction[]>([]);
  const [selectedPrediction, setSelectedPrediction] = useState<TrendPrediction | null>(null);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [threshold, setThreshold] = useState<number>(0.7);
  
  // Renamed to avoid conflict with global setInterval
  const [intervalValue, setIntervalValue] = useState<number>(60);

  // Debug-enabled setter for interval
  const debugSetInterval = (newVal: number, source: string) => {
    if (DEBUG_ENABLED) {
      console.log(`Interval changed to ${newVal} from ${intervalValue} (source: ${source})`);
      setIntervalDebug(prev => [...prev, `${new Date().toISOString()}: ${intervalValue} → ${newVal} (${source})`]);
    }
    setIntervalValue(newVal);
  };
  
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  
  // Load initial prediction data
  useEffect(() => {
    fetchPredictions();
    checkMonitoringStatus();
    fetchMonitoredKeywords();
  }, []);
  
  // Periodically refresh predictions when monitoring is active
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (isMonitoring) {
      timer = window.setInterval(() => {  // Use window.setInterval to avoid name conflicts
        fetchPredictions();
      }, 60000); // Check every minute
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isMonitoring]);
  
  // Updated screenshot function with better feedback
  const takeScreenshot = async () => {
    // First show a notification that we're taking a screenshot
    notifications.show({
      title: 'Taking Screenshot...',
      message: 'Capturing application window',
      color: 'blue',
      loading: true,
      autoClose: false,
      id: 'screenshot-progress'
    });

    try {
      // Call the Tauri backend to take a screenshot and copy to clipboard
      const result = await invoke<boolean>('take_screenshot_to_clipboard');
      
      // Close the progress notification
      notifications.hide('screenshot-progress');
      
      if (result) {
        // Show success notification
        notifications.show({
          title: 'Screenshot Captured',
          message: 'App screenshot copied to clipboard',
          color: 'green'
        });
      } else {
        setError('Failed to copy screenshot to clipboard');
        
        // Show error notification
        notifications.show({
          title: 'Screenshot Failed',
          message: 'Unable to capture screenshot. Check console for details.',
          color: 'red'
        });
      }
    } catch (err) {
      // Close the progress notification
      notifications.hide('screenshot-progress');
      
      console.error('Screenshot error:', err);
      setError(`Failed to take screenshot: ${err}`);
      
      // Show error notification
      notifications.show({
        title: 'Screenshot Failed',
        message: `Error: ${err}`,
        color: 'red'
      });
    }
  };

  // Standard trend fetching (existing)
  const fetchTrends = async () => {
    if (!keywords.trim()) {
      setError('Please enter at least one keyword');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const keywordList = keywords.split(',').map(k => k.trim());
      const data = await invoke<TrendResponse>('get_google_trends', {
        keywords: keywordList,
        timeRange,
        region: region || null
      });
      
      setTrendData(data);
      
      // Get related queries for the first keyword
      if (keywordList.length > 0) {
        const related = await invoke<string[]>('get_related_queries', {
          keyword: keywordList[0]
        });
        setRelatedQueries(related);
      }
    } catch (err) {
      setError(`Error fetching trend data: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const exportData = async () => {
    if (!trendData) return;
    
    try {
      // Import the dialog plugin dynamically to ensure we're using the latest API
      const { save } = await import('@tauri-apps/plugin-dialog');
      
      // Generate default filename based on keywords and date
      const keywordText = keywords.split(',')[0].trim().toLowerCase();
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const defaultFilename = `trend_data_${keywordText}_${currentDate}.csv`;
      
      const filePath = await save({
        defaultPath: `~/Downloads/${defaultFilename}`,
        filters: [{
          name: 'CSV',
          extensions: ['csv']
        }]
      });
      
      if (filePath) {
        await invoke('export_trends_data', {
          data: trendData,
          path: filePath
        });
        
        notifications.show({
          title: 'Export Successful',
          message: 'Data has been exported to CSV successfully',
          color: 'green'
        });
      }
    } catch (err) {
      console.error('Export error:', err);
      setError(`Failed to export data: ${err}`);
    }
  };

  // Format data for chart display with proper date sorting (existing)
  const getChartData = () => {
    if (!trendData) return [];
    
    // Group by date
    const dataByDate: Record<string, Record<string, number>> = {};
    
    trendData.results.forEach(result => {
      if (!dataByDate[result.date]) {
        dataByDate[result.date] = {};
      }
      dataByDate[result.date][result.keyword] = result.value;
    });
    
    // Convert to chart format
    const chartData = Object.keys(dataByDate).map(date => {
      return {
        date,
        ...dataByDate[date]
      };
    });
    
    // Sort by date properly (using Date objects for correct chronological sorting)
    return chartData.sort((a, b) => {
      // Handle different date formats
      let dateA = new Date(a.date);
      let dateB = new Date(b.date);
      
      // Check if the date is valid (some formats might need special handling)
      if (isNaN(dateA.getTime())) {
        // Try to parse "YYYY-MM-DD HH:MM" format
        const [datePart, timePart] = a.date.split(' ');
        if (datePart && timePart) {
          dateA = new Date(`${datePart}T${timePart}:00`);
        }
      }
      
      if (isNaN(dateB.getTime())) {
        // Try to parse "YYYY-MM-DD HH:MM" format
        const [datePart, timePart] = b.date.split(' ');
        if (datePart && timePart) {
          dateB = new Date(`${datePart}T${timePart}:00`);
        }
      }
      
      return dateA.getTime() - dateB.getTime();
    });
  };
  
  // New methods for spike prediction
  const fetchPredictions = async () => {
    try {
      const category = activeCategory !== 'all' ? activeCategory : undefined;
      const data = await invoke<TrendPrediction[]>('get_trend_predictions', { category });
      setPredictions(data);
      
      // Auto-select the first prediction if nothing is selected
      if (data.length > 0 && !selectedPrediction) {
        setSelectedPrediction(data[0]);
      }
    } catch (err) {
      setPredictionError(`Error fetching predictions: ${err}`);
    }
  };
  
  const fetchMonitoredKeywords = async () => {
    try {
      const data = await invoke<Record<string, string[]>>('get_trend_spike_monitored_keywords');
      setMonitoredKeywords(data);
    } catch (err) {
      setPredictionError(`Error fetching monitored keywords: ${err}`);
    }
  };
  
  const checkMonitoringStatus = async () => {
    try {
      const status = await invoke<boolean>('is_trend_spike_monitoring_active');
      setIsMonitoring(status);
    } catch (err) {
      setPredictionError(`Error checking monitoring status: ${err}`);
    }
  };
  
  const startMonitoring = async () => {
    try {
      if (DEBUG_ENABLED) {
        debugSetInterval(intervalValue, 'startMonitoring-before');
      }
      
      // First set the threshold and interval
      await invoke('set_trend_spike_threshold', { threshold });
      await invoke('set_trend_spike_interval', { minutes: intervalValue });
      
      // Then start monitoring
      const result = await invoke<boolean>('start_trend_spike_monitoring');
      setIsMonitoring(result);
      
      // Explicitly set the interval back to its current value for debugging
      if (DEBUG_ENABLED) {
        debugSetInterval(intervalValue, 'startMonitoring-after');
      }
      
      notifications.show({
        title: 'Monitoring Started',
        message: 'Trend spike detection is now active and will run in the background',
        color: 'green'
      });
    } catch (err) {
      setPredictionError(`Error starting monitoring: ${err}`);
    }
  };
  
  const stopMonitoring = async () => {
    try {
      const result = await invoke<boolean>('stop_trend_spike_monitoring');
      setIsMonitoring(!result);
      
      notifications.show({
        title: 'Monitoring Stopped',
        message: 'Trend spike detection has been paused',
        color: 'orange'
      });
    } catch (err) {
      setPredictionError(`Error stopping monitoring: ${err}`);
    }
  };
  
  const addKeyword = async () => {
    if (!newKeyword.trim() || !newCategory.trim()) {
      setPredictionError('Please enter both a category and keyword');
      return;
    }
    
    try {
      const result = await invoke<boolean>('add_trend_spike_keyword', {
        category: newCategory,
        keyword: newKeyword
      });
      
      if (result) {
        setNewKeyword('');
        fetchMonitoredKeywords();
        
        notifications.show({
          title: 'Keyword Added',
          message: `Now monitoring "${newKeyword}" in category "${newCategory}"`,
          color: 'green'
        });
      }
    } catch (err) {
      setPredictionError(`Error adding keyword: ${err}`);
    }
  };
  
  const removeKeyword = async (category: string, keyword: string) => {
    try {
      const result = await invoke<boolean>('remove_trend_spike_keyword', {
        category,
        keyword
      });
      
      if (result) {
        fetchMonitoredKeywords();
        
        notifications.show({
          title: 'Keyword Removed',
          message: `Stopped monitoring "${keyword}"`,
          color: 'orange'
        });
      }
    } catch (err) {
      setPredictionError(`Error removing keyword: ${err}`);
    }
  };
  
  const predictSingleKeyword = async () => {
    if (!newKeyword.trim()) {
      setPredictionError('Please enter a keyword to predict');
      return;
    }
    
    setIsPredicting(true);
    setPredictionError(null);
    
    try {
      const prediction = await invoke<TrendPrediction>('predict_trend_spike', {
        keyword: newKeyword
      });
      
      // Add the prediction to our list and select it
      if (prediction.probability > 0) {
        setPredictions([prediction, ...predictions]);
        setSelectedPrediction(prediction);
        
        notifications.show({
          title: 'Prediction Complete',
          message: `Spike probability for "${newKeyword}": ${(prediction.probability * 100).toFixed(1)}%`,
          color: prediction.probability > threshold ? 'red' : 'blue'
        });
      } else {
        notifications.show({
          title: 'No Spike Detected',
          message: `No significant spike probability found for "${newKeyword}"`,
          color: 'gray'
        });
      }
    } catch (err) {
      setPredictionError(`Error predicting trend spike: ${err}`);
    } finally {
      setIsPredicting(false);
    }
  };
  
  // Utility to format dates
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };
  
  // Get probability color based on value
  const getProbabilityColor = (probability: number) => {
    if (probability >= 0.8) return 'red';
    if (probability >= 0.6) return 'orange';
    if (probability >= 0.4) return 'yellow';
    return 'green';
  };
  
  const timeRangeOptions = [
    { value: '1d', label: 'Past 24 hours' },
    { value: '7d', label: 'Past 7 days' },
    { value: '30d', label: 'Past 30 days' },
    { value: '90d', label: 'Past 90 days' },
    { value: '12m', label: 'Past 12 months' },
    { value: '5y', label: 'Past 5 years' }
  ];

  return (
    <div>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Card.Section className="p-4 border-b">
          <Group justify="space-between">
            <Group>
              <TrendingUp size={20} />
              <Text weight={500} size="lg">Google Trends Signals</Text>
            </Group>
            <Group>
              <ActionIcon
                color="blue"
                variant="subtle"
                onClick={takeScreenshot}
                title="Take a screenshot and copy to clipboard"
              >
                <Camera size={18} />
              </ActionIcon>
              <Badge color="blue" variant="light">
                Beta
              </Badge>
            </Group>
          </Group>
        </Card.Section>

        <Tabs defaultValue="trends">
          <Tabs.List>
            <Tabs.Tab value="trends" icon={<TrendingUp size={16} />}>Trend Visualization</Tabs.Tab>
            <Tabs.Tab value="prediction" icon={<BellRing size={16} />}>Spike Prediction</Tabs.Tab>
            <Tabs.Tab value="settings" icon={<Settings size={16} />}>Settings</Tabs.Tab>
          </Tabs.List>

          {/* Original Trends Tab */}
          <Tabs.Panel value="trends" pt="md">
            <Stack spacing="md">
              <TextInput
                label="Keywords (comma separated)"
                placeholder="bitcoin, ethereum, solana"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                required
              />
              
              <Group grow>
                <Select
                  label="Time Range"
                  placeholder="Select time range"
                  data={timeRangeOptions}
                  value={timeRange}
                  onChange={(val) => setTimeRange(val || '90d')}
                />
                
                <TextInput
                  label="Region (optional)"
                  placeholder="US, GB, JP, etc."
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </Group>
              
              <Group>
                <Button
                  leftIcon={<TrendingUp size={16} />}
                  onClick={fetchTrends}
                  loading={isLoading}
                  disabled={!keywords.trim()}
                >
                  Fetch Trends
                </Button>
                
                <Button
                  leftIcon={<Download size={16} />}
                  onClick={exportData}
                  disabled={!trendData || isLoading}
                  variant="outline"
                >
                  Export as CSV
                </Button>
              </Group>
              
              {error && (
                <Alert icon={<AlertTriangle size={16} />} title="Error" color="red">
                  {error}
                </Alert>
              )}
              
              {trendData && (
                <>
                  <Card shadow="xs" p="md" radius="md" withBorder>
                    <Text size="sm" weight={500} mb="md">Trend Visualization</Text>
                    <div style={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getChartData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          {keywords.split(',').map((keyword, index) => (
                            <Line
                              key={keyword}
                              type="monotone"
                              dataKey={keyword.trim()}
                              stroke={`hsl(${index * 60}, 70%, 50%)`}
                              activeDot={{ r: 8 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                  
                  {relatedQueries.length > 0 && (
                    <Card shadow="xs" p="md" radius="md" withBorder>
                      <Text size="sm" weight={500} mb="md">Related Queries</Text>
                      <ul className="list-disc pl-5">
                        {relatedQueries.map((query, index) => (
                          <li key={index}>{query}</li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </>
              )}
            </Stack>
          </Tabs.Panel>

          {/* New Spike Prediction Tab */}
          <Tabs.Panel value="prediction" pt="md">
            {/* Display detected spike cards */}
            {predictions
              .filter((p) => p.probability >= 0.7) // adjust the threshold as needed
              .map((p) => (
                <DetectedSpikeCard
                  key={p.keyword + (p.detected_at || '')}
                  prediction={p}
                  getProbabilityColor={getProbabilityColor}
                />
              ))}            
            <Grid>
              {/* Left panel - Predictions list */}
              <Grid.Col span={4}>
                <Card shadow="xs" p="md" withBorder>
                  <Group position="apart" mb="md">
                    <Text weight={500}>Trend Spike Predictions</Text>
                    <Badge 
                      color={isMonitoring ? 'green' : 'gray'}
                      variant="filled"
                    >
                      {isMonitoring ? 'Monitoring Active' : 'Monitoring Paused'}
                    </Badge>
                  </Group>
                  
                  <Group mb="md">
                    <TextInput
                      placeholder="Enter keyword"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button 
                      onClick={predictSingleKeyword} 
                      loading={isPredicting}
                      disabled={!newKeyword.trim()}
                    >
                      Predict
                    </Button>
                  </Group>
                  
                  <Tabs defaultValue="all">
                    <Tabs.List>
                      <Tabs.Tab value="all" onClick={() => setActiveCategory('all')}>All</Tabs.Tab>
                      {Object.keys(monitoredKeywords).map(category => (
                        <Tabs.Tab 
                          key={category}
                          value={category}
                          onClick={() => setActiveCategory(category)}
                        >
                          {category}
                        </Tabs.Tab>
                      ))}
                    </Tabs.List>
                  </Tabs>
                  
                  <ScrollArea h={400} mt="md">
                    {predictions.length === 0 ? (
                      <Text c="dimmed" align="center" mt="xl">
                        No predictions yet. Add keywords to monitor or run a prediction.
                      </Text>
                    ) : (
                      <Stack spacing="xs">
                        {predictions.map((prediction) => (
                          <Card 
                            key={`${prediction.keyword}-${prediction.detected_at}`}
                            shadow="xs"
                            p="sm"
                            withBorder
                            style={{
                              cursor: 'pointer',
                              borderLeft: `4px solid ${getProbabilityColor(prediction.probability)}`,
                              backgroundColor: selectedPrediction?.keyword === prediction.keyword ? '#f8f9fa' : undefined
                            }}
                            onClick={() => setSelectedPrediction(prediction)}
                          >
                            <Group justify="space-between">
                              <Text weight={500}>{prediction.keyword}</Text>
                              <Badge 
                                color={getProbabilityColor(prediction.probability)}
                                variant="filled"
                              >
                                {(prediction.probability * 100).toFixed(1)}%
                              </Badge>
                            </Group>
                            
                            {prediction.predicted_spike_date && (
                              <Group position="left" spacing="xs" mt="xs">
                                <Calendar size={14} />
                                <Text size="xs">Predicted: {new Date(prediction.predicted_spike_date).toLocaleDateString()}</Text>
                              </Group>
                            )}
                            
                            {prediction.detected_at && (
                              <Text size="xs" c="dimmed" mt="xs">
                                Detected: {new Date(prediction.detected_at).toLocaleDateString()}
                              </Text>
                            )}
                            
                            {prediction.region && (
                              <Badge mt="xs" size="sm" variant="outline">
                                {prediction.region}
                              </Badge>
                            )}
                          </Card>
                        ))}
                      </Stack>
                    )}
                  </ScrollArea>
                </Card>
              </Grid.Col>
              
              {/* Right panel - Prediction details */}
              <Grid.Col span={8}>
                {selectedPrediction ? (
                  <Card shadow="xs" p="md" withBorder>
                    <Group position="apart" mb="md">
                      <Text weight={700} size="lg">{selectedPrediction.keyword}</Text>
                      <Badge 
                        color={getProbabilityColor(selectedPrediction.probability)}
                        size="lg"
                        variant="filled"
                      >
                        Spike Probability: {(selectedPrediction.probability * 100).toFixed(1)}%
                      </Badge>
                    </Group>
                    
                    {selectedPrediction.predicted_spike_date && (
                      <Alert icon={<Calendar size={16} />} color="blue" mb="md">
                        <Text weight={500}>
                          Potential spike predicted around {new Date(selectedPrediction.predicted_spike_date).toLocaleDateString()}
                        </Text>
                      </Alert>
                    )}
                    
                    {/* Forecast chart */}
                    <Card shadow="xs" p="md" mb="md" withBorder>
                      <Text weight={500} mb="sm">Trend Forecast</Text>
                      <div style={{ height: 250 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={selectedPrediction.forecast}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke="#8884d8"
                              name="Forecast"
                              strokeWidth={2}
                            />
                            <Line
                              type="monotone"
                              dataKey="upper"
                              stroke="#82ca9d"
                              strokeDasharray="3 3"
                              name="Upper Bound"
                            />
                            <Line
                              type="monotone"
                              dataKey="lower"
                              stroke="#ff8042"
                              strokeDasharray="3 3"
                              name="Lower Bound"
                            />
                            {selectedPrediction.predicted_spike_date && (
                              <ReferenceLine 
                                x={selectedPrediction.predicted_spike_date} 
                                stroke="red"
                                strokeDasharray="3 3"
                                label="Potential Spike"
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                    
                    {/* Signal breakdown */}
                    {selectedPrediction.signals && (
                      <Card shadow="xs" p="md" withBorder>
                        <Text weight={500} mb="sm">Signal Breakdown</Text>
                        <Table>
                          <thead>
                            <tr>
                              <th>Signal Type</th>
                              <th>Strength</th>
                              <th>Contribution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(selectedPrediction.signals).map(([key, signal]) => (
                              <tr key={key}>
                                <td>
                                  <Text weight={500}>
                                    {key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                  </Text>
                                </td>
                                <td>
                                  <Progress 
                                    value={signal.value * 100} 
                                    color={signal.value > 0.7 ? 'red' : signal.value > 0.3 ? 'orange' : 'blue'}
                                  />
                                </td>
                                <td>{((signal.value * signal.weight) * 100).toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                        
                        {/* Leading indicators details */}
                        {selectedPrediction.signals.leading_indicators.details && 
                         selectedPrediction.signals.leading_indicators.details.length > 0 && (
                          <>
                            <Divider my="md" />
                            <Text weight={500} mb="sm">Leading Indicators</Text>
                            <Table size="sm">
                              <thead>
                                <tr>
                                  <th>Related Term</th>
                                  <th>Lead Time</th>
                                  <th>Trend</th>
                                  <th>Strength</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedPrediction.signals.leading_indicators.details.map((indicator, idx) => (
                                  <tr key={idx}>
                                    <td>{indicator.term}</td>
                                    <td>{indicator.lead_time} days</td>
                                    <td>{indicator.trend > 0 ? '↗️ Rising' : '↘️ Falling'}</td>
                                    <td>{(indicator.signal_strength * 100).toFixed(1)}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </>
                        )}
                      </Card>
                    )}
                  </Card>
                ) : (
                  <Card shadow="xs" p="md" withBorder style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Stack align="center" spacing="md">
                      <Info size={48} color="#adb5bd" />
                      <Text c="dimmed" align="center">
                        Select a prediction to view details or add keywords to monitor
                      </Text>
                    </Stack>
                  </Card>
                )}
              </Grid.Col>
            </Grid>
            
            {predictionError && (
              <Alert icon={<AlertTriangle size={16} />} title="Error" color="red" mt="md">
                {predictionError}
              </Alert>
            )}
          </Tabs.Panel>

          {/* Settings Tab */}
          <Tabs.Panel value="settings" pt="md">
            <Grid>
              <Grid.Col span={6}>
                <Card shadow="xs" p="md" withBorder>
                  <Text weight={500} mb="lg">Monitoring Settings</Text>
                  
                  <Stack spacing="md">
                    <Group justify="space-between">
                      <Text>Monitoring Status</Text>
                      <Switch 
                        checked={isMonitoring}
                        onChange={isMonitoring ? stopMonitoring : startMonitoring}
                        label={isMonitoring ? "Active" : "Paused"}
                      />
                    </Group>
                    
                    <NumberInput
                      label="Spike Probability Threshold"
                      value={threshold}
                      onChange={(val) => setThreshold(val || 0.7)}
                      precision={2}
                      min={0.1}
                      max={0.9}
                      step={0.05}
                      description="Minimum probability to trigger an alert (0.1-0.9)"
                    />
                    
                    <NumberInput
                      label="Monitoring Interval (minutes)"
                      value={intervalValue}
                      onChange={(val) => debugSetInterval(val || 60, 'numberInput')}
                      min={15}
                      max={1440}
                      step={15}
                      description="How often to check for trend spikes (15-1440 min)"
                    />
                    
                    <Group mt="md">
                      <Button 
                        leftIcon={isMonitoring ? <Pause size={16} /> : <Play size={16} />}
                        onClick={isMonitoring ? stopMonitoring : startMonitoring}
                        color={isMonitoring ? "orange" : "green"}
                      >
                        {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
                      </Button>
                      
                      <Button
                        leftIcon={<RefreshCw size={16} />}
                        variant="outline"
                        onClick={fetchPredictions}
                      >
                        Refresh Predictions
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              </Grid.Col>
              
              <Grid.Col span={6}>
                <Card shadow="xs" p="md" withBorder>
                  <Text weight={500} mb="lg">Monitored Keywords</Text>
                  
                  <Group mb="md">
                    <TextInput
                      placeholder="Category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <TextInput
                      placeholder="Keyword"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button 
                      leftIcon={<Plus size={16} />}
                      onClick={addKeyword}
                      disabled={!newCategory.trim() || !newKeyword.trim()}
                    >
                      Add
                    </Button>
                  </Group>
                  
                  <ScrollArea h={300}>
                    {Object.keys(monitoredKeywords).length === 0 ? (
                      <Text c="dimmed" align="center" py="md">
                        No keywords added yet. Add keywords to monitor for trend spikes.
                      </Text>
                    ) : (
                      <>
                        {Object.entries(monitoredKeywords).map(([category, keywords]) => (
                          <div key={category} className="mb-4">
                            <Text weight={500} size="sm" color="blue" mb="xs">{category}</Text>
                            <Table striped highlightOnHover>
                              <tbody>
                                {keywords.map((keyword) => (
                                  <tr key={`${category}-${keyword}`}>
                                    <td>{keyword}</td>
                                    <td style={{ width: 50, textAlign: 'right' }}>
                                      <ActionIcon 
                                        color="red" 
                                        size="sm"
                                        onClick={() => removeKeyword(category, keyword)}
                                      >
                                        <Trash size={16} />
                                      </ActionIcon>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        ))}
                      </>
                    )}
                  </ScrollArea>
                </Card>
              </Grid.Col>
            </Grid>
          </Tabs.Panel>
        </Tabs>
      </Card>
      
      {/* Debug panel - Only shows when DEBUG_ENABLED is true */}
      {DEBUG_ENABLED && intervalDebug.length > 0 && (
        <Card shadow="xs" p="md" withBorder mt="md">
          <Text weight={500} mb="md">Interval Debug Log</Text>
          <ScrollArea h={200}>
            {intervalDebug.map((log, i) => (
              <Text key={i} size="xs">{log}</Text>
            ))}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
};

export default SignalsPanel;