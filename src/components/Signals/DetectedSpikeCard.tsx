// src/components/Signals/DetectedSpikeCard.tsx
import React from 'react';
import { Card, Group, Text, Badge } from '@mantine/core';
import { Calendar } from 'lucide-react';

interface DetectedSpikeCardProps {
  prediction: {
    keyword: string;
    probability: number;
    predicted_spike_date?: string;
    detected_at?: string;
  };
  getProbabilityColor: (p: number) => string;
}

const DetectedSpikeCard: React.FC<DetectedSpikeCardProps> = ({ prediction, getProbabilityColor }) => {
  return (
    <Card shadow="sm" p="md" withBorder mb="md">
      <Group position="apart">
        <Text weight={600}>Spike Detected: {prediction.keyword}</Text>
        <Badge color={getProbabilityColor(prediction.probability)} variant="filled">
          {(prediction.probability * 100).toFixed(1)}%
        </Badge>
      </Group>
      {prediction.predicted_spike_date && (
        <Group spacing="xs" mt="xs">
          <Calendar size={16} />
          <Text size="sm">
            Predicted Spike Date: {new Date(prediction.predicted_spike_date).toLocaleDateString()}
          </Text>
        </Group>
      )}
      {prediction.detected_at && (
        <Text size="sm" color="dimmed" mt="xs">
          Detected At: {new Date(prediction.detected_at).toLocaleDateString()}
        </Text>
      )}
    </Card>
  );
};

export default DetectedSpikeCard;
