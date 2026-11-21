import { useState } from 'react';
import { InstructorDashboard } from './InstructorDashboard';
import { createApiDashboardAdapter } from './adapters/apiAdapter';
import { createInMemoryDashboardAdapter } from './adapters/placeholderAdapter';

const USE_PLACEHOLDER_DATA =
  import.meta.env.VITE_USE_PLACEHOLDER_DATA === 'true';

export function App(props) {
  const [defaultAdapter] = useState(() =>
    USE_PLACEHOLDER_DATA
      ? createInMemoryDashboardAdapter()
      : createApiDashboardAdapter()
  );

  return (
    <InstructorDashboard
      adapter={defaultAdapter}
      enableDemoControls={USE_PLACEHOLDER_DATA}
      {...props}
    />
  );
}

export default App;
