import ReactDOM from 'react-dom/client';
import './styles.css';
import { Root } from './Root';
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><Root/></ErrorBoundary>
);
