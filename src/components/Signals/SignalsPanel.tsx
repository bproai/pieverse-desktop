// src/components/Signals/SignalsPanel.tsx
import React, { useState } from 'react';
import { Card, TextInput, Select, Button, Group, Text, Stack, Badge, Alert } from '@mantine/core';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Download, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

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

const SignalsPanel = () => {
  const [keywords, setKeywords] = useState<string>('');
  const [timeRange, setTimeRange] = useState<string>('90d');
  const [region, setRegion] = useState<string>('');
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [relatedQueries, setRelatedQueries] = useState<string[]>([]);

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
      const filePath = await save({
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
      }
    } catch (err) {
      setError(`Failed to export data: ${err}`);
    }
  };

  // Format data for chart display with proper date sorting
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
          <Group position="apart">
            <Group>
              <TrendingUp size={20} />
              <Text weight={500} size="lg">Google Trends Signals</Text>
            </Group>
            <Badge color="blue" variant="light">
              Beta
            </Badge>
          </Group>
        </Card.Section>

        <Stack spacing="md" mt="md">
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
      </Card>
    </div>
  );
};

export default SignalsPanel;