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

    const handleConnect = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await MySQLService.connect(config);
            setIsConnected(true);
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
        try {
            const queryResults = await MySQLService.executeQuery(query);
            setResults(queryResults);
            if (queryResults.error) {
                setError(queryResults.error);
            }
        } catch (err) {
            const errorMsg = (err as Error).message;
            setError(errorMsg);
            setResults(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            const result = await MySQLService.disconnect();
            if (result.success) {
                setIsConnected(false);
                setResults(null);
                setQuery('');
            } else if (result.error) {
                setError(result.error);
            }
        } catch (err) {
            setError((err as Error).message);
        }
    };

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

                        {error && (
                            <Alert color="red" title="Error">
                                {error}
                            </Alert>
                        )}

                        {results?.affectedRows !== undefined && (
                            <Alert color="blue" title="Query Result">
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