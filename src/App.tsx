import React from 'react';
import { useAegisStore } from './store/useAegisStore';
import { Navigation } from './components/Navigation';
import { SetupWizard } from './components/SetupWizard';
import { GuidedWalkthrough } from './components/GuidedWalkthrough';

import { OverviewScreen } from './screens/OverviewScreen';
import { LiveMonitorScreen } from './screens/LiveMonitorScreen';
import { VerificationLabScreen } from './screens/VerificationLabScreen';
import { ProtocolScreen } from './screens/ProtocolScreen';
import { EventLogScreen } from './screens/EventLogScreen';
import { RecordingsStreamScreen } from './screens/RecordingsStreamScreen';
import { ModelDatasetScreen } from './screens/ModelDatasetScreen';
import { ArchitectureScreen } from './screens/ArchitectureScreen';
import { TestCenterScreen } from './screens/TestCenterScreen';

export const App: React.FC = () => {
  const { activeScreen } = useAegisStore();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-900">
      {/* Top Bar Contract (1 row, 3 zones) */}
      <Navigation />

      {/* Main Workspace Stage */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 pt-6">
        {activeScreen === 'overview' && <OverviewScreen />}
        {activeScreen === 'live' && <LiveMonitorScreen />}
        {activeScreen === 'verification' && <VerificationLabScreen />}
        {activeScreen === 'protocol' && <ProtocolScreen />}
        {activeScreen === 'events' && <EventLogScreen />}
        {activeScreen === 'recordings' && <RecordingsStreamScreen />}
        {activeScreen === 'model' && <ModelDatasetScreen />}
        {activeScreen === 'architecture' && <ArchitectureScreen />}
        {activeScreen === 'tests' && <TestCenterScreen />}
      </main>

      {/* Setup Wizard Modal */}
      <SetupWizard />

      {/* Guided Walkthrough Floating Tour Controller & Summary Modal */}
      <GuidedWalkthrough />
    </div>
  );
};

export default App;
