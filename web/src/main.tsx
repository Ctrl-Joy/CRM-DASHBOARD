import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { App } from './App';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ApiError } from '@/lib/api';
import { applyTheme, useUi } from '@/stores/ui';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});
applyTheme(useUi.getState().theme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <App />
          {/* On phones the bottom edge belongs to the tab bar. */}
          <Toaster closeButton position={matchMedia('(max-width: 1023px)').matches ? 'top-center' : 'bottom-right'} />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
