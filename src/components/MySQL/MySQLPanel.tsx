// src/components/MySQL/MySQLPanel.tsx
import { useState } from 'react';
import { Card, TextInput, NumberInput, PasswordInput, Button, Stack, Group, Textarea, Table, Text, Alert } from '@mantine/core';
import { Database, Power, PowerOff, Play } from 'lucide-react';
import { MySQLService } from './MySQLService';
import type { MySQLConfig, MySQLExecuteResult, MySQLResult } from './types';

interface MySQLPanelProps {
    onConnect?: (result: MySQLResult) => void;
}

function MySQLPanel({ onConnect }: MySQLPanelProps) {
    const [config, setConfig] = useState<MySQLConfig>({
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: '',
        database: ''
    });

    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MySQLExecuteResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);

    const handleConnect = async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await MySQLService.connect(config);
            setIsConnected(true);
            setSuccess('Connected successfully');
            onConnect?.(result);
        } catch (err) {
            const errorMsg = (err as Error).message;
            setError(errorMsg);
            setIsConnected(false);
            onConnect?.({ success: false, error: errorMsg });
        } finally {
            setLoading(false);
        }
    };

    const handleExecuteQuery = async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const queryResults = await MySQLService.executeQuery(query);
            console.log('Raw query response:', queryResults);
    
            if (Array.isArray(queryResults)) {
                setResults({ data: queryResults });  // Wrap the array in a data property
                setSuccess(`Query executed successfully. ${queryResults.length} rows returned.`);
            } else if (queryResults && 'affectedRows' in queryResults) {
                setResults(queryResults);
                setSuccess(`Query executed successfully. ${queryResults.affectedRows} rows affected.`);
            } else {
                console.log('Unexpected response format:', queryResults);
                setError('Unexpected response format from query');
            }
        } catch (err) {
            const errorMsg = (err as Error).message;
            console.error('Query execution error:', err);
            setError(errorMsg);
            setResults(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        setError(null);
        setSuccess(null);
        try {
            await MySQLService.disconnect();
            setIsConnected(false);
            setResults(null);
            setQuery('');
            setSuccess('Disconnected successfully');
        } catch (err) {
            setError((err as Error).message);
        }
    };

    // Rest of your component remains exactly the same
    return (
        <Card className="w-full" shadow="sm" padding="lg">
            <Stack>
                <Group grow>
                    <TextInput
                        label="Host"
                        value={config.host}
                        onChange={(e) => setConfig({ ...config, host: e.target.value })}
                        disabled={isConnected}
                        autoComplete="off"
                    />
                    <NumberInput
                        label="Port"
                        value={config.port}
                        onChange={(value) => setConfig({ ...config, port: value || 3306 })}
                        disabled={isConnected}
                        autoComplete="off"
                    />
                </Group>

                <Group grow>
                    <TextInput
                        label="Username"
                        value={config.username}
                        onChange={(e) => setConfig({ ...config, username: e.target.value })}
                        disabled={isConnected}
                        autoComplete="off"
                    />
                    <PasswordInput
                        label="Password"
                        value={config.password}
                        onChange={(e) => setConfig({ ...config, password: e.target.value })}
                        disabled={isConnected}
                        autoComplete="new-password"
                    />
                </Group>

                <TextInput
                    label="Database"
                    value={config.database}
                    onChange={(e) => setConfig({ ...config, database: e.target.value })}
                    disabled={isConnected}
                    autoComplete="off"
                />

                <Group justify="flex-end">
                    {!isConnected ? (
                        <Button
                            onClick={handleConnect}
                            disabled={loading}
                            leftSection={<Power size={16} />}
                            loading={loading}
                        >
                            {loading ? 'Connecting...' : 'Connect'}
                        </Button>
                    ) : (
                        <Button
                            onClick={handleDisconnect}
                            color="red"
                            leftSection={<PowerOff size={16} />}
                        >
                            Disconnect
                        </Button>
                    )}
                </Group>

                {error && (
                    <Alert color="red" title="Error" variant="light">
                        {error}
                    </Alert>
                )}

                {success && (
                    <Alert color="green" title="Success" variant="light">
                        {success}
                    </Alert>
                )}

                {isConnected && (
                    <Stack>
                        <Textarea
                            label="SQL Query"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Enter your SQL query here..."
                            minRows={4}
                            styles={{ input: { fontFamily: 'monospace' } }}
                            autoComplete="off"
                        />

                        <Group justify="flex-end">
                            <Button
                                onClick={handleExecuteQuery}
                                disabled={loading || !query.trim()}
                                loading={loading}
                                color="green"
                                leftSection={<Play size={16} />}
                            >
                                {loading ? 'Executing...' : 'Execute Query'}
                            </Button>
                        </Group>

                        {results?.affectedRows !== undefined && (
                            <Alert color="blue" title="Query Result" variant="light">
                                Affected rows: {results.affectedRows}
                                {results.insertId !== undefined && (
                                    <Text>Insert ID: {results.insertId}</Text>
                                )}
                            </Alert>
                        )}

                        {results?.data && results.data.length > 0 && (
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        {Object.keys(results.data[0]).map((key) => (
                                            <Table.Th key={key}>{key}</Table.Th>
                                        ))}
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {results.data.map((row, i) => (
                                        <Table.Tr key={i}>
                                            {Object.values(row).map((value: any, j) => (
                                                <Table.Td key={j}>
                                                    <Text size="sm">{JSON.stringify(value)}</Text>
                                                </Table.Td>
                                            ))}
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        )}
                    </Stack>
                )}
            </Stack>
        </Card>
    );
}

export default MySQLPanel;