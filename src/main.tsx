import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/app.css';
import './styles/print.css';
import { applyAppearance } from './appearance';
import { App } from './App';
import { PrintPage } from './print/PrintPage';

applyAppearance();

const root = createRoot(document.getElementById('root')!);
const isPrint = window.location.pathname.startsWith('/print');
root.render(<React.StrictMode>{isPrint ? <PrintPage /> : <App />}</React.StrictMode>);
