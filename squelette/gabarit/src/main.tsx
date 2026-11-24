import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { routeur } from './routes';
import { langueCourante } from './lib/langue';
import { ecouterLEdition } from './lib/edition';
import './styles/tokens.css';
import './styles/base.css';

document.documentElement.lang = langueCourante();
const racine = document.getElementById('racine');
if (!racine) throw new Error('#racine absent de index.html');
ecouterLEdition();
createRoot(racine).render(<StrictMode><RouterProvider router={routeur} /></StrictMode>);
