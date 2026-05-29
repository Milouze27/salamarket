import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('[PWA] SW registered'))
      .catch((err) => console.error('[PWA] SW registration failed:', err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
