import React, { useEffect, useState } from 'react';
import { CommandCenterLayout } from './layouts/CommandCenterLayout';
import { UnifiedIngestionHub } from './components/UnifiedIngestionHub';
import { PlanConsole } from './components/PlanConsole';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { fetchCorridors } from './store/corridorSlice';

const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<'hub' | 'plan'>('hub');

  useEffect(() => {
    dispatch(fetchCorridors());
  }, [dispatch]);

  return (
    <CommandCenterLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'hub' ? <UnifiedIngestionHub /> : <PlanConsole />}
    </CommandCenterLayout>
  );
};

export default App;
