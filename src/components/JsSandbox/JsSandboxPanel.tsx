// src/components/JsSandbox/JsSandboxPanel.tsx
import React from 'react';
import JsSandbox from './JsSandbox';

interface JsSandboxPanelProps {
  isDark: boolean;
}

export const JsSandboxPanel: React.FC<JsSandboxPanelProps> = ({ isDark }) => {
  return (
    <div className="js-sandbox-panel">
      <JsSandbox isDark={isDark} />
    </div>
  );
};

export default JsSandboxPanel;